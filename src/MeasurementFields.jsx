import { formatQuantity, measurementInputError } from './lib/mapUnits';

export default function MeasurementFields({ unit, perCell, onUnit, onPerCell }) {
  const error = measurementInputError(unit, perCell);
  const name = unit.trim();
  return <fieldset className="measurement-fields">
    <legend>Как считать прогресс</legend>
    <p className="measurement-intro">Можно отмечать клетки или перевести их в страницы, минуты, повторения — то, что вы считаете.</p>
    <div className="modal-inline-fields"><div className="modal-field"><label>Что считаем? Название<input maxLength="32" value={unit} onChange={(event) => onUnit(event.target.value)} placeholder="Например: страниц" aria-invalid={Boolean(error && !/\p{L}/u.test(unit))} /></label></div><div className="modal-field"><label>Сколько в одной клетке?<input type="number" min="0.001" max="1000000" step="any" value={perCell} onChange={(event) => onPerCell(event.target.value)} aria-invalid={Boolean(error && /\p{L}/u.test(unit))} /></label></div></div>
    {error ? <small className="measurement-error" role="alert">{error}</small> : name ? <div className="measurement-example"><strong>1 клетка = {formatQuantity(Number(perCell))} {name}</strong><small>В режиме «Игра» введите выполненное количество: {formatQuantity(Number(perCell) * 3)} {name} → 3 клетки. Дробную клетку не закрашиваем: число должно делиться на {formatQuantity(Number(perCell))}.</small></div> : <small>Пример: «страниц» и «5» → одна клетка равна 5 страницам. Прочитали 30 страниц — введите 30, и закрасятся 6 клеток. Оставьте название пустым, если хотите вводить число клеток.</small>}
  </fieldset>;
}
