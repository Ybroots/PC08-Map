import { createHmac, timingSafeEqual } from "node:crypto";

export function deriveReportCapability(
  secret: string,
  publicCode: string,
): string {
  return createHmac("sha256", secret)
    .update(`citizen-report:${publicCode}`, "utf8")
    .digest("base64url");
}

export function isValidReportCapability(
  secret: string,
  publicCode: string,
  supplied: string,
): boolean {
  const expected = Buffer.from(deriveReportCapability(secret, publicCode));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
