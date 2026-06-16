/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

import { METADATA_KIND } from './kinds';

/**
 * The metadata sidecar: a tiny JSON object written alongside each log object
 * at `<logkey>.meta.json`, carrying the facts the gzipped body hides so a
 * reader needs no estimation. `bytes` is the uncompressed size; `intervals`
 * is an hourly UTC histogram of records by kind. The histogram matters
 * because buffered remote clients can land past-dated records in today's
 * file, so a file's nominal interval is a filing label, not a description of
 * its contents.
 *
 *   records === malformed + Σ(all interval/kind counts)
 */
export const SIDECAR_VERSION = 1;
export const SIDECAR_SUFFIX = '.meta.json';

export interface SidecarMeta {
  v: number;
  /** the file's default (nominal) interval, from its key */
  interval: string;
  /** uncompressed byte size */
  bytes: number;
  /** compressed (gzipped) object size */
  compressed: number;
  /** total records (metadata header line excluded) */
  records: number;
  /** records whose timestamp was missing/garbage (not placed in an interval) */
  malformed: number;
  /** hourly UTC histogram: { 'YYYY-MM-DDTHH': { kind: count } } */
  intervals: Record<string, Record<string, number>>;
}

/** The sidecar key for a log object key. */
export function sidecarKey(logKey: string): string {
  return logKey + SIDECAR_SUFFIX;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** epoch-ms → UTC hour-interval label 'YYYY-MM-DDTHH'. */
export function hourInterval(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}`
  );
}

/**
 * Derives a log file's sidecar histogram by parsing its NDJSON lines. The file
 * on disk is the source of truth: counts come from the exact bytes uploaded,
 * so they cannot drift from the object, and a restart (which wipes any
 * write-time counters) or an orphaned file is handled for free by re-deriving.
 *
 * Tolerant by design: an unparseable line is skipped (not a record); a record
 * with a missing/garbage timestamp is counted as `malformed` rather than
 * forced into an interval. Append-only safe: addChunk may be fed successive
 * tails of a growing current file, since every line is newline-terminated so
 * chunk/offset boundaries land between lines.
 */
export class MetaAccumulator {
  /** bytes consumed so far (for incremental current-file parsing) */
  offset = 0;
  records = 0;
  malformed = 0;
  intervals: Record<string, Record<string, number>> = Object.create(null);
  private partial = '';

  addChunk(text: string): void {
    if (!text) return;
    const s = this.partial + text;
    let start = 0;
    let nl;
    while ((nl = s.indexOf('\n', start)) !== -1) {
      this.addLine(s.slice(start, nl));
      start = nl + 1;
    }
    this.partial = s.slice(start);
  }

  flushPartial(): void {
    if (this.partial) {
      this.addLine(this.partial);
      this.partial = '';
    }
  }

  private addLine(line: string): void {
    const t = line.trim();
    if (!t) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(t);
    } catch {
      return; // corrupt line — not a countable record
    }
    if (!obj || typeof obj !== 'object') return;
    const kind = Object.keys(obj)[0];
    if (!kind || kind === METADATA_KIND) return;
    this.records++;
    const body = obj[kind] as { timestamp?: unknown } | undefined;
    const tsUs =
      body &&
      typeof body.timestamp === 'number' &&
      isFinite(body.timestamp) &&
      body.timestamp > 0
        ? body.timestamp
        : 0;
    if (!tsUs) {
      this.malformed++;
      return;
    }
    const interval = hourInterval(tsUs / 1000); // serialized timestamps are epoch-µs
    const byKind = this.intervals[interval] || (this.intervals[interval] = Object.create(null));
    byKind[kind] = (byKind[kind] || 0) + 1;
  }

  /**
   * The sidecar object for this file. Keys are emitted in a fixed, sorted
   * order at every level so identical contents serialize to byte-identical
   * JSON regardless of record arrival order — making a sidecar's ETag a
   * reliable sameness check.
   */
  toMeta(interval: string, bytes: number, compressed: number): SidecarMeta {
    const intervals: Record<string, Record<string, number>> = Object.create(null);
    for (const hour of Object.keys(this.intervals).sort()) {
      const src = this.intervals[hour];
      const sorted: Record<string, number> = Object.create(null);
      for (const kind of Object.keys(src).sort()) sorted[kind] = src[kind];
      intervals[hour] = sorted;
    }
    return {
      v: SIDECAR_VERSION,
      interval,
      bytes,
      compressed,
      records: this.records,
      malformed: this.malformed,
      intervals,
    };
  }
}
