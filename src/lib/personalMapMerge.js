import { equalJSON } from './syncWire.js';
import { getGridDimensions, remapCells, remapColors } from './grid.js';

const geometry = ['mapType', 'gridMode', 'totalCells', 'manualRows', 'manualCols', 'imageRatio', 'image', 'imageOffset'];
const drawing = ['completed', 'progressCompleted', 'colors'];
const special = new Set([...drawing, 'activityLog', 'versions', 'lastPaintedAt']);

function dimensions(data) {
  const total = data.totalCells ?? Math.max(1, data.colors?.length || 0,
    ...[...(data.completed || []), ...(data.progressCompleted || [])].map((index) => index + 1));
  return getGridDimensions(total, data.imageRatio, data.gridMode, data.manualRows, data.manualCols);
}

function projectDrawing(source, target) {
  const before = dimensions(source), after = dimensions(target);
  const dx = (target.imageOffset?.gridOrigin?.x || 0) - (source.imageOffset?.gridOrigin?.x || 0);
  const dy = (target.imageOffset?.gridOrigin?.y || 0) - (source.imageOffset?.gridOrigin?.y || 0);
  if (equalJSON(before, after) && !dx && !dy) return source;
  return { ...source, completed: remapCells(source.completed || [], before, after, dx, dy),
    progressCompleted: remapCells(source.progressCompleted || [], before, after, dx, dy),
    colors: remapColors(source.colors || [], before, after, dx, dy) };
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
  const next = local.data, latest = remote.data;
  const progressWasReset = Boolean(latest.statisticsReset?.at && next.statisticsReset?.at !== latest.statisticsReset.at);
  // Older offline entries can lack a baseline. Preserve the server layout and
  // add their drawing/progress without treating missing cells as deletions.
  let before = base?.data || { ...next, completed: [], progressCompleted: [], colors: [], activityLog: [], versions: [] };
  let baseName = base?.name || local.name;
  // A rapid second resize can still carry the outbox's original baseline.
  // Advance it only to this tab's own exact, already accepted geometry. A
  // different remote edit still follows the ordinary conflict checks below.
  if (acknowledged && acknowledged.name === remote.name && equalJSON(acknowledged.data, latest)
    && geometry.some((key) => !equalJSON(before[key], acknowledged.data[key]))
    && geometry.some((key) => !equalJSON(before[key], next[key]))) {
    before = acknowledged.data; baseName = acknowledged.name;
  }
  if (latest.statisticsReset?.at && next.statisticsReset?.at === latest.statisticsReset.at
    && before.statisticsReset?.at !== latest.statisticsReset.at) {
    before = { ...before, progressCompleted: [], activityLog: [], statisticsReset: latest.statisticsReset };
  }
  const localGeometry = geometry.some((key) => !equalJSON(before[key], next[key]));
  const layout = localGeometry ? next : latest;
  const originalDrawing = projectDrawing(before, layout);
  const localDrawing = projectDrawing(next, layout);
  const remoteDrawing = projectDrawing(latest, layout);

  const data = { ...latest };
  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (special.has(key) || geometry.includes(key) || equalJSON(before[key], next[key])) continue;
    if (Object.hasOwn(next, key)) data[key] = next[key];
    else delete data[key];
  }
  // A layout is one unit: the last explicitly submitted resize wins, while
  // strokes from every device are translated into that same grid below.
  if (localGeometry) for (const key of geometry) {
    if (Object.hasOwn(next, key)) data[key] = next[key];
    else delete data[key];
  }

  const completed = mergeCells(originalDrawing.completed, localDrawing.completed, remoteDrawing.completed);
  const progress = mergeCells(originalDrawing.progressCompleted, localDrawing.progressCompleted, remoteDrawing.progressCompleted);
  if (Object.hasOwn(next, 'completed')) data.completed = completed.cells;
  if (Object.hasOwn(next, 'progressCompleted')) data.progressCompleted = progress.cells;
  const colors = [...(remoteDrawing.colors || [])];
  const oldColors = originalDrawing.colors || [], newColors = localDrawing.colors || [];
  for (let index = 0; index < Math.max(oldColors.length, newColors.length); index++) {
    if (!equalJSON(oldColors[index] ?? null, newColors[index] ?? null)) colors[index] = newColors[index] ?? null;
  }
  if (Object.hasOwn(next, 'colors')) data.colors = colors;
  // An untouched image is sampled anew after resizing; its pixels are a guide,
  // not competing brush strokes. Progress still merges independently.
  if (localGeometry && next.mapType === 'image' && !next.imageOffset?.cellsEdited) {
    data.colors = [...(next.colors || [])];
    data.completed = next.completed;
    if (latest.imageOffset?.cellsEdited && next.image === latest.image) {
      data.completed = mergeCells(originalDrawing.completed, remoteDrawing.completed, next.completed).cells;
      for (let index = 0; index < (remoteDrawing.colors || []).length; index++) {
        if (!equalJSON(oldColors[index] ?? null, remoteDrawing.colors[index] ?? null)) data.colors[index] = remoteDrawing.colors[index] ?? null;
      }
      data.imageOffset = { ...data.imageOffset, cellsEdited: true };
    }
  }

  // Retries may include cells already accepted by an earlier save. Count only
  // the still-unapplied additions/removals, so daily totals are not duplicated.
  const applied = next.isGameMode ? progress : completed;
  let additions = applied.added, removals = applied.removed;
  const baseActivity = new Map((before.activityLog || []).map(({ date, cells }) => [date, cells]));
  const localActivity = new Map((next.activityLog || []).map(({ date, cells }) => [date, cells]));
  const activity = new Map((latest.activityLog || []).map(({ date, cells }) => [date, cells]));
  for (const date of new Set([...baseActivity.keys(), ...localActivity.keys()])) {
    const delta = (localActivity.get(date) || 0) - (baseActivity.get(date) || 0);
    const appliedDelta = delta > 0 ? Math.min(delta, additions) : -Math.min(-delta, removals);
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
  // A deliberate account reset starts a new progress period. Old offline
  // progress/history must not undo it; drawing edits above still survive.
  if (progressWasReset) {
    data.statisticsReset = latest.statisticsReset;
    data.progressCompleted = remoteDrawing.progressCompleted || [];
    data.activityLog = latest.activityLog || [];
    data.lastPaintedAt = latest.lastPaintedAt ?? null;
    data.dailyPlanDoneOn = latest.dailyPlanDoneOn ?? null;
    data.versions = latest.versions || [];
  }
  return { ...remote, name: local.name !== baseName ? local.name : remote.name, data };
}
