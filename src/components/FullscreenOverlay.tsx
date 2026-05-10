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

export function FullscreenIconButton({ onClick, title = "Fullscreen", className }: FullscreenIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/70 ${className ?? ""}`}
    >
      <Maximize2 aria-hidden className="h-4 w-4" />
    </button>
  );
}
