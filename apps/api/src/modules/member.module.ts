import { Module, forwardRef } from '@nestjs/common';
import { MemberController } from '../adapter/in/web/member/MemberController';
import { ProfileController } from '../adapter/in/web/profile/ProfileController';
import { MemberFacade } from '../application/facade/MemberFacade';
import { ListMembersService } from '../application/service/member/ListMembersService';
import { GetMemberService } from '../application/service/member/GetMemberService';
import {
  CreateMemberService,
  BCRYPT_ROUNDS,
} from '../application/service/member/CreateMemberService';
import { UpdateMemberService } from '../application/service/member/UpdateMemberService';
import { DeleteMemberService } from '../application/service/member/DeleteMemberService';
import { ListRoleOptionsService } from '../application/service/member/ListRoleOptionsService';
import { PasswordPolicyService } from '../application/service/PasswordPolicyService';
import { PrismaMemberRepository } from '../adapter/out/persistence/member/PrismaMemberRepository';
import { LIST_MEMBERS_USE_CASE } from '../application/port/in/member/ListMembersUseCase';
import { GET_MEMBER_USE_CASE } from '../application/port/in/member/GetMemberUseCase';
import { CREATE_MEMBER_USE_CASE } from '../application/port/in/member/CreateMemberUseCase';
import { UPDATE_MEMBER_USE_CASE } from '../application/port/in/member/UpdateMemberUseCase';
import { DELETE_MEMBER_USE_CASE } from '../application/port/in/member/DeleteMemberUseCase';
import { LIST_ROLE_OPTIONS_USE_CASE } from '../application/port/in/member/ListRoleOptionsUseCase';
import { LOAD_MEMBER_PORT } from '../application/port/out/member/LoadMemberPort';
import { SAVE_MEMBER_PORT } from '../application/port/out/member/SaveMemberPort';
import { LOAD_MEMBER_CONTEXT_PORT } from '../application/port/out/member/LoadMemberContextPort';
import { UPDATE_MEMBER_PASSWORD_PORT } from '../application/port/out/member/UpdateMemberPasswordPort';
import { JwtModule } from './jwt.module';
import { RoleModule } from './role.module';
import { getEnv } from '../infrastructure/validate-env';

@Module({
  imports: [JwtModule, forwardRef(() => RoleModule)],
  controllers: [MemberController, ProfileController],
  providers: [
    PrismaMemberRepository,
    { provide: LOAD_MEMBER_PORT, useExisting: PrismaMemberRepository },
    { provide: SAVE_MEMBER_PORT, useExisting: PrismaMemberRepository },
    {
      provide: LOAD_MEMBER_CONTEXT_PORT,
      useExisting: PrismaMemberRepository,
    },
    {
      provide: UPDATE_MEMBER_PASSWORD_PORT,
      useExisting: PrismaMemberRepository,
    },
    { provide: BCRYPT_ROUNDS, useFactory: () => getEnv().BCRYPT_ROUNDS },
    PasswordPolicyService,
    { provide: LIST_MEMBERS_USE_CASE, useClass: ListMembersService },
    { provide: GET_MEMBER_USE_CASE, useClass: GetMemberService },
    { provide: CREATE_MEMBER_USE_CASE, useClass: CreateMemberService },
    { provide: UPDATE_MEMBER_USE_CASE, useClass: UpdateMemberService },
    { provide: DELETE_MEMBER_USE_CASE, useClass: DeleteMemberService },
    { provide: LIST_ROLE_OPTIONS_USE_CASE, useClass: ListRoleOptionsService },
    MemberFacade,
  ],
  exports: [
    LOAD_MEMBER_PORT,
    SAVE_MEMBER_PORT,
    LOAD_MEMBER_CONTEXT_PORT,
    UPDATE_MEMBER_PASSWORD_PORT,
  ],
})
export class MemberModule {}
