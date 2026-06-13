/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

/**
 * The record kinds that appear as the single top-level key of every NDJSON
 * line tracelog writes: `{ "<kind>": { ...fields... } }`. `metadata` is the
 * once-per-file header line, not a data record, so it is not a RecordKind.
 */
export type RecordKind = 'transaction' | 'span' | 'error' | 'event' | 'metricset';

export const RECORD_KINDS: readonly RecordKind[] = [
  'transaction',
  'span',
  'error',
  'event',
  'metricset',
];

/** The header line's kind. Every file's first line is `{ "metadata": {...} }`. */
export const METADATA_KIND = 'metadata';
