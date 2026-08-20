import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { MAGMA_COLOR_SCALE } from "@/shared/plot/colorScales";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

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
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
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
      title: undefined,
      grid: { rows, columns: cols, pattern: "independent" },
      showlegend: false,
      height: Math.max(520, rows * 280),
      margin: { l: 70, r: 50, t: 70, b: 60 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: plotFont(axisColor),
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
        colorscale: MAGMA_COLOR_SCALE,
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
        ...plotAxisText(axisColor),
        tickcolor: axisColor,
        ticks: "outside",
        ticklen: 4,
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
        ...plotAxisText(axisColor),
        tickcolor: axisColor,
        ticks: "outside",
        ticklen: 4,
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
    return { traces: tracesAcc, layout: lockCartesianInteractions(layoutAcc), summaries: summariesAcc };
  }, [data, axisColor, gridColor, paperBg, plotBg, template]);

  return (
    <div className="plot-export-scope plot-frame" style={{ width: "100%" }}>
      <div className="plot-frame-header justify-start">
        <FullscreenIconButton onClick={() => setIsFullscreen(true)} title="Open fullscreen" />
        <PlotExportButtons filename="polarisation-histograms" />
        <div className="plot-frame-title">Combined polarisation histograms</div>
      </div>
      {/* Summary removed per request; axis titles now reflect Phase (x) and quantity (y). */}
      <Plot
        data={traces}
        layout={layout}
        config={paperPlotConfig("polarisation-histograms")}
        useResizeHandler
        style={{ width: "100%", height: `${layout.height}px` }}
        key={`${themeKey}-${layout.height}`}
      />

      {isFullscreen && (
        <FullscreenOverlay onClose={() => setIsFullscreen(false)} contentClassName="p-4" title="Polarisation histograms fullscreen">
          <div className="plot-export-scope h-full w-full pt-8">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename="polarisation-histograms-fullscreen" />
            </div>
            <Plot
              data={traces}
              layout={{ ...layout, autosize: true, height: undefined }}
              config={paperPlotConfig("polarisation-histograms-fullscreen")}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              key={`${themeKey}-${layout.height}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
