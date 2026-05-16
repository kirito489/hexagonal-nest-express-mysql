import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ForgotPasswordCommand,
  ForgotPasswordUseCase,
} from '../../port/in/auth/ForgotPasswordUseCase';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../port/out/member/LoadMemberPort';
import {
  PASSWORD_RESET_TOKEN_PORT,
  PasswordResetTokenPort,
} from '../../port/out/auth/PasswordResetTokenPort';
import {
  SEND_EMAIL_PORT,
  SendEmailPort,
} from '../../port/out/shared/SendEmailPort';
import { getEnv } from '../../../infrastructure/validate-env';

/**
 * 忘記密碼服務：產生重設 token 並寄送信件。
 * 為避免資訊洩漏，即使 email 不存在也不回傳錯誤。
 */
@Injectable()
export class ForgotPasswordService implements ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordService.name);

  constructor(
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(PASSWORD_RESET_TOKEN_PORT)
    private readonly resetToken: PasswordResetTokenPort,
    @Inject(SEND_EMAIL_PORT)
    private readonly sendEmail: SendEmailPort,
  ) {}

  async execute(command: ForgotPasswordCommand): Promise<void> {
    const member = await this.loadMember.loadMemberByEmail(command.email);

    // 即使帳號不存在也不回報，防止帳號列舉攻擊
    if (!member) {
      this.logger.debug(`忘記密碼：email ${command.email} 不存在，靜默略過`);
      return;
    }

    const env = getEnv();
    const token = await this.resetToken.createToken(
      member.id.toString(),
      env.APP_PASSWORD_RESET_TOKEN_EXPIRES_IN,
    );

    const resetUrl = env.APP_PASSWORD_RESET_URL
      ? `${env.APP_PASSWORD_RESET_URL}?token=${token}`
      : `#token=${token}`;

    try {
      await this.sendEmail.sendMail({
        to: command.email,
        subject: '密碼重設通知',
        html: `
          <p>您好，</p>
          <p>我們收到您的密碼重設請求。請點擊以下連結重設密碼：</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>此連結將在 ${env.APP_PASSWORD_RESET_TOKEN_EXPIRES_IN} 分鐘後失效。</p>
          <p>如果您沒有提出此請求，請忽略此信件。</p>
        `,
      });
    } catch (err) {
      this.logger.error('密碼重設信件寄送失敗', err);
      // 不拋出錯誤，避免暴露使用者是否存在
    }
  }
}
