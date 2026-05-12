import { safePlotFilename, type PlotExportFormat } from "@/shared/plot/plotlyConfig";

export function downloadSvgFromScope(scope: HTMLElement | null, filename: string, format: PlotExportFormat, scale = 4) {
  downloadSvgElement(scope?.querySelector("svg") ?? null, filename, format, scale);
}

export function downloadSvgElement(svg: SVGSVGElement | null, filename: string, format: PlotExportFormat, scale = 4) {
  if (!svg) return;

  const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const { width, height } = getSvgSize(clonedSvg, svg);
  clonedSvg.setAttribute("width", String(width));
  clonedSvg.setAttribute("height", String(height));

  const serialized = new XMLSerializer().serializeToString(clonedSvg);
  const safeName = safePlotFilename(filename);

  if (format === "svg") {
    downloadBlob(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }), `${safeName}.svg`);
    return;
  }

  const image = new Image();
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);

    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${safeName}.png`);
      URL.revokeObjectURL(svgUrl);
    }, "image/png");
  };

  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
  };
  image.src = svgUrl;
}

function getSvgSize(clonedSvg: SVGSVGElement, sourceSvg: SVGSVGElement) {
  const viewBox = clonedSvg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (viewBox && viewBox.length === 4 && Number.isFinite(viewBox[2]) && Number.isFinite(viewBox[3])) {
    return { width: viewBox[2], height: viewBox[3] };
  }

  const rect = sourceSvg.getBoundingClientRect();
  const width = Number(clonedSvg.getAttribute("width")) || rect.width || 1600;
  const height = Number(clonedSvg.getAttribute("height")) || rect.height || 1000;
  return { width, height };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
