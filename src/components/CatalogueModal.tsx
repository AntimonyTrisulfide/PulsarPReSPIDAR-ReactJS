import React from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATALOGUE_URL = "https://psrweb.jb.man.ac.uk/meertime/singlepulse/";
const EXAMPLE_NPZ_URL =
  "https://psrweb.jb.man.ac.uk/meertime/singlepulse/J0835-4510/2020-12-26-21:39:16/1284/plots/2020-12-26-21:39:16.npz";

type CatalogueModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUrlSelected?: (url: string) => void;
};

export function CatalogueModal({ isOpen, onClose, onUrlSelected }: CatalogueModalProps) {
  const [candidateUrl, setCandidateUrl] = React.useState("");
  const trimmedUrl = candidateUrl.trim();
  const urlError = getNpzUrlError(trimmedUrl);
  const canUseUrl = trimmedUrl.length > 0 && !urlError;

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    setCandidateUrl("");
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectUrl = () => {
    if (!canUseUrl) return;
    onUrlSelected?.(trimmedUrl);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalogue-modal-title"
      aria-describedby="catalogue-modal-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <button
          type="button"
          aria-label="Close catalogue selector"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-10">
          <h2 id="catalogue-modal-title" className="text-lg font-semibold tracking-normal">
            MeerTime catalogue
          </h2>
          <p id="catalogue-modal-description" className="mt-1 text-sm text-muted-foreground">
            Open the catalogue, choose an observation, then paste the direct .npz plot URL.
          </p>
        </div>

        <div className="mt-5 grid gap-4">
          <a
            href={CATALOGUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-4 w-4" />
            Open catalogue
          </a>

          <div>
            <Label htmlFor="catalogue-url" className="text-muted-foreground">
              .npz plot URL
            </Label>
            <Input
              id="catalogue-url"
              type="url"
              autoFocus
              value={candidateUrl}
              placeholder={EXAMPLE_NPZ_URL}
              onChange={event => setCandidateUrl(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") selectUrl();
              }}
              aria-invalid={candidateUrl.length > 0 && !!urlError}
              className="mt-1 font-mono text-xs"
            />
            {candidateUrl.length > 0 && urlError && (
              <div className="mt-2 text-sm text-destructive">{urlError}</div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={selectUrl} disabled={!canUseUrl}>
            Use URL
          </Button>
        </div>
      </div>
    </div>
  );
}

function getNpzUrlError(value: string) {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Enter a complete URL starting with http:// or https://.";
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return "Use an http:// or https:// URL.";
  }

  if (!parsed.pathname.toLowerCase().endsWith(".npz")) {
    return "The catalogue selection should be a direct .npz file URL.";
  }

  if (!parsed.pathname.includes("/plots/")) {
    return "Use the .npz file inside the observation plots folder.";
  }

  return null;
}
