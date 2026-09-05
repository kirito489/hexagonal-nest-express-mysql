import { Inject, Injectable } from '@nestjs/common';
import {
  UPDATE_ROLE_USE_CASE,
  UpdateRoleCommand,
  UpdateRoleUseCase,
} from '../../../port/in/admin/role/UpdateRoleUseCase';
import {
  ROLE_REPOSITORY_PORT,
  RoleRepositoryPort,
} from '../../../port/out/role/RoleRepositoryPort';
import {
  PERMISSION_REPOSITORY_PORT,
  PermissionRepositoryPort,
} from '../../../port/out/role/PermissionRepositoryPort';
import { RoleNotFoundException } from '@app/domain/exception/RoleNotFoundException';
import { DuplicateRoleNameException } from '@app/domain/exception/DuplicateRoleNameException';
import { DefaultRoleNotEditableException } from '@app/domain/exception/DefaultRoleNotEditableException';
import {
  LOAD_MEMBER_PORT,
  LoadMemberPort,
} from '../../../port/out/member/LoadMemberPort';
import {
  CLEAR_MEMBER_CONTEXT_PORT,
  ClearMemberContextPort,
} from '../../../port/out/member/ClearMemberContextPort';
import { validatePermissions } from './permission-validator';

export { UPDATE_ROLE_USE_CASE };

@Injectable()
export class UpdateRoleService implements UpdateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY_PORT)
    private readonly roleRepo: RoleRepositoryPort,
    @Inject(PERMISSION_REPOSITORY_PORT)
    private readonly permissionRepo: PermissionRepositoryPort,
    @Inject(LOAD_MEMBER_PORT)
    private readonly loadMember: LoadMemberPort,
    @Inject(CLEAR_MEMBER_CONTEXT_PORT)
    private readonly clearMemberContext: ClearMemberContextPort,
  ) {}

  async execute(command: UpdateRoleCommand): Promise<void> {
    const role = await this.roleRepo.findById(command.id);
    if (!role) throw new RoleNotFoundException();
    if (role.isDefault) throw new DefaultRoleNotEditableException();

    if (command.name !== undefined && command.name !== role.name) {
      const conflict = await this.roleRepo.findByName(command.name);
      if (conflict) throw new DuplicateRoleNameException(command.name);
    }

    if (command.permissionCodes !== undefined) {
      await validatePermissions(command.permissionCodes, this.permissionRepo);
    }

    await this.roleRepo.updateWithPermissions(
      command.id,
      command.name,
      command.permissionCodes,
      command.status,
    );

    // MemberContext 快取帶 roleName / roleCode / permissions 三者，效期 PERMISSION_CACHE_TTL
    // （預設 300 秒）。不清的話，撤銷一個權限最多要等一個效期才生效，
    // 而資料庫與畫面都顯示已經撤銷了——沒有任何錯誤訊息。
    //
    // **一律清，不判斷「這次改的是不是授權」**：判斷需要比對前後的權限集合，
    // 而寫錯的方向是該清沒清；多清的代價只是那些人的下一個請求回頭查一次 DB。
    //
    // 失敗不 catch：語意是「權限改了但沒有生效」，回報成功會讓呼叫端
    // 處於一個他不知道的狀態。
    const memberIds = await this.loadMember.findMemberIdsByRoleId(command.id);
    await this.clearMemberContext.clearMany(memberIds);
  }
}
