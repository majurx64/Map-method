import { getMapStats } from "./grid.js";

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
  calendar.forEach((day) => {
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
  const mode = PLAN_MODES[map.planMode] ? map.planMode : "balanced";
  if (mode === "paused") return { paused: true, label: "План на паузе" };
  if (map.planPausedUntil && map.planPausedUntil >= dateKey(today)) {
    return { paused: true, label: `Отдых до ${map.planPausedUntil.split("-").reverse().join(".")}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(map.deadline || "")) return null;
  const stats = getMapStats(map);
  const [year, month, day] = map.deadline.split("-").map(Number);
  const days = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY) + 1;
  const remaining = Math.max(0, stats.total - stats.filled);
  if (!remaining) return { target: 0, days: Math.max(0, days), label: "Карта заполнена" };
  if (days <= 0) return { target: remaining, days: 0, label: `Срок прошёл · осталось ${remaining}` };
  const target = Math.max(1, Math.ceil((remaining / days) * PLAN_MODES[mode].multiplier));
  return { target, days, mode, label: `${target} в день · осталось ${days} дн.` };
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createMapSnapshot(map, label = "Автоматическая версия") {
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
    completed: [...(map.completed || [])],
    progressCompleted: [...(map.progressCompleted || [])],
    colors: [...(map.colors || [])],
  };
}

export function normalizeVersions(versions) {
  if (!Array.isArray(versions)) return [];
  return versions.slice(-20).flatMap((version) => {
    if (!version || typeof version !== "object" || !Array.isArray(version.completed)) return [];
    return [{
      id: String(version.id || `${Date.now()}-${Math.random()}`),
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
      completed: version.completed.map(Number).filter(Number.isInteger),
      progressCompleted: (version.progressCompleted || []).map(Number).filter(Number.isInteger),
      colors: Array.isArray(version.colors) ? version.colors : [],
    }];
  });
}

export function addDailySnapshot(previous, next) {
  if (!previous || !next) return next;
  const changed = JSON.stringify(previous.progressCompleted || []) !== JSON.stringify(next.progressCompleted || [])
    || JSON.stringify(previous.completed || []) !== JSON.stringify(next.completed || []);
  if (!changed) return next;
  const versions = normalizeVersions(previous.versions);
  const today = dateKey();
  if (versions.some((version) => version.createdAt.slice(0, 10) === today)) return { ...next, versions };
  return { ...next, versions: [...versions, createMapSnapshot(previous)].slice(-20) };
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
  const value = JSON.parse(text);
  if (value?.format !== "map-method-backup" || !Array.isArray(value.maps)) throw new Error("invalid-backup");
  return value.maps;
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
  const [kind, encoded] = String(value || "").split(".", 2);
  const bytes = base64ToBytes(encoded || "");
  if (kind === "plain") return JSON.parse(new TextDecoder().decode(bytes));
  if (kind !== "gzip" || !("DecompressionStream" in window)) throw new Error("unsupported-share");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
