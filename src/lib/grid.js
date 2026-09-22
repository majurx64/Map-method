export const MAX_CELLS = 10_000;

const integer = (value, fallback = 1) => Math.min(MAX_CELLS, Math.max(1, Math.floor(Number(value) || fallback)));

export function getGridDimensions(total, ratio = 1, gridMode = "auto", manualRows = 20, manualCols = 25) {
  total = integer(total);
  if (gridMode === "manual") {
    const cols = integer(manualCols);
    const rows = Math.min(integer(manualRows), Math.max(1, Math.floor(MAX_CELLS / cols)));
    return { rows, cols, actualTotal: Math.min(total, rows * cols) };
  }
  const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 1;
  let cols = Math.min(total, Math.max(1, Math.round(Math.sqrt(total * safeRatio))));
  while (Math.ceil(total / cols) * cols > MAX_CELLS) cols--;
  return { cols, rows: Math.ceil(total / cols), actualTotal: total };
}

export function remapCells(indices, before, after, dx = 0, dy = 0) {
  return [...new Set(indices)].flatMap((index) => {
    const x = index % before.cols + dx;
    const y = Math.floor(index / before.cols) + dy;
    const next = y * after.cols + x;
    return x >= 0 && x < after.cols && y >= 0 && y < after.rows && next < after.actualTotal ? [next] : [];
  });
}

export function gridResizeShift(before, after, rowSide = "bottom", colSide = "right") {
  return { dx: colSide === "left" ? after.cols - before.cols : 0, dy: rowSide === "top" ? after.rows - before.rows : 0 };
}

export function normalizeImageOffset(value) {
  const offset = { x: Number.isFinite(Number(value?.x)) ? Number(value.x) : 0, y: Number.isFinite(Number(value?.y)) ? Number(value.y) : 0 };
  const frame = value?.frame;
  if (frame && [frame.left, frame.top, frame.width, frame.height].every(Number.isFinite) && frame.width > 0 && frame.height > 0) {
    offset.frame = { left: frame.left, top: frame.top, width: frame.width, height: frame.height };
  }
  return offset;
}

export function resizeImageOffset(width, height, before, offset, dx, dy) {
  const placement = imagePlacement(width, height, before.cols, before.rows, before.actualTotal, offset);
  return { x: 0, y: 0, frame: { left: placement.left + dx, top: placement.top + dy, width: placement.width, height: placement.height } };
}

export function remapColors(colors, before, after, dx = 0, dy = 0) {
  const next = [];
  colors.slice(0, before.actualTotal).forEach((color, index) => {
    if (!color) return;
    const [target] = remapCells([index], before, after, dx, dy);
    if (target !== undefined) next[target] = color;
  });
  return next;
}

export function imagePlacement(width, height, cols, rows, total, offset = { x: 0, y: 0 }) {
  if (normalizeImageOffset(offset).frame) {
    return { ...offset.frame, offset: normalizeImageOffset(offset) };
  }
  const fullRows = Math.max(1, Math.floor(total / cols));
  const scale = Math.min(cols / width, fullRows / height);
  const drawWidth = Math.min(cols, width * scale), drawHeight = Math.min(fullRows, height * scale);
  const marginX = (cols - drawWidth) / 2, marginY = (fullRows - drawHeight) / 2;
  const x = Math.max(-marginX, Math.min(marginX, offset.x * cols));
  const y = Math.max(-marginY, Math.min(marginY, offset.y * rows));
  return { width: drawWidth, height: drawHeight, left: marginX + x, top: marginY + y, offset: { x: x / cols, y: y / rows }, marginX, marginY };
}

export function zoomScrollDelta(rect, anchor) {
  return { x: rect.left + anchor.x * rect.width - anchor.clientX, y: rect.top + anchor.y * rect.height - anchor.clientY };
}

const cellsText = (count) => `${count} ${count % 100 >= 11 && count % 100 <= 14 ? "клеток" : count % 10 === 1 ? "клетка" : count % 10 >= 2 && count % 10 <= 4 ? "клетки" : "клеток"}`;

export function getMapStats(map) {
  const dimensions = getGridDimensions(map.totalCells, map.imageRatio, map.gridMode, map.manualRows, map.manualCols);
  const drawing = new Set((map.completed || []).filter((i) => i >= 0 && i < dimensions.actualTotal));
  const total = map.mapType === "image" ? dimensions.actualTotal : drawing.size;
  const filled = new Set((map.progressCompleted || []).filter((i) => i >= 0 && i < dimensions.actualTotal && (map.mapType === "image" || drawing.has(i)))).size;
  return { total, filled, percent: total ? Math.round(filled / total * 1000) / 10 : 0 };
}

export function dailyTarget(deadline, total, filled, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline || "")) return null;
  const [year, month, day] = deadline.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((end - start) / 86400000) + 1;
  const remaining = Math.max(0, total - filled);
  if (!total) return "Добавьте рисунок для расчёта нормы";
  if (!remaining) return "Карта заполнена";
  if (days <= 0) return `Срок прошёл · осталось ${cellsText(remaining)}`;
  return `${cellsText(Math.ceil(remaining / days))} в день · осталось ${days} дн.`;
}
