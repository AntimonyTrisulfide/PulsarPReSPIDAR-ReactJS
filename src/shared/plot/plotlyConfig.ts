import type { Config } from "plotly.js";
import Plotly from "plotly.js/dist/plotly";

const svgIcon = {
  width: 512,
  height: 512,
  path: "M96 32h224l96 96v352H96V32zm208 32v80h80L304 64zM160 224h192v32H160v-32zm0 72h192v32H160v-32zm0 72h128v32H160v-32z",
};

const pngIcon = {
  width: 512,
  height: 512,
  path: "M64 96a32 32 0 0 1 32-32h320a32 32 0 0 1 32 32v320a32 32 0 0 1-32 32H96a32 32 0 0 1-32-32V96zm64 256h256l-72-96-56 72-40-48-88 72zm72-128a40 40 0 1 0 0-80 40 40 0 0 0 0 80z",
};

export type PlotExportFormat = "png" | "svg";

export function safePlotFilename(filename: string) {
  return filename.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "polarimetry-plot";
}

function downloadPlot(gd: HTMLElement, filename: string, format: PlotExportFormat) {
  void Plotly.downloadImage(gd, {
    format,
    filename,
    width: 1600,
    height: 1000,
    scale: format === "png" ? 2 : 1,
  });
}

export function downloadPlotlyFromContainer(container: HTMLElement | null, filename: string, format: PlotExportFormat) {
  const graphDiv = container?.querySelector<HTMLElement>(".js-plotly-plot, .plotly-graph-div");
  if (!graphDiv) return;
  downloadPlot(graphDiv, safePlotFilename(filename), format);
}

export function paperPlotConfig(filename: string): Partial<Config> {
  const outputName = safePlotFilename(filename);

  return {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: "svg",
      filename: outputName,
      width: 1600,
      height: 1000,
      scale: 1,
    },
    modeBarButtonsToAdd: [
      {
        name: "Download SVG",
        title: "Download SVG",
        icon: svgIcon,
        click: (gd: HTMLElement) => downloadPlot(gd, outputName, "svg"),
      },
      {
        name: "Download PNG",
        title: "Download PNG",
        icon: pngIcon,
        click: (gd: HTMLElement) => downloadPlot(gd, outputName, "png"),
      },
    ] as any,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "toImage"],
  };
}
