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

// Common units also accept old plural names. Productive noun endings cover
// custom singular names without loading a full morphological dictionary.
const unitNames = [
  ['шаг', 'шага', 'шагов', 'шаги'], ['клетка', 'клетки', 'клеток'],
  ['страница', 'страницы', 'страниц'], ['минута', 'минуты', 'минут'],
  ['секунда', 'секунды', 'секунд'], ['час', 'часа', 'часов', 'часы'],
  ['день', 'дня', 'дней', 'дни'], ['неделя', 'недели', 'недель'],
  ['месяц', 'месяца', 'месяцев', 'месяцы'], ['год', 'года', 'лет', 'годы'],
  ['раз', 'раза', 'раз', 'разы'], ['задача', 'задачи', 'задач'],
  ['книга', 'книги', 'книг'], ['тренировка', 'тренировки', 'тренировок'],
  ['попытка', 'попытки', 'попыток'], ['проверка', 'проверки', 'проверок'],
  ['поездка', 'поездки', 'поездок'], ['покупка', 'покупки', 'покупок'],
  ['статья', 'статьи', 'статей'], ['серия', 'серии', 'серий'],
  ['цель', 'цели', 'целей'], ['запись', 'записи', 'записей'],
  ['встреча', 'встречи', 'встреч'], ['песня', 'песни', 'песен'],
  ['слово', 'слова', 'слов'], ['письмо', 'письма', 'писем'], ['дело', 'дела', 'дел'],
  ['очко', 'очка', 'очков', 'очки'], ['балл', 'балла', 'баллов', 'баллы'],
  ['урок', 'урока', 'уроков', 'уроки'], ['пункт', 'пункта', 'пунктов', 'пункты'],
  ['метр', 'метра', 'метров', 'метры'], ['километр', 'километра', 'километров', 'километры'],
  ['грамм', 'грамма', 'граммов', 'граммы'], ['килограмм', 'килограмма', 'килограммов', 'килограммы'],
  ['литр', 'литра', 'литров', 'литры'], ['рубль', 'рубля', 'рублей', 'рубли'],
  ['человек', 'человека', 'человек', 'люди', 'людей'],
];
const knownUnitForms = new Map(unitNames.flatMap((forms) => forms.map((name) => [name, forms.slice(0, 3)])));

function unitForms(unit) {
  const word = unit.trim().toLocaleLowerCase('ru-RU');
  const display = /[а-яё]/u.test(word) ? word : unit.trim();
  if (knownUnitForms.has(word)) return knownUnitForms.get(word);
  // Keep abbreviations and unfamiliar phrases intact rather than invent forms.
  if (!/^[а-яё]{3,}$/u.test(word)) return [display, display, display];
  const action = word.match(/^(.*[нт])и[еяй]$/u);
  if (action) return [`${action[1]}ие`, `${action[1]}ия`, `${action[1]}ий`];
  const tion = word.match(/^(.*)ци[яий]$/u);
  if (tion) return [`${tion[1]}ция`, `${tion[1]}ции`, `${tion[1]}ций`];
  const stem = word.slice(0, -1);
  if (word.endsWith('а')) {
    const plural = stem.replace(/([бвгджзклмнпрстфхцчшщ])к$/u, (_, consonant) => `${consonant}${/[жчшщ]$/u.test(consonant) ? 'е' : 'о'}к`);
    return [word, `${stem}${/[гкхжчшщц]$/u.test(stem) ? 'и' : 'ы'}`, plural];
  }
  if (word.endsWith('я')) return [word, `${stem}и`, `${stem}${/[аеёиоуыэюя]$/u.test(stem) ? 'й' : 'ь'}`];
  if (word.endsWith('о')) return [word, `${stem}а`, stem];
  if (word.endsWith('й')) return [word, `${stem}я`, `${stem}ев`];
  if (/[бвгджзклмнпрстфхцчшщ]$/u.test(word)) return [word, `${word}а`, `${word}${/[жчшщ]$/u.test(word) ? 'ей' : /ц$/u.test(word) ? 'ев' : 'ов'}`];
  return [display, display, display];
}

export function quantityLabel(value, unit) {
  const forms = unitForms(unit);
  const number = Math.abs(Number(value)), last = number % 10, lastTwo = number % 100;
  const name = forms[!Number.isInteger(number) ? 1 : lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
  return `${formatQuantity(Number(value))} ${name}`;
}

export function measurementUnitLabel(value) {
  return unitForms(normalizeMeasurement(value)?.unit || 'шагов')[2];
}

export function measurementProgressLabel(completed, total, value) {
  const measurement = normalizeMeasurement(value) || { unit: 'клеток', perCell: 1 };
  return `${formatQuantity(completed * measurement.perCell)} / ${quantityLabel(total * measurement.perCell, measurement.unit)}`;
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
