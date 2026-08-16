import { SetMetadata } from "@nestjs/common";
import { DataClass, PolicyAction } from "@atgt/authorization";

export const PUBLIC_ROUTE_METADATA = "atgt.public-route";
export const POLICY_METADATA = "atgt.required-policy";

export interface RequiredPolicyMetadata {
  action: PolicyAction;
  dataClass: DataClass;
  areaParam?: string;
  unitParam?: string;
  caseParam?: string;
}

/** Explicitly declares an unauthenticated route. */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_METADATA, true);

/** Every non-public handler must declare one policy. */
export const RequirePolicy = (policy: RequiredPolicyMetadata) =>
  SetMetadata(POLICY_METADATA, policy);
