/**
 * Runs once when the standalone Node server starts (`node server.js`).
 * Edge runtime is skipped. The boot guard refuses a second worker.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebCompsOnBoot } = await import("@/lib/web-comps/boot");
    const { resumeWebCompsQueue } = await import("@/lib/web-comps/queue");
    await startWebCompsOnBoot(() => resumeWebCompsQueue());
  }
}
