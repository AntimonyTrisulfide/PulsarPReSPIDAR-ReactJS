import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

type NumericArray = Array<number | null>;

export type SinglePolarisationHistogramPayload = {
  obs_id?: string;
  start_phase: number;
  end_phase: number;
  on_pulse: { start: number; end: number };
  quantity: string;
  quantity_key: string;
  is_fraction: boolean;
  quantity_bins: number;
  phase_axis: number[];
  hist2d: NumericArray[];
  log10_hist2d?: NumericArray[];
  log_hist2d: NumericArray[];
  bin_edges: number[];
  bin_centers: number[];
  extent: [number, number, number, number];
  q_min: number;
  q_max: number;
  lowfrac: number | null;
  num_pulses: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  warning?: string;
};

type Props = {
  data: SinglePolarisationHistogramPayload | null;
  isDark?: boolean;
  filenamePrefix?: string;
};

export default function SinglePolarisationHistogram({ data, isDark, filenamePrefix = "observation" }: Props) {
  if (!data) return null;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "rgba(0, 0, 0, 0)";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const getEdgeAlignedRange = (values: number[], fallback: [number, number]) => {
    if (values.length < 2) return fallback;
    const firstStep = values[1] - values[0];
    const lastStep = values[values.length - 1] - values[values.length - 2];
    return [
      values[0] - firstStep / 2,
      values[values.length - 1] + lastStep / 2,
    ] as [number, number];
  };

  const { trace, layout, titleText } = useMemo(() => {
    const z = Array.isArray(data.log10_hist2d) && data.log10_hist2d.length
      ? data.log10_hist2d
      : data.log_hist2d;
    const x = Array.isArray(data.phase_axis) ? data.phase_axis : [];
    const y = Array.isArray(data.bin_centers) ? data.bin_centers : [];
    const hasZ = z && z.length > 0 && z[0]?.length > 0;
    const zExtent = hasZ ? getFiniteExtent2d(z) : null;
    const zmin = zExtent?.min;
    const zmax = zExtent?.max;

    const traceObj = {
      type: "heatmap" as const,
      x,
      y,
      z,
      colorscale: "Viridis",
      colorbar: { title: { text: "log10(count)" } },
      zmin,
      zmax,
      hovertemplate: `${data.quantity}<br>phase %{x:.4f}<br>val %{y:.4f}<br>log10(count) %{z:.2f}<extra></extra>`,
    };

    const title = data.quantity;
    const layoutObj: any = {
      // External header handles title; keep plot title empty to avoid duplication
      xaxis: {
        title: { text: "Phase", standoff: 8 },
        range: getEdgeAlignedRange(x, [data.start_phase, data.end_phase]),
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
      },
      yaxis: {
        title: { text: data.quantity, standoff: 10 },
        range: y.length ? [Math.min(...y), Math.max(...y)] : [data.q_min, data.q_max],
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
      },
      margin: { l: 58, r: 58, t: 12, b: 54 },
      height: 460,
      paper_bgcolor: paperBg,
      plot_bgcolor: "#000000",
      font: plotFont(axisColor),
      template,
    };

    return { trace: traceObj, layout: lockCartesianInteractions(layoutObj), titleText: title };
  }, [data, axisColor, gridColor, paperBg, template]);

  return (
    <div className="plot-export-scope histogram-panel relative" style={{ width: "100%", padding: 0 }}>
      <div className="plot-toolbar mb-2">
        <FullscreenIconButton onClick={() => setIsFullscreen(true)} title="Open fullscreen" />
        <PlotExportButtons filename={`${filenamePrefix}-polarisation-histogram-${data.quantity_key}`} />
        <div className="plot-panel-title text-foreground/90">{titleText}</div>
      </div>
      <Plot
        data={[trace]}
        layout={layout}
        config={paperPlotConfig(`polarisation-histogram-${data.quantity_key}`)}
        useResizeHandler
        style={{ width: "100%", height: "460px" }}
        key={`${themeKey}-${data.quantity_key}-${data.start_phase}-${data.end_phase}`}
      />

      {isFullscreen && (
        <FullscreenOverlay onClose={() => setIsFullscreen(false)} contentClassName="p-4" title={`${titleText} fullscreen`}>
          <div className="plot-export-scope h-full w-full pt-8">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`${filenamePrefix}-polarisation-histogram-${data.quantity_key}-fullscreen`} />
            </div>
            <Plot
              data={[trace]}
              layout={{ ...layout, autosize: true, height: undefined }}
              config={paperPlotConfig(`polarisation-histogram-${data.quantity_key}-fullscreen`)}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              key={`${themeKey}-${data.quantity_key}-${data.start_phase}-${data.end_phase}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

function getFiniteExtent2d(values: NumericArray[]) {
  let min = Infinity;
  let max = -Infinity;
  let found = false;

  for (const row of values) {
    if (!Array.isArray(row)) continue;
    for (const value of row) {
      if (value === null || value === undefined) continue;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) continue;
      if (numericValue < min) min = numericValue;
      if (numericValue > max) max = numericValue;
      found = true;
    }
  }

  return found ? { min, max } : null;
}
