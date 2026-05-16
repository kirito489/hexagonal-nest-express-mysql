import { v4 as uuidv4 } from 'uuid';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MemberId {
  private constructor(private readonly value: string) {}

  static generate(): MemberId {
    return new MemberId(uuidv4());
  }

  static of(value: string): MemberId {
    if (!UUID_REGEX.test(value)) {
      throw new Error('無效的 MemberId 格式');
    }
    return new MemberId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: MemberId): boolean {
    return this.value === other.toString();
  }
}
