import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class RoleHasMembersException extends DomainException {
  constructor(count: number) {
    super(
      ResponseCodes.ROLE_HAS_MEMBERS,
      'CONFLICT',
      `該角色仍有 ${count} 個帳號使用，無法刪除`,
    );
  }
}
