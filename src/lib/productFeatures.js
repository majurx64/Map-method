import { getMapStats, MAX_CELLS, normalizeImageOffset } from "./grid.js";

const DAY = 86_400_000;

export const PLAN_MODES = {
  gentle: { label: "Спокойно", multiplier: 0.75 },
  balanced: { label: "Ровно", multiplier: 1 },
  intensive: { label: "Интенсивно", multiplier: 1.3 },
  paused: { label: "Пауза", multiplier: 0 },
};

export function activityTotals(maps) {
  const totals = new Map();
  maps.forEach((map) => (map.activityLog || []).forEach((entry) => {
    totals.set(entry.date, (totals.get(entry.date) || 0) + Math.max(0, Number(entry.cells) || 0));
  }));
  return totals;
}

export function buildActivityCalendar(maps, days = 365, today = new Date()) {
  const totals = activityTotals(maps);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - index - 1));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { key, date, cells: totals.get(key) || 0 };
  });
}

export function calculateStreaks(maps, today = new Date()) {
  const calendar = buildActivityCalendar(maps, 730, today);
  let best = 0;
  let run = 0;
  let activeDays = 0;
  let freeDayAvailable = false;
  let freeDayUsed = false;
  calendar.forEach((day, index) => {
    // Today is still in progress: neither break a streak nor consume its rest day.
    if (index === calendar.length - 1 && !day.cells) return;
    if (day.cells > 0) {
      run += 1;
      activeDays += 1;
      if (activeDays > 0 && activeDays % 7 === 0) freeDayAvailable = true;
    } else if (run > 0 && freeDayAvailable) {
      run += 1;
      freeDayAvailable = false;
      freeDayUsed = true;
    } else {
      best = Math.max(best, run);
      run = 0;
      activeDays = 0;
      freeDayAvailable = false;
      freeDayUsed = false;
    }
    best = Math.max(best, run);
  });
  const todayActive = calendar.at(-1)?.cells > 0;
  const yesterdayActive = calendar.at(-2)?.cells > 0;
  if (!todayActive && !yesterdayActive && !freeDayUsed) run = 0;
  return { current: run, best, freeDayAvailable, freeDayUsed };
}

export function adaptiveDailyTarget(map, today = new Date()) {
  let mode = PLAN_MODES[map.planMode] ? map.planMode : "balanced";
  if (map.planPausedUntil && map.planPausedUntil >= dateKey(today)) {
    return { paused: true, label: `Отдых до ${map.planPausedUntil.split("-").reverse().join(".")}` };
  }
  if (mode === "paused" && !map.planPausedUntil) return { paused: true, label: "План на паузе" };
  if (mode === "paused") mode = "balanced";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(map.deadline || "")) return null;
  const stats = getMapStats(map);
  const [year, month, day] = map.deadline.split("-").map(Number);
  const days = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY) + 1;
  const remaining = Math.max(0, stats.total - stats.filled);
  if (!stats.total) return { target: 0, days, label: "Добавьте рисунок для расчёта нормы" };
  if (!remaining) return { target: 0, days: Math.max(0, days), label: "Карта заполнена" };
  if (days <= 0) return { target: remaining, days: 0, label: `Срок прошёл · осталось ${remaining}` };
  const paintedToday = (map.activityLog || []).filter((entry) => entry.date === dateKey(today)).reduce((sum, entry) => sum + Math.max(0, Number(entry.cells) || 0), 0);
  const startRemaining = Math.min(stats.total, remaining + paintedToday);
  const target = Math.min(startRemaining, Math.max(1, Math.ceil((startRemaining / days) * PLAN_MODES[mode].multiplier)));
  const word = target % 100 >= 11 && target % 100 <= 14 ? "клеток" : target % 10 === 1 ? "клетка" : target % 10 >= 2 && target % 10 <= 4 ? "клетки" : "клеток";
  return { target, paintedToday, days, mode, label: `${target} ${word} в день · осталось ${days} дн.` };
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createMapSnapshot(map, label = "Автоматическая версия", cellSequence = []) {
  const stats = getMapStats(map);
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    label,
    filled: stats.filled,
    total: stats.total,
    mapType: map.mapType,
    gridMode: map.gridMode,
    totalCells: map.totalCells,
    manualRows: map.manualRows,
    manualCols: map.manualCols,
    imageRatio: map.imageRatio,
    image: map.image || null,
    imageOffset: { ...normalizeImageOffset(map.imageOffset), cellsEdited: true },
    isGameMode: Boolean(map.isGameMode),
    showImage: map.showImage !== false,
    completed: [...(map.completed || [])],
    progressCompleted: [...(map.progressCompleted || [])],
    colors: [...(map.colors || [])],
    cellSequence: (Array.isArray(cellSequence) ? cellSequence : [])
      .slice(0, MAX_CELLS * 4)
      .map(Number)
      .filter((entry) => Number.isInteger(entry) && entry >= -MAX_CELLS && entry < MAX_CELLS),
  };
}

export function normalizeVersions(versions) {
  if (!Array.isArray(versions)) return [];
  return versions.flatMap((version) => {
    if (!version || typeof version !== "object" || !Array.isArray(version.completed)) return [];
    return [{
      id: String(version.id || `${Date.now()}-${Math.random()}`),
      actorId: version.actorId || null,
      eventId: version.eventId || null,
      createdAt: Number.isFinite(Date.parse(version.createdAt)) ? version.createdAt : new Date().toISOString(),
      label: String(version.label || "Версия").slice(0, 80),
      filled: Math.max(0, Number(version.filled) || 0),
      total: Math.max(0, Number(version.total) || 0),
      mapType: version.mapType === "image" ? "image" : "free",
      gridMode: version.gridMode === "manual" ? "manual" : "auto",
      totalCells: String(version.totalCells || "500"),
      manualRows: String(version.manualRows || "20"),
      manualCols: String(version.manualCols || "25"),
      imageRatio: Number(version.imageRatio) > 0 ? Number(version.imageRatio) : 1,
      image: typeof version.image === "string" ? version.image : null,
      imageOffset: { ...normalizeImageOffset(version.imageOffset), cellsEdited: true },
      isGameMode: Boolean(version.isGameMode),
      showImage: version.showImage !== false,
      completed: version.completed.slice(0, MAX_CELLS).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < MAX_CELLS),
      progressCompleted: (Array.isArray(version.progressCompleted) ? version.progressCompleted : []).slice(0, MAX_CELLS).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < MAX_CELLS),
      colors: Array.isArray(version.colors) ? version.colors.slice(0, MAX_CELLS) : [],
      cellSequence: (Array.isArray(version.cellSequence) ? version.cellSequence : [])
        .slice(0, MAX_CELLS * 4)
        .map(Number)
        .filter((entry) => Number.isInteger(entry) && entry >= -MAX_CELLS && entry < MAX_CELLS),
    }];
  });
}

export function addDailySnapshot(previous, next) {
  if (!previous || !next) return next;
  const changed = JSON.stringify(previous.progressCompleted || []) !== JSON.stringify(next.progressCompleted || [])
    || JSON.stringify(previous.completed || []) !== JSON.stringify(next.completed || [])
    || JSON.stringify(previous.colors || []) !== JSON.stringify(next.colors || [])
    || ["image", "totalCells", "manualRows", "manualCols", "gridMode", "mapType", "imageRatio"].some((key) => previous[key] !== next[key]);
  if (!changed) return next;
  const versions = normalizeVersions(previous.versions);
  const today = dateKey();
  if (versions.some((version) => dateKey(new Date(version.createdAt)) === today)) return { ...next, versions };
  return { ...next, versions: [...versions, createMapSnapshot(previous)] };
}

function snapshotMatchesMap(snapshot, map) {
  if (!snapshot || !map) return false;
  return snapshot.mapType === map.mapType
    && snapshot.gridMode === map.gridMode
    && String(snapshot.totalCells) === String(map.totalCells)
    && String(snapshot.manualRows) === String(map.manualRows)
    && String(snapshot.manualCols) === String(map.manualCols)
    && snapshot.imageRatio === map.imageRatio
    && snapshot.image === (map.image || null)
    && JSON.stringify(snapshot.imageOffset) === JSON.stringify({ ...normalizeImageOffset(map.imageOffset), cellsEdited: true })
    && snapshot.isGameMode === Boolean(map.isGameMode)
    && snapshot.showImage === (map.showImage !== false)
    && JSON.stringify(snapshot.completed) === JSON.stringify(map.completed || [])
    && JSON.stringify(snapshot.progressCompleted) === JSON.stringify(map.progressCompleted || [])
    && JSON.stringify(snapshot.colors) === JSON.stringify(map.colors || []);
}

export function addChangeSnapshot(map, cellSequence = []) {
  if (!map) return map;
  const versions = normalizeVersions(map.versions);
  if (snapshotMatchesMap(versions.at(-1), map)) return { ...map, versions };
  return { ...map, versions: [...versions, createMapSnapshot(map, "Изменение", cellSequence)] };
}

export function restoreSnapshot(map, snapshot) {
  return {
    ...map,
    mapType: snapshot.mapType,
    gridMode: snapshot.gridMode,
    totalCells: snapshot.totalCells,
    manualRows: snapshot.manualRows,
    manualCols: snapshot.manualCols,
    imageRatio: snapshot.imageRatio,
    image: snapshot.image || null,
    imageOffset: { ...normalizeImageOffset(snapshot.imageOffset), cellsEdited: true },
    isGameMode: Boolean(snapshot.isGameMode),
    showImage: snapshot.showImage !== false,
    modeDrafts: {},
    dailyPlanDoneOn: "",
    completed: [...snapshot.completed],
    progressCompleted: [...snapshot.progressCompleted],
    colors: [...snapshot.colors],
  };
}

export function createBackup(maps, profile = {}) {
  return JSON.stringify({
    format: "map-method-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    maps,
  }, null, 2);
}

export function parseBackup(text) {
  if (text.length > 50 * 1024 * 1024) throw new Error("backup-too-large");
  const value = JSON.parse(text);
  if (value?.format !== "map-method-backup" || value.version !== 1 || !Array.isArray(value.maps) || value.maps.length > 1000) throw new Error("invalid-backup");
  for (const map of value.maps) {
    if (!map || typeof map !== "object" || Array.isArray(map) || typeof map.name !== "string"
      || !["image", "free"].includes(map.mapType) || !Number.isInteger(Number(map.totalCells))
      || Number(map.totalCells) < 1 || Number(map.totalCells) > MAX_CELLS
      || ["completed", "progressCompleted", "colors"].some((key) => map[key] !== undefined && (!Array.isArray(map[key]) || map[key].length > MAX_CELLS))) {
      throw new Error("invalid-map");
    }
  }
  return value.maps;
}

// An allowlist is essential: hidden progress must never be included in a link.
export function publicSnapshot(map, settings) {
  const result = {};
  for (const key of ["name", "description", "mapType", "gridMode", "totalCells", "manualRows", "manualCols", "imageRatio", "completed", "colors"]) {
    if (map[key] !== undefined) result[key] = map[key];
  }
  result.progressCompleted = settings.showProgress ? [...(map.progressCompleted || [])] : [];
  result.isGameMode = Boolean(settings.showProgress);
  result.lastPaintedAt = settings.showActivity ? map.lastPaintedAt || "" : "";
  if (settings.showHistory) {
    result.versions = normalizeVersions(map.versions).map((version) => {
      const safeVersion = publicSnapshot(version, { ...settings, showHistory: false });
      safeVersion.isGameMode = Boolean(settings.showProgress && version.isGameMode);
      const stats = getMapStats(safeVersion);
      return {
        ...safeVersion,
        id: version.id,
        createdAt: version.createdAt,
        label: version.label,
        filled: stats.filled,
        total: stats.total,
        cellSequence: settings.showProgress ? version.cellSequence : [],
      };
    });
  }
  return result;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value) {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encodeSharedSnapshot(value) {
  const source = new TextEncoder().encode(JSON.stringify(value));
  if (!("CompressionStream" in window)) return `plain.${bytesToBase64(source)}`;
  const stream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
  return `gzip.${bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

export async function decodeSharedSnapshot(value) {
  if (String(value).length > 200000) throw new Error("share-too-large");
  const [kind, encoded] = String(value || "").split(".", 2);
  const bytes = base64ToBytes(encoded || "");
  if (kind === "plain") return JSON.parse(new TextDecoder().decode(bytes));
  if (kind !== "gzip" || !("DecompressionStream" in window)) throw new Error("unsupported-share");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("share-too-large"); }
    chunks.push(chunk);
  }
  return JSON.parse(await new Blob(chunks).text());
}

// Visibility settings may change; the frozen stage itself must stay unchanged.
export function shouldUpdateSharedMap(settings, publishedSettings) {
  if (settings.mode !== "snapshot" || publishedSettings?.mode !== "snapshot") return true;
  return ["showProgress", "showActivity", "showHistory"].some((key) => Boolean(settings[key]) !== Boolean(publishedSettings[key]));
}

export function publicSharedSnapshot(map, settings, publishedMap = null) {
  const source = settings.mode === "snapshot" ? map.shareSnapshot || publishedMap || map : map;
  return publicSnapshot(source, settings);
}
