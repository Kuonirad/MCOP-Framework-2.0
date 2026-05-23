/**
 * MCOP cluster mode — v3.0 roadmap surface.
 *
 * See `docs/DISTRIBUTED_CLUSTER_MODE.md` for the architectural
 * narrative and the `docs/HOSTED_PROVENANCE_LEDGER.md` for the
 * hosted-ledger integration story.
 */

export * from './types';
export * from './clusterStigmergy';
export * from './clusterOrchestrator';
export * from './inMemoryGossipBus';
export * from './redisStreamsGossipTransport';
