import { Inject, Injectable } from '@nestjs/common';
import {
  DELETE_ATTACHMENT_USE_CASE,
  DeleteAttachmentUseCase,
} from '../../../port/in/admin/attachment/DeleteAttachmentUseCase';
import {
  ATTACHMENT_REPOSITORY_PORT,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import {
  FILE_STORAGE_PORT,
  FileStoragePort,
} from '../../../port/out/shared/FileStoragePort';
import { AttachmentNotFoundException } from '@app/domain/exception/AttachmentNotFoundException';

export { DELETE_ATTACHMENT_USE_CASE };

@Injectable()
export class DeleteAttachmentService implements DeleteAttachmentUseCase {
  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    @Inject(ATTACHMENT_REPOSITORY_PORT)
    private readonly attachmentRepo: AttachmentRepositoryPort,
  ) {}

  async execute(id: string): Promise<void> {
    const record = await this.attachmentRepo.findById(id);
    if (!record) throw new AttachmentNotFoundException();

    // key = fileUrl 的最後兩段（<folder>/<uuid>.<ext>），與 base URL / driver 無關
    const key = record.fileUrl.split('/').slice(-2).join('/');
    await this.fileStorage.delete(key);
    await this.attachmentRepo.delete(id);
  }
}
