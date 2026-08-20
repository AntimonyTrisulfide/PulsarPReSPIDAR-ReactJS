import { useMemo, useState, useEffect, useCallback, useRef, memo, useTransition, useId, type CSSProperties } from "react";
import Plot from "react-plotly.js";
import Plotly from "plotly.js/dist/plotly";
import { geoGraticule, geoPath, scaleLinear, select } from "d3";
import { geoAitoff } from "d3-geo-projection";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig, type PlotExportFormat } from "@/shared/plot/plotlyConfig";
import { PLOT_AXIS_TITLE_SIZE, PLOT_TICK_FONT_SIZE, plotAxisText, plotFont } from "@/shared/plot/plotTypography";
import { downloadSvgFromScope } from "@/shared/plot/svgExport";
import { useElementSize } from "@/shared/plot/useElementSize";
import { RED_TO_RED_COLOR_SCALE, redToRedPhaseColor } from "@/shared/plot/phaseColorScale";

// Memoized Plot component to prevent unnecessary re-renders
const MemoizedPlot = memo(Plot);
// Separate memoized component for custom XY plot
interface CustomXYPlotProps {
  xData: number[];
  yData: number[];
  xLabel: string;
  yLabel: string;
  isDark: boolean;
  axisColor: string;
  gridColor: string;
  paperBg: string;
  plotBg: string;
}

type LinearDataRow = {
  index: number;
  x: number;
  y: number;
};

type StokesSeriesKey = "I" | "Q" | "U" | "V";
type FractionSeriesKey = "p_frac" | "l_frac" | "v_frac" | "absv_frac" | "PA" | "EA";
type RightPanelSeriesKey = StokesSeriesKey | FractionSeriesKey;

const RIGHT_PANEL_SERIES_OPTIONS: Array<{ key: RightPanelSeriesKey; label: string; color: string; dash?: "dash" }> = [
  { key: "I", label: "I", color: "#1f77b4" },
  { key: "Q", label: "Q", color: "#ff7f0e" },
  { key: "U", label: "U", color: "#2ca02c" },
  { key: "V", label: "V", color: "#d62728" },
  { key: "p_frac", label: "P/I", color: "#0ea5e9" },
  { key: "l_frac", label: "L/I", color: "#22c55e" },
  { key: "v_frac", label: "V/I", color: "#f97316" },
  { key: "absv_frac", label: "|V/I|", color: "#a855f7", dash: "dash" },
  { key: "PA", label: "PA", color: "#2563eb" },
  { key: "EA", label: "EA", color: "#dc2626" },
];

const rightPanelColor = (key: RightPanelSeriesKey) => RIGHT_PANEL_SERIES_OPTIONS.find(option => option.key === key)?.color ?? "#64748b";
const rightPanelSeriesValues = (phaseAxis: number[], values: number[]) => {
  const count = Math.min(phaseAxis.length, values.length);
  return {
    x: phaseAxis.slice(0, count),
    y: values.slice(0, count),
  };
};

const rightPanelErrorY = (values: number[] | undefined, color: string) => {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return {
    type: "data" as const,
    array: values,
    visible: true,
    thickness: 0.75,
    width: 1.5,
    color,
  };
};

function isPlotTrace<T>(value: T | null): value is T {
  return value !== null;
}

const CustomXYPlot = memo(function CustomXYPlot({
  xData,
  yData,
  xLabel,
  yLabel,
  isDark,
  axisColor,
  gridColor,
  paperBg,
  plotBg,
}: CustomXYPlotProps) {
  const rows = useMemo<LinearDataRow[]>(() => {
    const count = Math.min(xData.length, yData.length);
    const next: LinearDataRow[] = [];
    for (let index = 0; index < count; index += 1) {
      const x = xData[index];
      const y = yData[index];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      next.push({ index, x, y });
    }
    return next;
  }, [xData, yData]);

  const dataLength = rows.length;
  
  const trace = useMemo(() => {
    if (dataLength === 0) return null;
    
    return {
      type: "scatter" as const,
      mode: "lines" as const,
      x: rows.map(row => row.x),
      y: rows.map(row => row.y),
      line: { color: isDark ? "#60a5fa" : "#2563eb", width: 2 },
      hovertemplate: `${xLabel} %{x:.4f}<br>${yLabel} %{y:.4f}<extra></extra>`,
      name: "Trajectory",
      showlegend: false,
    };
  }, [dataLength, isDark, rows, xLabel, yLabel]);

  const layout = useMemo(() => {
    const arrowColor = isDark ? "#60a5fa" : "#2563eb";
    const annotations: any[] = [];
    
    // Only create annotations if we have data
    if (dataLength > 1) {
      const arrowStep = Math.max(1, Math.ceil(dataLength / 48));
      for (let i = 0; i < dataLength - 1; i += arrowStep) {
        const x0 = rows[i]?.x;
        const y0 = rows[i]?.y;
        const x1 = rows[i + 1]?.x;
        const y1 = rows[i + 1]?.y;
        
        if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue;
        
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = dx * dx + dy * dy; // Skip sqrt for performance
        
        if (dist > 1e-20) {
          annotations.push({
            x: x1,
            y: y1,
            ax: x0,
            ay: y0,
            xref: "x",
            yref: "y",
            axref: "x",
            ayref: "y",
            showarrow: true,
            arrowhead: 2,
            arrowsize: 1.2,
            arrowwidth: 2,
            arrowcolor: arrowColor,
          });
        }
      }
    }
    
    return lockCartesianInteractions({
      title: undefined,
      xaxis: {
        title: { text: xLabel, standoff: 8 },
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
      annotations,
      margin: { l: 50, r: 20, t: 45, b: 50 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: plotFont(axisColor),
    } as const);
  }, [xLabel, yLabel, rows, dataLength, isDark, axisColor, gridColor, paperBg, plotBg]);

  if (dataLength === 0) {
    return (
      <div className="h-full w-full rounded-md border border-dashed border-border/70 text-sm text-muted-foreground flex items-center justify-center">
        No overlapping samples for the selected axes.
      </div>
    );
  }

  return (
    <MemoizedPlot
      data={trace ? [trace] : []}
      layout={layout}
      config={paperPlotConfig("custom-polarisation-xy")}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
});

type DualAitoffProjectionProps = {
  points: DualAitoffPoint[];
  startPhase: number;
  endPhase: number;
  axisColor: string;
  gridColor: string;
  mutedColor: string;
  bgColor: string;
  className?: string;
  fullscreen?: boolean;
};

const aitoffLatLabelValues = [-60, -30, 0, 30, 60];
const aitoffLonLabelValues = [-135, -90, -45, 0, 45, 90, 135];
const DUAL_AITOFF_PNG_EXPORT_SCALE = 4;
const DualAitoffProjection = memo(function DualAitoffProjection({
  points,
  startPhase,
  endPhase,
  axisColor,
  gridColor,
  mutedColor,
  bgColor,
  className,
  fullscreen = false,
}: DualAitoffProjectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientId = `dual-aitoff-phase-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const size = useElementSize(
    containerRef,
    fullscreen ? { width: 1320, height: 760 } : { width: 1080, height: 560 },
    { width: 420, height: 340 },
  );

  const phaseScale = useMemo(() => {
    const span = endPhase - startPhase;
    const min = span === 0 ? startPhase - 0.5 : startPhase;
    const max = span === 0 ? endPhase + 0.5 : endPhase;
    return scaleLinear<string>()
      .domain(RED_TO_RED_COLOR_SCALE.map(([position]) => min + position * (max - min)))
      .range(RED_TO_RED_COLOR_SCALE.map(([, color]) => color));
  }, [endPhase, startPhase]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    const width = Math.max(420, Math.round(size.width));
    const height = Math.max(340, Math.round(size.height));
    const metrics = getDualAitoffMetrics(width, height, fullscreen);
    const { margin, labelFontSize, pointRadius, tickLength } = metrics;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    select(target).selectAll("svg").remove();

    const svg = select(target)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("background-color", bgColor);

    svg.append("rect").attr("width", width).attr("height", height).attr("fill", bgColor);

    const projection = geoAitoff().fitExtent(
      [[0, 0], [innerWidth, innerHeight]],
      { type: "Sphere" },
    );
    const path = geoPath(projection);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("path")
      .datum({ type: "Sphere" })
      .attr("d", path)
      .attr("fill", bgColor)
      .attr("stroke", axisColor)
      .attr("stroke-width", metrics.axisStrokeWidth);

    g.append("path")
      .datum(geoGraticule().step([45, 30])())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", gridColor)
      .attr("stroke-width", metrics.gridStrokeWidth)
      .attr("stroke-opacity", 0.78);

    [makeAitoffLineString(0, "lon"), makeAitoffLineString(0, "lat")].forEach(line => {
      g.append("path")
        .datum(line)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", mutedColor)
        .attr("stroke-width", metrics.axisLineStrokeWidth)
        .attr("stroke-opacity", 0.82);
    });

    const circles = g.selectAll(".dual-aitoff-point")
      .data(points)
      .enter()
      .append("circle")
      .attr("class", "dual-aitoff-point")
      .attr("cx", (point: DualAitoffPoint) => projection([point.lon, point.lat])?.[0] ?? 0)
      .attr("cy", (point: DualAitoffPoint) => projection([point.lon, point.lat])?.[1] ?? 0)
      .attr("r", pointRadius)
      .attr("fill", (point: DualAitoffPoint) => phaseScale(point.phase))
      .attr("opacity", 0.9)
      .attr("stroke", bgColor)
      .attr("stroke-width", metrics.pointStrokeWidth);

    circles.append("title")
      .text((point: DualAitoffPoint) => `Lon: ${point.lon.toFixed(2)}°\nLat: ${point.lat.toFixed(2)}°\nPhase: ${point.phase.toFixed(4)}`);

    if (!points.length) {
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight / 2)
        .attr("text-anchor", "middle")
        .attr("font-size", labelFontSize)
        .attr("fill", mutedColor)
        .text("No finite Poincare coordinates");
    }

    g.selectAll(".dual-aitoff-lat-label")
      .data(aitoffLatLabelValues)
      .enter()
      .append("text")
      .attr("class", "dual-aitoff-lat-label")
      .attr("x", (lat: number) => (projection([-178, lat])?.[0] ?? 0) - labelFontSize * 0.9)
      .attr("y", (lat: number) => projection([-178, lat])?.[1] ?? 0)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", labelFontSize)
      .attr("fill", mutedColor)
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", Math.max(4, labelFontSize * 0.42))
      .text((lat: number) => `${lat}°`);

    g.selectAll(".dual-aitoff-lon-tick")
      .data(aitoffLonLabelValues)
      .enter()
      .append("line")
      .attr("class", "dual-aitoff-lon-tick")
      .attr("x1", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y1", (lon: number) => (projection([lon, 0])?.[1] ?? 0) - tickLength)
      .attr("x2", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y2", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + tickLength)
      .attr("stroke", mutedColor)
      .attr("stroke-width", metrics.tickStrokeWidth)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.86);

    g.selectAll(".dual-aitoff-lon-label")
      .data(aitoffLonLabelValues)
      .enter()
      .append("text")
      .attr("class", "dual-aitoff-lon-label")
      .attr("x", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + labelFontSize * 1.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("font-size", labelFontSize)
      .attr("fill", mutedColor)
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .text((lon: number) => `${lon}°`);

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - labelFontSize * 5.25)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(12, labelFontSize - 1))
      .attr("font-weight", 700)
      .attr("fill", axisColor)
      .text("Longitude (2PA)");

    svg.append("text")
      .attr("transform", `translate(${Math.max(16, margin.left * 0.24)}, ${margin.top + innerHeight / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(12, labelFontSize - 1))
      .attr("font-weight", 700)
      .attr("fill", axisColor)
      .text("Latitude (2EA)");

    drawDualAitoffColorbar(svg, width, height, gradientId, startPhase, endPhase, phaseScale, axisColor, mutedColor, labelFontSize);
  }, [axisColor, bgColor, endPhase, fullscreen, gradientId, gridColor, mutedColor, phaseScale, points, size, startPhase]);

  return <div ref={containerRef} className={className} />;
});

interface PolarisationDataset {
  PA: number[];
  EA: number[];
  x: number[];
  y: number[];
  z: number[];
  p_frac: number[];
  l_frac: number[];
  v_frac: number[];
  absv_frac: number[];
  I_err?: number[];
  Q_err?: number[];
  U_err?: number[];
  V_err?: number[];
  p_frac_err?: number[];
  l_frac_err?: number[];
  v_frac_err?: number[];
  absv_frac_err?: number[];
  PA_err?: number[];
  EA_err?: number[];
}

type DualAitoffPoint = {
  lon: number;
  lat: number;
  phase: number;
};

interface PolarisationDualViewProps {
  phaseAxis: number[];
  data: PolarisationDataset;
  isDark?: boolean;
  startPhase?: number;
  endPhase?: number;
  radiusOfCurvature?: Array<number | null>;
  stokesProfiles?: Partial<Record<StokesSeriesKey, { x?: number[]; y?: number[] }>>;
  filenamePrefix?: string;
}

function PolarisationDualView({ phaseAxis, data, isDark, startPhase = 0, endPhase = 1, radiusOfCurvature = [], stokesProfiles = {}, filenamePrefix = "observation" }: PolarisationDualViewProps) {
  const [mode, setMode] = useState<"aitoff" | "3d">("aitoff");
  const [split, setSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState<null | "left" | "right" | "custom" | "radius">(null);
  const [visibleSeries, setVisibleSeries] = useState<Record<RightPanelSeriesKey, boolean>>({
    I: true,
    Q: true,
    U: true,
    V: true,
    p_frac: true,
    l_frac: true,
    v_frac: true,
    absv_frac: true,
    PA: true,
    EA: true,
  });
  const [xAxisKey, setXAxisKey] = useState<AxisKey>("phase");
  const [yAxisKey, setYAxisKey] = useState<AxisKey>("p_frac");
  const [, startTransition] = useTransition();
  const rafRef = useRef<number | null>(null);
  const resizeEventRaf = useRef<number | null>(null);
  const lastResizeTs = useRef<number>(0);
  const draggingRef = useRef(false);
  const splitRef = useRef(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const leftAitoffScopeRef = useRef<HTMLDivElement>(null);
  const fullscreenAitoffScopeRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const draggedRef = useRef(false);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#90a4c8" : "#475569";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
  const activeToggleClass = themeIsDark ? "bg-white/15 text-white" : "bg-gray-900 text-white";
  const inactiveToggleClass = themeIsDark ? "text-gray-200 hover:bg-white/5" : "text-gray-800 hover:bg-black/5";

  const phaseSampleCount = useMemo(
    () => Math.min(
      phaseAxis.length,
      data.x?.length ?? 0,
      data.y?.length ?? 0,
      data.z?.length ?? 0,
      data.p_frac?.length ?? 0,
      data.PA?.length ?? 0,
      data.EA?.length ?? 0,
    ),
    [data.EA?.length, data.PA?.length, data.p_frac?.length, data.x?.length, data.y?.length, data.z?.length, phaseAxis.length],
  );

  const markerColors = useMemo(() => {
    const n = phaseSampleCount;
    if (n === 0) return [] as number[];
    if (n === 1) return [startPhase];
    const phaseRange = endPhase - startPhase;
    return Array.from({ length: n }, (_, i) => startPhase + (i / (n - 1)) * phaseRange);
  }, [phaseSampleCount, startPhase, endPhase]);

  const aitoffPoints = useMemo<DualAitoffPoint[]>(() => {
    if (!data.PA?.length || !data.EA?.length) {
      return [];
    }
    const count = Math.min(data.PA.length, data.EA.length, markerColors.length);
    const next: DualAitoffPoint[] = [];
    for (let index = 0; index < count; index += 1) {
      const lon = normalizeLongitude(2 * data.PA[index]);
      const lat = clamp(2 * data.EA[index], -90, 90);
      const phase = markerColors[index];
      if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(phase)) {
        next.push({ lon, lat, phase });
      }
    }
    return next;
  }, [data.PA, data.EA, markerColors]);

  const sphere3d = useMemo(() => getUnitSphereSurface(20), []);

  // Memoize mode change handler
  const handleModeChange = useCallback((newMode: "aitoff" | "3d") => {
    startTransition(() => {
      setMode(newMode);
    });
  }, []);

  const points3d = useMemo(() => ({
    type: "scatter3d" as const,
    x: data.x.slice(0, phaseSampleCount),
    y: data.y.slice(0, phaseSampleCount),
    z: data.z.slice(0, phaseSampleCount),
    mode: "markers" as const,
    marker: {
      size: 4,
      color: markerColors,
      colorscale: RED_TO_RED_COLOR_SCALE as any,
      cmin: startPhase,
      cmax: endPhase,
      showscale: true,
      colorbar: {
        title: { text: "Phase", side: "top" as const },
        orientation: "h" as const,
        x: 0.5,
        xanchor: "center" as const,
        y: -0.19,
        yanchor: "top" as const,
        len: 0.52,
        thickness: 18,
        outlinecolor: axisColor,
        outlinewidth: 0.4,
        tickvals: [startPhase, endPhase],
        ticktext: [startPhase.toFixed(3), endPhase.toFixed(3)],
      },
    },
    hovertemplate: "Q %{x:.2f}<br>U %{y:.2f}<br>V %{z:.2f}<extra></extra>",
    name: "Poincare points",
    showlegend: false,
  }), [axisColor, data.x, data.y, data.z, endPhase, markerColors, phaseSampleCount, startPhase]);

  const radialPathTraces = useMemo(
    () => makeRadialPathTraces(data.x, data.y, data.z, data.p_frac, markerColors, startPhase, endPhase),
    [data.x, data.y, data.z, data.p_frac, markerColors, startPhase, endPhase],
  );

  const layout3d = useMemo(() => ({
    title: undefined,
    dragmode: "orbit" as const,
    scene: {
      xaxis: { title: { text: "Q", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, showspikes: false, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      yaxis: { title: { text: "U", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, showspikes: false, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      zaxis: { title: { text: "V", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, showspikes: false, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      aspectmode: "cube" as const,
      bgcolor: plotBg,
    },
    margin: { l: 0, r: 0, t: 50, b: 50 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, paperBg, plotBg, themeIsDark]);

  useEffect(() => {
    const summarize = (arr: number[]) => {
      if (!arr?.length) return { min: null, max: null, neg: 0, pos: 0, sample: [] as number[] };
      let min = arr[0];
      let max = arr[0];
      let neg = 0;
      let pos = 0;
      for (const v of arr) {
        if (v < min) min = v;
        if (v > max) max = v;
        if (v < 0) neg += 1;
        else if (v > 0) pos += 1;
      }
      return { min, max, neg, pos, sample: arr.slice(0, 6) };
    };

    const payload = {
      x: summarize(data.x),
      y: summarize(data.y),
      z: summarize(data.z),
      PA: summarize(data.PA),
      EA: summarize(data.EA),
      total: data.x?.length ?? 0,
    };

    // Helpful once-per-dataset log to verify sign/range being plotted
    // eslint-disable-next-line no-console
    console.log("[PolarisationDualView] Poincare dataset stats", payload);
  }, [data]);

  const stokesTraces = useMemo(() => ([
    visibleSeries.I ? { x: stokesProfiles.I?.x ?? phaseAxis, y: stokesProfiles.I?.y ?? [], type: "scatter" as const, mode: "lines" as const, name: "I", line: { color: rightPanelColor("I"), width: 1.7 }, error_y: rightPanelErrorY(data.I_err, rightPanelColor("I")) } : null,
    visibleSeries.Q ? { x: stokesProfiles.Q?.x ?? phaseAxis, y: stokesProfiles.Q?.y ?? [], type: "scatter" as const, mode: "lines" as const, name: "Q", line: { color: rightPanelColor("Q"), width: 1.7 }, error_y: rightPanelErrorY(data.Q_err, rightPanelColor("Q")) } : null,
    visibleSeries.U ? { x: stokesProfiles.U?.x ?? phaseAxis, y: stokesProfiles.U?.y ?? [], type: "scatter" as const, mode: "lines" as const, name: "U", line: { color: rightPanelColor("U"), width: 1.7 }, error_y: rightPanelErrorY(data.U_err, rightPanelColor("U")) } : null,
    visibleSeries.V ? { x: stokesProfiles.V?.x ?? phaseAxis, y: stokesProfiles.V?.y ?? [], type: "scatter" as const, mode: "lines" as const, name: "V", line: { color: rightPanelColor("V"), width: 1.7 }, error_y: rightPanelErrorY(data.V_err, rightPanelColor("V")) } : null,
  ].filter(isPlotTrace)), [data.I_err, data.Q_err, data.U_err, data.V_err, phaseAxis, stokesProfiles.I?.x, stokesProfiles.I?.y, stokesProfiles.Q?.x, stokesProfiles.Q?.y, stokesProfiles.U?.x, stokesProfiles.U?.y, stokesProfiles.V?.x, stokesProfiles.V?.y, visibleSeries]);

  const fractionTraces = useMemo(() => ([
    visibleSeries.p_frac ? { ...rightPanelSeriesValues(phaseAxis, data.p_frac), type: "scatter" as const, mode: "markers" as const, name: "P/I", marker: { color: rightPanelColor("p_frac"), size: 5 }, line: { color: rightPanelColor("p_frac") }, error_y: rightPanelErrorY(data.p_frac_err, rightPanelColor("p_frac")), xaxis: "x2", yaxis: "y2" } : null,
    visibleSeries.l_frac ? { ...rightPanelSeriesValues(phaseAxis, data.l_frac), type: "scatter" as const, mode: "markers" as const, name: "L/I", marker: { color: rightPanelColor("l_frac"), size: 5 }, line: { color: rightPanelColor("l_frac") }, error_y: rightPanelErrorY(data.l_frac_err, rightPanelColor("l_frac")), xaxis: "x2", yaxis: "y2" } : null,
    visibleSeries.v_frac ? { ...rightPanelSeriesValues(phaseAxis, data.v_frac), type: "scatter" as const, mode: "markers" as const, name: "V/I", marker: { color: rightPanelColor("v_frac"), size: 5 }, line: { color: rightPanelColor("v_frac") }, error_y: rightPanelErrorY(data.v_frac_err, rightPanelColor("v_frac")), xaxis: "x2", yaxis: "y2" } : null,
    visibleSeries.absv_frac ? { ...rightPanelSeriesValues(phaseAxis, data.absv_frac), type: "scatter" as const, mode: "markers" as const, name: "|V/I|", marker: { color: rightPanelColor("absv_frac"), size: 5 }, line: { color: rightPanelColor("absv_frac"), dash: "dash" as const }, error_y: rightPanelErrorY(data.absv_frac_err, rightPanelColor("absv_frac")), xaxis: "x2", yaxis: "y2" } : null,
  ].filter(isPlotTrace)), [data.absv_frac, data.absv_frac_err, data.l_frac, data.l_frac_err, data.p_frac, data.p_frac_err, data.v_frac, data.v_frac_err, phaseAxis, visibleSeries]);

  const angleTraces = useMemo(() => ([
    visibleSeries.PA ? { ...rightPanelSeriesValues(phaseAxis, data.PA), type: "scatter" as const, mode: "markers" as const, name: "PA (°)", marker: { color: rightPanelColor("PA"), size: 5 }, line: { color: rightPanelColor("PA") }, error_y: rightPanelErrorY(data.PA_err, rightPanelColor("PA")), xaxis: "x3", yaxis: "y3" } : null,
    visibleSeries.EA ? { ...rightPanelSeriesValues(phaseAxis, data.EA), type: "scatter" as const, mode: "markers" as const, name: "EA (°)", marker: { color: rightPanelColor("EA"), size: 5 }, line: { color: rightPanelColor("EA") }, error_y: rightPanelErrorY(data.EA_err, rightPanelColor("EA")), xaxis: "x3", yaxis: "y3" } : null,
  ].filter(isPlotTrace)), [data.EA, data.EA_err, data.PA, data.PA_err, phaseAxis, visibleSeries]);

  const absPA = useMemo(() => (data.PA ?? []).map(v => Math.abs(v)), [data.PA]);
  const absEA = useMemo(() => (data.EA ?? []).map(v => Math.abs(v)), [data.EA]);

  type AxisKey = string;

  const axisOptions = useMemo(() => {
    return [
      { key: "phase" as AxisKey, label: "Phase", values: phaseAxis ?? [] },
      { key: "p_frac" as AxisKey, label: "P/I", values: data.p_frac ?? [] },
      { key: "l_frac" as AxisKey, label: "L/I", values: data.l_frac ?? [] },
      { key: "v_frac" as AxisKey, label: "V/I", values: data.v_frac ?? [] },
      { key: "absv_frac" as AxisKey, label: "|V/I|", values: data.absv_frac ?? [] },
      { key: "PA" as AxisKey, label: "PA (°)", values: data.PA ?? [] },
      { key: "EA" as AxisKey, label: "EA (°)", values: data.EA ?? [] },
      { key: "absPA" as AxisKey, label: "|PA| (°)", values: absPA },
      { key: "absEA" as AxisKey, label: "|EA| (°)", values: absEA },
    ];
  }, [absEA, absPA, data.EA, data.PA, data.absv_frac, data.l_frac, data.p_frac, data.v_frac, phaseAxis]);

  const axisMap = useMemo(() => {
    const map: Record<AxisKey, number[]> = {};
    // Build map once, filter finite values
    axisOptions.forEach(opt => {
      const values = opt.values;
      if (Array.isArray(values) && values.length > 0) {
        map[opt.key] = values.filter((v): v is number => Number.isFinite(v));
      }
    });
    return map;
  }, [axisOptions]);

  // Cache selected axis data to avoid recalculation
  const selectedXData = useMemo(() => axisMap[xAxisKey] ?? [], [axisMap, xAxisKey]);
  const selectedYData = useMemo(() => axisMap[yAxisKey] ?? [], [axisMap, yAxisKey]);

  // Get axis labels efficiently
  const xAxisLabel = useMemo(
    () => axisOptions.find(o => o.key === xAxisKey)?.label || xAxisKey,
    [axisOptions, xAxisKey]
  );
  const yAxisLabel = useMemo(
    () => axisOptions.find(o => o.key === yAxisKey)?.label || yAxisKey,
    [axisOptions, yAxisKey]
  );

  const fractionsLayout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: undefined,
      showgrid: true,
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      showticklabels: false,
      anchor: "y" as const,
      domain: [0, 1],
      range: [startPhase, endPhase],
    },
    yaxis: {
      title: { text: "Stokes", standoff: 10 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      domain: [0.69, 1],
      anchor: "x" as const,
    },
    xaxis2: {
      title: undefined,
      showgrid: true,
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      showticklabels: false,
      anchor: "y2" as const,
      domain: [0, 1],
      range: [startPhase, endPhase],
    },
    yaxis2: {
      title: { text: "Fraction", standoff: 10 },
      range: [-0.2, 1.2],
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      domain: [0.345, 0.655],
      anchor: "x2" as const,
    },
    xaxis3: {
      title: { text: "Phase", standoff: 8 },
      showgrid: true,
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      anchor: "y3" as const,
      domain: [0, 1],
      range: [startPhase, endPhase],
    },
    yaxis3: {
      title: { text: "Angle", standoff: 10 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      domain: [0, 0.31],
      anchor: "x3" as const,
    },
    margin: { l: 58, r: 20, t: 20, b: 52 },
    showlegend: false,
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    height: undefined,
  }), [axisColor, endPhase, gridColor, paperBg, plotBg, startPhase]);

  const handleXAxisChange = useCallback((key: AxisKey) => {
    startTransition(() => {
      setXAxisKey(key);
    });
  }, []);

  const handleYAxisChange = useCallback((key: AxisKey) => {
    startTransition(() => {
      setYAxisKey(key);
    });
  }, []);

  const toggleSeries = useCallback((key: RightPanelSeriesKey) => {
    setVisibleSeries(current => ({ ...current, [key]: !current[key] }));
  }, []);

  const exportDualAitoff = useCallback((format: PlotExportFormat, source: "inline" | "fullscreen" = "inline") => {
    const scope = source === "fullscreen" ? fullscreenAitoffScopeRef.current : leftAitoffScopeRef.current;
    downloadSvgFromScope(scope, `${filenamePrefix}-poincare-dual-aitoff${source === "fullscreen" ? "-fullscreen" : ""}`, format, DUAL_AITOFF_PNG_EXPORT_SCALE);
  }, [filenamePrefix]);

  const radiusTrace = useMemo(() => ({
    type: "scatter" as const,
    mode: "lines+markers" as const,
    x: phaseAxis,
    y: radiusOfCurvature,
    line: { color: themeIsDark ? "#94a3b8" : "#64748b", width: 1.6 },
    marker: {
      size: 5,
      color: markerColors,
      colorscale: RED_TO_RED_COLOR_SCALE as any,
      cmin: startPhase,
      cmax: endPhase,
      showscale: false,
    },
    connectgaps: false,
    hovertemplate: "Phase %{x:.4f}<br>Radius %{y:.4f}<extra></extra>",
    name: "Radius",
    showlegend: false,
  }), [endPhase, markerColors, phaseAxis, radiusOfCurvature, startPhase, themeIsDark]);

  const radiusFullscreenTrace = useMemo(() => ({
    ...radiusTrace,
    marker: {
      ...radiusTrace.marker,
      showscale: true,
      colorbar: {
        title: { text: "Phase", side: "top" as const },
        orientation: "h" as const,
        x: 0.5,
        xanchor: "center" as const,
        y: -0.22,
        yanchor: "top" as const,
        len: 0.52,
        thickness: 18,
        outlinecolor: axisColor,
        outlinewidth: 0.4,
        tickvals: [startPhase, endPhase],
        ticktext: [startPhase.toFixed(3), endPhase.toFixed(3)],
      },
    },
  }), [axisColor, endPhase, radiusTrace, startPhase]);

  const radiusLayout = useMemo(() => lockCartesianInteractions({
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
    margin: { l: 58, r: 24, t: 20, b: 52 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, paperBg, plotBg]);

  const dispatchResize = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - lastResizeTs.current < 16) return;
    lastResizeTs.current = now;
    if (resizeEventRaf.current !== null) return;
    resizeEventRaf.current = requestAnimationFrame(() => {
      splitContainerRef.current?.querySelectorAll<HTMLElement>(".plotly-graph-div").forEach(graphDiv => {
        void Plotly.Plots.resize(graphDiv as any);
      });
      window.dispatchEvent(new Event("resize"));
      resizeEventRaf.current = null;
    });
  }, []);

  const applySplit = useCallback((clientX: number) => {
    const rect = splitContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(74, Math.max(26, next));
    splitRef.current = clamped;
    splitContainerRef.current?.style.setProperty("--plot-split", `${clamped}%`);
    dispatchResize();
  }, [dispatchResize]);

  const startDrag = useCallback((clientX: number) => {
    dragStartX.current = clientX;
    draggedRef.current = false;
    draggingRef.current = true;
    document.body.classList.add("is-resizing-plots");
  }, []);

  const stopDrag = useCallback(() => {
    draggingRef.current = false;
    document.body.classList.remove("is-resizing-plots");
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (dragStartX.current == null) dragStartX.current = e.clientX;
      const delta = Math.abs(e.clientX - dragStartX.current);
      if (!draggedRef.current && delta < 4) return;
      draggedRef.current = true;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        applySplit(e.clientX);
        rafRef.current = null;
      });
    };
    const onUp = () => {
      stopDrag();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (draggedRef.current) {
        setSplit(splitRef.current);
        dispatchResize(true);
      }
      dragStartX.current = null;
      draggedRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("is-resizing-plots");
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (resizeEventRaf.current !== null) cancelAnimationFrame(resizeEventRaf.current);
      resizeEventRaf.current = null;
    };
  }, [applySplit, dispatchResize, stopDrag]);

  const splitMinHeight = radiusOfCurvature.length > 0 ? "980px" : "640px";

  const rightPanelToggleStrip = (
    <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm font-semibold text-foreground">
      {RIGHT_PANEL_SERIES_OPTIONS.map(({ key, label, color }) => (
        <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
          <input type="checkbox" checked={visibleSeries[key]} onChange={() => toggleSeries(key)} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );

  const leftPlot = (
    <div ref={leftAitoffScopeRef} className="plot-export-scope w-full">
      <div className="h-[580px] w-full">
      <div className="flex justify-between items-center mb-2">
        <div className="plot-toolbar">
          <FullscreenIconButton onClick={() => setFullscreen("left")} title="Fullscreen left" />
          <PlotExportButtons
            filename={mode === "aitoff" ? `${filenamePrefix}-poincare-dual-aitoff` : `${filenamePrefix}-poincare-dual-view`}
            onExport={mode === "aitoff" ? format => exportDualAitoff(format) : undefined}
          />
          <div className="plot-panel-title text-foreground">Poincaré Sphere</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => handleModeChange("aitoff")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${mode === "aitoff" ? activeToggleClass : inactiveToggleClass}`}
            >
              Aitoff
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("3d")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${mode === "3d" ? activeToggleClass : inactiveToggleClass}`}
            >
              3D
            </button>
          </div>
        </div>
      </div>
      {mode === "aitoff" ? (
        <DualAitoffProjection
          points={aitoffPoints}
          startPhase={startPhase}
          endPhase={endPhase}
          axisColor={axisColor}
          gridColor={gridColor}
          mutedColor={themeIsDark ? "#f8fbff" : "#1f2937"}
          bgColor={plotBg}
          className="h-[calc(100%-2.5rem)] min-h-[520px] w-full"
        />
      ) : (
        <MemoizedPlot
          key="poincare-3d"
          data={[sphere3d, ...radialPathTraces, points3d]}
          layout={{ ...layout3d, dragmode: "orbit" }}
          config={paperPlotConfig("poincare-dual-view", { interactive: true })}
          useResizeHandler
          style={{ width: "100%", height: "calc(100% - 2.75rem)" }}
        />
      )}
      </div>
      {radiusOfCurvature.length > 0 && (
        <div className="mt-5 h-[320px] w-full">
          <div className="plot-toolbar mb-2">
            <FullscreenIconButton onClick={() => setFullscreen("radius")} title="Fullscreen curvature radius" />
            <PlotExportButtons filename={`${filenamePrefix}-radius-of-curvature`} />
            <div className="plot-panel-title text-foreground">Curvature Radius of Poincaré Sphere Trajectory</div>
          </div>
          <MemoizedPlot
            data={[radiusTrace]}
            layout={radiusLayout}
            config={paperPlotConfig("integrated-radius-of-curvature")}
            useResizeHandler
            style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
          />
        </div>
      )}
    </div>
  );

  const rightPlot = (
    <div className="plot-export-scope flex h-full min-h-0 w-full flex-col" style={{ minHeight: splitMinHeight }}>
      <div className="plot-toolbar mb-2">
        <FullscreenIconButton onClick={() => setFullscreen("right")} title="Fullscreen right" />
        <PlotExportButtons filename={`${filenamePrefix}-stokes-polarisation-parameters`} />
        <div className="plot-panel-title text-foreground">Integrated Stokes and Polarisation Parameters</div>
      </div>
      <div className="min-h-0 flex-1">
        <MemoizedPlot
          key="integrated-stokes-polarisation-parameters"
          data={[...stokesTraces, ...fractionTraces, ...angleTraces]}
          layout={fractionsLayout}
          config={paperPlotConfig("integrated-stokes-polarisation-parameters")}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {rightPanelToggleStrip}
    </div>
  );

  const renderContent = () => (
    <div
      ref={splitContainerRef}
      className="polarimetry-split"
      style={{ "--plot-split": `${split}%`, minHeight: splitMinHeight } as CSSProperties}
    >
      <div className="split-pane split-pane-left">{leftPlot}</div>
      <div
        className="split-resizer"
        onPointerDown={e => startDrag(e.clientX)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize views"
        aria-valuemin={26}
        aria-valuemax={74}
        aria-valuenow={Math.round(splitRef.current)}
      />
      <div className="split-pane split-pane-right">{rightPlot}</div>
    </div>
  );

  const customPlotCard = (
    <div className="w-full scientific-divider pt-8 mt-6">
      <div className="flex justify-between items-center mb-3 gap-3">
        <div className="plot-toolbar flex-1">
          <FullscreenIconButton onClick={() => setFullscreen("custom")} title="Fullscreen custom" />
          <PlotExportButtons filename={`${filenamePrefix}-custom-polarisation-xy`} />
          <div className="plot-panel-title text-foreground">{`${yAxisLabel} vs ${xAxisLabel} Plot`}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <label className="flex flex-col gap-1 text-muted-foreground">
          <span className="form-label text-foreground/80">X axis</span>
          <select
            value={xAxisKey}
            onChange={e => handleXAxisChange(e.target.value as AxisKey)}
            className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {axisOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          <span className="form-label text-foreground/80">Y axis</span>
          <select
            value={yAxisKey}
            onChange={e => handleYAxisChange(e.target.value as AxisKey)}
            className="rounded-md border border-border/60 bg-background/80 px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {axisOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="h-[540px] w-full">
        <CustomXYPlot
          xData={selectedXData}
          yData={selectedYData}
          xLabel={xAxisLabel}
          yLabel={yAxisLabel}
          isDark={themeIsDark}
          axisColor={axisColor}
          gridColor={gridColor}
          paperBg={paperBg}
          plotBg={plotBg}
        />
      </div>
    </div>
  );

  return (
    <>
      {renderContent()}
      <div className="mt-6 w-full">{customPlotCard}</div>
      {fullscreen && (
        <FullscreenOverlay onClose={() => setFullscreen(null)} contentClassName="w-[96vw] max-w-7xl h-[92vh] p-4" title="Polarisation fullscreen">
          <div className="h-full w-full">
            {fullscreen === "left" ? (
              <div ref={fullscreenAitoffScopeRef} className="plot-export-scope h-full w-full pt-8">
                <div className="plot-toolbar mb-2">
                  <PlotExportButtons
                    filename={mode === "aitoff" ? `${filenamePrefix}-poincare-dual-aitoff-fullscreen` : `${filenamePrefix}-poincare-dual-view-fullscreen`}
                    onExport={mode === "aitoff" ? format => exportDualAitoff(format, "fullscreen") : undefined}
                  />
                </div>
                {mode === "aitoff" ? (
                  <DualAitoffProjection
                    points={aitoffPoints}
                    startPhase={startPhase}
                    endPhase={endPhase}
                    axisColor={axisColor}
                    gridColor={gridColor}
                    mutedColor={themeIsDark ? "#f8fbff" : "#1f2937"}
                    bgColor={plotBg}
                    fullscreen
                    className="h-[calc(100%-2.5rem)] w-full"
                  />
                ) : (
                  <MemoizedPlot
                    data={[sphere3d, ...radialPathTraces, points3d]}
                    layout={{ ...layout3d, autosize: true, height: undefined, margin: { l: 0, r: 0, t: 60, b: 40 }, dragmode: "orbit" }}
                    config={paperPlotConfig("poincare-dual-view-fullscreen", { interactive: true })}
                    useResizeHandler
                    style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
                  />
                )}
              </div>
            ) : fullscreen === "right" ? (
              <div className="plot-export-scope flex h-full w-full flex-col pt-8">
                <div className="plot-toolbar mb-2">
                  <PlotExportButtons filename={`${filenamePrefix}-stokes-polarisation-parameters-fullscreen`} />
                </div>
                <div className="min-h-0 flex-1">
                  <MemoizedPlot
                    data={[...stokesTraces, ...fractionTraces, ...angleTraces]}
                    layout={{ ...fractionsLayout, autosize: true, height: undefined, margin: { l: 68, r: 30, t: 36, b: 70 } }}
                    config={paperPlotConfig("integrated-stokes-polarisation-parameters-fullscreen")}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
                {rightPanelToggleStrip}
              </div>
            ) : fullscreen === "radius" ? (
              <div className="plot-export-scope h-full w-full p-4 pt-10">
                <div className="plot-toolbar mb-3">
                  <PlotExportButtons filename={`${filenamePrefix}-radius-of-curvature-fullscreen`} />
                  <div className="plot-panel-title text-foreground">Curvature Radius of Poincaré Sphere Trajectory</div>
                </div>
                <MemoizedPlot
                  data={[radiusFullscreenTrace]}
                  layout={{ ...radiusLayout, autosize: true, height: undefined, margin: { l: 68, r: 36, t: 54, b: 72 } }}
                  config={paperPlotConfig("integrated-radius-of-curvature-fullscreen")}
                  useResizeHandler
                  style={{ width: "100%", height: "calc(100% - 3rem)" }}
                />
              </div>
            ) : (
              <div className="plot-export-scope h-full w-full p-4 pt-10">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="plot-toolbar">
                    <PlotExportButtons filename={`${filenamePrefix}-custom-polarisation-xy-fullscreen`} />
                  </div>
                </div>
                <CustomXYPlot
                  xData={selectedXData}
                  yData={selectedYData}
                  xLabel={xAxisLabel}
                  yLabel={yAxisLabel}
                  isDark={themeIsDark}
                  axisColor={axisColor}
                  gridColor={gridColor}
                  paperBg={paperBg}
                  plotBg={plotBg}
                />
              </div>
            )}
          </div>
        </FullscreenOverlay>
      )}
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders when props don't change
export default memo(PolarisationDualView);

// Cache the sphere surface to avoid recalculation
interface SphereSurface {
  x: number[][];
  y: number[][];
  z: number[][];
}

const sphereCache = new Map<number, SphereSurface>();

function getUnitSphereSurface(steps: number): SphereSurface {
  if (sphereCache.has(steps)) {
    return sphereCache.get(steps)!;
  }
  const phi: number[] = [];
  const theta: number[] = [];
  for (let i = 0; i <= steps; i++) {
    phi.push((Math.PI * i) / steps);
    theta.push((2 * Math.PI * i) / steps);
  }
  const z: number[][] = [];
  const x: number[][] = [];
  const y: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const zRow: number[] = [];
    const xRow: number[] = [];
    const yRow: number[] = [];
    for (let j = 0; j <= steps; j++) {
      xRow.push(Math.sin(phi[i]) * Math.cos(theta[j]));
      yRow.push(Math.sin(phi[i]) * Math.sin(theta[j]));
      zRow.push(Math.cos(phi[i]));
    }
    x.push(xRow);
    y.push(yRow);
    z.push(zRow);
  }
  const result = {
    type: "surface" as const,
    x,
    y,
    z,
    opacity: 0.2,
    showscale: false,
    colorscale: "Greys" as any,
    hoverinfo: "skip" as const,
    showlegend: false,
    name: "Unit Sphere",
  };
  sphereCache.set(steps, result);
  return result;
}

function makeRadialPathTraces(
  xValues: number[],
  yValues: number[],
  zValues: number[],
  pFracValues: number[],
  phaseValues: number[],
  startPhase: number,
  endPhase: number,
) {
  const count = Math.min(xValues.length, yValues.length, zValues.length, pFracValues.length, phaseValues.length);
  const phaseSpan = endPhase - startPhase;
  const traces = [];

  for (let index = 0; index < count; index += 1) {
    const x = xValues[index];
    const y = yValues[index];
    const z = zValues[index];
    const pFrac = pFracValues[index];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(pFrac)) continue;
    const arrowX = pFrac * x;
    const arrowY = pFrac * y;
    const arrowZ = pFrac * z;

    const phase = phaseValues[index] ?? startPhase;
    const normalizedPhase = phaseSpan === 0 ? 0 : (phase - startPhase) / phaseSpan;
    traces.push({
      type: "scatter3d" as const,
      x: [0, arrowX],
      y: [0, arrowY],
      z: [0, arrowZ],
      mode: "lines" as const,
      line: { color: redToRedPhaseColor(normalizedPhase), width: 3 },
      hoverinfo: "skip" as const,
      hovertemplate: undefined,
      showlegend: false,
      name: "Polarisation direction",
    });
  }

  return traces;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function getDualAitoffMetrics(width: number, height: number, fullscreen: boolean) {
  const minSide = Math.min(width, height);
  const labelFontSize = Math.round(clamp(minSide / 36, 14, fullscreen ? 21 : 18));
  const margin = {
    top: Math.round(clamp(labelFontSize * 2.1, 30, 50)),
    right: Math.round(clamp(labelFontSize * 6, 82, Math.max(84, width * 0.16))),
    bottom: Math.round(clamp(labelFontSize * 5.7, 80, 118)),
    left: Math.round(clamp(labelFontSize * 6, 82, Math.max(84, width * 0.16))),
  };

  return {
    margin,
    labelFontSize,
    pointRadius: clamp(minSide / 152, 3.3, fullscreen ? 5.6 : 4.6),
    pointStrokeWidth: clamp(minSide / 1300, 0.45, 0.8),
    axisStrokeWidth: clamp(minSide / 520, 1.2, 1.8),
    axisLineStrokeWidth: clamp(minSide / 660, 1, 1.55),
    gridStrokeWidth: clamp(minSide / 800, 0.8, 1.2),
    tickLength: clamp(minSide / 100, 5, 8),
    tickStrokeWidth: clamp(minSide / 720, 0.9, 1.35),
  };
}

function makeAitoffLineString(value: number, axis: "lat" | "lon") {
  const coordinates: [number, number][] = [];
  for (let step = -90; step <= 90; step += 2) {
    coordinates.push(axis === "lon" ? [value, step] : [step * 2, value]);
  }
  return { type: "LineString", coordinates };
}

function drawDualAitoffColorbar(
  svg: any,
  width: number,
  height: number,
  gradientId: string,
  startPhase: number,
  endPhase: number,
  colorScale: (value: number) => string,
  axisColor: string,
  mutedColor: string,
  labelFontSize: number,
) {
  const colorbarWidth = Math.round(clamp(width * 0.52, 300, 560));
  const colorbarHeight = clamp(height / 62, 12, 18);
  const colorbarX = width / 2 - colorbarWidth / 2;
  const colorbarY = height - labelFontSize * 2.9;
  const min = startPhase === endPhase ? startPhase - 0.5 : startPhase;
  const max = startPhase === endPhase ? endPhase + 0.5 : endPhase;
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("x2", "100%");

  for (let index = 0; index <= 48; index += 1) {
    const value = min + ((max - min) * index) / 48;
    gradient.append("stop").attr("offset", `${(index / 48) * 100}%`).attr("stop-color", colorScale(value));
  }

  svg.append("rect")
    .attr("x", colorbarX)
    .attr("y", colorbarY)
    .attr("width", colorbarWidth)
    .attr("height", colorbarHeight)
    .attr("fill", `url(#${gradientId})`)
    .attr("stroke", axisColor)
    .attr("stroke-width", 0.4);

  svg.append("text")
    .attr("x", colorbarX)
    .attr("y", colorbarY + labelFontSize * 2.05)
    .attr("text-anchor", "start")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text(startPhase.toFixed(3));

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth / 2)
    .attr("y", colorbarY - labelFontSize * 0.7)
    .attr("text-anchor", "middle")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text("Phase");

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth)
    .attr("y", colorbarY + labelFontSize * 2.05)
    .attr("text-anchor", "end")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text(endPhase.toFixed(3));
}
