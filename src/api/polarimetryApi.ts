import { readPlotResponseCache, writePlotResponseCache } from "@/lib/plotResponseCache";

export const DEFAULT_MEERTIME_NPZ_URL =
  "https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz";

export const POLARISATION_QUANTITIES = ["PA", "EA", "P/I", "L/I", "V/I", "|V/I|"] as const;
export const POLARISATION_STACK_QUANTITIES = ["PA", "EA", "P/I", "L/I", "|V/I|", "V/I"] as const;
export const PHASE_SLICE_QUANTITIES = ["P/I", "L/I", "|V/I|", "V/I", "PA", "EA"] as const;

export const POLARIMETRY_ENDPOINTS = {
  prepareDataset: "/prepare_dataset",
  poincareAitoffFixedPhase: "/poincare_sphere_aitoff_fixedphase",
  profiles: "/export_profiles",
  heatmaps: "/export_heatmaps",
  polarisationHistogram: "/polarisation_histogram",
  polarisationStack: "/polarisation_stack",
  polarisationStacks: "/polarisation_stacks",
  polarisationParams: "/polarisation_params",
  rvmFit: "/rvm_fit",
  phaseSliceHistogram: "/phase_slice_histogram",
  phaseSliceHistograms: "/phase_slice_histograms",
  totalIntensityEvolution: "/total_intensity_evolution",
} as const;

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();
const NORMALIZED_CONFIGURED_API_BASE_URL = CONFIGURED_API_BASE_URL?.replace(/\/$/, "");
const RENDER_API_BASE_URL = "https://pulsarprespidar-fastapi-phar.onrender.com";
const DEFAULT_API_BASE_URL = import.meta.env.PROD ? "/backend" : "http://localhost:8000";
const API_BASE_URL = (
  import.meta.env.PROD && NORMALIZED_CONFIGURED_API_BASE_URL === RENDER_API_BASE_URL
    ? "/backend"
    : NORMALIZED_CONFIGURED_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");
const CONFIGURED_MEERTIME_PROXY_URL = import.meta.env.VITE_MEERTIME_PROXY_URL?.trim();
const MEERTIME_PROXY_URL = (CONFIGURED_MEERTIME_PROXY_URL || `${API_BASE_URL}/meertime-proxy`).replace(/\/$/, "");
const MEERTIME_HOST = "psrweb.jb.man.ac.uk";
const PLOTS_MARKER = "/plots/";

export type RemoteAuthCredentials = {
  username: string;
  password: string;
};

export type PhaseRange = {
  start: number;
  end: number;
};

export type OnPulseWindow = PhaseRange & { mid: number };

export type ObservationMetadata = {
  obsId: string;
  freq: string;
  utcStart: string;
};

export type RemoteFileLoadResult = {
  blob: Blob;
  onPulse: OnPulseWindow;
  onPulseWindows: OnPulseWindow[];
  metadata: ObservationMetadata | null;
};

export type PreparedDatasetSource = {
  dataKey: string;
  fallbackFile?: File | Blob | null;
};

export type DatasetSource = File | Blob | PreparedDatasetSource;

export type PreparedDatasetResult = {
  data_key: string;
  filename: string;
  shape: number[];
  dtype: string;
  on_pulse: PhaseRange;
  cache_items?: Record<string, number>;
};

export function isInvalidPhaseRange(start: number, end: number) {
  return start > end;
}

export function isMeerTimeUrl(url: string) {
  try {
    return new URL(url).host === MEERTIME_HOST;
  } catch {
    return false;
  }
}

function buildApiUrl(path: string, params?: URLSearchParams) {
  return params ? `${API_BASE_URL}${path}?${params.toString()}` : `${API_BASE_URL}${path}`;
}

function isPreparedDatasetSource(source: DatasetSource): source is PreparedDatasetSource {
  return typeof source === "object" && "dataKey" in source;
}

function buildPlotResponseCacheKey(path: string, params: URLSearchParams) {
  const sortedParams = Array.from(params.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    ));
  return `${path}?${new URLSearchParams(sortedParams).toString()}`;
}

async function readResponseError(response: Response, fallback: string) {
  let body = "";
  try {
    body = await response.text();
  } catch {
    return fallback;
  }

  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body);
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map(item => {
          const location = Array.isArray(item?.loc) ? item.loc.join(".") : "";
          const message = item?.msg ?? JSON.stringify(item);
          return location ? `${location}: ${message}` : String(message);
        })
        .join("; ");
    }
    if (parsed?.message) return String(parsed.message);
  } catch {
    // Non-JSON upstream responses are still useful, especially auth pages.
  }

  return body.slice(0, 500);
}

function isLikelyNumpyPayload(bytes: Uint8Array) {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isNpy = bytes[0] === 0x93
    && bytes[1] === 0x4e
    && bytes[2] === 0x55
    && bytes[3] === 0x4d
    && bytes[4] === 0x50
    && bytes[5] === 0x59;
  return isZip || isNpy;
}

async function postDatasetJson<T>(path: string, source: DatasetSource, params: URLSearchParams): Promise<T> {
  const formData = new FormData();
  let cacheKey: string | null = null;
  if (isPreparedDatasetSource(source)) {
    params.set("data_key", source.dataKey);
    cacheKey = buildPlotResponseCacheKey(path, params);
  } else {
    formData.append("file", source);
  }

  if (cacheKey) {
    const cached = await readPlotResponseCache<T>(cacheKey);
    if (cached.hit) return cached.value;
  }

  const requestUrl = buildApiUrl(path, params);

  const response = await fetch(requestUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 404 && isPreparedDatasetSource(source) && source.fallbackFile) {
      const retryParams = new URLSearchParams(params);
      retryParams.delete("data_key");
      return postDatasetJson(path, source.fallbackFile, retryParams);
    }
    const detail = await readResponseError(response, `Request failed: ${path}`);
    throw new Error(`Request failed: ${path} (${response.status}): ${detail}`);
  }

  const payload = await response.json() as T;
  if (cacheKey) {
    writePlotResponseCache(cacheKey, payload);
  }
  return payload;
}

export async function prepareDataset(file: File | Blob, onPulse: PhaseRange): Promise<PreparedDatasetResult> {
  const formData = new FormData();
  formData.append("file", file);
  const requestUrl = buildApiUrl(
    POLARIMETRY_ENDPOINTS.prepareDataset,
    new URLSearchParams({
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
    }),
  );

  const response = await fetch(requestUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await readResponseError(response, "Dataset preparation failed.");
    throw new Error(`Dataset preparation failed (${response.status}): ${detail}`);
  }

  return response.json() as Promise<PreparedDatasetResult>;
}

export async function fetchPoincareAitoffData(source: DatasetSource, phaseValue: number, onPulse: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.poincareAitoffFixedPhase,
    source,
    new URLSearchParams({
      phase_value: String(phaseValue),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      payload_version: "2",
    }),
  );
}

export async function fetchProfilesData(source: DatasetSource, phaseRange: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.profiles,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
    }),
  );
}

export async function fetchHeatmapsData(source: DatasetSource, phaseRange: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.heatmaps,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
    }),
  );
}

export async function fetchTotalIntensityEvolution(source: DatasetSource, phaseRange: PhaseRange, onPulse: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.totalIntensityEvolution,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      normalization: "energy_mean_on",
      payload_version: "20",
    }),
  );
}

export async function fetchPolarisationHistogram(source: DatasetSource, quantity: string, phaseRange: PhaseRange, onPulse: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationHistogram,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      quantity,
      sigma_threshold: "3",
      payload_version: "2",
    }),
  );
}

export async function fetchPolarisationHistograms(
  source: DatasetSource,
  phaseRange: PhaseRange,
  onPulse: PhaseRange,
  onItem?: (quantity: string, payload: unknown) => void,
) {
  const results: Record<string, unknown> = {};
  let successCount = 0;

  for (const quantity of POLARISATION_QUANTITIES) {
    try {
      results[quantity] = await fetchPolarisationHistogram(source, quantity, phaseRange, onPulse);
      onItem?.(quantity, results[quantity]);
      successCount += 1;
    } catch (error) {
      console.error(`Error fetching polarisation histogram ${quantity}:`, error);
      results[quantity] = null;
    }
  }

  if (successCount === 0) {
    throw new Error("All polarisation histogram requests failed.");
  }

  return results;
}

export async function fetchPolarisationStack(source: DatasetSource, quantity: string, phaseRange: PhaseRange, onPulse: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationStack,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      quantity,
      sigma_threshold: "3",
      payload_version: "3",
    }),
  );
}

export async function fetchPolarisationStacks(
  source: DatasetSource,
  phaseRange: PhaseRange,
  onPulse: PhaseRange,
  onItem?: (quantity: string, payload: unknown) => void,
) {
  const aggregate: {
    obs_id?: string;
    start_phase?: number;
    end_phase?: number;
    on_pulse?: PhaseRange;
    phase_axis?: number[];
    pulse_number?: number[];
    quantities: Array<{ key?: string; name: string; data: Array<Array<number | null>>; vmin?: number; vmax?: number }>;
  } = {
    quantities: [],
  };
  let successCount = 0;

  for (const quantity of POLARISATION_STACK_QUANTITIES) {
    try {
      const payload = await fetchPolarisationStack(source, quantity, phaseRange, onPulse) as any;
      if (!aggregate.obs_id) {
        aggregate.obs_id = payload.obs_id;
        aggregate.start_phase = payload.start_phase;
        aggregate.end_phase = payload.end_phase;
        aggregate.on_pulse = payload.on_pulse;
        aggregate.phase_axis = payload.phase_axis;
        aggregate.pulse_number = payload.pulse_number;
      }
      if (payload.quantity) {
        aggregate.quantities.push(payload.quantity);
        onItem?.(quantity, payload);
        successCount += 1;
      }
    } catch (error) {
      console.error(`Error fetching polarisation stack ${quantity}:`, error);
    }
  }

  if (successCount === 0) {
    throw new Error("All polarisation stack requests failed.");
  }

  return aggregate;
}

export async function fetchPolarisationParams(
  source: DatasetSource,
  phaseRange: PhaseRange,
  onPulse: PhaseRange,
  maxPulses = 0,
  pulseIndex?: number,
) {
  const params = new URLSearchParams({
    start_phase: String(phaseRange.start),
    end_phase: String(phaseRange.end),
    on_pulse_start: String(onPulse.start),
    on_pulse_end: String(onPulse.end),
    max_pulses: String(maxPulses),
    sigma_threshold: "3",
    payload_version: "2",
  });

  if (pulseIndex !== undefined) {
    params.set("pulse_index", String(pulseIndex));
  }

  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationParams,
    source,
    params,
  );
}

export async function fetchRvmFit(source: DatasetSource, phaseRange: PhaseRange, onPulse: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.rvmFit,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      sigma_threshold: "3",
      phase_bins: "96",
      pa_bins: "120",
      payload_version: "1",
    }),
  );
}

export async function fetchPhaseSliceHistogram(
  source: DatasetSource,
  quantity: string,
  phases: { left: number; mid: number; right: number },
  onPulse: PhaseRange,
) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.phaseSliceHistogram,
    source,
    new URLSearchParams({
      left_phase: String(phases.left),
      mid_phase: String(phases.mid),
      right_phase: String(phases.right),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      quantity,
      sigma_threshold: "3",
      payload_version: "2",
    }),
  );
}

export async function fetchPhaseSliceHistograms(
  source: DatasetSource,
  phases: { left: number; mid: number; right: number },
  onPulse: PhaseRange,
  onItem?: (quantity: string, payload: unknown) => void,
) {
  const aggregate: {
    obs_id?: string;
    phase_values?: number[];
    phase_bins?: number[];
    quantities: Array<{
      key?: string;
      name: string;
      phase_slices: Array<{
        phase_value: number;
        phase_bin_index: number;
        bin_edges: number[];
        counts: number[];
        x_limits?: [number, number] | null;
        stats: {
          min: number | null;
          max: number | null;
          mean: number | null;
          std: number | null;
          num_pulses: number;
          finite_values?: number;
          valid_values?: number;
          masked_fraction?: number | null;
          outside_display_range?: number;
          fraction_outside_display_range?: number | null;
        };
      }>;
      warnings?: string[];
      metadata?: Record<string, unknown>;
    }>;
  } = {
    quantities: [],
  };
  let successCount = 0;

  for (const quantity of PHASE_SLICE_QUANTITIES) {
    try {
      const payload = await fetchPhaseSliceHistogram(source, quantity, phases, onPulse) as any;
      if (!aggregate.obs_id) {
        aggregate.obs_id = payload.obs_id;
        aggregate.phase_values = payload.phase_values;
        aggregate.phase_bins = payload.phase_bins;
      }
      if (payload.quantity) {
        aggregate.quantities.push(payload.quantity);
        onItem?.(quantity, payload);
        successCount += 1;
      }
    } catch (error) {
      console.error(`Error fetching phase-slice histogram ${quantity}:`, error);
    }
  }

  if (successCount === 0) {
    throw new Error("All phase-slice histogram requests failed.");
  }

  return aggregate;
}

function resolveRemoteFetchUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.host !== MEERTIME_HOST) return url;

    return `${MEERTIME_PROXY_URL}?${new URLSearchParams({ url }).toString()}`;
  } catch {
    return url;
  }
}

function getPipelineInfoUrl(fetchUrl: string) {
  const markerIndex = fetchUrl.indexOf(PLOTS_MARKER);
  if (markerIndex === -1) return null;
  return fetchUrl.slice(0, markerIndex + PLOTS_MARKER.length) + "pipeline_info.json";
}

function extractObsId(url: string, pipelineInfo: Record<string, any>): string {
  const match = url.match(/singlepulse\/([^/]+)\/([^/]+)\//);
  if (!match) return "Unknown";

  const pulsar = match[1];
  const datetimeStr = match[2];
  const dateParts = datetimeStr.split("-");
  const date = dateParts.length >= 3 ? dateParts.slice(0, 3).join("-") : datetimeStr;
  const time = dateParts.length >= 3 ? dateParts.slice(3).join("-") : "Unknown";
  const freq = pipelineInfo?.input_data?.header?.FREQ ?? pipelineInfo?.header?.FREQ ?? 0;
  const freqRounded = Number(freq).toFixed(2);

  return `Pulsar-${pulsar}_Date-${date}_Time-${time}_Obs_Freq-${freqRounded}_MHz`;
}

function metadataFromPipeline(url: string, pipelineInfo: Record<string, any>): ObservationMetadata {
  const freq = pipelineInfo?.input_data?.header?.FREQ ?? pipelineInfo?.header?.FREQ ?? "Unknown";
  const utcStart = pipelineInfo?.input_data?.header?.UTC_START ?? pipelineInfo?.header?.UTC_START ?? "Unknown";

  return {
    obsId: extractObsId(url, pipelineInfo),
    freq: typeof freq === "number" ? freq.toFixed(2) : String(freq),
    utcStart: String(utcStart),
  };
}

function isProxiedMeerTimeFetchUrl(fetchUrl: string) {
  try {
    const proxyUrl = new URL(MEERTIME_PROXY_URL, window.location.origin);
    const parsedFetchUrl = new URL(fetchUrl, window.location.origin);
    return parsedFetchUrl.origin === proxyUrl.origin && parsedFetchUrl.pathname === proxyUrl.pathname;
  } catch {
    return false;
  }
}

function getRemoteRequestInit(fetchUrl: string, credentials?: RemoteAuthCredentials): RequestInit | undefined {
  if (!credentials?.username || !credentials.password) return undefined;
  const authorization = "Basic " + btoa(credentials.username + ":" + credentials.password);
  const headers: Record<string, string> = {
    Authorization: authorization,
  };

  if (isProxiedMeerTimeFetchUrl(fetchUrl)) {
    headers["X-Upstream-Authorization"] = authorization;
    headers["X-MeerTime-Authorization"] = authorization;
  }

  return {
    headers,
  };
}

export async function loadRemoteNpz(url: string, credentials?: RemoteAuthCredentials): Promise<RemoteFileLoadResult> {
  const fetchUrl = resolveRemoteFetchUrl(url);
  const requestInit = getRemoteRequestInit(fetchUrl, credentials);
  let onPulseWindows: OnPulseWindow[] = [{ start: 0, end: 1, mid: 0.5 }];
  let pipelineJson: Record<string, any> | null = null;

  const pipelineInfoUrl = getPipelineInfoUrl(url);
  if (pipelineInfoUrl) {
    try {
      const pipelineFetchUrl = resolveRemoteFetchUrl(pipelineInfoUrl);
      const pipelineRes = await fetch(pipelineFetchUrl, getRemoteRequestInit(pipelineFetchUrl, credentials));
      if (pipelineRes.ok) {
        pipelineJson = await pipelineRes.json();
        const candidates = Array.isArray(pipelineJson?.windows?.on) ? pipelineJson.windows.on : [];
        const parsedWindows = candidates
          .map((candidate: unknown) => {
            if (!Array.isArray(candidate) || candidate.length < 2) return null;
            const start = Number(candidate[0]);
            const end = Number(candidate[1]);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
            return { start, end, mid: (start + end) / 2 };
          })
          .filter((windowValue: OnPulseWindow | null): windowValue is OnPulseWindow => windowValue !== null);
        if (parsedWindows.length) {
          onPulseWindows = parsedWindows;
        }
      }
    } catch (error) {
      console.warn("pipeline_info.json was not reachable; using default on-pulse window", error);
    }
  }

  const response = await fetch(fetchUrl, requestInit);
  if (!response.ok) {
    const detail = await readResponseError(response, "Failed to fetch file.");
    throw new Error(`Failed to fetch file (${response.status}): ${detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
  if (!isLikelyNumpyPayload(bytes)) {
    const contentType = response.headers.get("content-type") ?? "unknown content type";
    throw new Error(`Fetched URL did not return a numpy .npz/.npy file (${contentType}). Check the URL and credentials.`);
  }

  return {
    blob: new Blob([arrayBuffer], { type: response.headers.get("content-type") ?? "application/octet-stream" }),
    onPulse: onPulseWindows[0],
    onPulseWindows,
    metadata: pipelineJson ? metadataFromPipeline(url, pipelineJson) : null,
  };
}
