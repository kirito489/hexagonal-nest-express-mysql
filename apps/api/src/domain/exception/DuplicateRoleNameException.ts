import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class DuplicateRoleNameException extends DomainException {
  constructor(name: string) {
    super(
      ResponseCodes.DUPLICATE_ROLE_NAME,
      'CONFLICT',
      `角色名稱已存在：${name}`,
    );
  }
}
