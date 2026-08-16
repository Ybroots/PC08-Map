import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CITIZEN_GUEST_ROLE,
  createAccessScope,
  DataClass,
  type AccessScope,
} from "@atgt/authorization";
import type {
  CitizenDeviceClass,
  CitizenSessionContract,
} from "@atgt/contracts";

export const CITIZEN_SESSION_FAILURE = {
  INVALID: "INVALID",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;

export type CitizenSessionFailureCode =
  (typeof CITIZEN_SESSION_FAILURE)[keyof typeof CITIZEN_SESSION_FAILURE];

export class CitizenSessionFailure extends Error {
  constructor(readonly code: CitizenSessionFailureCode) {
    super(code);
    this.name = "CitizenSessionFailure";
  }
}

export interface CitizenSessionRecord {
  sessionId: string;
  tokenHash: string;
  deviceClass: CitizenDeviceClass;
  createdAt: Date;
  rotateAfter: Date;
  expiresAt: Date;
  revokedAt?: Date;
  replacedBySessionId?: string;
}

export interface CitizenSessionStore {
  create(record: CitizenSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<CitizenSessionRecord | null>;
  rotate(
    currentTokenHash: string,
    replacement: CitizenSessionRecord,
    now: Date,
  ): Promise<boolean>;
}

export class InMemoryCitizenSessionStore implements CitizenSessionStore {
  private readonly records = new Map<string, CitizenSessionRecord>();

  async create(record: CitizenSessionRecord): Promise<void> {
    this.records.set(record.tokenHash, structuredClone(record));
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<CitizenSessionRecord | null> {
    const record = this.records.get(tokenHash);
    return record ? structuredClone(record) : null;
  }

  async rotate(
    currentTokenHash: string,
    replacement: CitizenSessionRecord,
    now: Date,
  ): Promise<boolean> {
    const current = this.records.get(currentTokenHash);
    if (!current || current.revokedAt || current.expiresAt <= now) return false;
    current.revokedAt = new Date(now);
    current.replacedBySessionId = replacement.sessionId;
    this.records.set(replacement.tokenHash, structuredClone(replacement));
    return true;
  }

  revoke(token: string, now: Date): void {
    const record = this.records.get(hashToken(token));
    if (record) record.revokedAt = new Date(now);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface IssuedSession {
  contract: CitizenSessionContract;
  record: CitizenSessionRecord;
}

export class CitizenSessionService {
  constructor(
    private readonly store: CitizenSessionStore,
    private readonly ttlMinutes: number,
    private readonly rotateAfterMinutes: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    deviceClass: CitizenDeviceClass,
  ): Promise<CitizenSessionContract> {
    const issued = this.issue(deviceClass, this.now());
    await this.store.create(issued.record);
    return issued.contract;
  }

  async authenticate(token: string): Promise<AccessScope> {
    const record = await this.requireActive(token, this.now());
    return createAccessScope({
      principalId: record.sessionId,
      role: CITIZEN_GUEST_ROLE,
      maxDataClass: DataClass.PUBLIC,
      sessionId: record.sessionId,
    });
  }

  async rotate(token: string): Promise<CitizenSessionContract> {
    const now = this.now();
    const current = await this.requireActive(token, now);
    const replacement = this.issue(current.deviceClass, now);
    const rotated = await this.store.rotate(
      hashToken(token),
      replacement.record,
      now,
    );
    if (!rotated) throw new CitizenSessionFailure("REVOKED");
    return replacement.contract;
  }

  private async requireActive(
    token: string,
    now: Date,
  ): Promise<CitizenSessionRecord> {
    if (!token) throw new CitizenSessionFailure("INVALID");
    const record = await this.store.findByTokenHash(hashToken(token));
    if (!record) throw new CitizenSessionFailure("INVALID");
    if (record.revokedAt) throw new CitizenSessionFailure("REVOKED");
    if (record.expiresAt <= now) throw new CitizenSessionFailure("EXPIRED");
    return record;
  }

  private issue(deviceClass: CitizenDeviceClass, now: Date): IssuedSession {
    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const createdAt = new Date(now);
    const rotateAfter = new Date(
      now.getTime() + this.rotateAfterMinutes * 60_000,
    );
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000);
    return {
      contract: {
        session_id: sessionId,
        session_token: token,
        device_class: deviceClass,
        created_at: createdAt.toISOString(),
        rotate_after: rotateAfter.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      record: {
        sessionId,
        tokenHash: hashToken(token),
        deviceClass,
        createdAt,
        rotateAfter,
        expiresAt,
      },
    };
  }
}
