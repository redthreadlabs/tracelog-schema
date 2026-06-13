'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MetaAccumulator,
  hourBucket,
  sidecarKey,
  SIDECAR_SUFFIX,
} = require('../dist/sidecar');

// epoch-µs for a UTC hour on 2026-06-15 (serialized timestamps are µs)
function tsAt(hour) {
  return Date.UTC(2026, 5, 15, hour) * 1000;
}
function jsonl(...objs) {
  return objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

test('sidecarKey appends the suffix', () => {
  assert.equal(sidecarKey('server/d/h.jsonl.gz'), 'server/d/h.jsonl.gz' + SIDECAR_SUFFIX);
});

test('hourBucket labels by UTC hour', () => {
  assert.equal(hourBucket(Date.UTC(2026, 5, 15, 9, 30)), '2026-06-15T09');
});

test('MetaAccumulator counts records, buckets by hour×kind, flags malformed', () => {
  const acc = new MetaAccumulator();
  acc.addChunk(
    jsonl(
      { metadata: { channel: 'server' } }, // not a record
      { transaction: { timestamp: tsAt(0) } },
      { span: { timestamp: tsAt(0) } },
      { span: { timestamp: tsAt(0) } },
      { error: { timestamp: tsAt(23) } },
      { event: {} }, // no timestamp -> malformed
      { transaction: { timestamp: 0 } }, // garbage -> malformed
    ),
  );
  acc.flushPartial();

  assert.equal(acc.records, 6);
  assert.equal(acc.malformed, 2);
  assert.deepEqual({ ...acc.intervals['2026-06-15T00'] }, { transaction: 1, span: 2 });
  assert.deepEqual({ ...acc.intervals['2026-06-15T23'] }, { error: 1 });

  let sum = 0;
  for (const h of Object.keys(acc.intervals))
    for (const k of Object.keys(acc.intervals[h])) sum += acc.intervals[h][k];
  assert.equal(acc.records, acc.malformed + sum, 'records === malformed + Σ intervals');
});

test('MetaAccumulator skips corrupt JSON lines', () => {
  const acc = new MetaAccumulator();
  acc.addChunk('{bad json\n');
  acc.addChunk(jsonl({ transaction: { timestamp: tsAt(1) } }));
  acc.flushPartial();
  assert.equal(acc.records, 1);
  assert.equal(acc.malformed, 0);
});

test('MetaAccumulator accumulates across incremental tail chunks', () => {
  const acc = new MetaAccumulator();
  const a = jsonl({ metadata: {} }, { transaction: { timestamp: tsAt(5) } });
  const b = jsonl({ span: { timestamp: tsAt(5) } });
  acc.addChunk(a);
  acc.offset = Buffer.byteLength(a);
  acc.addChunk(b);
  acc.offset += Buffer.byteLength(b);
  assert.equal(acc.records, 2);
  assert.deepEqual({ ...acc.intervals['2026-06-15T05'] }, { transaction: 1, span: 1 });
});

test('toMeta serializes deterministically (stable ETag)', () => {
  const a = new MetaAccumulator();
  a.addChunk(jsonl(
    { span: { timestamp: tsAt(3) } },
    { transaction: { timestamp: tsAt(1) } },
    { error: { timestamp: tsAt(1) } },
  ));
  a.flushPartial();
  const b = new MetaAccumulator();
  b.addChunk(jsonl(
    { error: { timestamp: tsAt(1) } },
    { transaction: { timestamp: tsAt(1) } },
    { span: { timestamp: tsAt(3) } },
  ));
  b.flushPartial();
  assert.equal(
    JSON.stringify(a.toMeta('2026-06-15', 100, 50)),
    JSON.stringify(b.toMeta('2026-06-15', 100, 50)),
    'identical content -> identical bytes regardless of arrival order',
  );
  const meta = a.toMeta('2026-06-15', 100, 50);
  assert.deepEqual(Object.keys(meta), ['v', 'interval', 'bytes', 'compressed', 'records', 'malformed', 'intervals']);
  assert.deepEqual(Object.keys(meta.intervals), ['2026-06-15T01', '2026-06-15T03']);
  assert.deepEqual(Object.keys(meta.intervals['2026-06-15T01']), ['error', 'transaction']);
});
