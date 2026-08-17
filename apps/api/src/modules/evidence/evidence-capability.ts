import { createHash, createHmac } from "node:crypto";

export function deriveUploadCapability(
  secret: string,
  uploadId: string,
): string {
  return createHmac("sha256", secret)
    .update(`evidence-upload:${uploadId}`, "utf8")
    .digest("base64url");
}

export function hashUploadCapability(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("hex");
}
