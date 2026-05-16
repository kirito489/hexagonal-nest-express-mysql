import { Controller, Get, UseGuards } from '@nestjs/common';
import { MemberFacade } from '../../../../application/facade/MemberFacade';
import { JwtAuthGuard } from '../guard/JwtAuthGuard';
import {
  CurrentMember,
  MemberContext,
} from '../decorator/current-member.decorator';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly memberFacade: MemberFacade) {}

  @Get()
  getProfile(@CurrentMember() actor: MemberContext) {
    return this.memberFacade.getMyProfile(actor.sub);
  }
}
