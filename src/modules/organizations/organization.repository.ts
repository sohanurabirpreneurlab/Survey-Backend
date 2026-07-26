import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { databasePool } from "../../config/database";
import type { IOrganizationRepository } from "./organization.repository.interface";
import type { CreateOrganizationInput, Organization, OrganizationMembership } from "./organization.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
};

const mapOrganization = (row: Record<string, unknown>): Organization => ({
  id: String(row.id),
  name: String(row.name),
  slug: String(row.slug),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null
});

const mapMembership = (row: Record<string, unknown>): OrganizationMembership => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  userId: String(row.user_id),
  role: row.role as OrganizationMembership["role"],
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

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

export class OrganizationRepository implements IOrganizationRepository {
  public async createOrganizationWithOwner(input: CreateOrganizationInput): Promise<Organization> {
    try {
      return await withTransaction(async (client) => {
        const organizationResult = await client.query(
          `
            insert into organizations (name, slug, created_by)
            values ($1, $2, $3)
            returning *
          `,
          [input.name, input.slug, input.ownerUserId]
        );

        const organization = mapOrganization(organizationResult.rows[0] as Record<string, unknown>);

        await client.query(
          `
            insert into organization_members (organization_id, user_id, role)
            values ($1, $2, 'owner')
          `,
          [organization.id, input.ownerUserId]
        );

        return organization;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new AppError(
          ERROR_CODES.databaseConflict,
          "Organization slug already exists.",
          409
        );
      }

      throw new AppError(ERROR_CODES.databaseError, "Failed to create organization.", 500);
    }
  }

  public async findById(organizationId: string): Promise<Organization | null> {
    const result = await databasePool.query(
      `
        select *
        from organizations
        where id = $1 and deleted_at is null
      `,
      [organizationId]
    );

    return result.rowCount ? mapOrganization(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findMembership(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMembership | null> {
    const result = await databasePool.query(
      `
        select *
        from organization_members
        where organization_id = $1 and user_id = $2
      `,
      [organizationId, userId]
    );

    return result.rowCount ? mapMembership(result.rows[0] as Record<string, unknown>) : null;
  }
}
