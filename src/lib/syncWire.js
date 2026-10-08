// Lossless transport only. Maps, exports, and server records keep their original schema.
export async function requestMapBundle(request, args, plain = false) {
  if (!plain) {
    const result = await request('sync_map_bundle_v2', args);
    if (result.error?.code !== '57014') return { ...result, plain: false };
  }
  // Retry only this read when the database cannot finish dictionary encoding.
  // The original delta RPC keeps the same account and revision checks.
  const { known_objects, ...deltaArgs } = args;
  void known_objects;
  return { ...await request('sync_map_bundle', deltaArgs), plain: true };
}

export function decodeWire(response, cached = {}) {
  if (response?.format !== 'mm-wire-1') throw new Error('invalid-wire-format');
  const objects = { ...cached, ...response.objects };
  const resolved = new Map(), resolving = new Set();
  function decode(node, depth = 0) {
    if (depth > 100) throw new Error('invalid-wire-depth');
    if (!Array.isArray(node)) {
      if (node && typeof node === 'object') throw new Error('invalid-wire-node');
      return node;
    }
    const [kind, value] = node;
    if (kind === '@') {
      if (resolved.has(value)) return resolved.get(value);
      if (!Object.hasOwn(objects, value)) throw new Error('missing-wire-object');
      if (resolving.has(value)) throw new Error('invalid-wire-cycle');
      resolving.add(value);
      const result = decode(objects[value], depth + 1);
      resolving.delete(value); resolved.set(value, result);
      return result;
    }
    if (kind === 'o' && value && !Array.isArray(value) && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child, depth + 1)]));
    }
    if (kind === 'a' && Array.isArray(value)) return value.map((child) => decode(child, depth + 1));
    if (kind === 'g' && Array.isArray(value)) {
      const entries = [];
      for (const [child, keys] of value) {
        const decoded = decode(child, depth + 1);
        for (const key of decode(keys, depth + 1)) entries.push([String(key), decoded]);
      }
      return Object.fromEntries(entries);
    }
    if ((kind === 'r' || kind === 'n') && Array.isArray(value)) {
      const result = [];
      for (const [first, second] of value) {
        const count = kind === 'r' ? first : second;
        if (!Number.isSafeInteger(count) || count < 1 || count > 100000 || result.length + count > 100000) throw new Error('invalid-wire-run');
        if (kind === 'r') {
          const child = decode(second, depth + 1);
          for (let index = 0; index < count; index++) result.push(child);
        } else {
          if (!Number.isSafeInteger(first) || !Number.isSafeInteger(first + count - 1)) throw new Error('invalid-wire-range');
          for (let index = 0; index < count; index++) result.push(first + index);
        }
      }
      return result;
    }
    throw new Error('invalid-wire-node');
  }
  const data = decode(response.value);
  return { data, objects: pruneWireObjects(objects) };
}

// Retain reusable images and recent nodes, including every dependency of a retained node.
// Eviction affects bandwidth only: canonical maps and the outbox contain decoded data.
export function pruneWireObjects(objects) {
  const keys = Object.keys(objects);
  if (keys.length <= 1024) return objects;
  const keep = new Set();
  function visit(node) {
    if (!Array.isArray(node)) return;
    if (node[0] === '@') add(node[1]);
    else if (node[0] === 'o') Object.values(node[1]).forEach(visit);
    else if (node[0] === 'a') node[1].forEach(visit);
    else if (node[0] === 'g') node[1].forEach((group) => { visit(group[0]); visit(group[1]); });
    else if (node[0] === 'r') node[1].forEach((run) => visit(run[1]));
  }
  function add(key) {
    if (keep.has(key) || !Object.hasOwn(objects, key)) return;
    keep.add(key); visit(objects[key]);
  }
  keys.filter((key) => typeof objects[key] === 'string').slice(-256).forEach(add);
  keys.slice(-256).forEach(add);
  if (keep.size > 2048) return Object.fromEntries(keys.filter((key) => typeof objects[key] === 'string').slice(-256).map((key) => [key, objects[key]]));
  return Object.fromEntries(keys.filter((key) => keep.has(key)).map((key) => [key, objects[key]]));
}

export function dataPatch(previous, next) {
  const fields = {}, removed = Object.keys(previous || {}).filter((key) => next[key] === undefined);
  let versions = null;
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || equalJSON(previous?.[key], value)) continue;
    if (key === 'versions' && Array.isArray(value) && Array.isArray(previous?.versions)) {
      const old = new Map();
      previous.versions.forEach((version, index) => {
        const id = version?.id ?? null;
        if (!old.has(id)) old.set(id, []);
        old.get(id).push(index);
      });
      const added = [];
      const order = value.map((version) => {
        const index = old.get(version?.id ?? null)?.find((candidate) => equalJSON(previous.versions[candidate], version));
        if (index !== undefined) return ['old', index];
        if (!version || Array.isArray(version) || typeof version !== 'object') added.push({ literal: version });
        else {
          const candidates = [['map', next], ['old', previous.versions.at(-1), previous.versions.length - 1]];
          let smallest;
          for (const [kind, baseline, baseIndex] of candidates) {
            if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) continue;
            const changes = Object.fromEntries(Object.entries(version).filter(([field, child]) => child !== undefined && !equalJSON(baseline[field], child)));
            const removedFields = Object.keys(baseline).filter((field) => version[field] === undefined);
            const entry = { base: kind === 'map' ? ['map'] : ['old', baseIndex], fields: changes, removed: removedFields };
            const size = JSON.stringify(entry).length;
            if (!smallest || size < smallest.size) smallest = { entry, size };
          }
          added.push(smallest.entry);
        }
        return ['new', added.length - 1];
      });
      versions = { order, added };
    } else Object.defineProperty(fields, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return { fields, removed, versions };
}

// Postgres canonicalizes object key order; JS insertion order must not invalidate history.
export function equalJSON(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) if (!equalJSON(left[index] ?? null, right[index] ?? null)) return false;
    return true;
  }
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return keys.length === Object.keys(right).filter((key) => right[key] !== undefined).length && keys.every((key) => Object.hasOwn(right, key) && equalJSON(left[key], right[key]));
}

export function applyEventDelta(previous, delta) {
  if (!delta || !Array.isArray(delta.ids) || !Array.isArray(delta.changes) || !delta.hashes) throw new Error('invalid-event-delta');
  const rows = new Map((previous || []).map((event) => [String(event.id), event]));
  delta.changes.forEach((event) => rows.set(String(event.id), event));
  return delta.ids.map((id) => {
    if (!rows.has(String(id))) throw new Error('missing-history-event');
    return rows.get(String(id));
  });
}
