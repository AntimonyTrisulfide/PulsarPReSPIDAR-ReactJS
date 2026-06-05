import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { PLOT_AXIS_TITLE_SIZE, PLOT_TICK_FONT_SIZE, plotAxisText, plotFont } from "@/shared/plot/plotTypography";
import { RED_TO_RED_COLOR_SCALE, redToRedPhaseColor } from "@/shared/plot/phaseColorScale";

type NumericSeries = Array<number | null>;

type SubpulsePolarisationData = {
  I?: NumericSeries;
  PA?: NumericSeries;
  EA?: NumericSeries;
  dPA?: NumericSeries;
  p_frac?: NumericSeries;
  l_frac?: NumericSeries;
  v_frac?: NumericSeries;
  x?: NumericSeries;
  y?: NumericSeries;
  z?: NumericSeries;
};

type SubpulsePolarisationViewProps = {
  phaseAxis: number[];
  data: SubpulsePolarisationData;
  selectedPulseIndex: number;
  isDark?: boolean;
};

type CombinedSeriesKey = "dPA" | "p_frac" | "l_frac" | "v_frac";
const MAX_RADIAL_PATH_TRACES = 48;

export default function SubpulsePolarisationView({ phaseAxis, data, selectedPulseIndex, isDark }: SubpulsePolarisationViewProps) {
  const [visibleCombinedSeries, setVisibleCombinedSeries] = useState<Record<CombinedSeriesKey, boolean>>({
    dPA: true,
    p_frac: true,
    l_frac: true,
    v_frac: true,
  });
  const axisColor = isDark ? "#f8fbff" : "#111827";
  const gridColor = isDark ? "#374151" : "#cbd5e1";
  const paperBg = isDark ? "#080808" : "#f7fafc";
  const plotBg = isDark ? "#080808" : "#f7fafc";
  const surfaceColor = isDark ? "#262626" : "#dbe6f0";

  const markerColors = useMemo(() => phaseAxis.map((_, index) => {
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

  const sphere3d = useMemo(() => ({
    type: "surface" as const,
    ...getUnitSphereSurface(34),
    opacity: 0.28,
    colorscale: [[0, surfaceColor], [1, surfaceColor]] as any,
    showscale: false,
    hoverinfo: "skip" as const,
    name: "Unit sphere",
  }), [surfaceColor]);

  const points3d = useMemo(() => ({
    type: "scatter3d" as const,
    x: data.x ?? [],
    y: data.y ?? [],
    z: data.z ?? [],
    mode: "lines+markers" as const,
    line: {
      color: isDark ? "#cbd5e1" : "#475569",
      width: 3,
    },
    marker: {
      size: 4,
      color: markerColors,
      colorscale: RED_TO_RED_COLOR_SCALE as any,
      cmin: 0,
      cmax: 1,
      showscale: true,
      colorbar: {
        title: { text: "Phase" },
        orientation: "h" as const,
        x: 0.5,
        y: -0.3,
        len: 0.58,
        thickness: 14,
        tickvals: phaseTicks.tickvals,
        ticktext: phaseTicks.ticktext,
      },
    },
    connectgaps: false,
    hovertemplate: "Q %{x:.3f}<br>U %{y:.3f}<br>V %{z:.3f}<extra></extra>",
    name: "Subpulse trajectory",
    showlegend: false,
  }), [data.x, data.y, data.z, isDark, markerColors, phaseTicks.ticktext, phaseTicks.tickvals]);

  const radialPathTraces = useMemo(
    () => makeRadialPathTraces(data.x ?? [], data.y ?? [], data.z ?? [], markerColors),
    [data.x, data.y, data.z, markerColors],
  );

  const layout3d = useMemo(() => ({
    title: undefined,
    dragmode: "orbit" as const,
    scene: {
      xaxis: makeSceneAxis("Q", axisColor, gridColor, isDark),
      yaxis: makeSceneAxis("U", axisColor, gridColor, isDark),
      zaxis: makeSceneAxis("V", axisColor, gridColor, isDark),
      aspectmode: "cube" as const,
      camera: { eye: { x: 1.45, y: 1.45, z: 1.05 } },
      bgcolor: plotBg,
    },
    margin: { l: 0, r: 0, t: 36, b: 138 },
    paper_bgcolor: plotBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, isDark, plotBg]);

  const singleSeriesLayout = (yLabel: string) => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: { text: "Pulse Phase", standoff: 8 },
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
      title: { text: yLabel, standoff: 10 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 58, r: 20, t: 34, b: 62 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  });

  const combinedLayout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: { text: "Pulse Phase", standoff: 8 },
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
      title: { text: "Normalised Value", standoff: 10 },
      range: [-1.2, 1.2],
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 58, r: 20, t: 28, b: 52 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, paperBg, plotBg]);

  const combinedTraces = useMemo(() => [
    visibleCombinedSeries.dPA ? makeSeriesTrace(phaseAxis, data.dPA ?? [], "dPA", "#2563eb") : null,
    visibleCombinedSeries.p_frac ? makeSeriesTrace(phaseAxis, data.p_frac ?? [], "P/I", "#0ea5e9") : null,
    visibleCombinedSeries.l_frac ? makeSeriesTrace(phaseAxis, data.l_frac ?? [], "L/I", "#22c55e") : null,
    visibleCombinedSeries.v_frac ? makeSeriesTrace(phaseAxis, data.v_frac ?? [], "V/I", "#f97316") : null,
  ].filter(isPlotTrace), [data.dPA, data.l_frac, data.p_frac, data.v_frac, phaseAxis, visibleCombinedSeries]);

  if (!phaseAxis.length) return null;

  return (
    <div className="space-y-8">
      <div className="plot-export-scope h-[780px] w-full">
        <div className="plot-toolbar mb-5 gap-2">
          <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-poincare-sphere`} />
          <div className="plot-panel-title text-foreground">Poincare Sphere for Selected Subpulse</div>
        </div>
        <Plot
          data={[sphere3d, ...radialPathTraces, points3d]}
          layout={layout3d}
          config={paperPlotConfig(`subpulse-${selectedPulseIndex}-poincare-sphere`, { interactive: true })}
          useResizeHandler
          style={{ width: "100%", height: "calc(100% - 4.25rem)" }}
        />
      </div>

      <div className="scientific-divider pt-8">
        <div className="mb-5 plot-panel-title text-foreground">Polarisation Parameters for Selected Subpulse</div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 xl:grid-cols-2">
          <LinePanel
            filename={`subpulse-${selectedPulseIndex}-i`}
            title="I"
            phaseAxis={phaseAxis}
            values={data.I ?? []}
            color="#0ea5e9"
            layout={singleSeriesLayout("I")}
          />
          <LinePanel
            filename={`subpulse-${selectedPulseIndex}-pa`}
            title="PA"
            phaseAxis={phaseAxis}
            values={data.PA ?? []}
            color="#2563eb"
            layout={singleSeriesLayout("PA [deg]")}
          />
          <LinePanel
            filename={`subpulse-${selectedPulseIndex}-ea`}
            title="EA"
            phaseAxis={phaseAxis}
            values={data.EA ?? []}
            color="#dc2626"
            layout={singleSeriesLayout("EA [deg]")}
          />
          <div className="plot-export-scope h-[500px] w-full">
            <div className="plot-toolbar mb-4 gap-2">
              <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-combined-parameters`} />
              <div className="plot-panel-title text-foreground">dPA, P/I, L/I, V/I</div>
            </div>
            <Plot
              data={combinedTraces}
              layout={combinedLayout}
              config={paperPlotConfig(`subpulse-${selectedPulseIndex}-combined-parameters`)}
              useResizeHandler
              style={{ width: "100%", height: "calc(100% - 8rem)" }}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm font-semibold text-foreground">
              {[
                ["dPA", "dPA"],
                ["p_frac", "P/I"],
                ["l_frac", "L/I"],
                ["v_frac", "V/I"],
              ].map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={visibleCombinedSeries[key as CombinedSeriesKey]}
                    onChange={() => setVisibleCombinedSeries(current => ({ ...current, [key]: !current[key as CombinedSeriesKey] }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type LinePanelProps = {
  filename: string;
  title: string;
  phaseAxis: number[];
  values: NumericSeries;
  color: string;
  layout: any;
};

function LinePanel({ filename, title, phaseAxis, values, color, layout }: LinePanelProps) {
  return (
    <div className="plot-export-scope h-[470px] w-full">
      <div className="plot-toolbar mb-4 gap-2">
        <PlotExportButtons filename={filename} />
        <div className="plot-panel-title text-foreground">{title}</div>
      </div>
      <Plot
        data={[makeSeriesTrace(phaseAxis, values, title, color)]}
        layout={layout}
        config={paperPlotConfig(filename)}
        useResizeHandler
        style={{ width: "100%", height: "calc(100% - 4rem)" }}
      />
    </div>
  );
}

function isPlotTrace<T>(value: T | null): value is T {
  return value !== null;
}

function makeSeriesTrace(phaseAxis: number[], values: NumericSeries, name: string, color: string) {
  return {
    x: phaseAxis,
    y: values,
    type: "scatter" as const,
    mode: "lines+markers" as const,
    name,
    line: { color, width: 1.6 },
    marker: { size: 4, color },
    connectgaps: false,
    hovertemplate: "Phase %{x:.4f}<br>%{fullData.name} %{y:.4f}<extra></extra>",
  };
}

function makeRadialPathTraces(xValues: NumericSeries, yValues: NumericSeries, zValues: NumericSeries, markerColors: number[]) {
  const count = Math.min(xValues.length, yValues.length, zValues.length, markerColors.length);
  const step = Math.max(1, Math.ceil(count / MAX_RADIAL_PATH_TRACES));
  const traces = [];

  for (let index = 0; index < count; index += step) {
    const x = xValues[index];
    const y = yValues[index];
    const z = zValues[index];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    traces.push({
      type: "scatter3d" as const,
      x: [0, x],
      y: [0, y],
      z: [0, z],
      mode: "lines" as const,
      line: { color: redToRedPhaseColor(markerColors[index] ?? 0), width: 2.2 },
      hoverinfo: "skip" as const,
      showlegend: false,
      name: "Polarization path",
    });
  }

  return traces;
}

function makeSceneAxis(title: string, axisColor: string, gridColor: string, isDark?: boolean) {
  return {
    title: { text: title, font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } },
    range: [-1, 1],
    gridcolor: gridColor,
    zerolinecolor: gridColor,
    linecolor: axisColor,
    tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE },
    tickcolor: axisColor,
    ticks: "outside" as const,
    ticklen: 4,
    showline: true,
    showbackground: true,
    backgroundcolor: isDark ? "#080808" : "#f7fafc",
  };
}

function getUnitSphereSurface(resolution: number) {
  const u = range(0, 2 * Math.PI, resolution);
  const v = range(0, Math.PI, resolution);
  const x: number[][] = [];
  const y: number[][] = [];
  const z: number[][] = [];

  for (const polar of v) {
    const rowX: number[] = [];
    const rowY: number[] = [];
    const rowZ: number[] = [];
    for (const azimuth of u) {
      rowX.push(Math.cos(azimuth) * Math.sin(polar));
      rowY.push(Math.sin(azimuth) * Math.sin(polar));
      rowZ.push(Math.cos(polar));
    }
    x.push(rowX);
    y.push(rowY);
    z.push(rowZ);
  }

  return { x, y, z };
}

function range(start: number, end: number, count: number) {
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}
