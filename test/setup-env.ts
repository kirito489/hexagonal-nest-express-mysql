/**
 * E2E 測試前設定最低限度的環境變數，
 * 確保 getEnv() singleton 在 Jest 啟動時能通過驗證。
 */
process.env.NODE_ENV = 'test';
process.env.ACCESS_SECRET = 'e2e-test-access-secret-min-32-chars!!'; // min(32)
process.env.REFRESH_SECRET = 'e2e-test-refresh-secret-min-32-chars!'; // min(32)
// ACCESS_TOKEN_EXPIRES_IN / REFRESH_TOKEN_EXPIRES_IN 有 schema default，不需設定
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USERNAME = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_DATABASE = 'test';
process.env.COOKIE_SECRET = 'e2e-test-cookie-secret-32-chars!!';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_KEY_PREFIX = 'test:';
process.env.PERMISSION_CACHE_TTL = '300';
process.env.DEFAULT_PAGE_LIMIT = '15';
process.env.BCRYPT_ROUNDS = '1'; // 測試環境使用最低 cost factor 加速
process.env.APP_TIMEZONE = 'Asia/Taipei';
process.env.NOTIFICATION_ALARM_HOUR = '8';
process.env.NOTIFICATION_ALARM_MINUTE = '0';
process.env.AWS_MEDIA_LIBRARY_ROOT = 'local';
