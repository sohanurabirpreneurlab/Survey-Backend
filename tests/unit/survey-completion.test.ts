import assert from "node:assert/strict";
import test from "node:test";
import { validationResult } from "express-validator";
import { env } from "../../src/config/env";
import { ExternalSurveyService } from "../../src/modules/integrations/external-survey.service";
import { getSurveyCompletionStatusValidators } from "../../src/modules/integrations/external-survey.validators";
import { protectEmailForLookup } from "../../src/common/security/email-protection";
import { OrganizationService } from "../../src/modules/organizations/organization.service";

const membership = { id: "member", organizationId: "org", userId: "user", role: "viewer" as const, createdAt: "", updatedAt: "" };

test("completion lookup normalizes and deduplicates emails, maps missing records, and allows closed surveys", async () => {
  const previousHash = env.invitationEmailHashSecret;
  const previousKey = env.invitationEmailEncryptionKey;
  env.invitationEmailHashSecret = "test-hash-secret";
  env.invitationEmailEncryptionKey = Buffer.alloc(32).toString("base64");
  try {
    let calls = 0;
    let accessCalls = 0;
    let authorized = false;
    const service = new ExternalSurveyService(
      { findUserByUserId: async () => assert.fail("Must use joined lookup") } as any,
      {} as any,
      {
        requireOrganizationMembership: async () => assert.fail("Must use joined lookup"),
        requireSurveyReadPermission: (value: any) => {
          new OrganizationService().requireSurveyReadPermission(value);
          authorized = true;
        }
      } as any,
      {} as any,
      { findSurveyById: async () => assert.fail("Must use joined lookup") } as any,
      { findByEmailHashes: async (survey: string, hashes: string[]) => {
        calls++;
        assert.equal(authorized, true);
        assert.equal(survey, "survey");
        assert.deepEqual(hashes, ["alice@example.com", "bob@example.com", "unknown@example.com"].map(protectEmailForLookup));
        return [
          { emailHash: hashes[1], completedAt: null, lastInvitationEmailSentAt: "2026-09-08T18:30:00.000Z" },
          { emailHash: hashes[0], completedAt: "2026-09-09T14:30:00.000Z", lastInvitationEmailSentAt: null }
        ];
      } },
      { findAccess: async (userId, surveyId) => {
        accessCalls++;
        assert.equal(userId, "user");
        assert.equal(surveyId, "survey");
        return { accountStatus: "approved", surveyId, membership };
      } }
    );
    const result = await service.getCompletionStatus({ surveyId: "survey", userId: "user",
      emails: [" Alice@Example.com ", "alice@example.com", "bob@example.com", "unknown@example.com"] });
    assert.equal(calls, 1);
    assert.equal(accessCalls, 1);
    assert.deepEqual(result.results, [
      { email: "alice@example.com", hasSubmitted: true, completedAt: "2026-09-09T14:30:00.000Z", hasInvitationEmailBeenSent: false, lastInvitationEmailSentAt: null },
      { email: "bob@example.com", hasSubmitted: false, completedAt: null, hasInvitationEmailBeenSent: true, lastInvitationEmailSentAt: "2026-09-08T18:30:00.000Z" },
      { email: "unknown@example.com", hasSubmitted: false, completedAt: null, hasInvitationEmailBeenSent: false, lastInvitationEmailSentAt: null }
    ]);
  } finally {
    env.invitationEmailHashSecret = previousHash;
    env.invitationEmailEncryptionKey = previousKey;
  }
});

for (const scenario of ["inactive", "missing-user", "missing", "deleted", "nonmember", "forbidden"]) {
  test(`completion lookup rejects ${scenario} access before querying respondent history`, async () => {
    const service = new ExternalSurveyService(
      { findUserByUserId: async () => ({ userId: "user", profile: { accountStatus: scenario === "inactive" ? "suspended" : "approved" } }) } as any,
      {} as any,
      { requireOrganizationMembership: async () => ({}), requireSurveyReadPermission: () => { throw new Error("forbidden"); } } as any,
      {} as any,
      { findSurveyById: async () => scenario === "missing" ? null : ({ id: "survey", deletedAt: scenario === "deleted" ? "2026-01-01" : null }) } as any,
      { findByEmailHashes: async () => { assert.fail("Must not query respondent history"); } },
      { findAccess: async () => ({
        accountStatus: scenario === "inactive" ? "suspended" : scenario === "missing-user" ? null : "approved",
        surveyId: ["missing", "deleted"].includes(scenario) ? null : "survey",
        membership: scenario === "nonmember" ? null : membership
      }) }
    );
    await assert.rejects(service.getCompletionStatus({ surveyId: "survey", userId: "user", emails: ["alice@example.com"] }),
      (error: any) => scenario === "forbidden" ? error.message === "forbidden" :
        error.code === (["inactive", "missing-user"].includes(scenario) ? "INTEGRATION_IDENTITY_INACTIVE" :
          scenario === "nonmember" ? "ORGANIZATION_MEMBERSHIP_REQUIRED" : "SURVEY_NOT_FOUND"));
  });
}

test("completion request validates UUID, email values, and batch bounds", async () => {
  const surveyId = "550e8400-e29b-41d4-a716-446655440000";
  for (const [body, valid] of [
    [{ surveyId, emails: [" alice@example.com "] }, true],
    [{ surveyId, emails: Array(500).fill("alice@example.com") }, true],
    [{ surveyId, emails: Array(501).fill("alice@example.com") }, false],
    [{ surveyId, emails: [] }, false],
    [{ surveyId, emails: "alice@example.com" }, false],
    [{ surveyId, emails: [123] }, false],
    [{ surveyId, emails: ["invalid"] }, false],
    [{ surveyId: "invalid", emails: ["alice@example.com"] }, false]
  ] as const) {
    const request = { body } as any;
    for (const validator of getSurveyCompletionStatusValidators) await validator.run(request);
    assert.equal(validationResult(request).isEmpty(), valid);
  }
});
