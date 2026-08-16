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

async function main() {
  loadEnvironmentFile({ path: resolve(__dirname, "../../../.env.local") });
  loadAndValidateConfig();
  console.log("ATGT Worker starting... (T00 stub, no jobs registered yet)");
  // Keep alive for now
  await new Promise(() => {});
}

void main();
