/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

/**
 * The wire format for the `POST /logs` ingest endpoint: what a remote client
 * (browser, React Native) sends and what the server parses. The server maps
 * these into the on-disk record kinds (see kinds.ts). Defined here so the
 * client SDK, the server, and the viewer all share one definition.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogBatch {
  client: ClientInfo;
  user_id?: string;
  session_ref?: string;
  device_id?: string;
  events: LogEventItem[];
  perfs: LogPerfItem[];
}

export interface LogEventItem {
  /** Event category, e.g. 'auth', 'billing', 'startup'. Default: 'client-log' */
  type: string;
  /** Epoch milliseconds */
  timestamp: number;
  level: LogLevel;
  message: string;
  /** Duration in milliseconds (for timed events that aren't span-shaped) */
  duration?: number;
  /** Serialized error info. `code` is the structured error code. */
  error?: { message: string; type?: string; code?: string; stack?: string };
  /** Arbitrary key-value event data */
  params?: Record<string, JsonValue>;
  /**
   * Minutes east of UTC at the moment the event was recorded (ISO-8601 sign:
   * `localWallClock = UTC + tz_offset`). Captured per-event because buffered
   * clients can record across DST or travel and flush later. e.g. EST = -300,
   * IST = +330.
   */
  tz_offset?: number;
}

export interface LogPerfItem {
  /** 16-char hex ID, generated client-side */
  id: string;
  /** 32-char hex trace ID, shared by parent + children */
  trace_id: string;
  /** ID of the root perf in this trace */
  root_id: string;
  /** 16-char hex ID of parent perf (absent for root perfs) */
  parent_id?: string;
  /** Operation name, e.g. 'content-store-startup' */
  name: string;
  /** Perf category. Default: 'client-perf' */
  type: string;
  /** Start time, epoch milliseconds */
  timestamp: number;
  /** Duration in milliseconds */
  duration: number;
  outcome: 'success' | 'failure' | 'unknown';
  context?: {
    tags?: Record<string, JsonValue>;
  };
  /** Minutes east of UTC at record time (see LogEventItem.tz_offset). */
  tz_offset?: number;
}

export interface ClientInfo {
  /** Application name, e.g. 'duiduidui-app' */
  name: string;
  /** Application version */
  version: string;
  os: { name: string; version: string };
  device: { model?: string; brand?: string; type: string };
  runtime: { name: string; version: string };
  screen?: { width: number; height: number; pixel_ratio: number };
  locale?: string;
  /** IANA timezone name for the session, e.g. 'America/New_York'. */
  timezone?: string;
  device_year_class?: number;
}
