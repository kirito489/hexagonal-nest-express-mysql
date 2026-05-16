import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  SAVE_SYSTEM_LOG_PORT,
  SaveSystemLogPort,
} from '../../../../application/port/out/shared/SaveSystemLogPort';
import { buildSystemLogData } from '../helper/system-log-helper';
import { EmailAlreadyExistsException } from '../../../../domain/exception/EmailAlreadyExistsException';
import { MemberNotFoundException } from '../../../../domain/exception/MemberNotFoundException';
import { AccountDisabledException } from '../../../../domain/exception/AccountDisabledException';
import { PasswordChangeRequiredException } from '../../../../domain/exception/PasswordChangeRequiredException';
import { InvalidRefreshTokenException } from '../../../../domain/exception/InvalidRefreshTokenException';
import { RoleNotFoundException } from '../../../../domain/exception/RoleNotFoundException';
import { CannotDeleteSelfException } from '../../../../domain/exception/CannotDeleteSelfException';
import { DefaultMemberNotDeletableException } from '../../../../domain/exception/DefaultMemberNotDeletableException';
import { DefaultMemberNotEditableException } from '../../../../domain/exception/DefaultMemberNotEditableException';
import { CannotDisableSelfException } from '../../../../domain/exception/CannotDisableSelfException';
import { DuplicateRoleNameException } from '../../../../domain/exception/DuplicateRoleNameException';
import { DefaultRoleNotDeletableException } from '../../../../domain/exception/DefaultRoleNotDeletableException';
import { DefaultRoleNotEditableException } from '../../../../domain/exception/DefaultRoleNotEditableException';
import { RoleHasMembersException } from '../../../../domain/exception/RoleHasMembersException';
import { InvalidPermissionCodeException } from '../../../../domain/exception/InvalidPermissionCodeException';
import { InvalidPermissionCombinationException } from '../../../../domain/exception/InvalidPermissionCombinationException';

export interface ApiErrorResponse {
  success: false;
  message: string;
  code: string;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    @Inject(SAVE_SYSTEM_LOG_PORT)
    private readonly saveSystemLog: SaveSystemLogPort,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let code: string;

    if (exception instanceof MemberNotFoundException) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
      code = 'MEMBER_NOT_FOUND';
    } else if (exception instanceof EmailAlreadyExistsException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'EMAIL_ALREADY_EXISTS';
    } else if (exception instanceof AccountDisabledException) {
      status = HttpStatus.FORBIDDEN;
      message = exception.message;
      code = 'ACCOUNT_DISABLED';
    } else if (exception instanceof PasswordChangeRequiredException) {
      status = HttpStatus.FORBIDDEN;
      message = exception.message;
      code = 'PASSWORD_CHANGE_REQUIRED';
    } else if (exception instanceof InvalidRefreshTokenException) {
      status = HttpStatus.UNAUTHORIZED;
      message = exception.message;
      code = 'INVALID_REFRESH_TOKEN';
    } else if (exception instanceof RoleNotFoundException) {
      status = HttpStatus.NOT_FOUND;
      message = exception.message;
      code = 'ROLE_NOT_FOUND';
    } else if (exception instanceof CannotDeleteSelfException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'CANNOT_DELETE_SELF';
    } else if (exception instanceof DefaultMemberNotDeletableException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'DEFAULT_MEMBER_NOT_DELETABLE';
    } else if (exception instanceof DefaultMemberNotEditableException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'DEFAULT_MEMBER_NOT_EDITABLE';
    } else if (exception instanceof CannotDisableSelfException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'CANNOT_DISABLE_SELF';
    } else if (exception instanceof DuplicateRoleNameException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'DUPLICATE_ROLE_NAME';
    } else if (exception instanceof DefaultRoleNotDeletableException) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = 'DEFAULT_ROLE_NOT_DELETABLE';
    } else if (exception instanceof DefaultRoleNotEditableException) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = 'DEFAULT_ROLE_NOT_EDITABLE';
    } else if (exception instanceof RoleHasMembersException) {
      status = HttpStatus.CONFLICT;
      message = exception.message;
      code = 'ROLE_HAS_MEMBERS';
    } else if (exception instanceof InvalidPermissionCodeException) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = 'INVALID_PERMISSION_CODE';
    } else if (exception instanceof InvalidPermissionCombinationException) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = 'INVALID_PERMISSION_COMBINATION';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code = exception.constructor.name
        .replace('Exception', '')
        .replace(/([A-Z])/g, '_$1')
        .replace(/^_/, '')
        .toUpperCase();
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      code = 'INTERNAL_SERVER_ERROR';
    }

    const now = new Date();
    const startTime =
      (request as Request & { _startTime?: Date })._startTime ?? now;

    this.logger.error(
      message,
      exception instanceof Error ? exception.stack : String(exception),
    );

    void this.saveSystemLog
      .saveSystemLog(
        buildSystemLogData(
          request,
          status,
          { statusCode: status, message },
          startTime,
          now,
          { action: '異常紀錄' },
        ),
      )
      .catch((err) =>
        this.logger.error(
          'Exception system log 寫入失敗',
          err instanceof Error ? err.stack : String(err),
        ),
      );

    const body: ApiErrorResponse = {
      success: false,
      message,
      code,
      timestamp: now.toISOString(),
    };

    response.status(status).json(body);
  }
}
