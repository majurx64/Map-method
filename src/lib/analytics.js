import { supabase } from "./supabase";
import { ANALYTICS_VERSION } from './analyticsReport';

const VISITOR_KEY = "mm-analytics-visitor";
const SESSION_KEY = "mm-analytics-session";
const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function storedId(storage, key) {
  let value = storage.getItem(key);
  if (!value) {
    value = createId();
    storage.setItem(key, value);
  }
  return value;
}

const visitorId = storedId(localStorage, VISITOR_KEY);
const sessionId = storedId(sessionStorage, SESSION_KEY);
let queue = [];
let timer = 0;
let geoPromise;
let enabled = false, human = false, listening = false, lastInteraction = 0;
let lastPage = '', lastPageAt = 0, developerRequest = null;
const EXCLUDED_KEY = 'mm-analytics-developer-device';
const MARKER_KEY = `mm-analytics-developer-marker-${ANALYTICS_VERSION}`;
const productionHosts = ['mapmethod.ru', 'www.mapmethod.ru', 'map-method-chi.vercel.app'];

export function setAnalyticsContext({ developer, userId, ready }) {
  if (developer) {
    localStorage.setItem(EXCLUDED_KEY, '1');
    if (userId && !localStorage.getItem(MARKER_KEY) && !developerRequest) {
      developerRequest = supabase.from('analytics_events').insert({ event_name: 'developer_device', event_value: 0, visitor_id: visitorId, session_id: sessionId, user_id: userId, country: 'XX', metadata: { analyticsVersion: ANALYTICS_VERSION, human: false } }).then(({ error }) => { if (!error) localStorage.setItem(MARKER_KEY, '1'); }).catch(() => null).finally(() => { developerRequest = null; });
    }
  }
  enabled = Boolean(ready && !developer && !localStorage.getItem(EXCLUDED_KEY) && !navigator.webdriver && productionHosts.includes(window.location.hostname));
  if (!enabled) { queue = []; window.clearTimeout(timer); timer = 0; return; }
  if (!listening) {
    listening = true;
    const interact = (event) => {
      if (!enabled || !event.isTrusted || document.visibilityState !== 'visible') return;
      human = true; lastInteraction = Date.now();
      if (queue.length && !timer) timer = window.setTimeout(() => void flushAnalytics(), 1800);
    };
    for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(name, interact, { passive: true });
  }
}

function getCountry() {
  if (!geoPromise) {
    geoPromise = fetch("/api/geo", { credentials: "omit", cache: 'no-store' })
      .then((response) => response.ok ? response.json() : {})
      .then((data) => data.country || "XX")
      .catch(() => "XX");
  }
  return geoPromise;
}

export async function flushAnalytics() {
  window.clearTimeout(timer);
  timer = 0;
  if (!enabled || !human || !queue.length) return;
  const events = queue;
  queue = [];
  const country = await getCountry();
  if (!enabled) return;
  const { error } = await supabase.from("analytics_events").insert(events.map((event) => ({ ...event, country, metadata: { ...event.metadata, analyticsVersion: ANALYTICS_VERSION, human: true } })));
  if (error && enabled) queue = [...events, ...queue].slice(-64);
}

export function trackAnalytics(eventName, { value = 1, metadata = {}, userId = null } = {}) {
  if (!enabled) return;
  if (eventName === 'active_seconds' && (!human || document.visibilityState !== 'visible' || !document.hasFocus() || Date.now() - lastInteraction > 120000)) return;
  if (eventName === 'page_view') {
    const page = `${window.location.pathname}:${metadata.screen}`;
    if (page === lastPage && Date.now() - lastPageAt < 1000) return;
    lastPage = page; lastPageAt = Date.now();
  }
  queue.push({
    event_name: eventName,
    event_value: Math.max(0, Math.round(Number(value) || 0)),
    visitor_id: visitorId,
    session_id: sessionId,
    user_id: userId || null,
    path: window.location.pathname,
    metadata,
  });
  if (queue.length > 64) queue.shift();
  if (human && queue.length >= 8) void flushAnalytics();
  else if (human && !timer) timer = window.setTimeout(() => void flushAnalytics(), 1800);
}

export function getAnalyticsIdentity() {
  return { visitorId, sessionId };
}
