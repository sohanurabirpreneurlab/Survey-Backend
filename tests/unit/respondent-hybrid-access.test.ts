import assert from "node:assert/strict";
import test from "node:test";

import { RespondentService } from "../../src/modules/respondents/respondent.service";
import type { Survey } from "../../src/modules/surveys/survey.types";

const survey: Survey = {
  accessMode: "hybrid",
  closesAt: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  createdBy: "owner-1",
  currentDraftVersionId: null,
  deletedAt: null,
  id: "survey-1",
  opensAt: null,
  organizationId: "organization-1",
  publicSlug: "public-survey-1",
  publishedVersionId: "version-1",
  responseLimit: null,
  slug: "hybrid-survey",
  status: "published",
  updatedAt: "2026-09-16T00:00:00.000Z"
};

const invitation = {
  completedAt: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  createdBy: "owner-1",
  expiresAt: null,
  firstOpenedAt: null,
  id: "invitation-1",
  lastOpenedAt: null,
  maxResponses: 1,
  metadata: {},
  recipientEmailCiphertext: "encrypted-email",
  recipientEmailHash: "email-hash",
  responseCount: 0,
  revokedAt: null,
  startedAt: null,
  status: "sent" as const,
  surveyId: survey.id,
  surveyVersionId: "version-1",
  tokenHash: "token-hash",
  updatedAt: "2026-09-16T00:00:00.000Z"
};

const definition = {
  calculatedScores: [],
  options: [],
  questions: [],
  sections: [],
  version: {
    description: "Hybrid access test",
    settings: {},
    title: "Hybrid survey"
  }
};

const buildService = () => {
  const createdSessions: Array<{ invitationId: string | null; surveyId: string; surveyVersionId: string }> = [];
  let invitationOpened = false;

  const service = new RespondentService(
    {
      findInvitationByTokenHash: async () => invitation,
      markInvitationOpened: async () => {
        invitationOpened = true;
      }
    } as any,
    {
      createSession: async (input: { invitationId: string | null; surveyId: string; surveyVersionId: string }) => {
        createdSessions.push(input);
        return {};
      }
    } as any,
    {
      findSurveyById: async () => survey,
      findSurveyByPublicSlug: async () => survey,
      getVersionDefinition: async () => definition
    } as any,
    {
      findById: async () => ({ id: survey.organizationId })
    } as any
  );

  return { createdSessions, invitationWasOpened: () => invitationOpened, service };
};

test("hybrid surveys grant anonymous access through the public link", async () => {
  const context = buildService();

  const result = await context.service.grantAccessByPublicSlug(survey.publicSlug);

  assert.equal(result.survey.publicSlug, survey.publicSlug);
  assert.equal(context.createdSessions.length, 1);
  assert.equal(context.createdSessions[0]?.invitationId, null);
  assert.equal(context.createdSessions[0]?.surveyVersionId, survey.publishedVersionId);
});

test("hybrid surveys link invitation access to the invited respondent", async () => {
  const context = buildService();

  await context.service.grantAccessByInvitationToken("raw-invitation-token");

  assert.equal(context.createdSessions.length, 1);
  assert.equal(context.createdSessions[0]?.invitationId, invitation.id);
  assert.equal(context.createdSessions[0]?.surveyVersionId, invitation.surveyVersionId);
  assert.equal(context.invitationWasOpened(), true);
});
