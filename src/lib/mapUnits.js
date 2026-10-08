export function normalizeMeasurement(value) {
  // A quantity belongs in the numeric fields, never in the unit name.
  const unit = typeof value?.unit === 'string' ? value.unit.trim().replace(/^\d+(?:[.,]\d+)?\s+(?=\p{L})/u, '').slice(0, 32) : '';
  if (value?.steps !== undefined || value?.cells !== undefined) {
    const steps = Number(value.steps), cells = Number(value.cells);
    if (![steps, cells].every((number) => Number.isFinite(number) && number >= 0.001 && number <= 1000000)) return null;
    if (unit && !/\p{L}/u.test(unit)) return null;
    if (!unit && steps === 1 && cells === 1) return null;
    return { unit: unit || 'шагов', perCell: steps / cells, steps, cells };
  }
  const perCell = Number(value?.perCell);
  return unit && Number.isFinite(perCell) && perCell >= 0.001 && perCell <= 1000000 ? { unit, perCell } : null;
}

export function measurementRatio(value) {
  const measurement = normalizeMeasurement(value);
  if (!measurement) return { steps: 1, cells: 1 };
  if (measurement.steps !== undefined) return { steps: measurement.steps, cells: measurement.cells };
  // Opening a legacy map must preserve its existing conversion.
  return measurement.perCell >= 1 ? { steps: measurement.perCell, cells: 1 } : { steps: 1, cells: 1 / measurement.perCell };
}

export function measurementRatioError(unit, steps, cells) {
  if (unit.trim() && !/\p{L}/u.test(unit)) return 'Укажите только название, например «страниц». Количество задаётся в полях выше.';
  if (![steps, cells].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0.001 && Number(value) <= 1000000)) return 'В обоих полях укажите число от 0,001 до 1 000 000.';
  return '';
}

export function measurementQuantityStep(value) {
  const measurement = normalizeMeasurement(value);
  if (!measurement) return 1;
  if (!Number.isInteger(measurement.steps) || !Number.isInteger(measurement.cells)) return measurement.perCell;
  let a = measurement.steps, b = measurement.cells;
  while (b) [a, b] = [b, a % b];
  return measurement.steps / a;
}

export function quantityLabel(value, unit) {
  const forms = { шагов: ['шаг', 'шага', 'шагов'], страниц: ['страница', 'страницы', 'страниц'], клеток: ['клетка', 'клетки', 'клеток'] }[unit];
  const number = Math.abs(Number(value)), last = number % 10, lastTwo = number % 100;
  const name = forms ? forms[!Number.isInteger(number) ? 1 : lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2] : unit;
  return `${formatQuantity(Number(value))} ${name}`;
}

export function measurementDescription(value) {
  const measurement = normalizeMeasurement(value), ratio = measurementRatio(measurement);
  return `${quantityLabel(ratio.steps, measurement?.unit || 'шагов')} → ${quantityLabel(ratio.cells, 'клеток')}`;
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
  return { cells: Math.max(0, cells), valid: Number.isSafeInteger(cells) && cells > 0 && Math.abs(exact - cells) < 1e-7, perCell: size };
}

export function formatQuantity(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
