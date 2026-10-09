// Only canonical server data belongs here; unsaved edits stay in the existing outbox.
export function knownVersions(rows, shared = false) {
  return Object.fromEntries(rows.map((row) => [row.id, {
    revision: shared ? row.revision : row.sync_revision,
    fields: row.fields || {},
    ...(shared ? { memberRevision: row.member_revision } : {}),
    ...(shared && Array.isArray(row.events) ? { historyRevision: row.revision } : {}),
  }]));
}

export function applySyncDelta(previous, delta, shared = false) {
  if (!delta || !Array.isArray(delta.ids) || !Array.isArray(delta.changes)) throw new Error('invalid-sync-response');
  const rows = new Map(previous.map((row) => [row.id, row]));
  for (const change of delta.changes) {
    const old = rows.get(change.id);
    const key = shared ? 'map_data' : 'data';
    const { patch, ...metadata } = change;
    if (!patch || !patch.fields || !patch.data) throw new Error('invalid-sync-patch');
    const combined = { ...old?.[key], ...patch.data };
    const data = Object.fromEntries(Object.keys(patch.fields).map((field) => {
      if (Array.isArray(patch.fields[field])) {
        const previousHashes = Array.isArray(old?.fields?.[field]) ? old.fields[field] : [];
        const previousItems = new Map(previousHashes.map((hash, index) => [hash, old?.[key]?.[field]?.[index]]));
        return [field, patch.fields[field].map((hash) => {
          const value = Object.hasOwn(patch.data[field] || {}, hash) ? patch.data[field][hash] : previousItems.get(hash);
          if (value === undefined) throw new Error('incomplete-sync-array');
          return value;
        })];
      }
      if (!(field in combined)) throw new Error('incomplete-sync-patch');
      return [field, combined[field]];
    }));
    rows.set(change.id, { ...metadata, fields: patch.fields, [key]: data });
  }
  return delta.ids.map((id) => {
    if (!rows.has(id)) throw new Error('missing-sync-row');
    return rows.get(id);
  });
}
