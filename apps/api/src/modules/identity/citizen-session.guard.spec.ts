import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { CITIZEN_SESSION_METADATA } from "./authorization.decorators";
import { CitizenSessionGuard } from "./citizen-session.guard";
import {
  CitizenSessionService,
  InMemoryCitizenSessionStore,
} from "./citizen-session.service";

function context(handler: () => void, token?: string): ExecutionContext {
  class TestController {}
  const request = {
    header: (name: string) =>
      name.toLowerCase() === "x-citizen-session" ? token : undefined,
  } as unknown as Request;
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: <T = Request>() => request as T,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe("CitizenSessionGuard", () => {
  it("ignores routes without the citizen-session marker", async () => {
    const sessions = new CitizenSessionService(
      new InMemoryCitizenSessionStore(),
      60,
      15,
    );
    const guard = new CitizenSessionGuard(new Reflector(), sessions);
    await expect(guard.canActivate(context(() => undefined))).resolves.toBe(
      true,
    );
  });

  it("requires a valid anonymous citizen session without exposing its token", async () => {
    const sessions = new CitizenSessionService(
      new InMemoryCitizenSessionStore(),
      60,
      15,
      () => new Date("2026-08-17T08:00:00.000Z"),
    );
    const guard = new CitizenSessionGuard(new Reflector(), sessions);
    const handler = () => undefined;
    Reflect.defineMetadata(CITIZEN_SESSION_METADATA, true, handler);
    const invalid = await guard
      .canActivate(context(handler, "secret-invalid-token"))
      .catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(SafeHttpException);
    expect(invalid).toMatchObject({
      errorCode: "ATGT_CITIZEN_SESSION_INVALID",
    });
    expect(JSON.stringify(invalid)).not.toContain("secret-invalid-token");

    const session = await sessions.create("web");
    await expect(
      guard.canActivate(context(handler, session.session_token)),
    ).resolves.toBe(true);
  });
});
