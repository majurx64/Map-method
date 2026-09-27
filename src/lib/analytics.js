import { supabase } from "./supabase";

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

function getCountry() {
  if (!geoPromise) {
    geoPromise = fetch("/api/geo", { credentials: "omit" })
      .then((response) => response.ok ? response.json() : {})
      .then((data) => data.country || "XX")
      .catch(() => "XX");
  }
  return geoPromise;
}

export async function flushAnalytics() {
  window.clearTimeout(timer);
  timer = 0;
  if (!queue.length) return;
  const events = queue;
  queue = [];
  const country = await getCountry();
  await supabase.from("analytics_events").insert(events.map((event) => ({ ...event, country })));
}

export function trackAnalytics(eventName, { value = 1, metadata = {}, userId = null } = {}) {
  queue.push({
    event_name: eventName,
    event_value: Math.max(0, Math.round(Number(value) || 0)),
    visitor_id: visitorId,
    session_id: sessionId,
    user_id: userId || null,
    path: window.location.pathname,
    metadata,
  });
  if (queue.length >= 8) void flushAnalytics();
  else if (!timer) timer = window.setTimeout(() => void flushAnalytics(), 1800);
}

export function getAnalyticsIdentity() {
  return { visitorId, sessionId };
}
