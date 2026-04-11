import { formatDate, formatDateWithDay, formatYMD } from './date';

describe('date helpers', () => {
  describe('formatDate', () => {
    it('將 Date 轉為 YYYY-MM-DD', () => {
      expect(formatDate(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01-15');
    });

    it('null 回傳空字串', () => {
      expect(formatDate(null)).toBe('');
    });

    it('字串也能解析', () => {
      expect(formatDate('2026-06-01')).toBe('2026-06-01');
    });
  });

  describe('formatYMD', () => {
    it('轉為年月日格式', () => {
      expect(formatYMD(2026, 1, 5)).toBe('2026年01月05日');
    });
  });

  describe('formatDateWithDay', () => {
    it('回傳含星期的日期字串', () => {
      // 2026-01-04 是星期日
      const result = formatDateWithDay(new Date('2026-01-04T00:00:00'));
      expect(result).toMatch(/2026-01-04 \([日一二三四五六]\)/);
    });

    it('null 回傳空字串', () => {
      expect(formatDateWithDay(null)).toBe('');
    });
  });
});
