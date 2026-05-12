import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { geoGraticule, geoPath, scaleLinear, select, zoom } from "d3";
import { geoAitoff } from "d3-geo-projection";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { paperPlotConfig, type PlotExportFormat } from "@/shared/plot/plotlyConfig";
import { downloadSvgElement } from "@/shared/plot/svgExport";
import { useElementSize } from "@/shared/plot/useElementSize";

type AitoffData = {
  lon: number[];
  lat: number[];
};

interface PoincareAitoffViewProps {
  data: AitoffData | null;
  phaseValue?: number;
  isDark?: boolean;
}

type AitoffPoint = {
  lon: number;
  lat: number;
};

const latLabelValues = [-60, -30, 0, 30, 60];
const lonLabelValues = [-135, -90, -45, 0, 45, 90, 135];
const AITOFF_PNG_EXPORT_SCALE = 4;

export default function PoincareAitoffView({ data, phaseValue, isDark }: PoincareAitoffViewProps) {
  const [fullscreenKey, setFullscreenKey] = useState<"aitoff" | "3d" | null>(null);
  const [view, setView] = useState<"aitoff" | "3d">("aitoff");
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const gradientId = `aitoff-colorbar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const inlineAitoffSize = useElementSize(containerRef, { width: 1080, height: 620 }, { width: 420, height: 360 });
  const fullscreenAitoffSize = useElementSize(fullscreenRef, { width: 1320, height: 760 }, { width: 520, height: 420 });

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#d7dde8" : "#172033";
  const gridColor = themeIsDark ? "#334155" : "#c9d2df";
  const bgColor = themeIsDark ? "#0b1120" : "#ffffff";
  const mutedColor = themeIsDark ? "#9aa8bd" : "#64748b";
  const surfaceColor = themeIsDark ? "#dbeafe" : "#1f4e79";

  const points = useMemo<AitoffPoint[]>(() => {
    if (!data) return [];

    const count = Math.min(data.lon?.length ?? 0, data.lat?.length ?? 0);
    const next: AitoffPoint[] = [];
    for (let index = 0; index < count; index += 1) {
      const lon = normalizeLongitude(toDegrees(data.lon[index]));
      const lat = clamp(toDegrees(data.lat[index]), -90, 90);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        next.push({ lon, lat });
      }
    }
    return next;
  }, [data]);

  const colorDomain = useMemo<[number, number]>(() => {
    if (!points.length) return [-90, 90];
    const latValues = points.map(point => point.lat);
    return [Math.min(...latValues), Math.max(...latValues)];
  }, [points]);

  const colorScale = useMemo(() => {
    const [minLat, maxLat] = colorDomain;
    const midLat = (minLat + maxLat) / 2;
    return scaleLinear<string>().domain([minLat, midLat, maxLat]).range(["#2b6cb0", "#f8fafc", "#c2410c"]);
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
    opacity: 0.14,
    colorscale: [[0, surfaceColor], [1, surfaceColor]] as any,
    showscale: false,
    hoverinfo: "skip" as const,
    name: "Unit sphere",
  }), [surfaceColor]);

  const points3d = useMemo(() => ({
    type: "scatter3d" as const,
    x: xyz.x,
    y: xyz.y,
    z: xyz.z,
    mode: "markers" as const,
    marker: {
      size: 3.5,
      color: points.map(point => point.lat),
      colorscale: "RdBu",
      reversescale: true,
      cmin: colorDomain[0],
      cmax: colorDomain[1],
      opacity: 0.9,
      showscale: true,
      colorbar: {
        title: { text: "Latitude (deg)" },
        orientation: "h" as const,
        x: 0.5,
        y: -0.12,
        len: 0.62,
      },
    },
    hovertemplate: "x %{x:.3f}<br>y %{y:.3f}<br>z %{z:.3f}<extra></extra>",
    name: "Poincare points",
  }), [colorDomain, points, xyz]);

  const layout3d = useMemo(() => ({
    title: undefined,
    dragmode: "orbit" as const,
    scene: {
      xaxis: makeSceneAxis("X", axisColor, gridColor),
      yaxis: makeSceneAxis("Y", axisColor, gridColor),
      zaxis: makeSceneAxis("Z", axisColor, gridColor),
      aspectmode: "cube" as const,
      camera: { eye: { x: 1.45, y: 1.45, z: 1.05 } },
    },
    margin: { l: 0, r: 0, t: 20, b: 42 },
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: { color: axisColor, family: "Inter, ui-sans-serif, system-ui, sans-serif" },
  }), [axisColor, bgColor, gridColor]);

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
    const zoomLayer = svg.append("g").attr("class", "aitoff-zoom-layer");
    const g = zoomLayer.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

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
      .attr("fill", (point: AitoffPoint) => colorScale(point.lat))
      .attr("opacity", 0.86)
      .attr("stroke", bgColor)
      .attr("stroke-width", metrics.pointStrokeWidth);

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
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", Math.max(4, labelFontSize * 0.42))
      .text((lat: number) => `${lat} deg`);

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
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", Math.max(4, labelFontSize * 0.42))
      .text((lon: number) => `${lon} deg`);

    drawColorbar(svg, width, height, gradientId, colorDomain, colorScale, axisColor, mutedColor, labelFontSize);
    applySvgZoom(svg, zoomLayer, width, height);
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
    const filename = `fixed-phase-poincare-aitoff-${phaseValue?.toFixed(3) ?? "phase"}`;
    downloadSvgElement(svg ?? null, filename, format, AITOFF_PNG_EXPORT_SCALE);
  };

  if (!data) return null;

  const activeToggleClass = themeIsDark ? "bg-slate-200 text-slate-950" : "bg-slate-900 text-white";
  const inactiveToggleClass = themeIsDark ? "text-slate-200 hover:bg-white/5" : "text-slate-800 hover:bg-slate-100";

  return (
    <div className="plot-export-scope plot-frame">
      <div className="plot-frame-header justify-start">
        <div className="plot-toolbar">
          <FullscreenIconButton onClick={() => setFullscreenKey(view)} title="Fullscreen" />
          <PlotExportButtons
            filename={view === "aitoff" ? "fixed-phase-poincare-aitoff" : "fixed-phase-poincare-sphere"}
            onExport={view === "aitoff" ? format => exportAitoff(format) : undefined}
          />
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
        <div>
          <div className="plot-frame-title">
            {view === "aitoff" ? "Fixed-phase Poincare Aitoff projection" : "Fixed-phase Poincare sphere"}
          </div>
          <div className="plot-frame-meta">{points.length.toLocaleString()} samples</div>
        </div>
      </div>

      {view === "aitoff" ? (
        <div ref={containerRef} className="h-[620px] min-h-[420px] w-full overflow-hidden rounded-md" />
      ) : (
        <Plot
          data={[sphere3d, points3d]}
          layout={layout3d as any}
          config={paperPlotConfig("fixed-phase-poincare-sphere")}
          useResizeHandler
          style={{ width: "100%", height: "620px" }}
        />
      )}

      {fullscreenKey && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="h-[92vh] w-[96vw] max-w-7xl p-4" title="Fixed-phase Poincare fullscreen">
          {fullscreenKey === "aitoff" ? (
            <div className="h-full w-full pr-8 pt-4">
              <div className="plot-toolbar mb-2">
                <PlotExportButtons filename="fixed-phase-poincare-aitoff-fullscreen" onExport={format => exportAitoff(format, "fullscreen")} />
              </div>
              <div ref={fullscreenRef} className="h-[calc(100%-2.5rem)] w-full overflow-hidden rounded-md" />
            </div>
          ) : (
            <div className="plot-export-scope h-full w-full pr-8 pt-8">
              <div className="plot-toolbar mb-2">
                <PlotExportButtons filename="fixed-phase-poincare-sphere-fullscreen" />
              </div>
              <Plot
                data={[sphere3d, points3d]}
                layout={{ ...(layout3d as any), autosize: true, height: undefined }}
                config={paperPlotConfig("fixed-phase-poincare-sphere-fullscreen")}
                useResizeHandler
                style={{ width: "100%", height: "calc(100% - 2.5rem)" }}
              />
            </div>
          )}
        </FullscreenOverlay>
      )}
    </div>
  );
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
    pointStrokeWidth: clamp(minSide / 1300, 0.45, 0.8),
    axisStrokeWidth: clamp(minSide / 520, 1.25, 1.8),
    axisLineStrokeWidth: clamp(minSide / 660, 1, 1.55),
    gridStrokeWidth: clamp(minSide / 800, 0.8, 1.2),
    tickLength: clamp(minSide / 100, 5, 8),
    tickStrokeWidth: clamp(minSide / 720, 0.9, 1.35),
  };
}

function applySvgZoom(svg: any, zoomLayer: any, width: number, height: number) {
  const behavior = zoom()
    .scaleExtent([1, 7])
    .translateExtent([[-width * 0.55, -height * 0.55], [width * 1.55, height * 1.55]])
    .extent([[0, 0], [width, height]])
    .on("zoom", (event: any) => {
      zoomLayer.attr("transform", event.transform.toString());
    });

  svg.call(behavior);
  svg.on("dblclick.zoom", null);
  svg
    .style("cursor", "grab")
    .on("pointerdown", () => svg.style("cursor", "grabbing"))
    .on("pointerup pointerleave", () => svg.style("cursor", "grab"));
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
  height: number,
  gradientId: string,
  colorDomain: [number, number],
  colorScale: (value: number) => string,
  axisColor: string,
  mutedColor: string,
  labelFontSize: number,
) {
  const colorbarWidth = Math.round(clamp(width * 0.34, 210, 380));
  const colorbarHeight = clamp(height / 72, 10, 15);
  const colorbarX = width / 2 - colorbarWidth / 2;
  const colorbarY = height - labelFontSize * 2.9;
  const [minLat, maxLat] = colorDomain;
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", gradientId).attr("x1", "0%").attr("x2", "100%");

  for (let index = 0; index <= 24; index += 1) {
    const value = minLat + ((maxLat - minLat) * index) / 24;
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
    .text(`${minLat.toFixed(1)} deg`);

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth / 2)
    .attr("y", colorbarY - labelFontSize * 0.7)
    .attr("text-anchor", "middle")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text("Latitude");

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth)
    .attr("y", colorbarY + labelFontSize * 2.05)
    .attr("text-anchor", "end")
    .attr("font-size", labelFontSize)
    .attr("fill", mutedColor)
    .text(`${maxLat.toFixed(1)} deg`);
}

function makeSceneAxis(title: string, axisColor: string, gridColor: string) {
  return {
    title: { text: title },
    range: [-1, 1],
    gridcolor: gridColor,
    zerolinecolor: gridColor,
    linecolor: axisColor,
    tickfont: { color: axisColor },
    tickcolor: axisColor,
    ticks: "outside" as const,
    ticklen: 4,
    titlefont: { color: axisColor },
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
