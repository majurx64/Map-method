export const ANALYTICS_VERSION = 3;
export const ANALYTICS_STARTED_AT = '2026-10-08T02:05:45Z';

const metrics = { active_seconds: 'active_seconds', map_created: 'maps_created', map_deleted: 'maps_deleted', cells_created: 'cells_created', cells_painted: 'cells_painted', cells_erased: 'cells_erased', feedback_sent: 'feedback_sent', library_submission: 'library_submissions' };
const countryCode = (value) => /^[A-Z]{2}$/.test(value || '') ? value : 'XX';

export function buildAnalyticsReport(events, ownerId, periodDays = 30, now = Date.now()) {
  const since = Math.max(Date.parse(ANALYTICS_STARTED_AT), now - periodDays * 86400000);
  const scoped = events.filter((event) => event.metadata?.analyticsVersion === ANALYTICS_VERSION && Date.parse(event.created_at) >= since);
  // Logging in as the developer also removes earlier guest activity in that browser.
  const excluded = new Set(scoped.filter((event) => event.user_id === ownerId).map((event) => event.visitor_id));
  const valid = scoped.filter((event) => event.metadata?.human === true && event.user_id !== ownerId && !excluded.has(event.visitor_id) && event.visitor_id && event.session_id);
  const sessionUsers = new Map(), browserUsers = new Map();
  for (const event of valid) if (event.user_id) {
    sessionUsers.set(event.session_id, event.user_id);
    const users = browserUsers.get(event.visitor_id) || new Set(); users.add(event.user_id); browserUsers.set(event.visitor_id, users);
  }
  const identity = (event) => {
    const users = browserUsers.get(event.visitor_id);
    const user = event.user_id || sessionUsers.get(event.session_id) || (users?.size === 1 ? [...users][0] : null);
    return user ? `user:${user}` : `browser:${event.visitor_id}`;
  };
  const summary = { page_views: 0, unique_visitors: 0, sessions: 0, authenticated_users: 0, ...Object.fromEntries(Object.values(metrics).map((key) => [key, 0])) };
  const visitors = new Map(), sessions = new Set(), users = new Set(), days = new Map(), screens = new Map();
  for (const event of valid) {
    if (event.user_id) users.add(event.user_id);
    const day = event.created_at.slice(0, 10);
    const bucket = days.get(day) || { day, views: 0, visitors: new Set(), maps: 0, painted: 0 };
    const value = Number.isFinite(Number(event.event_value)) ? Math.max(0, Number(event.event_value)) : 0;
    if (metrics[event.event_name]) summary[metrics[event.event_name]] += value;
    if (event.event_name === 'map_created') bucket.maps += value;
    if (event.event_name === 'cells_painted') bucket.painted += value;
    if (event.event_name === 'page_view') {
      const id = identity(event), at = Date.parse(event.created_at), country = countryCode(event.country);
      const visitor = visitors.get(id) || { views: 0, country: 'XX', at: 0 };
      visitor.views++;
      if (country !== 'XX' && at >= visitor.at) { visitor.country = country; visitor.at = at; }
      visitors.set(id, visitor); sessions.add(event.session_id);
      summary.page_views++; bucket.views++; bucket.visitors.add(id);
      const screen = event.metadata.screen || 'unknown'; screens.set(screen, (screens.get(screen) || 0) + 1);
    }
    days.set(day, bucket);
  }
  summary.unique_visitors = visitors.size; summary.sessions = sessions.size; summary.authenticated_users = users.size;
  const countries = new Map();
  for (const visitor of visitors.values()) {
    const bucket = countries.get(visitor.country) || { country: visitor.country, visitors: 0, views: 0 };
    bucket.visitors++; bucket.views += visitor.views; countries.set(visitor.country, bucket);
  }
  return { period_days: periodDays, summary, daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((day) => ({ ...day, visitors: day.visitors.size })), countries: [...countries.values()].sort((a, b) => b.visitors - a.visitors), screens: [...screens].map(([screen, views]) => ({ screen, views })).sort((a, b) => b.views - a.views) };
}

export async function loadAnalyticsReport(client, ownerId, periodDays, signal) {
  const since = new Date(Math.max(Date.parse(ANALYTICS_STARTED_AT), Date.now() - periodDays * 86400000)).toISOString();
  const events = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('analytics_events').select('created_at,event_name,event_value,visitor_id,session_id,user_id,country,metadata').gte('created_at', since).contains('metadata', { analyticsVersion: ANALYTICS_VERSION }).order('id').range(offset, offset + 999).abortSignal(signal);
    if (error) throw error;
    events.push(...data);
    if (data.length < 1000) break;
  }
  return buildAnalyticsReport(events, ownerId, periodDays);
}
