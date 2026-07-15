import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  UPLOAD_ATTACHMENT_USE_CASE,
  UploadAttachmentCommand,
  UploadAttachmentResult,
  UploadAttachmentUseCase,
} from '../../../port/in/admin/attachment/UploadAttachmentUseCase';
import {
  ATTACHMENT_REPOSITORY_PORT,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import {
  FILE_STORAGE_PORT,
  FileStoragePort,
} from '../../../port/out/shared/FileStoragePort';
import {
  extForMime,
  isAllowedMime,
  isUploadFolder,
} from '../../../../shared/constants/upload';
import { InvalidUploadException } from '../../../../domain/exception/InvalidUploadException';
import { getEnv } from '../../../../infrastructure/validate-env';

export { UPLOAD_ATTACHMENT_USE_CASE };

@Injectable()
export class UploadAttachmentService implements UploadAttachmentUseCase {
  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    @Inject(ATTACHMENT_REPOSITORY_PORT)
    private readonly attachmentRepo: AttachmentRepositoryPort,
  ) {}

  async execute(
    command: UploadAttachmentCommand,
  ): Promise<UploadAttachmentResult> {
    if (!isUploadFolder(command.folder)) {
      throw new InvalidUploadException(`不允許的上傳資料夾：${command.folder}`);
    }
    if (!isAllowedMime(command.mimeType)) {
      throw new InvalidUploadException(`不允許的檔案類型：${command.mimeType}`);
    }
    const maxBytes = getEnv().MAX_UPLOAD_BYTES;
    if (command.size > maxBytes) {
      throw new InvalidUploadException(`檔案過大（上限 ${maxBytes} bytes）`);
    }

    // 副檔名一律由「驗過的 MIME」推導，不取 client 原始檔名（擋 evil.png.html 之類 stored XSS）
    const ext = extForMime(command.mimeType);
    const key = `${command.folder}/${randomUUID()}.${ext}`;

    const url = await this.fileStorage.upload({
      key,
      buffer: command.buffer,
      mimeType: command.mimeType,
    });

    // multipart header 常以 latin1 傳中文檔名，存入前還原成 UTF-8
    const fileName = Buffer.from(command.originalName, 'latin1').toString(
      'utf8',
    );

    const saved = await this.attachmentRepo.save({
      fileName,
      fileUrl: url,
      fileType: command.mimeType,
      fileSize: command.size,
      relatedTable: command.relatedTable,
      relatedId: command.relatedId,
      uploadedBy: command.uploadedBy ?? null,
    });

    return { id: saved.id, url };
  }
}
