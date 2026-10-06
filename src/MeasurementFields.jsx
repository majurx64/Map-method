export default function MeasurementFields({ unit, perCell, onUnit, onPerCell }) {
  return <fieldset className="measurement-fields">
    <legend>Что означает одна клетка</legend>
    <div className="modal-inline-fields"><div className="modal-field"><label>Единица измерения<input maxLength="32" value={unit} onChange={(event) => onUnit(event.target.value)} placeholder="страниц, минут, подтягиваний…" /></label></div><div className="modal-field"><label>Количество в одной клетке<input type="number" min="0.001" max="1000000" step="any" value={perCell} onChange={(event) => onPerCell(event.target.value)} /></label></div></div>
    <small>{unit.trim() ? `Одна клетка = ${perCell || '…'} ${unit.trim()}. В игре вводите выполненное количество в этих единицах.` : 'Оставьте название пустым, чтобы считать клетками.'}</small>
  </fieldset>;
}
