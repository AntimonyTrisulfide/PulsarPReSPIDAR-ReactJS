import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

export type PhaseSliceHistogramData = {
  obs_id?: string;
  phase_values: number[];
  phase_bins: number[];
  quantities: {
    name: string;
    phase_slices: Array<{
      phase_value: number;
      phase_bin_index: number;
      bin_edges: number[];
      counts: number[];
      x_limits?: [number, number] | null;
      stats: {
        min: number;
        max: number;
        mean: number;
        std: number;
        num_pulses: number;
      };
    }>;
  }[];
};

type PhaseSliceHistogramsProps = {
  data: PhaseSliceHistogramData | null;
  isDark?: boolean;
  phaseWindow?: { left: number; mid: number; right: number };
};

const palette = ["#2563eb", "#f97316", "#22c55e", "#e11d48", "#14b8a6", "#a855f7"];

export default function PhaseSliceHistograms({ data, isDark, phaseWindow }: PhaseSliceHistogramsProps) {
  if (!data) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const items = useMemo(() => {
    return data.quantities.map((quantity, qIndex) => {
      const cols = quantity.phase_slices.length || 1;
      const tracesAcc: any[] = [];
      const layoutAcc: any = {
        grid: { rows: 1, columns: cols, pattern: "independent" },
        showlegend: false,
        height: 260,
        margin: { l: 80, r: 50, t: 50, b: 70 },
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: axisColor },
        template,
            title: {
              text: quantity.name,
              x: 0.01,
              xanchor: "left",
            },
      };

      quantity.phase_slices.forEach((slice, col) => {
        const index = col + 1;
        const xaxis = col === 0 ? "x" : `x${index}`;
        const yaxis = col === 0 ? "y" : `y${index}`;
        const xaxisKey = col === 0 ? "xaxis" : `xaxis${index}`;
        const yaxisKey = col === 0 ? "yaxis" : `yaxis${index}`;

        const edges = slice.bin_edges;
        const centers = edges.slice(0, -1).map((v, i) => (v + edges[i + 1]) / 2);
        const widths = edges.slice(0, -1).map((v, i) => Math.abs(edges[i + 1] - v));
        const xRange = slice.x_limits ?? undefined;

        tracesAcc.push({
          type: "bar",
          x: centers,
          y: slice.counts,
          width: widths,
          marker: {
            color: palette[qIndex % palette.length],
            line: { color: axisColor, width: 0.25 },
          },
          opacity: 0.9,
                name: `${quantity.name}`,
          xaxis,
          yaxis,
                hovertemplate: `Value %{x:.4f}<br>Count %{y}<extra>${quantity.name}</extra>`,
          showlegend: false,
        });

        layoutAcc[xaxisKey] = {
          title: { text: "Value", standoff: 8 },
          range: xRange ?? undefined,
          zeroline: false,
          gridcolor: gridColor,
          linecolor: axisColor,
          tickfont: { color: axisColor },
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
          titlefont: { color: axisColor },
          fixedrange: false,
          showline: true,
          mirror: "allticks",
          automargin: true,
        };
        layoutAcc[yaxisKey] = {
          title: { text: "Count", standoff: 10 },
          rangemode: "tozero",
          gridcolor: gridColor,
          linecolor: axisColor,
          tickfont: { color: axisColor },
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
          titlefont: { color: axisColor },
          fixedrange: false,
          showline: true,
          mirror: "allticks",
          automargin: true,
        };

      });

      return { key: `${quantity.name}-${qIndex}-${themeKey}`, quantity, traces: tracesAcc, layout: layoutAcc };
    });
  }, [data, axisColor, gridColor, paperBg, plotBg, template, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      {items.map(item => (
        <div
          key={item.key}
          className="relative border border-border/50 rounded-lg overflow-hidden p-3"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground/90">{item.quantity.name}</div>
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
          </div>
          {phaseWindow && (
            <div className="mb-2 text-xs text-muted-foreground">
              Left: {phaseWindow.left.toFixed(3)} • Mid: {phaseWindow.mid.toFixed(3)} • Right: {phaseWindow.right.toFixed(3)}
            </div>
          )}
          <Plot
            data={item.traces}
            layout={item.layout}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: "100%", height: "260px" }}
            key={`${item.key}-inline`}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="p-4 w-[95vw] max-w-7xl h-[90vh]">
          <div className="absolute right-3 top-3 z-20">
            <button
              type="button"
              aria-label="Close fullscreen"
              onClick={() => setFullscreenKey(null)}
              className="h-8 w-8 rounded-md bg-black/60 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-black/40"
            >
              ×
            </button>
          </div>
          <div className="h-full w-full">
            <Plot
              data={fullscreenItem.traces}
              layout={{ ...fullscreenItem.layout, autosize: true, height: undefined }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: "100%", height: "100%" }}
              key={`${fullscreenItem.key}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
