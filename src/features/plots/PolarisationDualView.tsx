import { useMemo, useState, useEffect, useCallback, useRef, memo, useTransition, useId, type CSSProperties } from "react";
import Plot from "react-plotly.js";
import { geoGraticule, geoPath, scaleLinear, select } from "d3";
import { geoAitoff } from "d3-geo-projection";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { Button } from "@/components/ui/button";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig, type PlotExportFormat } from "@/shared/plot/plotlyConfig";
import { PLOT_AXIS_TITLE_SIZE, PLOT_TICK_FONT_SIZE, plotAxisText, plotFont } from "@/shared/plot/plotTypography";
import { downloadSvgFromScope } from "@/shared/plot/svgExport";
import { useElementSize } from "@/shared/plot/useElementSize";

// Memoized Plot component to prevent unnecessary re-renders
const MemoizedPlot = memo(Plot);

// Separate memoized component for custom XY plot
interface CustomXYPlotProps {
  xData: number[];
  yData: number[];
  xLabel: string;
  yLabel: string;
  viewMode: LinearViewMode;
  isDark: boolean;
  axisColor: string;
  gridColor: string;
  paperBg: string;
  plotBg: string;
}

type LinearViewMode = "plot" | "table";

type LinearDataRow = {
  index: number;
  x: number;
  y: number;
};

type FractionSeriesKey = "p_frac" | "l_frac" | "v_frac" | "absv_frac" | "PA" | "EA";

function isPlotTrace<T>(value: T | null): value is T {
  return value !== null;
}

const CustomXYPlot = memo(function CustomXYPlot({
  xData,
  yData,
  xLabel,
  yLabel,
  viewMode,
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

  if (viewMode === "table") {
    return (
      <div className="h-full w-full overflow-hidden rounded-md border border-border/60 bg-transparent">
        <div className="max-h-full overflow-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-transparent backdrop-blur-sm">
              <tr className="border-b border-border/70 text-left">
                <th className="px-3 py-2 font-semibold text-muted-foreground">#</th>
                <th className="px-3 py-2 font-semibold text-foreground">{xLabel}</th>
                <th className="px-3 py-2 font-semibold text-foreground">{yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.index}-${row.x}-${row.y}`} className="border-b border-border/40">
                  <td className="px-3 py-2 text-muted-foreground">{row.index + 1}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{row.x.toFixed(6)}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{row.y.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      .domain([min, min + (max - min) / 6, min + (2 * (max - min)) / 6, min + (3 * (max - min)) / 6, min + (4 * (max - min)) / 6, min + (5 * (max - min)) / 6, max])
      .range(["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"]);
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
      .text((point: DualAitoffPoint) => `Lon: ${point.lon.toFixed(2)} deg\nLat: ${point.lat.toFixed(2)} deg\nPhase: ${point.phase.toFixed(4)}`);

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
      .text((lat: number) => `${lat} deg`);

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
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", Math.max(4, labelFontSize * 0.42))
      .text((lon: number) => `${lon} deg`);

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - labelFontSize * 0.15)
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
}

function PolarisationDualView({ phaseAxis, data, isDark, startPhase = 0, endPhase = 1 }: PolarisationDualViewProps) {
  const [mode, setMode] = useState<"aitoff" | "3d">("aitoff");
  const [split, setSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState<null | "left" | "right" | "custom">(null);
  const [customXYViewMode, setCustomXYViewMode] = useState<LinearViewMode>("plot");
  const [visibleSeries, setVisibleSeries] = useState<Record<FractionSeriesKey, boolean>>({
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

  const markerColors = useMemo(() => {
    const n = data.x?.length ?? 0;
    if (n === 0) return [] as number[];
    if (n === 1) return [startPhase];
    const phaseRange = endPhase - startPhase;
    return Array.from({ length: n }, (_, i) => startPhase + (i / (n - 1)) * phaseRange);
  }, [data.x?.length, startPhase, endPhase]);

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
    x: data.x,
    y: data.y,
    z: data.z,
    mode: "markers" as const,
    marker: {
      size: 4,
      color: markerColors,
      colorscale: [
        [0, "#ff0000"],
        [1 / 6, "#ffff00"],
        [2 / 6, "#00ff00"],
        [3 / 6, "#00ffff"],
        [4 / 6, "#0000ff"],
        [5 / 6, "#ff00ff"],
        [1, "#ff0000"],
      ],
      cmin: startPhase,
      cmax: endPhase,
      showscale: true,
      colorbar: {
        title: { text: "Phase" },
        orientation: "h" as const,
        y: -0.2,
        x: 0.5,
        len: 0.6,
        tickvals: [startPhase, endPhase],
        ticktext: [startPhase.toFixed(2), endPhase.toFixed(2)],
      },
    },
    hovertemplate: "Q %{x:.2f}<br>U %{y:.2f}<br>V %{z:.2f}<extra></extra>",
    name: "Poincare points",
  }), [data.x, data.y, data.z, startPhase, endPhase, markerColors]);

  const layout3d = useMemo(() => ({
    title: undefined,
    dragmode: "orbit" as const,
    scene: {
      xaxis: { title: { text: "Q", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      yaxis: { title: { text: "U", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      zaxis: { title: { text: "V", font: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE } }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, showline: true, showbackground: true, backgroundcolor: themeIsDark ? "#080808" : "#f7fafc" },
      aspectmode: "cube" as const,
      bgcolor: plotBg,
    },
    margin: { l: 0, r: 0, t: 50, b: 50 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
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

  const fractionTraces = useMemo(() => ([
    visibleSeries.p_frac ? { x: phaseAxis, y: data.p_frac, type: "scatter" as const, mode: "markers" as const, name: "P/I", line: { color: "#0ea5e9" } } : null,
    visibleSeries.l_frac ? { x: phaseAxis, y: data.l_frac, type: "scatter" as const, mode: "markers" as const, name: "L/I", line: { color: "#22c55e" } } : null,
    visibleSeries.v_frac ? { x: phaseAxis, y: data.v_frac, type: "scatter" as const, mode: "markers" as const, name: "V/I", line: { color: "#f97316" } } : null,
    visibleSeries.absv_frac ? { x: phaseAxis, y: data.absv_frac, type: "scatter" as const, mode: "markers" as const, name: "|V/I|", line: { color: "#a855f7", dash: "dash" as const } } : null,
  ].filter(isPlotTrace)), [data.absv_frac, data.l_frac, data.p_frac, data.v_frac, phaseAxis, visibleSeries]);

  const angleTraces = useMemo(() => ([
    visibleSeries.PA ? { x: phaseAxis, y: data.PA, type: "scatter" as const, mode: "markers" as const, name: "PA (deg)", line: { color: "#2563eb" }, xaxis: "x2", yaxis: "y2" } : null,
    visibleSeries.EA ? { x: phaseAxis, y: data.EA, type: "scatter" as const, mode: "markers" as const, name: "EA (deg)", line: { color: "#dc2626" }, xaxis: "x2", yaxis: "y2" } : null,
  ].filter(isPlotTrace)), [data.EA, data.PA, phaseAxis, visibleSeries]);

  const absPA = useMemo(() => (data.PA ?? []).map(v => Math.abs(v)), [data.PA]);
  const absEA = useMemo(() => (data.EA ?? []).map(v => Math.abs(v)), [data.EA]);

  type AxisKey = "phase" | "p_frac" | "l_frac" | "v_frac" | "absv_frac" | "PA" | "EA" | "absPA" | "absEA";

  const axisOptions = useMemo(() => {
    return [
      { key: "phase" as AxisKey, label: "Phase", values: phaseAxis ?? [] },
      { key: "p_frac" as AxisKey, label: "P/I", values: data.p_frac ?? [] },
      { key: "l_frac" as AxisKey, label: "L/I", values: data.l_frac ?? [] },
      { key: "v_frac" as AxisKey, label: "V/I", values: data.v_frac ?? [] },
      { key: "absv_frac" as AxisKey, label: "|V/I|", values: data.absv_frac ?? [] },
      { key: "PA" as AxisKey, label: "PA (deg)", values: data.PA ?? [] },
      { key: "EA" as AxisKey, label: "EA (deg)", values: data.EA ?? [] },
      { key: "absPA" as AxisKey, label: "|PA| (deg)", values: absPA },
      { key: "absEA" as AxisKey, label: "|EA| (deg)", values: absEA },
    ];
  }, [absEA, absPA, data.EA, data.PA, data.absv_frac, data.l_frac, data.p_frac, data.v_frac, phaseAxis]);

  const axisMap = useMemo(() => {
    const map: Record<AxisKey, number[]> = {
      phase: [],
      p_frac: [],
      l_frac: [],
      v_frac: [],
      absv_frac: [],
      PA: [],
      EA: [],
      absPA: [],
      absEA: [],
    };
    // Build map once, filter finite values
    axisOptions.forEach(opt => {
      const values = opt.values;
      if (Array.isArray(values) && values.length > 0) {
        map[opt.key] = values.filter(v => Number.isFinite(v));
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

  const customXYRows = useMemo(() => {
    const count = Math.min(selectedXData.length, selectedYData.length);
    const next: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const x = selectedXData[index];
      const y = selectedYData[index];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      next.push({ x, y });
    }
    return next;
  }, [selectedXData, selectedYData]);

  const exportCustomXYCsv = useCallback(() => {
    if (!customXYRows.length) return;
    const escapeCsv = (value: string) => {
      const normalized = value.replace(/"/g, "\"\"");
      return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
    };
    const lines = [
      `${escapeCsv(xAxisLabel)},${escapeCsv(yAxisLabel)}`,
      ...customXYRows.map(row => `${row.x},${row.y}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const href = URL.createObjectURL(blob);
    const filename = `${xAxisLabel}-vs-${yAxisLabel}`.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "custom-polarisation-xy";
    link.href = href;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
  }, [customXYRows, xAxisLabel, yAxisLabel]);

  const fractionsLayout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    grid: { rows: 2, columns: 1, pattern: "independent" as const },
    xaxis: {
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
    },
    yaxis: {
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
    },
    xaxis2: {
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
    },
    yaxis2: {
      title: { text: "Value", standoff: 10 },
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 50, r: 20, t: 50, b: 70 },
    showlegend: false,
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    height: undefined,
  }), [axisColor, gridColor, paperBg, plotBg]);

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

  const toggleSeries = useCallback((key: FractionSeriesKey) => {
    setVisibleSeries(current => ({ ...current, [key]: !current[key] }));
  }, []);

  const exportDualAitoff = useCallback((format: PlotExportFormat, source: "inline" | "fullscreen" = "inline") => {
    const scope = source === "fullscreen" ? fullscreenAitoffScopeRef.current : leftAitoffScopeRef.current;
    downloadSvgFromScope(scope, `poincare-dual-aitoff${source === "fullscreen" ? "-fullscreen" : ""}`, format, DUAL_AITOFF_PNG_EXPORT_SCALE);
  }, []);

  const dispatchResize = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - lastResizeTs.current < 48) return;
    lastResizeTs.current = now;
    if (resizeEventRaf.current !== null) return;
    resizeEventRaf.current = requestAnimationFrame(() => {
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

  const leftPlot = (
    <div ref={leftAitoffScopeRef} className="plot-export-scope h-[580px] w-full">
      <div className="flex justify-between items-center mb-2">
        <div className="plot-toolbar">
          <FullscreenIconButton onClick={() => setFullscreen("left")} title="Fullscreen left" />
          <PlotExportButtons
            filename={mode === "aitoff" ? "poincare-dual-aitoff" : "poincare-dual-view"}
            onExport={mode === "aitoff" ? format => exportDualAitoff(format) : undefined}
          />
          <div className="plot-panel-title text-foreground">Poincare View</div>
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
          data={[sphere3d, points3d]}
          layout={{ ...layout3d, dragmode: "orbit" }}
          config={paperPlotConfig("poincare-dual-view", { interactive: true })}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );

  const rightPlot = (
    <div className="plot-export-scope h-[580px] w-full">
      <div className="plot-toolbar mb-2">
        <FullscreenIconButton onClick={() => setFullscreen("right")} title="Fullscreen right" />
        <PlotExportButtons filename="polarisation-fractions-angles" />
        <div className="plot-panel-title text-foreground">Polarization Fractions and Angles</div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm font-semibold text-foreground">
        {[
          ["p_frac", "P/I"],
          ["l_frac", "L/I"],
          ["v_frac", "V/I"],
          ["absv_frac", "|V/I|"],
          ["PA", "PA"],
          ["EA", "EA"],
        ].map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
            <input type="checkbox" checked={visibleSeries[key as FractionSeriesKey]} onChange={() => toggleSeries(key as FractionSeriesKey)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <MemoizedPlot
        key={`fractions`}
        data={[...fractionTraces, ...angleTraces]}
        layout={fractionsLayout}
        config={paperPlotConfig("polarisation-fractions-angles")}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );

  const renderContent = () => (
    <div
      ref={splitContainerRef}
      className="polarimetry-split"
      style={{ "--plot-split": `${split}%`, minHeight: "640px" } as CSSProperties}
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
          {customXYViewMode === "plot" ? (
            <PlotExportButtons filename="custom-polarisation-xy" />
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={exportCustomXYCsv} disabled={!customXYRows.length}>
              Export CSV
            </Button>
          )}
          <div className="plot-panel-title text-foreground">{`${yAxisLabel} vs ${xAxisLabel} Plot`}</div>
        </div>
        <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setCustomXYViewMode("plot")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${customXYViewMode === "plot" ? activeToggleClass : inactiveToggleClass}`}
          >
            Plot
          </button>
          <button
            type="button"
            onClick={() => setCustomXYViewMode("table")}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${customXYViewMode === "table" ? activeToggleClass : inactiveToggleClass}`}
          >
            Table
          </button>
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
          viewMode={customXYViewMode}
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
                    filename={mode === "aitoff" ? "poincare-dual-aitoff-fullscreen" : "poincare-dual-view-fullscreen"}
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
                    data={[sphere3d, points3d]}
                    layout={{ ...layout3d, autosize: true, height: undefined, margin: { l: 0, r: 0, t: 60, b: 40 }, dragmode: "orbit" }}
                    config={paperPlotConfig("poincare-dual-view-fullscreen", { interactive: true })}
                    useResizeHandler
                    style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
                  />
                )}
              </div>
            ) : fullscreen === "right" ? (
              <div className="plot-export-scope h-full w-full pt-8">
                <div className="plot-toolbar mb-2">
                  <PlotExportButtons filename="polarisation-fractions-angles-fullscreen" />
                </div>
                <MemoizedPlot
                  data={[...fractionTraces, ...angleTraces]}
                  layout={{ ...fractionsLayout, autosize: true, height: undefined, margin: { l: 60, r: 30, t: 60, b: 80 } }}
                  config={paperPlotConfig("polarisation-fractions-angles-fullscreen")}
                  useResizeHandler
                  style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
                />
              </div>
            ) : (
              <div className="plot-export-scope h-full w-full p-4 pt-10">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="plot-toolbar">
                    {customXYViewMode === "plot" ? (
                      <PlotExportButtons filename="custom-polarisation-xy-fullscreen" />
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={exportCustomXYCsv} disabled={!customXYRows.length}>
                        Export CSV
                      </Button>
                    )}
                  </div>
                  <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCustomXYViewMode("plot")}
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${customXYViewMode === "plot" ? activeToggleClass : inactiveToggleClass}`}
                    >
                      Plot
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomXYViewMode("table")}
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${customXYViewMode === "table" ? activeToggleClass : inactiveToggleClass}`}
                    >
                      Table
                    </button>
                  </div>
                </div>
                <CustomXYPlot
                  xData={selectedXData}
                  yData={selectedYData}
                  xLabel={xAxisLabel}
                  yLabel={yAxisLabel}
                  viewMode={customXYViewMode}
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
    opacity: 0.28,
    showscale: false,
    colorscale: [[0, "#25354d"], [1, "#25354d"]] as any,
    hoverinfo: "skip" as const,
    showlegend: false,
    name: "Unit Sphere",
  };
  sphereCache.set(steps, result);
  return result;
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
  const colorbarWidth = Math.round(clamp(width * 0.34, 210, 380));
  const colorbarHeight = clamp(height / 72, 10, 15);
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
