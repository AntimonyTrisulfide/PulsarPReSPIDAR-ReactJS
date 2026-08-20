import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

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
        min: number | null;
        max: number | null;
        mean: number | null;
        std: number | null;
        num_pulses: number;
        finite_values?: number;
        valid_values?: number;
        masked_fraction?: number | null;
        outside_display_range?: number;
        fraction_outside_display_range?: number | null;
      };
    }>;
    warnings?: string[];
    metadata?: Record<string, unknown>;
  }[];
};

type PhaseSliceHistogramsProps = {
  data: PhaseSliceHistogramData | null;
  isDark?: boolean;
  phaseWindow?: { left: number; mid: number; right: number };
  filenamePrefix?: string;
};

const palette = ["#2563eb", "#f97316", "#22c55e", "#e11d48", "#14b8a6", "#a855f7"];

export default function PhaseSliceHistograms({ data, isDark, phaseWindow, filenamePrefix = "observation" }: PhaseSliceHistogramsProps) {
  if (!data) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const items = useMemo(() => {
    return data.quantities.map((quantity, qIndex) => {
      const cols = quantity.phase_slices.length || 1;
      const tracesAcc: any[] = [];
      const annotationsAcc: any[] = [];
      const layoutAcc: any = {
        grid: { rows: 1, columns: cols, pattern: "independent" },
        showlegend: false,
        height: 230,
        margin: { l: 72, r: 36, t: 54, b: 58 },
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: plotFont(axisColor),
        template,
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
          ...plotAxisText(axisColor),
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
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
          ...plotAxisText(axisColor),
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
          fixedrange: false,
          showline: true,
          mirror: "allticks",
          automargin: true,
        };

        const caption = getSliceCaption(quantity, slice);
        if (caption) {
          annotationsAcc.push({
            xref: `${xaxis} domain`,
            yref: "paper",
            x: 0.5,
            y: 1.13,
            xanchor: "center",
            yanchor: "bottom",
            showarrow: false,
            text: caption,
            align: "center",
            font: { color: axisColor, size: 12 },
          });
        }
      });

      layoutAcc.annotations = annotationsAcc;
      return { key: `${quantity.name}-${qIndex}-${themeKey}`, quantity, traces: tracesAcc, layout: lockCartesianInteractions(layoutAcc) };
    });
  }, [data, axisColor, gridColor, paperBg, plotBg, template, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      {items.map(item => (
        <div
          key={item.key}
          className="plot-export-scope histogram-panel relative overflow-hidden py-2"
        >
          <div className="plot-toolbar mb-1">
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
            <PlotExportButtons filename={`${filenamePrefix}-phase-slice-${item.quantity.name}`} />
            <div className="plot-panel-title text-foreground/90">{item.quantity.name}</div>
          </div>
          {phaseWindow && (
            <div className="plot-panel-meta mb-2 text-muted-foreground">
              Left: {phaseWindow.left.toFixed(3)} / Mid: {phaseWindow.mid.toFixed(3)} / Right: {phaseWindow.right.toFixed(3)}
            </div>
          )}
          <Plot
            data={item.traces}
            layout={item.layout}
            config={paperPlotConfig(`phase-slice-${item.quantity.name}`)}
            useResizeHandler
            style={{ width: "100%", height: "230px" }}
            key={`${item.key}-inline`}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="p-4 w-[95vw] max-w-7xl h-[90vh]" title="Phase slice fullscreen">
          <div className="plot-export-scope h-full w-full pt-8">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`${filenamePrefix}-phase-slice-${fullscreenItem.quantity.name}-fullscreen`} />
            </div>
            <Plot
              data={fullscreenItem.traces}
              layout={{ ...fullscreenItem.layout, autosize: true, height: undefined }}
              config={paperPlotConfig(`phase-slice-${fullscreenItem.quantity.name}-fullscreen`)}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              key={`${fullscreenItem.key}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

function getSliceCaption(
  quantity: PhaseSliceHistogramData["quantities"][number],
  slice: PhaseSliceHistogramData["quantities"][number]["phase_slices"][number],
) {
  const sigmaThreshold = Number(quantity.metadata?.sigma_threshold);
  const sigmaText = Number.isFinite(sigmaThreshold) ? sigmaThreshold.toFixed(2) : "3.00";
  const snrLabel = getSnrLabel(quantity.name);
  const finite = Number(slice.stats.finite_values);
  const valid = Number(slice.stats.valid_values);
  if (!Number.isFinite(finite) || finite <= 0 || !Number.isFinite(valid)) return "";
  return `${valid}/${finite} samples pass ${snrLabel} > ${sigmaText}`;
}

function getSnrLabel(quantityName: string) {
  if (quantityName.startsWith("PA")) return "L S/N";
  if (quantityName.startsWith("EA")) return "P S/N";
  return "I S/N";
}
