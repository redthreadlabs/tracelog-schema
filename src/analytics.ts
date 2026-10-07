/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

import type { EventRecord } from './wire';

/**
 * The closed vocabulary of analytics event types: two dotted words each. The
 * `audit.<action>` family is open-ended and checked by {@link isAuditEventType}.
 */
export const ANALYTICS_EVENT_TYPES = [
  'page.view',
  'page.leave',
  'docs.view',
  'docs.search',
  'app.action',
  'verb.call',
  'auth.signin',
  'auth.signup',
  'auth.signout',
  'error.client',
  'link.out',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export type AuditEventType = `audit.${string}`;

export function isAnalyticsEventType(type: unknown): type is AnalyticsEventType {
  return typeof type === 'string' && (ANALYTICS_EVENT_TYPES as readonly string[]).includes(type);
}

const AUDIT_TYPE = /^audit\.\S+$/;

export function isAuditEventType(type: unknown): type is AuditEventType {
  return typeof type === 'string' && AUDIT_TYPE.test(type);
}

/**
 * The context each analytics event type must carry, as dotted paths under the
 * event's `context` (`"page"` = the sub-object is present, `"labels.bytes"` =
 * that label is present). `audit.<action>` events require nothing beyond their
 * name. No type requires `visitor` or `visit`: a browser without a persistent
 * visitor id sends none, and the server assigns visits.
 */
export const REQUIRED_CONTEXT: { readonly [T in AnalyticsEventType]: readonly string[] } = {
  'page.view': ['page'],
  'page.leave': ['labels.dwell_ms', 'labels.scroll_max'],
  'docs.view': ['page.path', 'page.release', 'labels.bytes', 'labels.tokens', 'entity.docs_page'],
  'docs.search': ['labels.query', 'labels.results'],
  'app.action': ['labels.name'],
  'verb.call': ['labels.noun', 'labels.verb', 'labels.effect', 'labels.outcome', 'labels.ms', 'actor.via'],
  'auth.signin': ['labels.method'],
  'auth.signup': ['labels.method'],
  'auth.signout': ['labels.method'],
  'error.client': [],
  'link.out': ['labels.href_host'],
};

/**
 * Event fields outside `context` that a type requires, as dotted paths on the
 * event itself.
 */
export const REQUIRED_FIELDS: { readonly [T in AnalyticsEventType]?: readonly string[] } = {
  'error.client': ['error'],
};

function present(root: unknown, path: string): boolean {
  let node: unknown = root;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return node !== undefined && node !== null && node !== '';
}

/**
 * Check an event against the analytics vocabulary: its type must be one of
 * {@link ANALYTICS_EVENT_TYPES} or an `audit.<action>`, and it must carry that
 * type's {@link REQUIRED_CONTEXT} and {@link REQUIRED_FIELDS}. Returns one
 * message per problem; an empty array means the event is well-formed. Checks
 * presence only; the shapes are {@link sanitizeContext}'s job.
 */
export function checkAnalyticsEvent(event: Pick<EventRecord, 'type' | 'context' | 'error'>): string[] {
  const type: unknown = event?.type;
  if (isAuditEventType(type)) return [];
  if (!isAnalyticsEventType(type)) return [`unknown event type ${JSON.stringify(type)}`];

  const problems: string[] = [];
  for (const path of REQUIRED_CONTEXT[type]) {
    if (!present(event.context, path)) problems.push(`${type}: missing context.${path}`);
  }
  for (const path of REQUIRED_FIELDS[type] ?? []) {
    if (!present(event, path)) problems.push(`${type}: missing ${path}`);
  }
  return problems;
}
