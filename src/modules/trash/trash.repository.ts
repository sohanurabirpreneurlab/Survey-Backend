import { databasePool } from "../../config/database";
import type { TrashEntityType, TrashItem, TrashListResult } from "./trash.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  release: () => void;
};

const withTransaction = async <T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> => {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const trashItemsCte = `
  with trash_items as (
    select
      'survey'::text as entity_type,
      s.id,
      coalesce(dv.title, pv.title, s.slug) as label,
      null::text as parent_label,
      o.name as organization_name,
      s.deleted_at,
      s.deletion_metadata
    from surveys s
    inner join organizations o on o.id = s.organization_id
    left join survey_versions dv on dv.id = s.current_draft_version_id
    left join survey_versions pv on pv.id = s.published_version_id
    where s.deleted_at is not null

    union all

    select
      'response'::text,
      sr.id,
      'Response ' || left(sr.id::text, 8),
      coalesce(dv.title, pv.title, s.slug),
      o.name,
      sr.deleted_at,
      sr.deletion_metadata
    from survey_responses sr
    inner join surveys s on s.id = sr.survey_id
    inner join organizations o on o.id = s.organization_id
    left join survey_versions dv on dv.id = s.current_draft_version_id
    left join survey_versions pv on pv.id = s.published_version_id
    where sr.deleted_at is not null

    union all

    select
      'user'::text,
      up.user_id,
      up.full_name || ' (' || u.email || ')',
      null::text,
      member_org.name,
      up.deleted_at,
      up.deletion_metadata
    from user_profiles up
    inner join app_users u on u.id = up.user_id
    left join lateral (
      select o.name
      from organization_members om
      inner join organizations o on o.id = om.organization_id
      where om.user_id = up.user_id
      order by om.created_at asc
      limit 1
    ) member_org on true
    where up.deleted_at is not null

    union all

    select
      'organization'::text,
      o.id,
      o.name,
      null::text,
      o.name,
      o.deleted_at,
      o.deletion_metadata
    from organizations o
    where o.deleted_at is not null
  )
`;

const mapTrashItem = (row: Record<string, unknown>): TrashItem => ({
  deletedAt: String(row.deleted_at),
  deletedBy: row.deleted_by ? String(row.deleted_by) : null,
  deletedByLabel: row.deleted_by_label ? String(row.deleted_by_label) : null,
  deletionMetadata: (row.deletion_metadata as Record<string, unknown>) ?? {},
  entityType: row.entity_type as TrashEntityType,
  id: String(row.id),
  label: String(row.label),
  organizationName: row.organization_name ? String(row.organization_name) : null,
  parentLabel: row.parent_label ? String(row.parent_label) : null
});

const permanentlyDeleteResponse = async (client: DatabaseClient, responseId: string): Promise<boolean> => {
  const lookup = await client.query(
    "select id from survey_responses where id = $1 and deleted_at is not null and status = 'deleted'",
    [responseId]
  );
  if (!lookup.rowCount) return false;

  await client.query("delete from idempotency_records where resource_id = $1", [responseId]);
  await client.query("delete from survey_response_scores where response_id = $1", [responseId]);
  await client.query(
    "delete from answer_choices where answer_id in (select id from answers where response_id = $1)",
    [responseId]
  );
  await client.query("delete from answers where response_id = $1", [responseId]);
  await client.query("delete from survey_responses where id = $1", [responseId]);
  return true;
};

const permanentlyDeleteSurvey = async (client: DatabaseClient, surveyId: string): Promise<boolean> => {
  const lookup = await client.query("select id from surveys where id = $1 and deleted_at is not null", [surveyId]);
  if (!lookup.rowCount) return false;

  await client.query(
    `delete from idempotency_records
     where resource_id in (
       select id from survey_responses where survey_id = $1
       union all
       select id from survey_invitations where survey_id = $1
     )`,
    [surveyId]
  );
  await client.query(
    "delete from survey_response_scores where response_id in (select id from survey_responses where survey_id = $1)",
    [surveyId]
  );
  await client.query(
    `delete from answer_choices where answer_id in (
       select a.id from answers a
       inner join survey_responses sr on sr.id = a.response_id
       where sr.survey_id = $1
     )`,
    [surveyId]
  );
  await client.query(
    "delete from answers where response_id in (select id from survey_responses where survey_id = $1)",
    [surveyId]
  );
  await client.query("delete from survey_responses where survey_id = $1", [surveyId]);
  await client.query("delete from respondent_sessions where survey_id = $1", [surveyId]);
  await client.query(
    "delete from email_deliveries where invitation_id in (select id from survey_invitations where survey_id = $1)",
    [surveyId]
  );
  await client.query("delete from survey_invitations where survey_id = $1", [surveyId]);
  await client.query("delete from email_campaigns where survey_id = $1", [surveyId]);
  await client.query("delete from surveys where id = $1", [surveyId]);
  return true;
};

export class TrashRepository {
  public async list(input: {
    entityType?: TrashEntityType;
    limit: number;
    page: number;
    query?: string;
  }): Promise<TrashListResult> {
    const entityType = input.entityType ?? "all";
    const query = input.query?.trim() ?? "";
    const offset = (input.page - 1) * input.limit;
    const filterSql = `
      where ($1::text = 'all' or entity_type = $1)
        and ($2::text = '' or lower(label) like '%' || lower($2) || '%'
          or lower(coalesce(parent_label, '')) like '%' || lower($2) || '%'
          or lower(coalesce(organization_name, '')) like '%' || lower($2) || '%')
    `;
    const rowsResult = await databasePool.query(
      `${trashItemsCte}
       select ti.*,
              ti.deletion_metadata->>'deletedBy' as deleted_by,
              coalesce(dp.full_name, du.email) as deleted_by_label
       from trash_items ti
       left join app_users du on du.id::text = ti.deletion_metadata->>'deletedBy'
       left join user_profiles dp on dp.user_id = du.id
       ${filterSql}
       order by deleted_at desc
       limit $3 offset $4`,
      [entityType, query, input.limit, offset]
    );
    const countResult = await databasePool.query(
      `${trashItemsCte} select count(*)::int as total from trash_items ${filterSql}`,
      [entityType, query]
    );
    const total = Number((countResult.rows[0] as Record<string, unknown>).total ?? 0);

    return {
      items: rowsResult.rows.map((row: unknown) => mapTrashItem(row as Record<string, unknown>)),
      limit: input.limit,
      page: input.page,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit))
    };
  }

  public async restore(entityType: TrashEntityType, id: string, actorUserId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const statements: Record<TrashEntityType, string> = {
        organization: `update organizations set deleted_at = null, deletion_metadata = '{}'::jsonb, updated_at = now()
          where id = $1 and deleted_at is not null returning id`,
        response: `update survey_responses
          set status = coalesce(previous_status, 'invalidated'), previous_status = null,
              deleted_at = null, deletion_metadata = '{}'::jsonb, updated_at = now()
          where id = $1 and deleted_at is not null and status = 'deleted' returning id`,
        survey: `update surveys set deleted_at = null, deletion_metadata = '{}'::jsonb, updated_at = now()
          where id = $1 and deleted_at is not null returning id`,
        user: `update user_profiles
          set account_status = case
                when deletion_metadata->>'previousStatus' in ('pending', 'approved', 'rejected', 'suspended')
                  then deletion_metadata->>'previousStatus'
                else 'approved'
              end,
              suspended_at = case when deletion_metadata->>'previousStatus' = 'suspended' then suspended_at else null end,
              deleted_at = null, deletion_metadata = '{}'::jsonb, updated_at = now()
          where user_id = $1 and deleted_at is not null returning user_id as id`
      };
      const result = await client.query(statements[entityType], [id]);
      if (!result.rowCount) return false;

      await client.query(
        `insert into audit_logs (actor_user_id, action, target_type, target_id, target_label, result, metadata)
         values ($1, $2, $3, $4, $4::text, 'success', '{}'::jsonb)`,
        [actorUserId, `${entityType.toUpperCase()}_RESTORED`, entityType, id]
      );
      return true;
    });
  }

  public async permanentlyDelete(entityType: TrashEntityType, id: string, actorUserId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      let deleted = false;

      if (entityType === "response") {
        deleted = await permanentlyDeleteResponse(client, id);
      } else if (entityType === "survey") {
        deleted = await permanentlyDeleteSurvey(client, id);
      } else if (entityType === "user") {
        const lookup = await client.query("select user_id from user_profiles where user_id = $1 and deleted_at is not null", [id]);
        if (lookup.rowCount) {
          await client.query("delete from organization_members where user_id = $1", [id]);
          const result = await client.query("delete from app_users where id = $1 returning id", [id]);
          deleted = Boolean(result.rowCount);
        }
      } else {
        const lookup = await client.query("select id from organizations where id = $1 and deleted_at is not null", [id]);
        if (lookup.rowCount) {
          const surveys = await client.query("select id from surveys where organization_id = $1", [id]);
          for (const survey of surveys.rows as Array<Record<string, unknown>>) {
            await client.query("update surveys set deleted_at = coalesce(deleted_at, now()) where id = $1", [survey.id]);
            await permanentlyDeleteSurvey(client, String(survey.id));
          }
          await client.query("delete from organization_members where organization_id = $1", [id]);
          const result = await client.query("delete from organizations where id = $1 returning id", [id]);
          deleted = Boolean(result.rowCount);
        }
      }

      if (!deleted) return false;
      await client.query(
        `insert into audit_logs (actor_user_id, action, target_type, target_id, target_label, result, metadata)
         values ($1, $2, $3, $4, $4::text, 'success', '{}'::jsonb)`,
        [actorUserId, `${entityType.toUpperCase()}_PERMANENTLY_DELETED`, entityType, id]
      );
      return true;
    });
  }
}
