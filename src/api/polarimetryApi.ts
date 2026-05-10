export const DEFAULT_MEERTIME_NPZ_URL =
  "https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz";

export const POLARISATION_QUANTITIES = ["P/I", "L/I", "|V/I|", "V/I", "PA", "EA", "I", "dPA"] as const;

export const POLARIMETRY_ENDPOINTS = {
  prepareDataset: "/prepare_dataset",
  poincareAitoffFixedPhase: "/poincare_sphere_aitoff_fixedphase",
  profiles: "/export_profiles",
  heatmaps: "/export_heatmaps",
  polarisationHistogram: "/polarisation_histogram",
  polarisationStacks: "/polarisation_stacks",
  polarisationPreprocess: "/polarisation_preprocess",
  phaseSliceHistograms: "/phase_slice_histograms",
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
const MEERTIME_PROXY_URL = (CONFIGURED_MEERTIME_PROXY_URL || "/api/meertime-proxy").replace(/\/$/, "");
const MEERTIME_HOST = "psrweb.jb.man.ac.uk";
const PLOTS_MARKER = "/plots/";

export type PhaseRange = {
  start: number;
  end: number;
};

export type ObservationMetadata = {
  obsId: string;
  freq: string;
  utcStart: string;
};

export type RemoteFileLoadResult = {
  blob: Blob;
  onPulse: PhaseRange & { mid: number };
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

function buildApiUrl(path: string, params?: URLSearchParams) {
  return params ? `${API_BASE_URL}${path}?${params.toString()}` : `${API_BASE_URL}${path}`;
}

function isPreparedDatasetSource(source: DatasetSource): source is PreparedDatasetSource {
  return typeof source === "object" && "dataKey" in source;
}

async function postDatasetJson<T>(path: string, source: DatasetSource, params: URLSearchParams): Promise<T> {
  const formData = new FormData();
  if (isPreparedDatasetSource(source)) {
    params.set("data_key", source.dataKey);
  } else {
    formData.append("file", source);
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
    throw new Error(`Request failed: ${path} (${response.status}) via ${requestUrl}`);
  }

  return response.json() as Promise<T>;
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
    throw new Error(`Dataset preparation failed (${response.status}) via ${requestUrl}`);
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

export async function fetchPolarisationHistogram(source: DatasetSource, quantity: string, phaseRange: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationHistogram,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(phaseRange.start),
      on_pulse_end: String(phaseRange.end),
      quantity,
    }),
  );
}

export async function fetchPolarisationHistograms(source: DatasetSource, phaseRange: PhaseRange) {
  const results: Record<string, unknown> = {};
  let successCount = 0;

  for (const quantity of POLARISATION_QUANTITIES) {
    try {
      results[quantity] = await fetchPolarisationHistogram(source, quantity, phaseRange);
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

export async function fetchPolarisationStacks(source: DatasetSource, phaseRange: PhaseRange) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationStacks,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(phaseRange.start),
      on_pulse_end: String(phaseRange.end),
    }),
  );
}

export async function fetchPolarisationParams(source: DatasetSource, phaseRange: PhaseRange, onPulse: PhaseRange, maxPulses = 0) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.polarisationPreprocess,
    source,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
      max_pulses: String(maxPulses),
    }),
  );
}

export async function fetchPhaseSliceHistograms(source: DatasetSource, phases: { left: number; mid: number; right: number }) {
  return postDatasetJson(
    POLARIMETRY_ENDPOINTS.phaseSliceHistograms,
    source,
    new URLSearchParams({
      left_phase: String(phases.left),
      mid_phase: String(phases.mid),
      right_phase: String(phases.right),
    }),
  );
}

function resolveRemoteFetchUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.host !== MEERTIME_HOST) return url;

    if (import.meta.env.DEV) {
      return url.replace(/^https?:\/\/[^/]+/, "/api");
    }

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

export async function loadRemoteNpz(url: string, username: string, password: string): Promise<RemoteFileLoadResult> {
  const fetchUrl = resolveRemoteFetchUrl(url);
  const authHeader = { Authorization: "Basic " + btoa(username + ":" + password) };
  const onPulse = { start: 0, end: 1, mid: 0.5 };
  let pipelineJson: Record<string, any> | null = null;

  const pipelineInfoUrl = getPipelineInfoUrl(url);
  if (pipelineInfoUrl) {
    try {
      const pipelineRes = await fetch(resolveRemoteFetchUrl(pipelineInfoUrl), { headers: authHeader });
      if (pipelineRes.ok) {
        pipelineJson = await pipelineRes.json();
        const candidate = pipelineJson?.windows?.on?.[0];
        if (Array.isArray(candidate) && candidate.length >= 2) {
          const candidateStart = Number(candidate[0]);
          const candidateEnd = Number(candidate[1]);
          if (Number.isFinite(candidateStart) && Number.isFinite(candidateEnd)) {
            onPulse.start = candidateStart;
            onPulse.end = candidateEnd;
            onPulse.mid = (candidateStart + candidateEnd) / 2;
          }
        }
      }
    } catch (error) {
      console.warn("pipeline_info.json was not reachable; using default on-pulse window", error);
    }
  }

  const response = await fetch(fetchUrl, { headers: authHeader });
  if (!response.ok) {
    throw new Error(`Failed to fetch file (${response.status}) via ${fetchUrl}`);
  }

  return {
    blob: await response.blob(),
    onPulse,
    metadata: pipelineJson ? metadataFromPipeline(url, pipelineJson) : null,
  };
}
