// Server responses and save receipts can reorder their arrays. Equal display
// positions must always use immutable identity rather than response order.
export function nextMapOrder(maps, reserved = 0) {
  return Math.min(0, Number.isFinite(reserved) ? reserved : 0, ...maps.map((map) => Number.isFinite(map.order) ? map.order : 0)) - 1;
}

export function compareMapOrder(a, b) {
  const order = (Number.isFinite(a.order) ? a.order : 0) - (Number.isFinite(b.order) ? b.order : 0);
  if (order) return order;
  const created = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (created) return created;
  const first = String(a.id), second = String(b.id);
  return first < second ? -1 : first > second ? 1 : 0;
}

// Preserve unsaved work and pending deletions when another session updates the account.
export function mergeLiveMaps(remote, local, pending, dirtyIds, deletedIds) {
  const result = new Map(remote.map((map) => [map.id, map]));
  // Shared drawing updates do not own a participant's card position or preview.
  // Keep these local display preferences while accepting the new shared cells.
  for (const map of local) {
    const incoming = result.get(map.id);
    if (!incoming?.collaboration) continue;
    result.set(map.id, { ...incoming,
      ...(Number.isFinite(map.order) ? { order: map.order } : {}),
      ...(typeof map.showCardBackground === 'boolean' ? { showCardBackground: map.showCardBackground } : {}),
    });
  }
  for (const entry of pending) result.set(entry.map.id, entry.map);
  for (const map of local) if (dirtyIds.has(map.id)) result.set(map.id, map);
  for (const id of deletedIds) result.delete(id);
  return [...result.values()];
}

export function liveCellChanges(before, after, beforeColors = [], afterColors = []) {
  const previous = new Set(before);
  const next = new Set(after);
  return [...new Set([...previous, ...next])]
    .filter((index) => previous.has(index) !== next.has(index)
      || (next.has(index) && beforeColors[index] !== afterColors[index]))
    .map((index) => ({ index, mode: next.has(index) ? 'draw' : 'erase' }));
}
