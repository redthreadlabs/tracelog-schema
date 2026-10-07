'use strict';

// Runs against the compiled dist/ — `npm test` builds first via pretest.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isVisitorKind, isVia, sanitizeContext, SCHEMA_VERSION, VIAS, VISITOR_KINDS } = require('../dist/index');
const pkg = require('../package.json');

const FULL = {
  labels: { dwell_ms: 5200, ok: true, name: 'run.click' },
  user: { id: 'u_1' },
  visitor: { id: 'v_abc', kind: 'human' },
  visit: { id: 'vis_1', n: 3 },
  actor: { agent: { name: 'claude-code', version: '2.1.280' }, via: 'mcp' },
  page: {
    url: 'https://docs.example.com/reference/ops?x=1',
    path: '/reference/ops',
    title: 'Ops',
    referrer: 'https://www.google.com/',
    release: '0.170.0',
  },
  campaign: { source: 'hn', medium: 'social', name: 'launch', term: 'interp', content: 'top' },
  geo: { country: 'US', region: 'OR', city: 'Portland' },
  entity: { project: 'proj_1', docs_page: '/reference/ops' },
};

test('SCHEMA_VERSION is the package version', () => {
  assert.equal(SCHEMA_VERSION, pkg.version);
});

test('isVisitorKind / isVia accept exactly their vocabularies', () => {
  for (const k of VISITOR_KINDS) assert.equal(isVisitorKind(k), true);
  for (const v of VIAS) assert.equal(isVia(v), true);
  assert.deepEqual([...VISITOR_KINDS], ['human', 'agent', 'system']);
  assert.deepEqual([...VIAS], ['browser', 'fetch', 'cli', 'mcp', 'thread', 'edge', 'server']);
  for (const bad of ['Human', 'bot', '', null, undefined, 1, {}]) {
    assert.equal(isVisitorKind(bad), false);
    assert.equal(isVia(bad), false);
  }
});

test('sanitizeContext keeps every well-shaped field unchanged', () => {
  assert.deepEqual(sanitizeContext(FULL), FULL);
  assert.deepEqual(sanitizeContext(JSON.parse(JSON.stringify(FULL))), FULL);
});

test('sanitizeContext drops unknown keys at every level', () => {
  const input = {
    ...FULL,
    tags: { a: 1 },
    params: { b: 2 },
    user: { id: 'u_1', email: 'x@y.z', username: 'x' },
    visitor: { ...FULL.visitor, extra: 1 },
    visit: { ...FULL.visit, extra: 1 },
    actor: { ...FULL.actor, agent: { ...FULL.actor.agent, extra: 1 }, extra: 1 },
    page: { ...FULL.page, extra: 1 },
    campaign: { ...FULL.campaign, gclid: 'x' },
    geo: { ...FULL.geo, lat: 45.5 },
  };
  assert.deepEqual(sanitizeContext(input), FULL);
});

test('labels keep primitives only; entity keeps strings only', () => {
  const out = sanitizeContext({
    labels: { s: 'a', n: 1, b: false, z: null, o: { x: 1 }, a: [1], inf: Infinity, nan: NaN },
    entity: { project: 'proj_1', n: 2, o: {}, nil: null },
  });
  assert.deepEqual(out, { labels: { s: 'a', n: 1, b: false }, entity: { project: 'proj_1' } });
});

test('a visitor without an id keeps its kind', () => {
  assert.deepEqual(sanitizeContext({ visitor: { kind: 'human' } }), { visitor: { kind: 'human' } });
  assert.deepEqual(sanitizeContext({ visitor: { kind: 'agent', extra: 1 } }), { visitor: { kind: 'agent' } });
  assert.equal(sanitizeContext({ visitor: {} }), undefined, 'no kind and no id');
});

test('a sub-object missing a required field is dropped whole', () => {
  assert.equal(sanitizeContext({ visitor: { id: 'v' } }), undefined, 'visitor without kind');
  assert.equal(sanitizeContext({ visitor: { id: 'v', kind: 'robot' } }), undefined, 'visitor with a bad kind');
  assert.equal(sanitizeContext({ visitor: { id: '', kind: 'human' } }), undefined, 'visitor with an empty id');
  assert.equal(sanitizeContext({ visitor: { id: 7, kind: 'human' } }), undefined, 'visitor with a non-string id');
  assert.equal(sanitizeContext({ visitor: { id: null, kind: 'human' } }), undefined, 'visitor with a null id');
  assert.equal(sanitizeContext({ visit: { n: 1 } }), undefined, 'visit without id');
  assert.equal(sanitizeContext({ actor: { agent: { name: 'x' } } }), undefined, 'actor without via');
  assert.equal(sanitizeContext({ actor: { via: 'telepathy' } }), undefined, 'actor with a bad via');
  assert.equal(sanitizeContext({ page: { url: 'https://x' } }), undefined, 'page without path');
  assert.equal(sanitizeContext({ page: { path: '/x' } }), undefined, 'page without url');
});

test('optional parts of a kept sub-object are dropped when malformed', () => {
  assert.deepEqual(sanitizeContext({ visit: { id: 'v', n: '3' } }), { visit: { id: 'v' } });
  assert.deepEqual(sanitizeContext({ actor: { via: 'cli', agent: { version: '1' } } }), { actor: { via: 'cli' } });
  assert.deepEqual(
    sanitizeContext({ actor: { via: 'cli', agent: { name: 'mb', version: 1 } } }),
    { actor: { via: 'cli', agent: { name: 'mb' } } },
  );
  assert.deepEqual(
    sanitizeContext({ page: { url: 'u', path: '/p', title: 7, release: '1.0' } }),
    { page: { url: 'u', path: '/p', release: '1.0' } },
  );
  assert.equal(sanitizeContext({ campaign: { source: 1 }, geo: { country: null } }), undefined);
});

test('non-objects and empty contexts give undefined', () => {
  for (const bad of [undefined, null, 'x', 1, [], {}, { labels: {} }, { user: {} }, { entity: [] }]) {
    assert.equal(sanitizeContext(bad), undefined, JSON.stringify(bad));
  }
});
