jest.mock('../../../../infrastructure/validate-env', () => ({
  getEnv: () => ({ MAX_UPLOAD_BYTES: 5_242_880 }),
}));

import { UploadAttachmentService } from './UploadAttachmentService';
import { FileStoragePort } from '../../../port/out/shared/FileStoragePort';
import {
  AttachmentRecord,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import { InvalidUploadException } from '../../../../domain/exception/InvalidUploadException';
import { UploadAttachmentCommand } from '../../../port/in/admin/attachment/UploadAttachmentUseCase';

describe('UploadAttachmentService', () => {
  const fileStorage: jest.Mocked<FileStoragePort> = {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
  const attachmentRepo: jest.Mocked<AttachmentRepositoryPort> = {
    save: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  };
  let service: UploadAttachmentService;

  const baseCmd: UploadAttachmentCommand = {
    buffer: Buffer.from('x'),
    mimeType: 'image/png',
    size: 1000,
    originalName: 'a.png',
    folder: 'avatars',
    relatedTable: 'members',
    relatedId: 'm1',
    uploadedBy: 'u1',
  };

  const savedRecord: AttachmentRecord = {
    id: 'a1',
    fileName: 'a.png',
    fileUrl: '/media/avatars/uuid.png',
    fileType: 'image/png',
    fileSize: 1000,
    relatedTable: 'members',
    relatedId: 'm1',
    uploadedBy: 'u1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UploadAttachmentService(fileStorage, attachmentRepo);
  });

  it('合法上傳 → 存檔 + 落 attachment，回 { id, url }；副檔名由 MIME 推導', async () => {
    fileStorage.upload.mockResolvedValue('/media/avatars/uuid.png');
    attachmentRepo.save.mockResolvedValue(savedRecord);

    const res = await service.execute(baseCmd);

    expect(fileStorage.upload.mock.calls[0][0].key).toMatch(
      /^avatars\/.+\.png$/,
    );
    expect(attachmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fileUrl: '/media/avatars/uuid.png',
        fileType: 'image/png',
        relatedTable: 'members',
      }),
    );
    expect(res).toEqual({ id: 'a1', url: '/media/avatars/uuid.png' });
  });

  it('不允許的 folder → InvalidUploadException，不寫檔', async () => {
    await expect(
      service.execute({ ...baseCmd, folder: 'evil' }),
    ).rejects.toBeInstanceOf(InvalidUploadException);
    expect(fileStorage.upload).not.toHaveBeenCalled();
  });

  it('不允許的 MIME → InvalidUploadException', async () => {
    await expect(
      service.execute({ ...baseCmd, mimeType: 'text/html' }),
    ).rejects.toBeInstanceOf(InvalidUploadException);
  });

  it('超過大小上限 → InvalidUploadException', async () => {
    await expect(
      service.execute({ ...baseCmd, size: 5_242_881 }),
    ).rejects.toBeInstanceOf(InvalidUploadException);
  });
});
