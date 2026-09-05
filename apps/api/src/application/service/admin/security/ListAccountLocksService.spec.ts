import { ListAccountLocksService } from './SecurityServices';
import { AccountLockPort } from '../../../port/out/auth/AccountLockPort';

const lockEnabled = jest.fn().mockReturnValue(true);
jest.mock('@app/infrastructure/validate-env', () => ({
  getEnv: () => ({
    APPLICATION_ACCOUNT_LOCK_ENABLED: lockEnabled() as boolean,
    DEFAULT_PAGE_LIMIT: 20,
  }),
}));

const mockAccountLock = {
  recordFailedLogin: jest.fn(),
  resetFailedLogin: jest.fn(),
  checkLock: jest.fn(),
  lockAccount: jest.fn(),
  unlockAccount: jest.fn(),
  listLocked: jest.fn(),
} as jest.Mocked<AccountLockPort>;

const makeService = () => new ListAccountLocksService(mockAccountLock);

/** port 回傳的一列 */
const row = () => ({
  id: 'id-1',
  email: 'a@test.com',
  member: '甲',
  lockedAt: new Date('2026-09-06T06:00:00.000Z'),
  unlocksAt: new Date('2026-09-06T06:15:00.000Z'),
  failedLoginCount: 3,
  status: 'locked' as const,
});

describe('ListAccountLocksService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lockEnabled.mockReturnValue(true);
    mockAccountLock.listLocked.mockResolvedValue({ list: [], total: 0 });
  });

  describe('查詢參數的正規化', () => {
    it('未指定 status 時預設為 locked', async () => {
      await makeService().execute({});

      expect(mockAccountLock.listLocked).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'locked' }),
      );
    });

    it.each(['locked', 'expired', 'all'] as const)(
      'status=%s 原樣傳給 port',
      async (status) => {
        await makeService().execute({ status });

        expect(mockAccountLock.listLocked).toHaveBeenCalledWith(
          expect.objectContaining({ status }),
        );
      },
    );

    it('search 只有空白時視為未提供', async () => {
      await makeService().execute({ search: '   ' });

      expect(mockAccountLock.listLocked).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined }),
      );
    });

    it('search 前後空白會被去掉', async () => {
      await makeService().execute({ search: '  adm  ' });

      expect(mockAccountLock.listLocked).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'adm' }),
      );
    });
  });

  describe('回應內容', () => {
    it('帶上分頁 meta 與 port 回傳的資料', async () => {
      mockAccountLock.listLocked.mockResolvedValue({
        list: [row()],
        total: 1,
      });

      const result = await makeService().execute({ page: 1, limit: 20 });

      expect(result.list).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('沒有任何鎖定紀錄時回空清單而非錯誤', async () => {
      const result = await makeService().execute({});

      expect(result.list).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    /**
     * 少了 lockEnabled，呼叫端分不出「沒有人被鎖」與「根本不會鎖」。
     *
     * flag 關閉時登入路徑不寫入 `lockedAt`，清單必然是空的——
     * 而空清單配上「目前沒有帳號被鎖定」的文案在此時是**錯的**。
     */
    it.each([true, false])('回傳 lockEnabled=%s', async (enabled) => {
      lockEnabled.mockReturnValue(enabled);

      const result = await makeService().execute({});

      expect(result.lockEnabled).toBe(enabled);
    });
  });
});
