import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentFacade } from '@app/application/facade/admin/AttachmentFacade';
import { UploadAttachmentResult } from '@app/application/port/in/admin/attachment/UploadAttachmentUseCase';
import { InvalidUploadException } from '@app/domain/exception/InvalidUploadException';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import {
  CurrentMember,
  MemberContext,
} from '../../decorator/current-member.decorator';
import {
  UploadAttachmentRequest,
  uploadAttachmentSchema,
} from './UploadAttachmentRequest';

// multer 記憶體 storage 硬上限（防 OOM）；實際業務上限由 UploadAttachmentService 依 MAX_UPLOAD_BYTES 檢查
const MULTER_HARD_LIMIT = 20 * 1024 * 1024;

// 只取用到的欄位，避開 @types/multer 對 Express 全域擴充在 multer 2.x 的版本差異
interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller('admin/attachments')
export class AttachmentController {
  constructor(private readonly attachmentFacade: AttachmentFacade) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_HARD_LIMIT } }),
  )
  uploadAttachment(
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body(new ZodValidationPipe(uploadAttachmentSchema))
    dto: UploadAttachmentRequest,
    @CurrentMember() member: MemberContext,
  ): Promise<UploadAttachmentResult> {
    if (!file) {
      throw new InvalidUploadException('未提供檔案（欄位名須為 file）');
    }

    return this.attachmentFacade.upload({
      buffer: file.buffer,
      mimeType: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      folder: dto.folder,
      relatedTable: dto.relatedTable,
      relatedId: dto.relatedId,
      uploadedBy: member.sub,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.attachmentFacade.remove(id);
  }
}
