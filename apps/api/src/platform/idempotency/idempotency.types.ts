export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface StoredHttpResponse {
  status: number;
  body: JsonValue;
}

export type ClaimResult =
  | { kind: "acquired" }
  | { kind: "conflict" }
  | { kind: "in_progress" }
  | { kind: "replay"; response: StoredHttpResponse };

export interface IdempotencyStore {
  claim(
    key: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<ClaimResult>;
  complete(
    key: string,
    requestHash: string,
    response: StoredHttpResponse,
  ): Promise<void>;
  release(key: string, requestHash: string): Promise<void>;
}

export interface IdempotentExecutionResult {
  response: StoredHttpResponse;
  replayed: boolean;
}
