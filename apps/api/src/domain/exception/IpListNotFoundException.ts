export class IpListNotFoundException extends Error {
  constructor() {
    super('找不到該 IP 名單紀錄');
    this.name = 'IpListNotFoundException';
  }
}
