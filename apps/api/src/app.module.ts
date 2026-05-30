import { Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { RedisThrottlerStorage } from './infrastructure/redis/redis-throttler.storage';
import { RedisService } from './infrastructure/redis/redis.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './modules/redis.module';
import { FeatureFlagModule } from './modules/feature-flag.module';
import { AuthLogModule } from './modules/auth-log.module';
import { SecurityModule } from './modules/security.module';
import { RecaptchaModule } from './modules/recaptcha.module';
import { SystemLogModule } from './modules/system-log.module';
import { EmailModule } from './modules/email.module';
import { FirebaseModule } from './modules/firebase.module';
import { S3Module } from './modules/s3.module';
import { MemberModule } from './modules/member.module';
import { AuthModule } from './modules/auth.module';
import { RoleModule } from './modules/role.module';
import { GlobalExceptionFilter } from './adapter/in/web/filter/GlobalExceptionFilter';
import { LoggingInterceptor } from './adapter/in/web/interceptor/LoggingInterceptor';
import { TransformInterceptor } from './adapter/in/web/interceptor/TransformInterceptor';
import { IpBlacklistGuard } from './adapter/in/web/guard/IpBlacklistGuard';
import { IpWhitelistGuard } from './adapter/in/web/guard/IpWhitelistGuard';
import { SessionIdleGuard } from './adapter/in/web/guard/SessionIdleGuard';
import { HealthModule } from './modules/health.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { getEnv } from './infrastructure/validate-env';

@Module({
  imports: [
    // Pino logger（request-level logging + pino-pretty / pino-roll）
    LoggerModule.forRootAsync({
      useFactory: () => {
        const env = getEnv();
        const isDev = env.NODE_ENV !== 'production';
        const isTest = env.NODE_ENV === 'test';
        return {
          // Express 5 使用 named wildcard，避免 LegacyRouteConverter 警告
          forRoutes: [{ path: '/*path', method: RequestMethod.ALL }],
          pinoHttp: {
            genReqId: () => randomUUID(),
            level: env.LOG_LEVEL,
            name: env.SERVICE_NAME,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.body.password',
                'req.body.token',
              ],
              censor: '[REDACTED]',
            },
            // 預設 serializer 會 dump 整包 req/res（含所有 headers、cookies），dev 看不清楚。
            // 只保留必要欄位，需要除錯時改 LOG_LEVEL=debug 並還原這段
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            transport: {
              targets: [
                ...(isDev
                  ? [
                      {
                        target: 'pino-pretty',
                        options: {
                          colorize: true,
                          translateTime: 'HH:MM:ss',
                          // 把 context 移到訊息前綴，並隱藏 pid / hostname 與第二行的 context
                          messageFormat: '[{context}] {msg}',
                          ignore: 'pid,hostname,context',
                          singleLine: true,
                        },
                        level: env.LOG_LEVEL,
                      },
                    ]
                  : []),
                // test 環境不寫入 log 檔案，避免 CI 產生無用的 logs/
                ...(!isTest
                  ? [
                      {
                        target: 'pino-roll',
                        options: {
                          file: 'logs/error.log',
                          limit: { size: '5m', count: 10 },
                          mkdir: true,
                        },
                        level: 'error',
                      },
                      {
                        target: 'pino-roll',
                        options: {
                          file: 'logs/combined.log',
                          limit: { size: '5m', count: 10 },
                          mkdir: true,
                        },
                        level: env.LOG_LEVEL,
                      },
                    ]
                  : []),
              ],
            },
          },
        };
      },
    }),
    // 全域速率限制：使用 Redis 儲存支援水平擴展
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => {
        const env = getEnv();
        return {
          throttlers: [
            {
              ttl: env.COMMON_RATE_LIMIT_WINDOW_MS,
              limit: env.COMMON_RATE_LIMIT_MAX_REQUESTS,
            },
          ],
          storage: new RedisThrottlerStorage(redis),
        };
      },
    }),
    PrismaModule,
    RedisModule,
    FeatureFlagModule,
    AuthLogModule,
    SecurityModule,
    RecaptchaModule,
    SystemLogModule,
    EmailModule,
    FirebaseModule,
    S3Module,
    RoleModule,
    MemberModule,
    AuthModule,
    HealthModule,
    // Sentry NestJS 整合（事件實際送出與否由 instrument.ts 的 enabled 控制）
    SentryModule.forRoot(),
    // Prometheus metrics：flag 開啟才掛載，曝露 GET /api/metrics（含 Node/process 預設指標）
    ...(getEnv().APPLICATION_METRICS_ENABLED
      ? [PrometheusModule.register({ defaultMetrics: { enabled: true } })]
      : []),
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: IpBlacklistGuard },
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
    { provide: APP_GUARD, useClass: SessionIdleGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
