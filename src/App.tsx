import React, { useState, useEffect, useRef } from "react";
import WaterfallProfiles from "./WaterfallProfiles";
import PoincareAitoffFixed from "./PoincareAitoffFIxed";
import PhaseSliceHistograms from "./PhaseSliceHistograms";
import SinglePolarisationHistogram from "./SinglePolarisationHistogram";
import PolarisationStacks from "./PolarisationStacks";
import PolarisationDualView from "./PolarisationDualView";
import ErrorBoundary from "./components/ErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const prefersDark = () => {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (e) {
    return false;
  }
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(prefersDark);
  const [file, setFile] = useState<File | Blob | null>(null);
  const [url, setUrl] = useState<string>("https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz");
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
  const [obsMetadata, setObsMetadata] = useState<{
    obsId: string;
    freq: string;
    utcStart: string;
  } | null>(null);

  // Plot parameters
  // Per-plot phase ranges (unique to each plot)
  const [startPhaseProfiles, setStartPhaseProfiles] = useState(0.0);
  const [endPhaseProfiles, setEndPhaseProfiles] = useState(1.0);
  const [startPhaseHeatmaps, setStartPhaseHeatmaps] = useState(0.0);
  const [endPhaseHeatmaps, setEndPhaseHeatmaps] = useState(1.0);

  const isInvalidRange = (start: number, end: number) => start > end;

  // Extract observation ID from URL pattern and metadata
  const extractObsId = (url: string, pipelineInfo: any): string => {
    const match = url.match(/singlepulse\/([^\/]+)\/([^\/]+)\//);  
    if (!match) return "Unknown";
    
    const pulsar = match[1];
    const datetimeStr = match[2];
    const dateParts = datetimeStr.split("-");
    
    let date = "Unknown";
    let time = "Unknown";
    if (dateParts.length >= 3) {
      date = dateParts.slice(0, 3).join("-");
      time = dateParts.slice(3).join("-");
    } else {
      date = datetimeStr;
    }
    
    const freq = pipelineInfo?.input_data?.header?.FREQ ?? pipelineInfo?.header?.FREQ ?? 0.0;
    const freqRounded = Number(freq).toFixed(2);
    
    return `Pulsar-${pulsar}_Date-${date}_Time-${time}_Obs_Freq-${freqRounded}_MHz`;
  };

  const applyNewFile = (incoming: File | Blob) => {
    setFile(incoming);
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

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      applyNewFile(e.target.files[0]);
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (!droppedFile) return;
    if (!droppedFile.name.toLowerCase().endsWith(".npz")) {
      console.warn("Only .npz files are supported.");
      return;
    }
    applyNewFile(droppedFile);
  };
  // All JSX above was incorrectly placed. Only the main return below should have JSX.
    // Call /poincare_sphere_aitoff_fixedphase endpoint
    const fetchPoincareAitoffData = async () => {
      if (!file) {
        console.warn("No file selected or loaded.");
        return;
      }
      if (isInvalidRange(startPhaseAitoff, endPhaseAitoff)) {
        console.warn("Fix Aitoff on-pulse start/end: start must be ≤ end.");
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({
        phase_value: String(aitoffPhase),
        on_pulse_start: String(startPhaseAitoff),
        on_pulse_end: String(endPhaseAitoff),
      });
      try {
        const response = await fetch(`http://localhost:8000/poincare_sphere_aitoff_fixedphase?${params.toString()}`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Failed to fetch Aitoff Poincaré data");
        const result = await response.json();
        console.log("Poincaré Aitoff data:", result);
        if (result._debug) console.info("server debug:", result._debug);
        setPoincareAitoffData(result);
      } catch (err) {
        console.error("Error fetching Poincaré Aitoff data:", err);
      }
    };

    // Call /export_profiles endpoint
    const fetchProfilesData = async () => {
      if (!file) {
        console.warn("No file selected or loaded.");
        return;
      }
      if (isInvalidRange(startPhaseProfiles, endPhaseProfiles)) {
        console.warn("Fix Profiles start/end phase: start must be ≤ end.");
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({
        start_phase: String(startPhaseProfiles),
        end_phase: String(endPhaseProfiles),
      });
      try {
        const response = await fetch(`http://localhost:8000/export_profiles?${params.toString()}`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Failed to fetch profiles data");
        const result = await response.json();
        console.log("Profiles data:", result);
        if (result._debug) console.info("server debug:", result._debug);
        setProfilesData(result);
      } catch (err) {
        console.error("Error fetching profiles data:", err);
      }
    };
  // Handle URL load (fetch file as Blob and store in state)
  const handleLoadFromUrl = async () => {
    if (!url || !username || !password) {
      console.warn("Please fill in the URL and credentials.");
      return;
    }
    try {
      // If the URL points to the MeerTime server, route through the dev proxy at /api
      const meerTimeHost = "psrweb.jb.man.ac.uk";
      let fetchUrl = url;
      try {
        const parsed = new URL(url);
        if (parsed.host === meerTimeHost) {
          fetchUrl = url.replace(/^https?:\/\/[^/]+/, "/api");
        }
      } catch (e) {
        // leave fetchUrl as-is if URL parsing fails
      }

      const authHeader = { Authorization: "Basic " + btoa(username + ":" + password) };

      // Try to derive on-pulse window from pipeline_info.json that lives alongside the plots
      const plotsMarker = "/plots/";
      let onPulseStart = 0.0;
      let onPulseEnd = 1.0;
      let onPulseMid = 0.5;
      let pipelineJson: any = null;
      const markerIndex = fetchUrl.indexOf(plotsMarker);
      if (markerIndex !== -1) {
        const pipelineInfoUrl = fetchUrl.slice(0, markerIndex + plotsMarker.length) + "pipeline_info.json";
        try {
          const pipelineRes = await fetch(pipelineInfoUrl, { headers: authHeader });
          if (pipelineRes.ok) {
            pipelineJson = await pipelineRes.json();
            const candidate = pipelineJson?.windows?.on?.[0];
            if (Array.isArray(candidate) && candidate.length >= 2) {
              const candidateStart = Number(candidate[0]);
              const candidateEnd = Number(candidate[1]);
              if (Number.isFinite(candidateStart) && Number.isFinite(candidateEnd)) {
                onPulseStart = candidateStart;
                onPulseEnd = candidateEnd;
                onPulseMid = (candidateStart + candidateEnd) / 2;
              }
            }
          } else {
            console.warn("pipeline_info.json not reachable; using default on-pulse window");
          }
        } catch (err) {
          console.warn("Error fetching pipeline_info.json; using default on-pulse window", err);
        }
      }
      
      // Extract observation metadata
      if (pipelineJson) {
        const obsId = extractObsId(url, pipelineJson);
        const freq = pipelineJson?.input_data?.header?.FREQ ?? pipelineJson?.header?.FREQ ?? "Unknown";
        const utcStart = pipelineJson?.input_data?.header?.UTC_START ?? pipelineJson?.header?.UTC_START ?? "Unknown";
        setObsMetadata({
          obsId,
          freq: typeof freq === "number" ? freq.toFixed(2) : String(freq),
          utcStart: String(utcStart),
        });
      } else {
        setObsMetadata(null);
      }

      const response = await fetch(fetchUrl, {
        headers: authHeader,
      });
      if (!response.ok) throw new Error("Failed to fetch file");
      const blob = await response.blob();
      applyNewFile(blob);
      setLeftPhaseHist(onPulseStart);
      setMidPhaseHist(onPulseMid);
      setRightPhaseHist(onPulseEnd);
      setStartPhaseAitoff(onPulseStart);
      setEndPhaseAitoff(onPulseEnd);
      setAitoffPhase(onPulseMid);
      setStartPhasePolHist(onPulseStart);
      setEndPhasePolHist(onPulseEnd);
      setStartPhasePolStacks(onPulseStart);
      setEndPhasePolStacks(onPulseEnd);
      setStartPhaseProfiles(onPulseStart);
      setEndPhaseProfiles(onPulseEnd);
      setStartPhaseHeatmaps(onPulseStart);
      setEndPhaseHeatmaps(onPulseEnd);
      setStartPhasePolarParams(onPulseStart);
      setEndPhasePolarParams(onPulseEnd);
      setOnPulseStartPolarParams(onPulseStart);
      setOnPulseEndPolarParams(onPulseEnd);
    } catch (err) {
      console.error("Error loading file:", err);
    }
  };

  // Call /export_heatmaps endpoint
  const fetchHeatmapsData = async () => {
    if (!file) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhaseHeatmaps, endPhaseHeatmaps)) {
      console.warn("Fix Heatmaps start/end phase: start must be ≤ end.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      start_phase: String(startPhaseHeatmaps),
      end_phase: String(endPhaseHeatmaps),
    });
    try {
      const response = await fetch(`http://localhost:8000/export_heatmaps?${params.toString()}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to fetch heatmaps data");
      const result = await response.json();
      console.log("Heatmaps data:", result);
      if (result._debug) console.info("server debug:", result._debug);
      setHeatmapsData(result);
    } catch (err) {
      console.error("Error fetching heatmaps data:", err);
    }
  };

  // Call /polarisation_histogram endpoint for all quantities
  const fetchPolarisationHistograms = async () => {
    if (!file) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolHist, endPhasePolHist)) {
      console.warn("Fix polarisation histograms start/end: start must be ≤ end.");
      return;
    }

    const quantities = ["P/I", "L/I", "|V/I|", "V/I", "PA", "EA", "I", "dPA"];
    const results: Record<string, any> = {};

    await Promise.all(quantities.map(async q => {
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({
        start_phase: String(startPhasePolHist),
        end_phase: String(endPhasePolHist),
        on_pulse_start: String(startPhasePolHist),
        on_pulse_end: String(endPhasePolHist),
        quantity: q,
      });
      try {
        const response = await fetch(`http://localhost:8000/polarisation_histogram?${params.toString()}`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error(`Failed to fetch polarisation histogram for ${q}`);
        const result = await response.json();
        results[q] = result;
      } catch (err) {
        console.error(`Error fetching polarisation histogram ${q}:`, err);
        results[q] = null;
      }
    }));

    setPolHistogramData(results);
  };

  // Call /polarisation_stacks endpoint
  const fetchPolarisationStacks = async () => {
    if (!file) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolStacks, endPhasePolStacks)) {
      console.warn("Fix polarisation stacks start/end: start must be ≤ end.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      start_phase: String(startPhasePolStacks),
      end_phase: String(endPhasePolStacks),
      on_pulse_start: String(startPhasePolStacks),
      on_pulse_end: String(endPhasePolStacks),
    });
    try {
      const response = await fetch(`http://localhost:8000/polarisation_stacks?${params.toString()}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to fetch polarisation stacks");
      const result = await response.json();
      console.log("Polarisation stacks data:", result);
      if (result && (result as any)._debug) console.info("server debug:", (result as any)._debug);
      setPolStacksData(result);
    } catch (err) {
      console.error("Error fetching polarisation stacks:", err);
    }
  };

  // Call /polarisation_preprocess endpoint for derived parameters and Poincaré coords
  const fetchPolarisationParams = async () => {
    if (!file) {
      console.warn("No file selected or loaded.");
      return;
    }
    if (isInvalidRange(startPhasePolarParams, endPhasePolarParams)) {
      console.warn("Fix polarisation parameter start/end: start must be ≤ end.");
      return;
    }
    if (isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams)) {
      console.warn("Fix on-pulse start/end: start must be ≤ end.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      start_phase: String(startPhasePolarParams),
      end_phase: String(endPhasePolarParams),
      on_pulse_start: String(onPulseStartPolarParams),
      on_pulse_end: String(onPulseEndPolarParams),
    });

    try {
      const response = await fetch(`http://localhost:8000/polarisation_preprocess?${params.toString()}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to fetch polarisation parameters");
      const result = await response.json();
      console.log("Polarisation parameters:", result);
      setPolarParamsData(result);
    } catch (err) {
      console.error("Error fetching polarisation parameters:", err);
    }
  };

  // Auto-fetch polarisation params when file and ranges are ready
  useEffect(() => {
    if (!file) return;
    if (isInvalidRange(onPulseStartPolarParams, onPulseEndPolarParams)) return;
    fetchPolarisationParams();
  }, [file, onPulseStartPolarParams, onPulseEndPolarParams, startPhasePolarParams, endPhasePolarParams]);

  // Call /phase_slice_histograms endpoint
  const fetchPhaseSliceHistograms = async () => {
    if (!file) {
      console.warn("No file selected or loaded.");
      return;
    }
    const phasesOutOfOrder = leftPhaseHist > midPhaseHist || midPhaseHist > rightPhaseHist;
    if (phasesOutOfOrder) {
      console.warn("Fix phase slice order: left ≤ mid ≤ right.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      left_phase: String(leftPhaseHist),
      mid_phase: String(midPhaseHist),
      right_phase: String(rightPhaseHist),
    });

    try {
      const response = await fetch(`http://localhost:8000/phase_slice_histograms?${params.toString()}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to fetch phase-slice histograms");
      const result = await response.json();
      console.log("Phase-slice histogram data:", result);
      if (result._debug) console.info("server debug:", result._debug);
      setPhaseHistogramData(result);
    } catch (err) {
      console.error("Error fetching phase-slice histograms:", err);
    }
  };



  // Auto-fetch plots after a file is loaded and when phase ranges change.
  useEffect(() => {
    if (!file) return;
    // initial load for all plots
    fetchProfilesData();
    fetchHeatmapsData();
    fetchPoincareAitoffData();
    fetchPhaseSliceHistograms();
    fetchPolarisationHistograms();
    fetchPolarisationStacks();
  }, [file]);

  // Re-fetch profiles when its phase range changes
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchProfilesData(), 150);
    return () => clearTimeout(t);
  }, [startPhaseProfiles, endPhaseProfiles, file]);

  // Re-fetch heatmaps when its phase range changes
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchHeatmapsData(), 150);
    return () => clearTimeout(t);
  }, [startPhaseHeatmaps, endPhaseHeatmaps, file]);

  // Re-fetch Poincaré Aitoff when its phase changes
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchPoincareAitoffData(), 150);
    return () => clearTimeout(t);
  }, [aitoffPhase, startPhaseAitoff, endPhaseAitoff, file]);

  // Re-fetch phase-slice histograms on param change
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchPhaseSliceHistograms(), 150);
    return () => clearTimeout(t);
  }, [file, leftPhaseHist, midPhaseHist, rightPhaseHist]);

  // Re-fetch polarisation histograms when its phase range changes
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchPolarisationHistograms(), 150);
    return () => clearTimeout(t);
  }, [file, startPhasePolHist, endPhasePolHist]);

  // Re-fetch polarisation stacks when its phase range changes
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => fetchPolarisationStacks(), 150);
    return () => clearTimeout(t);
  }, [file, startPhasePolStacks, endPhasePolStacks]);

  useEffect(() => {
    try {
      const root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      window.dispatchEvent(new CustomEvent("theme-toggle", { detail: { dark: isDark } }));
    } catch (e) {
      /* noop */
    }
  }, [isDark]);

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="max-w-7xl mx-auto w-full px-8 pt-8 pb-4 flex flex-col gap-3">
        <div className="w-full flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Pulsar-PReSPIDAR</h1>
            <p className="text-sm mt-1 font-semibold text-muted-foreground">
              Pulsar-Polarisation REsolved Single Pulse Interactive Data AnalyseR
            </p>
          </div>
          <div className="ml-4">
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
                  <li>Trajectories of polarization state on the Poincaré sphere (Aitoff and 3D) for integrated and individual subpulses.</li>
                  <li>Polarization states on the Poincaré sphere at a fixed phase for all pulses (inspect O/X mode clustering).</li>
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
      <div className="max-w-7xl mx-auto w-full p-8 flex flex-col gap-8">
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
                <div className="grid grid-cols-2 gap-2">
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
                  <Button onClick={handleLoadFromUrl} variant="outline">Load from URL</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plots */}
        <div className="w-full">
          <div className="flex-1">
            <Card className="card-surface border-0 shadow-2xl h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-card-foreground">Plots</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-14">
                  {/* Polarisation parameters + Poincaré dual view */}
                  <div>
                    <div className="text-lg font-semibold">Polarisation parameters + Poincaré dual view + Custom plots</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">Ensure start ≤ end for the on-pulse window.</div>
                    )}
                    <div className="mt-4 w-full">
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
                            />
                          );
                        })() : null}
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Profiles + Heatmaps (integrated) */}
                  <div>
                    <div className="text-lg font-semibold">Waterfall Profiles (with Heatmaps)</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">Start phase must be ≤ end phase.</div>
                    )}
                    <div className="mt-4 w-full">
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
                    </div>
                  </div>

                  {/* Polarisation stacks */}
                  <div>
                    <div className="text-lg font-semibold">Polarisation stacks (pulse vs phase)</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">Start phase must be ≤ end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <ErrorBoundary>
                        {polStacksData && (
                          <PolarisationStacks data={polStacksData} isDark={isDark} />
                        )}
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Polarisation histograms (2D) */}
                  <div>
                    <div className="text-lg font-semibold">Phase-resolved polarisation histograms (2D)</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">Start phase must be ≤ end phase.</div>
                    )}
                    <div className="mt-4 w-full">
                      <ErrorBoundary>
                        {polHistogramData && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {["P/I", "L/I", "|V/I|", "V/I", "PA", "EA", "I", "dPA"].map(q => (
                              <div key={q} className="border border-border/50 rounded-lg">
                                <SinglePolarisationHistogram data={polHistogramData[q]} isDark={isDark} />
                              </div>
                            ))}
                          </div>
                        )}
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Phase-slice histograms section */}
                  <div>
                    <div className="text-lg font-semibold">Phase-slice histograms</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">Ensure phase order: left ≤ mid ≤ right.</div>
                    )}
                    <div className="mt-4 w-full">
                      <ErrorBoundary>
                        {phaseHistogramData && (
                          <PhaseSliceHistograms
                            data={phaseHistogramData}
                            isDark={isDark}
                            phaseWindow={{ left: leftPhaseHist, mid: midPhaseHist, right: rightPhaseHist }}
                          />
                        )}
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Poincaré Aitoff section */}
                  <div>
                    <div className="text-lg font-semibold">Poincaré Sphere (Aitoff, fixed phase)</div>
                    {obsMetadata && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-sm text-red-600 mt-1">On-pulse start must be ≤ end.</div>
                    )}
                    <div className="mt-4 w-full">
                      <ErrorBoundary>
                        {poincareAitoffData && (
                          <PoincareAitoffFixed data={poincareAitoffData} phaseValue={aitoffPhase} isDark={isDark} />
                        )}
                      </ErrorBoundary>
                    </div>
                  </div>
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