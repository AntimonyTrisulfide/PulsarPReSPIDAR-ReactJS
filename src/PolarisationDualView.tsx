import React, { useMemo, useState, useEffect, useCallback, useRef, memo, lazy, Suspense, useTransition } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "./components/FullscreenOverlay";

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
  // Reuse length calculation
  const dataLength = useMemo(() => Math.min(xData.length, yData.length), [xData.length, yData.length]);
  
  const trace = useMemo(() => {
    if (dataLength === 0) return null;
    
    return {
      type: "scatter" as const,
      mode: "lines" as const,
      x: xData.slice(0, dataLength),
      y: yData.slice(0, dataLength),
      line: { color: isDark ? "#60a5fa" : "#2563eb", width: 2 },
      hovertemplate: `x %{x:.4f}<br>y %{y:.4f}<extra></extra>`,
      name: "Trajectory",
      showlegend: false,
    };
  }, [xData, yData, dataLength, isDark]);

  const layout = useMemo(() => {
    const arrowColor = isDark ? "#60a5fa" : "#2563eb";
    const annotations: any[] = [];
    
    // Only create annotations if we have data
    if (dataLength > 1) {
      // Reuse sliced arrays to avoid multiple slices
      for (let i = 0; i < dataLength - 1; i++) {
        const x0 = xData[i];
        const y0 = yData[i];
        const x1 = xData[i + 1];
        const y1 = yData[i + 1];
        
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
    
    return {
      title: { text: "Custom XY plot" },
      xaxis: {
        title: { text: xLabel, standoff: 8 },
        gridcolor: gridColor,
        tickfont: { color: axisColor },
        tickcolor: axisColor,
        ticks: "outside" as const,
        ticklen: 4,
        titlefont: { color: axisColor },
        showline: true,
        mirror: "allticks" as const,
        automargin: true,
      },
      yaxis: {
        title: { text: yLabel, standoff: 10 },
        gridcolor: gridColor,
        tickfont: { color: axisColor },
        tickcolor: axisColor,
        ticks: "outside" as const,
        ticklen: 4,
        titlefont: { color: axisColor },
        showline: true,
        mirror: "allticks" as const,
        automargin: true,
      },
      annotations,
      margin: { l: 50, r: 20, t: 45, b: 50 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: { color: axisColor },
    } as const;
  }, [xLabel, yLabel, xData, yData, dataLength, isDark, axisColor, gridColor, paperBg, plotBg]);

  if (!trace || dataLength === 0) {
    return (
      <div className="h-full w-full rounded-md border border-dashed border-border/70 text-sm text-muted-foreground flex items-center justify-center">
        No overlapping samples for the selected axes.
      </div>
    );
  }

  return (
    <MemoizedPlot
      data={[trace]}
      layout={layout}
      config={{ responsive: true }}
      style={{ width: "100%", height: "100%" }}
    />
  );
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

interface PolarisationDualViewProps {
  phaseAxis: number[];
  data: PolarisationDataset;
  isDark?: boolean;
}

function PolarisationDualView({ phaseAxis, data, isDark }: PolarisationDualViewProps) {
  const [mode, setMode] = useState<"aitoff" | "3d">("aitoff");
  const [_split, setSplit] = useState(50); // committed value used for plot revisions
  const [liveSplit, setLiveSplit] = useState(50); // immediate UI width during drag
  const [fullscreen, setFullscreen] = useState<null | "left" | "right" | "custom">(null);
  const [xAxisKey, setXAxisKey] = useState<AxisKey>("phase");
  const [yAxisKey, setYAxisKey] = useState<AxisKey>("p_frac");
  const [isPending, startTransition] = useTransition();
  const rafRef = useRef<number | null>(null);
  const lastMoveTs = useRef<number>(0);
  const resizeEventRaf = useRef<number | null>(null);
  const lastResizeTs = useRef<number>(0);
  const draggingRef = useRef(false);
  const dragStartX = useRef<number | null>(null);
  const draggedRef = useRef(false);

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#e5e7eb";
  const paperBg = themeIsDark ? "#0b1220" : "#ffffff";
  const plotBg = themeIsDark ? "#0b1220" : "#ffffff";
  const activeToggleClass = themeIsDark ? "bg-white/15 text-white" : "bg-gray-900 text-white";
  const inactiveToggleClass = themeIsDark ? "text-gray-200 hover:bg-white/5" : "text-gray-800 hover:bg-black/5";

  const markerColors = useMemo(() => {
    const n = data.x?.length ?? 0;
    if (n === 0) return [] as number[];
    if (n === 1) return [0];
    return Array.from({ length: n }, (_, i) => i / (n - 1));
  }, [data.x?.length]);

  const lonLat = useMemo(() => {
    if (!data.PA?.length || !data.EA?.length) {
      return { lon: [], lat: [], lonDeg: [], latDeg: [] };
    }
    const lon = data.PA.map(v => (2 * v * Math.PI) / 180);
    const lat = data.EA.map(v => (2 * v * Math.PI) / 180);
    return { lon, lat, lonDeg: lon.map(v => (v * 180) / Math.PI), latDeg: lat.map(v => (v * 180) / Math.PI) };
  }, [data.PA, data.EA]);

  const aitoffTrace = useMemo(() => ({
    type: "scattergeo" as const,
    lon: lonLat.lonDeg,
    lat: lonLat.latDeg,
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
      opacity: 0.9,
      showscale: true,
      colorbar: {
        title: { text: "Index" },
        orientation: "h" as const,
        y: -0.25,
        x: 0.5,
        xanchor: "center" as const,
        len: 0.6,
      },
    },
    hovertemplate: "Lon: %{lon:.2f}°<br>Lat: %{lat:.2f}°<extra></extra>",
    name: "Poincaré points",
  }), [lonLat.latDeg, lonLat.lonDeg]);

  const aitoffLayout = useMemo(() => ({
    title: { text: "Poincaré (Aitoff)" },
    geo: {
      projection: { type: "aitoff" },
      showcountries: false,
      showcoastlines: false,
      showland: false,
      showocean: false,
      lataxis: { showgrid: true, dtick: 30 },
      lonaxis: { showgrid: true, dtick: 45 },
      bgcolor: plotBg,
    },
    margin: { l: 0, r: 0, t: 50, b: 40 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: { color: axisColor },
  }), [axisColor, paperBg, plotBg]);

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
      showscale: true,
      colorbar: {
        title: { text: "Index" },
        orientation: "h" as const,
        y: -0.2,
        x: 0.5,
        len: 0.6,
      },
    },
    hovertemplate: "x %{x:.2f}<br>y %{y:.2f}<br>z %{z:.2f}<extra></extra>",
    name: "Poincaré points",
  }), [data.x, data.y, data.z, lonLat.latDeg]);

  const layout3d = useMemo(() => ({
    title: { text: "Poincaré (3D)" },
    scene: {
      xaxis: { title: { text: "X" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
      yaxis: { title: { text: "Y" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
      zaxis: { title: { text: "Z" }, range: [-1, 1], gridcolor: gridColor, zerolinecolor: gridColor, linecolor: axisColor, tickfont: { color: axisColor }, tickcolor: axisColor, ticks: "outside" as const, ticklen: 4, titlefont: { color: axisColor }, showline: true },
      aspectmode: "cube" as const,
    },
    margin: { l: 0, r: 0, t: 50, b: 50 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: { color: axisColor },
  }), [axisColor, gridColor, paperBg, plotBg]);

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
    console.log("[PolarisationDualView] Poincaré dataset stats", payload);
  }, [data]);

  const fractionTraces = useMemo(() => ([
    { x: phaseAxis, y: data.p_frac, type: "scatter" as const, mode: "markers" as const, name: "P/I", line: { color: "#0ea5e9" } },
    { x: phaseAxis, y: data.l_frac, type: "scatter" as const, mode: "markers" as const, name: "L/I", line: { color: "#22c55e" } },
    { x: phaseAxis, y: data.v_frac, type: "scatter" as const, mode: "markers" as const, name: "V/I", line: { color: "#f97316" } },
    { x: phaseAxis, y: data.absv_frac, type: "scatter" as const, mode: "markers" as const, name: "|V/I|", line: { color: "#a855f7", dash: "dash" as const } },
  ]), [data.absv_frac, data.l_frac, data.p_frac, data.v_frac, phaseAxis]);

  const angleTraces = useMemo(() => ([
    { x: phaseAxis, y: data.PA, type: "scatter" as const, mode: "markers" as const, name: "PA (deg)", line: { color: "#2563eb" }, xaxis: "x2", yaxis: "y2" },
    { x: phaseAxis, y: data.EA, type: "scatter" as const, mode: "markers" as const, name: "EA (deg)", line: { color: "#dc2626" }, xaxis: "x2", yaxis: "y2" },
  ]), [data.EA, data.PA, phaseAxis]);

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
  const hasCustomData = useMemo(
    () => selectedXData.length > 0 && selectedYData.length > 0,
    [selectedXData.length, selectedYData.length]
  );

  // Get axis labels efficiently
  const xAxisLabel = useMemo(
    () => axisOptions.find(o => o.key === xAxisKey)?.label || xAxisKey,
    [axisOptions, xAxisKey]
  );
  const yAxisLabel = useMemo(
    () => axisOptions.find(o => o.key === yAxisKey)?.label || yAxisKey,
    [axisOptions, yAxisKey]
  );

  const fractionsLayout = useMemo(() => ({
    title: { text: "Polarisation Fractions & Angles" },
    grid: { rows: 2, columns: 1, pattern: "independent" as const },
    xaxis: {
      title: { text: "Phase", standoff: 8 },
      showgrid: true,
      gridcolor: gridColor,
      tickfont: { color: axisColor },
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      titlefont: { color: axisColor },
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    yaxis: {
      title: { text: "Fraction", standoff: 10 },
      range: [-0.2, 1.2],
      gridcolor: gridColor,
      tickfont: { color: axisColor },
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      titlefont: { color: axisColor },
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    xaxis2: {
      title: { text: "Phase", standoff: 8 },
      showgrid: true,
      gridcolor: gridColor,
      tickfont: { color: axisColor },
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      titlefont: { color: axisColor },
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    yaxis2: {
      title: { text: "Value", standoff: 10 },
      gridcolor: gridColor,
      tickfont: { color: axisColor },
      tickcolor: axisColor,
      ticks: "outside" as const,
      ticklen: 4,
      titlefont: { color: axisColor },
      showline: true,
      mirror: "allticks" as const,
      automargin: true,
    },
    margin: { l: 50, r: 20, t: 50, b: 70 },
    legend: { orientation: "h" as const, y: -0.2 },
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: { color: axisColor },
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

  const startDrag = useCallback((clientX: number) => {
    dragStartX.current = clientX;
    draggedRef.current = false;
    draggingRef.current = true;
  }, []);
  const stopDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (dragStartX.current == null) dragStartX.current = e.clientX;
      const delta = Math.abs(e.clientX - dragStartX.current);
      if (!draggedRef.current && delta < 4) return; // ignore tiny clicks
      draggedRef.current = true;
      const now = performance.now();
      if (now - lastMoveTs.current < 80) return; // throttle to ~12fps
      lastMoveTs.current = now;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        const percent = (e.clientX / window.innerWidth) * 100;
        const clamped = Math.min(75, Math.max(25, percent));
        setLiveSplit(clamped);
        rafRef.current = null;
      });
    };
    const onUp = (_e: MouseEvent) => {
      stopDrag();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastMoveTs.current = 0;
      if (draggedRef.current) {
        setSplit(liveSplit);
      }
      dragStartX.current = null;
      draggedRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (resizeEventRaf.current !== null) cancelAnimationFrame(resizeEventRaf.current);
      resizeEventRaf.current = null;
    };
  }, [stopDrag]);

  useEffect(() => {
    const now = performance.now();
    if (now - lastResizeTs.current < 150) return; // throttle resize events
    lastResizeTs.current = now;
    if (resizeEventRaf.current !== null) cancelAnimationFrame(resizeEventRaf.current);
    resizeEventRaf.current = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      resizeEventRaf.current = null;
    });
  }, [liveSplit]);

  const leftPlot = (
    <div className="h-[580px] w-full">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-semibold text-muted-foreground">Poincaré View</div>
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
          <FullscreenIconButton onClick={() => setFullscreen("left")} title="Fullscreen left" />
        </div>
      </div>
      <MemoizedPlot
        key={`poincare-${mode}`}
        data={mode === "aitoff" ? [aitoffTrace] : [sphere3d, points3d]}
        layout={{ ...(mode === "aitoff" ? aitoffLayout : layout3d) }}
        config={{ responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );

  const rightPlot = (
    <div className="h-[580px] w-full">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-semibold text-muted-foreground">Fractions and Angles</div>
        <FullscreenIconButton onClick={() => setFullscreen("right")} title="Fullscreen right" />
      </div>
      <MemoizedPlot
        key={`fractions`}
        data={[...fractionTraces, ...angleTraces]}
        layout={fractionsLayout}
        config={{ responsive: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );

  const renderContent = () => (
    <div className="relative w-full" style={{ minHeight: "640px" }}>
      <div className="flex h-full" style={{ gap: "0.75rem" }}>
        <div style={{ width: `${liveSplit}%` }}>{leftPlot}</div>
        <div
          className="w-1 cursor-col-resize bg-border/60"
          onMouseDown={e => startDrag(e.clientX)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize views"
        />
        <div style={{ width: `${100 - liveSplit}%` }}>{rightPlot}</div>
      </div>
    </div>
  );

  const customPlotCard = (
    <div className="w-full rounded-lg border border-border/60 bg-card/60 p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold text-muted-foreground">Custom XY Plot</div>
        <FullscreenIconButton onClick={() => setFullscreen("custom")} title="Fullscreen custom" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <label className="flex flex-col gap-1 text-muted-foreground">
          <span className="font-semibold text-foreground/80">X axis</span>
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
          <span className="font-semibold text-foreground/80">Y axis</span>
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
        <FullscreenOverlay onClose={() => setFullscreen(null)} contentClassName="w-[96vw] max-w-7xl h-[92vh] p-4">
          <div className="absolute right-3 top-3 z-20">
            <button
              type="button"
              aria-label="Close fullscreen"
              onClick={() => setFullscreen(null)}
              className="h-8 w-8 rounded-md bg-black/60 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-black/40"
            >
              ×
            </button>
          </div>
          <div className="h-full w-full">
            {fullscreen === "left" ? (
              <MemoizedPlot
                data={mode === "aitoff" ? [aitoffTrace] : [sphere3d, points3d]}
                layout={{ ...(mode === "aitoff" ? aitoffLayout : layout3d), autosize: true, height: undefined, margin: { l: 0, r: 0, t: 60, b: 40 } }}
                config={{ responsive: true }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : fullscreen === "right" ? (
              <MemoizedPlot
                data={[...fractionTraces, ...angleTraces]}
                layout={{ ...fractionsLayout, autosize: true, height: undefined, margin: { l: 60, r: 30, t: 60, b: 80 } }}
                config={{ responsive: true }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className="h-full w-full p-4">
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
const sphereCache = new Map<number, ReturnType<typeof getUnitSphereSurface>>();

function getUnitSphereSurface(steps: number) {
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
    opacity: 0.15,
    showscale: false,
    colorscale: [[0, "#ffffff"], [1, "#ffffff"]] as any,
    hoverinfo: "skip" as const,
    showlegend: false,
    name: "Unit Sphere",
  };
  sphereCache.set(steps, result);
  return result;
}
