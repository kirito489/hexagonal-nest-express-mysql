import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ResetPasswordCommand,
  ResetPasswordUseCase,
} from '../../port/in/auth/ResetPasswordUseCase';
import {
  PASSWORD_RESET_TOKEN_PORT,
  PasswordResetTokenPort,
} from '../../port/out/auth/PasswordResetTokenPort';
import {
  UPDATE_MEMBER_PASSWORD_PORT,
  UpdateMemberPasswordPort,
} from '../../port/out/member/UpdateMemberPasswordPort';
import {
  CLEAR_MEMBER_CONTEXT_PORT,
  ClearMemberContextPort,
} from '../../port/out/member/ClearMemberContextPort';
import {
  SAVE_AUTH_LOG_PORT,
  SaveAuthLogPort,
} from '../../port/out/auth/SaveAuthLogPort';
import { PasswordPolicyService } from '../PasswordPolicyService';
import { FeatureFlagService } from '../FeatureFlagService';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * 重設密碼服務：驗證 token → 驗證密碼策略 → 更新密碼。
 * 若啟用「重設後強制登出」，會清除 MemberContext 快取。
 */
@Injectable()
export class ResetPasswordService implements ResetPasswordUseCase {
  private readonly logger = new Logger(ResetPasswordService.name);

  constructor(
    @Inject(PASSWORD_RESET_TOKEN_PORT)
    private readonly resetToken: PasswordResetTokenPort,
    @Inject(UPDATE_MEMBER_PASSWORD_PORT)
    private readonly updatePassword: UpdateMemberPasswordPort,
    @Inject(CLEAR_MEMBER_CONTEXT_PORT)
    private readonly clearMemberContext: ClearMemberContextPort,
    @Inject(SAVE_AUTH_LOG_PORT)
    private readonly saveAuthLog: SaveAuthLogPort,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    // 驗證 token
    const result = await this.resetToken.validateToken(command.token);
    if (!result) {
      throw new BadRequestException('重設密碼連結無效或已過期');
    }

    // 驗證新密碼是否符合策略
    this.passwordPolicy.validateOrThrow(command.newPassword);

    // 雜湊新密碼
    const env = getEnv();
    const passwordHash = await bcrypt.hash(
      command.newPassword,
      env.BCRYPT_ROUNDS,
    );

    // 更新密碼
    await this.updatePassword.updatePassword(result.memberId, passwordHash);

    // 標記 token 已使用
    await this.resetToken.markUsed(command.token);

    // 強制登出（清除 MemberContext 快取）
    if (env.APPLICATION_IS_LOGOUT_AFTER_PASSWORD_RESET) {
      await this.clearMemberContext.clearMemberContext(result.memberId);
    }

    // 記錄日誌
    if (this.featureFlags.isEnabled('authLogEnabled')) {
      try {
        await this.saveAuthLog.saveAuthLog({
          memberId: result.memberId,
          email: '',
          action: 'PASSWORD_RESET',
          detail: '密碼已重設',
        });
      } catch (err) {
        this.logger.error('密碼重設日誌寫入失敗', err);
      }
    }
  }
}
