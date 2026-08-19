import {
  AuthorizationPolicy,
  DataClass,
  PolicyAction,
  type AccessScope,
} from "@atgt/authorization";

export interface OpsNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly status: "available" | "planned";
}

const policy = new AuthorizationPolicy();

export function navigationForScope(
  scope: AccessScope,
  areaId: string | undefined,
): readonly OpsNavigationItem[] {
  const resource = { areaId, dataClass: DataClass.SENSITIVE };
  const items: OpsNavigationItem[] = [];
  if (
    policy.evaluate(scope, { action: PolicyAction.INCIDENT_READ, resource })
      .allowed
  ) {
    items.push({ href: "/incidents", label: "Tin báo", status: "available" });
  }
  if (
    policy.evaluate(scope, {
      action: PolicyAction.MAP_DRAFT_WRITE,
      resource: { areaId, dataClass: DataClass.INTERNAL },
    }).allowed ||
    policy.evaluate(scope, {
      action: PolicyAction.MAP_PUBLISH,
      resource: { areaId, dataClass: DataClass.INTERNAL },
    }).allowed
  ) {
    items.push({
      href: "/map-data",
      label: "Dữ liệu bản đồ",
      status: "available",
    });
  }
  if (
    policy.evaluate(scope, { action: PolicyAction.ANALYTICS_READ, resource })
      .allowed
  ) {
    items.push({ href: "/analytics", label: "Tổng hợp", status: "planned" });
  }
  if (
    policy.evaluate(scope, { action: PolicyAction.AUDIT_READ, resource })
      .allowed
  ) {
    items.push({ href: "/audit", label: "Nhật ký", status: "planned" });
  }
  return Object.freeze(items.map((item) => Object.freeze(item)));
}
