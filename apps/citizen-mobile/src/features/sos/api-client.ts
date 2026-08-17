import { SosAcceptedSchema } from "@atgt/contracts";
import type { SosTransport } from "./ports";
import type { SosQueueItem } from "./model";

export type SafeTransportErrorCode =
  | "NETWORK_UNAVAILABLE"
  | "HTTP_RETRYABLE"
  | "HTTP_REJECTED"
  | "INVALID_ACKNOWLEDGEMENT";

export class SosTransportError extends Error {
  constructor(
    readonly code: SafeTransportErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SosTransportError";
  }
}

export interface FetchResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchPort = (
  input: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<FetchResponse>;

export class FetchSosTransport implements SosTransport {
  private readonly endpoint: string;

  constructor(
    apiBaseUrl: string,
    private readonly fetcher: FetchPort,
  ) {
    const normalized = apiBaseUrl.trim().replace(/\/$/, "");
    if (
      !/^https:\/\//.test(normalized) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
    ) {
      throw new Error("SOS_API_BASE_URL_INVALID");
    }
    this.endpoint = `${normalized}/api/v1/public/sos`;
  }

  async send(item: SosQueueItem) {
    let response: FetchResponse;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": item.idempotencyKey,
        },
        body: JSON.stringify(item.payload),
      });
    } catch {
      throw new SosTransportError("NETWORK_UNAVAILABLE", true);
    }

    if (response.status !== 202) {
      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      throw new SosTransportError(
        retryable ? "HTTP_RETRYABLE" : "HTTP_REJECTED",
        retryable,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SosTransportError("INVALID_ACKNOWLEDGEMENT", false);
    }
    const acknowledgement = SosAcceptedSchema.safeParse(body);
    if (!acknowledgement.success) {
      throw new SosTransportError("INVALID_ACKNOWLEDGEMENT", false);
    }
    return acknowledgement.data;
  }
}
