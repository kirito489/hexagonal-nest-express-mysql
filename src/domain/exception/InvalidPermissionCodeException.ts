export class InvalidPermissionCodeException extends Error {
  constructor(codes: string[]) {
    super(`Permission code 不存在：${codes.join(', ')}`);
  }
}
