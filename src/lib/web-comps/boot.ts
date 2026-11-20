/**
 * One-shot boot guard. instrumentation.ts and a duplicate register() call
 * must not start two drip workers.
 */

let started = false;
let inflight: Promise<void> | null = null;

export function resetWebCompsBootForTests(): void {
  started = false;
  inflight = null;
}

export function webCompsBootStarted(): boolean {
  return started;
}

export async function startWebCompsOnBoot(start: () => Promise<void>): Promise<void> {
  if (started) return;
  if (!inflight) {
    inflight = start()
      .then(() => {
        started = true;
      })
      .finally(() => {
        inflight = null;
      });
  }
  await inflight;
}
