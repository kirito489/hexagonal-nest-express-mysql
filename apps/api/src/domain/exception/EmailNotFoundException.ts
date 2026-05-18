export class EmailNotFoundException extends Error {
  constructor() {
    super('找不到該 email 對應的帳號');
    this.name = 'EmailNotFoundException';
  }
}
