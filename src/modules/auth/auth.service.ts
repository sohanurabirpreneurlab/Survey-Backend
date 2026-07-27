import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { signAccessToken } from "../../common/security/access-token";
import { hashPassword, verifyPassword } from "../../common/security/password-hash";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { logger } from "../../common/utils/logger";
import { env } from "../../config/env";
import { OrganizationRepository } from "../organizations/organization.repository";
import { v4 as uuidv4 } from "uuid";
import { AuthRepository } from "./auth.repository";
import type { IAuthRepository } from "./auth.repository.interface";
import type {
  AccessState,
  AuthOrganizationDto,
  AuthUserDto,
  CurrentUserResult,
  LoginInput,
  LoginResult,
  RegisterInput,
  RegisterResult,
  UserProfile
} from "./auth.types";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const buildRefreshExpiry = (): string =>
  new Date(Date.now() + env.authRefreshTokenTtlDays * 24 * 60 * 60 * 1000).toISOString();
const buildAccessExpiryUnix = (): number =>
  Math.floor(Date.now() / 1000) + env.authAccessTokenTtlMinutes * 60;

const toAccessState = (accountStatus: UserProfile["accountStatus"]): AccessState => {
  if (accountStatus === "approved") {
    return "approved";
  }

  if (accountStatus === "pending") {
    return "pending_approval";
  }

  return accountStatus;
};

const toUserDto = (profile: UserProfile, email: string): AuthUserDto => ({
  accountStatus: profile.accountStatus,
  email,
  fullName: profile.fullName,
  id: profile.userId,
  role: profile.role
});

const toAuthOrganizationDto = (
  memberships: Awaited<ReturnType<OrganizationRepository["listMembershipsByUserId"]>>
): AuthOrganizationDto[] =>
  memberships.map((membership) => ({
    membershipRole: membership.membership.role,
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug
  }));

export class AuthService {
  public constructor(
    private readonly authRepository: IAuthRepository = new AuthRepository(),
    private readonly organizationRepository = new OrganizationRepository()
  ) {}

  private async buildAuthPayload(
    profile: UserProfile,
    email: string
  ): Promise<Pick<RegisterResult, "isPlatformAdmin" | "organizations" | "platformRole" | "requiresApproval" | "user"> & { accessState: AccessState }> {
    const organizations = toAuthOrganizationDto(
      await this.organizationRepository.listMembershipsByUserId(profile.userId)
    );

    return {
      accessState: toAccessState(profile.accountStatus),
      isPlatformAdmin: profile.role === "admin",
      organizations,
      platformRole: profile.role,
      requiresApproval: profile.accountStatus !== "approved",
      user: toUserDto(profile, email)
    };
  }

  public async register(input: RegisterInput): Promise<RegisterResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const userId = uuidv4();
    const organization = await this.organizationRepository.findById(input.organizationId);

    if (!organization) {
      throw new AppError(ERROR_CODES.organizationNotFound, "Select a valid organization.", 404);
    }

    try {
      const passwordHash = await hashPassword(input.password);
      const account = await this.authRepository.createUserAccount({
        email: normalizedEmail,
        fullName: input.fullName.trim(),
        organizationId: input.organizationId,
        passwordHash,
        userId
      });

      logger.info("auth.registration_succeeded", {
        requestId: undefined,
        userId
      });

      const payload = await this.buildAuthPayload(account.profile, normalizedEmail);

      return {
        emailVerificationRequired: false,
        ...payload
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("auth.registration_failed", {
        error: error instanceof Error ? error.message : "unknown"
      });

      throw new AppError(
        ERROR_CODES.registrationFailed,
        "Registration could not be completed. Try signing in or resetting your password.",
        400
      );
    }
  }

  public async login(input: LoginInput): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const account = await this.authRepository.findUserByEmail(normalizedEmail);

    if (!account || !(await verifyPassword(input.password, account.passwordHash))) {
      throw new AppError(
        ERROR_CODES.invalidCredentials,
        "Invalid email or password.",
        401
      );
    }

    const sessionId = uuidv4();
    const rawRefreshToken = createSecureToken();
    const refreshTokenExpiresAt = buildRefreshExpiry();

    await this.authRepository.createSession({
      expiresAt: refreshTokenExpiresAt,
      refreshTokenHash: hashToken(rawRefreshToken),
      sessionId,
      userId: account.userId
    });

    const expiresAt = buildAccessExpiryUnix();
    const accessToken = signAccessToken({
      email: account.email,
      expiresAtUnix: expiresAt,
      sessionId,
      userId: account.userId
    });
    logger.info(
      account.profile.accountStatus === "approved" ? "auth.approved_user_login" : "auth.pending_user_login",
      {
        accountStatus: account.profile.accountStatus,
        userId: account.userId
      }
    );

    const payload = await this.buildAuthPayload(account.profile, normalizedEmail);

    return {
      accessToken,
      expiresAt,
      refreshToken: rawRefreshToken,
      ...payload
    };
  }

  public async getCurrentUser(authenticatedUserId: string, email: string | null): Promise<CurrentUserResult> {
    const account = await this.authRepository.findUserByUserId(authenticatedUserId);

    if (!account) {
      throw new AppError(
        ERROR_CODES.userProfileNotFound,
        "Account profile is missing.",
        403
      );
    }

    return this.buildAuthPayload(account.profile, email ?? account.email);
  }

  public async refresh(refreshToken: string): Promise<LoginResult> {
    const session = await this.authRepository.findActiveSessionByRefreshTokenHash(hashToken(refreshToken));

    if (!session) {
      throw new AppError(
        ERROR_CODES.authSessionExpired,
        "The authentication session has expired.",
        401
      );
    }

    const account = await this.authRepository.findUserByUserId(session.userId);

    if (!account) {
      throw new AppError(
        ERROR_CODES.userProfileNotFound,
        "Account profile is missing.",
        403
      );
    }

    const rotatedRefreshToken = createSecureToken();
    const refreshTokenExpiresAt = buildRefreshExpiry();

    await this.authRepository.rotateSession({
      expiresAt: refreshTokenExpiresAt,
      refreshTokenHash: hashToken(rotatedRefreshToken),
      sessionId: session.id
    });

    const expiresAt = buildAccessExpiryUnix();

    const payload = await this.buildAuthPayload(account.profile, account.email);

    return {
      accessToken: signAccessToken({
        email: account.email,
        expiresAtUnix: expiresAt,
        sessionId: session.id,
        userId: account.userId
      }),
      expiresAt,
      refreshToken: rotatedRefreshToken,
      ...payload
    };
  }

  public async logout(sessionId: string): Promise<void> {
    await this.authRepository.revokeSession(sessionId);
  }

  public async requestPasswordReset(email: string): Promise<void> {
    if (!env.authPasswordResetRedirectUrl) {
      throw new AppError(
        ERROR_CODES.internalServerError,
        "Password reset is currently unavailable.",
        503
      );
    }

    logger.info("auth.password_reset_requested", {
      email: normalizeEmail(email)
    });
  }

  public async resetPassword(_accessToken: string, _newPassword: string): Promise<void> {
    throw new AppError(
      ERROR_CODES.passwordResetFailed,
      "Password reset is currently unavailable.",
      503
    );
  }
}
