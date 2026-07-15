import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class InvalidPermissionCombinationException extends DomainException {
  constructor(domain: string) {
    super(
      ResponseCodes.INVALID_PERMISSION_COMBINATION,
      'INVALID',
      `設定 ${domain}:EDIT 時必須同時設定 ${domain}:VIEW`,
    );
  }
}
