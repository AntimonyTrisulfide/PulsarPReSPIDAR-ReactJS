import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { MAGMA_COLOR_SCALE } from "@/shared/plot/colorScales";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

export type PolarisationStackPayload = {
  obs_id?: string;
  start_phase: number;
  end_phase: number;
  on_pulse?: { start: number; end: number };
  phase_axis: number[];
  pulse_number: number[];
  quantities: Array<{
    key?: string;
    name: string;
    data: Array<Array<number | null>>;
    vmin?: number;
    vmax?: number;
  }>;
  warning?: string;
};

type Props = {
  data: PolarisationStackPayload | null;
  isDark?: boolean;
  filenamePrefix?: string;
};

export default function PolarisationStacks({ data, isDark, filenamePrefix = "observation" }: Props) {
  if (!data || !data.quantities?.length) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";
  const signedStokesColorscale: Array<[number, string]> = [
    [0, "#2166ac"],
    [0.5, "#f7f7f7"],
    [1, "#b2182b"],
  ];

  const getEdgeAlignedRange = (values: number[], fallback: [number, number]) => {
    if (values.length < 2) return fallback;
    const firstStep = values[1] - values[0];
    const lastStep = values[values.length - 1] - values[values.length - 2];
    return [
      values[0] - firstStep / 2,
      values[values.length - 1] + lastStep / 2,
    ] as [number, number];
  };

  const items = useMemo(() => {
    const x = Array.isArray(data.phase_axis) ? data.phase_axis : [];
    const y = Array.isArray(data.pulse_number) ? data.pulse_number : [];
    const xRange = getEdgeAlignedRange(x, [data.start_phase, data.end_phase]);

    return data.quantities.map(q => {
      const z = Array.isArray(q.data) ? q.data : [];
      const hasBackendMin = typeof q.vmin === "number" && Number.isFinite(q.vmin);
      const hasBackendMax = typeof q.vmax === "number" && Number.isFinite(q.vmax);
      const zExtent = hasBackendMin && hasBackendMax ? null : getFiniteExtent2d(z);
      let zmin = hasBackendMin ? q.vmin : zExtent?.min;
      let zmax = hasBackendMax ? q.vmax : zExtent?.max;
      const label = q.name;
      const quantityKey = q.key ?? label;
      const signedColorQuantities = new Set(["PA", "EA", "PA [deg]", "EA [deg]", "V/I", "Q", "U", "V"]);
      if (signedColorQuantities.has(quantityKey) && zmin !== undefined && zmax !== undefined) {
        const zAbs = Math.max(Math.abs(zmin), Math.abs(zmax));
        zmin = -zAbs;
        zmax = zAbs;
      }
      const magmaStackQuantities = new Set(["P/I", "L/I", "|V/I|", "I"]);
      const colorscale = magmaStackQuantities.has(label)
        ? MAGMA_COLOR_SCALE
        : signedColorQuantities.has(quantityKey)
          ? signedStokesColorscale
        : zmin !== undefined && zmax !== undefined && zmin < 0 && zmax > 0
          ? "HSV"
          : "Cividis";

      const trace = {
        type: "heatmap" as const,
        x,
        y,
        z,
        colorscale,
        zmin,
        zmax,
        colorbar: { title: { text: label } },
        hovertemplate: `${label}<br>phase %{x:.4f}<br>pulse %{y}<br>value %{z:.3f}<extra></extra>`,
      };

      const layout: any = {
        title: undefined,
        xaxis: {
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
        },
        yaxis: {
          title: { text: "Pulse number", standoff: 10 },
          range: y.length ? [Math.min(...y), Math.max(...y)] : undefined,
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
        height: 420,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: plotFont(axisColor),
        template,
      };

      return { trace, layout: lockCartesianInteractions(layout), key: `${q.name}-${themeKey}`, label };
    });
  }, [data, axisColor, gridColor, paperBg, plotBg, template, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-2">
      {data.warning && (
        <div className="lg:col-span-2 text-sm text-yellow-500">{data.warning}</div>
      )}
      {items.map(item => (
        <div key={item.key} className="plot-export-scope min-w-0">
          <div className="plot-toolbar mb-2">
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
            <PlotExportButtons filename={`${filenamePrefix}-polarisation-stack-${item.key}`} />
            <div className="plot-panel-title text-foreground">{item.label}</div>
          </div>
          <Plot
            data={[item.trace]}
            layout={item.layout}
            config={paperPlotConfig(`polarisation-stack-${item.key}`)}
            useResizeHandler
            style={{ width: "100%", height: "420px" }}
            key={`${item.key}-${data.start_phase}-${data.end_phase}`}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="w-[95vw] max-w-7xl h-[90vh]" title="Polarisation stack fullscreen">
          <div className="plot-export-scope h-full w-full p-3 pt-10">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`${filenamePrefix}-polarisation-stack-${fullscreenItem.key}-fullscreen`} />
            </div>
            <Plot
              data={[fullscreenItem.trace]}
              layout={{ ...fullscreenItem.layout, height: undefined, autosize: true }}
              config={paperPlotConfig(`polarisation-stack-${fullscreenItem.key}-fullscreen`)}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              key={`${fullscreenItem.key}-fullscreen-${data.start_phase}-${data.end_phase}`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

function getFiniteExtent2d(values: Array<Array<number | null>>) {
  let min = Infinity;
  let max = -Infinity;
  let found = false;

  for (const row of values) {
    if (!Array.isArray(row)) continue;
    for (const value of row) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      if (numeric < min) min = numeric;
      if (numeric > max) max = numeric;
      found = true;
    }
  }

  return found ? { min, max } : null;
}
