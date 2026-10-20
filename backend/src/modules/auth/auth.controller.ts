import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto,
  MfaCodeDto,
  MfaRequiredResponse,
  MfaVerifyDto,
  RefreshTokenDto,
  RegisterDto,
  TokenPairResponse,
} from './dto/auth.dto';

/** Stricter limit for credential endpoints: 10 requests per minute per IP. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@ApiExtraModels(TokenPairResponse, MfaRequiredResponse)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Register a patient or doctor account' })
  @ApiOkResponse({ type: TokenPairResponse })
  register(@Body() dto: RegisterDto, @ReqContext() ctx: RequestContext) {
    return this.auth.register(dto, ctx);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login. Returns tokens, or an MFA challenge for MFA-enabled accounts' })
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(TokenPairResponse) }, { $ref: getSchemaPath(MfaRequiredResponse) }],
    },
  })
  login(@Body() dto: LoginDto, @ReqContext() ctx: RequestContext) {
    return this.auth.login(dto, ctx);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete an MFA login challenge' })
  @ApiOkResponse({ type: TokenPairResponse })
  verifyMfa(@Body() dto: MfaVerifyDto, @ReqContext() ctx: RequestContext) {
    return this.auth.verifyMfa(dto.mfaToken, dto.code, ctx);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token' })
  @ApiOkResponse({ type: TokenPairResponse })
  refresh(@Body() dto: RefreshTokenDto, @ReqContext() ctx: RequestContext) {
    return this.auth.refresh(dto.refreshToken, ctx);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token family for this device' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefreshTokenDto,
    @ReqContext() ctx: RequestContext,
  ) {
    await this.auth.logout(user.id, dto.refreshToken, ctx);
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Generate a TOTP secret (doctor/admin). Returns the secret once.' })
  setupMfa(@CurrentUser() user: AuthUser) {
    return this.auth.setupMfa(user.id);
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm the TOTP secret with a code and enable MFA' })
  async enableMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaCodeDto, @ReqContext() ctx: RequestContext) {
    await this.auth.enableMfa(user.id, dto.code, ctx);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable MFA (requires a valid current code)' })
  async disableMfa(
    @CurrentUser() user: AuthUser,
    @Body() dto: MfaCodeDto,
    @ReqContext() ctx: RequestContext,
  ) {
    await this.auth.disableMfa(user.id, dto.code, ctx);
  }
}
