// Uploaded images use rgb(...); the drawing palette uses six-digit HEX.
export function previewRgb(color, opacity = 1) {
  const hex = typeof color === 'string' && color.match(/^#([0-9a-f]{6})$/i);
  const rgb = typeof color === 'string' && color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  const channels = hex ? [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16))
    : rgb ? rgb.slice(1).map(Number) : [238, 238, 234];
  const alpha = Math.max(0, Math.min(1, opacity));
  return channels.map((value, index) => Math.max(0, Math.min(255, value)) * alpha + [238, 238, 234][index] * (1 - alpha));
}
