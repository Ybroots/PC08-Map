import { loadAndValidateConfig } from "@atgt/config";
import { config as loadEnvironmentFile } from "dotenv";
import { resolve } from "path";
import { Pool } from "pg";
import { EvidenceConsumerJob } from "./evidence/evidence-consumer.job";
import { EvidenceMediaProcessor } from "./evidence/evidence-media.processor";
import { FakeAntivirusAdapter } from "./evidence/fake-antivirus.adapter";
import { PostgresEvidenceWorkCoordinator } from "./evidence/postgres-evidence-work-coordinator";
import { RabbitMqEvidenceQueueAdapter } from "./evidence/rabbitmq-evidence-queue.adapter";
import { S3EvidenceMediaStorageAdapter } from "./evidence/s3-evidence-media-storage.adapter";
import { SharpEvidenceDerivativeAdapter } from "./evidence/sharp-evidence-derivative.adapter";
import { MapLifecycleJob } from "./map-lifecycle.job";
import { OutboxRelayJob } from "./outbox-relay.job";
import { RabbitMqEventPublisher } from "./rabbitmq-event.publisher";
import { PostgresReportScreeningCoordinator } from "./reports/postgres-report-screening-coordinator";
import { RabbitMqReportScreeningQueueAdapter } from "./reports/rabbitmq-report-screening-queue.adapter";
import { ReportScreeningJob } from "./reports/report-screening.job";

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
  const evidenceEnabled =
    runtime.evidence.enabled &&
    runtime.evidence.workerPollMs !== undefined &&
    runtime.evidence.workerBatchSize !== undefined &&
    runtime.evidence.maxBytes !== undefined &&
    runtime.evidence.useFakeAntivirus &&
    runtime.storage.region !== undefined &&
    runtime.storage.accessKey !== undefined &&
    runtime.storage.secretKey !== undefined;
  const reportScreeningEnabled =
    runtime.reportScreening.enabled &&
    runtime.reportScreening.pollMs !== undefined &&
    runtime.reportScreening.batchSize !== undefined &&
    runtime.reportScreening.maxCandidatesPerReport !== undefined;
  if (
    !mapEnabled &&
    !relayEnabled &&
    !evidenceEnabled &&
    !reportScreeningEnabled
  ) {
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
  if (evidenceEnabled) {
    const storage = new S3EvidenceMediaStorageAdapter({
      endpoint: runtime.storage.endpoint,
      region: runtime.storage.region!,
      accessKey: runtime.storage.accessKey!,
      secretKey: runtime.storage.secretKey!,
      forcePathStyle: runtime.storage.forcePathStyle,
      bucketQuarantine: runtime.storage.bucketQuarantine,
      bucketOriginal: runtime.storage.bucketOriginal,
      bucketDerivative: runtime.storage.bucketDerivative,
    });
    const processor = new EvidenceMediaProcessor(
      new PostgresEvidenceWorkCoordinator(pool),
      storage,
      new FakeAntivirusAdapter(),
      new SharpEvidenceDerivativeAdapter(),
      runtime.evidence.maxBytes!,
    );
    const job = new EvidenceConsumerJob(
      new RabbitMqEvidenceQueueAdapter(
        runtime.queue.endpoints,
        runtime.queue.vhost,
      ),
      processor,
      runtime.evidence.workerBatchSize!,
    );
    schedule("Evidence media", runtime.evidence.workerPollMs!, () =>
      job.runOnce(),
    );
  }
  if (reportScreeningEnabled) {
    const job = new ReportScreeningJob(
      new RabbitMqReportScreeningQueueAdapter(
        runtime.queue.endpoints,
        runtime.queue.vhost,
      ),
      new PostgresReportScreeningCoordinator(pool),
      runtime.reportScreening.batchSize!,
      runtime.reportScreening.maxCandidatesPerReport!,
    );
    schedule("Report screening", runtime.reportScreening.pollMs!, () =>
      job.runOnce(),
    );
  }
  console.log(
    `ATGT Worker started; map=${String(mapEnabled)} relay=${String(relayEnabled)} evidence=${String(evidenceEnabled)} reportScreening=${String(reportScreeningEnabled)}`,
  );
}

void main();
