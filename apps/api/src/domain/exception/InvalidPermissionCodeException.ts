import { DomainException } from './DomainException';
import { ResponseCodes } from '../../shared/constants/response-codes';

export class InvalidPermissionCodeException extends DomainException {
  constructor(codes: string[]) {
    super(
      ResponseCodes.INVALID_PERMISSION_CODE,
      'INVALID',
      `Permission code 不存在：${codes.join(', ')}`,
    );
  }
}
