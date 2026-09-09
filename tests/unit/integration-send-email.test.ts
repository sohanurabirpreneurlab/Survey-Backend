import assert from "node:assert/strict";
import test from "node:test";
import { validationResult } from "express-validator";
import { AppError } from "../../src/common/errors/app-error";
import { ERROR_CODES } from "../../src/common/errors/error-codes";
import { errorHandler } from "../../src/common/errors/error-handler";
import { ExternalSurveyService } from "../../src/modules/integrations/external-survey.service";
import { InvitationService } from "../../src/modules/invitations/invitation.service";
import { sendSurveyInvitationEmailValidators } from "../../src/modules/integrations/external-survey.validators";

const survey = { id: "survey", organizationId: "org", status: "published", accessMode: "invite_only",
  publishedVersionId: "version", responseLimit: null, opensAt: null, closesAt: null, deletedAt: null };

test("integration sends as authenticated user and normalizes email", async () => {
  const calls: unknown[] = [];
  const service = new ExternalSurveyService(
    { findUserByUserId: async () => ({ userId: "trusted-user", profile: { accountStatus: "approved" } }) } as any,
    { sendInvitationEmail: async (input: unknown) => { calls.push(input); return { id: "invitation" }; } } as any,
    { requireOrganizationMembership: async () => ({}), requireSurveyPublishPermission: () => undefined } as any,
    {} as any, { findSurveyById: async () => survey } as any
  );
  assert.deepEqual(await service.sendInvitationEmail({ userId: "trusted-user", surveyId: "survey", email: " Alice@Example.com " }),
    { surveyId: "survey", email: "alice@example.com", invitationId: "invitation", status: "sent" });
  assert.deepEqual(calls, [{ createdBy: "trusted-user", surveyId: "survey", recipientEmail: "alice@example.com" }]);
});

for (const [scenario, status, code] of [
  ["inactive", 403, ERROR_CODES.integrationIdentityInactive],
  ["missing", 404, ERROR_CODES.surveyNotFound],
  ["deleted", 404, ERROR_CODES.surveyNotFound],
  ["forbidden", 403, ERROR_CODES.insufficientOrganizationRole],
  ["public", 409, ERROR_CODES.surveyInviteOnlyRequired],
  ["closed", 409, ERROR_CODES.surveyClosed],
  ["expired", 409, ERROR_CODES.surveyClosed],
  ["draft", 409, ERROR_CODES.surveyNotPublished],
  ["future", 409, ERROR_CODES.surveyNotOpenYet],
  ["full", 409, ERROR_CODES.surveyNotAcceptingResponses]
] as const) {
  test(`integration blocks ${scenario} before sending`, async () => {
    const service = new ExternalSurveyService(
      { findUserByUserId: async () => ({ userId: "user", profile: { accountStatus: scenario === "inactive" ? "suspended" : "approved" } }) } as any,
      { sendInvitationEmail: async () => assert.fail("Must not send") } as any,
      { requireOrganizationMembership: async () => ({}), requireSurveyPublishPermission: () => {
        if (scenario === "forbidden") throw new AppError(ERROR_CODES.insufficientOrganizationRole, "Forbidden", 403);
      } } as any,
      { countSubmittedResponsesBySurveyId: async () => 1 } as any,
      { findSurveyById: async () => scenario === "missing" ? null : ({ ...survey,
        deletedAt: scenario === "deleted" ? "2026-01-01" : null,
        accessMode: scenario === "public" ? "public" : "invite_only",
        status: scenario === "closed" ? "closed" : scenario === "draft" ? "draft" : "published",
        closesAt: scenario === "expired" ? "2000-01-01" : null,
        opensAt: scenario === "future" ? "2999-01-01" : null,
        responseLimit: scenario === "full" ? 1 : null
      }) } as any
    );
    await assert.rejects(service.sendInvitationEmail({ userId: "user", surveyId: "survey", email: "alice@example.com" }),
      (error: any) => error.statusCode === status && error.code === code);
  });
}

for (const scenario of ["sent", "provider-error", "completed"] as const) {
  test(`shared invitation sending records ${scenario} outcome`, async (t) => {
    const events: string[] = [];
    const invitation = { id: "invitation", expiresAt: "2030-01-01T00:00:00.000Z", recipientEmailCiphertext: null };
    const service = new InvitationService(
      { createEmailDelivery: async (input: any) => { events.push(input.status); return { id: "delivery" }; },
        updateEmailDeliveryStatus: async (input: any) => { events.push(input.status); },
        updateInvitationStatus: async () => invitation } as any,
      { findSurveyById: async () => survey, findPublishedVersion: async () => ({ id: "version", title: "Title", description: "Description" }) } as any,
      { requireOrganizationMembership: async () => ({}), requireSurveyPublishPermission: () => undefined } as any,
      { sendInvitation: async (input: any) => {
        events.push("provider");
        assert.equal(input.expiresAt, invitation.expiresAt);
        assert.equal(input.surveyTitle, "Title");
        if (scenario === "provider-error") throw new Error("Provider private diagnostic");
        return { status: "sent", provider: "brevo", providerMessageId: "message" };
      } }
    );
    t.mock.method(service, "hasSubmittedInvitationResponse", async () => scenario === "completed");
    t.mock.method(service, "issueInvitationAccessLink", async (input: any) => {
      assert.equal(input.reuseExistingInvitation, true);
      events.push("link");
      return { invitation, invitationUrl: "https://example.com/i/token", recipientEmail: "alice@example.com" };
    });
    const pending = service.sendInvitationEmail({ createdBy: "user", surveyId: "survey", recipientEmail: "alice@example.com" });
    if (scenario === "sent") {
      assert.equal((await pending).id, "invitation");
      assert.deepEqual(events, ["link", "pending", "provider", "sent"]);
    } else {
      await assert.rejects(pending, (error: any) => error.code === (scenario === "completed" ? ERROR_CODES.invitationAlreadyCompleted : ERROR_CODES.invitationSendFailed));
      assert.deepEqual(events, scenario === "completed" ? [] : ["link", "pending", "provider", "failed"]);
    }
  });
}

test("send validation rejects malformed input", async () => {
  for (const [body, valid] of [
    [{ surveyId: "550e8400-e29b-41d4-a716-446655440000", email: " alice@example.com " }, true],
    [{ surveyId: "invalid", email: "alice@example.com" }, false],
    [{ surveyId: "550e8400-e29b-41d4-a716-446655440000", email: ["alice@example.com"] }, false],
    [{ surveyId: "550e8400-e29b-41d4-a716-446655440000", email: "invalid" }, false],
    [{}, false]
  ] as const) {
    const request = { body } as any;
    for (const validator of sendSurveyInvitationEmailValidators) await validator.run(request);
    assert.equal(validationResult(request).isEmpty(), valid);
  }
});

test("send error envelope matches SaltHub contract", () => {
  let body: unknown;
  const response = { status: (code: number) => { assert.equal(code, 502); return response; }, json: (value: unknown) => { body = value; } };
  errorHandler(new AppError(ERROR_CODES.invitationSendFailed, "The invitation email could not be sent.", 502),
    { requestId: "request-1" } as any, response as any, () => undefined);
  assert.deepEqual(body, { success: false, error: { code: "INVITATION_SEND_FAILED", message: "The invitation email could not be sent.", details: null }, meta: { requestId: "request-1" } });
});
