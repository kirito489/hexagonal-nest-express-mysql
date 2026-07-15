import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

/**
 * 帳號已被鎖定時拋出
 */
export class AccountLockedException extends DomainException {
  constructor() {
    super(
      ResponseCodes.ACCOUNT_LOCKED,
      'LOCKED',
      '帳號已被鎖定，請聯繫管理員解鎖',
    );
  }
}
