import { Member } from './Member';
import { Email } from '../value-object/Email';

const TEST_UUID_1 = '00000000-0000-0000-0000-000000000001';
const TEST_UUID_2 = '00000000-0000-0000-0000-000000000002';
const ROLE_UUID_1 = '00000000-0000-0000-0000-000000000010';
const ROLE_UUID_2 = '00000000-0000-0000-0000-000000000020';

describe('Email', () => {
  it('有效 email 建立成功', () => {
    expect(() => Email.of('user@example.com')).not.toThrow();
    expect(Email.of('user@example.com').toString()).toBe('user@example.com');
  });

  it('無效 email 拋出錯誤', () => {
    expect(() => Email.of('not-an-email')).toThrow();
    expect(() => Email.of('@example.com')).toThrow();
    expect(() => Email.of('user@')).toThrow();
    expect(() => Email.of('user@@example.com')).toThrow();
    expect(() => Email.of('')).toThrow();
  });

  it('equals 比較值', () => {
    const a = Email.of('user@example.com');
    const b = Email.of('user@example.com');
    const c = Email.of('other@example.com');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('Member', () => {
  describe('create', () => {
    it('建立新成員，自動產生 id', () => {
      const member = Member.create(
        Email.of('user@example.com'),
        'Alan',
        'hashed_password',
        ROLE_UUID_1,
      );

      expect(member.email.toString()).toBe('user@example.com');
      expect(member.member).toBe('Alan');
      expect(member.password).toBe('hashed_password');
      expect(member.roleId).toBe(ROLE_UUID_1);
      expect(member.status).toBe(true);
      expect(member.isDefault).toBe(false);
      expect(member.id.toString()).toBeTruthy();
    });

    it('兩次 create 產生不同 id', () => {
      const a = Member.create(Email.of('a@b.com'), 'A', 'hash', ROLE_UUID_1);
      const b = Member.create(Email.of('a@b.com'), 'A', 'hash', ROLE_UUID_1);
      expect(a.id.toString()).not.toBe(b.id.toString());
    });
  });

  describe('reconstitute', () => {
    it('從持久層還原，保留指定 id', () => {
      const member = Member.reconstitute(
        TEST_UUID_1,
        'user@example.com',
        'Alan',
        'hash',
        ROLE_UUID_2,
        true,
        false,
        new Date(),
      );

      expect(member.id.toString()).toBe(TEST_UUID_1);
      expect(member.email.toString()).toBe('user@example.com');
      expect(member.roleId).toBe(ROLE_UUID_2);
      expect(member.status).toBe(true);
      expect(member.isDefault).toBe(false);
    });

    it('無效 UUID 格式 → 拋出錯誤', () => {
      expect(() =>
        Member.reconstitute(
          'not-a-uuid',
          'u@e.com',
          'Name',
          'hash',
          ROLE_UUID_1,
          true,
          false,
          new Date(),
        ),
      ).toThrow('無效的 MemberId 格式');
    });
  });

  describe('updateProfile', () => {
    it('更新名稱與角色', () => {
      const member = Member.reconstitute(
        TEST_UUID_2,
        'u@e.com',
        'Old Name',
        'hash',
        ROLE_UUID_1,
        true,
        false,
        new Date(),
      );
      member.updateProfile('New Name', ROLE_UUID_2);
      expect(member.member).toBe('New Name');
      expect(member.roleId).toBe(ROLE_UUID_2);
    });
  });

  describe('activate / deactivate', () => {
    it('停用後再啟用', () => {
      const member = Member.reconstitute(
        TEST_UUID_1,
        'u@e.com',
        'Name',
        'hash',
        ROLE_UUID_1,
        true,
        false,
        new Date(),
      );
      member.deactivate();
      expect(member.status).toBe(false);
      member.activate();
      expect(member.status).toBe(true);
    });
  });
});
