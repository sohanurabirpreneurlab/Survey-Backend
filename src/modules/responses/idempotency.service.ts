import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { createRequestHash } from "../../common/security/request-hash";
import { databasePool } from "../../config/database";

type IdempotencyRecord = {
  id: string;
  scope: string;
  idempotencyKey: string;
  requestHash: string;
  status: "processing" | "completed" | "failed";
  responseStatus: number | null;
  responseBody: unknown;
};

const mapRecord = (row: Record<string, unknown>): IdempotencyRecord => ({
  id: String(row.id),
  idempotencyKey: String(row.idempotency_key),
  requestHash: String(row.request_hash),
  responseBody: row.response_body ?? null,
  responseStatus: row.response_status === null ? null : Number(row.response_status),
  scope: String(row.scope),
  status: row.status as IdempotencyRecord["status"]
});

export class IdempotencyService {
  public async run<T>(input: {
    action: () => Promise<T>;
    idempotencyKey: string | undefined;
    requestPayload: unknown;
    resourceId?: string;
    responseStatus: number;
    scope: string;
  }): Promise<{ replayed: boolean; value: T }> {
    if (!input.idempotencyKey) {
      throw new AppError(
        ERROR_CODES.idempotencyKeyRequired,
        "Idempotency-Key header is required.",
        400
      );
    }

    const requestHash = createRequestHash(input.requestPayload);
    const existingResult = await databasePool.query(
      `
        select *
        from idempotency_records
        where scope = $1 and idempotency_key = $2
      `,
      [input.scope, input.idempotencyKey]
    );

    if (existingResult.rowCount) {
      const record = mapRecord(existingResult.rows[0] as Record<string, unknown>);

      if (record.requestHash !== requestHash) {
        throw new AppError(
          ERROR_CODES.idempotencyKeyConflict,
          "The same idempotency key was reused with different request data.",
          409
        );
      }

      if (record.status === "processing") {
        throw new AppError(
          ERROR_CODES.idempotencyRequestInProgress,
          "A matching request is already being processed.",
          409
        );
      }

      if (record.status === "completed") {
        return {
          replayed: true,
          value: record.responseBody as T
        };
      }
    } else {
      await databasePool.query(
        `
          insert into idempotency_records
            (scope, idempotency_key, request_hash, status, expires_at, resource_id)
          values
            ($1, $2, $3, 'processing', now() + interval '1 day', $4)
        `,
        [input.scope, input.idempotencyKey, requestHash, input.resourceId ?? null]
      );
    }

    const value = await input.action();

    await databasePool.query(
      `
        update idempotency_records
        set status = 'completed',
            response_status = $3,
            response_body = $4::jsonb,
            updated_at = now()
        where scope = $1 and idempotency_key = $2
      `,
      [input.scope, input.idempotencyKey, input.responseStatus, JSON.stringify(value)]
    );

    return { replayed: false, value };
  }
}
