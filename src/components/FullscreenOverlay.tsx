import React from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

interface FullscreenOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  contentClassName?: string;
  title?: string;
}

export function FullscreenOverlay({ children, onClose, contentClassName, title }: FullscreenOverlayProps) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/86 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Fullscreen plot"}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 h-full max-h-[95vh] w-full max-w-6xl rounded-md border border-white/15 bg-white shadow-2xl dark:bg-slate-950 ${contentClassName ?? ""}`}>
        <button
          type="button"
          aria-label="Close fullscreen"
          title="Close fullscreen"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-950/80 text-white shadow-sm hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-white"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type FullscreenIconButtonProps = {
  onClick: () => void;
  title?: string;
  className?: string;
};

export function FullscreenIconButton({ title = "Fullscreen", className }: FullscreenIconButtonProps) {
  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const opened = await openStaticPlotCopy(event.currentTarget);
    if (!opened) {
      console.warn("Could not find a plot next to this fullscreen button for static image export.");
    }
  };

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={handleClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/70 ${className ?? ""}`}
    >
      <Maximize2 aria-hidden className="h-4 w-4" />
    </button>
  );
}

async function openStaticPlotCopy(button: HTMLButtonElement) {
  if (typeof window === "undefined") return false;
  const targetNode = findAssociatedPlotNode(button);
  if (!targetNode) return false;

  const plotlyNode = targetNode.classList.contains("js-plotly-plot")
    ? targetNode as HTMLElement
    : targetNode.querySelector(".js-plotly-plot") as HTMLElement | null;
  if (plotlyNode) {
    try {
      const Plotly = await import("plotly.js-dist-min");
      const toImage = (Plotly as any).toImage ?? (Plotly as any).default?.toImage;
      if (typeof toImage === "function") {
        const dataUrl = await toImage(plotlyNode, {
          format: "png",
          width: Math.max(plotlyNode.clientWidth, 900),
          height: Math.max(plotlyNode.clientHeight, 620),
          scale: 2,
        });
        return openImageDocument(dataUrl, button.title || "Plot image");
      }
    } catch {
      // Fall through to SVG or original fullscreen behavior.
    }
  }

  const svgNode = targetNode instanceof SVGSVGElement
    ? targetNode
    : targetNode.querySelector("svg:not(.lucide)") as SVGSVGElement | null;
  if (svgNode) {
    try {
      const clone = svgNode.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const xml = new XMLSerializer().serializeToString(clone);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      return openImageDocument(dataUrl, button.title || "Plot image");
    } catch {
      return false;
    }
  }

  return false;
}

function findAssociatedPlotNode(button: HTMLButtonElement) {
  const toolbar = button.closest(".plot-toolbar") as HTMLElement | null;
  const scope = button.closest(".plot-export-scope") as HTMLElement | null;
  const start = toolbar ?? button;
  let cursor: Element | null = start;

  for (let depth = 0; cursor && depth < 5; depth += 1) {
    const found = findPlotInFollowingSiblings(cursor);
    if (found) return found;
    if (scope && cursor.parentElement === scope.parentElement) break;
    if (cursor === scope) break;
    cursor = cursor.parentElement;
  }

  return scope ? findFirstDirectPlot(scope) : null;
}

function findPlotInFollowingSiblings(element: Element) {
  let sibling = element.nextElementSibling;
  while (sibling) {
    if (sibling.classList.contains("plot-toolbar")) return null;
    const found = findFirstPlotInside(sibling);
    if (found) return found;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function findFirstDirectPlot(scope: Element) {
  for (const child of Array.from(scope.children)) {
    if (child.classList.contains("plot-toolbar")) continue;
    const found = findFirstPlotInside(child);
    if (found) return found;
  }
  return null;
}

function findFirstPlotInside(element: Element): Element | null {
  if (element.classList.contains("js-plotly-plot")) return element;
  if (element instanceof SVGSVGElement && !element.classList.contains("lucide")) return element;
  return element.querySelector(".js-plotly-plot, svg:not(.lucide)");
}

function openImageDocument(dataUrl: string, title: string) {
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>html,body{margin:0;min-height:100%;background:#0b0b0b;display:grid;place-items:center;}img{max-width:100vw;max-height:100vh;object-fit:contain;}</style></head><body><img alt="${escapeHtml(title)}" src="${dataUrl}"></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const objectUrl = URL.createObjectURL(blob);
    const tab = window.open(objectUrl, "_blank");
    if (!tab) {
      URL.revokeObjectURL(objectUrl);
      return false;
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
