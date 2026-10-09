import { rebasePersonalMap } from './personalMapMerge.js';

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
    || Date.parse(map.createdAt) > Date.parse(map.statisticsReset.at);
}
