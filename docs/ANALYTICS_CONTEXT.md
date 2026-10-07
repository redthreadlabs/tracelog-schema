# Analytics context

Since 0.6.0, `RecordContext` carries typed sub-objects for behaviour
analytics beside `labels` and `user`. They are optional on every record kind
(event, transaction, span). A reader that does not know a sub-object ignores
it. The types are in `src/wire.ts`; `sanitizeContext` (`src/context.ts`) is the
one ingest filter; the event vocabulary is in `src/analytics.ts`.

## The fields

```ts
interface RecordContext {
  labels?:   Record<string, JsonValue>;   // unchanged: the flat bag
  user?:     { id?: string };             // unchanged
  visitor?:  { id: string; kind: "human" | "agent" | "system" };
  visit?:    { id: string; n?: number };
  actor?:    { agent?: { name: string; version?: string };
               via: "browser" | "fetch" | "cli" | "mcp" | "thread" | "edge" | "server" };
  page?:     { url: string; path: string; title?: string; referrer?: string; release?: string };
  campaign?: { source?: string; medium?: string; name?: string; term?: string; content?: string };
  geo?:      { country?: string; region?: string; city?: string };
  entity?:   Record<string, string>;
}
```

| field | meaning |
|---|---|
| `visitor` | The long-lived first-party identity behind the record: one id per person (or per agent credential), signed in or not. `kind` says whether it is a person, an agent, or the system. |
| `visit` | One visit by a visitor: a client-generated id, carried explicitly (a new id after 30 minutes without an event, or on a new tab). `n` is the visitor's visit ordinal, when known. |
| `actor` | What acted. `via` is the surface the record came through; `agent` names the client software (`claude-code 2.1.280`, `mechbench-cli 0.51.0`) when there is one. |
| `page` | The page the record is about. `release` is the documentation release shown on the page, when it has one. |
| `campaign` | The UTM parameters of the visitor's first touch. |
| `geo` | Location derived server-side from the source IP. The IP is not kept in the analytics fields. |
| `entity` | The consumer's own things the record concerns, by id or address: `{"project": "proj_…", "docs_page": "/reference/…"}`. One level, strings only. The key vocabulary belongs to the consumer, not to tracelog. |

The batch's origin carries `schema` (`RecordOrigin.schema`, e.g. `"0.6.0"`,
exported as `SCHEMA_VERSION`), so a reader knows which fields to expect.

`sanitizeContext(ctx)` keeps the sub-objects with their typed fields, primitive
values in `labels`, strings in `entity`, and `user.id`; it drops everything
else, including a sub-object that lacks a required field (a `visitor` without
a valid `kind`, an `actor` without a valid `via`, a `page` without `url` and
`path`). It does not bound string lengths; the writer's truncation does.

## Event types

Analytics event `type`s are two dotted words from `ANALYTICS_EVENT_TYPES`:
`page.view`, `page.leave`, `docs.view`, `docs.search`, `app.action`,
`verb.call`, `auth.signin`, `auth.signup`, `auth.signout`, `error.client`,
`link.out` (a click on a link leaving the site; `labels.href_host`). The
`audit.<action>` family is open-ended (`isAuditEventType`). `REQUIRED_CONTEXT`
lists the context each type must carry, as dotted paths under `context`;
`REQUIRED_FIELDS` lists event fields outside it (`error.client` needs
`error`). No type requires `visitor`: a browser without a persistent visitor
id sends none, and a `visitor`, when present, is checked as above.
`checkAnalyticsEvent(event)` returns one message per missing path or
an unknown type, and an empty array for a well-formed event.

Events stay instants. Timings are transactions and spans (`page-load`,
`route-change`), never an event with a duration.

## The words

One concept, one word, in every layer (the tracelog naming conventions):

| word | concept | not |
|---|---|---|
| **visitor** | the person or agent behind records, over time | user (that is the signed-in account, `context.user`), device (the installation, `origin.device`) |
| **visit** | one bounded stretch of a visitor's activity | **session** |
| **actor** | what acted on this record | client, agent (as the field name) |
| **via** | the surface an actor came through | channel (a storage namespace), source |
| **entity** | a consumer thing the record concerns, by id or address | object, resource, target |
| **campaign** | the first-touch UTM parameters | utm, source |
| **labels** | the flat attribute bag, unchanged | tags, params |

"Session" is retired as the word for the inferred grouping of a visitor's
records: it is a visit. (Consumers commonly use "session" for a login, which
is one more reason not to overload it.)

## For the viewer

Group a client's records into visits by `context.visit.id` when records carry
it, and fall back to the existing inference (a new visit after a 15-minute gap
between records) only for records without one. Name the result a visit, key
a visitor by `context.visitor.id` when present (else the origin's
`device.id`), and treat the other sub-objects as dimensions to filter and
group by: `actor.via`, `visitor.kind`, `page.path`, `page.release`, and each
`entity` key. Anything the viewer does not know it ignores.
