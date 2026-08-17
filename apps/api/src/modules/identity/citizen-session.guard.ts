import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@atgt/contracts";
import type { Request } from "express";
import { SafeHttpException } from "../../platform/safe-http.exception";
import { CITIZEN_SESSION_METADATA } from "./authorization.decorators";
import {
  CitizenSessionFailure,
  CitizenSessionService,
} from "./citizen-session.service";

@Injectable()
export class CitizenSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: CitizenSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      CITIZEN_SESSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    try {
      await this.sessions.authenticate(
        request.header("x-citizen-session") ?? "",
      );
      return true;
    } catch (error) {
      if (!(error instanceof CitizenSessionFailure)) throw error;
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
  }
}
