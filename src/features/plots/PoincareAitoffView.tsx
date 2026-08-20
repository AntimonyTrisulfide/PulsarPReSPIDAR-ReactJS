import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { geoGraticule, geoPath, select } from "d3";
import { geoAitoff } from "d3-geo-projection";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { HSV_COLOR_SCALE } from "@/shared/plot/colorScales";
import { perceptualRainbowPhaseColor } from "@/shared/plot/phaseColorScale";
import { lockCartesianInteractions, paperPlotConfig, type PlotExportFormat } from "@/shared/plot/plotlyConfig";
import { PLOT_AXIS_TITLE_SIZE, PLOT_TICK_FONT_SIZE, plotAxisText, plotFont } from "@/shared/plot/plotTypography";
import { downloadSvgElement } from "@/shared/plot/svgExport";
import { useElementSize } from "@/shared/plot/useElementSize";
import CustomParameterPlot, { type CustomAxisOption } from "./CustomParameterPlot";

type AitoffData = {
  lon: number[];
  lat: number[];
  pulse_number?: number[];
  I?: Array<number | null>;
  Q?: Array<number | null>;
  U?: Array<number | null>;
  V?: Array<number | null>;
  PA?: Array<number | null>;
  EA?: Array<number | null>;
  p_frac?: Array<number | null>;
  l_frac?: Array<number | null>;
  v_frac?: Array<number | null>;
  absv_frac?: Array<number | null>;
};

interface PoincareAitoffViewProps {
  data: AitoffData | null;
  phaseValue?: number;
  isDark?: boolean;
  filenamePrefix?: string;
}

type AitoffPoint = {
  lon: number;
  lat: number;
  pulseNumber: number;
};

const latLabelValues = [-60, -30, 0, 30, 60];
const lonLabelValues = [-135, -90, -45, 0, 45, 90, 135];
const AITOFF_PNG_EXPORT_SCALE = 4;
type FixedPhaseStokesKey = "I" | "Q" | "U" | "V";
type FixedPhaseSeriesKey = FixedPhaseStokesKey | "p_frac" | "l_frac" | "v_frac" | "absv_frac" | "PA" | "EA";
const FIXED_PHASE_SERIES_OPTIONS: Array<{ key: FixedPhaseSeriesKey; label: string; color: string; dash?: "dash" }> = [
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
const fixedPhaseColor = (key: FixedPhaseSeriesKey) => FIXED_PHASE_SERIES_OPTIONS.find(option => option.key === key)?.color ?? "#64748b";

export default function PoincareAitoffView({ data, phaseValue, isDark, filenamePrefix = "observation" }: PoincareAitoffViewProps) {
  void phaseValue;
  const [fullscreenKey, setFullscreenKey] = useState<"aitoff" | "3d" | "right" | null>(null);
  const [view, setView] = useState<"aitoff" | "3d">("aitoff");
  const [visibleSeries, setVisibleSeries] = useState<Record<FixedPhaseSeriesKey, boolean>>({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const gradientId = `aitoff-colorbar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const inlineAitoffSize = useElementSize(containerRef, { width: 1080, height: 620 }, { width: 420, height: 360 });
  const fullscreenAitoffSize = useElementSize(fullscreenRef, { width: 1320, height: 760 }, { width: 520, height: 420 });

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#f8fbff" : "#111827";
  const gridColor = themeIsDark ? "#dce7f7" : "#334155";
  const bgColor = themeIsDark ? "#080808" : "#f7fafc";
  const mutedColor = themeIsDark ? "#f8fbff" : "#1f2937";
  const surfaceColor = themeIsDark ? "#2a2a2a" : "#dde7ef";

  const points = useMemo<AitoffPoint[]>(() => {
    if (!data) return [];

    const count = Math.min(data.lon?.length ?? 0, data.lat?.length ?? 0);
    const next: AitoffPoint[] = [];
    for (let index = 0; index < count; index += 1) {
      const lon = normalizeLongitude(toDegrees(data.lon[index]));
      const lat = clamp(toDegrees(data.lat[index]), -90, 90);
      const pulseNumber = Number(data.pulse_number?.[index] ?? index);
      if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(pulseNumber)) {
        next.push({ lon, lat, pulseNumber });
      }
    }
    return next;
  }, [data]);

  const colorDomain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    const pulseNumbers = points.map(point => point.pulseNumber);
    return [Math.min(...pulseNumbers), Math.max(...pulseNumbers)];
  }, [points]);

  const colorScale = useMemo(() => {
    const [minPulse, maxPulse] = colorDomain;
    const span = maxPulse - minPulse;
    return (pulseNumber: number) => {
      const t = span > 0 ? (pulseNumber - minPulse) / span : 0.5;
      return perceptualRainbowPhaseColor(((t % 1) + 1) % 1);
    };
  }, [colorDomain]);

  const xyz = useMemo(() => {
    const lonRad = points.map(point => toRadians(point.lon));
    const latRad = points.map(point => toRadians(point.lat));
    return {
      x: lonRad.map((lon, index) => Math.cos(latRad[index]) * Math.cos(lon)),
      y: lonRad.map((lon, index) => Math.cos(latRad[index]) * Math.sin(lon)),
      z: latRad.map(lat => Math.sin(lat)),
    };
  }, [points]);

  const sphere3d = useMemo(() => ({
    type: "surface" as const,
    ...getUnitSphereSurface(32),
    opacity: 0.32,
    colorscale: [[0, surfaceColor], [1, surfaceColor]] as any,
    showscale: false,
    hoverinfo: "skip" as const,
    name: "Unit sphere",
  }) as any, [surfaceColor]);

  const points3d = useMemo(() => ({
    type: "scatter3d" as const,
    x: xyz.x,
    y: xyz.y,
    z: xyz.z,
    mode: "markers" as const,
    marker: {
      size: 3.5,
      color: points.map(point => point.pulseNumber),
      colorscale: HSV_COLOR_SCALE,
      cmin: colorDomain[0],
      cmax: colorDomain[1],
      opacity: 0.9,
      showscale: true,
      colorbar: {
        title: { text: "Pulse Index" },
        orientation: "h" as const,
        x: 0.5,
        y: -0.16,
        len: 0.62,
      },
    },
    hovertemplate: "Q %{x:.3f}<br>U %{y:.3f}<br>V %{z:.3f}<br>Pulse index %{marker.color}<extra></extra>",
    name: "Poincare points",
  }), [colorDomain, points, xyz]);

  const layout3d = useMemo(() => ({
    title: undefined,
    dragmode: "orbit" as const,
    scene: {
      xaxis: makeSceneAxis("Q", axisColor, gridColor),
      yaxis: makeSceneAxis("U", axisColor, gridColor),
      zaxis: makeSceneAxis("V", axisColor, gridColor),
      aspectmode: "cube" as const,
      camera: { eye: { x: 1.45, y: 1.45, z: 1.05 } },
      bgcolor: bgColor,
    },
    margin: { l: 0, r: 0, t: 20, b: 42 },
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: plotFont(axisColor),
  }), [axisColor, bgColor, gridColor]);

  const pulseIndex = useMemo(() => points.map(point => point.pulseNumber), [points]);
  const pulseRange = useMemo<[number, number]>(() => {
    if (!pulseIndex.length) return [0, 1];
    const minPulse = Math.min(...pulseIndex);
    const maxPulse = Math.max(...pulseIndex);
    return minPulse === maxPulse ? [minPulse - 0.5, maxPulse + 0.5] : [minPulse, maxPulse];
  }, [pulseIndex]);

  const stokesTraces = useMemo(() => ([
    visibleSeries.I ? makeFixedPhaseSeriesTrace(pulseIndex, data?.I ?? [], "I", fixedPhaseColor("I"), "lines", undefined) : null,
    visibleSeries.Q ? makeFixedPhaseSeriesTrace(pulseIndex, data?.Q ?? [], "Q", fixedPhaseColor("Q"), "lines", undefined) : null,
    visibleSeries.U ? makeFixedPhaseSeriesTrace(pulseIndex, data?.U ?? [], "U", fixedPhaseColor("U"), "lines", undefined) : null,
    visibleSeries.V ? makeFixedPhaseSeriesTrace(pulseIndex, data?.V ?? [], "V", fixedPhaseColor("V"), "lines", undefined) : null,
  ].filter(isPlotTrace)), [data?.I, data?.Q, data?.U, data?.V, pulseIndex, visibleSeries]);

  const fractionTraces = useMemo(() => ([
    visibleSeries.p_frac ? makeFixedPhaseSeriesTrace(pulseIndex, data?.p_frac ?? [], "P/I", fixedPhaseColor("p_frac"), "markers", { xaxis: "x2", yaxis: "y2" }) : null,
    visibleSeries.l_frac ? makeFixedPhaseSeriesTrace(pulseIndex, data?.l_frac ?? [], "L/I", fixedPhaseColor("l_frac"), "markers", { xaxis: "x2", yaxis: "y2" }) : null,
    visibleSeries.v_frac ? makeFixedPhaseSeriesTrace(pulseIndex, data?.v_frac ?? [], "V/I", fixedPhaseColor("v_frac"), "markers", { xaxis: "x2", yaxis: "y2" }) : null,
    visibleSeries.absv_frac ? makeFixedPhaseSeriesTrace(pulseIndex, data?.absv_frac ?? [], "|V/I|", fixedPhaseColor("absv_frac"), "markers", { xaxis: "x2", yaxis: "y2", dash: "dash" }) : null,
  ].filter(isPlotTrace)), [data?.absv_frac, data?.l_frac, data?.p_frac, data?.v_frac, pulseIndex, visibleSeries]);

  const angleTraces = useMemo(() => ([
    visibleSeries.PA ? makeFixedPhaseSeriesTrace(pulseIndex, data?.PA ?? [], "PA", fixedPhaseColor("PA"), "markers", { xaxis: "x3", yaxis: "y3" }) : null,
    visibleSeries.EA ? makeFixedPhaseSeriesTrace(pulseIndex, data?.EA ?? [], "EA", fixedPhaseColor("EA"), "markers", { xaxis: "x3", yaxis: "y3" }) : null,
  ].filter(isPlotTrace)), [data?.EA, data?.PA, pulseIndex, visibleSeries]);

  const quantityLayout = useMemo(() => lockCartesianInteractions({
    title: undefined,
    xaxis: {
      title: undefined,
      showticklabels: false,
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      anchor: "y" as const,
      domain: [0, 1],
      range: pulseRange,
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
      showticklabels: false,
      gridcolor: gridColor,
      ...plotAxisText(axisColor),
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
      anchor: "y2" as const,
      domain: [0, 1],
      range: pulseRange,
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
      title: { text: "Pulse Index", standoff: 8 },
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
      range: pulseRange,
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
    margin: { l: 58, r: 20, t: 28, b: 52 },
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, bgColor, gridColor, pulseRange]);

  const customAxisOptions = useMemo<CustomAxisOption[]>(() => {
    return [
      { key: "pulse", label: "Pulse Index", values: pulseIndex },
      { key: "PA", label: "PA (deg)", values: data?.PA ?? [] },
      { key: "EA", label: "EA (deg)", values: data?.EA ?? [] },
      { key: "p_frac", label: "P/I", values: data?.p_frac ?? [] },
      { key: "l_frac", label: "L/I", values: data?.l_frac ?? [] },
      { key: "v_frac", label: "V/I", values: data?.v_frac ?? [] },
      { key: "absv_frac", label: "|V/I|", values: data?.absv_frac ?? [] },
    ];
  }, [data, pulseIndex]);

  const drawAitoff = useCallback((target: HTMLDivElement, size: { width: number; height: number }, isFullscreen = false) => {
    const width = Math.max(420, Math.round(size.width));
    const height = Math.max(360, Math.round(size.height));
    const metrics = getAitoffMetrics(width, height, isFullscreen);
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

    [makeLineString(0, "lon"), makeLineString(0, "lat")].forEach(line => {
      g.append("path")
        .datum(line)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", mutedColor)
        .attr("stroke-width", metrics.axisLineStrokeWidth)
        .attr("stroke-opacity", 0.8);
    });

    g.selectAll(".aitoff-point")
      .data(points)
      .enter()
      .append("circle")
      .attr("class", "aitoff-point")
      .attr("cx", (point: AitoffPoint) => projection([point.lon, point.lat])?.[0] ?? 0)
      .attr("cy", (point: AitoffPoint) => projection([point.lon, point.lat])?.[1] ?? 0)
      .attr("r", pointRadius)
      .attr("fill", (point: AitoffPoint) => colorScale(point.pulseNumber))
      .attr("opacity", 0.86)
      .attr("stroke", "none")
      .attr("stroke-width", 0);

    g.selectAll(".aitoff-lat-label")
      .data(latLabelValues)
      .enter()
      .append("text")
      .attr("class", "aitoff-lat-label")
      .attr("x", (lat: number) => (projection([-178, lat])?.[0] ?? 0) - labelFontSize * 0.9)
      .attr("y", (lat: number) => projection([-178, lat])?.[1] ?? 0)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", labelFontSize)
      .attr("fill", mutedColor)
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .text((lat: number) => `${lat}°`);

    g.selectAll(".aitoff-lon-tick")
      .data(lonLabelValues)
      .enter()
      .append("line")
      .attr("class", "aitoff-lon-tick")
      .attr("x1", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y1", (lon: number) => (projection([lon, 0])?.[1] ?? 0) - tickLength)
      .attr("x2", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y2", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + tickLength)
      .attr("stroke", mutedColor)
      .attr("stroke-width", metrics.tickStrokeWidth)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.86);

    g.selectAll(".aitoff-lon-label")
      .data(lonLabelValues)
      .enter()
      .append("text")
      .attr("class", "aitoff-lon-label")
      .attr("x", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + labelFontSize * 1.5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("font-size", labelFontSize)
      .attr("fill", mutedColor)
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .text((lon: number) => `${lon}°`);

    const longitudeLabelY = margin.top + innerHeight + labelFontSize * 1.25;

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", longitudeLabelY)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(12, labelFontSize - 1))
      .attr("font-weight", 700)
      .attr("fill", axisColor)
      .text("Longitude (2PA)");

    svg.append("text")
      .attr("transform", `translate(${Math.max(16, margin.left - labelFontSize * 3)}, ${margin.top + innerHeight / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(12, labelFontSize - 1))
      .attr("font-weight", 700)
      .attr("fill", axisColor)
      .text("Latitude (2EA)");

    drawColorbar(svg, width, gradientId, colorDomain, colorScale, axisColor, mutedColor, labelFontSize, longitudeLabelY);
  }, [axisColor, bgColor, colorDomain, colorScale, gradientId, gridColor, mutedColor, points]);

  useEffect(() => {
    if (view === "aitoff" && containerRef.current) {
      drawAitoff(containerRef.current, inlineAitoffSize);
    }
  }, [drawAitoff, inlineAitoffSize, view]);

  useEffect(() => {
    if (fullscreenKey === "aitoff" && fullscreenRef.current) {
      drawAitoff(fullscreenRef.current, fullscreenAitoffSize, true);
    }
  }, [drawAitoff, fullscreenAitoffSize, fullscreenKey]);

  const exportAitoff = (format: PlotExportFormat, source: "inline" | "fullscreen" = "inline") => {
    const sourceRef = source === "fullscreen" ? fullscreenRef : containerRef;
    const svg = sourceRef.current?.querySelector("svg");
    const filename = `${filenamePrefix}-fixed-phase-poincare-aitoff`;
    downloadSvgElement(svg ?? null, filename, format, AITOFF_PNG_EXPORT_SCALE);
  };

  if (!data) return null;

  const activeToggleClass = themeIsDark ? "bg-slate-200 text-slate-950" : "bg-slate-900 text-white";
  const inactiveToggleClass = themeIsDark ? "text-slate-200 hover:bg-white/5" : "text-slate-800 hover:bg-slate-100";
  const toggleSeries = (key: FixedPhaseSeriesKey) => {
    setVisibleSeries(current => ({ ...current, [key]: !current[key] }));
  };
  const rightPanelToggleStrip = (
    <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm font-semibold text-foreground">
      {FIXED_PHASE_SERIES_OPTIONS.map(({ key, label, color }) => (
        <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
          <input type="checkbox" checked={visibleSeries[key]} onChange={() => toggleSeries(key)} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
  const rightPanelPlot = (
    <>
      <div className="plot-toolbar subpulse-quantity-toolbar mb-2 gap-2">
        <FullscreenIconButton onClick={() => setFullscreenKey("right")} title="Fullscreen right" />
        <PlotExportButtons filename={`${filenamePrefix}-stokes-polarisation-parameters`} />
        <div className="plot-panel-title text-foreground">Stokes and Polarisation Parameters Across Pulses</div>
      </div>
      <div className="fixed-phase-quantity-plot">
        <Plot
          data={[...stokesTraces, ...fractionTraces, ...angleTraces]}
          layout={quantityLayout}
          config={paperPlotConfig("fixed-phase-stokes-polarisation-parameters")}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {rightPanelToggleStrip}
    </>
  );

  return (
    <>
      <div className="fixed-phase-split">
        <div className="fixed-phase-panel plot-export-scope">
          <div className="mb-2 flex flex-wrap items-start gap-3">
            <div className="plot-toolbar">
              <FullscreenIconButton onClick={() => setFullscreenKey(view)} title="Fullscreen" />
              <PlotExportButtons
                filename={view === "aitoff" ? `${filenamePrefix}-fixed-phase-poincare-aitoff` : `${filenamePrefix}-fixed-phase-poincare-sphere`}
                onExport={view === "aitoff" ? format => exportAitoff(format) : undefined}
              />
              <div className="plot-panel-title text-foreground">Poincaré Sphere</div>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setView("aitoff")}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${view === "aitoff" ? activeToggleClass : inactiveToggleClass}`}
                >
                  Aitoff
                </button>
                <button
                  type="button"
                  onClick={() => setView("3d")}
                  className={`px-3 py-1 text-xs font-semibold transition-colors ${view === "3d" ? activeToggleClass : inactiveToggleClass}`}
                >
                  3D
                </button>
              </div>
            </div>
          </div>

          {view === "aitoff" ? (
            <div ref={containerRef} className="aitoff-plot-frame h-[620px] min-h-[420px] w-full overflow-hidden rounded-md" />
          ) : (
            <Plot
              data={[sphere3d, points3d]}
              layout={layout3d as any}
              config={paperPlotConfig("fixed-phase-poincare-sphere", { interactive: true })}
              useResizeHandler
              style={{ width: "100%", height: "620px" }}
            />
          )}
        </div>

        <div className="fixed-phase-panel fixed-phase-quantity-panel plot-export-scope">
          {rightPanelPlot}
        </div>
      </div>

      <div className="w-full mt-6">
        <CustomParameterPlot
          axisOptions={customAxisOptions}
          defaultXKey="pulse"
          defaultYKey="p_frac"
          isDark={isDark}
          filenamePrefix={filenamePrefix}
        />
      </div>

      {fullscreenKey && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="h-[92vh] w-[96vw] max-w-7xl p-4" title="Fixed-phase Poincare fullscreen">
          {fullscreenKey === "aitoff" ? (
            <div className="h-full w-full pr-8 pt-4">
              <div className="plot-toolbar mb-2">
                <PlotExportButtons filename={`${filenamePrefix}-fixed-phase-poincare-aitoff-fullscreen`} onExport={format => exportAitoff(format, "fullscreen")} />
              </div>
              <div ref={fullscreenRef} className="h-[calc(100%-2.5rem)] w-full overflow-hidden rounded-md" />
            </div>
          ) : fullscreenKey === "right" ? (
            <div className="fixed-phase-quantity-panel plot-export-scope h-full w-full pr-8 pt-8">
              {rightPanelPlot}
            </div>
          ) : (
            <div className="plot-export-scope h-full w-full pr-8 pt-8">
              <div className="plot-toolbar mb-2">
                <PlotExportButtons filename={`${filenamePrefix}-fixed-phase-poincare-sphere-fullscreen`} />
              </div>
              <Plot
                data={[sphere3d, points3d]}
                layout={{ ...(layout3d as any), autosize: true, height: undefined }}
                config={paperPlotConfig("fixed-phase-poincare-sphere-fullscreen", { interactive: true })}
                useResizeHandler
                style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
              />
            </div>
          )}
        </FullscreenOverlay>
      )}
    </>
  );
}

function isPlotTrace<T>(value: T | null): value is T {
  return value !== null;
}

function makeFixedPhaseSeriesTrace(
  pulseIndex: number[],
  values: Array<number | null>,
  name: string,
  color: string,
  mode: "lines" | "markers",
  options: { xaxis?: string; yaxis?: string; dash?: "dash" } = {},
) {
  const count = Math.min(pulseIndex.length, values.length);
  return {
    x: pulseIndex.slice(0, count),
    y: values.slice(0, count),
    type: "scatter" as const,
    mode,
    name,
    line: { color, width: mode === "lines" ? 1.7 : 1.2, dash: options.dash },
    marker: { size: 5, color },
    connectgaps: false,
    xaxis: options.xaxis,
    yaxis: options.yaxis,
    hovertemplate: `Pulse index %{x}<br>${name}: %{y:.4f}<extra></extra>`,
  };
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function getAitoffMetrics(width: number, height: number, isFullscreen: boolean) {
  const minSide = Math.min(width, height);
  const labelFontSize = Math.round(clamp(minSide / 36, 14, isFullscreen ? 21 : 18));
  const margin = {
    top: Math.round(clamp(labelFontSize * 2.2, 30, 52)),
    right: Math.round(clamp(labelFontSize * 6.1, 82, Math.max(84, width * 0.16))),
    bottom: Math.round(clamp(labelFontSize * 5.6, 78, 116)),
    left: Math.round(clamp(labelFontSize * 6.1, 82, Math.max(84, width * 0.16))),
  };

  return {
    margin,
    labelFontSize,
    pointRadius: clamp(minSide / 150, 3.4, isFullscreen ? 5.6 : 4.6),
    axisStrokeWidth: clamp(minSide / 520, 1.25, 1.8),
    axisLineStrokeWidth: clamp(minSide / 660, 1, 1.55),
    gridStrokeWidth: clamp(minSide / 800, 0.8, 1.2),
    tickLength: clamp(minSide / 100, 5, 8),
    tickStrokeWidth: clamp(minSide / 720, 0.9, 1.35),
  };
}

function makeLineString(value: number, axis: "lat" | "lon") {
  const coordinates: [number, number][] = [];
  for (let step = -90; step <= 90; step += 2) {
    coordinates.push(axis === "lon" ? [value, step] : [step * 2, value]);
  }
  return { type: "LineString", coordinates };
}

function drawColorbar(
  svg: any,
  width: number,
  gradientId: string,
  colorDomain: [number, number],
  colorScale: (value: number) => string,
  axisColor: string,
  mutedColor: string,
  labelFontSize: number,
  longitudeLabelY: number,
) {
  const colorbarWidth = Math.round(clamp(width * 0.34, 210, 380));
  const colorbarHeight = clamp(labelFontSize * 0.72, 10, 15);
  const colorbarX = width / 2 - colorbarWidth / 2;
  const colorbarY = longitudeLabelY + labelFontSize * 0.9;
  const [minPulse, maxPulse] = colorDomain;
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("x2", "100%");

  for (let index = 0; index <= 24; index += 1) {
    const value = minPulse + ((maxPulse - minPulse) * index) / 24;
    gradient.append("stop").attr("offset", `${(index / 24) * 100}%`).attr("stop-color", colorScale(value));
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
    .text(formatPulseTick(minPulse));

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth / 2)
    .attr("y", colorbarY + colorbarHeight + labelFontSize * 2.35)
    .attr("text-anchor", "middle")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text("Pulse Index");

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth)
    .attr("y", colorbarY + labelFontSize * 2.05)
    .attr("text-anchor", "end")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text(formatPulseTick(maxPulse));
}

function formatPulseTick(value: number) {
  return Math.round(value).toLocaleString();
}

function makeSceneAxis(title: string, axisColor: string, gridColor: string) {
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
  };
}

function getUnitSphereSurface(steps: number) {
  const phi: number[] = [];
  const theta: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    phi.push((Math.PI * index) / steps);
    theta.push((2 * Math.PI * index) / steps);
  }

  const x: number[][] = [];
  const y: number[][] = [];
  const z: number[][] = [];

  for (let rowIndex = 0; rowIndex <= steps; rowIndex += 1) {
    const xRow: number[] = [];
    const yRow: number[] = [];
    const zRow: number[] = [];
    for (let colIndex = 0; colIndex <= steps; colIndex += 1) {
      xRow.push(Math.sin(phi[rowIndex]) * Math.cos(theta[colIndex]));
      yRow.push(Math.sin(phi[rowIndex]) * Math.sin(theta[colIndex]));
      zRow.push(Math.cos(phi[rowIndex]));
    }
    x.push(xRow);
    y.push(yRow);
    z.push(zRow);
  }

  return { x, y, z };
}
