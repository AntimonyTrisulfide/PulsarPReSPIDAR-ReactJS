import React from "react";
import { createPortal } from "react-dom";

interface FullscreenOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  contentClassName?: string;
}

export function FullscreenOverlay({ children, onClose, contentClassName }: FullscreenOverlayProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 w-full max-w-6xl h-full max-h-[95vh] bg-black/20 rounded-lg shadow-2xl ${contentClassName ?? ""}`}>
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

// Minimal icon-only button to trigger fullscreen without drawing attention away from the plot.
export function FullscreenIconButton({ onClick, title = "Fullscreen", className }: FullscreenIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md bg-black/60 text-white shadow-sm hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-black/40 transition h-8 w-8 ${className ?? ""}`}
    >
        <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3H5a2 2 0 0 0-2 2v4" />
          <path d="M3 9l6-6" />
          <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
          <path d="M21 15l-6 6" />
          <path d="M3 15v4a2 2 0 0 0 2 2h4" />
          <path d="M9 21l-6-6" />
          <path d="M15 3h4a2 2 0 0 1 2 2v4" />
          <path d="M21 9l-6-6" />
        </svg>
    </button>
  );
}
