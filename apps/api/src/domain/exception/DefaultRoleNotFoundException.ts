import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class DefaultRoleNotFoundException extends DomainException {
  constructor() {
    super(
      ResponseCodes.DEFAULT_ROLE_NOT_FOUND,
      'INTERNAL',
      '系統未設定預設角色，請聯繫管理員',
    );
  }
}
