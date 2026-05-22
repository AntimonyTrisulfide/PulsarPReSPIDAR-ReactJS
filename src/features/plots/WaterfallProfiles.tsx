import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

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

type StokesItem = {
  key: string;
  color: string;
  profile: Profile | null;
  heatmap: HeatmapData | null;
};

const STOKES = [
  { key: "I", color: "#1f77b4" },
  { key: "Q", color: "#ff7f0e" },
  { key: "U", color: "#2ca02c" },
  { key: "V", color: "#d62728" },
];

function getEdgeAlignedRange(values: number[], fallback: [number, number]) {
  if (values.length < 2) return fallback;
  const firstStep = values[1] - values[0];
  const lastStep = values[values.length - 1] - values[values.length - 2];
  return [
    values[0] - firstStep / 2,
    values[values.length - 1] + lastStep / 2,
  ] as [number, number];
}

function buildAxisTheme(axisColor: string, gridColor: string) {
  return {
    gridcolor: gridColor,
    linecolor: axisColor,
    ...plotAxisText(axisColor),
    tickcolor: axisColor,
    ticks: "outside" as const,
    ticklen: 4,
    zerolinecolor: gridColor,
    showline: true,
    mirror: "allticks" as const,
    automargin: true,
  };
}

export default function WaterfallProfiles({ data, heatmaps, startPhase = 0, endPhase = 1, isDark }: WaterfallProfilesProps) {
  if (!data) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);
  const xStart = Math.min(startPhase, endPhase);
  const xEnd = Math.max(startPhase, endPhase);

  const themeIsDark = !!isDark;
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
  const axisColor = themeIsDark ? "#f8fbff" : "#111827";
  const gridColor = themeIsDark ? "#243246" : "#d8e0ea";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const axisTheme = buildAxisTheme(axisColor, gridColor);

  const items = useMemo<StokesItem[]>(
    () =>
      STOKES.map(item => ({
        key: item.key,
        color: item.color,
        profile: data[item.key] ?? null,
        heatmap: heatmaps?.[item.key] ?? null,
      })),
    [data, heatmaps],
  );

  const heatmapXRange = useMemo(() => {
    const sample = items.find(item => item.heatmap?.pulse_phase?.length)?.heatmap?.pulse_phase ?? [];
    return getEdgeAlignedRange(sample, [xStart, xEnd]);
  }, [items, xStart, xEnd]);

  const heatmapLayout = () =>
    lockCartesianInteractions({
      showlegend: false,
      autosize: true,
      margin: { l: 56, r: 12, t: 8, b: 54 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: plotFont(axisColor),
      template,
      xaxis: {
        title: { text: "Phase", standoff: 8 },
        range: heatmapXRange,
        ...axisTheme,
      },
      yaxis: {
        title: { text: "Pulse Number", standoff: 8 },
        ...axisTheme,
      },
    }) as any;

  const profileLayout = () =>
    lockCartesianInteractions({
      showlegend: false,
      autosize: true,
      margin: { l: 56, r: 12, t: 8, b: 54 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: plotFont(axisColor),
      template,
      xaxis: {
        title: { text: "Phase", standoff: 8 },
        range: [xStart, xEnd],
        ...axisTheme,
      },
      yaxis: {
        title: { text: "Intensity", standoff: 8 },
        ...axisTheme,
      },
    }) as any;

  const fullscreenItem = fullscreenKey ? items.find(item => item.key === fullscreenKey) ?? null : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
        {items.map(item => (
          <div key={item.key} className="plot-export-scope min-w-0">
            <div className="plot-toolbar mb-2">
              <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
              <PlotExportButtons filename={`stokes-${item.key}-heatmap`} />
              <div className="plot-panel-title text-foreground/90">Stokes {item.key}</div>
            </div>

            <div className="space-y-5">
              <div className="aspect-square w-full">
                <div className="plot-subplot-title mb-2 text-center text-foreground">Heatmap</div>
                <Plot
                  data={
                    item.heatmap
                      ? [
                          {
                            x: item.heatmap.pulse_phase,
                            y: item.heatmap.pulse_number,
                            z: item.heatmap.heatmap_data,
                            type: "heatmap" as const,
                            colorscale: "Viridis",
                            zmin: item.heatmap.vmin,
                            zmax: item.heatmap.vmax,
                            showscale: false,
                            hovertemplate: `Phase %{x:.4f}<br>Pulse %{y}<br>Value %{z:.3f}<extra>${item.key} heatmap</extra>`,
                          },
                        ]
                      : []
                  }
                  layout={heatmapLayout()}
                  config={paperPlotConfig(`stokes-${item.key}-heatmap`)}
                  useResizeHandler
                  style={{ width: "100%", height: "calc(100% - 2rem)" }}
                />
              </div>

              <div className="aspect-square w-full border-t border-border pt-4">
                <div className="plot-subplot-title mb-2 text-center text-foreground">Profile</div>
                <Plot
                  data={
                    item.profile
                      ? [
                          {
                            x: item.profile.x,
                            y: item.profile.y,
                            type: "scatter" as const,
                            mode: "lines" as const,
                            line: { color: item.color, width: 3 },
                            hovertemplate: `Phase %{x:.4f}<br>Value %{y:.3f}<extra>${item.key} profile</extra>`,
                          },
                        ]
                      : []
                  }
                  layout={profileLayout()}
                  config={paperPlotConfig(`stokes-${item.key}-profile`)}
                  useResizeHandler
                  style={{ width: "100%", height: "calc(100% - 2rem)" }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="p-4 w-[95vw] max-w-7xl h-[92vh]" title={`Stokes ${fullscreenItem.key}`}>
          <div className="h-full w-full">
            <div className="plot-toolbar mb-3">
              <PlotExportButtons filename={`stokes-${fullscreenItem.key}-fullscreen`} />
            </div>
            <div className="grid h-[calc(100%-3rem)] grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="plot-export-scope h-full">
                <Plot
                  data={
                    fullscreenItem.heatmap
                      ? [
                          {
                            x: fullscreenItem.heatmap.pulse_phase,
                            y: fullscreenItem.heatmap.pulse_number,
                            z: fullscreenItem.heatmap.heatmap_data,
                            type: "heatmap" as const,
                            colorscale: "Viridis",
                            zmin: fullscreenItem.heatmap.vmin,
                            zmax: fullscreenItem.heatmap.vmax,
                            showscale: false,
                            hovertemplate: `Phase %{x:.4f}<br>Pulse %{y}<br>Value %{z:.3f}<extra>${fullscreenItem.key} heatmap</extra>`,
                          },
                        ]
                      : []
                  }
                  layout={{ ...heatmapLayout(), autosize: true, height: undefined }}
                  config={paperPlotConfig(`stokes-${fullscreenItem.key}-heatmap-fullscreen`)}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>

              <div className="plot-export-scope h-full">
                <Plot
                  data={
                    fullscreenItem.profile
                      ? [
                          {
                            x: fullscreenItem.profile.x,
                            y: fullscreenItem.profile.y,
                            type: "scatter" as const,
                            mode: "lines" as const,
                            line: { color: fullscreenItem.color, width: 3 },
                            hovertemplate: `Phase %{x:.4f}<br>Value %{y:.3f}<extra>${fullscreenItem.key} profile</extra>`,
                          },
                        ]
                      : []
                  }
                  layout={{ ...profileLayout(), autosize: true, height: undefined }}
                  config={paperPlotConfig(`stokes-${fullscreenItem.key}-profile-fullscreen`)}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          </div>
        </FullscreenOverlay>
      )}
    </>
  );
}
