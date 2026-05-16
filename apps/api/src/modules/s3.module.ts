import { Module } from '@nestjs/common';
import { S3FileStorageAdapter } from '../adapter/out/s3/S3FileStorageAdapter';
import { FILE_STORAGE_PORT } from '../application/port/out/shared/FileStoragePort';

@Module({
  providers: [
    S3FileStorageAdapter,
    {
      provide: FILE_STORAGE_PORT,
      useExisting: S3FileStorageAdapter,
    },
  ],
  exports: [FILE_STORAGE_PORT],
})
export class S3Module {}
