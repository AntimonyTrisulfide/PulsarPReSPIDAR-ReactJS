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
type PlotConfigOptions = {
  interactive?: boolean;
};

export function safePlotFilename(filename: string) {
  return filename.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "polarimetry-plot";
}

async function downloadPlot(gd: HTMLElement, filename: string, format: PlotExportFormat) {
  const safeName = safePlotFilename(filename);
  const imageOptions = {
    format,
    width: 1600,
    height: 1000,
    scale: format === "png" ? 2 : 1,
  };

  try {
    const dataUrl = await Plotly.toImage(gd, imageOptions);
    downloadDataUrl(dataUrl, `${safeName}.${format}`);
  } catch (error) {
    console.error("Plot export failed:", error);
  }
}

export function downloadPlotlyFromContainer(container: HTMLElement | null, filename: string, format: PlotExportFormat) {
  const graphDiv = container?.querySelector<HTMLElement>(".js-plotly-plot, .plotly-graph-div");
  if (!graphDiv) return;
  void downloadPlot(graphDiv, filename, format);
}

export function paperPlotConfig(filename: string, options: PlotConfigOptions = {}): Partial<Config> {
  if (!options.interactive) {
    return {
      responsive: true,
      displayModeBar: false,
      displaylogo: false,
      scrollZoom: false,
      doubleClick: false,
    };
  }

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
        click: (gd: HTMLElement) => void downloadPlot(gd, outputName, "svg"),
      },
      {
        name: "Download PNG",
        title: "Download PNG",
        icon: pngIcon,
        click: (gd: HTMLElement) => void downloadPlot(gd, outputName, "png"),
      },
    ] as any,
    modeBarButtonsToRemove: ["lasso2d", "select2d", "toImage"],
  };
}

export function lockCartesianInteractions<T extends Record<string, any>>(layout: T): T {
  const lockedLayout: Record<string, any> = { ...layout };

  Object.entries(lockedLayout).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    if (key === "xaxis" || key === "yaxis" || /^xaxis\d+$/.test(key) || /^yaxis\d+$/.test(key)) {
      lockedLayout[key] = {
        ...value,
        fixedrange: true,
      };
    }
  });

  return lockedLayout as T;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
