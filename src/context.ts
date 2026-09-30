/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

import {
  VIAS,
  VISITOR_KINDS,
  type ActorContext,
  type CampaignContext,
  type GeoContext,
  type PageContext,
  type RecordContext,
  type Via,
  type VisitContext,
  type VisitorContext,
  type VisitorKind,
} from './wire';

export function isVisitorKind(value: unknown): value is VisitorKind {
  return typeof value === 'string' && (VISITOR_KINDS as readonly string[]).includes(value);
}

export function isVia(value: unknown): value is Via {
  return typeof value === 'string' && (VIAS as readonly string[]).includes(value);
}

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function nonEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

/** Copy the named keys whose values are strings; undefined when none are. */
function pickStrings<K extends string>(input: Bag, keys: readonly K[]): Partial<Record<K, string>> | undefined {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const v = input[k];
    if (isString(v)) out[k] = v;
  }
  return nonEmpty(out);
}

function sanitizeLabels(input: unknown): Record<string, string | number | boolean> | undefined {
  if (!isBag(input)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isString(v) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
      out[k] = v;
    }
  }
  return nonEmpty(out);
}

function sanitizeVisitor(input: unknown): VisitorContext | undefined {
  if (!isBag(input) || !isString(input.id) || !input.id || !isVisitorKind(input.kind)) return undefined;
  return { id: input.id, kind: input.kind };
}

function sanitizeVisit(input: unknown): VisitContext | undefined {
  if (!isBag(input) || !isString(input.id) || !input.id) return undefined;
  const visit: VisitContext = { id: input.id };
  if (typeof input.n === 'number' && Number.isFinite(input.n)) visit.n = input.n;
  return visit;
}

function sanitizeActor(input: unknown): ActorContext | undefined {
  if (!isBag(input) || !isVia(input.via)) return undefined;
  const actor: ActorContext = { via: input.via };
  if (isBag(input.agent) && isString(input.agent.name) && input.agent.name) {
    actor.agent = { name: input.agent.name };
    if (isString(input.agent.version)) actor.agent.version = input.agent.version;
  }
  return actor;
}

function sanitizePage(input: unknown): PageContext | undefined {
  if (!isBag(input) || !isString(input.url) || !isString(input.path)) return undefined;
  const page: PageContext = { url: input.url, path: input.path };
  for (const k of ['title', 'referrer', 'release'] as const) {
    const v = input[k];
    if (isString(v)) page[k] = v;
  }
  return page;
}

function sanitizeEntity(input: unknown): Record<string, string> | undefined {
  if (!isBag(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isString(v)) out[k] = v;
  }
  return nonEmpty(out);
}

const CAMPAIGN_KEYS = ['source', 'medium', 'name', 'term', 'content'] as const;
const GEO_KEYS = ['country', 'region', 'city'] as const;

/**
 * Keep only the known, well-shaped parts of an untrusted record context: the
 * typed sub-objects with their typed fields, primitive values in `labels`,
 * strings in `entity`, and `user.id`. Anything else is dropped, including a
 * sub-object missing a required field (a `visitor` without a valid `kind`, an
 * `actor` without a valid `via`, a `page` without `url` and `path`). Returns
 * undefined when nothing survives. Pure; does not bound string lengths.
 */
export function sanitizeContext(input: unknown): RecordContext | undefined {
  if (!isBag(input)) return undefined;
  const ctx: RecordContext = {};

  const labels = sanitizeLabels(input.labels);
  if (labels) ctx.labels = labels;

  if (isBag(input.user) && isString(input.user.id)) ctx.user = { id: input.user.id };

  const visitor = sanitizeVisitor(input.visitor);
  if (visitor) ctx.visitor = visitor;

  const visit = sanitizeVisit(input.visit);
  if (visit) ctx.visit = visit;

  const actor = sanitizeActor(input.actor);
  if (actor) ctx.actor = actor;

  const page = sanitizePage(input.page);
  if (page) ctx.page = page;

  const campaign: CampaignContext | undefined = isBag(input.campaign) ? pickStrings(input.campaign, CAMPAIGN_KEYS) : undefined;
  if (campaign) ctx.campaign = campaign;

  const geo: GeoContext | undefined = isBag(input.geo) ? pickStrings(input.geo, GEO_KEYS) : undefined;
  if (geo) ctx.geo = geo;

  const entity = sanitizeEntity(input.entity);
  if (entity) ctx.entity = entity;

  return nonEmpty(ctx);
}
