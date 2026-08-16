import { HttpException } from "@nestjs/common";
import type { ErrorCode } from "@atgt/contracts";

/** HTTP exception whose public representation is explicitly allow-listed. */
export class SafeHttpException extends HttpException {
  constructor(
    status: number,
    readonly errorCode: ErrorCode,
    readonly publicTitle: string,
    readonly publicDetail: string,
  ) {
    super(publicDetail, status);
  }
}
