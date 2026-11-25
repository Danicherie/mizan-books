export async function register() {
  // `next build` loads this file while NODE_ENV is production. That is not a running server.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.npm_lifecycle_event === "build") return;
  const { assertProductionSessionSecret } = await import("./lib/session-secret");
  assertProductionSessionSecret();
}
