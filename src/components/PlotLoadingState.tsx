import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Gauge } from "lucide-react";
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
  deferUntilVisible?: boolean;
  hasData: boolean;
  label: string;
  placeholderMinHeight?: number | string;
  state: PlotRequestViewState;
};

export function PlotStatusBadge({ state }: PlotStatusBadgeProps) {
  if (state.status === "idle") return null;

  const isBusy = state.status === "queued" || state.status === "running";
  const label = state.status === "queued" ? "Queued" : state.status === "error" ? "Failed" : "Rendering";

  return (
    <div className={cn("plot-status-badge", isBusy && "plot-status-badge-busy", state.status === "error" && "plot-status-badge-error")}>
      {state.status === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <MiniPulsar className="plot-mini-pulsar" />}
      <span>{label}</span>
    </div>
  );
}

export function QueueStatusSummary({ concurrency, queuedCount, runningCount }: QueueStatusSummaryProps) {
  const isBusy = queuedCount > 0 || runningCount > 0;
  if (!isBusy) return null;
  const label = isBusy
    ? `${runningCount} running, ${queuedCount} queued`
    : concurrency === 1
      ? "Queue idle"
      : `${concurrency} backend workers idle`;

  return (
    <div className={cn("plot-queue-summary", isBusy && "plot-queue-summary-busy")}>
      {isBusy ? <MiniPulsar className="plot-mini-pulsar" /> : <Gauge className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </div>
  );
}

export function PlotResultSlot({ children, className, deferUntilVisible = false, hasData, label, placeholderMinHeight = "24rem", state }: PlotResultSlotProps) {
  const isBusy = state.status === "queued" || state.status === "running";
  const shouldDefer = deferUntilVisible && hasData;
  const { ref, shouldRender } = useVisibilityGate(shouldDefer);

  if (!hasData && state.status === "idle") return null;

  return (
    <div ref={ref} className={cn("plot-result-slot", className)}>
      {hasData
        ? shouldRender
          ? children
          : <PlotDeferredPanel label={label} minHeight={placeholderMinHeight} />
        : <PlotLoadingPanel label={label} state={state} />}
      {hasData && isBusy && <div className="plot-refresh-progress" aria-hidden="true" />}
    </div>
  );
}

function useVisibilityGate(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setShouldRender(true);
      return;
    }

    setShouldRender(false);
    const node = ref.current;
    if (!node || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "640px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, shouldRender };
}

function PlotDeferredPanel({ label, minHeight }: { label: string; minHeight: number | string }) {
  const style: CSSProperties = {
    minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight,
  };

  return (
    <div className="plot-deferred-panel" style={style}>
      <MiniPulsar className="plot-mini-pulsar" />
      <div>
        <div className="plot-loading-title">Plot ready</div>
        <div className="plot-loading-message">{label} will render when this section enters view.</div>
      </div>
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
        {isError ? <AlertTriangle className="h-7 w-7" /> : <MiniPulsar className="plot-loading-pulsar" />}
      </div>
      <div className="plot-loading-copy">
        <div className="plot-loading-title">{title}</div>
        <div className="plot-loading-meta">{label}</div>
        <div className="plot-loading-message">{message}</div>
      </div>
    </div>
  );
}

function MiniPulsar({ className }: { className?: string }) {
  return (
    <span className={cn("mini-pulsar", className)} aria-hidden="true">
      <span className="mini-pulsar-beam" />
      <span className="mini-pulsar-star" />
    </span>
  );
}
