import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

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
  hist2d: number[][];
  log_hist2d: number[][];
  bin_edges: number[];
  bin_centers: number[];
  extent: [number, number, number, number];
  q_min: number;
  q_max: number;
  lowfrac: number;
  num_pulses: number;
  warning?: string;
};

type Props = {
  data: SinglePolarisationHistogramPayload | null;
  isDark?: boolean;
};

export default function SinglePolarisationHistogram({ data, isDark }: Props) {
  if (!data) return null;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "dark" : "light";

  const { trace, layout, titleText } = useMemo(() => {
    const z = Array.isArray(data.log_hist2d) && data.log_hist2d.length ? data.log_hist2d : data.hist2d;
    const x = Array.isArray(data.phase_axis) ? data.phase_axis : [];
    const y = Array.isArray(data.bin_centers) ? data.bin_centers : [];
    const hasZ = z && z.length > 0 && z[0]?.length > 0;
    const zFlat = hasZ ? z.flat().filter(v => Number.isFinite(v)) : [];
    const zmin = zFlat.length ? Math.min(...zFlat) : undefined;
    const zmax = zFlat.length ? Math.max(...zFlat) : undefined;

    const traceObj = {
      type: "heatmap" as const,
      x,
      y,
      z,
      colorscale: "Viridis",
      colorbar: { title: { text: "log(count)" } },
      zmin,
      zmax,
      hovertemplate: `${data.quantity}<br>phase %{x:.4f}<br>val %{y:.4f}<br>log count %{z:.2f}<extra></extra>`,
    };

    const title = data.quantity;
    const layoutObj: any = {
      // External header handles title; keep plot title empty to avoid duplication
      xaxis: {
        title: { text: "Phase", standoff: 8 },
        range: x.length ? [Math.min(...x), Math.max(...x)] : [data.start_phase, data.end_phase],
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
        title: { text: data.quantity, standoff: 10 },
        range: y.length ? [Math.min(...y), Math.max(...y)] : [data.q_min, data.q_max],
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
      margin: { l: 70, r: 40, t: 60, b: 60 },
      height: 500,
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: { color: axisColor },
      template,
    };

    return { trace: traceObj, layout: layoutObj, titleText: title };
  }, [data, axisColor, gridColor, paperBg, plotBg, template]);

  return (
    <div className="relative" style={{ width: "100%", padding: "1rem" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground/90">{titleText}</div>
        <FullscreenIconButton onClick={() => setIsFullscreen(true)} title="Open fullscreen" />
      </div>
      <Plot
        data={[trace]}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: "100%", height: "500px" }}
        key={`${themeKey}-${data.quantity_key}-${data.start_phase}-${data.end_phase}`}
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
              data={[trace]}
              layout={{ ...layout, autosize: true, height: undefined }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: "100%", height: "100%" }}
              key={`${themeKey}-${data.quantity_key}-${data.start_phase}-${data.end_phase}-fs`}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
