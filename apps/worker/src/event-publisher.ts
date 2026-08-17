import type { EventEnvelope } from "@atgt/contracts";

export interface EventPublisherPort {
  publish(event: EventEnvelope): Promise<void>;
}
