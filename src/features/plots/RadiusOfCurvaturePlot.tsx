import { useMemo } from "react";
import Plot from "react-plotly.js";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";
import { RED_TO_RED_COLOR_SCALE } from "@/shared/plot/phaseColorScale";

type RadiusOfCurvaturePlotProps = {
  phaseAxis: number[];
  radius: Array<number | null>;
  isDark?: boolean;
};

export default function RadiusOfCurvaturePlot({ phaseAxis, radius, isDark }: RadiusOfCurvaturePlotProps) {
  const axisColor = isDark ? "#f8fbff" : "#111827";
  const gridColor = isDark ? "#374151" : "#cbd5e1";
  const paperBg = isDark ? "#080808" : "#f7fafc";
  const plotBg = isDark ? "#080808" : "#f7fafc";
  const normalizedPhase = useMemo(() => phaseAxis.map((_, index) => {
    const denominator = Math.max(1, phaseAxis.length - 1);
    return index / denominator;
  }), [phaseAxis]);
  const phaseTicks = useMemo(() => {
    if (!phaseAxis.length) return { tickvals: [0, 0.5, 1], ticktext: ["0", "0.5", "1"] };
    const first = phaseAxis[0];
    const middle = phaseAxis[Math.floor((phaseAxis.length - 1) / 2)];
    const last = phaseAxis[phaseAxis.length - 1];
    return {
      tickvals: [0, 0.5, 1],
      ticktext: [first, middle, last].map(value => value.toFixed(3)),
    };
  }, [phaseAxis]);

  const trace = useMemo(() => ({
    type: "scatter" as const,
    mode: "lines+markers" as const,
    x: phaseAxis,
    y: radius,
    line: { color: isDark ? "#94a3b8" : "#64748b", width: 1.6 },
    marker: {
      size: 6,
      color: normalizedPhase,
      colorscale: RED_TO_RED_COLOR_SCALE as any,
      cmin: 0,
      cmax: 1,
      showscale: true,
      colorbar: {
        title: { text: "Phase" },
        orientation: "h" as const,
        x: 0.5,
        y: -0.5,
        len: 0.58,
        thickness: 14,
        tickvals: phaseTicks.tickvals,
        ticktext: phaseTicks.ticktext,
      },
    },
    connectgaps: false,
    hovertemplate: "Phase %{x:.4f}<br>Radius %{y:.4f}<extra></extra>",
    name: "Radius",
  }), [isDark, normalizedPhase, phaseAxis, phaseTicks.ticktext, phaseTicks.tickvals, radius]);

  const layout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: { text: "Pulse Phase", standoff: 28 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    yaxis: {
      title: { text: "Radius of Fitted Circle", standoff: 10 },
      range: [-0.1, 1.1],
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 58, r: 24, t: 36, b: 172 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, paperBg, plotBg]);

  if (!phaseAxis.length || !radius.length) {
    return null;
  }

  return (
    <div className="plot-export-scope scientific-divider mt-8 h-[580px] w-full pt-7">
      <div className="plot-toolbar mb-4 gap-2">
        <PlotExportButtons filename="integrated-radius-of-curvature" />
        <div className="plot-panel-title text-foreground">Radius of Curvature</div>
      </div>
      <Plot
        data={[trace]}
        layout={layout}
        config={paperPlotConfig("integrated-radius-of-curvature")}
        useResizeHandler
        style={{ width: "100%", height: "calc(100% - 4rem)" }}
      />
    </div>
  );
}
