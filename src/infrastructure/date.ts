import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/zh-tw';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Taipei');
dayjs.locale('zh-tw');

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

export const formatDate = (d: Date | string | null): string => {
  if (!d) return '';
  return dayjs(d).format('YYYY-MM-DD');
};

export const formatYMD = (y: number, m: number, d: number): string =>
  dayjs(new Date(y, m - 1, d)).format('YYYY年MM月DD日');

export const formatDateWithDay = (d: Date | string | null): string => {
  if (!d) return '';
  const date = dayjs(d);
  return `${date.format('YYYY-MM-DD')} (${DAY_NAMES[date.day()]})`;
};

export default dayjs;
