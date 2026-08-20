import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenIconButton, FullscreenOverlay } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

type NumericArray = Array<number | null>;

type RvmFitPayload = {
  obs_id?: string;
  start_phase?: number;
  end_phase?: number;
  phase_axis?: NumericArray;
  pa_bin_centers?: NumericArray;
  log10_hist2d?: NumericArray[];
  fit_points?: {
    phase?: NumericArray;
    pa?: NumericArray;
    pa_err?: NumericArray;
  };
  fit?: {
    alpha_deg?: number | null;
    beta_deg?: number | null;
    zeta_deg?: number | null;
    phi0?: number | null;
    psi0_deg?: number | null;
    reduced_chi2?: number | null;
    num_fit_points?: number;
    dof?: number;
    phase?: NumericArray;
    pa_model?: NumericArray;
    pa_model_opm?: NumericArray;
    method?: string;
  } | null;
  warnings?: string[];
  warning?: string;
  metadata?: Record<string, unknown>;
};

type Props = {
  data: RvmFitPayload | null;
  isDark?: boolean;
  filenamePrefix?: string;
  onPulseWindows?: Array<{ start: number; end: number }>;
};

export default function RvmFittingView({ data, isDark, filenamePrefix = "observation", onPulseWindows = [] }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  if (!data) return null;

  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "rgba(0, 0, 0, 0)";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = "#000000";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";

  const { traces, layout } = useMemo(() => {
    const phase = data.phase_axis ?? [];
    const paBins = data.pa_bin_centers ?? [];
    const z = data.log10_hist2d ?? [];
    const zExtent = getFiniteExtent2d(z);
    const fit = data.fit;
    const fitPoints = data.fit_points ?? {};

    const plotTraces: any[] = [
      {
        type: "heatmap",
        x: phase,
        y: paBins,
        z,
        colorscale: "Viridis",
        zmin: zExtent?.min,
        zmax: zExtent?.max,
        colorbar: { title: { text: "log10(count)" } },
        hovertemplate: "Phase %{x:.5f}<br>PA %{y:.2f} deg<br>log10(count) %{z:.2f}<extra></extra>",
        name: "PA density",
      },
    ];

    if (fitPoints.phase?.length && fitPoints.pa?.length) {
      plotTraces.push({
        type: "scatter",
        mode: "markers",
        x: fitPoints.phase,
        y: fitPoints.pa,
        name: "Integrated PA",
        marker: { color: themeIsDark ? "#f8fafc" : "#111827", size: 5 },
        error_y: {
          array: fitPoints.pa_err ?? [],
          visible: true,
          thickness: 0.8,
          color: themeIsDark ? "#d1d5db" : "#374151",
        },
        hovertemplate: "Phase %{x:.5f}<br>PA %{y:.2f} deg<extra></extra>",
      });
    }

    if (fit?.phase?.length && fit.pa_model?.length) {
      plotTraces.push({
        type: "scatter",
        mode: "lines",
        x: fit.phase,
        y: fit.pa_model,
        name: "RVM fit",
        line: { color: "#ef4444", width: 3 },
        hovertemplate: "Phase %{x:.5f}<br>RVM PA %{y:.2f} deg<extra></extra>",
      });
    }

    if (fit?.phase?.length && fit.pa_model_opm?.length) {
      plotTraces.push({
        type: "scatter",
        mode: "lines",
        x: fit.phase,
        y: fit.pa_model_opm,
        name: "RVM + 90 deg",
        line: { color: "#38bdf8", width: 2.5, dash: "dash" },
        hovertemplate: "Phase %{x:.5f}<br>OPM PA %{y:.2f} deg<extra></extra>",
      });
    }

    const layoutObj: any = {
      height: 620,
      margin: { l: 74, r: 92, t: 18, b: 72 },
      paper_bgcolor: paperBg,
      plot_bgcolor: plotBg,
      font: plotFont(axisColor),
      template,
      legend: {
        orientation: "h",
        x: 0,
        y: -0.18,
        font: { color: axisColor, size: 12 },
      },
      xaxis: {
        title: { text: "Phase", standoff: 12 },
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        linecolor: axisColor,
        tickcolor: axisColor,
        ticks: "outside",
        showline: true,
        mirror: "allticks",
        ...plotAxisText(axisColor),
      },
      yaxis: {
        title: { text: "PA [deg]", standoff: 12 },
        range: [-90, 90],
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        linecolor: axisColor,
        tickcolor: axisColor,
        ticks: "outside",
        showline: true,
        mirror: "allticks",
        ...plotAxisText(axisColor),
      },
    };

    return { traces: plotTraces, layout: lockCartesianInteractions(layoutObj) };
  }, [axisColor, data, gridColor, paperBg, plotBg, template, themeIsDark]);

  const fit = data.fit;
  const widePulseDiagnosis = diagnoseWidePulseGeometry(fit, onPulseWindows);
  const warnings = [...(data.warning ? [data.warning] : []), ...(data.warnings ?? [])].filter(Boolean);

  return (
    <div className="plot-export-scope">
      <div className="plot-toolbar mb-2">
        <FullscreenIconButton onClick={() => setIsFullscreen(true)} title="Open fullscreen" />
        <PlotExportButtons filename={`${filenamePrefix}-rvm-fitting`} />
        <div className="plot-panel-title text-foreground/90">PA Probability Density with RVM Fit</div>
      </div>
      <FitSummary fit={fit} warnings={warnings} widePulseDiagnosis={widePulseDiagnosis} />
      <Plot
        data={traces}
        layout={layout}
        config={paperPlotConfig("rvm-fitting")}
        useResizeHandler
        style={{ width: "100%", height: "620px" }}
      />

      {isFullscreen && (
        <FullscreenOverlay onClose={() => setIsFullscreen(false)} contentClassName="h-[92vh] w-[96vw] max-w-7xl p-4" title="RVM fitting fullscreen">
          <div className="plot-export-scope h-full w-full pt-8">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`${filenamePrefix}-rvm-fitting-fullscreen`} />
            </div>
            <FitSummary fit={fit} warnings={warnings} compact widePulseDiagnosis={widePulseDiagnosis} />
            <Plot
              data={traces}
              layout={{ ...layout, autosize: true, height: undefined }}
              config={paperPlotConfig("rvm-fitting-fullscreen")}
              useResizeHandler
              style={{ width: "100%", height: "calc(100% - 5rem)" }}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

type WidePulseDiagnosis = {
  label: string;
  details: string;
  betaOtherDeg: number | null;
  rhoCombinedDeg: number | null;
} | null;

function FitSummary({ fit, warnings, compact = false, widePulseDiagnosis }: { fit: RvmFitPayload["fit"]; warnings: string[]; compact?: boolean; widePulseDiagnosis?: WidePulseDiagnosis }) {
  return (
    <div className={`mb-3 grid gap-2 text-sm text-foreground ${compact ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3 xl:grid-cols-6"}`}>
      <SummaryCell label="alpha" value={formatDeg(fit?.alpha_deg)} />
      <SummaryCell label="beta" value={formatDeg(fit?.beta_deg)} />
      <SummaryCell label="zeta" value={formatDeg(fit?.zeta_deg)} />
      <SummaryCell label="phi0" value={formatPhase(fit?.phi0)} />
      <SummaryCell label="psi0" value={formatDeg(fit?.psi0_deg)} />
      <SummaryCell label="reduced chi2" value={formatNumber(fit?.reduced_chi2)} />
      {fit?.num_fit_points !== undefined && (
        <div className="md:col-span-3 xl:col-span-6 text-foreground/90">
          {fit.num_fit_points} PA bins fitted. OPM handling uses the closer of the direct RVM track and the 90 deg branch.
        </div>
      )}
      {widePulseDiagnosis && (
        <div className="md:col-span-3 xl:col-span-6 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-foreground">
          <div className="font-semibold">{widePulseDiagnosis.label}</div>
          <div className="mt-1 text-foreground/85">{widePulseDiagnosis.details}</div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="md:col-span-3 xl:col-span-6 text-amber-600 dark:text-amber-300">
          {warnings.join(" ")}
        </div>
      )}
    </div>
  );
}

function diagnoseWidePulseGeometry(fit: RvmFitPayload["fit"], windows: Array<{ start: number; end: number }>): WidePulseDiagnosis {
  if (!fit || windows.length < 2) return null;
  const alpha = Number(fit.alpha_deg);
  const beta = Number(fit.beta_deg);
  if (!Number.isFinite(alpha) || !Number.isFinite(beta)) return null;

  const zeta = alpha + beta;
  const otherPoleAlpha = 180 - alpha;
  const betaOther = signedShortestAngleDeg(zeta - otherPoleAlpha);
  const combinedWidthDeg = combinedWindowWidthDeg(windows);
  const rhoCombined = combinedWidthDeg !== null ? beamOpeningAngleDeg(alpha, zeta, combinedWidthDeg) : null;

  const alphaNearOrthogonal = Math.abs(alpha - 90) <= 20;
  const smallBeta = Math.abs(beta) <= 10;
  const smallOtherBeta = Math.abs(betaOther) <= 10;
  const smallAlpha = alpha <= 35 || alpha >= 145;
  const largeRho = rhoCombined !== null && rhoCombined >= 35;

  const summary = [
    `beta for fitted pole ${formatDeg(beta)}`,
    `beta for opposite pole ${formatDeg(betaOther)}`,
    rhoCombined !== null ? `rho from combined windows ${formatDeg(rhoCombined)}` : null,
  ].filter(Boolean).join("; ");

  if (alphaNearOrthogonal && smallBeta && smallOtherBeta) {
    return {
      label: "Wide-pulse diagnosis: two-pole candidate",
      details: `Two on-pulse windows are present, alpha is close to 90 deg, and both pole impact parameters are small (${summary}).`,
      betaOtherDeg: betaOther,
      rhoCombinedDeg: rhoCombined,
    };
  }

  if (smallAlpha && smallBeta && largeRho) {
    return {
      label: "Wide-pulse diagnosis: same-pole wide-beam candidate",
      details: `Two on-pulse windows are present, alpha and beta are small, and the combined-window beam-opening estimate is large (${summary}).`,
      betaOtherDeg: betaOther,
      rhoCombinedDeg: rhoCombined,
    };
  }

  return {
    label: "Wide-pulse diagnosis: inconclusive",
    details: `Two on-pulse windows are present, but this first-pass heuristic does not clearly prefer a two-pole or same-pole interpretation (${summary}).`,
    betaOtherDeg: betaOther,
    rhoCombinedDeg: rhoCombined,
  };
}

function combinedWindowWidthDeg(windows: Array<{ start: number; end: number }>) {
  const clean = windows
    .map(windowValue => ({ start: Number(windowValue.start), end: Number(windowValue.end) }))
    .filter(windowValue => Number.isFinite(windowValue.start) && Number.isFinite(windowValue.end))
    .sort((left, right) => left.start - right.start);
  if (clean.length < 2) return null;
  const start = clean[0].start;
  const end = clean[clean.length - 1].end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.min(360, Math.max(0, (end - start) * 360));
}

function beamOpeningAngleDeg(alphaDeg: number, zetaDeg: number, pulseWidthDeg: number) {
  const alpha = radians(alphaDeg);
  const zeta = radians(zetaDeg);
  const halfWidth = radians(pulseWidthDeg / 2);
  const cosRho = Math.cos(alpha) * Math.cos(zeta) + Math.sin(alpha) * Math.sin(zeta) * Math.cos(halfWidth);
  return degrees(Math.acos(Math.min(1, Math.max(-1, cosRho))));
}

function signedShortestAngleDeg(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function degrees(value: number) {
  return value * 180 / Math.PI;
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "n/a";
}

function formatDeg(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} deg` : "n/a";
}

function formatPhase(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(5) : "n/a";
}

function getFiniteExtent2d(values: NumericArray[]) {
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  for (const row of values) {
    if (!Array.isArray(row)) continue;
    for (const value of row) {
      if (value === null || value === undefined) continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      min = Math.min(min, numeric);
      max = Math.max(max, numeric);
      found = true;
    }
  }
  return found ? { min, max } : null;
}
