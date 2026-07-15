import { DeleteAttachmentService } from './DeleteAttachmentService';
import { FileStoragePort } from '../../../port/out/shared/FileStoragePort';
import {
  AttachmentRecord,
  AttachmentRepositoryPort,
} from '../../../port/out/attachment/AttachmentRepositoryPort';
import { AttachmentNotFoundException } from '../../../../domain/exception/AttachmentNotFoundException';

describe('DeleteAttachmentService', () => {
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
  let service: DeleteAttachmentService;

  const record: AttachmentRecord = {
    id: 'a1',
    fileName: 'a.png',
    fileUrl: 'http://cdn.example.com/media/avatars/uuid.png',
    fileType: 'image/png',
    fileSize: 1000,
    relatedTable: 'members',
    relatedId: 'm1',
    uploadedBy: 'u1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeleteAttachmentService(fileStorage, attachmentRepo);
  });

  it('存在 → 以 fileUrl 尾兩段組 key 刪 storage + 刪紀錄', async () => {
    attachmentRepo.findById.mockResolvedValue(record);

    await service.execute('a1');

    expect(fileStorage.delete).toHaveBeenCalledWith('avatars/uuid.png');
    expect(attachmentRepo.delete).toHaveBeenCalledWith('a1');
  });

  it('不存在 → AttachmentNotFoundException，不動 storage', async () => {
    attachmentRepo.findById.mockResolvedValue(null);

    await expect(service.execute('missing')).rejects.toBeInstanceOf(
      AttachmentNotFoundException,
    );
    expect(fileStorage.delete).not.toHaveBeenCalled();
    expect(attachmentRepo.delete).not.toHaveBeenCalled();
  });
});
