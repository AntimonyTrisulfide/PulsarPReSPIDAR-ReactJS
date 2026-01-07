
import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

type Profile = { x: number[]; y: number[] };
type HeatmapData = {
  pulse_phase: number[];
  pulse_number: number[];
  heatmap_data: number[][];
  vmin: number;
  vmax: number;
  label: string;
  obs_id: string;
};

interface WaterfallProfilesProps {
  data: { [key: string]: Profile } | null;
  heatmaps?: { [key: string]: HeatmapData } | null;
  startPhase?: number;
  endPhase?: number;
  isDark?: boolean;
}

export default function WaterfallProfiles({ data, heatmaps, startPhase = 0, endPhase = 1, isDark }: WaterfallProfilesProps) {
  if (!data) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);

  const xStart = Math.min(startPhase, endPhase);
  const xEnd = Math.max(startPhase, endPhase);

  const stokes = [
    { key: "I", color: "#1f77b4" },
    { key: "Q", color: "#ff7f0e" },
    { key: "U", color: "#2ca02c" },
    { key: "V", color: "#d62728" },
  ];

  const themeIsDark = !!isDark;
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#111827" : "#ffffff";
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const themeKey = themeIsDark ? "d" : "l";

  const items = useMemo(() => {
    return stokes.map((s, idx) => {
      const traces: any[] = [];
      const heatmap = heatmaps && heatmaps[s.key];
      const profile = data && data[s.key];

      if (heatmap) {
        traces.push({
          x: heatmap.pulse_phase,
          y: heatmap.pulse_number,
          z: heatmap.heatmap_data,
          type: "heatmap",
          colorscale: "Viridis",
          zmin: heatmap.vmin,
          zmax: heatmap.vmax,
          showscale: false,
          name: `${s.key} heatmap`,
          xaxis: "x",
          yaxis: "y",
          hovertemplate: `Phase %{x:.4f}<br>Pulse %{y}<br>Value %{z:.3f}<extra>${s.key} heatmap</extra>`,
        });
      }

      if (profile) {
        traces.push({
          x: profile.x,
          y: profile.y,
          type: "scatter",
          mode: "lines",
          name: `${s.key} profile`,
          line: { color: s.color },
          xaxis: "x2",
          yaxis: "y2",
          hovertemplate: `Phase %{x:.4f}<br>Value %{y:.3f}<extra>${s.key} profile</extra>`,
        });
      }

      const layout: any = {
        grid: { rows: 2, columns: 1, pattern: "independent", roworder: "top to bottom" },
        showlegend: false,
        height: 580,
        margin: { l: 50, r: 30, t: 75, b: 65 },
        autosize: true,
        paper_bgcolor: paperBg,
        plot_bgcolor: plotBg,
        font: { color: axisColor },
        template,
        xaxis: {
          title: { text: "Phase", standoff: 8 },
          range: [xStart, xEnd],
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
          title: { text: "Pulse Number", standoff: 10 },
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
          domain: [0.65, 1],
        },
        xaxis2: {
          title: { text: "Phase", standoff: 8 },
          range: [xStart, xEnd],
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
        yaxis2: {
          title: { text: "Intensity", standoff: 10 },
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
          domain: [0, 0.33],
        },
        annotations: [
          {
            text: "Heatmap",
            xref: "paper",
            yref: "paper",
            x: 0.5,
            y: 1.06,
            showarrow: false,
            xanchor: "center",
            yanchor: "top",
            font: { color: axisColor, size: 13 },
          },
          {
            text: "Profile",
            xref: "paper",
            yref: "paper",
            x: 0.5,
            y: 0.44,
            showarrow: false,
            xanchor: "center",
            yanchor: "top",
            font: { color: axisColor, size: 13 },
          },
        ],
      };

      return { key: `${s.key}-${idx}-${themeKey}`, stoke: s.key, traces, layout };
    });
  }, [stokes, heatmaps, data, axisColor, gridColor, paperBg, plotBg, template, xStart, xEnd, themeKey]);

  const fullscreenItem = fullscreenKey ? items.find(i => i.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {items.map(item => (
        <div key={item.key} className="relative border border-border/50 rounded-lg overflow-hidden p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
			<div className="text-sm font-semibold text-foreground/90">Stokes {item.stoke}</div>
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
          </div>
          <Plot
            data={item.traces}
            layout={item.layout}
            config={{ responsive: true, displayModeBar: false }}
            useResizeHandler
            style={{ width: "100%", height: "580px", minWidth: 0 }}
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