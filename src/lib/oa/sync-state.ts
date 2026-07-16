/** Shared in-process locks for OA sync jobs (avoids circular imports). */

let catalogLock: Promise<unknown> | null = null;
let fullLock: Promise<unknown> | null = null;
let activeFullRunId: string | null = null;

export function getCatalogLock(): Promise<unknown> | null {
  return catalogLock;
}
export function setCatalogLock(p: Promise<unknown> | null): void {
  catalogLock = p;
}

export function getFullLock(): Promise<unknown> | null {
  return fullLock;
}
export function setFullLock(p: Promise<unknown> | null): void {
  fullLock = p;
}

export function isOaFullSyncRunning(): boolean {
  return Boolean(fullLock);
}

export function getActiveOaFullRunId(): string | null {
  return activeFullRunId;
}
export function setActiveOaFullRunId(id: string | null): void {
  activeFullRunId = id;
}
