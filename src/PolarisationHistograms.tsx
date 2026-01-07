import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

export type PolarisationHistogramPayload = {
  obs_id?: string;
  start_phase?: number;
  end_phase?: number;
  quantities: Array<{
    name: string;
    x_edges: number[];
    y_edges: number[];
    counts: number[][];
    x_label?: string;
    y_label?: string;
    stats?: {
      min?: number;
      max?: number;
      mean?: number;
      std?: number;
      num_pulses?: number;
    };
  }>;
};

type Props = {
  data: PolarisationHistogramPayload | null;
  isDark?: boolean;
};

function centersFromEdges(edges: number[]) {
  if (!edges || edges.length < 2) return [] as number[];
  const centers: number[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    centers.push((edges[i] + edges[i + 1]) / 2);
  }
  return centers;
}

export default function PolarisationHistograms({ data, isDark }: Props) {
  if (!data || !data.quantities?.length) return null;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const { traces, layout } = useMemo(() => {
    const rows = data.quantities.length;
    const cols = 1;
    const tracesAcc: any[] = [];
    const annotations: any[] = [];
    const summariesAcc: Array<{
      name: string;
      totalCount: number;
      maxCount: number;
      minCount: number;
      xBins: number;
      yBins: number;
      xRange: [number, number];
      yRange: [number, number];
    }> = [];
    const layoutAcc: any = {
      title: data.obs_id ? `Polarisation histograms (${data.obs_id})` : "Polarisation histograms",
      grid: { rows, columns: cols, pattern: "independent" },
      showlegend: false,
      height: Math.max(520, rows * 280),
      margin: { l: 70, r: 50, t: 70, b: 60 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: { color: axisColor },
      template,
    };

    data.quantities.forEach((quantity, row) => {
      const xEdges = Array.isArray(quantity.x_edges) ? quantity.x_edges : [];
      const yEdges = Array.isArray(quantity.y_edges) ? quantity.y_edges : [];
      const xCenters = centersFromEdges(xEdges);
      const yCenters = centersFromEdges(yEdges);
      const safeCounts = Array.isArray(quantity.counts)
        ? quantity.counts.map(r => (Array.isArray(r) ? r.map(v => (Number.isFinite(v) ? v : 0)) : []))
        : [];
      const flatCounts = safeCounts.flat();
      const hasData = flatCounts.some(v => v !== 0);
      const zmin = flatCounts.length ? Math.min(...flatCounts) : undefined;
      const zmax = flatCounts.length ? Math.max(...flatCounts) : undefined;
      const xMin = xEdges.length ? Math.min(...xEdges) : 0;
      const xMax = xEdges.length ? Math.max(...xEdges) : 1;
      const yMin = yEdges.length ? Math.min(...yEdges) : 0;
      const yMax = yEdges.length ? Math.max(...yEdges) : 1;
      const isPhaseAxis = xMin >= 0 && xMax <= 1.0001;
      const xRange = isPhaseAxis ? [0, 1] : [xMin, xMax];
      const xaxis = row === 0 ? "x" : `x${row + 1}`;
      const yaxis = row === 0 ? "y" : `y${row + 1}`;
      const xaxisKey = row === 0 ? "xaxis" : `xaxis${row + 1}`;
      const yaxisKey = row === 0 ? "yaxis" : `yaxis${row + 1}`;

      tracesAcc.push({
        type: "heatmap",
        x: xCenters,
        y: yCenters,
        z: safeCounts,
        colorscale: "Log",
        colorbar: row === 0 ? { title: "Count" } : undefined,
        zmin,
        zmax,
        xaxis,
        yaxis,
        hovertemplate: `${quantity.name}<br>x %{x:.4f}<br>y %{y:.4f}<br>count %{z}<extra></extra>`,
      });

      layoutAcc[xaxisKey] = {
        title: { text: "Phase", standoff: 8 },
        range: xRange,
        gridcolor: gridColor,
        linecolor: axisColor,
        tickfont: { color: axisColor },
        tickcolor: axisColor,
        ticks: "outside",
        ticklen: 4,
        titlefont: { color: axisColor },
        zerolinecolor: gridColor,
        showline: true,
        mirror: "allticks",
        automargin: true,
      };
      layoutAcc[yaxisKey] = {
        title: { text: quantity.name || quantity.y_label || "Quantity", standoff: 10 },
        range: [yMin, yMax],
        gridcolor: gridColor,
        linecolor: axisColor,
        tickfont: { color: axisColor },
        tickcolor: axisColor,
        ticks: "outside",
        ticklen: 4,
        titlefont: { color: axisColor },
        zerolinecolor: gridColor,
        showline: true,
        mirror: "allticks",
        automargin: true,
      };

      if (!hasData) {
        annotations.push({
          xref: xaxis,
          yref: yaxis,
          x: (xRange[0] + xRange[1]) / 2,
          y: (yMin + yMax) / 2,
          text: "No data",
          showarrow: false,
          font: { color: axisColor },
        });
      }

      summariesAcc.push({
        name: quantity.name,
        totalCount: 0,
        maxCount: 0,
        minCount: 0,
        xBins: Math.max(0, xCenters.length),
        yBins: Math.max(0, yCenters.length),
        xRange: [xRange[0], xRange[1]],
        yRange: [yMin, yMax],
      });
    });

    layoutAcc.annotations = annotations;
    return { traces: tracesAcc, layout: layoutAcc, summaries: summariesAcc };
  }, [data, axisColor, gridColor, paperBg, plotBg, template]);

  return (
    <div className="relative" style={{ width: "100%", height: `${layout.height}px`, padding: "1rem" }}>
      <div className="absolute right-4 bottom-4 z-10">
        <FullscreenIconButton onClick={() => setIsFullscreen(true)} title="Open fullscreen" />
      </div>
      {/* Summary removed per request; axis titles now reflect Phase (x) and quantity (y). */}
      <Plot
        data={traces}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: "100%", height: "100%" }}
        key={`${themeKey}-${layout.height}`}
      />

      {isFullscreen && (
        <FullscreenOverlay onClose={() => setIsFullscreen(false)} contentClassName="p-4">
          <div className="absolute right-3 top-3 z-20">
            <button
              type="button"
              aria-label="Close fullscreen"
              onClick={() => setIsFullscreen(false)}
              className="h-8 w-8 rounded-md bg-black/60 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-black/40"
            >
              ×
            </button>
          </div>
          <div className="h-full w-full">
            <Plot
              data={traces}
              layout={{ ...layout, autosize: true, height: undefined }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: "100%", height: "100%" }}
              key={`${themeKey}-${layout.height}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
