import { randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUuidV4(): string {
  const browserRandomUUID = globalThis.crypto?.randomUUID;
  if (browserRandomUUID) return browserRandomUUID.call(globalThis.crypto);
  return nodeRandomUUID();
}
