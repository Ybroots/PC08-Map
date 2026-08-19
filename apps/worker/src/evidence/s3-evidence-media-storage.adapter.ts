import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sha256 } from "./media-validation";
import {
  EvidenceMediaFailure,
  type EvidenceMediaStoragePort,
  type SupportedEvidenceMime,
} from "./evidence-media.types";

export interface S3EvidenceMediaStorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  bucketQuarantine: string;
  bucketOriginal: string;
  bucketDerivative: string;
}

export class S3EvidenceMediaStorageAdapter implements EvidenceMediaStoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: S3EvidenceMediaStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  readQuarantine(objectKey: string, maxBytes: number): Promise<Buffer> {
    return this.read(this.config.bucketQuarantine, objectKey, maxBytes, true);
  }

  storeOriginalImmutable(
    objectKey: string,
    bytes: Buffer,
    mime: SupportedEvidenceMime,
  ): Promise<void> {
    return this.storeImmutable(
      this.config.bucketOriginal,
      objectKey,
      bytes,
      mime,
    );
  }

  storeDerivativeImmutable(
    objectKey: string,
    bytes: Buffer,
    mime: "image/png",
  ): Promise<void> {
    return this.storeImmutable(
      this.config.bucketDerivative,
      objectKey,
      bytes,
      mime,
    );
  }

  private async storeImmutable(
    bucket: string,
    objectKey: string,
    bytes: Buffer,
    mime: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: bytes,
          ContentType: mime,
          IfNoneMatch: "*",
        }),
      );
      return;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status !== 409 && status !== 412) {
        throw new EvidenceMediaFailure("PROVIDER_UNAVAILABLE", true);
      }
    }

    const existing = await this.read(bucket, objectKey, bytes.length, false);
    if (
      existing.length !== bytes.length ||
      sha256(existing) !== sha256(bytes)
    ) {
      throw new EvidenceMediaFailure("IMMUTABLE_OBJECT_CONFLICT", false);
    }
  }

  private async read(
    bucket: string,
    objectKey: string,
    maxBytes: number,
    missingIsQuarantineFailure: boolean,
  ): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (
        response.ContentLength === undefined ||
        response.ContentLength > maxBytes ||
        !response.Body
      ) {
        throw new EvidenceMediaFailure("SIZE_LIMIT_EXCEEDED", false);
      }
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (bytes.length > maxBytes) {
        throw new EvidenceMediaFailure("SIZE_LIMIT_EXCEEDED", false);
      }
      return bytes;
    } catch (error) {
      if (error instanceof EvidenceMediaFailure) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404 && missingIsQuarantineFailure) {
        throw new EvidenceMediaFailure("QUARANTINE_OBJECT_MISSING", false);
      }
      if (status === 404) {
        throw new EvidenceMediaFailure("IMMUTABLE_OBJECT_CONFLICT", false);
      }
      throw new EvidenceMediaFailure("PROVIDER_UNAVAILABLE", true);
    }
  }
}
