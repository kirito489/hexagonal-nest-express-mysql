export class EmailAlreadyExistsException extends Error {
  constructor() {
    super('Email 已被使用');
    this.name = 'EmailAlreadyExistsException';
  }
}
