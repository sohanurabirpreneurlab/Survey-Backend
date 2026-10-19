export const trashEntityTypes = ["survey", "response", "user", "organization"] as const;

export type TrashEntityType = (typeof trashEntityTypes)[number];

export type TrashItem = {
  deletedAt: string;
  deletedBy: string | null;
  deletedByLabel: string | null;
  deletionMetadata: Record<string, unknown>;
  entityType: TrashEntityType;
  id: string;
  label: string;
  organizationName: string | null;
  parentLabel: string | null;
};

export type TrashListResult = {
  items: TrashItem[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};
