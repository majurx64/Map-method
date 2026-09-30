// Preserve unsaved work and pending deletions when another session updates the account.
export function mergeLiveMaps(remote, local, pending, dirtyIds, deletedIds) {
  const result = new Map(remote.map((map) => [map.id, map]));
  for (const entry of pending) result.set(entry.map.id, entry.map);
  for (const map of local) if (dirtyIds.has(map.id)) result.set(map.id, map);
  for (const id of deletedIds) result.delete(id);
  return [...result.values()];
}
