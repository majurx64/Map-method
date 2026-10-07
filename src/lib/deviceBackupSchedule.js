export const BACKUP_INTERVALS = [1, 3, 7, 14, 30];

// Calendar days, rather than elapsed hours, also work across daylight-saving changes.
const dayNumber = (at) => {
  const date = new Date(at);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
};
export function backupIsDue(settings, at = Date.now()) {
  return Boolean(settings?.enabled && BACKUP_INTERVALS.includes(settings.intervalDays)
    && (!settings.lastAt || dayNumber(at) - dayNumber(settings.lastAt) >= settings.intervalDays));
}

export function portableBackup(snapshot, at = Date.now()) {
  if (!Array.isArray(snapshot?.maps) || snapshot.maps.length > 1000) throw new Error('export-too-large');
  for (const map of snapshot.maps) {
    if (!map || typeof map.name !== 'string' || !['free', 'image'].includes(map.mapType)
      || !Number.isInteger(Number(map.totalCells)) || Number(map.totalCells) < 1 || Number(map.totalCells) > 10000
      || ['completed', 'progressCompleted', 'colors'].some((key) => map[key] !== undefined && (!Array.isArray(map[key]) || map[key].length > 10000))) throw new Error('invalid-backup-map');
  }
  const text = JSON.stringify({ format: 'map-method-backup', version: 1, exportedAt: new Date(at).toISOString(),
    profile: { ...snapshot.profile, preferences: snapshot.preferences || {} }, maps: snapshot.maps }, null, 2);
  if (new TextEncoder().encode(text).length > 50 * 1024 * 1024) throw new Error('export-too-large');
  return text;
}
