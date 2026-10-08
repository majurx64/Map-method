import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_VERSION, ANALYTICS_STARTED_AT, buildAnalyticsReport, loadAnalyticsReport } from '../src/lib/analyticsReport.js';

const start = Date.parse(ANALYTICS_STARTED_AT);
const event = (overrides = {}) => ({ created_at: new Date(start + 1000).toISOString(), event_name: 'page_view', event_value: 1, visitor_id: 'browser-one', session_id: 'session-one', user_id: null, country: 'RU', metadata: { analyticsVersion: ANALYTICS_VERSION, human: true, screen: 'home' }, ...overrides });

test('new statistics omit old events, unattended visits and developer guest activity', () => {
  const rows = [
    event(),
    event({ visitor_id: 'old', metadata: { analyticsVersion: 2, human: true } }),
    event({ visitor_id: 'before-reset', created_at: new Date(start - 1).toISOString() }),
    event({ visitor_id: 'unattended', metadata: { analyticsVersion: ANALYTICS_VERSION, human: false } }),
    event({ visitor_id: 'developer' }),
    event({ visitor_id: 'developer', event_name: 'developer_device', user_id: 'owner', metadata: { analyticsVersion: ANALYTICS_VERSION, human: false } }),
    event({ visitor_id: 'developer-two', user_id: 'owner' }),
  ];
  const report = buildAnalyticsReport(rows, 'owner', 30, start + 10000);
  assert.equal(report.summary.unique_visitors, 1);
  assert.equal(report.summary.page_views, 1);
  assert.equal(report.summary.authenticated_users, 0);
});

test('one account across browsers and VPN countries counts once; unknown country preserves latest known', () => {
  const rows = [
    event(),
    event({ user_id: 'alice', event_name: 'session_started' }),
    event({ visitor_id: 'browser-two', session_id: 'session-two', user_id: 'alice', country: 'US', created_at: new Date(start + 2000).toISOString() }),
    event({ visitor_id: 'browser-two', session_id: 'session-two', country: 'XX', created_at: new Date(start + 3000).toISOString() }),
    event({ visitor_id: 'guest', session_id: 'guest-session', country: 'LT' }),
    event({ user_id: 'alice', event_name: 'cells_painted', event_value: 12 }),
    event({ user_id: 'alice', event_name: 'map_created', event_value: 1 }),
  ];
  const report = buildAnalyticsReport(rows, 'owner', 30, start + 10000);
  assert.equal(report.summary.unique_visitors, 2);
  assert.equal(report.summary.page_views, 4);
  assert.equal(report.summary.sessions, 3);
  assert.equal(report.summary.authenticated_users, 1);
  assert.equal(report.summary.cells_painted, 12);
  assert.deepEqual(report.countries, [{ country: 'US', visitors: 1, views: 3 }, { country: 'LT', visitors: 1, views: 1 }]);
  assert.equal(report.daily[0].visitors, 2);
  assert.equal(report.daily[0].painted, 12);
  assert.equal(report.daily[0].maps, 1);
});

test('analytics pagination includes events beyond the first thousand and uses the new reporting epoch', async () => {
  const ranges = [], filters = [];
  const client = { from(table) {
    assert.equal(table, 'analytics_events');
    const query = {
      select() { return query; }, gte(key, value) { filters.push([key, value]); return query; },
      contains(key, value) { assert.deepEqual(value, { analyticsVersion: ANALYTICS_VERSION }); return query; },
      order() { return query; }, range(first, last) { ranges.push([first, last]); return query; },
      abortSignal() { return Promise.resolve({ data: ranges.length === 1 ? Array.from({ length: 1000 }, () => event()) : [event({ visitor_id: 'last-visitor', session_id: 'last-session' })], error: null }); },
    }; return query;
  } };
  const report = await loadAnalyticsReport(client, 'owner', 30, new AbortController().signal);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.ok(Date.parse(filters[0][1]) >= start);
  assert.equal(report.summary.page_views, 1001);
  assert.equal(report.summary.unique_visitors, 2);
});
