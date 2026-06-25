import { Module } from '@nestjs/common';
import { ExampleScheduler } from '../adapter/in/scheduler/ExampleScheduler';

/**
 * 排程模組：集中宣告以 @nestjs/schedule 動態 cron 為基礎的排程器。
 *
 * SchedulerRegistry 由 AppModule 的 `ScheduleModule.forRoot()` 全域提供，此處只需註冊排程器 provider。
 * 新增排程：仿照 ExampleScheduler 建立排程器，再加進此 providers 即可。
 */
@Module({
  providers: [ExampleScheduler],
})
export class SchedulerModule {}
