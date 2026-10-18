import { cleanE2e } from "../../scripts/clean-e2e";

/** Remove the rows this run wrote (conversations tagged source = 'e2e'). Skipped against a deployed URL. */
export default async function globalTeardown() {
  if (process.env.E2E_BASE_URL) return;
  const n = await cleanE2e();
  console.log(`[e2e] cleaned up ${n} conversation(s)`);
}
