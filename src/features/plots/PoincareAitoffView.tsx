import { useEffect, useId, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { geoGraticule, geoPath, scaleLinear, select } from "d3";
import { geoAitoff } from "d3-geo-projection";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { paperPlotConfig } from "@/shared/plot/plotlyConfig";

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

  useEffect(() => {
    if (view === "aitoff" && containerRef.current) {
      drawAitoff(containerRef.current);
    }
  }, [axisColor, bgColor, colorScale, colorDomain, gradientId, gridColor, mutedColor, points, view]);

  useEffect(() => {
    if (fullscreenKey === "aitoff" && fullscreenRef.current) {
      drawAitoff(fullscreenRef.current, true);
    }
  }, [axisColor, bgColor, colorScale, colorDomain, fullscreenKey, gradientId, gridColor, mutedColor, points]);

  function drawAitoff(target: HTMLDivElement, isFullscreen = false) {
    const width = isFullscreen ? 1320 : 1080;
    const height = isFullscreen ? 760 : 620;
    const margin = { top: 34, right: 96, bottom: 76, left: 96 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    select(target).selectAll("svg").remove();

    const svg = select(target)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
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
      .attr("stroke-width", 1.25);

    g.append("path")
      .datum(geoGraticule().step([45, 30])())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", gridColor)
      .attr("stroke-width", 0.8)
      .attr("stroke-opacity", 0.78);

    [makeLineString(0, "lon"), makeLineString(0, "lat")].forEach(line => {
      g.append("path")
        .datum(line)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", mutedColor)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.8);
    });

    g.selectAll(".aitoff-point")
      .data(points)
      .enter()
      .append("circle")
      .attr("class", "aitoff-point")
      .attr("cx", (point: AitoffPoint) => projection([point.lon, point.lat])?.[0] ?? 0)
      .attr("cy", (point: AitoffPoint) => projection([point.lon, point.lat])?.[1] ?? 0)
      .attr("r", isFullscreen ? 3.8 : 3.1)
      .attr("fill", (point: AitoffPoint) => colorScale(point.lat))
      .attr("opacity", 0.86)
      .attr("stroke", bgColor)
      .attr("stroke-width", 0.45);

    g.selectAll(".aitoff-lat-label")
      .data(latLabelValues)
      .enter()
      .append("text")
      .attr("class", "aitoff-lat-label")
      .attr("x", (lat: number) => (projection([-178, lat])?.[0] ?? 0) - 10)
      .attr("y", (lat: number) => projection([-178, lat])?.[1] ?? 0)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", mutedColor)
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", 4)
      .text((lat: number) => `${lat} deg`);

    g.selectAll(".aitoff-lon-tick")
      .data(lonLabelValues)
      .enter()
      .append("line")
      .attr("class", "aitoff-lon-tick")
      .attr("x1", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y1", (lon: number) => (projection([lon, 0])?.[1] ?? 0) - 5)
      .attr("x2", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y2", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + 5)
      .attr("stroke", mutedColor)
      .attr("stroke-width", 0.9)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0.86);

    g.selectAll(".aitoff-lon-label")
      .data(lonLabelValues)
      .enter()
      .append("text")
      .attr("class", "aitoff-lon-label")
      .attr("x", (lon: number) => projection([lon, 0])?.[0] ?? 0)
      .attr("y", (lon: number) => (projection([lon, 0])?.[1] ?? 0) + 17)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("font-size", 11)
      .attr("fill", mutedColor)
      .attr("paint-order", "stroke")
      .attr("stroke", bgColor)
      .attr("stroke-width", 4)
      .text((lon: number) => `${lon} deg`);

    drawColorbar(svg, width, height, gradientId, colorDomain, colorScale, axisColor, mutedColor);
  }

  const exportAitoff = (format: "svg" | "png", source: "inline" | "fullscreen" = "inline") => {
    const sourceRef = source === "fullscreen" ? fullscreenRef : containerRef;
    const svg = sourceRef.current?.querySelector("svg");
    if (!svg) return;

    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const viewBox = clonedSvg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [0, 0, 1600, 1000];
    const [, , width, height] = viewBox;
    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));
    const serialized = new XMLSerializer().serializeToString(clonedSvg);
    const filename = `fixed-phase-poincare-aitoff-${phaseValue?.toFixed(3) ?? "phase"}`;

    if (format === "svg") {
      downloadBlob(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }), `${filename}.svg`);
      return;
    }

    const image = new Image();
    const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * AITOFF_PNG_EXPORT_SCALE);
      canvas.height = Math.round(height * AITOFF_PNG_EXPORT_SCALE);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.scale(AITOFF_PNG_EXPORT_SCALE, AITOFF_PNG_EXPORT_SCALE);
      ctx.drawImage(image, 0, 0);
      canvas.toBlob(blob => {
        if (blob) downloadBlob(blob, `${filename}.png`);
        URL.revokeObjectURL(svgUrl);
      }, "image/png");
    };
    image.onerror = () => URL.revokeObjectURL(svgUrl);
    image.src = svgUrl;
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
        <div ref={containerRef} className="h-[620px] w-full" />
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
              <div ref={fullscreenRef} className="h-[calc(100%-2.5rem)] w-full" />
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
) {
  const colorbarWidth = 280;
  const colorbarHeight = 10;
  const colorbarX = width / 2 - colorbarWidth / 2;
  const colorbarY = height - 38;
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
    .attr("y", colorbarY + 26)
    .attr("text-anchor", "start")
    .attr("font-size", 11)
    .attr("fill", mutedColor)
    .text(`${minLat.toFixed(1)} deg`);

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth / 2)
    .attr("y", colorbarY - 8)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", mutedColor)
    .text("Latitude");

  svg.append("text")
    .attr("x", colorbarX + colorbarWidth)
    .attr("y", colorbarY + 26)
    .attr("text-anchor", "end")
    .attr("font-size", 11)
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
