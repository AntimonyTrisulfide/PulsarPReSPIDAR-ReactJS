export const DEFAULT_MEERTIME_NPZ_URL =
  "https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz";

export const POLARISATION_QUANTITIES = ["P/I", "L/I", "|V/I|", "V/I", "PA", "EA", "I", "dPA"] as const;

export const POLARIMETRY_ENDPOINTS = {
  poincareAitoffFixedPhase: "/poincare_sphere_aitoff_fixedphase",
  profiles: "/export_profiles",
  heatmaps: "/export_heatmaps",
  polarisationHistogram: "/polarisation_histogram",
  polarisationStacks: "/polarisation_stacks",
  polarisationPreprocess: "/polarisation_preprocess",
  phaseSliceHistograms: "/phase_slice_histograms",
} as const;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
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

export function isInvalidPhaseRange(start: number, end: number) {
  return start > end;
}

function buildApiUrl(path: string, params?: URLSearchParams) {
  return params ? `${API_BASE_URL}${path}?${params.toString()}` : `${API_BASE_URL}${path}`;
}

async function postFileJson<T>(path: string, file: File | Blob, params: URLSearchParams): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(buildApiUrl(path, params), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${path} (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function fetchPoincareAitoffData(file: File | Blob, phaseValue: number, onPulse: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.poincareAitoffFixedPhase,
    file,
    new URLSearchParams({
      phase_value: String(phaseValue),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
    }),
  );
}

export async function fetchProfilesData(file: File | Blob, phaseRange: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.profiles,
    file,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
    }),
  );
}

export async function fetchHeatmapsData(file: File | Blob, phaseRange: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.heatmaps,
    file,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
    }),
  );
}

export async function fetchPolarisationHistogram(file: File | Blob, quantity: string, phaseRange: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.polarisationHistogram,
    file,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(phaseRange.start),
      on_pulse_end: String(phaseRange.end),
      quantity,
    }),
  );
}

export async function fetchPolarisationHistograms(file: File | Blob, phaseRange: PhaseRange) {
  const results: Record<string, unknown> = {};

  await Promise.all(
    POLARISATION_QUANTITIES.map(async quantity => {
      try {
        results[quantity] = await fetchPolarisationHistogram(file, quantity, phaseRange);
      } catch (error) {
        console.error(`Error fetching polarisation histogram ${quantity}:`, error);
        results[quantity] = null;
      }
    }),
  );

  return results;
}

export async function fetchPolarisationStacks(file: File | Blob, phaseRange: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.polarisationStacks,
    file,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(phaseRange.start),
      on_pulse_end: String(phaseRange.end),
    }),
  );
}

export async function fetchPolarisationParams(file: File | Blob, phaseRange: PhaseRange, onPulse: PhaseRange) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.polarisationPreprocess,
    file,
    new URLSearchParams({
      start_phase: String(phaseRange.start),
      end_phase: String(phaseRange.end),
      on_pulse_start: String(onPulse.start),
      on_pulse_end: String(onPulse.end),
    }),
  );
}

export async function fetchPhaseSliceHistograms(file: File | Blob, phases: { left: number; mid: number; right: number }) {
  return postFileJson(
    POLARIMETRY_ENDPOINTS.phaseSliceHistograms,
    file,
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
