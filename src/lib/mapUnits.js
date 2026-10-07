export function normalizeMeasurement(value) {
  const unit = typeof value?.unit === 'string' ? value.unit.trim().slice(0, 32) : '';
  const perCell = Number(value?.perCell);
  return unit && Number.isFinite(perCell) && perCell >= 0.001 && perCell <= 1000000 ? { unit, perCell } : null;
}

export function measurementInputError(unit, perCell) {
  if (!unit.trim()) return '';
  if (!/\p{L}/u.test(unit)) return 'Укажите название, например «страниц» или «подтягиваний». Число задаётся справа.';
  if (!normalizeMeasurement({ unit, perCell })) return 'Количество в одной клетке должно быть от 0,001 до 1 000 000.';
  return '';
}

export function quantityInCells(amount, measurement) {
  const value = Number(amount);
  const size = normalizeMeasurement(measurement)?.perCell || 1;
  if (!Number.isFinite(value) || value <= 0 || value > 1000000000) return { cells: 0, valid: false };
  const exact = value / size;
  const cells = Math.round(exact);
  // Never silently round away real activity or fill an unfinished cell.
  return { cells: Math.max(0, cells), valid: cells > 0 && Math.abs(exact - cells) < 1e-7, perCell: size };
}

export function formatQuantity(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
