import { PERCEPTUAL_RAINBOW_COLOR_SCALE } from "./colorScales";

export const RED_TO_RED_COLOR_SCALE = PERCEPTUAL_RAINBOW_COLOR_SCALE;

export function redToRedPhaseColor(value: number) {
  const phase = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const segmentCount = RED_TO_RED_COLOR_SCALE.length - 1;
  const segment = Math.min(segmentCount - 1, Math.floor(phase * segmentCount));
  const [startPosition, startColor] = RED_TO_RED_COLOR_SCALE[segment];
  const [endPosition, endColor] = RED_TO_RED_COLOR_SCALE[segment + 1];
  const localT = endPosition === startPosition ? 0 : (phase - startPosition) / (endPosition - startPosition);
  return interpolateHexColor(startColor, endColor, localT);
}

export const perceptualRainbowPhaseColor = redToRedPhaseColor;

function interpolateHexColor(start: string, end: string, t: number) {
  const startRgb = hexToRgb(start);
  const endRgb = hexToRgb(end);
  const amount = Math.max(0, Math.min(1, t));
  const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * amount);
  const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * amount);
  const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}
