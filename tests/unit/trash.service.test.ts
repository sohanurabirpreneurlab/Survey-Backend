import assert from "node:assert/strict";
import test from "node:test";
import { TrashService } from "../../src/modules/trash/trash.service";
import { trashEntityTypes } from "../../src/modules/trash/trash.types";

test("trash service restores each supported entity type", async () => {
  const calls: unknown[][] = [];
  const service = new TrashService({
    restore: async (...args: unknown[]) => {
      calls.push(args);
      return true;
    }
  } as any);

  for (const entityType of trashEntityTypes) {
    await service.restore(entityType, "550e8400-e29b-41d4-a716-446655440000", "actor");
  }

  assert.deepEqual(calls.map((call) => call[0]), trashEntityTypes);
});

test("trash service rejects missing items and self permanent deletion", async () => {
  const service = new TrashService({
    permanentlyDelete: async () => false,
    restore: async () => false
  } as any);

  await assert.rejects(
    service.restore("response", "550e8400-e29b-41d4-a716-446655440000", "actor"),
    (error: any) => error.code === "RESOURCE_NOT_FOUND"
  );
  await assert.rejects(
    service.permanentlyDelete("user", "actor", "actor"),
    (error: any) => error.code === "FORBIDDEN"
  );
});

test("trash entity types remain limited to the universal trash resources", () => {
  assert.deepEqual(trashEntityTypes, ["survey", "response", "user", "organization"]);
});
