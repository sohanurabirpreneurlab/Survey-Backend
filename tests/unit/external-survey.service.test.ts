import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../../src/common/errors/app-error";
import { ERROR_CODES } from "../../src/common/errors/error-codes";
import { ExternalSurveyService } from "../../src/modules/integrations/external-survey.service";
import type { AuthAccountRecord, IAuthRepository } from "../../src/modules/auth/auth.repository.interface";
import type { UserProfile } from "../../src/modules/auth/auth.types";
import type { IResponseRepository } from "../../src/modules/responses/response.repository.interface";
import type { Survey, SurveyVersion } from "../../src/modules/surveys/survey.types";

const buildProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  accountStatus: "approved",
  approvedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  fullName: "Integration User",
  organization: null,
  rejectedAt: null,
  role: "business_owner",
  suspendedAt: null,
  updatedAt: "2026-08-01T00:00:00.000Z",
  userId: "integration-user-1",
  ...overrides
});

const buildAccount = (overrides: Partial<AuthAccountRecord> = {}): AuthAccountRecord => ({
  createdAt: "2026-08-01T00:00:00.000Z",
  email: "integration@salthub.com",
  emailVerifiedAt: "2026-08-01T00:00:00.000Z",
  passwordHash: "hash",
  profile: buildProfile(),
  updatedAt: "2026-08-01T00:00:00.000Z",
  userId: "integration-user-1",
  ...overrides
});

const buildSurvey = (overrides: Partial<Survey> = {}): Survey => ({
  accessMode: "invite_only",
  closesAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  createdBy: "owner-1",
  currentDraftVersionId: null,
  deletedAt: null,
  id: "survey-1",
  opensAt: null,
  organizationId: "org-1",
  publicSlug: "public-1",
  publishedVersionId: "version-1",
  responseLimit: null,
  slug: "employee-feedback",
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides
});

const buildPublishedVersion = (overrides: Partial<SurveyVersion> = {}): SurveyVersion => ({
  archivedAt: null,
  changeSummary: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  createdBy: "owner-1",
  createdFromVersionId: null,
  description: "Please complete this survey",
  id: "version-1",
  publishedAt: "2026-08-01T00:00:00.000Z",
  publishedBy: "owner-1",
  settings: {
    allowBackNavigation: true,
    confirmationMessage: "Thanks",
    oneQuestionPerPage: false,
    redirectUrl: null,
    showConfirmationPage: true,
    showProgressBar: true,
    showQuestionNumbers: true,
    shuffleOptions: false,
    shuffleQuestions: false,
    theme: { logoUrl: null, primaryColor: null }
  },
  status: "published",
  surveyId: "survey-1",
  title: "Employee Feedback",
  updatedAt: "2026-08-01T00:00:00.000Z",
  versionNumber: 1,
  ...overrides
});

test("resolveInvitation returns completed without issuing a new link for submitted respondents", async () => {
  const service = new ExternalSurveyService(
    {
      createSession: async () => undefined,
      createUserAccount: async () => buildAccount(),
      findActiveSessionById: async () => null,
      findActiveSessionByRefreshTokenHash: async () => null,
      findUserByEmail: async () => null,
      findUserByUserId: async () => buildAccount(),
      revokeSession: async () => undefined,
      rotateSession: async () => undefined
    } satisfies IAuthRepository,
    {
      hasSubmittedInvitationResponse: async () => true,
      issueInvitationAccessLink: async () => {
        throw new Error("should not issue access");
      }
    } as any,
    {
      requireOrganizationMembership: async () => ({ role: "admin" }),
      requireSurveyPublishPermission: () => undefined
    } as any,
    {
      countSubmittedResponsesBySurveyId: async () => 0
    } as unknown as IResponseRepository,
    {
      findPublishedVersion: async () => buildPublishedVersion(),
      findSurveyById: async () => buildSurvey()
    } as any
  );

  const result = await service.resolveInvitation({
    createdBy: "integration-user-1",
    email: "respondent@example.com",
    requestId: "req-1",
    surveyId: "survey-1"
  });

  assert.equal(result.hasSubmitted, true);
  assert.equal(result.invitationStatus, "completed");
  assert.equal(result.surveyLink, null);
});

test("resolveInvitation rejects inactive integration identities", async () => {
  const service = new ExternalSurveyService(
    {
      createSession: async () => undefined,
      createUserAccount: async () => buildAccount(),
      findActiveSessionById: async () => null,
      findActiveSessionByRefreshTokenHash: async () => null,
      findUserByEmail: async () => null,
      findUserByUserId: async () =>
        buildAccount({
          profile: buildProfile({ accountStatus: "suspended" })
        }),
      revokeSession: async () => undefined,
      rotateSession: async () => undefined
    } satisfies IAuthRepository,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

  await assert.rejects(
    () =>
      service.resolveInvitation({
        createdBy: "integration-user-1",
        email: "respondent@example.com",
        requestId: "req-1",
        surveyId: "survey-1"
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.integrationIdentityInactive
  );
});
