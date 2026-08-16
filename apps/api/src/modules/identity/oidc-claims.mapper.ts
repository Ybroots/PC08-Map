import { createHash } from "node:crypto";
import {
  createAccessScope,
  DataClass,
  OfficerRole,
  type AccessScope,
} from "@atgt/authorization";
import { z } from "zod";
import { AuthenticationFailure } from "./identity.types";

const OidcClaimsSchema = z
  .object({
    iss: z.string().url(),
    sub: z.string().min(1).max(255),
    sid: z.string().min(1).max(255),
    atgt_role: z.nativeEnum(OfficerRole),
    atgt_unit_ids: z.array(z.string().min(1).max(128)).default([]),
    atgt_area_ids: z.array(z.string().min(1).max(128)).default([]),
    atgt_case_ids: z.array(z.string().min(1).max(128)).default([]),
    atgt_data_class: z.nativeEnum(DataClass),
    amr: z.array(z.string().min(1).max(64)).default([]),
  })
  .passthrough();

function principalReference(issuer: string, subject: string): string {
  return createHash("sha256")
    .update(issuer)
    .update("\0")
    .update(subject)
    .digest("hex");
}

export function mapOidcClaims(payload: unknown): AccessScope {
  const result = OidcClaimsSchema.safeParse(payload);
  if (!result.success) throw new AuthenticationFailure("INVALID_TOKEN");

  const claims = result.data;
  return createAccessScope({
    principalId: principalReference(claims.iss, claims.sub),
    role: claims.atgt_role,
    unitIds: claims.atgt_unit_ids,
    areaIds: claims.atgt_area_ids,
    assignedCaseIds: claims.atgt_case_ids,
    maxDataClass: claims.atgt_data_class,
    sessionId: claims.sid,
    authenticationMethods: claims.amr,
  });
}
