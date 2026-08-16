import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  traceId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(context: RequestContext, operation: () => T): T {
    return storage.run(context, operation);
  },
  current(): RequestContext | undefined {
    return storage.getStore();
  },
};

export function createRequestId(): string {
  return randomUUID();
}

export function createTraceId(): string {
  return randomBytes(16).toString("hex");
}
