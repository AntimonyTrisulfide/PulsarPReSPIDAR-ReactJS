import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Plot from "react-plotly.js";
import Plotly from "plotly.js/dist/plotly";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
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

type SingleQuantityKey = "I" | "PA" | "EA";
type CombinedSeriesKey = "dPA" | "p_frac" | "l_frac" | "v_frac";
type SubpulsePlotMode = SingleQuantityKey | "combined";
const MAX_RADIAL_PATH_TRACES = 48;
const SINGLE_QUANTITY_OPTIONS: Array<{ key: SingleQuantityKey; label: string; color: string }> = [
  { key: "I", label: "I", color: "#64748b" },
  { key: "PA", label: "PA (°)", color: "#2563eb" },
  { key: "EA", label: "EA (°)", color: "#dc2626" },
];
const COMBINED_SERIES_OPTIONS: Array<{ key: CombinedSeriesKey; label: string; color: string }> = [
  { key: "dPA", label: "dPA", color: "#7c3aed" },
  { key: "p_frac", label: "P/I", color: "#0ea5e9" },
  { key: "l_frac", label: "L/I", color: "#22c55e" },
  { key: "v_frac", label: "V/I", color: "#f97316" },
];
const SUBPULSE_PLOT_OPTIONS: Array<{ key: SubpulsePlotMode; label: string }> = [
  { key: "combined", label: "dPA, P/I, L/I, V/I" },
  ...SINGLE_QUANTITY_OPTIONS,
];

export default function SubpulsePolarisationView({ phaseAxis, data, selectedPulseIndex, isDark }: SubpulsePolarisationViewProps) {
  const [split, setSplit] = useState(54);
  const [selectedPlotMode, setSelectedPlotMode] = useState<SubpulsePlotMode>("combined");
  const [fullscreen, setFullscreen] = useState<null | "poincare" | "parameters">(null);
  const [visibleCombinedSeries, setVisibleCombinedSeries] = useState<Record<CombinedSeriesKey, boolean>>({
    dPA: true,
    p_frac: true,
    l_frac: true,
    v_frac: true,
  });
  const rafRef = useRef<number | null>(null);
  const resizeEventRaf = useRef<number | null>(null);
  const lastResizeTs = useRef<number>(0);
  const draggingRef = useRef(false);
  const splitRef = useRef(54);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const draggedRef = useRef(false);
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
        y: 0.035,
        yanchor: "bottom" as const,
        len: 0.58,
        thickness: 12,
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
      domain: { x: [0, 1], y: [0.095, 1] },
    },
    margin: { l: 0, r: 0, t: 10, b: 26 },
    paper_bgcolor: plotBg,
    plot_bgcolor: plotBg,
    font: plotFont(axisColor),
    showlegend: false,
  }), [axisColor, gridColor, isDark, plotBg]);

  const selectedSingleQuantityOption = useMemo(
    () => SINGLE_QUANTITY_OPTIONS.find(option => option.key === selectedPlotMode) ?? SINGLE_QUANTITY_OPTIONS[0],
    [selectedPlotMode],
  );

  const quantityLayout = useMemo(() => lockCartesianInteractions({
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
      title: { text: selectedPlotMode === "combined" ? "Value" : selectedSingleQuantityOption.label, standoff: 10 },
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
  }), [axisColor, gridColor, paperBg, plotBg, selectedPlotMode, selectedSingleQuantityOption.label]);

  const quantityTraces = useMemo(
    () => {
      if (selectedPlotMode !== "combined") {
        return [
          makeSeriesTrace(
            phaseAxis,
            data[selectedPlotMode] ?? [],
            selectedSingleQuantityOption.label,
            selectedSingleQuantityOption.color,
          ),
        ];
      }
      return COMBINED_SERIES_OPTIONS.map(({ key, label, color }) => (
        visibleCombinedSeries[key] ? makeSeriesTrace(phaseAxis, data[key] ?? [], label, color) : null
      )).filter(isPlotTrace);
    },
    [data, phaseAxis, selectedPlotMode, selectedSingleQuantityOption.color, selectedSingleQuantityOption.label, visibleCombinedSeries],
  );

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
    const clamped = Math.min(74, Math.max(30, next));
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
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      if (dragStartX.current == null) dragStartX.current = event.clientX;
      const delta = Math.abs(event.clientX - dragStartX.current);
      if (!draggedRef.current && delta < 4) return;
      draggedRef.current = true;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        applySplit(event.clientX);
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

  useEffect(() => {
    dispatchResize(true);
  }, [dispatchResize, fullscreen, selectedPlotMode, selectedPulseIndex]);

  if (!phaseAxis.length) return null;

  const poincarePane = (
    <div className="subpulse-poincare-panel plot-export-scope">
      <div className="plot-toolbar mb-3 gap-2">
        <FullscreenIconButton onClick={() => setFullscreen("poincare")} title="Fullscreen Poincare sphere" />
        <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-poincare-sphere`} />
        <div className="plot-panel-title text-foreground">Poincare Sphere for Selected Subpulse</div>
      </div>
      <Plot
        data={[sphere3d, ...radialPathTraces, points3d]}
        layout={layout3d}
        config={paperPlotConfig(`subpulse-${selectedPulseIndex}-poincare-sphere`, { interactive: true })}
        useResizeHandler
        style={{ width: "100%", height: "calc(100% - 3.5rem)" }}
      />
    </div>
  );

  const parameterPane = (
    <div className="subpulse-parameters-pane">
      <div className="subpulse-quantity-panel plot-export-scope">
        <div className="plot-toolbar subpulse-quantity-toolbar mb-4 gap-2">
          <FullscreenIconButton onClick={() => setFullscreen("parameters")} title="Fullscreen parameters" />
          <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-${selectedPlotMode}`} />
          <div className="plot-panel-title text-foreground">Polarisation Parameters for Selected Subpulse</div>
          <select
            className="subpulse-quantity-select field-shell"
            value={selectedPlotMode}
            onChange={event => setSelectedPlotMode(event.target.value as SubpulsePlotMode)}
            aria-label="Select selected-subpulse polarisation quantity"
          >
            {SUBPULSE_PLOT_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="subpulse-quantity-plot">
          <Plot
            data={quantityTraces}
            layout={quantityLayout}
            config={paperPlotConfig(`subpulse-${selectedPulseIndex}-${selectedPlotMode}`)}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        {selectedPlotMode === "combined" && (
          <div className="subpulse-combined-controls">
            {COMBINED_SERIES_OPTIONS.map(({ key, label, color }) => (
              <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={visibleCombinedSeries[key]}
                  onChange={() => setVisibleCombinedSeries(current => ({ ...current, [key]: !current[key] }))}
                />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={splitContainerRef}
        className="polarimetry-split subpulse-split"
        style={{ "--plot-split": `${split}%` } as CSSProperties}
      >
        <div className="split-pane subpulse-split-pane">{poincarePane}</div>
        <div
          className="split-resizer"
          onPointerDown={event => startDrag(event.clientX)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize selected subpulse views"
          aria-valuemin={30}
          aria-valuemax={74}
          aria-valuenow={Math.round(splitRef.current)}
        />
        <div className="split-pane subpulse-split-pane">
          {parameterPane}
        </div>
      </div>
      {fullscreen === "poincare" && (
        <FullscreenOverlay onClose={() => setFullscreen(null)} contentClassName="h-[92vh] w-[96vw] max-w-7xl p-4" title="Selected subpulse Poincare fullscreen">
          <div className="subpulse-poincare-panel plot-export-scope">
            <div className="plot-toolbar mb-3 gap-2">
              <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-poincare-sphere-fullscreen`} />
              <div className="plot-panel-title text-foreground">Poincare Sphere for Selected Subpulse</div>
            </div>
            <Plot
              data={[sphere3d, ...radialPathTraces, points3d]}
              layout={layout3d}
              config={paperPlotConfig(`subpulse-${selectedPulseIndex}-poincare-sphere-fullscreen`, { interactive: true })}
              useResizeHandler
              style={{ width: "100%", height: "calc(100% - 3.5rem)" }}
            />
          </div>
        </FullscreenOverlay>
      )}
      {fullscreen === "parameters" && (
        <FullscreenOverlay onClose={() => setFullscreen(null)} contentClassName="h-[92vh] w-[96vw] max-w-7xl p-4" title="Selected subpulse parameters fullscreen">
          <div className="subpulse-parameters-pane">
            <div className="subpulse-quantity-panel plot-export-scope">
              <div className="plot-toolbar subpulse-quantity-toolbar mb-4 gap-2">
                <PlotExportButtons filename={`subpulse-${selectedPulseIndex}-${selectedPlotMode}-fullscreen`} />
                <div className="plot-panel-title text-foreground">Polarisation Parameters for Selected Subpulse</div>
                <select
                  className="subpulse-quantity-select field-shell"
                  value={selectedPlotMode}
                  onChange={event => setSelectedPlotMode(event.target.value as SubpulsePlotMode)}
                  aria-label="Select selected-subpulse polarisation quantity"
                >
                  {SUBPULSE_PLOT_OPTIONS.map(option => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="subpulse-quantity-plot">
                <Plot
                  data={quantityTraces}
                  layout={quantityLayout}
                  config={paperPlotConfig(`subpulse-${selectedPulseIndex}-${selectedPlotMode}-fullscreen`)}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
              {selectedPlotMode === "combined" && (
                <div className="subpulse-combined-controls">
                  {COMBINED_SERIES_OPTIONS.map(({ key, label, color }) => (
                    <label key={key} className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={visibleCombinedSeries[key]}
                        onChange={() => setVisibleCombinedSeries(current => ({ ...current, [key]: !current[key] }))}
                      />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </FullscreenOverlay>
      )}
    </>
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
