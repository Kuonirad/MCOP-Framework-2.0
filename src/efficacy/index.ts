// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Public surface of the pre-registered, multi-rater, held-out
 * efficacy program. See {@link runEfficacyProgram} for the entry point and
 * `docs/EFFICACY_PROGRAM.md` for the protocol and the threat model it defends.
 */

export * from './types';
export * from './statistics';
export * from './interRaterReliability';
export * from './isolationBarrier';
export * from './preRegistration';
export * from './efficacyProgram';
