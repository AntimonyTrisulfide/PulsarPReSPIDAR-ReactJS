import React, { useState, useEffect, useRef } from "react";
import WaterfallProfiles from "@/features/plots/WaterfallProfiles";
import PoincareAitoffView from "@/features/plots/PoincareAitoffView";
import PhaseSliceHistograms from "@/features/plots/PhaseSliceHistograms";
import SinglePolarisationHistogram from "@/features/plots/SinglePolarisationHistogram";
import PolarisationStacks from "@/features/plots/PolarisationStacks";
import PolarisationDualView from "@/features/plots/PolarisationDualView";
import ErrorBoundary from "./components/ErrorBoundary";
import { CatalogueModal } from "./components/CatalogueModal";
import {
  PlotResultSlot,
  PlotStatusBadge,
  QueueStatusSummary,
  type PlotRequestViewState,
} from "./components/PlotLoadingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DEFAULT_MEERTIME_NPZ_URL,
  POLARISATION_QUANTITIES,
  fetchHeatmapsData as requestHeatmapsData,
  fetchPhaseSliceHistograms as requestPhaseSliceHistograms,
  fetchPoincareAitoffData as requestPoincareAitoffData,
  fetchPolarisationHistograms as requestPolarisationHistograms,
  fetchPolarisationParams as requestPolarisationParams,
  fetchPolarisationStacks as requestPolarisationStacks,
  fetchProfilesData as requestProfilesData,
  isInvalidPhaseRange,
  loadRemoteNpz,
  prepareDataset as requestPrepareDataset,
  type DatasetSource,
  type ObservationMetadata,
} from "@/api/polarimetryApi";
import { useThemePreference } from "@/hooks/useThemePreference";

type PlotRequestKey = "profiles" | "heatmaps" | "aitoff" | "phaseSlices" | "polarHistograms" | "polarStacks" | "polarParams";
type PlotRequestState = PlotRequestViewState & { version: number };
type QueuedPlotRequest = {
  key: PlotRequestKey;
  task: () => Promise<void>;
  version: number;
};

const PLOT_REQUEST_KEYS: PlotRequestKey[] = ["profiles", "heatmaps", "aitoff", "phaseSlices", "polarHistograms", "polarStacks", "polarParams"];
const PLOT_REQUEST_DEBOUNCE_MS = 350;
const PLOT_REQUEST_CONCURRENCY = getPositiveIntegerEnv(import.meta.env.VITE_PLOT_REQUEST_CONCURRENCY, 1);
const PLOT_REQUEST_COOLDOWN_MS = getNonNegativeNumberEnv(import.meta.env.VITE_PLOT_REQUEST_COOLDOWN_MS, 550);
const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

function getPositiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function getNonNegativeNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function createPlotRequestStates(): Record<PlotRequestKey, PlotRequestState> {
  return {
    profiles: { status: "idle", version: 0 },
    heatmaps: { status: "idle", version: 0 },
    aitoff: { status: "idle", version: 0 },
    phaseSlices: { status: "idle", version: 0 },
    polarHistograms: { status: "idle", version: 0 },
    polarStacks: { status: "idle", version: 0 },
    polarParams: { status: "idle", version: 0 },
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The backend request failed.";
}

const App: React.FC = () => {
  const [isDark, setIsDark] = useThemePreference();
  const [catalogueModalOpen, setCatalogueModalOpen] = useState(false);
  const [file, setFile] = useState<File | Blob | null>(null);
  const [url, setUrl] = useState<string>(DEFAULT_MEERTIME_NPZ_URL);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [poincareAitoffData, setPoincareAitoffData] = useState<any>(null);
  const [phaseHistogramData, setPhaseHistogramData] = useState<any>(null);
  const [polHistogramData, setPolHistogramData] = useState<Record<string, any> | null>(null);
  const [polStacksData, setPolStacksData] = useState<any>(null);
  const [polarParamsData, setPolarParamsData] = useState<any>(null);
  const [startPhaseAitoff, setStartPhaseAitoff] = useState(0.0);
  const [endPhaseAitoff, setEndPhaseAitoff] = useState(1.0);
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
  const [aitoffPhase, setAitoffPhase] = useState(0.0);
  const [leftPhaseHist, setLeftPhaseHist] = useState(0.0);
  const [midPhaseHist, setMidPhaseHist] = useState(0.5);
  const [rightPhaseHist, setRightPhaseHist] = useState(1.0);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [obsMetadata, setObsMetadata] = useState<ObservationMetadata | null>(null);
  const [isLoadingRemoteFile, setIsLoadingRemoteFile] = useState(false);
  const [isPreparingBackendDataset, setIsPreparingBackendDataset] = useState(false);
  const [preparedDataKey, setPreparedDataKey] = useState<string | null>(null);
  const [plotRequestStates, setPlotRequestStates] = useState<Record<PlotRequestKey, PlotRequestState>>(createPlotRequestStates);
  const activePlotRequestsRef = useRef(0);
  const queuedPlotRequestsRef = useRef<QueuedPlotRequest[]>([]);
  const plotRequestVersionsRef = useRef<Record<PlotRequestKey, number>>({
    profiles: 0,
    heatmaps: 0,
    aitoff: 0,
    phaseSlices: 0,
    polarHistograms: 0,
    polarStacks: 0,
    polarParams: 0,
  });

  // Plot parameters
  // Per-plot phase ranges (unique to each plot)
  const [startPhaseProfiles, setStartPhaseProfiles] = useState(0.0);
  const [endPhaseProfiles, setEndPhaseProfiles] = useState(1.0);
  const [startPhaseHeatmaps, setStartPhaseHeatmaps] = useState(0.0);
  const [endPhaseHeatmaps, setEndPhaseHeatmaps] = useState(1.0);

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

      job.task()
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

  const schedulePlotRequest = (key: PlotRequestKey, task: () => Promise<void>) => {
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
          ? "Waiting for the 512 MB-safe backend queue."
          : "Waiting for an available backend worker.",
      },
    }));
    processPlotQueue();
  };

  const applyNewFile = (incoming: File | Blob, nextPreparedDataKey: string | null = null) => {
    resetPlotRequestQueue();
    setFile(incoming);
    setPreparedDataKey(nextPreparedDataKey);
    setObsMetadata(null);
    setPoincareAitoffData(null);
    setPhaseHistogramData(null);
    setPolHistogramData(null);
    setPolStacksData(null);
    setPolarParamsData(null);
    setStartPhaseAitoff(0.0);
    setEndPhaseAitoff(1.0);
    setStartPhasePolHist(0.0);
    setEndPhasePolHist(1.0);
    setStartPhasePolStacks(0.0);
    setEndPhasePolStacks(1.0);
    setStartPhasePolarParams(0.0);
    setEndPhasePolarParams(1.0);
    setOnPulseStartPolarParams(0.0);
    setOnPulseEndPolarParams(1.0);
    setProfilesData(null);
    setHeatmapsData(null);
    setLeftPhaseHist(0.0);
    setMidPhaseHist(0.5);
    setRightPhaseHist(1.0);
  };

  const prepareBackendDataset = async (incoming: File | Blob, onPulse: { start: number; end: number }) => {
    setIsPreparingBackendDataset(true);
    try {
      const prepared = await requestPrepareDataset(incoming, onPulse);
      return prepared.data_key;
    } catch (error) {
      console.warn("Backend dataset preparation failed; falling back to per-request upload.", error);
      return null;
    } finally {
      setIsPreparingBackendDataset(false);
    }
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const dataKey = await prepareBackendDataset(selectedFile, { start: 0, end: 1 });
      applyNewFile(selectedFile, dataKey);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (!droppedFile) return;
    if (!droppedFile.name.toLowerCase().endsWith(".npz")) {
      console.warn("Only .npz files are supported.");
      return;
    }
    const dataKey = await prepareBackendDataset(droppedFile, { start: 0, end: 1 });
    applyNewFile(droppedFile, dataKey);
  };
  const fetchPoincareAitoffData = async () => {
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
      setPoincareAitoffData(result);
    } catch (err) {
      console.error("Error fetching Poincare Aitoff data:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  const fetchProfilesData = async () => {
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
      setProfilesData(result);
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
    if (!url || !username || !password) {
      console.warn("Please fill in the URL and credentials.");
      return;
    }
    setIsLoadingRemoteFile(true);
    try {
      const remoteFile = await loadRemoteNpz(url, username, password);
      const { start, end, mid } = remoteFile.onPulse;
      const dataKey = await prepareBackendDataset(remoteFile.blob, { start, end });
      applyNewFile(remoteFile.blob, dataKey);
      setObsMetadata(remoteFile.metadata);
      setLeftPhaseHist(start);
      setMidPhaseHist(mid);
      setRightPhaseHist(end);
      setStartPhaseAitoff(start);
      setEndPhaseAitoff(end);
      setAitoffPhase(mid);
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
    } catch (err) {
      console.error("Error loading file:", err);
    } finally {
      setIsLoadingRemoteFile(false);
    }
  };

  // Call /export_heatmaps endpoint
  const fetchHeatmapsData = async () => {
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
      setHeatmapsData(result);
    } catch (err) {
      console.error("Error fetching heatmaps data:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  // Call /polarisation_histogram endpoint for all quantities
  const fetchPolarisationHistograms = async () => {
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
      const results = await requestPolarisationHistograms(source, {
        start: startPhasePolHist,
        end: endPhasePolHist,
      });
      setPolHistogramData(results as Record<string, any>);
    } catch (err) {
      console.error("Error fetching polarisation histograms:", err);
      throw err;
    }
  };

  // Call /polarisation_stacks endpoint
  const fetchPolarisationStacks = async () => {
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
      const result = await requestPolarisationStacks(source, {
        start: startPhasePolStacks,
        end: endPhasePolStacks,
      });
      setPolStacksData(result);
    } catch (err) {
      console.error("Error fetching polarisation stacks:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.warn("Backend may be overloaded or unavailable (502). Try refreshing in a moment.");
      }
      throw err;
    }
  };

  // Call /polarisation_preprocess endpoint for derived parameters and Poincare coords
  const fetchPolarisationParams = async () => {
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
      setPolarParamsData(result);
    } catch (err) {
      console.error("Error fetching polarisation parameters:", err);
      throw err;
    }
  };

  // Call /phase_slice_histograms endpoint
  const fetchPhaseSliceHistograms = async () => {
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
      const result = await requestPhaseSliceHistograms(source, {
        left: leftPhaseHist,
        mid: midPhaseHist,
        right: rightPhaseHist,
      });
      setPhaseHistogramData(result);
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
    if (!file) return;
    if (isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams)) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarParams", fetchPolarisationParams),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, onPulseStartPolarParams, onPulseEndPolarParams, startPhasePolarParams, endPhasePolarParams]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("profiles", fetchProfilesData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [startPhaseProfiles, endPhaseProfiles, file]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("heatmaps", fetchHeatmapsData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [startPhaseHeatmaps, endPhaseHeatmaps, file]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("aitoff", fetchPoincareAitoffData),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [aitoffPhase, startPhaseAitoff, endPhaseAitoff, file]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("phaseSlices", fetchPhaseSliceHistograms),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, leftPhaseHist, midPhaseHist, rightPhaseHist]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarHistograms", fetchPolarisationHistograms),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, startPhasePolHist, endPhasePolHist]);

  useEffect(() => {
    if (!file) return;
    const t = window.setTimeout(
      () => schedulePlotRequest("polarStacks", fetchPolarisationStacks),
      PLOT_REQUEST_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [file, startPhasePolStacks, endPhasePolStacks]);

  const polarParamsState = getCombinedPlotState("polarParams");
  const profilesState = getCombinedPlotState("profiles", "heatmaps");
  const stacksState = getCombinedPlotState("polarStacks");
  const histogramsState = getCombinedPlotState("polarHistograms");
  const phaseSlicesState = getCombinedPlotState("phaseSlices");
  const aitoffState = getCombinedPlotState("aitoff");
  const runningPlotCount = Object.values(plotRequestStates).filter(state => state.status === "running").length;
  const queuedPlotCount = Object.values(plotRequestStates).filter(state => state.status === "queued").length;

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
      <header className="max-w-7xl mx-auto w-full px-5 sm:px-8 pt-8 pb-4 flex flex-col gap-3">
        <div className="w-full flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-foreground leading-tight">Pulsar-PReSPIDAR</h1>
            <p className="text-sm mt-1 font-semibold text-muted-foreground">
              Pulsar-Polarisation REsolved Single Pulse Interactive Data AnalyseR
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:ml-4">
            <Button variant="outline" onClick={() => setCatalogueModalOpen(true)}>
              Browse Catalogue
            </Button>
            <Button variant="outline" onClick={() => setIsDark(d => !d)}>
              {isDark ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </div>
        <div className="text-center text-base text-muted-foreground mb-2">
          An open-source data-analysis tool for visualizing and exploring single-pulse polarimetry data from the
          <a
            href="https://psrweb.jb.man.ac.uk/meertime/singlepulse/"
            className="underline text-accent ml-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            MeerTime Single Pulse Database
          </a>.
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="mx-auto block">Details</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div><b>Default MeerTime Link:</b></div>
              <div className="break-all bg-card p-2 rounded text-foreground">
                https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz
              </div>
              <div className="space-y-2 leading-relaxed">
                <div className="text-foreground font-semibold">What this tool does</div>
                <p className="text-sm">
                  This tool lets you upload pulsar single-pulse data in .npy or .npz format (as available from the MeerTime database), and generates a series of interactive visualizations to explore the polarization state of the pulsar signal.
                </p>
                <div className="text-foreground font-semibold">Features (as of January 02, 2026)</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>Waterfall plots and integrated profiles of each Stokes parameter.</li>
                  <li>Individual pulse profiles for selected pulse indices.</li>
                  <li>Polarization parameter vs pulse phase integrated over all pulses.</li>
                  <li>Pulse stacks of polarization parameters.</li>
                  <li>2|EA| v/s P/I plot (Oswald et al., 2023) for partial coherence model checks.</li>
                  <li>2D histograms of polarization parameters with 1D histograms for specific phases.</li>
                  <li>Trajectories of polarization state on the Poincare sphere (Aitoff and 3D) for integrated and individual subpulses.</li>
                  <li>Polarization states on the Poincare sphere at a fixed phase for all pulses (inspect O/X mode clustering).</li>
                  <li>Linear polarisation parameter is bias-corrected.</li>
                  <li>Radius of curvature (circle fitting) of the polarization trajectory vs pulse phase.</li>
                  <li>For uploaded numpy files, on-pulse window is inferred from noise floor as a fraction of peak integrated intensity (user input).</li>
                  <li>For data fetched from MeerTime URL, on-pulse is inferred automatically.</li>
                </ul>
                <div className="text-foreground font-semibold">Abbreviations</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>I, Q, U, V are the four Stokes parameters.</li>
                  <li>PA is polarisation angle; EA is ellipticity angle.</li>
                  <li>L is linear polarisation; P is total polarisation; lowercase l and p are fractional counterparts.</li>
                </ul>
                <div className="text-foreground font-semibold">Contact</div>
                <p>Need help or suggestions? Reach out to <a href="mailto:pmarmat@ph.iitr.ac.in" className="underline text-accent">Piyush Marmat</a>.</p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </header>
      <div className="max-w-7xl mx-auto w-full p-5 sm:p-8 flex flex-col gap-8">
        {/* Upload: full width first */}
        <div>
          <Card className="card-surface border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-card-foreground">Upload Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">Choose file</Label>
                <div
                  onClick={handleBrowseClick}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mt-1 flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-sm transition-colors cursor-pointer ${isDragActive ? "border-ring bg-primary/5 text-foreground" : "border-border/70 bg-input/40 text-muted-foreground"}`}
                >
                  <span className="font-semibold text-foreground">Click or drag a .npz file</span>
                  <span className="text-xs text-muted-foreground mt-1">Only .npz is accepted</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".npz"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                <div className="text-center text-muted-foreground">or</div>
                <Label className="text-muted-foreground">File URL</Label>
                <Input type="text" placeholder="File URL" value={url} onChange={e => setUrl(e.target.value)} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Username</Label>
                    <Input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Password</Label>
                    <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={handleLoadFromUrl} variant="outline" disabled={isPreparingInput}>
                    {isLoadingRemoteFile
                      ? "Loading file..."
                      : isPreparingBackendDataset
                        ? "Preparing backend cache..."
                        : "Load from URL"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plots */}
        <div className="w-full">
          <div className="flex-1">
            <Card className="card-surface border-0 shadow-2xl h-full flex flex-col">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-card-foreground">Plots</CardTitle>
                <QueueStatusSummary
                  concurrency={PLOT_REQUEST_CONCURRENCY}
                  queuedCount={queuedPlotCount}
                  runningCount={runningPlotCount}
                />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-14">
                  {/* Polarisation parameters + Poincare dual view */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Polarisation parameters, Poincare view, and custom plots</h2>
                      <PlotStatusBadge state={polarParamsState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">On-pulse start / start phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={onPulseStartPolarParams}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setOnPulseStartPolarParams(val);
                            setStartPhasePolarParams(val);
                          }}
                          className={isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">On-pulse end / end phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={onPulseEndPolarParams}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setOnPulseEndPolarParams(val);
                            setEndPhasePolarParams(val);
                          }}
                          className={isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                    </div>
                    {isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams) && (
                      <div className="text-sm text-red-600 mt-1">Ensure start &lt;= end for the on-pulse window.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={polarParamsState} label="Polarisation parameters" hasData={!!polarParamsData?.dataset?.length}>
                        <ErrorBoundary>
                          {polarParamsData?.dataset?.length ? (() => {
                            const integrated = polarParamsData.dataset[0];
                            const phaseAxis = polarParamsData.phase_axis ?? [];
                            if (!integrated || !phaseAxis.length) return null;
                            return (
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
                                isDark={isDark}
                                startPhase={startPhaseAitoff}
                                endPhase={endPhaseAitoff}
                              />
                            );
                          })() : null}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>

                  {/* Profiles + Heatmaps (integrated) */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Waterfall profiles and integrated heatmaps</h2>
                      <PlotStatusBadge state={profilesState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">Start Phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={startPhaseProfiles}
                          onChange={e => setStartPhaseProfiles(Number(e.target.value))}
                          className={isInvalidRange(startPhaseProfiles, endPhaseProfiles) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">End Phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={endPhaseProfiles}
                          onChange={e => setEndPhaseProfiles(Number(e.target.value))}
                          className={isInvalidRange(startPhaseProfiles, endPhaseProfiles) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                    </div>
                    {isInvalidRange(startPhaseProfiles, endPhaseProfiles) && (
                      <div className="text-sm text-red-600 mt-1">Start phase must be &lt;= end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={profilesState} label="Waterfall profiles and heatmaps" hasData={!!profilesData}>
                        <ErrorBoundary>
                          {profilesData && (
                            <WaterfallProfiles
                              data={profilesData}
                              heatmaps={heatmapsData}
                              startPhase={startPhaseProfiles}
                              endPhase={endPhaseProfiles}
                              isDark={isDark}
                            />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>

                  {/* Polarisation stacks */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Polarisation stacks</h2>
                      <PlotStatusBadge state={stacksState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">Start phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={startPhasePolStacks}
                          onChange={e => setStartPhasePolStacks(Number(e.target.value))}
                          className={isInvalidRange(startPhasePolStacks, endPhasePolStacks) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">End phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={endPhasePolStacks}
                          onChange={e => setEndPhasePolStacks(Number(e.target.value))}
                          className={isInvalidRange(startPhasePolStacks, endPhasePolStacks) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                    </div>
                    {isInvalidRange(startPhasePolStacks, endPhasePolStacks) && (
                      <div className="text-sm text-red-600 mt-1">Start phase must be &lt;= end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={stacksState} label="Polarisation stacks" hasData={!!polStacksData}>
                        <ErrorBoundary>
                          {polStacksData && (
                            <PolarisationStacks data={polStacksData} isDark={isDark} />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>

                  {/* Polarisation histograms (2D) */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Phase-resolved polarisation histograms</h2>
                      <PlotStatusBadge state={histogramsState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">Start phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={startPhasePolHist}
                          onChange={e => setStartPhasePolHist(Number(e.target.value))}
                          className={isInvalidRange(startPhasePolHist, endPhasePolHist) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">End phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={endPhasePolHist}
                          onChange={e => setEndPhasePolHist(Number(e.target.value))}
                          className={isInvalidRange(startPhasePolHist, endPhasePolHist) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                    </div>
                    {isInvalidRange(startPhasePolHist, endPhasePolHist) && (
                      <div className="text-sm text-red-600 mt-1">Start phase must be &lt;= end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={histogramsState} label="Phase-resolved polarisation histograms" hasData={!!polHistogramData}>
                        <ErrorBoundary>
                          {polHistogramData && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {POLARISATION_QUANTITIES.map(q => (
                                <div key={q} className="border border-border/50 rounded-lg">
                                  <SinglePolarisationHistogram data={polHistogramData[q]} isDark={isDark} />
                                </div>
                              ))}
                            </div>
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>

                  {/* Phase-slice histograms section */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Phase-slice histograms</h2>
                      <PlotStatusBadge state={phaseSlicesState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">Left phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={leftPhaseHist}
                          onChange={e => setLeftPhaseHist(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Mid phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={midPhaseHist}
                          onChange={e => setMidPhaseHist(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Right phase</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={rightPhaseHist}
                          onChange={e => setRightPhaseHist(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    {(leftPhaseHist > midPhaseHist || midPhaseHist > rightPhaseHist) && (
                      <div className="text-sm text-red-600 mt-1">Ensure phase order: left &lt;= mid &lt;= right.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={phaseSlicesState} label="Phase-slice histograms" hasData={!!phaseHistogramData}>
                        <ErrorBoundary>
                          {phaseHistogramData && (
                            <PhaseSliceHistograms
                              data={phaseHistogramData}
                              isDark={isDark}
                              phaseWindow={{ left: leftPhaseHist, mid: midPhaseHist, right: rightPhaseHist }}
                            />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>

                  {/* Poincare Aitoff section */}
                  <section className="scientific-section">
                    <div className="section-heading-row">
                      <h2 className="section-title">Fixed-phase Poincare sphere</h2>
                      <PlotStatusBadge state={aitoffState} />
                    </div>
                    {obsMetadata && (
                      <div className="section-metadata">
                        <div>Obs ID: {obsMetadata.obsId}</div>
                        <div>Frequency: {obsMetadata.freq} MHz | UTC Start: {obsMetadata.utcStart}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 items-end mt-2">
                      <div>
                        <Label className="text-muted-foreground">Phase value</Label>
                        <Input type="number" min={0} max={1} step={0.001} value={aitoffPhase} onChange={e => setAitoffPhase(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">On-pulse start</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={startPhaseAitoff}
                          onChange={e => setStartPhaseAitoff(Number(e.target.value))}
                          className={isInvalidRange(startPhaseAitoff, endPhaseAitoff) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                      <div>
                        <Label className="text-muted-foreground">On-pulse end</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.001}
                          value={endPhaseAitoff}
                          onChange={e => setEndPhaseAitoff(Number(e.target.value))}
                          className={isInvalidRange(startPhaseAitoff, endPhaseAitoff) ? "border-red-500 focus-visible:ring-red-500" : undefined}
                        />
                      </div>
                    </div>
                    {isInvalidRange(startPhaseAitoff, endPhaseAitoff) && (
                      <div className="text-sm text-red-600 mt-1">On-pulse start must be &lt;= end.</div>
                    )}
                    <div className="mt-4 w-full">
                      <PlotResultSlot state={aitoffState} label="Fixed-phase Poincare sphere" hasData={!!poincareAitoffData}>
                        <ErrorBoundary>
                          {poincareAitoffData && (
                            <PoincareAitoffView data={poincareAitoffData} phaseValue={aitoffPhase} isDark={isDark} />
                          )}
                        </ErrorBoundary>
                      </PlotResultSlot>
                    </div>
                  </section>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
