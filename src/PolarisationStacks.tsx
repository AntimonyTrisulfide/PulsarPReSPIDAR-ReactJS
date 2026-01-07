import { useMemo, useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

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
        title: { text: label, x: 0.5, y: 0.97, xanchor: "center" },
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
        margin: { l: 70, r: 60, t: 60, b: 60 },
        height: 360,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: axisColor },
        template,
      };

      return { trace, layout, key: `${q.name}-${themeKey}` };
    });
  }, [data, axisColor, gridColor, paperBg, plotBg, template, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {data.warning && (
        <div className="lg:col-span-2 text-sm text-yellow-500">{data.warning}</div>
      )}
      {items.map(item => (
        <div key={item.key} className="relative border border-border/50 rounded-lg overflow-hidden">
          <div className="absolute right-3 top-3 z-10 flex gap-2">
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
          </div>
          <Plot
            data={[item.trace]}
            layout={item.layout}
            config={{ responsive: true }}
            style={{ width: "100%", height: "100%" }}
            key={`${item.key}-${data.start_phase}-${data.end_phase}`}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="w-[95vw] max-w-7xl h-[90vh]">
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
          <div className="h-full w-full p-3">
            <Plot
              data={[fullscreenItem.trace]}
              layout={{ ...fullscreenItem.layout, height: undefined, autosize: true }}
              config={{ responsive: true }}
              style={{ width: "100%", height: "100%" }}
              key={`${fullscreenItem.key}-fullscreen-${data.start_phase}-${data.end_phase}`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
