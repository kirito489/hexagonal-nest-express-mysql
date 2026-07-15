/**
 * Domain exception 的語意類別。GlobalExceptionFilter 以此映射成 HTTP status，
 * 不依賴 NestJS / HTTP —— 新增 domain exception 只需選一個 kind，filter 完全不用改。
 */
export type DomainExceptionKind =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID'
  | 'CONFLICT'
  | 'LOCKED'
  | 'INTERNAL';

/**
 * 所有 domain exception 的共用基底：自帶業務 `code` 與語意 `kind`，
 * filter 據此組出 `{ status, code, message }`，毋須維護「例外 → status/code」對照表。
 */
export abstract class DomainException extends Error {
  readonly code: string;
  readonly kind: DomainExceptionKind;

  constructor(code: string, kind: DomainExceptionKind, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.kind = kind;
  }
}
