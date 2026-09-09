import { databasePool } from "../../config/database";
import type { OrganizationMembership } from "../organizations/organization.types";

export type IntegrationSurveyAccess = {
  accountStatus: string | null;
  surveyId: string | null;
  membership: OrganizationMembership | null;
};

export class IntegrationSurveyAccessRepository {
  public async findAccess(userId: string, surveyId: string): Promise<IntegrationSurveyAccess> {
    // Start from the supplied IDs so missing user/survey/membership remain
    // distinguishable. Membership must belong to this survey's organization.
    const result = await databasePool.query(
      `select p.account_status, s.id as survey_id,
              m.id as membership_id, m.organization_id, m.user_id, m.role,
              m.created_at, m.updated_at
       from (select $1::uuid as user_id, $2::uuid as survey_id) requested
       left join app_users u on u.id = requested.user_id
       left join user_profiles p on p.user_id = u.id
       left join surveys s on s.id = requested.survey_id and s.deleted_at is null
       left join organization_members m on m.organization_id = s.organization_id and m.user_id = u.id`,
      [userId, surveyId]
    );
    const row = result.rows[0];
    return {
      accountStatus: row.account_status ?? null,
      surveyId: row.survey_id ?? null,
      membership: row.membership_id ? {
        id: row.membership_id,
        organizationId: row.organization_id,
        userId: row.user_id,
        role: row.role,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      } : null
    };
  }
}
