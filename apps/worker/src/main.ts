import { loadAndValidateConfig } from "@atgt/config";
import { config as loadEnvironmentFile } from "dotenv";
import { resolve } from "path";
import { Pool } from "pg";
import { MapLifecycleJob } from "./map-lifecycle.job";
import { OutboxRelayJob } from "./outbox-relay.job";
import { RabbitMqEventPublisher } from "./rabbitmq-event.publisher";

function schedule(
  name: string,
  pollMs: number,
  operation: () => Promise<unknown>,
): void {
  void operation().catch(() => {
    console.error(`${name} initial run failed`);
  });
  setInterval(() => {
    void operation().catch(() => {
      console.error(`${name} tick failed`);
    });
  }, pollMs);
}

async function main() {
  loadEnvironmentFile({ path: resolve(__dirname, "../../../.env.local") });
  const runtime = loadAndValidateConfig();
  const mapEnabled =
    runtime.mapLifecycle.enabled && runtime.mapLifecycle.pollMs !== undefined;
  const relayEnabled =
    runtime.outboxRelay.enabled &&
    runtime.outboxRelay.pollMs !== undefined &&
    runtime.outboxRelay.batchSize !== undefined;
  if (!mapEnabled && !relayEnabled) {
    console.log("ATGT Worker started; all schedulers are disabled");
    await new Promise(() => undefined);
    return;
  }

  const pool = new Pool({ connectionString: runtime.database.url });
  if (mapEnabled) {
    const job = new MapLifecycleJob(pool);
    schedule("Map lifecycle", runtime.mapLifecycle.pollMs!, () =>
      job.runOnce(),
    );
  }
  if (relayEnabled) {
    const publisher = new RabbitMqEventPublisher(
      runtime.queue.endpoints,
      runtime.queue.vhost,
    );
    const relay = new OutboxRelayJob(
      pool,
      publisher,
      runtime.outboxRelay.batchSize!,
    );
    schedule("Outbox relay", runtime.outboxRelay.pollMs!, () =>
      relay.runOnce(),
    );
  }
  console.log(
    `ATGT Worker started; map=${String(mapEnabled)} relay=${String(relayEnabled)}`,
  );
}

void main();
