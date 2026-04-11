import { Inject, Injectable } from '@nestjs/common';
import {
  LIST_ROLE_OPTIONS_USE_CASE,
  ListRoleOptionsUseCase,
  RoleOptionItem,
} from '../../port/in/member/ListRoleOptionsUseCase';
import { LOAD_ROLE_PORT, LoadRolePort } from '../../port/out/role/LoadRolePort';

export { LIST_ROLE_OPTIONS_USE_CASE };

@Injectable()
export class ListRoleOptionsService implements ListRoleOptionsUseCase {
  constructor(
    @Inject(LOAD_ROLE_PORT)
    private readonly loadRole: LoadRolePort,
  ) {}

  execute(): Promise<RoleOptionItem[]> {
    return this.loadRole.listActiveRoles();
  }
}
