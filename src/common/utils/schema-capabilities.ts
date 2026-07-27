import { databasePool } from "../../config/database";

const capabilityCache = new Map<string, Promise<boolean>>();

const cachedBoolean = (key: string, load: () => Promise<boolean>): Promise<boolean> => {
  const existing = capabilityCache.get(key);

  if (existing) {
    return existing;
  }

  const next = load().catch((error) => {
    capabilityCache.delete(key);
    throw error;
  });

  capabilityCache.set(key, next);
  return next;
};

export const hasTable = async (tableName: string): Promise<boolean> =>
  cachedBoolean(`table:${tableName}`, async () => {
    const result = await databasePool.query(
      `
        select exists (
          select 1
          from information_schema.tables
          where table_schema = 'public'
            and table_name = $1
        ) as exists
      `,
      [tableName]
    );

    return Boolean((result.rows[0] as Record<string, unknown>).exists);
  });

export const hasColumn = async (tableName: string, columnName: string): Promise<boolean> =>
  cachedBoolean(`column:${tableName}:${columnName}`, async () => {
    const result = await databasePool.query(
      `
        select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = $1
            and column_name = $2
        ) as exists
      `,
      [tableName, columnName]
    );

    return Boolean((result.rows[0] as Record<string, unknown>).exists);
  });
