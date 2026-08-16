export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was used with a different request");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends Error {
  constructor() {
    super("Idempotent request is still processing");
    this.name = "IdempotencyInProgressError";
  }
}
