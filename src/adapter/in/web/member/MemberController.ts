import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MemberFacade } from '../../../../application/facade/MemberFacade';
import { JwtAuthGuard } from '../guard/JwtAuthGuard';
import { PermissionsGuard } from '../guard/PermissionsGuard';
import { Permissions } from '../decorator/permissions.decorator';
import {
  CurrentMember,
  MemberContext,
} from '../decorator/current-member.decorator';
import { PermissionCode } from '../../../../domain/value-object/Role';
import { ZodValidationPipe } from '../../../../infrastructure/zod-validation.pipe';
import { listMembersQuerySchema, ListMembersQuery } from './ListMembersQuery';
import { createMemberSchema, CreateMemberRequest } from './CreateMemberRequest';
import { updateMemberSchema, UpdateMemberRequest } from './UpdateMemberRequest';

@Controller('members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberController {
  constructor(private readonly memberFacade: MemberFacade) {}

  @Get()
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  listMembers(
    @Query(new ZodValidationPipe(listMembersQuerySchema))
    query: ListMembersQuery,
  ) {
    return this.memberFacade.listMembers(query);
  }

  @Get('role/options')
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  listRoleOptions() {
    return this.memberFacade.listRoleOptions();
  }

  @Get(':id')
  @Permissions(PermissionCode.BACKEND_ACCOUNT_VIEW)
  getMember(@Param('id', ParseUUIDPipe) id: string) {
    return this.memberFacade.getMember(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  createMember(
    @Body(new ZodValidationPipe(createMemberSchema)) dto: CreateMemberRequest,
  ) {
    return this.memberFacade.createMember(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  async updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberRequest,
    @CurrentMember() actor: MemberContext,
  ) {
    await this.memberFacade.updateMember({ id, actorId: actor.sub, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PermissionCode.BACKEND_ACCOUNT_EDIT)
  async deleteMember(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentMember() actor: MemberContext,
  ) {
    await this.memberFacade.deleteMember({ id, actorId: actor.sub });
  }
}
