# @redthreadlabs/tracelog-schema

The shared **contract** for the tracelog suite — one dependency-free, isomorphic
source of truth so the agent (writer), the client SDK, the server, and the
viewer (reader) never drift.

It contains only the contract: types and pure functions, no I/O.

- **Record kinds** (`kinds.ts`) — the top-level kinds of each NDJSON line
  (`transaction`, `span`, `error`, `event`, `metricset`).
- **S3 key layout** (`keys.ts`) — `buildKey` / `parseKey` (exact inverses) plus
  `intervalSpan`, `overlapsRange`, `dedupeCurrents`, `normalizeHost`. The layout
  `{channel}/{interval}/{host}[_{seq}][_current].jsonl[.gz]` is fixed.
- **Metadata sidecar** (`sidecar.ts`) — the `SidecarMeta` shape written at
  `<logkey>.meta.json`, plus the `MetaAccumulator` that derives it from a file's
  bytes (uncompressed size, record count, and an hourly interval×kind histogram).
- **Wire format** (`wire.ts`) — the `POST /logs` ingest types: the
  `RecordBatch` envelope, the records it carries (`EventRecord`,
  `TransactionRecord`, `SpanRecord`), their shared `RecordContext`, and the
  `RecordOrigin` a `metadata` record carries. `SCHEMA_VERSION` is the value a
  writer puts in `origin.schema`.
- **Analytics context** (`wire.ts`, `context.ts`) — the typed `RecordContext`
  sub-objects `visitor`, `visit`, `actor`, `page`, `campaign`, `geo`, `entity`,
  and `sanitizeContext`, the one ingest filter for an untrusted context, with
  `isVisitorKind` / `isVia`.
- **Analytics events** (`analytics.ts`) — `ANALYTICS_EVENT_TYPES`,
  `REQUIRED_CONTEXT` per type, `isAuditEventType` for the open `audit.<action>`
  family, and `checkAnalyticsEvent`.

See [docs/ANALYTICS_CONTEXT.md](docs/ANALYTICS_CONTEXT.md) for the analytics
fields, their words, and what the viewer reads.

## Usage

```ts
import {
  parseKey,
  MetaAccumulator,
  RECORD_KINDS,
  sanitizeContext,
  checkAnalyticsEvent,
  type EventRecord,
  type RecordBatch,
} from '@redthreadlabs/tracelog-schema';
```

## Build / test

Plain `tsc` to CommonJS `dist/`; tests run against the compiled output.

```
npm run build
npm test
```
