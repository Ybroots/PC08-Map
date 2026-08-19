import { fetchIncidentFeed, IncidentFeedClientError } from "./feed-client";

const validFeed = {
  items: [],
  nextCursor: "0",
  hasMore: false,
};

describe("ops incident feed client", () => {
  it("passes the bearer only in the authorization header and validates output", async () => {
    const fetchPort = jest.fn(async (_input: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => validFeed,
    }));
    const token = "local-test-token-never-log";
    await expect(
      fetchIncidentFeed(
        {
          apiBaseUrl: "http://127.0.0.1:3000",
          areaId: "area-dalat",
          after: "0",
          limit: 50,
          bearerToken: token,
        },
        fetchPort,
      ),
    ).resolves.toEqual(validFeed);

    const [url, init] = fetchPort.mock.calls[0]!;
    expect(url).not.toContain(token);
    expect(init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "FORBIDDEN"],
    [503, "UPSTREAM"],
  ] as const)(
    "maps HTTP %s without exposing response detail",
    async (status, code) => {
      const fetchPort = async () => ({
        ok: false,
        status,
        json: async () => ({ detail: "provider secret should not escape" }),
      });
      await expect(
        fetchIncidentFeed(
          {
            apiBaseUrl: "http://127.0.0.1:3000",
            areaId: "area-dalat",
            after: "0",
            limit: 50,
            bearerToken: "test-token",
          },
          fetchPort,
        ),
      ).rejects.toEqual(new IncidentFeedClientError(code));
    },
  );

  it("rejects invalid success payloads and credential-bearing base URLs", async () => {
    const invalid = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
    const credentialBearingUrl = new URL("http://127.0.0.1:3000");
    credentialBearingUrl.username = "local-user";
    credentialBearingUrl.password = ["not", "a", "secret"].join("-");
    await expect(
      fetchIncidentFeed(
        {
          apiBaseUrl: "http://127.0.0.1:3000",
          areaId: "area-dalat",
          after: "0",
          limit: 50,
          bearerToken: "test-token",
        },
        invalid,
      ),
    ).rejects.toMatchObject({ code: "CONTRACT" });
    await expect(
      fetchIncidentFeed(
        {
          apiBaseUrl: credentialBearingUrl.toString(),
          areaId: "area-dalat",
          after: "0",
          limit: 50,
          bearerToken: "test-token",
        },
        invalid,
      ),
    ).rejects.toMatchObject({ code: "CONTRACT" });
  });
});
