import { supabase } from './supabase';
import { readAccountCache, cacheAccountMaps } from './offlineMaps';
import { applySyncDelta, knownVersions } from './syncCache';
import { decodeWire, dataPatch, applyEventDelta, requestMapBundle } from './syncWire';
import { rebasePersonalMap } from './personalMapMerge';

const accounts = new Map();
function account(owner) {
  if (!owner) throw new Error('login-required');
  if (!accounts.has(owner)) accounts.set(owner, { personal: [], shared: [], objects: {}, histories: {}, ready: false, queue: Promise.resolve() });
  return accounts.get(owner);
}
function enqueue(state, operation) {
  const request = state.queue.then(operation, operation);
  state.queue = request.catch(() => {});
  return request;
}
// Bound the whole request, including session validation, so one stalled mobile
// connection cannot hold the account queue and its cross-tab lock indefinitely.
export async function requestRpc(name, args) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('map-sync-timeout'));
    }, 15000);
  });
  try {
    return await Promise.race([supabase.rpc(name, args).abortSignal(controller.signal), deadline]);
  } finally { clearTimeout(timer); }
}
async function initialize(state, owner, reload = false) {
  if (state.ready && !reload) return;
  const cache = await readAccountCache(`remote-v1:${owner}`).catch(() => null);
  if (cache?.personal && cache?.shared) { Object.assign(state, cache); state.canonicalLoaded = true; }
  state.ready = true;
}
function persist(state, owner) {
  return cacheAccountMaps(`remote-v1:${owner}`, { personal: state.personal, shared: state.shared, objects: state.objects, histories: state.histories }).catch(() => {});
}

// Tabs on the same computer reuse the newest canonical cache instead of downloading
// the same cold snapshot independently. The existing per-tab queue remains the fallback.
function withAccountLock(owner, run) {
  return globalThis.navigator?.locks ? navigator.locks.request(`mm-remote:${owner}`, run) : run();
}

async function refreshRemoteState(state, owner, historyTeam = null) {
    const knownShared = knownVersions(state.shared, true);
    if (historyTeam && knownShared[historyTeam]) knownShared[historyTeam].eventHashes = state.histories[historyTeam]?.hashes || {};
    const { data: response, error, plain } = await requestMapBundle(requestRpc, {
      known_private: knownVersions(state.personal), known_shared: knownShared, history_team: historyTeam, expected_owner: owner, known_objects: Object.keys(state.objects),
    }, state.plainTransport);
    if (error) throw error;
    const { data, objects } = plain ? { data: response, objects: state.objects } : decodeWire(response, state.objects);
    const histories = { ...state.histories };
    data.shared.changes = data.shared.changes.map((row) => {
      if (!row.events || Array.isArray(row.events)) return row;
      const events = applyEventDelta(histories[row.id]?.events || [], row.events);
      histories[row.id] = { events, hashes: row.events.hashes };
      return { ...row, events };
    });
    // Apply both sections atomically; a partial response must never remove local work.
    const personal = applySyncDelta(state.personal, data.personal);
    const shared = applySyncDelta(state.shared, data.shared, true);
    state.plainTransport = plain;
    const changed = data.personal.changes.length || data.shared.changes.length || personal.length !== state.personal.length || shared.length !== state.shared.length || Object.keys(response.objects || {}).length;
    state.personal = personal; state.shared = shared; state.objects = objects;
    state.histories = Object.fromEntries(Object.entries(histories).filter(([id]) => data.shared.ids.includes(id)));
    if (changed) await persist(state, owner);
    state.canonicalLoaded = true;
    state.checked = { at: Date.now(), historyTeam };
    await cacheAccountMaps(`remote-check-v1:${owner}`, state.checked).catch(() => {});
    return { personal, shared };
}
export function loadRemoteMaps(owner, historyTeam = null, { force = false } = {}) {
  const state = account(owner);
  return enqueue(state, () => withAccountLock(owner, async () => {
    await initialize(state, owner, Boolean(globalThis.navigator?.locks));
    const checked = globalThis.navigator?.locks ? await readAccountCache(`remote-check-v1:${owner}`).catch(() => null) : state.checked;
    // Collapse simultaneous tab/focus/startup requests. Explicit invalidations and
    // revision-conflict retries still fetch immediately, even inside this window.
    if (!force && state.canonicalLoaded && checked?.historyTeam === historyTeam && Date.now() >= checked.at && Date.now() - checked.at < 1500) {
      return { personal: state.personal, shared: state.shared };
    }
    return refreshRemoteState(state, owner, historyTeam);
  }));
}

// A save returns only its revision. Reuse what we just uploaded instead of downloading it.
export function rememberRemoteSave(owner, row, receipt) {
  const state = account(owner);
  return enqueue(state, () => withAccountLock(owner, async () => {
    await initialize(state, owner, Boolean(globalThis.navigator?.locks));
    const old = state.personal.find((item) => item.id === row.id);
    if (old && old.sync_revision > receipt.sync_revision) return;
    const saved = { ...old, ...row, ...receipt };
    state.personal = [...state.personal.filter((item) => item.id !== row.id), saved];
    await persist(state, owner);
  }));
}

export function saveRemoteMap(owner, row, baseline) {
  const state = account(owner);
  return enqueue(state, () => withAccountLock(owner, async () => {
    await initialize(state, owner, Boolean(globalThis.navigator?.locks));
    let old = state.personal.find((item) => item.id === row.id);
    if (!old) {
      await refreshRemoteState(state, owner);
      old = state.personal.find((item) => item.id === row.id);
    }
    const base = baseline === undefined ? old : baseline;
    let result, candidate;
    for (let attempt = 0; attempt < 3; attempt++) {
      // A confirmed remote deletion wins over autosave, without resurrecting
      // the map or leaving this device waiting for a manual version choice.
      if (!old && base && baseline !== undefined) return null;
      candidate = old ? rebasePersonalMap(base || state.lastSaved?.get(row.id), row, old, state.lastSaved?.get(row.id)) : row;
      result = old
        ? await requestRpc('save_personal_map_patch_v2', { map_id: String(row.id), map_name: candidate.name, patch: dataPatch(old.data, candidate.data), expected_revision: old.sync_revision, expected_owner: owner, expected_progress_reset: candidate.data.statisticsReset?.at || null })
        : await requestRpc('create_personal_map', { map_id: String(row.id), map_name: row.name, map_data: row.data, expected_owner: owner });
      if (result.error?.code !== '40001') break;
      await refreshRemoteState(state, owner);
      old = state.personal.find((item) => item.id === row.id);
    }
    if (result.error?.code === '40001') throw Object.assign(new Error('personal-map-keeps-changing'), { code: 'MM_SYNC_RETRY' });
    if (result.error) throw result.error;
    const saved = { ...old, ...candidate, ...result.data };
    state.personal = [...state.personal.filter((item) => item.id !== row.id), saved];
    state.lastSaved ??= new Map();
    state.lastSaved.set(row.id, row);
    await persist(state, owner);
    return saved;
  }));
}

export async function upsertRemoteMap(row, baseline) {
  try { return { data: await saveRemoteMap(row.user_id, row, baseline), error: null }; }
  catch (error) { return { data: null, error }; }
}

export function compactCollaborativeRpc(owner, operation, args) {
  const state = account(owner);
  return enqueue(state, () => withAccountLock(owner, async () => {
    await initialize(state, owner, Boolean(globalThis.navigator?.locks));
    const { data: response, error } = await requestRpc('compact_collaborative_rpc', { operation, arguments: args, known_objects: Object.keys(state.objects), expected_owner: owner });
    if (error) throw error;
    const { data, objects } = decodeWire(response, state.objects);
    state.objects = objects;
    await persist(state, owner);
    return data;
  }));
}

export async function loadPublicMap(token) {
  const key = `public-share-v2:${token}`;
  const cached = await readAccountCache(key).catch(() => null);
  const { data: response, error } = await requestRpc('sync_public_map', { share_token: token, known_fields: cached?.row?.fields || {}, known_updated_at: cached?.row?.updated_at || '', known_objects: Object.keys(cached?.objects || {}) });
  if (error) throw error;
  if (!response) { await cacheAccountMaps(key, null).catch(() => {}); return null; }
  const { data, objects } = decodeWire(response, cached?.objects);
  if (data.unchanged) {
    if (!cached?.row) throw new Error('missing-public-map');
    return { ...cached.row, map_data: cached.row.data };
  }
  const row = applySyncDelta(cached?.row ? [cached.row] : [], { ids: [data.id], changes: [data] })[0];
  await cacheAccountMaps(key, { row, objects }).catch(() => {});
  return { ...row, map_data: row.data };
}

export async function loadCachedLibrary(table, onCached) {
  const key = `public-library-v1:${table}`;
  const stored = await readAccountCache(key).catch(() => []);
  const cached = Array.isArray(stored) ? stored : stored.rows || [];
  if (cached.length) onCached?.(cached);
  const { data: response, error } = await supabase.rpc('sync_public_library', { known_revisions: Object.fromEntries(cached.map((row) => [row.id, row.sync_revision])), known_objects: Object.keys(stored.objects || {}) });
  if (error) return cached.length ? { data: cached } : { error };
  const rows = new Map(cached.map((row) => [row.id, row]));
  const { data: delta, objects } = decodeWire(response, stored.objects);
  delta.changes.forEach((row) => rows.set(row.id, row));
  const data = delta.ids.map((id) => {
    if (!rows.has(id)) throw new Error('missing-library-row');
    return { ...rows.get(id), use_count: delta.usage[id] };
  });
  if (delta.changes.length || JSON.stringify(data.map((row) => [row.id, row.use_count])) !== JSON.stringify(cached.map((row) => [row.id, row.use_count]))) await cacheAccountMaps(key, { rows: data, objects }).catch(() => {});
  return { data };
}
