import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { EvidenceFailure, type EvidenceStoragePort } from "./evidence.types";
import type {
  EvidenceAccessKind,
  EvidenceReadStoragePort,
} from "./evidence-access.types";

export interface S3EvidenceStorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketQuarantine: string;
  bucketOriginal: string;
  bucketDerivative: string;
  forcePathStyle: boolean;
}

export class S3EvidenceStorageAdapter
  implements EvidenceStoragePort, EvidenceReadStoragePort
{
  private readonly client: S3Client;

  constructor(private readonly config: S3EvidenceStorageConfig) {
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

  async createUploadUrl(input: {
    objectKey: string;
    mime: string;
    expiresInSeconds: number;
  }): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.config.bucketQuarantine,
          Key: input.objectKey,
          ContentType: input.mime,
        }),
        { expiresIn: input.expiresInSeconds },
      );
    } catch {
      throw new EvidenceFailure("STORAGE_UNAVAILABLE");
    }
  }

  async inspectQuarantineObject(objectKey: string): Promise<{
    mime: string;
    sizeBytes: number;
  }> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucketQuarantine,
          Key: objectKey,
        }),
      );
      if (
        result.ContentLength === undefined ||
        !result.ContentType ||
        !Number.isSafeInteger(result.ContentLength)
      ) {
        throw new EvidenceFailure("UPLOAD_MISSING");
      }
      return { mime: result.ContentType, sizeBytes: result.ContentLength };
    } catch (error) {
      if (error instanceof EvidenceFailure) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) throw new EvidenceFailure("UPLOAD_MISSING");
      throw new EvidenceFailure("STORAGE_UNAVAILABLE");
    }
  }

  async createReadUrl(input: {
    objectKey: string;
    mime: string;
    kind: EvidenceAccessKind;
    evidenceId: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const bucket =
      input.kind === "PREVIEW"
        ? this.config.bucketDerivative
        : this.config.bucketOriginal;
    const extension = input.mime === "image/png" ? "png" : "jpg";
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: input.objectKey }),
      );
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.objectKey,
          ResponseContentType: input.mime,
          ResponseContentDisposition:
            input.kind === "PREVIEW"
              ? "inline"
              : `attachment; filename="evidence-${input.evidenceId}.${extension}"`,
        }),
        { expiresIn: input.expiresInSeconds },
      );
    } catch {
      throw new EvidenceFailure("STORAGE_UNAVAILABLE");
    }
  }
}
