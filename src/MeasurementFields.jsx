import { normalizeMeasurement, measurementDescription, measurementRatioError } from './lib/mapUnits';

export default function MeasurementFields({ unit, steps = '1', cells = '1', onUnit, onSteps, onCells }) {
  const error = measurementRatioError(unit, steps, cells);
  const measurement = normalizeMeasurement({ unit, steps, cells });
  return <fieldset className="measurement-fields">
    <legend>Сколько клеток за шаг</legend>
    <p className="measurement-intro">Укажите, сколько клеток закрасить за выполненные шаги. Например: 1 шаг → 30 клеток.</p>
    <div className="modal-inline-fields"><div className="modal-field"><label>Выполнено шагов<input type="number" min="0.001" max="1000000" step="any" value={steps} onChange={(event) => onSteps(event.target.value)} aria-invalid={Boolean(error && (!Number(steps) || Number(steps) < 0.001 || Number(steps) > 1000000))} /></label></div><div className="modal-field"><label>Закрасить клеток<input type="number" min="0.001" max="1000000" step="any" value={cells} onChange={(event) => onCells(event.target.value)} aria-invalid={Boolean(error && (!Number(cells) || Number(cells) < 0.001 || Number(cells) > 1000000))} /></label></div></div>
    <div className="modal-field"><label>Название шага — необязательно<input type="text" maxLength="32" value={unit} onChange={(event) => onUnit(event.target.value)} placeholder="Например: страница или подтягивание" aria-invalid={Boolean(unit.trim() && !/\p{L}/u.test(unit))} /></label></div>
    {error ? <small className="measurement-error" role="alert">{error}</small> : measurement ? <div className="measurement-example"><strong>{measurementDescription(measurement)}</strong><small>В режиме «Игра» вводите выполненное количество шагов — клетки рассчитываются автоматически. Закрашиваются только целые клетки.</small></div> : <small>Сейчас 1 шаг = 1 клетка: в режиме «Игра» вводите число клеток. Чтобы один шаг закрашивал больше, увеличьте число справа.</small>}
    <small className="measurement-guide">Пример со страницами: слева 1, справа 5, название «страница» → за одну страницу закрасятся 5 клеток. Прочитали 30 страниц — введите 30, и закрасятся 150 клеток.</small>
  </fieldset>;
}
