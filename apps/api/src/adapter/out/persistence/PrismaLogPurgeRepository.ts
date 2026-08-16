import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/infrastructure/prisma/prisma.service';
import {
  PurgeLogsPort,
  PurgeLogsResult,
} from '@app/application/port/out/shared/PurgeLogsPort';

@Injectable()
export class PrismaLogPurgeRepository implements PurgeLogsPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 刪除 createdAt 早於 cutoff 的日誌
   *
   * 兩張表刻意分開刪除、不包 transaction：它們之間沒有一致性關係，
   * 而長交易在大量刪除時會壓住 undo log 並拉長鎖持有時間。
   *
   * @param cutoff - 保留界線
   * @returns 兩張表各自刪除的筆數
   */
  async purgeLogsBefore(cutoff: Date): Promise<PurgeLogsResult> {
    const systemLogs = await this.prisma.systemLogRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const authLogs = await this.prisma.authLogRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return { systemLogs: systemLogs.count, authLogs: authLogs.count };
  }
}
