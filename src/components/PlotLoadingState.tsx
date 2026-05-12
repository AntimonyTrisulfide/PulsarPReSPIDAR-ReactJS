import type { ReactNode } from "react";
import { AlertTriangle, Clock3, Gauge, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlotRequestStatus = "idle" | "queued" | "running" | "error";

export type PlotRequestViewState = {
  status: PlotRequestStatus;
  message?: string;
};

type PlotStatusBadgeProps = {
  state: PlotRequestViewState;
};

type QueueStatusSummaryProps = {
  concurrency: number;
  queuedCount: number;
  runningCount: number;
};

type PlotResultSlotProps = {
  children: ReactNode;
  className?: string;
  hasData: boolean;
  label: string;
  state: PlotRequestViewState;
};

export function PlotStatusBadge({ state }: PlotStatusBadgeProps) {
  if (state.status === "idle") return null;

  const isBusy = state.status === "queued" || state.status === "running";
  const Icon = state.status === "queued" ? Clock3 : state.status === "error" ? AlertTriangle : Loader2;
  const label = state.status === "queued" ? "Queued" : state.status === "error" ? "Failed" : "Rendering";

  return (
    <div className={cn("plot-status-badge", isBusy && "plot-status-badge-busy", state.status === "error" && "plot-status-badge-error")}>
      <Icon className={cn("h-3.5 w-3.5", state.status === "running" && "animate-spin")} />
      <span>{label}</span>
    </div>
  );
}

export function QueueStatusSummary({ concurrency, queuedCount, runningCount }: QueueStatusSummaryProps) {
  const isBusy = queuedCount > 0 || runningCount > 0;
  const label = isBusy
    ? `${runningCount} running, ${queuedCount} queued`
    : concurrency === 1
      ? "Queue idle"
      : `${concurrency} backend workers idle`;

  return (
    <div className={cn("plot-queue-summary", isBusy && "plot-queue-summary-busy")}>
      <Gauge className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

export function PlotResultSlot({ children, className, hasData, label, state }: PlotResultSlotProps) {
  const isBusy = state.status === "queued" || state.status === "running";

  if (!hasData && state.status === "idle") return null;

  return (
    <div className={cn("plot-result-slot", className)}>
      {hasData ? children : <PlotLoadingPanel label={label} state={state} />}
      {hasData && isBusy && <div className="plot-refresh-progress" aria-hidden="true" />}
    </div>
  );
}

function PlotLoadingPanel({ label, state }: { label: string; state: PlotRequestViewState }) {
  const isError = state.status === "error";
  const isQueued = state.status === "queued";
  const title = isError ? "Plot request failed" : isQueued ? "Queued for rendering" : "Rendering plot";
  const message =
    state.message ??
    (isQueued
      ? "Waiting for the backend queue."
      : "Sending data to the analysis backend.");

  return (
    <div className={cn("plot-loading-panel", isError && "plot-loading-panel-error")}>
      <div className="plot-loading-symbol" aria-hidden="true">
        {isError ? <AlertTriangle className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
      </div>
      <div className="plot-loading-copy">
        <div className="plot-loading-title">{title}</div>
        <div className="plot-loading-meta">{label}</div>
        <div className="plot-loading-message">{message}</div>
      </div>
    </div>
  );
}
