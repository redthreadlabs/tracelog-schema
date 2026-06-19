/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

/**
 * The DATA record kinds — the single top-level key of a data NDJSON line:
 * `{ "<kind>": { ...fields... } }`. These are what the sidecar histogram counts.
 * `metadata` is deliberately NOT here: it's a dimension/context record, not data
 * (see {@link METADATA_KIND}).
 */
export type RecordKind = 'transaction' | 'span' | 'error' | 'event' | 'metricset';

export const RECORD_KINDS: readonly RecordKind[] = [
  'transaction',
  'span',
  'error',
  'event',
  'metricset',
];

/**
 * The `metadata` line's kind: `{ "metadata": <RecordOrigin> }` — it carries a
 * RecordOrigin (service + environment), not data. It appears in two scopes:
 *   - the per-file header (file-scoped — the writer's origin), and
 *   - in-stream (lifetime-scoped — a client's per-launch origin, keyed by
 *     `lifetime_id`), which records join to.
 * Excluded from RECORD_KINDS and the sidecar histogram (it isn't a data record).
 */
export const METADATA_KIND = 'metadata';
