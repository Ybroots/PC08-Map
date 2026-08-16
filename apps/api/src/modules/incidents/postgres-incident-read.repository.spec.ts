import {
  createAccessScope,
  DataClass,
  OfficerRole,
  type AccessScope,
} from "@atgt/authorization";
import type { QueryExecutor } from "../../platform/database";
import { PostgresIncidentReadRepository } from "./postgres-incident-read.repository";

const INCIDENT_ID = "018f6f7a-8ca1-7a56-8d4a-f5154d5a3111";
const UNIT_ID = "018f6f7a-8ca1-7a56-8d4a-f5154d5a3222";
const NOW = new Date("2026-08-16T00:00:00.000Z");

const row = {
  id: INCIDENT_ID,
  public_code: "A3KX9M2P7Q4R",
  type: "TRAFFIC_ACCIDENT",
  priority: "CRITICAL",
  longitude: 108.4384,
  latitude: 11.9404,
  accuracy_m: "8.50",
  description: null,
  occurred_at: NOW,
  state: "RECEIVED",
  source: "MOBILE_SOS",
  area_id: "area-dalat",
  data_class: DataClass.SENSITIVE,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
  assigned_unit_id: UNIT_ID,
} as const;

function scope(
  role: OfficerRole,
  overrides: Partial<Parameters<typeof createAccessScope>[0]> = {},
): AccessScope {
  return createAccessScope({
    principalId: `principal-${role}`,
    role,
    unitIds: [UNIT_ID],
    areaIds: ["area-dalat"],
    assignedCaseIds: [INCIDENT_ID],
    maxDataClass: DataClass.SENSITIVE,
    authenticationMethods: ["pwd", "mfa"],
    ...overrides,
  });
}

function repositoryWith(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue({ rows, rowCount: rows.length });
  const repository = new PostgresIncidentReadRepository({
    query,
  } as unknown as QueryExecutor);
  return { query, repository };
}

describe("PostgresIncidentReadRepository", () => {
  it("returns an incident only after SQL scope and policy checks", async () => {
    const { query, repository } = repositoryWith([row]);

    const incident = await repository.findById(
      scope(OfficerRole.DISPATCHER),
      INCIDENT_ID,
    );

    expect(incident).toMatchObject({
      id: INCIDENT_ID,
      areaId: "area-dalat",
      assignedUnitId: UNIT_ID,
      dataClass: DataClass.SENSITIVE,
      location: { longitude: 108.4384, latitude: 11.9404 },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.area_id = ANY"),
      [INCIDENT_ID, ["area-dalat"], [INCIDENT_ID]],
    );
  });

  it.each([
    ["cross-area", scope(OfficerRole.DISPATCHER, { areaIds: ["area-baoloc"] })],
    [
      "cross-unit",
      scope(OfficerRole.FIELD_OFFICER, { unitIds: ["another-unit"] }),
    ],
    [
      "cross-case",
      scope(OfficerRole.FIELD_OFFICER, {
        assignedCaseIds: ["018f6f7a-8ca1-7a56-8d4a-f5154d5a3999"],
      }),
    ],
    [
      "data-class exceeded",
      scope(OfficerRole.DISPATCHER, { maxDataClass: DataClass.INTERNAL }),
    ],
    ["role not allowed", scope(OfficerRole.SYSTEM_ADMIN)],
  ])("does not disclose existence for %s", async (_name, accessScope) => {
    const { repository } = repositoryWith([row]);
    await expect(
      repository.findById(accessScope, INCIDENT_ID),
    ).resolves.toBeNull();
  });

  it("rejects a structurally forged scope before querying", async () => {
    const { query, repository } = repositoryWith([row]);
    const forged = {
      principalId: "forged",
      role: OfficerRole.DISPATCHER,
      areaIds: ["area-dalat"],
    } as unknown as AccessScope;

    await expect(repository.findById(forged, INCIDENT_ID)).rejects.toThrow(
      "A resolved access scope is required",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("returns null for an invalid internal identifier before querying", async () => {
    const { query, repository } = repositoryWith([row]);
    await expect(
      repository.findById(scope(OfficerRole.DISPATCHER), "not-a-uuid"),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
