import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號不存在
 */
export class MemberNotFoundException extends DomainException {
  constructor(id?: string) {
    super(
      ResponseCodes.MEMBER_NOT_FOUND,
      'NOT_FOUND',
      id ? `找不到帳號: ${id}` : '找不到帳號',
    );
  }
}
