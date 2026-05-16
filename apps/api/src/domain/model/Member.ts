import { Email } from '../value-object/Email';
import { MemberId } from '../value-object/MemberId';

export class Member {
  private constructor(
    readonly id: MemberId,
    private _email: Email,
    private _member: string,
    private _password: string,
    private _roleId: string,
    private _status: boolean,
    readonly isDefault: boolean,
    readonly createdAt: Date,
    private _roleName: string = '',
  ) {}

  static create(
    email: Email,
    member: string,
    password: string,
    roleId: string,
    status = true,
  ): Member {
    if (!member || member.trim().length === 0) {
      throw new Error('名稱不可為空');
    }
    return new Member(
      MemberId.generate(),
      email,
      member.trim(),
      password,
      roleId,
      status,
      false,
      new Date(),
    );
  }

  static reconstitute(
    id: string,
    email: string,
    member: string,
    password: string,
    roleId: string,
    status: boolean,
    isDefault: boolean,
    createdAt: Date,
    roleName = '',
  ): Member {
    return new Member(
      MemberId.of(id),
      Email.of(email),
      member,
      password,
      roleId,
      status,
      isDefault,
      createdAt,
      roleName,
    );
  }

  updateProfile(member: string, roleId: string): void {
    if (!member || member.trim().length === 0) {
      throw new Error('名稱不可為空');
    }
    this._member = member.trim();
    this._roleId = roleId;
  }

  changeEmail(email: Email): void {
    this._email = email;
  }

  activate(): void {
    this._status = true;
  }

  deactivate(): void {
    this._status = false;
  }

  get email(): Email {
    return this._email;
  }

  get member(): string {
    return this._member;
  }

  get password(): string {
    return this._password;
  }

  get roleId(): string {
    return this._roleId;
  }

  get status(): boolean {
    return this._status;
  }

  get roleName(): string {
    return this._roleName;
  }
}
