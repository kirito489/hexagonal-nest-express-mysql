/**
 * 帳號不存在
 */
export class MemberNotFoundException extends Error {
  constructor(id?: string) {
    super(id ? `找不到帳號: ${id}` : '找不到帳號');
    this.name = 'MemberNotFoundException';
  }
}
