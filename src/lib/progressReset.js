import { rebasePersonalMap } from './personalMapMerge.js';
import { getMapStats, MAX_CELLS } from './grid.js';

export function normalizeStatisticsReset(reset) {
  if (!reset?.at || !Number.isFinite(Date.parse(reset.at))) return null;
  const result = { at: reset.at, owner: reset.owner };
  if (Number.isFinite(Date.parse(reset.periodStartedAt))) result.periodStartedAt = reset.periodStartedAt;
  if (Number.isFinite(reset.baselineFilled)) result.baselineFilled = Math.max(0, Math.min(MAX_CELLS, Math.floor(reset.baselineFilled)));
  if (typeof reset.baselineFinished === 'boolean') result.baselineFinished = reset.baselineFinished;
  if (Array.isArray(reset.progressBaseline)) result.progressBaseline = reset.progressBaseline.slice(0, MAX_CELLS)
    .map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < MAX_CELLS);
  if (Array.isArray(reset.baselineActivityLog)) result.baselineActivityLog = reset.baselineActivityLog.slice(-730)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date) && Number.isFinite(entry.cells) && entry.cells > 0)
    .map(({ date, cells }) => ({ date, cells }));
  return result;
}

// Account counters have their own baseline; resetting them never requires
// clearing the progress or daily history used by the maps themselves.
export function getAccountMapStats(map, owner) {
  const stats = getMapStats(map);
  const reset = map.statisticsReset?.owner === owner ? map.statisticsReset : null;
  return { ...stats, filled: Math.max(0, stats.filled - (reset?.baselineFilled || 0)),
    finished: stats.total > 0 && stats.filled >= stats.total && !reset?.baselineFinished };
}

export function accountActivityLog(map, owner) {
  const log = map.activityLog || [];
  if (map.statisticsReset?.owner !== owner || !map.statisticsReset?.baselineActivityLog) return log;
  const baseline = new Map(map.statisticsReset.baselineActivityLog.map(({ date, cells }) => [date, cells]));
  return log.map(({ date, cells }) => ({ date, cells: Math.max(0, cells - (baseline.get(date) || 0)) }))
    .filter(({ cells }) => cells > 0);
}

export function hasNewProgressReset(local, remote) {
  return Boolean(local && remote?.statisticsReset?.at && local.statisticsReset?.at !== remote.statisticsReset.at);
}

export function mapAfterProgressReset(local, remote, baseline = null) {
  if (!hasNewProgressReset(local, remote)) return local;
  const merged = rebasePersonalMap(baseline, { name: local.name, data: local }, { name: remote.name, data: remote });
  return { ...merged.data, ...(remote.collaboration ? { collaboration: remote.collaboration } : {}) };
}

export function createdSinceStatisticsReset(map, owner) {
  return map.statisticsReset?.owner !== owner || !map.statisticsReset?.at
    || Date.parse(map.createdAt) > Date.parse(map.statisticsReset.periodStartedAt || map.statisticsReset.at);
}
