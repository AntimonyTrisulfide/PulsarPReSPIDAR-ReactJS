import React, { useState, useEffect, useRef } from "react";
import PoincareAitoffView from "@/features/plots/PoincareAitoffView";
import PhaseSliceHistograms from "@/features/plots/PhaseSliceHistograms";
import SinglePolarisationHistogram from "@/features/plots/SinglePolarisationHistogram";
import PolarisationStacks from "@/features/plots/PolarisationStacks";
import PolarisationDualView from "@/features/plots/PolarisationDualView";
import TotalIntensityEvolution from "@/features/plots/TotalIntensityEvolution";
import RvmFittingView from "@/features/plots/RvmFittingView";
import ErrorBoundary from "./components/ErrorBoundary";
import { CatalogueModal } from "./components/CatalogueModal";
import {
  PlotResultSlot,
  PlotStatusBadge,
  QueueStatusSummary,
  type PlotRequestViewState,
} from "./components/PlotLoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Eye, EyeOff, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  DEFAULT_MEERTIME_NPZ_URL,
  POLARISATION_QUANTITIES,
  fetchHeatmapsData as requestHeatmapsData,
  fetchPhaseSliceHistograms as requestPhaseSliceHistograms,
  fetchPoincareAitoffData as requestPoincareAitoffData,
  fetchPolarisationHistograms as requestPolarisationHistograms,
  fetchPolarisationParams as requestPolarisationParams,
  fetchRvmFit as requestRvmFit,
  fetchPolarisationStacks as requestPolarisationStacks,
  fetchProfilesData as requestProfilesData,
  fetchTotalIntensityEvolution as requestTotalIntensityEvolution,
  isInvalidPhaseRange,
  isMeerTimeUrl,
  loadRemoteNpz,
  prepareDataset as requestPrepareDataset,
  type DatasetSource,
  type ObservationMetadata,
  type OnPulseWindow,
} from "@/api/polarimetryApi";
import { useThemePreference } from "@/hooks/useThemePreference";
import {
  persistDatasetBlob,
  persistPlotSettings,
  readPersistedDatasetBlob,
  readPersistedPlotSettings,
} from "@/lib/sessionCache";
import {
  clearRemoteAuthCookie,
  readRemoteAuthCookie,
  writeRemoteAuthCookie,
} from "@/lib/remoteAuthCookie";

type PlotRequestKey = "profiles" | "heatmaps" | "totalIntensity" | "polarParams" | "subpulseParams" | "rvmFit" | "polarHistograms" | "polarStacks" | "phaseSlices" | "aitoff";
type PlotRequestState = PlotRequestViewState & { version: number };
type BackendResourceProfile = "safe" | "balanced" | "server";
type AppPage = "analysis" | "readme";
type CalculationPhaseWindow = { start: number; mid: number; end: number };
type CalculationPhaseDraft = { start: string; mid: string; end: string };
type QueuedPlotRequest = {
  key: PlotRequestKey;
  task: (version: number) => Promise<void>;
  version: number;
};

const PLOT_REQUEST_KEYS: PlotRequestKey[] = ["profiles", "heatmaps", "totalIntensity", "polarParams", "subpulseParams", "rvmFit", "polarHistograms", "polarStacks", "phaseSlices", "aitoff"];
const PLOT_REQUEST_DEBOUNCE_MS = 350;
const BACKEND_RESOURCE_PROFILES: Record<BackendResourceProfile, { concurrency: number; cooldownMs: number }> = {
  safe: { concurrency: 1, cooldownMs: 550 },
  balanced: { concurrency: 2, cooldownMs: 250 },
  server: { concurrency: 4, cooldownMs: 0 },
};
const BACKEND_RESOURCE_PROFILE = getBackendResourceProfile(import.meta.env.VITE_BACKEND_RESOURCE_PROFILE);
const BACKEND_RESOURCE_DEFAULTS = BACKEND_RESOURCE_PROFILES[BACKEND_RESOURCE_PROFILE];
const PLOT_REQUEST_CONCURRENCY = getPositiveIntegerEnv(import.meta.env.VITE_PLOT_REQUEST_CONCURRENCY, BACKEND_RESOURCE_DEFAULTS.concurrency);
const PLOT_REQUEST_COOLDOWN_MS = getNonNegativeNumberEnv(import.meta.env.VITE_PLOT_REQUEST_COOLDOWN_MS, BACKEND_RESOURCE_DEFAULTS.cooldownMs);
const ARTIFICIAL_LOADING_DELAY_MS = import.meta.env.DEV
  ? getNonNegativeNumberEnv(import.meta.env.VITE_TEST_LOADING_DELAY_MS, 0)
  : 0;
const TOTAL_INTENSITY_VIEW_VERSION = 20;
const LOCAL_FILE_REFERENCE_PATTERN = /^(?:file:|[a-zA-Z]:[\\/]|\\\\)/;

type AnalysisSectionKey = "totalIntensity" | "integrated" | "selectedPulse" | "allPulsesPhase" | "rvmFit" | "hist2d" | "pulseStacks" | "phaseSlices";

const createCollapsedSections = (): Record<AnalysisSectionKey, boolean> => ({
  totalIntensity: false,
  integrated: false,
  selectedPulse: false,
  allPulsesPhase: false,
  rvmFit: false,
  hist2d: false,
  pulseStacks: false,
  phaseSlices: false,
});

const createOnPulseWindow = (start: number, end: number): OnPulseWindow => ({
  start,
  end,
  mid: (start + end) / 2,
});
const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
const delayIfConfigured = () => ARTIFICIAL_LOADING_DELAY_MS > 0 ? delay(ARTIFICIAL_LOADING_DELAY_MS) : Promise.resolve();

function formatPhaseInput(value: number) {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : "";
}

function createCalculationPhaseDraft(start: number, end: number, mid = (start + end) / 2): CalculationPhaseDraft {
  return {
    start: formatPhaseInput(start),
    mid: formatPhaseInput(mid),
    end: formatPhaseInput(end),
  };
}

function parseCalculationPhaseDraft(draft: CalculationPhaseDraft): CalculationPhaseWindow | null {
  if (!draft.start.trim() || !draft.mid.trim() || !draft.end.trim()) return null;
  const start = Number(draft.start);
  const mid = Number(draft.mid);
  const end = Number(draft.end);
  if (!Number.isFinite(start) || !Number.isFinite(mid) || !Number.isFinite(end)) return null;
  return { start, mid, end };
}

function getPositiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function getNonNegativeNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBackendResourceProfile(value: string | undefined): BackendResourceProfile {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "balanced" || normalized === "server") return normalized;
  return "safe";
}

function createPlotRequestStates(): Record<PlotRequestKey, PlotRequestState> {
  return {
    profiles: { status: "idle", version: 0 },
    heatmaps: { status: "idle", version: 0 },
    totalIntensity: { status: "idle", version: 0 },
    polarParams: { status: "idle", version: 0 },
    subpulseParams: { status: "idle", version: 0 },
    rvmFit: { status: "idle", version: 0 },
    polarHistograms: { status: "idle", version: 0 },
    polarStacks: { status: "idle", version: 0 },
    phaseSlices: { status: "idle", version: 0 },
    aitoff: { status: "idle", version: 0 },
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The backend request failed.";
}

function isRemoteAuthFailure(error: unknown) {
  return error instanceof Error && /\((401|403)\)/.test(error.message);
}

function isLocalFileReference(value: string) {
  return LOCAL_FILE_REFERENCE_PATTERN.test(value.trim());
}

const App: React.FC = () => {
  const initialRemoteCredentials = React.useMemo(() => readRemoteAuthCookie(DEFAULT_MEERTIME_NPZ_URL), []);
  const [isDark, setIsDark] = useThemePreference();
  const [catalogueModalOpen, setCatalogueModalOpen] = useState(false);
  const [file, setFile] = useState<File | Blob | null>(null);
  const [url, setUrl] = useState<string>(DEFAULT_MEERTIME_NPZ_URL);
  const [username, setUsername] = useState(initialRemoteCredentials?.username ?? "");
  const [password, setPassword] = useState(initialRemoteCredentials?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [hasStoredRemoteCredentials, setHasStoredRemoteCredentials] = useState(Boolean(initialRemoteCredentials));
  const [showRemoteCredentialFields, setShowRemoteCredentialFields] = useState(isMeerTimeUrl(DEFAULT_MEERTIME_NPZ_URL) && !initialRemoteCredentials);
  const [activePage, setActivePage] = useState<AppPage>("analysis");
  const [loadDataOpen, setLoadDataOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const sidebarResizeRef = useRef(false);
  const [poincareAitoffData, setPoincareAitoffData] = useState<any>(null);
  const [phaseHistogramData, setPhaseHistogramData] = useState<any>(null);
  const [polHistogramData, setPolHistogramData] = useState<Record<string, any> | null>(null);
  const [polStacksData, setPolStacksData] = useState<any>(null);
  const [polarParamsData, setPolarParamsData] = useState<any>(null);
  const [subpulsePolarParamsData, setSubpulsePolarParamsData] = useState<any>(null);
  const [rvmFitData, setRvmFitData] = useState<any>(null);
  const [startPhaseAitoff, setStartPhaseAitoff] = useState(0.0);
  const [endPhaseAitoff, setEndPhaseAitoff] = useState(1.0);
  const [startPhaseSubpulse, setStartPhaseSubpulse] = useState(0.0);
  const [endPhaseSubpulse, setEndPhaseSubpulse] = useState(1.0);
  const [selectedSubpulseIndex, setSelectedSubpulseIndex] = useState(0);
  const [selectedSubpulseDraft, setSelectedSubpulseDraft] = useState("0");
  const [startPhasePolHist, setStartPhasePolHist] = useState(0.0);
  const [endPhasePolHist, setEndPhasePolHist] = useState(1.0);
  const [startPhasePolStacks, setStartPhasePolStacks] = useState(0.0);
  const [endPhasePolStacks, setEndPhasePolStacks] = useState(1.0);
  const [startPhasePolarParams, setStartPhasePolarParams] = useState(0.0);
  const [endPhasePolarParams, setEndPhasePolarParams] = useState(1.0);
  const [onPulseStartPolarParams, setOnPulseStartPolarParams] = useState(0.0);
  const [onPulseEndPolarParams, setOnPulseEndPolarParams] = useState(1.0);
  const [profilesData, setProfilesData] = useState<any>(null);
  const [heatmapsData, setHeatmapsData] = useState<any>(null);
  const [totalIntensityData, setTotalIntensityData] = useState<any>(null);
  const [aitoffPhase, setAitoffPhase] = useState(0.0);
  const [aitoffPhaseDraft, setAitoffPhaseDraft] = useState("0");
  const [leftPhaseHist, setLeftPhaseHist] = useState(0.0);
  const [midPhaseHist, setMidPhaseHist] = useState(0.5);
  const [rightPhaseHist, setRightPhaseHist] = useState(1.0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const themeSwitchCleanupRef = useRef<number | null>(null);
  const [obsMetadata, setObsMetadata] = useState<ObservationMetadata | null>(null);
  const [isLoadingRemoteFile, setIsLoadingRemoteFile] = useState(false);
  const [isPreparingBackendDataset, setIsPreparingBackendDataset] = useState(false);
  const [inputLoadError, setInputLoadError] = useState<string | null>(null);
  const [preparedDataKey, setPreparedDataKey] = useState<string | null>(null);
  const [datasetOnPulse, setDatasetOnPulse] = useState({ start: 0.0, end: 1.0 });
  const [loadedDatasetOnPulse, setLoadedDatasetOnPulse] = useState({ start: 0.0, end: 1.0 });
  const [availableOnPulseWindows, setAvailableOnPulseWindows] = useState<OnPulseWindow[]>([createOnPulseWindow(0, 1)]);
  const [activeOnPulseWindowIndex, setActiveOnPulseWindowIndex] = useState(0);
  const [calculationPhaseDraft, setCalculationPhaseDraft] = useState<CalculationPhaseDraft>(() => createCalculationPhaseDraft(0, 1, 0.5));
  const [calculationVersion, setCalculationVersion] = useState(0);
  const [openSections, setOpenSections] = useState<Record<AnalysisSectionKey, boolean>>(createCollapsedSections);
  const [plotRequestStates, setPlotRequestStates] = useState<Record<PlotRequestKey, PlotRequestState>>(createPlotRequestStates);
  const activePlotRequestsRef = useRef(0);
  const queuedPlotRequestsRef = useRef<QueuedPlotRequest[]>([]);
  const plotRequestVersionsRef = useRef<Record<PlotRequestKey, number>>({
    profiles: 0,
    heatmaps: 0,
    totalIntensity: 0,
    aitoff: 0,
    phaseSlices: 0,
    polarHistograms: 0,
    polarStacks: 0,
    polarParams: 0,
    subpulseParams: 0,
    rvmFit: 0,
  });

  // Plot parameters
  // Per-plot phase ranges (unique to each plot)
  const [startPhaseProfiles, setStartPhaseProfiles] = useState(0.0);
  const [endPhaseProfiles, setEndPhaseProfiles] = useState(1.0);
  const [startPhaseHeatmaps, setStartPhaseHeatmaps] = useState(0.0);
  const [endPhaseHeatmaps, setEndPhaseHeatmaps] = useState(1.0);
  const hasRestoredSessionRef = useRef(false);

  const isInvalidRange = isInvalidPhaseRange;
  const isPreparingInput = isLoadingRemoteFile || isPreparingBackendDataset;

  const getDatasetSource = (): DatasetSource | null => {
    if (preparedDataKey) return { dataKey: preparedDataKey, fallbackFile: file };
    return file;
  };

  const getCombinedPlotState = (...keys: PlotRequestKey[]): PlotRequestViewState => {
    const states = keys.map(key => plotRequestStates[key]);
    return (
      states.find(state => state.status === "running") ??
      states.find(state => state.status === "queued") ??
      states.find(state => state.status === "error") ??
      { status: "idle" }
    );
  };

  const resetPlotRequestQueue = () => {
    queuedPlotRequestsRef.current = [];
    PLOT_REQUEST_KEYS.forEach(key => {
      plotRequestVersionsRef.current[key] += 1;
    });
    setPlotRequestStates(createPlotRequestStates());
  };

  const setPlotRequestState = (key: PlotRequestKey, version: number, state: PlotRequestViewState) => {
    setPlotRequestStates(current => {
      if (current[key].version !== version) return current;
      return {
        ...current,
        [key]: {
          ...state,
          version,
        },
      };
    });
  };

  const processPlotQueue = () => {
    while (activePlotRequestsRef.current < PLOT_REQUEST_CONCURRENCY && queuedPlotRequestsRef.current.length > 0) {
      const job = queuedPlotRequestsRef.current.shift();
      if (!job) return;

      if (plotRequestVersionsRef.current[job.key] !== job.version) {
        setPlotRequestState(job.key, job.version, { status: "idle" });
        continue;
      }

      activePlotRequestsRef.current += 1;
      setPlotRequestState(job.key, job.version, {
        status: "running",
        message: "Sending data to the analysis backend.",
      });

      job.task(job.version)
        .then(() => setPlotRequestState(job.key, job.version, { status: "idle" }))
        .catch(error => {
          console.error("Queued plot request failed:", error);
          setPlotRequestState(job.key, job.version, {
            status: "error",
            message: getErrorMessage(error),
          });
        })
        .finally(async () => {
          await delay(PLOT_REQUEST_COOLDOWN_MS);
          activePlotRequestsRef.current = Math.max(0, activePlotRequestsRef.current - 1);
          processPlotQueue();
        });
    }
  };

  const schedulePlotRequest = (key: PlotRequestKey, task: (version: number) => Promise<void>) => {
    const requestVersion = plotRequestVersionsRef.current[key] + 1;
    plotRequestVersionsRef.current[key] = requestVersion;

    queuedPlotRequestsRef.current = queuedPlotRequestsRef.current.filter(job => job.key !== key);
    queuedPlotRequestsRef.current.push({ key, task, version: requestVersion });
    setPlotRequestStates(current => ({
      ...current,
      [key]: {
        status: "queued",
        version: requestVersion,
        message: PLOT_REQUEST_CONCURRENCY === 1
          ? "Waiting for the backend queue."
          : "Waiting for an available backend worker.",
      },
    }));
    processPlotQueue();
  };

  const isCurrentPlotRequest = (key: PlotRequestKey, version?: number) => (
    version === undefined || plotRequestVersionsRef.current[key] === version
  );

  const clearPlotData = () => {
    setPoincareAitoffData(null);
    setPhaseHistogramData(null);
    setPolHistogramData(null);
    setPolStacksData(null);
    setPolarParamsData(null);
    setSubpulsePolarParamsData(null);
    setProfilesData(null);
    setHeatmapsData(null);
    setTotalIntensityData(null);
  };

  const applyCalculationPhaseWindow = ({ start, mid, end }: CalculationPhaseWindow) => {
    setDatasetOnPulse({ start, end });
    setStartPhaseAitoff(start);
    setEndPhaseAitoff(end);
    setAitoffPhase(mid);
    setAitoffPhaseDraft(String(mid));
    setStartPhaseSubpulse(start);
    setEndPhaseSubpulse(end);
    setStartPhasePolHist(start);
    setEndPhasePolHist(end);
    setStartPhasePolStacks(start);
    setEndPhasePolStacks(end);
    setStartPhaseProfiles(start);
    setEndPhaseProfiles(end);
    setStartPhaseHeatmaps(start);
    setEndPhaseHeatmaps(end);
    setStartPhasePolarParams(start);
    setEndPhasePolarParams(end);
    setOnPulseStartPolarParams(start);
    setOnPulseEndPolarParams(end);
    setLeftPhaseHist(start);
    setMidPhaseHist(mid);
    setRightPhaseHist(end);
  };

  const applyNewFile = (
    incoming: File | Blob,
    nextPreparedDataKey: string | null = null,
    nextOnPulse: { start: number; end: number } = { start: 0, end: 1 },
    nextOnPulseWindows: OnPulseWindow[] = [createOnPulseWindow(nextOnPulse.start, nextOnPulse.end)],
    nextActiveWindowIndex = 0,
  ) => {
    const mid = (nextOnPulse.start + nextOnPulse.end) / 2;
    resetPlotRequestQueue();
    setFile(incoming);
    setPreparedDataKey(nextPreparedDataKey);
    setObsMetadata(null);
    setLoadedDatasetOnPulse(nextOnPulse);
    setAvailableOnPulseWindows(nextOnPulseWindows.length ? nextOnPulseWindows : [createOnPulseWindow(nextOnPulse.start, nextOnPulse.end)]);
    setActiveOnPulseWindowIndex(nextActiveWindowIndex);
    clearPlotData();
    applyCalculationPhaseWindow({ start: nextOnPulse.start, mid, end: nextOnPulse.end });
    setCalculationPhaseDraft(createCalculationPhaseDraft(nextOnPulse.start, nextOnPulse.end, mid));
    setSelectedSubpulseIndex(0);
    setSelectedSubpulseDraft("0");
  };

  const prepareBackendDataset = async (incoming: File | Blob, onPulse: { start: number; end: number }) => {
    setIsPreparingBackendDataset(true);
    try {
      await delayIfConfigured();
      const prepared = await requestPrepareDataset(incoming, onPulse);
      return prepared.data_key;
    } catch (error) {
      console.warn("Backend dataset preparation failed; falling back to per-request upload.", error);
      if (!(incoming instanceof File)) {
        throw error;
      }
      return null;
    } finally {
      setIsPreparingBackendDataset(false);
    }
  };

  const handleCalculationPhaseDraftChange = (key: keyof CalculationPhaseDraft, value: string) => {
    setCalculationPhaseDraft(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleUseDatasetOnPulse = () => {
    const mid = (loadedDatasetOnPulse.start + loadedDatasetOnPulse.end) / 2;
    setCalculationPhaseDraft(createCalculationPhaseDraft(loadedDatasetOnPulse.start, loadedDatasetOnPulse.end, mid));
  };

  const handleSelectOnPulseWindow = (index: number) => {
    const nextWindow = availableOnPulseWindows[index];
    if (!nextWindow) return;
    resetPlotRequestQueue();
    clearPlotData();
    setActiveOnPulseWindowIndex(index);
    setLoadedDatasetOnPulse({ start: nextWindow.start, end: nextWindow.end });
    applyCalculationPhaseWindow({ start: nextWindow.start, mid: nextWindow.mid, end: nextWindow.end });
    setCalculationPhaseDraft(createCalculationPhaseDraft(nextWindow.start, nextWindow.end, nextWindow.mid));
    setSelectedSubpulseIndex(0);
    setSelectedSubpulseDraft("0");
    setCalculationVersion(version => version + 1);
  };

  const handleApplyCalculationPhaseWindow = async () => {
    const nextWindow = parseCalculationPhaseDraft(calculationPhaseDraft);
    if (!nextWindow) {
      console.warn("Enter valid numeric phase values.");
      return;
    }
    if (nextWindow.start > nextWindow.mid || nextWindow.mid > nextWindow.end) {
      console.warn("Fix phase order: start <= mid <= end.");
      return;
    }
    if (nextWindow.start < 0 || nextWindow.mid < 0 || nextWindow.end < 0 || nextWindow.start > 1 || nextWindow.mid > 1 || nextWindow.end > 1) {
      console.warn("Phase values should be between 0 and 1.");
      return;
    }

    resetPlotRequestQueue();
    clearPlotData();

    if (file) {
      const dataKey = await prepareBackendDataset(file, { start: nextWindow.start, end: nextWindow.end });
      setPreparedDataKey(dataKey);
    }

    applyCalculationPhaseWindow(nextWindow);
    setCalculationPhaseDraft(createCalculationPhaseDraft(nextWindow.start, nextWindow.end, nextWindow.mid));
    setCalculationVersion(version => version + 1);
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const defaultOnPulse = { start: 0, end: 1 };
      const dataKey = await prepareBackendDataset(selectedFile, defaultOnPulse);
      applyNewFile(selectedFile, dataKey, defaultOnPulse);
      void persistDatasetBlob(selectedFile);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const fetchPoincareAitoffData = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseAitoff, endPhaseAitoff)) {
      console.warn("Fix Aitoff on-pulse start/end: start must be <= end.");
      return;
    }
    try {
      const result = await requestPoincareAitoffData(source, aitoffPhase, {
        start: startPhaseAitoff,
        end: endPhaseAitoff,
      });
      if (isCurrentPlotRequest("aitoff", requestVersion)) {
        setPoincareAitoffData(result);
      }
    } catch (err) {
      console.error("Error fetching Poincare Aitoff data:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  const fetchProfilesData = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseProfiles, endPhaseProfiles)) {
      console.warn("Fix Profiles start/end phase: start must be <= end.");
      return;
    }
    try {
      const result = await requestProfilesData(source, {
        start: startPhaseProfiles,
        end: endPhaseProfiles,
      });
      if (isCurrentPlotRequest("profiles", requestVersion)) {
        setProfilesData(result);
      }
    } catch (err) {
      console.error("Error fetching profiles data:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };
  // Handle URL load (fetch file as Blob and store in state)
  const handleLoadFromUrl = async () => {
    if (isLoadingRemoteFile) return;

    const remoteUrl = url.trim();
    if (!remoteUrl) {
      setInputLoadError("Please fill in the URL.");
      console.warn("Please fill in the URL.");
      return;
    }

    if (isLocalFileReference(remoteUrl)) {
      const message = "Local file paths cannot be loaded from the URL field. Use Browse to choose the .npz/.npy file.";
      setInputLoadError(message);
      console.warn(message);
      return;
    }

    const isMeerTimeRemoteUrl = isMeerTimeUrl(remoteUrl);
    const storedCredentials = hasStoredRemoteCredentials && !showRemoteCredentialFields
      ? readRemoteAuthCookie(remoteUrl)
      : null;
    const shouldSendCredentials = Boolean(storedCredentials) || showRemoteCredentialFields || isMeerTimeRemoteUrl;
    let credentials: { username: string; password: string } | undefined;
    if (shouldSendCredentials) {
      if (hasStoredRemoteCredentials && !showRemoteCredentialFields && !storedCredentials) {
        setHasStoredRemoteCredentials(false);
        setShowRemoteCredentialFields(true);
        setPassword("");
        setInputLoadError("Please enter credentials for this URL.");
        console.warn("Please enter credentials for this URL.");
        return;
      }

      credentials = storedCredentials ?? {
        username: username.trim(),
        password,
      };

      if (!credentials.username || !credentials.password) {
        setShowRemoteCredentialFields(true);
        setInputLoadError("Please enter credentials for this URL.");
        console.warn("Please enter credentials for this URL.");
        return;
      }
    }

    setIsLoadingRemoteFile(true);
    setInputLoadError(null);
    try {
      await delayIfConfigured();
      const remoteFile = await loadRemoteNpz(remoteUrl, credentials);
      const { start, end, mid } = remoteFile.onPulse;
      const dataKey = await prepareBackendDataset(remoteFile.blob, { start, end });
      applyNewFile(remoteFile.blob, dataKey, { start, end }, remoteFile.onPulseWindows, 0);
      if (credentials) {
        writeRemoteAuthCookie(remoteUrl, credentials);
        setHasStoredRemoteCredentials(true);
        setShowRemoteCredentialFields(false);
        setUsername(credentials.username);
        setPassword(credentials.password);
      }
      setObsMetadata(remoteFile.metadata);
      setLeftPhaseHist(start);
      setMidPhaseHist(mid);
      setRightPhaseHist(end);
      setStartPhaseAitoff(start);
      setEndPhaseAitoff(end);
      setAitoffPhase(mid);
      setAitoffPhaseDraft(String(mid));
      setStartPhaseSubpulse(start);
      setEndPhaseSubpulse(end);
      setSelectedSubpulseIndex(0);
      setSelectedSubpulseDraft("0");
      setStartPhasePolHist(start);
      setEndPhasePolHist(end);
      setStartPhasePolStacks(start);
      setEndPhasePolStacks(end);
      setStartPhaseProfiles(start);
      setEndPhaseProfiles(end);
      setStartPhaseHeatmaps(start);
      setEndPhaseHeatmaps(end);
      setStartPhasePolarParams(start);
      setEndPhasePolarParams(end);
      setOnPulseStartPolarParams(start);
      setOnPulseEndPolarParams(end);
      void persistDatasetBlob(remoteFile.blob);
    } catch (err) {
      console.error("Error loading file:", err);
      setInputLoadError(getErrorMessage(err));
      if (isRemoteAuthFailure(err)) {
        clearRemoteAuthCookie(remoteUrl);
        setHasStoredRemoteCredentials(false);
        setShowRemoteCredentialFields(true);
        setPassword("");
      }
    } finally {
      setIsLoadingRemoteFile(false);
    }
  };

  // Call /export_heatmaps endpoint
  const fetchHeatmapsData = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseHeatmaps, endPhaseHeatmaps)) {
      console.warn("Fix Heatmaps start/end phase: start must be <= end.");
      return;
    }
    try {
      const result = await requestHeatmapsData(source, {
        start: startPhaseHeatmaps,
        end: endPhaseHeatmaps,
      });
      if (isCurrentPlotRequest("heatmaps", requestVersion)) {
        setHeatmapsData(result);
      }
    } catch (err) {
      console.error("Error fetching heatmaps data:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  const fetchTotalIntensityEvolution = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseHeatmaps, endPhaseHeatmaps)) {
      console.warn("Fix total intensity start/end phase: start must be <= end.");
      return;
    }

    try {
      const result = await requestTotalIntensityEvolution(source, {
        start: startPhaseHeatmaps,
        end: endPhaseHeatmaps,
      }, datasetOnPulse);
      if (isCurrentPlotRequest("totalIntensity", requestVersion)) {
        setTotalIntensityData(result);
      }
    } catch (err) {
      console.error("Error fetching total intensity evolution:", err);
      throw err;
    }
  };

  // Call /polarisation_histogram endpoint for all quantities
  const fetchPolarisationHistograms = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolHist, endPhasePolHist)) {
      console.warn("Fix polarisation histograms start/end: start must be <= end.");
      return;
    }

    try {
      setPolHistogramData(null);
      const results = await requestPolarisationHistograms(source, {
        start: startPhasePolHist,
        end: endPhasePolHist,
      }, datasetOnPulse, (quantity, payload) => {
        if (isCurrentPlotRequest("polarHistograms", requestVersion)) {
          setPolHistogramData((current: Record<string, any> | null) => ({
            ...(current ?? {}),
            [quantity]: payload,
          }));
        }
      });
      if (isCurrentPlotRequest("polarHistograms", requestVersion)) {
        setPolHistogramData(results as Record<string, any>);
      }
    } catch (err) {
      console.error("Error fetching polarisation histograms:", err);
      throw err;
    }
  };

  // Call /polarisation_stacks endpoint
  const fetchPolarisationStacks = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolStacks, endPhasePolStacks)) {
      console.warn("Fix polarisation stacks start/end: start must be <= end.");
      return;
    }

    try {
      setPolStacksData(null);
      const result = await requestPolarisationStacks(source, {
        start: startPhasePolStacks,
        end: endPhasePolStacks,
      }, datasetOnPulse, (_quantity, payload) => {
        if (isCurrentPlotRequest("polarStacks", requestVersion)) {
          setPolStacksData((current: any) => {
            const nextQuantity = (payload as any)?.quantity;
            if (!nextQuantity) return current;
            const base = current ?? {
              obs_id: (payload as any)?.obs_id,
              start_phase: (payload as any)?.start_phase,
              end_phase: (payload as any)?.end_phase,
              on_pulse: (payload as any)?.on_pulse,
              phase_axis: (payload as any)?.phase_axis ?? [],
              pulse_number: (payload as any)?.pulse_number ?? [],
              quantities: [],
            };
            return {
              ...base,
              quantities: [...base.quantities, nextQuantity],
            };
          });
        }
      });
      if (isCurrentPlotRequest("polarStacks", requestVersion)) {
        setPolStacksData(result);
      }
    } catch (err) {
      console.error("Error fetching polarisation stacks:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  // Call /polarisation_preprocess endpoint for derived parameters and Poincare coords
  const fetchPolarisationParams = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolarParams, endPhasePolarParams)) {
      console.warn("Fix polarisation parameter start/end: start must be <= end.");
      return;
    }
    if (isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams)) {
      console.warn("Fix on-pulse start/end: start must be <= end.");
      return;
    }

    try {
      const result = await requestPolarisationParams(
        source,
        { start: startPhasePolarParams, end: endPhasePolarParams },
        { start: onPulseStartPolarParams, end: onPulseEndPolarParams },
      );
      if (isCurrentPlotRequest("polarParams", requestVersion)) {
        setPolarParamsData(result);
      }
    } catch (err) {
      console.error("Error fetching polarisation parameters:", err);
      throw err;
    }
  };

  const fetchSubpulsePolarisationParams = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseSubpulse, endPhaseSubpulse)) {
      console.warn("Fix selected subpulse start/end: start must be <= end.");
      return;
    }

    const backendPulseIndex = Math.max(0, Math.floor(selectedSubpulseIndex)) + 1;
    try {
      const result = await requestPolarisationParams(
        source,
        { start: startPhaseSubpulse, end: endPhaseSubpulse },
        datasetOnPulse,
        0,
        backendPulseIndex,
      );
      if (isCurrentPlotRequest("subpulseParams", requestVersion)) {
        setSubpulsePolarParamsData(result);
      }
    } catch (err) {
      console.error("Error fetching selected subpulse polarisation parameters:", err);
      throw err;
    }
  };

  const fetchRvmFit = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolarParams, endPhasePolarParams)) {
      console.warn("Fix RVM fitting start/end: start must be <= end.");
      return;
    }

    try {
      setRvmFitData(null);
      const result = await requestRvmFit(
        source,
        { start: startPhasePolarParams, end: endPhasePolarParams },
        datasetOnPulse,
      );
      if (isCurrentPlotRequest("rvmFit", requestVersion)) {
        setRvmFitData(result);
      }
    } catch (err) {
      console.error("Error fetching RVM fit:", err);
      throw err;
    }
  };

  // Call /phase_slice_histograms endpoint
  const fetchPhaseSliceHistograms = async (requestVersion?: number) => {
    const source = getDatasetSource();
    if (!source) {
      console.warn("No file selected or loaded.");
      return;
    }
    const phasesOutOfOrder = leftPhaseHist > midPhaseHist || midPhaseHist > rightPhaseHist;
    if (phasesOutOfOrder) {
      console.warn("Fix phase slice order: left <= mid <= right.");
      return;
    }

    try {
      setPhaseHistogramData(null);
      const result = await requestPhaseSliceHistograms(source, {
        left: leftPhaseHist,
        mid: midPhaseHist,
        right: rightPhaseHist,
      }, datasetOnPulse, (_quantity, payload) => {
        if (isCurrentPlotRequest("phaseSlices", requestVersion)) {
          setPhaseHistogramData((current: any) => {
            const nextQuantity = (payload as any)?.quantity;
            if (!nextQuantity) return current;
            const base = current ?? {
              obs_id: (payload as any)?.obs_id,
              phase_values: (payload as any)?.phase_values ?? [],
              phase_bins: (payload as any)?.phase_bins ?? [],
              quantities: [],
            };
            return {
              ...base,
              quantities: [...base.quantities, nextQuantity],
            };
          });
        }
      });
      if (isCurrentPlotRequest("phaseSlices", requestVersion)) {
        setPhaseHistogramData(result);
      }
    } catch (err) {
      console.error("Error fetching phase-slice histograms:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };
  // Queue plot fetches so a modest backend is not hit by many large file posts at once.
  useEffect(() => {
    if (hasRestoredSessionRef.current) return;
    hasRestoredSessionRef.current = true;
    const restoreSession = async () => {
      const savedSettings = readPersistedPlotSettings();
      const savedUrl = savedSettings?.url || DEFAULT_MEERTIME_NPZ_URL;
      const savedRemoteCredentials = readRemoteAuthCookie(savedUrl);
      if (savedSettings) {
        setUrl(savedUrl);
        setUsername(savedRemoteCredentials?.username || savedSettings.username || "");
        setPassword(savedRemoteCredentials?.password || "");
        setHasStoredRemoteCredentials(Boolean(savedRemoteCredentials));
        setShowRemoteCredentialFields(isMeerTimeUrl(savedUrl) && !savedRemoteCredentials);
        setObsMetadata((savedSettings.obsMetadata as ObservationMetadata | null) ?? null);
        setDatasetOnPulse(savedSettings.datasetOnPulse);
        setAvailableOnPulseWindows(savedSettings.availableOnPulseWindows?.length ? savedSettings.availableOnPulseWindows : [createOnPulseWindow(savedSettings.datasetOnPulse.start, savedSettings.datasetOnPulse.end)]);
        setActiveOnPulseWindowIndex(savedSettings.activeOnPulseWindowIndex ?? 0);
        setStartPhaseAitoff(savedSettings.startPhaseAitoff);
        setEndPhaseAitoff(savedSettings.endPhaseAitoff);
        setStartPhaseSubpulse(savedSettings.startPhaseSubpulse ?? savedSettings.startPhaseAitoff);
        setEndPhaseSubpulse(savedSettings.endPhaseSubpulse ?? savedSettings.endPhaseAitoff);
        setSelectedSubpulseIndex(savedSettings.selectedSubpulseIndex ?? 0);
        setSelectedSubpulseDraft(String(savedSettings.selectedSubpulseIndex ?? 0));
        setStartPhasePolHist(savedSettings.startPhasePolHist);
        setEndPhasePolHist(savedSettings.endPhasePolHist);
        setStartPhasePolStacks(savedSettings.startPhasePolStacks);
        setEndPhasePolStacks(savedSettings.endPhasePolStacks);
        setStartPhasePolarParams(savedSettings.startPhasePolarParams);
        setEndPhasePolarParams(savedSettings.endPhasePolarParams);
        setOnPulseStartPolarParams(savedSettings.onPulseStartPolarParams);
        setOnPulseEndPolarParams(savedSettings.onPulseEndPolarParams);
        setStartPhaseProfiles(savedSettings.startPhaseProfiles);
        setEndPhaseProfiles(savedSettings.endPhaseProfiles);
        setStartPhaseHeatmaps(savedSettings.startPhaseHeatmaps);
        setEndPhaseHeatmaps(savedSettings.endPhaseHeatmaps);
        setAitoffPhase(savedSettings.aitoffPhase);
        setAitoffPhaseDraft(String(savedSettings.aitoffPhase));
        setLeftPhaseHist(savedSettings.leftPhaseHist);
        setMidPhaseHist(savedSettings.midPhaseHist);
        setRightPhaseHist(savedSettings.rightPhaseHist);
        setCalculationPhaseDraft(createCalculationPhaseDraft(savedSettings.leftPhaseHist, savedSettings.rightPhaseHist, savedSettings.midPhaseHist));
      } else {
        setHasStoredRemoteCredentials(Boolean(savedRemoteCredentials));
        setShowRemoteCredentialFields(isMeerTimeUrl(savedUrl) && !savedRemoteCredentials);
      }

      const savedBlob = await readPersistedDatasetBlob();
      if (!savedBlob) return;
      const preparedKey = await prepareBackendDataset(savedBlob, savedSettings?.datasetOnPulse ?? { start: 0, end: 1 });
      applyNewFile(savedBlob, preparedKey, savedSettings?.datasetOnPulse ?? { start: 0, end: 1 });
      if (savedSettings) {
        setObsMetadata((savedSettings.obsMetadata as ObservationMetadata | null) ?? null);
        setAvailableOnPulseWindows(savedSettings.availableOnPulseWindows?.length ? savedSettings.availableOnPulseWindows : [createOnPulseWindow(savedSettings.datasetOnPulse.start, savedSettings.datasetOnPulse.end)]);
        setActiveOnPulseWindowIndex(savedSettings.activeOnPulseWindowIndex ?? 0);
        setStartPhaseAitoff(savedSettings.startPhaseAitoff);
        setEndPhaseAitoff(savedSettings.endPhaseAitoff);
        setStartPhaseSubpulse(savedSettings.startPhaseSubpulse ?? savedSettings.startPhaseAitoff);
        setEndPhaseSubpulse(savedSettings.endPhaseSubpulse ?? savedSettings.endPhaseAitoff);
        setSelectedSubpulseIndex(savedSettings.selectedSubpulseIndex ?? 0);
        setSelectedSubpulseDraft(String(savedSettings.selectedSubpulseIndex ?? 0));
        setStartPhasePolHist(savedSettings.startPhasePolHist);
        setEndPhasePolHist(savedSettings.endPhasePolHist);
        setStartPhasePolStacks(savedSettings.startPhasePolStacks);
        setEndPhasePolStacks(savedSettings.endPhasePolStacks);
        setStartPhasePolarParams(savedSettings.startPhasePolarParams);
        setEndPhasePolarParams(savedSettings.endPhasePolarParams);
        setOnPulseStartPolarParams(savedSettings.onPulseStartPolarParams);
        setOnPulseEndPolarParams(savedSettings.onPulseEndPolarParams);
        setStartPhaseProfiles(savedSettings.startPhaseProfiles);
        setEndPhaseProfiles(savedSettings.endPhaseProfiles);
        setStartPhaseHeatmaps(savedSettings.startPhaseHeatmaps);
        setEndPhaseHeatmaps(savedSettings.endPhaseHeatmaps);
        setAitoffPhase(savedSettings.aitoffPhase);
        setAitoffPhaseDraft(String(savedSettings.aitoffPhase));
        setLeftPhaseHist(savedSettings.leftPhaseHist);
        setMidPhaseHist(savedSettings.midPhaseHist);
        setRightPhaseHist(savedSettings.rightPhaseHist);
        setCalculationPhaseDraft(createCalculationPhaseDraft(savedSettings.leftPhaseHist, savedSettings.rightPhaseHist, savedSettings.midPhaseHist));
      }
    };
    void restoreSession();
  }, []);

  useEffect(() => {
    const remoteUrl = url.trim();
    const savedRemoteCredentials = readRemoteAuthCookie(remoteUrl);
    setHasStoredRemoteCredentials(Boolean(savedRemoteCredentials));

    if (savedRemoteCredentials) {
      setUsername(savedRemoteCredentials.username);
      setPassword(savedRemoteCredentials.password);
      setShowRemoteCredentialFields(false);
    } else {
      setPassword("");
      setShowRemoteCredentialFields(isMeerTimeUrl(remoteUrl));
    }
  }, [url]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!sidebarResizeRef.current) return;
      const maxWidth = Math.max(280, window.innerWidth * 0.3);
      const nextWidth = Math.min(maxWidth, Math.max(280, event.clientX));
      setSidebarWidth(nextWidth);
    };
    const handlePointerUp = () => {
      sidebarResizeRef.current = false;
      document.body.classList.remove("is-resizing-plots");
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (!file || !openSections.integrated) return;
    persistPlotSettings({
      url,
      username,
      obsMetadata,
      datasetOnPulse,
      availableOnPulseWindows,
      activeOnPulseWindowIndex,
      startPhaseAitoff,
      endPhaseAitoff,
      startPhaseSubpulse,
      endPhaseSubpulse,
      selectedSubpulseIndex,
      startPhasePolHist,
      endPhasePolHist,
      startPhasePolStacks,
      endPhasePolStacks,
      startPhasePolarParams,
      endPhasePolarParams,
      onPulseStartPolarParams,
      onPulseEndPolarParams,
      startPhaseProfiles,
      endPhaseProfiles,
      startPhaseHeatmaps,
      endPhaseHeatmaps,
      aitoffPhase,
      leftPhaseHist,
      midPhaseHist,
      rightPhaseHist,
    });
  }, [
    file, url, username, obsMetadata, datasetOnPulse, availableOnPulseWindows, activeOnPulseWindowIndex, startPhaseAitoff, endPhaseAitoff,
    startPhaseSubpulse, endPhaseSubpulse, selectedSubpulseIndex,
    startPhasePolHist, endPhasePolHist, startPhasePolStacks, endPhasePolStacks,
    startPhasePolarParams, endPhasePolarParams, onPulseStartPolarParams, onPulseEndPolarParams,
    startPhaseProfiles, endPhaseProfiles, startPhaseHeatmaps, endPhaseHeatmaps,
    aitoffPhase, leftPhaseHist, midPhaseHist, rightPhaseHist,
  ]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("profiles", fetchProfilesData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [startPhaseProfiles, endPhaseProfiles, calculationVersion, file, openSections.integrated]);

  useEffect(() => {
    if (!file || !openSections.pulseStacks) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("heatmaps", fetchHeatmapsData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [startPhaseHeatmaps, endPhaseHeatmaps, calculationVersion, file, openSections.pulseStacks]);

  useEffect(() => {
    if (!file || !openSections.totalIntensity) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("totalIntensity", fetchTotalIntensityEvolution),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [startPhaseHeatmaps, endPhaseHeatmaps, calculationVersion, datasetOnPulse.start, datasetOnPulse.end, file, openSections.totalIntensity, TOTAL_INTENSITY_VIEW_VERSION]);

  useEffect(() => {
    if (!file || !openSections.integrated) return;
    if (isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams)) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarParams", fetchPolarisationParams),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, onPulseStartPolarParams, onPulseEndPolarParams, startPhasePolarParams, endPhasePolarParams, calculationVersion, openSections.integrated]);

  useEffect(() => {
    if (!file || !openSections.selectedPulse) return;
    if (isInvalidRange(startPhaseSubpulse, endPhaseSubpulse)) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("subpulseParams", fetchSubpulsePolarisationParams),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [
    file,
    startPhaseSubpulse,
    endPhaseSubpulse,
    selectedSubpulseIndex,
    datasetOnPulse.start,
    datasetOnPulse.end,
    calculationVersion,
    openSections.selectedPulse,
  ]);

  useEffect(() => {
    if (!file || !openSections.rvmFit) return;
    if (isInvalidRange(startPhasePolarParams, endPhasePolarParams)) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("rvmFit", fetchRvmFit),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, startPhasePolarParams, endPhasePolarParams, datasetOnPulse.start, datasetOnPulse.end, calculationVersion, openSections.rvmFit]);

  useEffect(() => {
    if (!file || !openSections.hist2d) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarHistograms", fetchPolarisationHistograms),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, startPhasePolHist, endPhasePolHist, calculationVersion, datasetOnPulse.start, datasetOnPulse.end, openSections.hist2d]);

  useEffect(() => {
    if (!file || !openSections.pulseStacks) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarStacks", fetchPolarisationStacks),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, startPhasePolStacks, endPhasePolStacks, calculationVersion, datasetOnPulse.start, datasetOnPulse.end, openSections.pulseStacks]);

  useEffect(() => {
    if (!file || !openSections.phaseSlices) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("phaseSlices", fetchPhaseSliceHistograms),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, leftPhaseHist, midPhaseHist, rightPhaseHist, calculationVersion, datasetOnPulse.start, datasetOnPulse.end, openSections.phaseSlices]);

  useEffect(() => {
    if (!file || !openSections.allPulsesPhase) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("aitoff", fetchPoincareAitoffData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [aitoffPhase, startPhaseAitoff, endPhaseAitoff, calculationVersion, file, openSections.allPulsesPhase]);

  const polarParamsState = getCombinedPlotState("polarParams");
  const totalIntensityState = getCombinedPlotState("totalIntensity");
  const subpulseParamsState = getCombinedPlotState("subpulseParams");
  const rvmFitState = getCombinedPlotState("rvmFit");
  const stacksState = getCombinedPlotState("polarStacks", "heatmaps");
  const histogramsState = getCombinedPlotState("polarHistograms");
  const phaseSlicesState = getCombinedPlotState("phaseSlices");
  const aitoffState = getCombinedPlotState("aitoff");
  const hasLoadedData = file !== null;
  const runningPlotCount = Object.values(plotRequestStates).filter(state => state.status === "running").length;
  const queuedPlotCount = Object.values(plotRequestStates).filter(state => state.status === "queued").length;
  const subpulseRangeInvalid = isInvalidRange(startPhaseSubpulse, endPhaseSubpulse);
  const parsedCalculationPhaseDraft = parseCalculationPhaseDraft(calculationPhaseDraft);
  const calculationPhaseDraftInvalid = !parsedCalculationPhaseDraft
    || parsedCalculationPhaseDraft.start > parsedCalculationPhaseDraft.mid
    || parsedCalculationPhaseDraft.mid > parsedCalculationPhaseDraft.end
    || parsedCalculationPhaseDraft.start < 0
    || parsedCalculationPhaseDraft.mid < 0
    || parsedCalculationPhaseDraft.end < 0
    || parsedCalculationPhaseDraft.start > 1
    || parsedCalculationPhaseDraft.mid > 1
    || parsedCalculationPhaseDraft.end > 1;
  const appliedPhaseSummary = `${startPhaseProfiles.toFixed(3)} - ${midPhaseHist.toFixed(3)} - ${endPhaseProfiles.toFixed(3)}`;
  const totalSubpulses = Number(subpulsePolarParamsData?.num_pulses ?? polarParamsData?.num_pulses ?? 0);
  const totalPulseCount = totalSubpulses || Number(poincareAitoffData?.pulse_number?.length ?? 0);
  const hasInterpulseWindows = availableOnPulseWindows.length > 1;
  const topPulsePower = (subpulsePolarParamsData?.top_pulse_power ?? polarParamsData?.top_pulse_power ?? []) as Array<{
    pulse_index: number;
    pulse_number?: number;
    pulse_power: number;
  }>;
  const fixedPhaseAitoffData = React.useMemo(() => {
    if (!poincareAitoffData) return null;
    const hasStokes = ["I", "Q", "U", "V"].every(key => (
      Array.isArray(poincareAitoffData?.[key]) && poincareAitoffData[key].length > 0
    ));
    if (hasStokes || !heatmapsData?.I?.pulse_phase?.length) return poincareAitoffData;

    const phases = heatmapsData.I.pulse_phase as number[];
    let phaseIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    phases.forEach((phase, index) => {
      const distance = Math.abs(Number(phase) - aitoffPhase);
      if (distance < bestDistance) {
        bestDistance = distance;
        phaseIndex = index;
      }
    });

    const stokesAtPhase = (label: "I" | "Q" | "U" | "V") => {
      const rows = heatmapsData?.[label]?.heatmap_data;
      if (!Array.isArray(rows)) return [];
      return rows.map((row: unknown) => (
        Array.isArray(row) && Number.isFinite(Number(row[phaseIndex])) ? Number(row[phaseIndex]) : null
      ));
    };

    return {
      ...poincareAitoffData,
      pulse_number: poincareAitoffData.pulse_number ?? heatmapsData.I.pulse_number ?? [],
      I: stokesAtPhase("I"),
      Q: stokesAtPhase("Q"),
      U: stokesAtPhase("U"),
      V: stokesAtPhase("V"),
    };
  }, [aitoffPhase, heatmapsData, poincareAitoffData]);
  const combinedPulseStacksData = React.useMemo(() => {
    const polarQuantities = Array.isArray(polStacksData?.quantities) ? polStacksData.quantities : [];
    const heatmapQuantity = (label: "I" | "Q" | "U" | "V") => {
      const heatmap = heatmapsData?.[label];
      if (!heatmap) return null;
      return {
        name: label,
        data: heatmap.heatmap_data ?? [],
        vmin: heatmap.vmin,
        vmax: heatmap.vmax,
      };
    };
    const quantityByName = new Map<string, any>();
    polarQuantities.forEach((quantity: any) => {
      if (quantity?.key) quantityByName.set(quantity.key, quantity);
      if (quantity?.name) quantityByName.set(quantity.name, quantity);
    });
    (["I", "Q", "U", "V"] as const).forEach(label => {
      const quantity = heatmapQuantity(label);
      if (quantity) quantityByName.set(label, quantity);
    });

    const orderedQuantities = ["PA", "EA", "P/I", "L/I", "V/I", "|V/I|", "I", "V", "Q", "U"]
      .map(name => quantityByName.get(name))
      .filter(Boolean);
    if (!orderedQuantities.length) return null;
    const referenceHeatmap = heatmapsData?.I ?? heatmapsData?.Q ?? heatmapsData?.U ?? heatmapsData?.V;
    return {
      obs_id: polStacksData?.obs_id ?? referenceHeatmap?.obs_id,
      start_phase: polStacksData?.start_phase ?? startPhaseProfiles,
      end_phase: polStacksData?.end_phase ?? endPhaseProfiles,
      on_pulse: polStacksData?.on_pulse,
      phase_axis: polStacksData?.phase_axis ?? referenceHeatmap?.pulse_phase ?? [],
      pulse_number: polStacksData?.pulse_number ?? referenceHeatmap?.pulse_number ?? [],
      quantities: orderedQuantities,
      warning: polStacksData?.warning,
    };
  }, [endPhaseProfiles, heatmapsData, polStacksData, startPhaseProfiles]);
  const observationFilenameBase = React.useMemo(() => {
    const raw = obsMetadata?.obsId || "observation";
    return raw.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "observation";
  }, [obsMetadata?.obsId]);
  const phaseToken = (value: number) => Number.isFinite(value) ? value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "nan";
  const selectedPulseFilenameBase = `${observationFilenameBase}_for_pulse_index_${selectedSubpulseIndex}`;
  const selectedPhaseFilenameBase = `${observationFilenameBase}_at_phase_${phaseToken(aitoffPhase)}`;
  const phaseSliceFilenameBase = `${observationFilenameBase}_left_${phaseToken(leftPhaseHist)}_middle_${phaseToken(midPhaseHist)}_right_${phaseToken(rightPhaseHist)}`;
  const loadSelectedSubpulseDraft = () => {
    const requestedIndex = Math.max(0, Math.floor(Number(selectedSubpulseDraft) || 0));
    const nextIndex = totalSubpulses > 0 ? Math.min(requestedIndex, Math.max(0, totalSubpulses - 1)) : requestedIndex;
    setSelectedSubpulseDraft(String(nextIndex));
    if (nextIndex === selectedSubpulseIndex) return;
    setSelectedSubpulseIndex(nextIndex);
    setSubpulsePolarParamsData(null);
  };
  const loadAitoffPhaseDraft = () => {
    const requestedPhase = Number(aitoffPhaseDraft);
    const finitePhase = Number.isFinite(requestedPhase) ? requestedPhase : aitoffPhase;
    const nextPhase = Math.min(endPhaseAitoff, Math.max(startPhaseAitoff, finitePhase));
    setAitoffPhaseDraft(String(nextPhase));
    if (nextPhase === aitoffPhase) return;
    setAitoffPhase(nextPhase);
    setPoincareAitoffData(null);
  };
  const isMeerTimeLink = isMeerTimeUrl(url.trim());
  const shouldOfferRemoteCredentials = isMeerTimeLink || hasStoredRemoteCredentials || showRemoteCredentialFields;
  const shouldShowRemoteCredentialFields = shouldOfferRemoteCredentials && (!hasStoredRemoteCredentials || showRemoteCredentialFields);
  const polarParamsPlotThemeIsDark = isDark;
  const subpulsePlotThemeIsDark = isDark;
  const histogramsPlotThemeIsDark = isDark;
  const stacksPlotThemeIsDark = isDark;
  const totalIntensityPlotThemeIsDark = isDark;
  const phaseSlicesPlotThemeIsDark = isDark;
  const aitoffPlotThemeIsDark = isDark;
  const rvmFitPlotThemeIsDark = isDark;

  const handleChangeRemoteCredentials = () => {
    const savedRemoteCredentials = readRemoteAuthCookie(url.trim());
    if (savedRemoteCredentials) {
      setUsername(savedRemoteCredentials.username);
      setPassword(savedRemoteCredentials.password);
    }
    setShowRemoteCredentialFields(true);
  };

  const handleForgetRemoteCredentials = () => {
    clearRemoteAuthCookie(url.trim());
    setHasStoredRemoteCredentials(false);
    setShowRemoteCredentialFields(isMeerTimeLink);
    setUsername("");
    setPassword("");
  };

  const applyThemeImmediately = (nextIsDark: boolean) => {
    try {
      const root = document.documentElement;
      if (themeSwitchCleanupRef.current !== null) {
        window.clearTimeout(themeSwitchCleanupRef.current);
      }
      root.classList.add("theme-switching");
      root.classList.toggle("dark", nextIsDark);
      localStorage.setItem("theme", nextIsDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("theme-toggle", { detail: { dark: nextIsDark } }));
      themeSwitchCleanupRef.current = window.setTimeout(() => {
        root.classList.remove("theme-switching");
        themeSwitchCleanupRef.current = null;
      }, 140);
    } catch {
      // Theme feedback is best-effort; React state remains the source of truth.
    }
  };

  const handleToggleTheme = () => {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    applyThemeImmediately(nextIsDark);
    React.startTransition(() => setIsDark(nextIsDark));
  };

  const handleOpenLoadData = () => {
    setActivePage("analysis");
    setSidebarCollapsed(false);
    setLoadDataOpen(true);
  };

  const controlsPanelOpen = activePage === "analysis" && !sidebarCollapsed;

  const handleToggleControlsPanel = () => {
    if (controlsPanelOpen) {
      setSidebarCollapsed(true);
      return;
    }

    setActivePage("analysis");
    setSidebarCollapsed(false);
  };

  const handleOpenReadMe = () => {
    setActivePage("readme");
    setSidebarCollapsed(true);
  };

  const renderSectionHeading = (sectionKey: AnalysisSectionKey, title: string, state: PlotRequestViewState) => (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="section-heading-row collapsible-section-trigger"
        aria-expanded={openSections[sectionKey]}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${openSections[sectionKey] ? "" : "-rotate-90"}`} />
          <span className="section-title">{title}</span>
        </span>
        <PlotStatusBadge state={state} />
      </button>
    </CollapsibleTrigger>
  );

  return (
    <div className="min-h-screen w-full flex flex-col">
      <CatalogueModal 
        isOpen={catalogueModalOpen} 
        onClose={() => setCatalogueModalOpen(false)} 
        onUrlSelected={(selectedUrl) => {
          setUrl(selectedUrl);
          setCatalogueModalOpen(false);
        }}
      />
      <main className="page-shell w-full p-0">
        <div
          className={`analysis-workspace ${controlsPanelOpen ? "is-sidebar-open" : "is-sidebar-collapsed"}`}
          style={{ ["--analysis-sidebar-width" as string]: `${sidebarWidth}px` }}
        >
          <button
            type="button"
            className={`analysis-controls-toggle ${controlsPanelOpen ? "is-open" : "is-collapsed"}`}
            onClick={handleToggleControlsPanel}
            aria-label={controlsPanelOpen ? "Collapse analysis controls" : "Expand analysis controls"}
            aria-expanded={controlsPanelOpen}
            title={controlsPanelOpen ? "Collapse controls" : "Expand controls"}
          >
            {controlsPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        <aside className="analysis-sidebar" aria-label="Analysis controls" aria-hidden={!controlsPanelOpen}>
          {controlsPanelOpen && (
          <div className="analysis-sidebar-scroll">
          <Collapsible open={loadDataOpen} onOpenChange={setLoadDataOpen}>
          <section className="upload-stage sidebar-section sidebar-module">
          <CollapsibleTrigger asChild>
            <button type="button" className="section-heading-row collapsible-section-trigger mb-3" aria-expanded={loadDataOpen}>
              <span className="inline-flex min-w-0 items-center gap-2">
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${loadDataOpen ? "" : "-rotate-90"}`} />
                <span className="section-title">Load Data</span>
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="sidebar-collapsible-content">
          <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="form-label text-foreground">Upload file</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBrowseClick}
                    disabled={isPreparingInput}
                    className="sidebar-upload-button"
                  >
                    {isPreparingInput ? "Loading file..." : "Upload .npz file"}
                  </Button>
                  <span className="form-help text-foreground/80">Only `.npz` is accepted</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".npz"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <Label className="form-label text-foreground">File URL</Label>
                    <Input className="field-shell" type="text" placeholder="File URL" value={url} onChange={e => { setUrl(e.target.value); setInputLoadError(null); }} />
                  </div>

                  {shouldOfferRemoteCredentials && (
                    <div className="flex flex-col gap-3">
                      {shouldShowRemoteCredentialFields ? (
                        <>
                          <div>
                            <Label className="form-label text-foreground">Username</Label>
                            <Input className="field-shell" type="text" placeholder="Username" value={username} onChange={e => { setUsername(e.target.value); setInputLoadError(null); }} />
                          </div>
                          <div>
                            <Label className="form-label text-foreground">Password</Label>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={e => { setPassword(e.target.value); setInputLoadError(null); }}
                                className="field-shell pr-12"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(current => !current)}
                                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground hover:bg-muted"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                title={showPassword ? "Hide password" : "Show password"}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-card/70 p-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-medium">Using saved URL credentials</div>
                            <div className="truncate text-muted-foreground">{username}</div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={handleChangeRemoteCredentials}>
                              Change
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={handleForgetRemoteCredentials}>
                              Forget
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button onClick={handleLoadFromUrl} variant="outline" disabled={isPreparingInput} className="load-action-button hover:text-foreground">
                      {isLoadingRemoteFile
                        ? "Loading file..."
                        : isPreparingBackendDataset
                          ? "Preparing backend cache..."
                          : "Load from URL"}
                    </Button>
                  </div>
                  {inputLoadError && (
                    <div className="validation-note load-error-message" role="alert">
                      {inputLoadError}
                    </div>
                  )}
                </div>
          </div>
        </CollapsibleContent>
        </section>
        </Collapsible>

        {hasLoadedData && (
            <section className="sidebar-section sidebar-module phase-sidebar-module">
              <Collapsible defaultOpen className="phase-control-bar">
                <div className="phase-control-shell">
                  <div className="phase-control-header">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="phase-control-trigger" aria-label="Toggle phase controls">
                        <span className="min-w-0">
                          <span className="phase-control-title">Phase controls</span>
                          <span className="phase-control-summary">Applied: {appliedPhaseSummary}</span>
                        </span>
                        <ChevronDown className="phase-control-icon h-4 w-4" />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="phase-control-content">
                      <div className="phase-control-meta">
                        {obsMetadata && (
                          <>
                            <div><span>Obs ID</span>{obsMetadata.obsId}</div>
                            <div><span>Frequency</span>{obsMetadata.freq} MHz</div>
                            <div><span>UTC Start</span>{obsMetadata.utcStart}</div>
                          </>
                        )}
                        <div><span>Phase window</span>{startPhaseProfiles.toFixed(3)} - {endPhaseProfiles.toFixed(3)}</div>
                        <div><span>Pulse windows</span>{availableOnPulseWindows.map((windowValue, index) => `${index + 1}: ${windowValue.start.toFixed(3)}-${windowValue.end.toFixed(3)}`).join(" | ")}</div>
                        {hasInterpulseWindows && (
                          <div><span>Interpulse</span>Detected ({availableOnPulseWindows.length} on-pulse windows)</div>
                        )}
                        <div><span>Fixed phase</span>{aitoffPhase.toFixed(3)}</div>
                        <div><span>On-pulse window</span>{onPulseStartPolarParams.toFixed(3)} - {onPulseEndPolarParams.toFixed(3)}</div>
                        <div><span>Total pulses</span>{totalPulseCount > 0 ? totalPulseCount.toLocaleString() : "loading"}</div>
                      </div>
                      {hasInterpulseWindows && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="form-label text-foreground/80">Analyse on-pulse window</span>
                          {availableOnPulseWindows.map((windowValue, index) => (
                            <Button
                              key={`${windowValue.start}-${windowValue.end}-${index}`}
                              type="button"
                              variant={activeOnPulseWindowIndex === index ? "default" : "outline"}
                              size="sm"
                              disabled={isPreparingInput}
                              onClick={() => handleSelectOnPulseWindow(index)}
                            >
                              {index === 0 ? "Main pulse" : `Interpulse ${index}`} {windowValue.start.toFixed(3)}-{windowValue.end.toFixed(3)}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <Label className="form-label text-foreground">Start phase</Label>
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.001}
                            value={calculationPhaseDraft.start}
                            disabled={isPreparingInput}
                            onChange={e => handleCalculationPhaseDraftChange("start", e.target.value)}
                            className={calculationPhaseDraftInvalid ? "border-red-500 focus-visible:ring-red-500" : undefined}
                          />
                        </div>
                        <div>
                          <Label className="form-label text-foreground">Mid / fixed phase</Label>
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.001}
                            value={calculationPhaseDraft.mid}
                            disabled={isPreparingInput}
                            onChange={e => handleCalculationPhaseDraftChange("mid", e.target.value)}
                            className={calculationPhaseDraftInvalid ? "border-red-500 focus-visible:ring-red-500" : undefined}
                          />
                        </div>
                        <div>
                          <Label className="form-label text-foreground">End phase</Label>
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.001}
                            value={calculationPhaseDraft.end}
                            disabled={isPreparingInput}
                            onChange={e => handleCalculationPhaseDraftChange("end", e.target.value)}
                            className={calculationPhaseDraftInvalid ? "border-red-500 focus-visible:ring-red-500" : undefined}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="ghost" onClick={handleUseDatasetOnPulse} disabled={isPreparingInput}>
                          Use dataset window
                        </Button>
                        <Button type="button" onClick={handleApplyCalculationPhaseWindow} disabled={calculationPhaseDraftInvalid || isPreparingInput}>
                          {isPreparingBackendDataset ? "Preparing..." : "Apply and calculate"}
                        </Button>
                      </div>
                      {calculationPhaseDraftInvalid && (
                        <div className="basis-full text-sm font-semibold text-red-600">Use 0 &lt;= start &lt;= mid &lt;= end &lt;= 1.</div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </section>
        )}
          </div>
          )}
          {controlsPanelOpen && (
            <div
              className="analysis-sidebar-resizer"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={event => {
                event.preventDefault();
                sidebarResizeRef.current = true;
                document.body.classList.add("is-resizing-plots");
              }}
            />
          )}
        </aside>

        <section className="analysis-content">
          <header className="page-hero w-full flex flex-col gap-2">
            <div className="w-full flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="page-title font-bold text-foreground">Pulsar-PReSPIDAR</h1>
                <p className="page-subtitle mt-0.5 font-semibold text-foreground">
                  Pulsar-Polarisation REsolved Single Pulse Interactive Data AnalyseR
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:ml-4">
                <nav className="app-nav" aria-label="Application navigation">
                  <button type="button" className={`app-nav-button ${activePage === "analysis" ? "is-active" : ""}`} onClick={handleOpenLoadData}>
                    Analysis
                  </button>
                  <button type="button" className={`app-nav-button ${activePage === "readme" ? "is-active" : ""}`} onClick={handleOpenReadMe}>
                    Read Me
                  </button>
                </nav>
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className={`theme-orbit-toggle ${isDark ? "is-dark" : "is-light"}`}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  <span className="theme-orbit-track" aria-hidden="true">
                    <span className="theme-orbit-core theme-pulsar-core">
                      <span className="theme-pulsar-star" />
                      <span className="theme-pulsar-beam theme-pulsar-beam-a" />
                    </span>
                  </span>
                </button>
              </div>
            </div>
            <div className="page-intro text-left text-foreground">
              An open-source data-analysis tool for visualizing and exploring single-pulse data from the
              <a
                href="https://psrweb.jb.man.ac.uk/meertime/singlepulse/"
                className="underline text-accent ml-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                MeerTime Single Pulse Database
              </a>.
            </div>
          </header>
        {activePage === "readme" && <ReadMePage />}
        {activePage === "analysis" && hasLoadedData && (
          <>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <QueueStatusSummary
                concurrency={PLOT_REQUEST_CONCURRENCY}
                queuedCount={queuedPlotCount}
                runningCount={runningPlotCount}
              />
            </div>

            <div className="space-y-8">
              {/* Integrated pulse profile polarisation state evolution */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.integrated} onOpenChange={open => setOpenSections(current => ({ ...current, integrated: open }))}>
                    {renderSectionHeading("integrated", "Polarisation State Evolution: Integrated Pulse Profile", polarParamsState)}
                    {openSections.integrated && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={polarParamsState} label="Integrated pulse profile polarisation state evolution" hasData={!!polarParamsData?.dataset?.length} deferUntilVisible placeholderMinHeight="40rem">
                        <ErrorBoundary>
                          {polarParamsData?.dataset?.length ? (() => {
                            const integrated = polarParamsData.dataset[0];
                            const phaseAxis = polarParamsData.phase_axis ?? [];
                            if (!integrated || !phaseAxis.length) return null;
                            return (
                              <>
                                <PolarisationDualView
                                  phaseAxis={phaseAxis}
                                  data={{
                                    PA: integrated.PA ?? [],
                                    EA: integrated.EA ?? [],
                                    x: integrated.x ?? [],
                                    y: integrated.y ?? [],
                                    z: integrated.z ?? [],
                                    p_frac: integrated.p_frac ?? [],
                                    l_frac: integrated.l_frac ?? [],
                                    v_frac: integrated.v_frac ?? [],
                                    absv_frac: integrated.absv_frac ?? [],
                                  }}
                                  isDark={polarParamsPlotThemeIsDark}
                                  startPhase={startPhaseAitoff}
                                  endPhase={endPhaseAitoff}
                                  radiusOfCurvature={integrated.radius_of_curvature ?? []}
                                  stokesProfiles={{
                                    I: profilesData?.I,
                                    Q: profilesData?.Q,
                                    U: profilesData?.U,
                                    V: profilesData?.V,
                                  }}
                                  filenamePrefix={observationFilenameBase}
                                />
                              </>
                            );
                          })() : null}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Selected single pulse polarisation state evolution */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.selectedPulse} onOpenChange={open => setOpenSections(current => ({ ...current, selectedPulse: open }))}>
                    {renderSectionHeading("selectedPulse", "Polarisation State Evolution: Selected Single Pulse Profile", subpulseParamsState)}
                    {openSections.selectedPulse && (
                    <CollapsibleContent>
                    {topPulsePower.length > 0 && (
                      <div className="top-pulse-list" aria-label="Top 10 pulses by power">
                        <div className="top-pulse-list-title">Top 10 pulse indices by summed Stokes I power</div>
                        <div className="top-pulse-list-grid">
                          {topPulsePower.slice(0, 10).map((pulse, rank) => {
                            const pulseIndex = Number(pulse.pulse_index);
                            return (
                              <button
                                key={`${pulseIndex}-${rank}`}
                                type="button"
                                className={`top-pulse-chip ${selectedSubpulseIndex === pulseIndex ? "is-active" : ""}`}
                                onClick={() => {
                                  setSelectedSubpulseDraft(String(pulseIndex));
                                  setSelectedSubpulseIndex(pulseIndex);
                                  setSubpulsePolarParamsData(null);
                                }}
                              >
                                <span>{rank + 1}. {pulseIndex}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 items-end mt-2 sm:max-w-xs">
                      <div>
                        <Label className="form-label text-muted-foreground">Pulse index</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={totalSubpulses > 0 ? Math.max(0, totalSubpulses - 1) : undefined}
                            step={1}
                            value={selectedSubpulseDraft}
                            onChange={e => setSelectedSubpulseDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") loadSelectedSubpulseDraft();
                            }}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={loadSelectedSubpulseDraft}>
                            Load
                          </Button>
                          <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                            {selectedSubpulseIndex}/{totalSubpulses > 0 ? totalSubpulses.toLocaleString() : "..."}
                          </span>
                        </div>
                      </div>
                    </div>
                    {subpulseRangeInvalid && (
                      <div className="validation-note text-red-600 mt-1">Start phase must be &lt;= end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={subpulseParamsState} label="Selected subpulse polarisation" hasData={!!subpulsePolarParamsData?.dataset?.length} deferUntilVisible placeholderMinHeight="40rem">
                        <ErrorBoundary>
                          {subpulsePolarParamsData?.dataset?.length ? (() => {
                            const selectedSubpulse = subpulsePolarParamsData.dataset[0];
                            const phaseAxis = subpulsePolarParamsData.phase_axis ?? [];
                            if (!selectedSubpulse || !phaseAxis.length) return null;
                            return (
                              <PolarisationDualView
                                phaseAxis={phaseAxis}
                                data={{
                                  PA: selectedSubpulse.PA ?? [],
                                  EA: selectedSubpulse.EA ?? [],
                                  x: selectedSubpulse.x ?? [],
                                  y: selectedSubpulse.y ?? [],
                                  z: selectedSubpulse.z ?? [],
                                  p_frac: selectedSubpulse.p_frac ?? [],
                                  l_frac: selectedSubpulse.l_frac ?? [],
                                  v_frac: selectedSubpulse.v_frac ?? [],
                                  absv_frac: selectedSubpulse.absv_frac ?? [],
                                }}
                                isDark={subpulsePlotThemeIsDark}
                                startPhase={startPhaseSubpulse}
                                endPhase={endPhaseSubpulse}
                                radiusOfCurvature={selectedSubpulse.radius_of_curvature ?? []}
                                stokesProfiles={{
                                  I: { x: phaseAxis, y: selectedSubpulse.I ?? [] },
                                  Q: { x: phaseAxis, y: selectedSubpulse.Q ?? [] },
                                  U: { x: phaseAxis, y: selectedSubpulse.U ?? [] },
                                  V: { x: phaseAxis, y: selectedSubpulse.V ?? [] },
                                }}
                                filenamePrefix={selectedPulseFilenameBase}
                              />
                            );
                          })() : null}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Fixed-pulse-longitude polarisation state evolution */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.allPulsesPhase} onOpenChange={open => setOpenSections(current => ({ ...current, allPulsesPhase: open }))}>
                    {renderSectionHeading("allPulsesPhase", "Polarisation State Evolution: All Pulses at Selected Phase", aitoffState)}
                    {openSections.allPulsesPhase && (
                    <CollapsibleContent>
                    <div className="grid grid-cols-1 gap-2 items-end mt-2 sm:max-w-xs">
                      <div>
                        <Label className="form-label text-muted-foreground">Pulse Phase</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={startPhaseAitoff}
                            max={endPhaseAitoff}
                            step={0.001}
                            value={aitoffPhaseDraft}
                            onChange={e => setAitoffPhaseDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") loadAitoffPhaseDraft();
                            }}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={loadAitoffPhaseDraft}>
                            Load
                          </Button>
                          <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                            {startPhaseAitoff.toFixed(3)}-{endPhaseAitoff.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={aitoffState} label="Fixed-phase Poincare sphere" hasData={!!fixedPhaseAitoffData} deferUntilVisible placeholderMinHeight="32rem">
                        <ErrorBoundary>
                          {fixedPhaseAitoffData && (
                            <PoincareAitoffView data={fixedPhaseAitoffData} phaseValue={aitoffPhase} isDark={aitoffPlotThemeIsDark} filenamePrefix={selectedPhaseFilenameBase} />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* RVM fitting */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.rvmFit} onOpenChange={open => setOpenSections(current => ({ ...current, rvmFit: open }))}>
                    {renderSectionHeading("rvmFit", "RVM Fitting and Orthogonal Polarisation Modes", rvmFitState)}
                    {openSections.rvmFit && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={rvmFitState} label="RVM fitting" hasData={!!rvmFitData} deferUntilVisible placeholderMinHeight="38rem">
                        <ErrorBoundary>
                          {rvmFitData && (
                            <RvmFittingView
                              data={rvmFitData}
                              isDark={rvmFitPlotThemeIsDark}
                              filenamePrefix={observationFilenameBase}
                              onPulseWindows={availableOnPulseWindows}
                            />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Polarisation histograms (2D) */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.hist2d} onOpenChange={open => setOpenSections(current => ({ ...current, hist2d: open }))}>
                    {renderSectionHeading("hist2d", "2D Histograms: Polarisation Parameters Vs Phase", histogramsState)}
                    {openSections.hist2d && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={histogramsState} label="2D histograms" hasData={!!polHistogramData} deferUntilVisible placeholderMinHeight="34rem">
                        <ErrorBoundary>
                          {polHistogramData && (
                            <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
                              {POLARISATION_QUANTITIES.map(q => (
                                <div key={q}>
                                  <SinglePolarisationHistogram data={polHistogramData[q]} isDark={histogramsPlotThemeIsDark} filenamePrefix={observationFilenameBase} />
                                </div>
                              ))}
                            </div>
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Pulse stacks */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.pulseStacks} onOpenChange={open => setOpenSections(current => ({ ...current, pulseStacks: open }))}>
                    {renderSectionHeading("pulseStacks", "Pulse Stacks: Stokes and Polarisation Parameters", stacksState)}
                    {openSections.pulseStacks && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={stacksState} label="Pulse stacks" hasData={!!combinedPulseStacksData} deferUntilVisible placeholderMinHeight="34rem">
                        <ErrorBoundary>
                          {combinedPulseStacksData && (
                            <PolarisationStacks data={combinedPulseStacksData} isDark={stacksPlotThemeIsDark} filenamePrefix={observationFilenameBase} />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Phase-slice histograms section */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.phaseSlices} onOpenChange={open => setOpenSections(current => ({ ...current, phaseSlices: open }))}>
                    {renderSectionHeading("phaseSlices", "1D Histograms: Polarisation Parameters at Selected Phase", phaseSlicesState)}
                    {openSections.phaseSlices && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={phaseSlicesState} label="Phase-slice histograms" hasData={!!phaseHistogramData} deferUntilVisible placeholderMinHeight="30rem">
                        <ErrorBoundary>
                          {phaseHistogramData && (
                            <PhaseSliceHistograms
                              data={phaseHistogramData}
                              isDark={phaseSlicesPlotThemeIsDark}
                              phaseWindow={{ left: leftPhaseHist, mid: midPhaseHist, right: rightPhaseHist }}
                              filenamePrefix={phaseSliceFilenameBase}
                            />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

              {/* Total intensity evolution */}
              <section className="scientific-section section-plain">
                    <Collapsible open={openSections.totalIntensity} onOpenChange={open => setOpenSections(current => ({ ...current, totalIntensity: open }))}>
                    {renderSectionHeading("totalIntensity", "Total Intensity Evolution (Experimental)", totalIntensityState)}
                    {openSections.totalIntensity && (
                    <CollapsibleContent>
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={totalIntensityState} label="Total intensity evolution" hasData={!!totalIntensityData} deferUntilVisible placeholderMinHeight="40rem">
                        <ErrorBoundary>
                          {totalIntensityData && (
                            <TotalIntensityEvolution
                              data={totalIntensityData}
                              isDark={totalIntensityPlotThemeIsDark}
                              filenamePrefix={observationFilenameBase}
                            />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                    </CollapsibleContent>
                    )}
                    </Collapsible>
              </section>

            </div>
          </>
        )}
        </section>
        </div>
      </main>
    </div>
  );
};

function ReadMePage() {
  return (
    <section className="info-page readme-page" aria-label="Read Me document">
      <article className="readme-document">
        <p>
          This README area is reserved for the project notes, operating instructions, citations, and deployment details
          that should travel with the analysis workspace.
        </p>
        <p>
          Placeholder text can be replaced with a concise overview of the data format, the expected backend service,
          authentication requirements, and the recommended workflow for loading and analysing single-pulse observations.
        </p>
        <p>
          Add setup commands, environment variables, known limitations, and interpretation notes here. Keep the content
          plain and readable, like a document, so users can scan it without leaving the application.
        </p>
        <p>
          Future documentation can include examples for local files, MeerTime URLs, phase-window selection, plot exports,
          and deployment-specific backend configuration.
        </p>
      </article>
    </section>
  );
}

export default App;
