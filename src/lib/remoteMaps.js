import { supabase } from './supabase';
import { readAccountCache, cacheAccountMaps } from './offlineMaps';
import { applySyncDelta, knownVersions } from './syncCache';

const accounts = new Map();
function account(owner) {
  if (!owner) throw new Error('login-required');
  if (!accounts.has(owner)) accounts.set(owner, { personal: [], shared: [], ready: false, queue: Promise.resolve() });
  return accounts.get(owner);
}
function enqueue(state, operation) {
  const request = state.queue.then(operation, operation);
  state.queue = request.catch(() => {});
  return request;
}
async function initialize(state, owner) {
  if (state.ready) return;
  const cache = await readAccountCache(`remote-v1:${owner}`).catch(() => null);
  if (cache?.personal && cache?.shared) Object.assign(state, cache);
  state.ready = true;
}
function persist(state, owner) {
  return cacheAccountMaps(`remote-v1:${owner}`, { personal: state.personal, shared: state.shared }).catch(() => {});
}

export function loadRemoteMaps(owner, historyTeam = null) {
  const state = account(owner);
  return enqueue(state, async () => {
    await initialize(state, owner);
    const { data, error } = await supabase.rpc('sync_map_bundle', {
      known_private: knownVersions(state.personal), known_shared: knownVersions(state.shared, true), history_team: historyTeam, expected_owner: owner,
    });
    if (error) throw error;
    // Apply both sections atomically; a partial response must never remove local work.
    const personal = applySyncDelta(state.personal, data.personal);
    const shared = applySyncDelta(state.shared, data.shared, true);
    const changed = data.personal.changes.length || data.shared.changes.length || personal.length !== state.personal.length || shared.length !== state.shared.length;
    state.personal = personal; state.shared = shared;
    if (changed) await persist(state, owner);
    return { personal, shared };
  });
}

// A save returns only its revision. Reuse what we just uploaded instead of downloading it.
export function rememberRemoteSave(owner, row, receipt) {
  const state = account(owner);
  return enqueue(state, async () => {
    await initialize(state, owner);
    const old = state.personal.find((item) => item.id === row.id);
    if (old && old.sync_revision > receipt.sync_revision) return;
    const saved = { ...old, ...row, ...receipt };
    state.personal = [...state.personal.filter((item) => item.id !== row.id), saved];
    await persist(state, owner);
  });
}

export async function loadCachedLibrary(table) {
  const key = `public-library-v1:${table}`;
  const cached = await readAccountCache(key).catch(() => []);
  const { data: summary, error } = await supabase.from(table)
    .select('id,sync_revision,use_count').order('created_at', { ascending: true });
  if (error) return cached.length ? { data: cached } : { error };
  const rows = new Map(cached.map((row) => [row.id, row]));
  const changed = summary.filter((row) => rows.get(row.id)?.sync_revision !== row.sync_revision);
  if (changed.length) {
    const details = await supabase.from(table).select('*').in('id', changed.map((row) => row.id));
    if (details.error) return cached.length ? { data: cached } : { error: details.error };
    details.data.forEach((row) => rows.set(row.id, row));
  }
  const data = summary.filter((row) => rows.has(row.id)).map((row) => ({ ...rows.get(row.id), ...row }));
  await cacheAccountMaps(key, data).catch(() => {});
  return { data };
}
