import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { FullscreenOverlay, FullscreenIconButton } from "@/components/FullscreenOverlay";
import { PlotExportButtons } from "@/shared/plot/PlotExportButtons";
import { lockCartesianInteractions, paperPlotConfig } from "@/shared/plot/plotlyConfig";
import { plotAxisText, plotFont } from "@/shared/plot/plotTypography";

type NumericArray = Array<number | null>;
type EnergyDistributionMode =
  | "energy_mean_on"
  | "energy_off_rms"
  | "peak_i_over_mean_profile_peak";

export type TotalIntensityEvolutionPayload = {
  obs_id?: string;
  start_phase: number;
  end_phase: number;
  on_pulse: { start: number; end: number };
  phase_axis: NumericArray;
  pulse_number: number[];
  pulse_energy_distribution: {
    bin_centers: NumericArray;
    density: NumericArray;
    bin_count?: number;
    bin_rule?: string;
    normalization?: EnergyDistributionMode | string;
    normalization_factor?: number | null;
    on_pulse_energy: NumericArray;
    off_pulse_energy: NumericArray;
    raw_on_pulse_energy?: NumericArray;
    raw_off_pulse_energy?: NumericArray;
    on_pulse_peak_intensity?: NumericArray;
    off_pulse_peak_intensity?: NumericArray;
    mean_profile_peak?: number | null;
    warnings?: string[];
    debug?: Record<string, unknown>;
    description?: string;
  };
  intensity_histogram: {
    phase_axis: NumericArray;
    bin_centers: NumericArray;
    hist2d?: NumericArray[];
    log10_hist2d?: NumericArray[];
    log_hist2d: NumericArray[];
    mean_profile: NumericArray;
    warnings?: string[];
    metadata?: Record<string, unknown>;
  };
  fluctuation_spectrum: {
    phase_axis: NumericArray;
    frequency: NumericArray;
    log_power: NumericArray[];
    fft_phase?: NumericArray;
    mean_profile: NumericArray;
    modulation_index: NumericArray;
    integrated_spectrum?: NumericArray;
    p3_estimate?: number | null;
    f_peak?: number | null;
    previous_p3_estimate?: number | null;
    previous_f_peak?: number | null;
    p3_candidates?: Array<{
      rank?: number;
      frequency?: number | null;
      P3?: number | null;
      power?: number | null;
      prominence?: number | null;
      local_contrast?: number | null;
    }>;
    warnings?: string[];
    metadata?: Record<string, unknown>;
  };
  two_d_fluctuation_spectrum: {
    f2: NumericArray;
    f3: NumericArray;
    log_power: NumericArray[];
    integrated_longitude_frequency_power?: NumericArray;
    estimate?: {
      f3: number | null;
      f2: number | null;
      P3: number | null;
      P2_bins: number | null;
      drift_direction: number;
    };
  };
  longitude_resolved_fluctuation_spectrum: {
    phase_axis: NumericArray;
    frequency: NumericArray;
    log_power: NumericArray[];
    integrated_spectrum: NumericArray;
    mean_profile: NumericArray;
    p3_estimate?: number | null;
  };
  p3_evolution: {
    centers: NumericArray;
    frequency: NumericArray;
    log_power: NumericArray[];
    f3: NumericArray;
    P3: NumericArray;
    peak_power: NumericArray;
    sliding_2dfs_centers?: NumericArray;
    sliding_2dfs_f3?: NumericArray;
    sliding_2dfs_f2?: NumericArray;
    sliding_2dfs_P3?: NumericArray;
    sliding_2dfs_P2_bins?: NumericArray;
    sliding_2dfs_peak_power?: NumericArray;
  };
  profile_stabilisation?: {
    pulse_count: NumericArray;
    correlation: NumericArray;
    one_minus_correlation: NumericArray;
    reference: NumericArray;
    description?: string;
  };
  acf_psd?: {
    lag: NumericArray;
    acf: NumericArray;
    frequency: NumericArray;
    psd: NumericArray;
    description?: string;
  };
  trial_null_fraction?: {
    threshold_sigma: NumericArray;
    null_fraction: NumericArray;
    default_threshold_sigma?: number | null;
    default_null_fraction?: number | null;
    off_rms?: number | null;
    description?: string;
  };
  adp?: {
    phase_lag_bins: NumericArray;
    correlation: NumericArray;
    description?: string;
  };
};

type Props = {
  data: TotalIntensityEvolutionPayload | null;
  isDark?: boolean;
  filenamePrefix?: string;
};

type PlotItem = {
  key: string;
  title: string;
  data: any[];
  layout: any;
  interactive?: boolean;
  hasNegativeIntensityValues?: boolean;
};

const TOTAL_INTENSITY_PLOT_RENDER_VERSION = 17;
const ENERGY_VIEWPORT_NOTE = "Initial y-axis viewport is optimized for readability using the on-pulse distribution only. No histogram data are removed. The full distribution can be explored by pan and zoom.";
const STOKES_I_HISTOGRAM_DESCRIPTION = "For each phase bin, this plot histograms baseline-subtracted Stokes I across pulses. It shows pulse-to-pulse intensity variability as a function of longitude.";
const STOKES_I_HISTOGRAM_NOTE = "Negative intensities are retained because they are expected noise fluctuations after baseline subtraction.";
const FLUCTUATION_SPECTRUM_DESCRIPTION = "The LRFS shows periodic pulse-to-pulse modulation at each longitude. A feature at frequency f corresponds to P3 = 1/f pulse periods. The modulation index shows fractional pulse-to-pulse variability at each longitude.";

export default function TotalIntensityEvolution({ data, isDark, filenamePrefix = "observation" }: Props) {
  if (!data) return null;

  const [fullscreenKey, setFullscreenKey] = useState<string | null>(null);
  const [energyMode, setEnergyMode] = useState<EnergyDistributionMode>("energy_mean_on");
  const themeIsDark = !!isDark;
  const axisColor = themeIsDark ? "#e5e7eb" : "#111827";
  const gridColor = themeIsDark ? "#1f2937" : "#d7dee8";
  const paperBg = themeIsDark ? "#080808" : "#f7fafc";
  const plotBg = themeIsDark ? "#080808" : "#f7fafc";
  const template = themeIsDark ? "plotly_dark" : "plotly_white";
  const textColor = axisColor;

  const baseAxis = {
    gridcolor: gridColor,
    linecolor: axisColor,
    ...plotAxisText(axisColor),
    tickcolor: axisColor,
    ticks: "outside",
    ticklen: 4,
    zerolinecolor: gridColor,
    showline: true,
    mirror: "allticks",
    automargin: true,
  };

  const baseLayout = {
    margin: { l: 62, r: 58, t: 14, b: 56 },
    height: 430,
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: plotFont(textColor),
    template,
    showlegend: false,
  };

  const items = useMemo<PlotItem[]>(() => {
    const energy = data.pulse_energy_distribution;
    const intensity = data.intensity_histogram;
    const fluc = data.fluctuation_spectrum;
    const dfs = data.two_d_fluctuation_spectrum;
    const p3 = data.p3_evolution;
    const profileStabilisation = data.profile_stabilisation;
    const acfPsd = data.acf_psd;
    const nullFraction = data.trial_null_fraction;
    const adp = data.adp;
    const plottedDistribution = getPulseDistributionValues(energy, energyMode);
    const onPulseEnergy = plottedDistribution.onPulse;
    const offPulseEnergy = plottedDistribution.offPulse;
    const distributionWarnings = getDistributionWarnings(energy, onPulseEnergy, offPulseEnergy);
    const distributionSeries = [onPulseEnergy, offPulseEnergy];
    const energyRange = getPaddedRangeForSeries(distributionSeries);
    const energyBinCount = Number.isFinite(Number(energy.bin_count))
      ? Math.max(1, Math.floor(Number(energy.bin_count)))
      : 32;
    const explicitBins = getExplicitBinsForSeries(distributionSeries, energyBinCount);
    const onHistogram = explicitBins ? getDensityBars(onPulseEnergy, explicitBins) : { x: [], y: [], width: 0 };
    const offHistogram = explicitBins ? getDensityBars(offPulseEnergy, explicitBins) : { x: [], y: [], width: 0 };
    const energyDensityRange = getInitialDensityRange(onHistogram.y);
    const energyXAxisLabel = getEnergyXAxisLabel(energyMode);
    const energyYAxisLabel = getEnergyYAxisLabel(energyMode);
    const negativeShadeStart = energyRange ? Math.min(energyRange[0], 0) : 0;
    const zeroReferenceShapes = [
      {
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: negativeShadeStart,
        x1: 0,
        y0: 0,
        y1: 1,
        fillcolor: themeIsDark ? "rgba(148, 163, 184, 0.13)" : "rgba(148, 163, 184, 0.18)",
        line: { width: 0 },
        layer: "below",
      },
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: 0,
        x1: 0,
        y0: 0,
        y1: 1,
        line: { color: themeIsDark ? "#e5e7eb" : "#111827", width: 1 },
      },
    ];
    const intensityColorValues = Array.isArray(intensity.log10_hist2d) && intensity.log10_hist2d.length
      ? intensity.log10_hist2d
      : intensity.log_hist2d;
    const intensityZMax = getRobustPositiveMax(intensityColorValues);
    const intensityWarnings = Array.isArray(intensity.warnings) ? intensity.warnings.filter(Boolean) : [];
    const flucPowerRange = getRobustMatrixRange(fluc.log_power, 5, 99);
    const flucWarnings = Array.isArray(fluc.warnings) ? fluc.warnings.filter(Boolean) : [];
    const integratedSpectrum = getIntegratedSpectrum(fluc.integrated_spectrum ?? [], fluc.log_power);
    const flucPeakIndex = getNearestFiniteIndex(fluc.frequency, fluc.f_peak, integratedSpectrum);
    const flucPeakFrequency = flucPeakIndex >= 0 ? Number(fluc.frequency[flucPeakIndex]) : null;
    const flucPeakPower = flucPeakIndex >= 0 ? Number(integratedSpectrum[flucPeakIndex]) : null;
    const hasNegativeIntensityValues = Number(intensity.metadata?.i_min) < 0;
    const intensityAxis = {
      ...baseAxis,
      gridcolor: themeIsDark ? gridColor : "#000000",
    };
    const meanProfileAxis = {
      ...baseAxis,
      gridcolor: themeIsDark ? gridColor : "rgba(0, 0, 0, 0)",
    };

    const energyLayout = {
      ...baseLayout,
      margin: { l: 68, r: 58, t: 40, b: 62 },
      xaxis: { ...baseAxis, title: { text: energyXAxisLabel, standoff: 8 }, range: energyRange, type: "linear" },
      yaxis: { ...baseAxis, title: { text: energyYAxisLabel, standoff: 8 }, range: energyDensityRange },
      bargap: 0.02,
      barmode: "overlay",
      dragmode: "pan",
      showlegend: true,
      legend: {
        orientation: "h",
        x: 0,
        y: 1.08,
        xanchor: "left",
        yanchor: "bottom",
        font: { color: textColor },
      },
      shapes: zeroReferenceShapes,
      annotations: distributionWarnings.length
        ? [{
            xref: "paper",
            yref: "paper",
            x: 0.5,
            y: 0.5,
            xanchor: "center",
            yanchor: "middle",
            showarrow: false,
            align: "center",
            text: distributionWarnings.join("<br>"),
            font: { color: textColor, size: 13 },
            bgcolor: themeIsDark ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.92)",
            bordercolor: gridColor,
            borderwidth: 1,
          }]
        : [],
    };

    const intensityLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 460,
      margin: { l: 62, r: 62, t: 14, b: 58 },
      shapes: [
        {
          type: "rect",
          xref: "paper",
          yref: "paper",
          x0: 0,
          x1: 1,
          y0: 0.28,
          y1: 1,
          fillcolor: "#000000",
          line: { width: 0 },
          layer: "below",
        },
      ],
      xaxis: { ...intensityAxis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...intensityAxis, domain: [0.28, 1], title: { text: "Baseline-subtracted Stokes I", standoff: 8 } },
      xaxis2: { ...meanProfileAxis, domain: [0, 1], anchor: "y2", title: { text: "Phase", standoff: 8 } },
      yaxis2: { ...meanProfileAxis, domain: [0, 0.22], title: { text: "Mean Stokes I", standoff: 8 } },
      annotations: intensityWarnings.length
        ? [{
            xref: "paper",
            yref: "paper",
            x: 0.5,
            y: 0.65,
            xanchor: "center",
            yanchor: "middle",
            showarrow: false,
            align: "center",
            text: intensityWarnings.join("<br>"),
            font: { color: textColor, size: 13 },
            bgcolor: themeIsDark ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.92)",
            bordercolor: gridColor,
            borderwidth: 1,
          }]
        : [],
    });

    const flucLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 1100,
      margin: { l: 108, r: 106, t: 72, b: 96 },
      showlegend: true,
      legend: {
        orientation: "h",
        x: 0.30,
        y: -0.08,
        xanchor: "left",
        yanchor: "top",
        font: { color: textColor, size: 11 },
        bgcolor: "rgba(0,0,0,0)",
      },
      xaxis: { ...baseAxis, domain: [0.28, 0.96], anchor: "y", side: "top", title: { text: "Phase", standoff: 8 } },
      yaxis: { ...baseAxis, domain: [0.86, 1], title: { text: "FFT phase [deg]", standoff: 18 }, range: [-185, 185] },
      xaxis2: { ...baseAxis, domain: [0, 0.16], anchor: "y2", title: { text: "Integrated power", standoff: 8 } },
      yaxis2: {
        ...baseAxis,
        domain: [0.29, 0.80],
        anchor: "x2",
        showticklabels: false,
        title: { text: "" },
      },
      xaxis3: { ...baseAxis, domain: [0.28, 0.96], anchor: "y3", showticklabels: false, matches: "x" },
      yaxis3: { ...baseAxis, domain: [0.29, 0.80], title: { text: "Fluctuation frequency (cycles / P1)", standoff: 22 } },
      xaxis4: { ...baseAxis, domain: [0.28, 0.96], anchor: "y4", title: { text: "Phase", standoff: 8 }, matches: "x" },
      yaxis4: { ...baseAxis, domain: [0.02, 0.22], title: { text: "Mean intensity", standoff: 10 } },
      yaxis5: {
        ...baseAxis,
        domain: [0.02, 0.22],
        overlaying: "y4",
        side: "right",
        title: { text: "Modulation index", standoff: 8 },
        showgrid: false,
      },
      shapes: [],
      annotations: [
        ...(flucWarnings.length
          ? [{
              xref: "paper",
              yref: "paper",
              x: 0.6,
              y: 0.64,
              xanchor: "center",
              yanchor: "middle",
              showarrow: false,
              align: "center",
              text: flucWarnings.join("<br>"),
              font: { color: textColor, size: 13 },
              bgcolor: themeIsDark ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.92)",
              bordercolor: gridColor,
              borderwidth: 1,
            }]
          : []),
      ],
    });

    const dfsLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 500,
      margin: { l: 62, r: 82, t: 14, b: 64 },
      xaxis: { ...baseAxis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...baseAxis, domain: [0.30, 1], title: { text: "Fluctuation frequency (cycles / P1)", standoff: 8 } },
      xaxis2: { ...baseAxis, domain: [0, 1], anchor: "y2", title: { text: "Longitude frequency", standoff: 8 }, matches: "x" },
      yaxis2: { ...baseAxis, domain: [0, 0.22], title: { text: "Integrated power", standoff: 8 } },
      annotations: dfs.estimate?.P3
        ? [{
            xref: "paper",
            yref: "paper",
            x: 0.98,
            y: 0.98,
            xanchor: "right",
            yanchor: "top",
            showarrow: false,
            text: `P3 ${dfs.estimate.P3.toFixed(2)} P1`,
            font: { color: textColor, size: 12 },
          }]
        : [],
    });

    const p3Layout = lockCartesianInteractions({
      ...baseLayout,
      height: 500,
      margin: { l: 62, r: 58, t: 14, b: 58 },
      xaxis: { ...baseAxis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...baseAxis, domain: [0.54, 1], title: { text: "Frequency", standoff: 8 } },
      xaxis2: { ...baseAxis, domain: [0, 1], anchor: "y2", showticklabels: false },
      yaxis2: { ...baseAxis, domain: [0.27, 0.46], title: { text: "P3 (P1)", standoff: 8 } },
      xaxis3: { ...baseAxis, domain: [0, 1], anchor: "y3", title: { text: "Pulse window center", standoff: 8 } },
      yaxis3: { ...baseAxis, domain: [0, 0.19], title: { text: "P2 (bins)", standoff: 8 } },
    });

    const profileStabilisationLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 430,
      margin: { l: 72, r: 58, t: 14, b: 62 },
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.08, font: { color: textColor, size: 11 } },
      xaxis: { ...baseAxis, title: { text: "Number of pulses averaged", standoff: 8 }, type: "log" },
      yaxis: { ...baseAxis, title: { text: "1 - correlation", standoff: 8 }, type: "log" },
    });

    const acfPsdLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 480,
      margin: { l: 62, r: 58, t: 14, b: 60 },
      xaxis: { ...baseAxis, domain: [0, 1], anchor: "y", showticklabels: false },
      yaxis: { ...baseAxis, domain: [0.56, 1], title: { text: "ACF", standoff: 8 } },
      xaxis2: { ...baseAxis, domain: [0, 1], anchor: "y2", title: { text: "Frequency (cycles / P1)", standoff: 8 } },
      yaxis2: { ...baseAxis, domain: [0, 0.44], title: { text: "PSD", standoff: 8 } },
    });

    const nullFractionLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 430,
      margin: { l: 70, r: 58, t: 14, b: 62 },
      xaxis: { ...baseAxis, title: { text: "Threshold (off-pulse RMS units)", standoff: 8 } },
      yaxis: { ...baseAxis, title: { text: "Trial null fraction", standoff: 8 }, range: [0, 1] },
      annotations: Number.isFinite(Number(nullFraction?.default_null_fraction))
        ? [{
            xref: "paper",
            yref: "paper",
            x: 0.98,
            y: 0.08,
            xanchor: "right",
            yanchor: "bottom",
            showarrow: false,
            text: `NF@3σ ${(Number(nullFraction?.default_null_fraction) * 100).toFixed(1)}%`,
            font: { color: textColor, size: 12 },
          }]
        : [],
    });

    const adpLayout = lockCartesianInteractions({
      ...baseLayout,
      height: 430,
      margin: { l: 70, r: 58, t: 14, b: 62 },
      xaxis: { ...baseAxis, title: { text: "Phase lag (bins)", standoff: 8 } },
      yaxis: { ...baseAxis, title: { text: "Adjacent-pulse correlation", standoff: 8 } },
    });

    const sliding2dfsCenters = p3.sliding_2dfs_centers?.length ? p3.sliding_2dfs_centers : p3.centers;
    const sliding2dfsP3 = p3.sliding_2dfs_P3?.length ? p3.sliding_2dfs_P3 : p3.P3;
    const sliding2dfsP2 = p3.sliding_2dfs_P2_bins?.length ? p3.sliding_2dfs_P2_bins : [];
    const sliding2dfsPeakPower = p3.sliding_2dfs_peak_power?.length ? p3.sliding_2dfs_peak_power : p3.peak_power;

    return [
      {
        key: "pulse-energy-distribution",
        title: getEnergyPlotTitle(energyMode),
        data: [
          {
            type: "bar",
            x: onHistogram.x,
            y: onHistogram.y,
            width: onHistogram.width,
            name: "On-Pulse",
            marker: { color: "#dc2626", opacity: 0.68 },
            hovertemplate: `${plottedDistribution.hoverLabel} %{x:.3g}<br>density %{y:.3g}<extra></extra>`,
          },
          {
            type: "bar",
            x: offHistogram.x,
            y: offHistogram.y,
            width: offHistogram.width,
            name: "Off-Pulse",
            marker: { color: "#2563eb", opacity: 0.58 },
            hovertemplate: `off-pulse ${plottedDistribution.hoverLabel} %{x:.3g}<br>density %{y:.3g}<extra></extra>`,
          },
        ],
        layout: energyLayout,
        interactive: true,
      },
      {
        key: "intensity-histogram",
        title: "Phase-Resolved Distribution of Stokes I",
        data: [
          {
            type: "heatmap",
            x: intensity.phase_axis,
            y: intensity.bin_centers,
            z: intensityColorValues,
            colorscale: "Viridis",
            zmin: 0,
            zmax: intensityZMax,
            colorbar: { title: { text: "log10(count)" }, len: 0.62, y: 0.64 },
            hovertemplate: "phase %{x:.4f}<br>I %{y:.3g}<br>log10(count) %{z:.2f}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "lines",
            x: intensity.phase_axis,
            y: intensity.mean_profile,
            xaxis: "x2",
            yaxis: "y2",
            line: { color: textColor, width: 2 },
            hovertemplate: "phase %{x:.4f}<br>mean I %{y:.3g}<extra></extra>",
          },
        ],
        layout: intensityLayout,
        hasNegativeIntensityValues,
      },
      {
        key: "fluctuation-spectrum",
        title: "Longitude-Resolved Fluctuation Spectrum and Modulation Index",
        data: [
          {
            type: "scatter",
            mode: "markers",
            x: fluc.phase_axis,
            y: fluc.fft_phase ?? [],
            xaxis: "x",
            yaxis: "y",
            marker: { color: "#8a8a8a", size: 4, opacity: 0.9 },
            hovertemplate: "phase %{x:.4f}<br>FFT phase %{y:.1f} deg<extra></extra>",
            showlegend: false,
          },
          {
            type: "heatmap",
            x: fluc.phase_axis,
            y: fluc.frequency,
            z: fluc.log_power,
            xaxis: "x3",
            yaxis: "y3",
            colorscale: "Magma",
            zmin: flucPowerRange?.[0],
            zmax: flucPowerRange?.[1],
            colorbar: { title: { text: "log10(power)" }, len: 0.50, y: 0.545 },
            hovertemplate: "phase %{x:.4f}<br>freq %{y:.4f}<br>log10 power %{z:.2f}<extra></extra>",
            showscale: true,
            showlegend: false,
          },
          {
            type: "scatter",
            mode: "lines",
            x: integratedSpectrum,
            y: fluc.frequency,
            xaxis: "x2",
            yaxis: "y2",
            line: { color: "#6b7280", width: 1.8 },
            hovertemplate: "integrated power %{x:.3g}<br>freq %{y:.4f}<extra></extra>",
            showlegend: false,
          },
          ...(flucPeakFrequency !== null && flucPeakPower !== null && Number.isFinite(flucPeakPower)
            ? [{
                type: "scatter",
                mode: "lines",
                x: [0, flucPeakPower],
                y: [flucPeakFrequency, flucPeakFrequency],
                xaxis: "x2",
                yaxis: "y2",
                line: { color: "#f59e0b", width: 1.5, dash: "dot" },
                hoverinfo: "skip",
                showlegend: false,
              }]
            : []),
          {
            type: "scatter",
            mode: "lines",
            x: fluc.phase_axis,
            y: fluc.mean_profile,
            xaxis: "x4",
            yaxis: "y4",
            name: "Mean intensity",
            line: { color: textColor, width: 2 },
            hovertemplate: "phase %{x:.4f}<br>mean intensity %{y:.3g}<extra></extra>",
            showlegend: true,
          },
          {
            type: "scatter",
            mode: "markers",
            x: fluc.phase_axis,
            y: fluc.modulation_index,
            xaxis: "x4",
            yaxis: "y5",
            name: "Modulation index",
            marker: { color: "#7a7a7a", size: 5 },
            hovertemplate: "phase %{x:.4f}<br>m %{y:.3f}<extra></extra>",
            showlegend: true,
          },
        ],
        layout: flucLayout,
      },
      {
        key: "two-d-fluctuation-spectrum",
        title: "2D-FlucSpec",
        data: [
          {
            type: "heatmap",
            x: dfs.f2,
            y: dfs.f3,
            z: dfs.log_power,
            xaxis: "x",
            yaxis: "y",
            colorscale: "Cividis",
            colorbar: { title: { text: "log10(power)" }, len: 0.62, y: 0.66 },
            hovertemplate: "f2 %{x:.3f}<br>f3 %{y:.4f}<br>log10 power %{z:.2f}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "lines",
            x: dfs.f2,
            y: dfs.integrated_longitude_frequency_power ?? [],
            xaxis: "x2",
            yaxis: "y2",
            line: { color: textColor, width: 1.8 },
            hovertemplate: "f2 %{x:.3f}<br>integrated power %{y:.3g}<extra></extra>",
            showlegend: false,
          },
        ],
        layout: dfsLayout,
      },
      {
        key: "p2-p3-evolution-spectra",
        title: "P2 P3 Evolution Spectra",
        data: [
          {
            type: "heatmap",
            x: p3.centers,
            y: p3.frequency,
            z: p3.log_power,
            colorscale: "Magma",
            colorbar: { title: { text: "log10(power)" }, len: 0.62, y: 0.64 },
            hovertemplate: "center %{x:.0f}<br>freq %{y:.4f}<br>log10 power %{z:.2f}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "markers",
            x: sliding2dfsCenters,
            y: sliding2dfsP3,
            xaxis: "x2",
            yaxis: "y2",
            marker: { color: sliding2dfsPeakPower, colorscale: "Cividis", size: 6, showscale: false },
            hovertemplate: "center %{x:.0f}<br>P3 %{y:.3g} P1<extra></extra>",
          },
          {
            type: "scatter",
            mode: "markers",
            x: sliding2dfsCenters,
            y: sliding2dfsP2,
            xaxis: "x3",
            yaxis: "y3",
            marker: { color: sliding2dfsPeakPower, colorscale: "Cividis", size: 6, showscale: false },
            hovertemplate: "center %{x:.0f}<br>P2 %{y:.3g} bins<extra></extra>",
          },
        ],
        layout: p3Layout,
      },
      ...(profileStabilisation ? [{
        key: "profile-stabilisation",
        title: "Profile Stabilisation",
        data: [
          {
            type: "scatter",
            mode: "lines+markers",
            x: profileStabilisation.pulse_count,
            y: profileStabilisation.one_minus_correlation,
            name: "1 - rho",
            marker: { size: 4, color: "#2563eb" },
            line: { color: "#2563eb", width: 2 },
            hovertemplate: "N %{x}<br>1-rho %{y:.3g}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "lines",
            x: profileStabilisation.pulse_count,
            y: profileStabilisation.reference,
            name: "N^-1/2 reference",
            line: { color: "#ef4444", width: 1.5, dash: "dash" },
            hovertemplate: "N %{x}<br>reference %{y:.3g}<extra></extra>",
          },
        ],
        layout: profileStabilisationLayout,
      }] : []),
      ...(acfPsd ? [{
        key: "acf-psd",
        title: "Pulse-Energy ACF and PSD",
        data: [
          {
            type: "scatter",
            mode: "lines",
            x: acfPsd.lag,
            y: acfPsd.acf,
            line: { color: "#14b8a6", width: 2 },
            hovertemplate: "lag %{x}<br>ACF %{y:.3g}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "lines",
            x: acfPsd.frequency,
            y: acfPsd.psd,
            xaxis: "x2",
            yaxis: "y2",
            line: { color: "#f97316", width: 2 },
            hovertemplate: "freq %{x:.4f}<br>PSD %{y:.3g}<extra></extra>",
          },
        ],
        layout: acfPsdLayout,
      }] : []),
      ...(nullFraction ? [{
        key: "trial-null-fraction",
        title: "Trial Null Fraction",
        data: [
          {
            type: "scatter",
            mode: "lines",
            x: nullFraction.threshold_sigma,
            y: nullFraction.null_fraction,
            line: { color: "#8b5cf6", width: 2.5 },
            hovertemplate: "threshold %{x:.2f} sigma<br>null fraction %{y:.3f}<extra></extra>",
          },
          {
            type: "scatter",
            mode: "lines",
            x: [nullFraction.default_threshold_sigma ?? 3, nullFraction.default_threshold_sigma ?? 3],
            y: [0, 1],
            line: { color: "#ef4444", width: 1.5, dash: "dot" },
            hoverinfo: "skip",
            showlegend: false,
          },
        ],
        layout: nullFractionLayout,
      }] : []),
      ...(adp ? [{
        key: "adp",
        title: "Adjacent-Pulse Drift Profile",
        data: [
          {
            type: "scatter",
            mode: "lines",
            x: adp.phase_lag_bins,
            y: adp.correlation,
            line: { color: "#0ea5e9", width: 2 },
            hovertemplate: "phase lag %{x}<br>correlation %{y:.3g}<extra></extra>",
          },
        ],
        layout: adpLayout,
      }] : []),
    ];
  }, [data, axisColor, energyMode, gridColor, paperBg, plotBg, template, textColor, themeIsDark]);

  const fullscreenItem = fullscreenKey ? items.find(item => item.key === fullscreenKey) : null;

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-6 xl:grid-cols-2">
      {items.map(item => (
        <div key={item.key} className={`plot-export-scope min-w-0 ${item.key === "fluctuation-spectrum" ? "xl:col-span-2" : ""}`}>
          <div className="plot-toolbar mb-2">
            <FullscreenIconButton onClick={() => setFullscreenKey(item.key)} title="Fullscreen" />
            <PlotExportButtons filename={`${filenamePrefix}-total-intensity-${item.key}`} />
            <div className="plot-panel-title text-foreground">{item.title}</div>
            {item.key === "pulse-energy-distribution" && (
              <EnergyNormalizationControl
                value={energyMode}
                onChange={setEnergyMode}
                isDark={themeIsDark}
              />
            )}
          </div>
          {item.key === "pulse-energy-distribution" && (
            <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
              <p>{getEnergyPlotDescription(energyMode, data.pulse_energy_distribution.description)}</p>
              <p>{ENERGY_VIEWPORT_NOTE}</p>
            </div>
          )}
          {item.key === "intensity-histogram" && (
            <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
              <p>{STOKES_I_HISTOGRAM_DESCRIPTION}</p>
              {item.hasNegativeIntensityValues && <p>{STOKES_I_HISTOGRAM_NOTE}</p>}
            </div>
          )}
          {item.key === "fluctuation-spectrum" && (
            <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
              <p>{FLUCTUATION_SPECTRUM_DESCRIPTION}</p>
              {data.fluctuation_spectrum.p3_estimate && (
                <p className="font-semibold text-amber-600 dark:text-amber-300">
                  Absolute peak P3 = {data.fluctuation_spectrum.p3_estimate.toFixed(2)} P1
                  {data.fluctuation_spectrum.f_peak ? ` at f = ${data.fluctuation_spectrum.f_peak.toFixed(4)} cycles / P1` : ""}
                </p>
              )}
              {data.fluctuation_spectrum.previous_p3_estimate && (
                <p className="font-semibold text-sky-600 dark:text-sky-300">
                  Low-frequency-excluded peak P3 = {data.fluctuation_spectrum.previous_p3_estimate.toFixed(2)} P1
                  {data.fluctuation_spectrum.previous_f_peak ? ` at f = ${data.fluctuation_spectrum.previous_f_peak.toFixed(4)} cycles / P1` : ""}
                </p>
              )}
              {formatP3Candidates(data.fluctuation_spectrum.p3_candidates) && (
                <p className="text-foreground">
                  Local LRFS feature candidates: {formatP3Candidates(data.fluctuation_spectrum.p3_candidates)}
                </p>
              )}
            </div>
          )}
          <Plot
            data={item.data}
            layout={item.layout}
            config={paperPlotConfig(`total-intensity-${item.key}`, { interactive: item.interactive })}
            useResizeHandler
            style={{ width: "100%", height: `${item.layout.height ?? 430}px` }}
            key={`${item.key}-${data.start_phase}-${data.end_phase}-${themeIsDark ? "dark" : "light"}`}
            revision={TOTAL_INTENSITY_PLOT_RENDER_VERSION}
          />
        </div>
      ))}

      {fullscreenItem && (
        <FullscreenOverlay onClose={() => setFullscreenKey(null)} contentClassName="w-[95vw] max-w-7xl h-[90vh]" title={`${fullscreenItem.title} fullscreen`}>
          <div className="plot-export-scope h-full w-full p-3 pt-10">
            <div className="plot-toolbar mb-2">
              <PlotExportButtons filename={`${filenamePrefix}-total-intensity-${fullscreenItem.key}-fullscreen`} />
              {fullscreenItem.key === "pulse-energy-distribution" && (
                <EnergyNormalizationControl
                  value={energyMode}
                  onChange={setEnergyMode}
                  isDark={themeIsDark}
                />
              )}
            </div>
            {fullscreenItem.key === "pulse-energy-distribution" && (
              <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
                <p>{getEnergyPlotDescription(energyMode, data.pulse_energy_distribution.description)}</p>
                <p>{ENERGY_VIEWPORT_NOTE}</p>
              </div>
            )}
            {fullscreenItem.key === "intensity-histogram" && (
              <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
                <p>{STOKES_I_HISTOGRAM_DESCRIPTION}</p>
                {fullscreenItem.hasNegativeIntensityValues && <p>{STOKES_I_HISTOGRAM_NOTE}</p>}
              </div>
            )}
            {fullscreenItem.key === "fluctuation-spectrum" && (
              <div className="mb-2 space-y-1 px-1 text-xs leading-snug text-foreground">
                <p>{FLUCTUATION_SPECTRUM_DESCRIPTION}</p>
                {data.fluctuation_spectrum.p3_estimate && (
                  <p className="font-semibold text-amber-600 dark:text-amber-300">
                    Absolute peak P3 = {data.fluctuation_spectrum.p3_estimate.toFixed(2)} P1
                    {data.fluctuation_spectrum.f_peak ? ` at f = ${data.fluctuation_spectrum.f_peak.toFixed(4)} cycles / P1` : ""}
                  </p>
                )}
                {data.fluctuation_spectrum.previous_p3_estimate && (
                  <p className="font-semibold text-sky-600 dark:text-sky-300">
                    Low-frequency-excluded peak P3 = {data.fluctuation_spectrum.previous_p3_estimate.toFixed(2)} P1
                    {data.fluctuation_spectrum.previous_f_peak ? ` at f = ${data.fluctuation_spectrum.previous_f_peak.toFixed(4)} cycles / P1` : ""}
                  </p>
                )}
                {formatP3Candidates(data.fluctuation_spectrum.p3_candidates) && (
                  <p className="text-foreground">
                    Local LRFS feature candidates: {formatP3Candidates(data.fluctuation_spectrum.p3_candidates)}
                  </p>
                )}
              </div>
            )}
            <Plot
              data={fullscreenItem.data}
              layout={{ ...fullscreenItem.layout, height: undefined, autosize: true }}
              config={paperPlotConfig(`total-intensity-${fullscreenItem.key}-fullscreen`, { interactive: fullscreenItem.interactive })}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              key={`${fullscreenItem.key}-fullscreen-${data.start_phase}-${data.end_phase}-${themeIsDark ? "dark" : "light"}`}
              revision={TOTAL_INTENSITY_PLOT_RENDER_VERSION}
            />
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}

function finiteNumbers(values: NumericArray) {
  return values
    .filter(value => value !== null && value !== undefined)
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
}

function getPulseDistributionValues(
  energy: TotalIntensityEvolutionPayload["pulse_energy_distribution"],
  mode: EnergyDistributionMode,
) {
  const rawOnPulse = finiteNumbers(energy.raw_on_pulse_energy?.length ? energy.raw_on_pulse_energy : energy.on_pulse_energy);
  const rawOffPulse = finiteNumbers(energy.raw_off_pulse_energy?.length ? energy.raw_off_pulse_energy : energy.off_pulse_energy);
  const onPulsePeak = finiteNumbers(energy.on_pulse_peak_intensity ?? []);
  const offPulsePeak = finiteNumbers(energy.off_pulse_peak_intensity ?? []);
  const kind = getDistributionKind(mode);
  const onValues = kind === "peak" ? onPulsePeak : rawOnPulse;
  const offValues = kind === "peak" ? offPulsePeak : rawOffPulse;
  let factor = 1;

  if (mode.endsWith("mean_profile_peak")) {
    factor = Number(energy.mean_profile_peak);
  } else if (mode.endsWith("mean_on")) {
    factor = onValues.length
      ? onValues.reduce((sum, value) => sum + value, 0) / onValues.length
      : 1;
  } else if (mode.endsWith("off_rms")) {
    factor = offValues.length
      ? Math.sqrt(offValues.reduce((sum, value) => sum + value * value, 0) / offValues.length)
      : 1;
  }

  if (!Number.isFinite(factor) || factor <= 1e-12) {
    return { onPulse: [], offPulse: [], hoverLabel: kind === "peak" ? "peak I" : "energy" };
  }
  return {
    onPulse: onValues.map(value => value / factor),
    offPulse: offValues.map(value => value / factor),
    hoverLabel: kind === "peak" ? "peak I" : "energy",
  };
}

function getPaddedRangeForSeries(series: number[][], lowerBound?: number): [number, number] | undefined {
  const extent = getFiniteExtentForSeries(series);
  if (!extent) return undefined;
  return getPaddedRangeFromExtent(extent, lowerBound);
}

function getPaddedRangeFromExtent(extent: { min: number; max: number }, lowerBound?: number): [number, number] {
  let { min, max } = extent;
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [lowerBound ?? min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  min = lowerBound ?? min - pad;
  max += pad;
  return [min, max];
}

function getExplicitBinsForSeries(series: number[][], binCount: number) {
  if (binCount < 1) return null;
  const extent = getFiniteExtentForSeries(series);
  if (!extent) return null;
  const { min, max } = extent;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  const padded = getPaddedRangeFromExtent(extent);
  if (!padded) return null;
  const width = (padded[1] - padded[0]) / binCount;
  if (!Number.isFinite(width) || width <= 0) return null;
  return { start: padded[0], end: padded[1], size: width };
}

function getDensityBars(values: number[], bins: { start: number; end: number; size: number }) {
  if (!values.length) return { x: [], y: [], width: bins.size };
  const min = bins.start;
  const max = bins.end;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { x: [], y: [], width: bins.size };
  if (min === max) return { x: [min], y: [1], width: bins.size };

  const width = bins.size;
  const binCount = Math.max(1, Math.ceil((max - min) / width));
  if (width <= 0 || !Number.isFinite(width)) return { x: [], y: [], width };
  const counts = new Array(binCount).fill(0);
  let finiteCount = 0;
  values.forEach(value => {
    if (!Number.isFinite(value)) return;
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
    counts[index] += 1;
    finiteCount += 1;
  });
  if (!finiteCount) return { x: [], y: [], width };
  return {
    x: counts.map((_, index) => min + (index + 0.5) * width),
    y: counts.map(count => count / (finiteCount * width)),
    width,
  };
}

function getFiniteExtentForSeries(series: number[][]) {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  series.forEach(values => {
    values.forEach(value => {
      if (!Number.isFinite(value)) return;
      if (value < min) min = value;
      if (value > max) max = value;
      count += 1;
    });
  });
  return count ? { min, max, count } : null;
}

function getEnergyXAxisLabel(mode: EnergyDistributionMode) {
  if (mode === "peak_i_over_mean_profile_peak") return "Peak intensity / mean profile peak";
  const kind = getDistributionKind(mode);
  const quantity = kind === "peak" ? "Peak intensity" : "Pulse energy";
  if (mode.endsWith("mean_on")) return "Pulse energy / mean on-pulse energy";
  if (mode.endsWith("off_rms")) return `${quantity} / off-pulse RMS`;
  return quantity;
}

function getEnergyYAxisLabel(mode: EnergyDistributionMode) {
  if (getDistributionKind(mode) === "peak") return "Density (count / N ΔI_peak)";
  return "Density (count / N ΔE)";
}

function getEnergyPlotTitle(mode: EnergyDistributionMode) {
  if (getDistributionKind(mode) === "peak") return "Probability Density Distribution of Peak Intensities";
  return "Probability Density Distribution of Pulse Energies";
}

function getEnergyPlotDescription(mode: EnergyDistributionMode, fallback?: string) {
  if (getDistributionKind(mode) === "peak") {
    return "Shows pulse-to-pulse variability in maximum baseline-subtracted intensity within the selected window, normalized by the peak of the integrated profile.";
  }
  if (mode === "energy_off_rms") return "Shows pulse energy relative to the off-pulse noise energy scale.";
  return fallback || "Shows pulse-to-pulse variability in total baseline-subtracted pulse energy, normalized by the mean on-pulse energy.";
}

function getDistributionKind(mode: EnergyDistributionMode): "energy" | "peak" {
  if (mode.startsWith("peak")) return "peak";
  return "energy";
}

function EnergyNormalizationControl({
  value,
  onChange,
  isDark,
}: {
  value: EnergyDistributionMode;
  onChange: (value: EnergyDistributionMode) => void;
  isDark: boolean;
}) {
  const activeClass = isDark ? "bg-white/15 text-white" : "bg-gray-900 text-white";
  const inactiveClass = isDark ? "text-gray-200 hover:bg-white/5" : "text-gray-800 hover:bg-black/5";

  return (
    <div className="ml-auto inline-flex flex-wrap overflow-hidden rounded-md border border-border bg-background text-xs font-semibold" aria-label="Pulse energy distribution mode">
      {ENERGY_NORMALIZATION_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          className={`px-3 py-1 transition-colors ${value === option.value ? activeClass : inactiveClass}`}
          onClick={() => onChange(option.value)}
          title={option.title}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const ENERGY_NORMALIZATION_OPTIONS: Array<{ value: EnergyDistributionMode; label: string; title: string }> = [
  { value: "energy_mean_on", label: "Energy / Mean", title: "Plot pulse energy normalized by mean on-pulse energy" },
  { value: "energy_off_rms", label: "Energy / Off RMS", title: "Plot pulse energy normalized by off-pulse RMS energy" },
  { value: "peak_i_over_mean_profile_peak", label: "Peak I / Profile", title: "Plot peak intensity normalized by the peak of the integrated profile" },
];

function getInitialDensityRange(values: NumericArray): [number, number] | undefined {
  const densities = finiteNumbers(values).filter(value => value > 0);
  if (!densities.length) return undefined;
  const maxDensity = Math.max(...densities);
  if (!Number.isFinite(maxDensity) || maxDensity <= 0) return undefined;

  let upperBase = maxDensity;
  const p98 = percentile(densities, 98);
  if (Number.isFinite(p98) && p98 > 0 && maxDensity > 3.0 * p98) {
    upperBase = p98;
  }

  const upper = 1.15 * upperBase;
  if (!Number.isFinite(upper) || upper <= 0) return undefined;
  return [0, upper];
}

function percentile(values: number[], percentileValue: number) {
  const sorted = values.filter(value => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function getDistributionWarnings(
  energy: TotalIntensityEvolutionPayload["pulse_energy_distribution"],
  onValues: number[],
  offValues: number[],
) {
  const warnings = Array.isArray(energy.warnings) ? [...energy.warnings] : [];
  if (!onValues.length) warnings.push("No finite on-pulse values for this mode.");
  if (!offValues.length) warnings.push("No finite off-pulse reference values for this mode.");
  return [...new Set(warnings)];
}

function getRobustPositiveMax(values: NumericArray[]) {
  const flat = values.flatMap(row => finiteNumbers(row)).filter(value => value > 0);
  if (!flat.length) return undefined;
  flat.sort((left, right) => left - right);
  const percentileIndex = Math.min(flat.length - 1, Math.floor(flat.length * 0.98));
  return Math.max(1, flat[percentileIndex]);
}

function getRobustMatrixRange(values: NumericArray[], lowerPercentile: number, upperPercentile: number): [number, number] | undefined {
  const flat = values.flatMap(row => finiteNumbers(row));
  if (!flat.length) return undefined;
  const low = percentile(flat, lowerPercentile);
  const high = percentile(flat, upperPercentile);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) return undefined;
  return [low, high];
}

function getIntegratedSpectrum(integratedSpectrum: NumericArray, logPowerMatrix: NumericArray[]): NumericArray {
  const fromBackend = integratedSpectrum.map(value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  });
  if (finiteNumbers(fromBackend).length) return fromBackend;
  return logPowerMatrix.map(row => {
    const linearPowerSum = finiteNumbers(row)
      .map(value => 10 ** value)
      .reduce((sum, value) => sum + value, 0);
    return linearPowerSum > 0 ? linearPowerSum : null;
  });
}

function getNearestFiniteIndex(xValues: NumericArray, target: number | null | undefined, yValues: NumericArray) {
  if (target !== null && target !== undefined && Number.isFinite(Number(target))) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    xValues.forEach((value, index) => {
      const x = Number(value);
      const y = Number(yValues[index]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const distance = Math.abs(x - Number(target));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) return bestIndex;
  }

  let maxIndex = -1;
  let maxValue = Number.NEGATIVE_INFINITY;
  yValues.forEach((value, index) => {
    const y = Number(value);
    if (!Number.isFinite(y)) return;
    if (y > maxValue) {
      maxValue = y;
      maxIndex = index;
    }
  });
  return maxIndex;
}

function formatP3Candidates(candidates: TotalIntensityEvolutionPayload["fluctuation_spectrum"]["p3_candidates"]) {
  const valid = (candidates ?? [])
    .filter(candidate => Number.isFinite(Number(candidate?.P3)) && Number.isFinite(Number(candidate?.frequency)))
    .slice(0, 5);
  if (!valid.length) return "";
  return valid
    .map(candidate => {
      const rank = Number(candidate.rank ?? 0);
      const p3 = Number(candidate.P3);
      const frequency = Number(candidate.frequency);
      const contrast = Number(candidate.local_contrast);
      const contrastText = Number.isFinite(contrast) ? `, contrast ${contrast.toFixed(2)}` : "";
      return `#${rank || "?"}: P3 ${p3.toFixed(2)} P1 (f ${frequency.toFixed(4)}${contrastText})`;
    })
    .join("; ");
}
