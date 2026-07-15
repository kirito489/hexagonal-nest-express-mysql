import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class CannotDeleteSelfException extends DomainException {
  constructor() {
    super(
      ResponseCodes.CANNOT_DELETE_SELF,
      'CONFLICT',
      '不可刪除登入中的自己帳號',
    );
  }
}
