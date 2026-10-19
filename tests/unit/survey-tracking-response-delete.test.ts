import assert from "node:assert/strict";
import test from "node:test";

import { SurveyTrackingService } from "../../src/modules/survey-tracking/survey-tracking.service";

const surveyId = "550e8400-e29b-41d4-a716-446655440000";
const responseId = "550e8400-e29b-41d4-a716-446655440001";

test("response deletion checks edit access and soft deletes the requested response", async () => {
  let deleteInput: string[] | null = null;
  let permissionChecked = false;
  const service = new SurveyTrackingService(
    {
      deleteSurveyResponse: async (...input: string[]) => {
        deleteInput = input;
        return true;
      }
    } as any,
    { findSurveyById: async () => ({ id: surveyId, organizationId: "organization" }) } as any,
    { findUserByUserId: async () => ({ profile: { role: "user" } }) } as any,
    {
      requireOrganizationMembership: async () => ({ role: "editor" }),
      requireSurveyEditPermission: () => {
        permissionChecked = true;
      }
    } as any
  );

  await service.deleteResponse(surveyId, responseId, "user");

  assert.equal(permissionChecked, true);
  assert.deepEqual(deleteInput, [surveyId, responseId, "user"]);
});

test("platform admins can delete responses without an organization membership", async () => {
  let deleted = false;
  const service = new SurveyTrackingService(
    {
      deleteSurveyResponse: async () => {
        deleted = true;
        return true;
      }
    } as any,
    { findSurveyById: async () => ({ id: surveyId, organizationId: "organization" }) } as any,
    { findUserByUserId: async () => ({ profile: { role: "admin" } }) } as any,
    { requireOrganizationMembership: async () => assert.fail("Admin membership should not be checked") } as any
  );

  await service.deleteResponse(surveyId, responseId, "admin");
  assert.equal(deleted, true);
});

test("response deletion returns not found when no active response matches", async () => {
  const service = new SurveyTrackingService(
    { deleteSurveyResponse: async () => false } as any,
    { findSurveyById: async () => ({ id: surveyId, organizationId: "organization" }) } as any,
    { findUserByUserId: async () => ({ profile: { role: "admin" } }) } as any,
    {} as any
  );

  await assert.rejects(
    service.deleteResponse(surveyId, responseId, "admin"),
    (error: any) => error.code === "RESPONSE_NOT_FOUND" && error.statusCode === 404
  );
});
