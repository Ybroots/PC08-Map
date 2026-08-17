/**
 * Worker entry point - T00 stub
 *
 * Full workers added in subsequent tasks:
 * - T04: outbox relay worker
 * - T10: media/evidence worker
 * - T06: map expiry worker
 * - T08: SLA timer worker
 * - T15: notification worker
 */
import { loadAndValidateConfig } from "@atgt/config";
import { config as loadEnvironmentFile } from "dotenv";
import { resolve } from "path";
import { Pool } from "pg";
import { MapLifecycleJob } from "./map-lifecycle.job";

async function main() {
  loadEnvironmentFile({ path: resolve(__dirname, "../../../.env.local") });
  const runtime = loadAndValidateConfig();
  if (!runtime.mapLifecycle.enabled || !runtime.mapLifecycle.pollMs) {
    console.log("ATGT Worker started; map lifecycle scheduler is disabled");
    await new Promise(() => {});
    return;
  }
  const pool = new Pool({ connectionString: runtime.database.url });
  const job = new MapLifecycleJob(pool);
  await job.runOnce();
  setInterval(() => {
    void job.runOnce().catch((error: unknown) => {
      console.error(
        "Map lifecycle tick failed",
        error instanceof Error ? error.message : "unknown error",
      );
    });
  }, runtime.mapLifecycle.pollMs);
  console.log("ATGT Worker started; map lifecycle scheduler is enabled");
}

void main();
