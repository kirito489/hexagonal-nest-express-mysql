export class InvalidPermissionCombinationException extends Error {
  constructor(domain: string) {
    super(`設定 ${domain}:EDIT 時必須同時設定 ${domain}:VIEW`);
  }
}
