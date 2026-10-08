import { equalJSON } from './syncWire.js';

const geometry = ['mapType', 'gridMode', 'totalCells', 'manualRows', 'manualCols', 'imageRatio', 'image', 'imageOffset'];
const drawing = ['completed', 'progressCompleted', 'colors'];
const special = new Set([...drawing, 'activityLog', 'versions', 'lastPaintedAt']);

function conflict() {
  return Object.assign(new Error('personal-map-conflict'), { code: 'MM_SYNC_CONFLICT' });
}

function mergeCells(before = [], local = [], remote = []) {
  const base = new Set(before), edited = new Set(local), result = new Set(remote);
  let added = 0, removed = 0;
  for (const index of base) if (!edited.has(index) && result.delete(index)) removed++;
  for (const index of edited) if (!base.has(index) && !result.has(index)) { result.add(index); added++; }
  return { cells: [...result], added, removed };
}

// Replay only what this device changed since its displayed baseline. A newer
// server snapshot is never replaced wholesale after a revision conflict.
export function rebasePersonalMap(base, local, remote, acknowledged = null) {
  if (equalJSON(local.data, remote.data) && local.name === remote.name) return remote;
  if (!base) {
    throw conflict();
  }
  let before = base.data, baseName = base.name;
  const next = local.data, latest = remote.data;
  // A rapid second resize can still carry the outbox's original baseline.
  // Advance it only to this tab's own exact, already accepted geometry. A
  // different remote edit still follows the ordinary conflict checks below.
  if (acknowledged && acknowledged.name === remote.name && equalJSON(acknowledged.data, latest)
    && geometry.some((key) => !equalJSON(before[key], acknowledged.data[key]))
    && geometry.some((key) => !equalJSON(before[key], next[key]))) {
    before = acknowledged.data; baseName = acknowledged.name;
  }
  const localGeometry = geometry.some((key) => !equalJSON(before[key], next[key]));
  const remoteGeometry = geometry.some((key) => !equalJSON(before[key], latest[key]));
  const localDrawing = drawing.some((key) => !equalJSON(before[key], next[key]));
  const remoteDrawing = drawing.some((key) => !equalJSON(before[key], latest[key]));
  if ((remoteGeometry && (localDrawing || localGeometry)) || (localGeometry && remoteDrawing)) throw conflict();

  const data = { ...latest };
  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (special.has(key) || equalJSON(before[key], next[key])) continue;
    if (Object.hasOwn(next, key)) data[key] = next[key];
    else delete data[key];
  }

  const completed = mergeCells(before.completed, next.completed, latest.completed);
  const progress = mergeCells(before.progressCompleted, next.progressCompleted, latest.progressCompleted);
  if (Object.hasOwn(next, 'completed')) data.completed = localGeometry ? next.completed : completed.cells;
  if (Object.hasOwn(next, 'progressCompleted')) data.progressCompleted = localGeometry ? next.progressCompleted : progress.cells;
  const colors = [...(latest.colors || [])];
  const oldColors = before.colors || [], newColors = next.colors || [];
  for (let index = 0; index < Math.max(oldColors.length, newColors.length); index++) {
    if (!equalJSON(oldColors[index] ?? null, newColors[index] ?? null)) colors[index] = newColors[index] ?? null;
  }
  if (Object.hasOwn(next, 'colors')) data.colors = localGeometry ? next.colors : colors;

  // Retries may include cells already accepted by an earlier save. Count only
  // the still-unapplied additions/removals, so daily totals are not duplicated.
  const applied = next.isGameMode ? progress : completed;
  let additions = applied.added, removals = applied.removed;
  const baseActivity = new Map((before.activityLog || []).map(({ date, cells }) => [date, cells]));
  const localActivity = new Map((next.activityLog || []).map(({ date, cells }) => [date, cells]));
  const activity = new Map((latest.activityLog || []).map(({ date, cells }) => [date, cells]));
  for (const date of new Set([...baseActivity.keys(), ...localActivity.keys()])) {
    const delta = (localActivity.get(date) || 0) - (baseActivity.get(date) || 0);
    const appliedDelta = localGeometry ? delta : delta > 0 ? Math.min(delta, additions) : -Math.min(-delta, removals);
    if (delta > 0) additions -= appliedDelta;
    else removals += appliedDelta;
    if (appliedDelta) activity.set(date, Math.max(0, (activity.get(date) || 0) + appliedDelta));
  }
  if (Object.hasOwn(next, 'activityLog')) data.activityLog = [...activity].filter(([, cells]) => cells > 0).sort(([a], [b]) => a.localeCompare(b)).map(([date, cells]) => ({ date, cells }));

  const baseVersions = new Map((before.versions || []).map((version) => [version.id, version]));
  const localVersions = new Map((next.versions || []).map((version) => [version.id, version]));
  const versions = new Map((latest.versions || []).map((version) => [version.id, version]));
  for (const id of baseVersions.keys()) if (!localVersions.has(id)) versions.delete(id);
  for (const [id, version] of localVersions) if (!equalJSON(baseVersions.get(id), version)) versions.set(id, version);
  if (Object.hasOwn(next, 'versions')) data.versions = [...versions.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (Object.hasOwn(next, 'lastPaintedAt')) data.lastPaintedAt = Date.parse(next.lastPaintedAt) > Date.parse(latest.lastPaintedAt || '1970-01-01') ? next.lastPaintedAt : latest.lastPaintedAt;
  return { ...remote, name: local.name !== baseName ? local.name : remote.name, data };
}
