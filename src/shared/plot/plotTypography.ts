export const PLOT_FONT_FAMILY = "\"Segoe UI\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
export const PLOT_FONT_SIZE = 13;
export const PLOT_TICK_FONT_SIZE = 12;
export const PLOT_AXIS_TITLE_SIZE = 15;
export const PLOT_PANEL_TITLE_SIZE = 15;
export const PLOT_META_SIZE = 12;

export function plotFont(axisColor: string) {
  return { color: axisColor, family: PLOT_FONT_FAMILY, size: PLOT_FONT_SIZE };
}

export function plotAxisText(axisColor: string) {
  return {
    tickfont: { color: axisColor, size: PLOT_TICK_FONT_SIZE },
    titlefont: { color: axisColor, size: PLOT_AXIS_TITLE_SIZE },
  };
}
