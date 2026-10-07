# Changelog

## 0.7.0

- `link.out` joins `ANALYTICS_EVENT_TYPES`: a click on a link leaving the
  site, requiring `labels.href_host`.
- `page.view` no longer requires `context.visitor` or `context.visit`; no
  event type does. A browser without a persistent visitor id sends a record
  without one, and the server assigns visits. `sanitizeContext` still checks a
  `visitor` or `visit` that is present.
- `VisitorContext.id` is optional: `sanitizeContext` keeps a visitor with a
  valid `kind` and no `id` (`{kind: "human"}`). A visitor with an `id` is
  checked as before; an empty or non-string `id` drops it.
- `SCHEMA_VERSION` is `0.7.0`.

## 0.6.0

- `RecordContext` gains optional typed analytics sub-objects: `visitor`
  (`id`, `kind`), `visit` (`id`, `n`), `actor` (`agent`, `via`), `page`
  (`url`, `path`, `title`, `referrer`, `release`), `campaign` (UTM), `geo`,
  and `entity` (a flat string map). `labels` and `user` are unchanged.
- `RecordOrigin.schema`: the schema version a batch was written against;
  `SCHEMA_VERSION` exports it.
- `ANALYTICS_EVENT_TYPES`, `AnalyticsEventType`, `REQUIRED_CONTEXT`,
  `REQUIRED_FIELDS`, `isAnalyticsEventType`, `isAuditEventType`,
  `checkAnalyticsEvent`.
- `sanitizeContext`, `isVisitorKind`, `isVia`, `VISITOR_KINDS`, `VIAS`: the
  ingest filter for an untrusted context, for writers to share.
- `docs/ANALYTICS_CONTEXT.md`: the fields, their words ("session" retired for
  the inferred grouping, which is a visit), and what the viewer reads.
- README names the current wire types.
