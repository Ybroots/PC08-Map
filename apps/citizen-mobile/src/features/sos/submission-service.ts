import {
  SOS_QUEUE_VERSION,
  SosQueueEnvelopeSchema,
  SosQueueItemSchema,
  toCreateSosDto,
  withAcknowledgement,
  type SosQueueEnvelope,
  type SosQueueItem,
  type SosSubmissionInput,
} from "./model";
import { SosTransportError } from "./api-client";
import {
  noOpSosAnalytics,
  type ClockPort,
  type EncryptedSosQueueStore,
  type IdentifierPort,
  type SosAnalyticsPort,
  type SosTransport,
} from "./ports";

export interface SubmitResult {
  readonly item: SosQueueItem;
  readonly queue: SosQueueEnvelope;
}

export class SosSubmissionService {
  private activeSubmit?: Promise<SubmitResult>;
  private activeDrain?: Promise<SosQueueEnvelope>;
  private queueOperation: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: EncryptedSosQueueStore,
    private readonly transport: SosTransport,
    private readonly identifiers: IdentifierPort,
    private readonly clock: ClockPort,
    private readonly analytics: SosAnalyticsPort = noOpSosAnalytics,
  ) {}

  recover(): Promise<SosQueueEnvelope> {
    return this.recoverInterruptedSend();
  }

  submit(input: SosSubmissionInput, online: boolean): Promise<SubmitResult> {
    if (this.activeSubmit) return this.activeSubmit;
    this.activeSubmit = this.submitOnce(input, online).finally(() => {
      this.activeSubmit = undefined;
    });
    return this.activeSubmit;
  }

  drain(): Promise<SosQueueEnvelope> {
    if (this.activeDrain) return this.activeDrain;
    this.activeDrain = this.drainOnce().finally(() => {
      this.activeDrain = undefined;
    });
    return this.activeDrain;
  }

  private async submitOnce(
    input: SosSubmissionInput,
    online: boolean,
  ): Promise<SubmitResult> {
    const item = SosQueueItemSchema.parse({
      clientEventId: this.identifiers.newUuid(),
      idempotencyKey: this.identifiers.newUuid(),
      createdAt: this.clock.now().toISOString(),
      retryCount: 0,
      mediaChecksum: null,
      deliveryState: "SAVED_ON_DEVICE",
      payload: toCreateSosDto(input),
    });
    const persisted = await this.withQueueLock(async () => {
      const envelope = await this.store.load();
      const next = SosQueueEnvelopeSchema.parse({
        version: SOS_QUEUE_VERSION,
        items: [...envelope.items, item],
      });
      await this.store.save(next);
      return next;
    });
    this.analytics.record("SOS_QUEUE_SAVED");

    if (!online) return { item, queue: persisted };
    const drained = await this.drain();
    const result = drained.items.find(
      (candidate) => candidate.clientEventId === item.clientEventId,
    );
    if (!result) throw new Error("SECURE_QUEUE_ITEM_MISSING");
    return { item: result, queue: drained };
  }

  private recoverInterruptedSend(): Promise<SosQueueEnvelope> {
    return this.withQueueLock(async () => {
      const envelope = await this.store.load();
      let changed = false;
      const items = envelope.items.map((item) => {
        if (item.deliveryState !== "SENDING") return item;
        changed = true;
        return SosQueueItemSchema.parse({
          ...item,
          deliveryState: "SAVED_ON_DEVICE",
        });
      });
      if (!changed) return envelope;
      const recovered = { version: SOS_QUEUE_VERSION, items } as const;
      await this.store.save(recovered);
      return recovered;
    });
  }

  private async drainOnce(): Promise<SosQueueEnvelope> {
    await this.recoverInterruptedSend();
    for (;;) {
      const sending = await this.withQueueLock(async () => {
        const envelope = await this.store.load();
        const index = envelope.items.findIndex(isEligibleForAutomaticSend);
        if (index < 0) return undefined;
        const item = SosQueueItemSchema.parse({
          ...envelope.items[index],
          deliveryState: "SENDING",
          acknowledgement: undefined,
          lastErrorCode: undefined,
        });
        await this.store.save(replaceItem(envelope, index, item));
        return item;
      });
      if (!sending) return this.withQueueLock(() => this.store.load());
      this.analytics.record("SOS_SEND_STARTED");

      try {
        const acknowledgement = await this.transport.send(sending);
        await this.replacePersistedItem(
          sending.clientEventId,
          withAcknowledgement(sending, acknowledgement),
        );
        this.analytics.record("SOS_SERVER_ACKNOWLEDGED");
      } catch (error) {
        const transportError =
          error instanceof SosTransportError
            ? error
            : new SosTransportError("NETWORK_UNAVAILABLE", true);
        const failed = SosQueueItemSchema.parse({
          ...sending,
          deliveryState: "SEND_FAILED",
          retryCount: sending.retryCount + 1,
          lastErrorCode: transportError.code,
        });
        await this.replacePersistedItem(sending.clientEventId, failed);
        this.analytics.record("SOS_SEND_FAILED");
        if (transportError.retryable) {
          return this.withQueueLock(() => this.store.load());
        }
      }
    }
  }

  private replacePersistedItem(
    clientEventId: string,
    item: SosQueueItem,
  ): Promise<SosQueueEnvelope> {
    return this.withQueueLock(async () => {
      const envelope = await this.store.load();
      const index = envelope.items.findIndex(
        (candidate) => candidate.clientEventId === clientEventId,
      );
      if (index < 0) throw new Error("SECURE_QUEUE_ITEM_MISSING");
      const next = replaceItem(envelope, index, item);
      await this.store.save(next);
      return next;
    });
  }

  private withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queueOperation.then(operation, operation);
    this.queueOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function isEligibleForAutomaticSend(item: SosQueueItem): boolean {
  if (item.deliveryState === "SAVED_ON_DEVICE") return true;
  return (
    item.deliveryState === "SEND_FAILED" &&
    (item.lastErrorCode === "NETWORK_UNAVAILABLE" ||
      item.lastErrorCode === "HTTP_RETRYABLE")
  );
}

function replaceItem(
  envelope: SosQueueEnvelope,
  index: number,
  item: SosQueueItem,
): SosQueueEnvelope {
  const items = [...envelope.items];
  items[index] = item;
  return SosQueueEnvelopeSchema.parse({
    version: SOS_QUEUE_VERSION,
    items,
  });
}
