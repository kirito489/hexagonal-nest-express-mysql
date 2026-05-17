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
import { getRequestStartTime } from '../helper/request-start-time';
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

// Domain exception → { HTTP status, error code } 映射表
// 新增 domain exception 時只需在此加一筆，不用再追長串 if/else if
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DomainExceptionCtor = new (...args: any[]) => Error;

const DOMAIN_EXCEPTION_MAP: ReadonlyArray<
  readonly [DomainExceptionCtor, { status: HttpStatus; code: string }]
> = [
  [
    MemberNotFoundException,
    { status: HttpStatus.NOT_FOUND, code: 'MEMBER_NOT_FOUND' },
  ],
  [
    EmailAlreadyExistsException,
    { status: HttpStatus.CONFLICT, code: 'EMAIL_ALREADY_EXISTS' },
  ],
  [
    AccountDisabledException,
    { status: HttpStatus.FORBIDDEN, code: 'ACCOUNT_DISABLED' },
  ],
  [
    PasswordChangeRequiredException,
    { status: HttpStatus.FORBIDDEN, code: 'PASSWORD_CHANGE_REQUIRED' },
  ],
  [
    InvalidRefreshTokenException,
    { status: HttpStatus.UNAUTHORIZED, code: 'INVALID_REFRESH_TOKEN' },
  ],
  [
    RoleNotFoundException,
    { status: HttpStatus.NOT_FOUND, code: 'ROLE_NOT_FOUND' },
  ],
  [
    CannotDeleteSelfException,
    { status: HttpStatus.CONFLICT, code: 'CANNOT_DELETE_SELF' },
  ],
  [
    DefaultMemberNotDeletableException,
    { status: HttpStatus.CONFLICT, code: 'DEFAULT_MEMBER_NOT_DELETABLE' },
  ],
  [
    DefaultMemberNotEditableException,
    { status: HttpStatus.CONFLICT, code: 'DEFAULT_MEMBER_NOT_EDITABLE' },
  ],
  [
    CannotDisableSelfException,
    { status: HttpStatus.CONFLICT, code: 'CANNOT_DISABLE_SELF' },
  ],
  [
    DuplicateRoleNameException,
    { status: HttpStatus.CONFLICT, code: 'DUPLICATE_ROLE_NAME' },
  ],
  [
    DefaultRoleNotDeletableException,
    { status: HttpStatus.BAD_REQUEST, code: 'DEFAULT_ROLE_NOT_DELETABLE' },
  ],
  [
    DefaultRoleNotEditableException,
    { status: HttpStatus.BAD_REQUEST, code: 'DEFAULT_ROLE_NOT_EDITABLE' },
  ],
  [
    RoleHasMembersException,
    { status: HttpStatus.CONFLICT, code: 'ROLE_HAS_MEMBERS' },
  ],
  [
    InvalidPermissionCodeException,
    { status: HttpStatus.BAD_REQUEST, code: 'INVALID_PERMISSION_CODE' },
  ],
  [
    InvalidPermissionCombinationException,
    { status: HttpStatus.BAD_REQUEST, code: 'INVALID_PERMISSION_COMBINATION' },
  ],
];

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

    const { status, message, code } = this.resolveError(exception);

    const now = new Date();
    const startTime = getRequestStartTime(request) ?? now;

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

  private resolveError(exception: unknown): {
    status: number;
    message: string;
    code: string;
  } {
    // 1. domain exception：查表
    if (exception instanceof Error) {
      for (const [Ctor, meta] of DOMAIN_EXCEPTION_MAP) {
        if (exception instanceof Ctor) {
          return {
            status: meta.status,
            message: exception.message,
            code: meta.code,
          };
        }
      }
    }

    // 2. NestJS HttpException：透過 class name 自動轉 SCREAMING_SNAKE_CASE
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: exception.message,
        code: exception.constructor.name
          .replace('Exception', '')
          .replace(/([A-Z])/g, '_$1')
          .replace(/^_/, '')
          .toUpperCase(),
      };
    }

    // 3. 未預期錯誤：500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }
}
