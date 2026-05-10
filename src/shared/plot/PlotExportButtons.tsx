import type React from "react";
import { Download } from "lucide-react";
import { downloadPlotlyFromContainer, type PlotExportFormat } from "@/shared/plot/plotlyConfig";

type PlotExportButtonsProps = {
  filename: string;
  onExport?: (format: PlotExportFormat) => void;
};

export function PlotExportButtons({ filename, onExport }: PlotExportButtonsProps) {
  const handleExport = (format: PlotExportFormat) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onExport) {
      onExport(format);
      return;
    }

    const scope = event.currentTarget.closest<HTMLElement>(".plot-export-scope");
    downloadPlotlyFromContainer(scope, filename, format);
  };

  return (
    <>
      <button type="button" className="plot-export-button" onClick={handleExport("svg")} title="Download SVG">
        <Download className="h-3.5 w-3.5" aria-hidden />
        SVG
      </button>
      <button type="button" className="plot-export-button" onClick={handleExport("png")} title="Download PNG">
        <Download className="h-3.5 w-3.5" aria-hidden />
        PNG
      </button>
    </>
  );
}
