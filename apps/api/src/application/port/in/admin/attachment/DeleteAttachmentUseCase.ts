export const DELETE_ATTACHMENT_USE_CASE = 'DELETE_ATTACHMENT_USE_CASE';

export interface DeleteAttachmentUseCase {
  execute(id: string): Promise<void>;
}
