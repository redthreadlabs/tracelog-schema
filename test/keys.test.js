'use strict';

// Runs against the compiled dist/ — `npm test` builds first via pretest.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKey,
  parseKey,
  intervalSpan,
  overlapsRange,
  dedupeCurrents,
  normalizeHost,
} = require('../dist/keys');

test('buildKey ↔ parseKey round-trip across the grammar', () => {
  const cases = [
    { channel: 'server', interval: '2026-06-11', host: '10.0.1.10' },
    { channel: 'server', interval: '2026-06-11', host: '10.0.1.10', seq: 2 },
    { channel: 'client', interval: '2026-06-11T13', host: 'web', current: true },
    { channel: 'server', interval: '2026-06-11', host: '10.0.1.10', seq: 3, current: true },
  ];
  for (const vars of cases) {
    const key = buildKey(vars, true);
    assert.ok(key.endsWith('.jsonl.gz'), 'gzip suffix');
    const p = parseKey(key);
    assert.ok(p, `parses ${key}`);
    assert.equal(p.channel, vars.channel);
    assert.equal(p.interval, vars.interval);
    assert.equal(p.host, vars.host);
    assert.equal(p.seq, vars.seq || 0);
    assert.equal(p.current, !!vars.current);
  }
});

test('buildKey omits seq 0 and the gz suffix by default', () => {
  assert.equal(
    buildKey({ channel: 'server', interval: '2026-06-11', host: 'h', seq: 0 }),
    'server/2026-06-11/h.jsonl',
  );
});

test('parseKey rejects sidecars and unknown grammar', () => {
  assert.equal(parseKey('server/2026-06-11/10.0.1.10.jsonl.gz.meta.json'), null);
  assert.equal(parseKey('server/2026-06-11/h.txt'), null);
  assert.equal(parseKey('too/few.jsonl'), null);
  assert.equal(parseKey('a/b/c_x_y.jsonl'), null); // unknown underscore grammar
});

test('intervalSpan handles daily and hourly, null otherwise', () => {
  assert.deepEqual(intervalSpan('2026-06-11'), [Date.UTC(2026, 5, 11), Date.UTC(2026, 5, 12)]);
  assert.deepEqual(intervalSpan('2026-06-11T05'), [
    Date.UTC(2026, 5, 11, 5),
    Date.UTC(2026, 5, 11, 6),
  ]);
  assert.equal(intervalSpan('weird'), null);
});

test('overlapsRange keeps unknown layouts, bounds known ones', () => {
  const day = Date.UTC(2026, 5, 11);
  assert.equal(overlapsRange({ interval: '2026-06-11' }, day, day + 1000), true);
  assert.equal(overlapsRange({ interval: '2026-06-11' }, day - 86_400_000 * 2, day - 86_400_000), false);
  assert.equal(overlapsRange({ interval: 'weird' }, 0, 1), true);
});

test('dedupeCurrents drops a current shadowed by its finalized sibling', () => {
  const files = [
    { channel: 'server', interval: '2026-06-11', host: 'h', seq: 0, current: false },
    { channel: 'server', interval: '2026-06-11', host: 'h', seq: 0, current: true }, // shadowed
    { channel: 'server', interval: '2026-06-12', host: 'h', seq: 0, current: true }, // live, kept
  ];
  const out = dedupeCurrents(files);
  assert.equal(out.length, 2);
  assert.ok(out.some((f) => f.interval === '2026-06-12' && f.current));
  assert.ok(!out.some((f) => f.interval === '2026-06-11' && f.current));
});

test('normalizeHost maps EC2 internal names to dotted IPs', () => {
  assert.equal(normalizeHost('ip-172-31-27-225.ec2.internal'), '172.31.27.225');
  assert.equal(normalizeHost('ip-10-0-0-1'), '10.0.0.1');
  assert.equal(normalizeHost('benjis-macbook.local'), 'benjis-macbook.local');
});
