import { Body, Controller, Header, Headers, Post } from "@nestjs/common";
import {
  CreateCitizenSessionSchema,
  ERROR_CODES,
  type CitizenSessionContract,
  type CreateCitizenSession,
} from "@atgt/contracts";
import { ZodValidationPipe } from "../../platform/zod-validation.pipe";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { PublicRoute } from "./authorization.decorators";
import {
  CitizenSessionFailure,
  CitizenSessionService,
} from "./citizen-session.service";

@Controller("public/sessions")
export class CitizenSessionController {
  constructor(private readonly sessions: CitizenSessionService) {}

  @Post()
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  create(
    @Body(new ZodValidationPipe(CreateCitizenSessionSchema))
    input: CreateCitizenSession,
  ): Promise<CitizenSessionContract> {
    return this.sessions.create(input.device_class);
  }

  @Post("rotate")
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  async rotate(
    @Headers("x-citizen-session") token?: string,
  ): Promise<CitizenSessionContract> {
    try {
      return await this.sessions.rotate(token ?? "");
    } catch (error) {
      if (error instanceof CitizenSessionFailure) {
        const expired = error.code === "EXPIRED";
        const revoked = error.code === "REVOKED";
        throw new SafeHttpException(
          401,
          expired
            ? ERROR_CODES.CITIZEN_SESSION_EXPIRED
            : revoked
              ? ERROR_CODES.CITIZEN_SESSION_REVOKED
              : ERROR_CODES.CITIZEN_SESSION_INVALID,
          "Unauthorized",
          expired
            ? "The citizen session expired"
            : revoked
              ? "The citizen session was revoked"
              : "The citizen session is invalid",
        );
      }
      throw error;
    }
  }
}
