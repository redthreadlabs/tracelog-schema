/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

/**
 * The S3 key layout — the contract between the writer (the tracelog agent)
 * and any reader (the viewer). It is FIXED, not configurable:
 *
 *   {channel}/{interval}/{host}[_{seq}][_current].jsonl[.gz]
 *
 *   server/2026-06-11/172.31.27.225.jsonl.gz
 *   server/2026-06-11/172.31.27.225_current.jsonl.gz
 *   server/2026-06-11/172.31.27.225_1.jsonl.gz
 *
 * Channel comes before interval so prefix-scoped lifecycle rules work and a
 * date-range scan within a channel is one lexicographically-ordered listing.
 * The basename is underscore-delimited (hostnames cannot contain underscores):
 * host, then a numeric size-rotation seq when > 0, then the literal 'current'
 * for the live snapshot. `buildKey` and `parseKey` are exact inverses so the
 * agent and viewer never drift on this layout.
 */

export interface KeyVars {
  channel: string;
  interval: string;
  host: string;
  /** size-rotation sequence within the interval; 0 (or omitted) = first file */
  seq?: number;
  /** the live, still-being-written snapshot */
  current?: boolean;
}

export interface ParsedKey {
  key: string;
  channel: string;
  interval: string;
  host: string;
  seq: number;
  current: boolean;
  /** compressed object size in bytes, from the listing (0 if unknown) */
  size: number;
  lastModified?: Date;
  etag?: string;
}

/** Build a log object's key. Pass `gzip` to append the `.gz` suffix. */
export function buildKey(vars: KeyVars, gzip = false): string {
  let basename = vars.host;
  if (vars.seq && vars.seq > 0) basename += `_${vars.seq}`;
  if (vars.current) basename += '_current';
  return `${vars.channel}/${vars.interval}/${basename}.jsonl${gzip ? '.gz' : ''}`;
}

/**
 * Parse a log object's key back into its parts, or null if it is not a log
 * file in the known grammar (e.g. a sidecar `.meta.json`, or anything else).
 */
export function parseKey(
  key: string,
  size = 0,
  lastModified?: Date,
  etag?: string,
): ParsedKey | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;
  const [channel, interval, file] = parts;
  if (!channel || !interval || !file) return null;

  let base = file;
  if (base.endsWith('.gz')) base = base.slice(0, -3);
  if (!base.endsWith('.jsonl')) return null;
  base = base.slice(0, -'.jsonl'.length);

  const segments = base.split('_');
  const host = segments[0];
  if (!host) return null;

  let seq = 0;
  let current = false;
  let rest = segments.slice(1);
  if (rest[rest.length - 1] === 'current') {
    current = true;
    rest = rest.slice(0, -1);
  }
  if (rest.length === 1 && /^\d+$/.test(rest[0])) {
    seq = parseInt(rest[0], 10);
  } else if (rest.length > 0) {
    return null; // not the grammar we know — ignore, don't fail
  }

  return { key, channel, interval, host, seq, current, size, lastModified, etag };
}

/**
 * The UTC time span an interval label covers: daily `YYYY-MM-DD` → 24 h,
 * hourly `YYYY-MM-DDTHH` → 1 h. Unknown grammar → null (callers should be
 * conservative and keep the file).
 */
export function intervalSpan(interval: string): [number, number] | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(interval);
  if (m) {
    const t0 = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return [t0, t0 + 86_400_000];
  }
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(interval);
  if (m) {
    const t0 = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
    return [t0, t0 + 3_600_000];
  }
  return null;
}

/** Whether a file's interval overlaps [startMs, endMs]. Unknown layout → kept. */
export function overlapsRange(
  file: Pick<ParsedKey, 'interval'>,
  startMs: number,
  endMs: number,
): boolean {
  const span = intervalSpan(file.interval);
  if (!span) return true;
  return span[0] <= endMs && span[1] > startMs;
}

/**
 * Drop `_current` snapshots shadowed by their finalized file: if the finalized
 * key exists, ignore the (briefly surviving) `_current`. A `_current` with no
 * finalized sibling is kept — it is either live (today) or a dead host's only
 * copy.
 */
export function dedupeCurrents<T extends Pick<ParsedKey, 'channel' | 'interval' | 'host' | 'seq' | 'current'>>(
  files: T[],
): T[] {
  const finalized = new Set<string>();
  for (const f of files) {
    if (!f.current) finalized.add(`${f.channel}/${f.interval}/${f.host}/${f.seq}`);
  }
  return files.filter(
    (f) => !f.current || !finalized.has(`${f.channel}/${f.interval}/${f.host}/${f.seq}`),
  );
}

/**
 * Normalize a hostname into the host label used in keys. EC2 internal
 * hostnames (`ip-A-B-C-D[.…]`) become the dotted IP — which avoids embedding
 * hyphens in the basename; any other hostname is used as-is.
 */
export function normalizeHost(hostname: string): string {
  const m = /^ip-(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})(\..*)?$/.exec(hostname);
  if (m) {
    return `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  }
  return hostname;
}
