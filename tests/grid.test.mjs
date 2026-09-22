import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CELLS, getGridDimensions, remapCells, remapColors, getMapStats, dailyTarget, imagePlacement, zoomScrollDelta } from '../src/lib/grid.js';

test('Auto grids contain exactly the requested number of playable cells up to the limit', () => {
  for (let total = 1; total <= MAX_CELLS; total++) {
    for (const ratio of [0.01, 0.5, 1, 2, 100]) {
      const grid = getGridDimensions(total, ratio);
      assert.equal(grid.actualTotal, total);
      assert.ok(grid.rows * grid.cols >= total);
      assert.ok(grid.rows * grid.cols <= MAX_CELLS);
      assert.ok(grid.cols >= 1 && grid.rows >= 1);
    }
  }
});

test('Corrupt or oversized stored grid sizes cannot allocate an unbounded grid', () => {
  for (const value of [1e100, Infinity, NaN, -10, 0, '10000000000']) {
    for (const mode of ['auto', 'manual']) {
      const grid = getGridDimensions(value, Infinity, mode, value, value);
      assert.ok(Number.isInteger(grid.actualTotal));
      assert.ok(grid.actualTotal >= 1 && grid.actualTotal <= MAX_CELLS);
      if (mode === 'manual') assert.ok(grid.rows * grid.cols <= MAX_CELLS);
    }
  }
});

test('Changing columns preserves the drawing coordinates and colors, including black', () => {
  const before = { rows: 10, cols: 10, actualTotal: 100 };
  const after = { rows: 10, cols: 12, actualTotal: 120 };
  const colors = [];
  colors[55] = '#111111'; colors[56] = '#ecb40d';
  assert.deepEqual(remapCells([55, 56, 65], before, after), [65, 66, 77]);
  const next = remapColors(colors, before, after);
  assert.equal(next[65], '#111111');
  assert.equal(next[66], '#ecb40d');
  assert.equal(next[55], undefined);
});

test('Cropping and moving never wrap pixels into a different row or partial tail', () => {
  const before = { rows: 2, cols: 4, actualTotal: 8 };
  const after = { rows: 2, cols: 3, actualTotal: 5 };
  assert.deepEqual(remapCells([0, 3, 4, 5, 6, 7], before, after), [0, 3, 4]);
  assert.deepEqual(remapCells([0, 1, 2, 3, 7], before, before, 1, 0), [1, 2, 3]);
});

test('A drawing with 500 cells in a 2040-cell field reports 6/500, not 6/2040', () => {
  const map = { mapType: 'free', totalCells: 2040, completed: Array.from({length: 500}, (_, i) => i), progressCompleted: [0, 1, 2, 3, 4, 5, 5, 1000] };
  assert.deepEqual(getMapStats(map), { total: 500, filled: 6, percent: 1.2 });
});

test('An image with 500 requested cells reports exactly 500, ignoring invalid progress', () => {
  assert.deepEqual(getMapStats({ mapType: 'image', totalCells: 500, progressCompleted: [0, 499, 500, -1, 499] }), { total: 500, filled: 2, percent: 0.4 });
});

test('Daily targets include today and the deadline, round up, and handle overdue/completed maps', () => {
  const today = new Date(2026, 8, 22, 23, 59);
  assert.equal(dailyTarget('2026-09-24', 500, 6, today), '165 клеток в день · осталось 3 дн.');
  assert.equal(dailyTarget('2026-09-22', 500, 6, today), '494 клетки в день · осталось 1 дн.');
  assert.equal(dailyTarget('2026-09-21', 500, 6, today), 'Срок прошёл · осталось 494 клетки');
  assert.equal(dailyTarget('2026-09-21', 500, 500, today), 'Карта заполнена');
  assert.equal(dailyTarget('', 500, 0, today), null);
  assert.equal(dailyTarget('2026-09-24', 0, 0, today), 'Добавьте рисунок для расчёта нормы');
});

test('Daily count crosses leap days without local clock or DST rounding errors', () => {
  assert.equal(dailyTarget('2028-03-01', 9, 0, new Date(2028, 1, 28)), '3 клетки в день · осталось 3 дн.');
});

test('Uploaded images retain their proportions and cannot be dragged outside complete rows', () => {
  for (const [width, height] of [[200, 100], [100, 200], [100, 100]]) {
    for (const [cols, rows, total] of [[14, 8, 100], [14, 14, 196], [20, 10, 200]]) {
      for (const offset of [{x: 0, y: 0}, {x: -10, y: 10}, {x: 10, y: -10}]) {
        const p = imagePlacement(width, height, cols, rows, total, offset);
        assert.ok(Math.abs(p.width / p.height - width / height) < 1e-10);
        assert.ok(p.left >= 0 && p.top >= 0);
        assert.ok(p.left + p.width <= cols);
        assert.ok(p.top + p.height <= Math.floor(total / cols));
      }
    }
  }
});

test('Zoom preserves the exact content point under the mouse, at the center and near edges', () => {
  for (const [x, y] of [[0, 0], [.1, .9], [.5, .5], [1, 1]]) {
    for (const zoom of [.5, 1.1, 2, 4]) {
      const anchor = { x, y, clientX: 100 + x * 300, clientY: 200 + y * 400 };
      const rect = { left: 75, top: 125, width: 300 * zoom, height: 400 * zoom };
      const delta = zoomScrollDelta(rect, anchor);
      assert.ok(Math.abs(rect.left - delta.x + x * rect.width - anchor.clientX) < 1e-10);
      assert.ok(Math.abs(rect.top - delta.y + y * rect.height - anchor.clientY) < 1e-10);
    }
  }
});
