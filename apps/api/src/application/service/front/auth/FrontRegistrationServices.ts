import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  LOAD_USER_PORT,
  LoadUserPort,
} from '../../../port/out/user/LoadUserPort';
import {
  SAVE_USER_PORT,
  SaveUserPort,
} from '../../../port/out/user/SaveUserPort';
import {
  USER_TOKEN_PORT,
  UserTokenPort,
} from '../../../port/out/user/UserTokenPort';
import {
  SEND_EMAIL_PORT,
  SendEmailPort,
} from '../../../port/out/shared/SendEmailPort';
import {
  FrontForgotPasswordUseCase,
  FrontRegisterCommand,
  FrontRegisterUseCase,
  FrontResendVerificationUseCase,
  FrontResetPasswordCommand,
  FrontResetPasswordUseCase,
  FrontVerifyEmailUseCase,
  VerifyEmailStatus,
} from '../../../port/in/front/auth/FrontRegistrationUseCases';
import { PasswordPolicyService } from '../../shared/PasswordPolicyService';
import { getEnv } from '@app/infrastructure/validate-env';
import { normalizeEmail } from '@app/shared/utils/normalize-email';
import { HttpMessages } from '@app/shared/constants/response-messages';
import { FrontMailTexts } from '@app/shared/constants/front-mail-texts';

/**
 * 組出信件裡的連結。
 *
 * `APP_FRONT_URL` 未設時退回相對路徑，讓 dev 不被卡住；
 * production 由 `validate-env` 強制必填——沒有它連結會指向 `undefined/...`，
 * 而那個錯誤要等第一個使用者點信才會被發現。
 */
const buildFrontUrl = (path: string, query: string): string => {
  const base = getEnv().APP_FRONT_URL ?? '';
  return `${base}${path}?${query}`;
};

/**
 * 寄信一律 fire-and-forget。
 *
 * **不是為了效能，是為了不洩漏帳號是否存在**：SMTP 設定了卻連不上時會走滿
 * connectionTimeout（預設 10 秒），讓「帳號存在」的回應比「不存在」慢兩個
 * 數量級——那是比狀態碼更明顯的列舉訊號。沿用 admin `ForgotPasswordService` 的寫法。
 */
const sendInBackground = (
  sendEmail: SendEmailPort,
  logger: Logger,
  mail: { to: string; subject: string; html: string },
): void => {
  void (async () => {
    try {
      await sendEmail.sendMail(mail);
    } catch (err) {
      // 不拋出，避免把「寄信失敗」變成「帳號存在」的訊號
      logger.error(FrontMailTexts.SEND_FAILED, err);
    }
  })();
};

@Injectable()
export class FrontRegisterService implements FrontRegisterUseCase {
  private readonly logger = new Logger(FrontRegisterService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SEND_EMAIL_PORT) private readonly sendEmail: SendEmailPort,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  async execute(command: FrontRegisterCommand): Promise<void> {
    this.passwordPolicy.validateOrThrow(command.password);

    const email = normalizeEmail(command.email);
    const existing = await this.loadUser.loadCredentialsByEmail(email);

    // **已存在時不建帳號、不回報**：回 409「此信箱已註冊」是帳號列舉——
    // 任何人都能拿一份信箱清單問出誰在這個服務有帳號。
    // 改寄通知信給既有擁有者：真正的擁有者收得到，攻擊者從回應看不出差別
    if (existing) {
      sendInBackground(this.sendEmail, this.logger, {
        to: email,
        subject: FrontMailTexts.DUPLICATE_SUBJECT,
        html: FrontMailTexts.duplicateBody(buildFrontUrl('/login', '')),
      });
      return;
    }

    const env = getEnv();
    const passwordHash = await bcrypt.hash(command.password, env.BCRYPT_ROUNDS);
    const userId = await this.saveUser.createUser({
      email,
      password: passwordHash,
      displayName: command.displayName,
    });

    const token = await this.userToken.create(
      userId,
      'VERIFY_EMAIL',
      env.EMAIL_VERIFICATION_EXPIRES_IN,
    );
    sendInBackground(this.sendEmail, this.logger, {
      to: email,
      subject: FrontMailTexts.VERIFY_SUBJECT,
      html: FrontMailTexts.verifyBody(
        `${env.API_BASE_URL ?? ''}/api/front/auth/verify-email?token=${token}`,
        env.EMAIL_VERIFICATION_EXPIRES_IN,
      ),
    });
  }
}

@Injectable()
export class FrontVerifyEmailService implements FrontVerifyEmailUseCase {
  constructor(
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
  ) {}

  async execute(token: string): Promise<VerifyEmailStatus> {
    const claimed = await this.userToken.claim(token, 'VERIFY_EMAIL');
    // claim 失敗涵蓋「不存在 / 已使用 / 已過期 / 用途不符」四種。
    // **不再查一次去區分「過期」與「無效」**：那需要第二次查詢，
    // 而對使用者而言下一步都是「重新寄一封」
    if (!claimed) return 'invalid';

    await this.saveUser.markEmailVerified(claimed.userId);
    return 'success';
  }
}

@Injectable()
export class FrontResendVerificationService implements FrontResendVerificationUseCase {
  private readonly logger = new Logger(FrontResendVerificationService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SEND_EMAIL_PORT) private readonly sendEmail: SendEmailPort,
  ) {}

  async execute(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const user = await this.loadUser.loadCredentialsByEmail(normalized);

    // 不存在或已驗證都靜默略過——回應與「有寄」時完全相同
    if (!user || user.emailVerified) return;

    // 先作廢舊的：兩枚同時有效的驗證連結沒有意義，而舊的那枚會在信箱裡留更久
    await this.userToken.invalidateAll(user.id, 'VERIFY_EMAIL');

    const env = getEnv();
    const token = await this.userToken.create(
      user.id,
      'VERIFY_EMAIL',
      env.EMAIL_VERIFICATION_EXPIRES_IN,
    );
    sendInBackground(this.sendEmail, this.logger, {
      to: normalized,
      subject: FrontMailTexts.VERIFY_SUBJECT,
      html: FrontMailTexts.verifyBody(
        `${env.API_BASE_URL ?? ''}/api/front/auth/verify-email?token=${token}`,
        env.EMAIL_VERIFICATION_EXPIRES_IN,
      ),
    });
  }
}

@Injectable()
export class FrontForgotPasswordService implements FrontForgotPasswordUseCase {
  private readonly logger = new Logger(FrontForgotPasswordService.name);

  constructor(
    @Inject(LOAD_USER_PORT) private readonly loadUser: LoadUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    @Inject(SEND_EMAIL_PORT) private readonly sendEmail: SendEmailPort,
  ) {}

  async execute(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const user = await this.loadUser.loadCredentialsByEmail(normalized);

    if (!user) {
      // **不記錄 email 本身**：log 會累積成一份「哪些信箱未註冊」的列舉資料
      this.logger.debug(FrontMailTexts.FORGOT_SKIPPED);
      return;
    }

    const env = getEnv();
    const token = await this.userToken.create(
      user.id,
      'RESET_PASSWORD',
      env.FRONT_PASSWORD_RESET_EXPIRES_IN,
    );
    sendInBackground(this.sendEmail, this.logger, {
      to: normalized,
      subject: FrontMailTexts.RESET_SUBJECT,
      html: FrontMailTexts.resetBody(
        buildFrontUrl('/reset-password', `token=${token}`),
        env.FRONT_PASSWORD_RESET_EXPIRES_IN,
      ),
    });
  }
}

@Injectable()
export class FrontResetPasswordService implements FrontResetPasswordUseCase {
  constructor(
    @Inject(SAVE_USER_PORT) private readonly saveUser: SaveUserPort,
    @Inject(USER_TOKEN_PORT) private readonly userToken: UserTokenPort,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  async execute(command: FrontResetPasswordCommand): Promise<void> {
    // 先驗密碼政策再 claim：反過來的話 token 會被消耗掉，
    // 而使用者只是密碼打太短，卻得重新申請一封信
    this.passwordPolicy.validateOrThrow(command.newPassword);

    const claimed = await this.userToken.claim(command.token, 'RESET_PASSWORD');
    if (!claimed) {
      throw new BadRequestException(HttpMessages.RESET_TOKEN_INVALID);
    }

    const passwordHash = await bcrypt.hash(
      command.newPassword,
      getEnv().BCRYPT_ROUNDS,
    );
    // updatePassword 會一併遞增 tokenVersion（見 SaveUserPort 的說明）
    await this.saveUser.updatePassword(claimed.userId, passwordHash);

    // 作廢其他未使用的重設 token：同一批信裡的其他連結不該還能用
    await this.userToken.invalidateAll(claimed.userId, 'RESET_PASSWORD');
  }
}
