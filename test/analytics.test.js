'use strict';

// Runs against the compiled dist/ — `npm test` builds first via pretest.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYTICS_EVENT_TYPES,
  REQUIRED_CONTEXT,
  REQUIRED_FIELDS,
  isAnalyticsEventType,
  isAuditEventType,
  checkAnalyticsEvent,
} = require('../dist/index');

// One well-formed event per type.
const GOOD = {
  'page.view': {
    page: { url: 'https://app.example.com/p', path: '/p' },
    visit: { id: 'vis_1' },
    visitor: { id: 'v_1', kind: 'human' },
  },
  'page.leave': { labels: { dwell_ms: 4000, scroll_max: 0.8 } },
  'docs.view': {
    page: { url: 'https://docs.example.com/a', path: '/a', release: '0.170.0' },
    labels: { bytes: 5120, tokens: 1300 },
    entity: { docs_page: '/a' },
  },
  'docs.search': { labels: { query: 'patch', results: 0 } },
  'app.action': { labels: { name: 'run.click' } },
  'verb.call': {
    labels: { noun: 'run', verb: 'start', effect: 'write', outcome: 'success', ms: 42 },
    actor: { via: 'mcp' },
  },
  'auth.signin': { labels: { method: 'password' } },
  'auth.signup': { labels: { method: 'github' } },
  'auth.signout': { labels: { method: 'button' } },
  'error.client': {},
  'link.out': { labels: { href_host: 'github.com' } },
};

test('the vocabulary is the eleven documented types, all two dotted words', () => {
  assert.deepEqual([...ANALYTICS_EVENT_TYPES], [
    'page.view', 'page.leave', 'docs.view', 'docs.search', 'app.action',
    'verb.call', 'auth.signin', 'auth.signup', 'auth.signout', 'error.client', 'link.out',
  ]);
  for (const t of ANALYTICS_EVENT_TYPES) {
    assert.match(t, /^[a-z]+\.[a-z]+$/);
    assert.ok(Array.isArray(REQUIRED_CONTEXT[t]), `${t} has a REQUIRED_CONTEXT entry`);
  }
  assert.deepEqual(Object.keys(REQUIRED_CONTEXT).sort(), [...ANALYTICS_EVENT_TYPES].sort());
  assert.deepEqual(REQUIRED_FIELDS['error.client'], ['error']);
});

test('isAnalyticsEventType / isAuditEventType', () => {
  assert.equal(isAnalyticsEventType('page.view'), true);
  assert.equal(isAnalyticsEventType('page.views'), false);
  assert.equal(isAnalyticsEventType('audit.run.start'), false);
  assert.equal(isAuditEventType('audit.run.start'), true);
  assert.equal(isAuditEventType('audit.user_grant'), true);
  assert.equal(isAuditEventType('audit.'), false);
  assert.equal(isAuditEventType('audit. x'), false);
  assert.equal(isAuditEventType('auditx.y'), false);
  assert.equal(isAuditEventType(undefined), false);
});

test('checkAnalyticsEvent passes a well-formed event of every type', () => {
  for (const t of ANALYTICS_EVENT_TYPES) {
    const event = { type: t, context: GOOD[t] };
    if (t === 'error.client') event.error = { message: 'boom' };
    assert.deepEqual(checkAnalyticsEvent(event), [], t);
  }
});

test('checkAnalyticsEvent names each missing context path', () => {
  assert.deepEqual(checkAnalyticsEvent({ type: 'page.view' }), [
    'page.view: missing context.page',
  ]);
  assert.deepEqual(
    checkAnalyticsEvent({ type: 'link.out', context: { labels: {} } }),
    ['link.out: missing context.labels.href_host'],
  );
  assert.deepEqual(
    checkAnalyticsEvent({ type: 'docs.view', context: { ...GOOD['docs.view'], labels: { bytes: 1 }, entity: {} } }),
    ['docs.view: missing context.labels.tokens', 'docs.view: missing context.entity.docs_page'],
  );
  assert.deepEqual(
    checkAnalyticsEvent({ type: 'verb.call', context: { labels: GOOD['verb.call'].labels, actor: {} } }),
    ['verb.call: missing context.actor.via'],
  );
  assert.deepEqual(
    checkAnalyticsEvent({ type: 'app.action', context: { labels: { name: '' } } }),
    ['app.action: missing context.labels.name'],
    'an empty string is missing',
  );
});

test('a zero or false label counts as present', () => {
  assert.deepEqual(checkAnalyticsEvent({ type: 'docs.search', context: { labels: { query: 'q', results: 0 } } }), []);
  assert.deepEqual(checkAnalyticsEvent({ type: 'page.leave', context: { labels: { dwell_ms: 0, scroll_max: 0 } } }), []);
});

test('a browser event without a visitor or a visit is valid', () => {
  const { visitor, visit, ...cookieless } = GOOD['page.view'];
  assert.deepEqual(checkAnalyticsEvent({ type: 'page.view', context: cookieless }), []);
  assert.deepEqual(checkAnalyticsEvent({ type: 'page.view', context: { ...cookieless, visitor: { kind: 'human' } } }), []);
  for (const t of ['page.leave', 'docs.view', 'app.action', 'link.out']) {
    assert.ok(!REQUIRED_CONTEXT[t].some((p) => p.startsWith('visit')), t);
    assert.deepEqual(checkAnalyticsEvent({ type: t, context: GOOD[t] }), [], t);
  }
  assert.deepEqual(checkAnalyticsEvent({ type: 'error.client', error: { message: 'boom' } }), []);
});

test('error.client requires the event error field', () => {
  assert.deepEqual(checkAnalyticsEvent({ type: 'error.client' }), ['error.client: missing error']);
});

test('audit events pass on name alone; unknown types are reported', () => {
  assert.deepEqual(checkAnalyticsEvent({ type: 'audit.protocol.publish' }), []);
  assert.deepEqual(checkAnalyticsEvent({ type: 'client-log' }), ['unknown event type "client-log"']);
  assert.deepEqual(checkAnalyticsEvent({}), ['unknown event type undefined']);
});
