import type { Request, Response } from "express";

import { sendCreated, sendSuccess } from "../../common/http/api-response";
import { OrganizationService } from "./organization.service";

const organizationService = new OrganizationService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

export const createOrganization = async (request: Request, response: Response): Promise<void> => {
  const admin = request.admin!;
  const organization = await organizationService.createOrganization({
    name: String(request.body.name),
    ownerUserId: admin.userId,
    slug: String(request.body.slug)
  });

  sendCreated(response, "Organization created successfully.", organization);
};

export const listPublicOrganizations = async (_request: Request, response: Response): Promise<void> => {
  const organizations = await organizationService.listPublicOrganizations();
  sendSuccess(response, "Organizations retrieved successfully.", organizations);
};

export const listOrganizations = async (request: Request, response: Response): Promise<void> => {
  const organizations = await organizationService.listOrganizationsForUser(request.admin!.userId);
  sendSuccess(response, "Organizations retrieved successfully.", organizations);
};

export const getOrganization = async (request: Request, response: Response): Promise<void> => {
  const organization = await organizationService.getOrganization(
    getParam(request.params.organizationId),
    request.admin!.userId
  );

  sendSuccess(response, "Organization retrieved successfully.", organization);
};
