import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { paperPlotConfig } from "@/shared/plot/plotlyConfig";

export type PolarisationStackPayload = {
  obs_id?: string;
  start_phase: number;
  end_phase: number;
  on_pulse?: { start: number; end: number };
  phase_axis: number[];
  pulse_number: number[];
  quantities: Array<{
    name: string;
    data: number[][];
    vmin?: number;
    vmax?: number;
  }>;
  warning?: string;
};

type Props = {
  data: PolarisationStackPayload | null;
  isDark?: boolean;
};

export default function PolarisationStacks({ data, isDark }: Props) {
  if (!data || !data.quantities?.length) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const items = useMemo(() => {
    const x = Array.isArray(data.phase_axis) ? data.phase_axis : [];
    const y = Array.isArray(data.pulse_number) ? data.pulse_number : [];
    const xRange = x.length ? [Math.min(...x), Math.max(...x)] : [data.start_phase, data.end_phase];

    return data.quantities.map(q => {
      const z = Array.isArray(q.data) ? q.data : [];
      const flat = z.flat().filter(v => Number.isFinite(v));
      const zmin = q.vmin ?? (flat.length ? Math.min(...flat) : undefined);
      const zmax = q.vmax ?? (flat.length ? Math.max(...flat) : undefined);
      const label = q.name;
      const colorscale = zmin !== undefined && zmax !== undefined && zmin < 0 && zmax > 0 ? "BWR" : "Viridis";

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
          tickfont: { color: axisColor },
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
          titlefont: { color: axisColor },
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
          tickfont: { color: axisColor },
          tickcolor: axisColor,
          ticks: "outside",
          ticklen: 4,
          titlefont: { color: axisColor },
          zerolinecolor: gridColor,
          showline: true,
          mirror: "allticks",
          automargin: true,
        },
        margin: { l: 70, r: 60, t: 25, b: 60 },
        height: 360,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: axisColor },
        template,
      };

      return { trace, layout, key: `${q.name}-${themeKey}`, label };
    });
  }, [data, axisColor, gridColor, paperBg, plotBg, template, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {data.warning && (
        <div className="lg:col-span-2 text-sm text-yellow-500">{data.warning}</div>
      )}
      {items.map(item => (
        <div key={item.key} className="plot-export-scope plot-frame">
          <div className="plot-frame-header justify-start">
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
            <PlotExportButtons filename={`polarisation-stack-${item.key}`} />
            <div className="plot-frame-title">{item.label}</div>
          </div>
          <Plot
            data={[item.trace]}
            layout={item.layout}
            config={paperPlotConfig(`polarisation-stack-${item.key}`)}
            useResizeHandler
            style={{ width: "100%", height: "360px" }}
            key={`${item.key}-${data.start_phase}-${data.end_phase}`}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="w-[95vw] max-w-7xl h-[90vh]" title="Polarisation stack fullscreen">
          <div className="plot-export-scope h-full w-full p-3 pt-10">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`polarisation-stack-${fullscreenItem.key}-fullscreen`} />
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
