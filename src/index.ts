/*
 * Copyright Red Thread Labs LLC. All rights reserved.
 * Licensed under the BSD 2-Clause License.
 */

/**
 * @redthreadlabs/tracelog-schema — the shared contract for the tracelog suite:
 * record kinds, the S3 key layout, the metadata sidecar, the `/logs` wire
 * format, and the analytics context and event vocabulary. One dependency-free,
 * isomorphic source of truth, so the agent (writer), the client SDK, the
 * server, and the viewer (reader) never drift.
 */

export * from './kinds';
export * from './keys';
export * from './sidecar';
export * from './wire';
export * from './context';
export * from './analytics';
