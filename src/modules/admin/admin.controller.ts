import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { AdminService } from "./admin.service";

const adminService = new AdminService();

const parsePage = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getDashboardSummary = async (_request: Request, response: Response): Promise<void> => {
  const summary = await adminService.getDashboardSummary();
  sendSuccess(response, "Admin dashboard summary retrieved successfully.", summary);
};

export const listUsers = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.listUsers({
    limit: parsePage(request.query.limit, 20),
    page: parsePage(request.query.page, 1),
    query: typeof request.query.q === "string" ? request.query.q : undefined,
    status: typeof request.query.status === "string"
      ? (request.query.status as "approved" | "pending" | "rejected" | "suspended")
      : undefined
  });

  response.status(200).json({
    success: true,
    message: "Admin users retrieved successfully.",
    data: result.items,
    meta: {
      pagination: {
        limit: result.limit,
        page: result.page,
        total: result.total,
        totalPages: result.totalPages
      },
      requestId: request.requestId ?? null
    }
  });
};

export const getUserDetail = async (request: Request, response: Response): Promise<void> => {
  const detail = await adminService.getUserDetail(String(request.params.userId));
  sendSuccess(response, "Admin user detail retrieved successfully.", detail);
};

export const approveUser = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.approveUser({
    actorUserId: request.admin!.userId,
    organizationName: String(request.body.organizationName),
    userId: String(request.params.userId)
  });
  sendSuccess(response, "User approved successfully.", result);
};

export const rejectUser = async (request: Request, response: Response): Promise<void> => {
  await adminService.rejectUser({
    actorUserId: request.admin!.userId,
    reason: request.body.reason ?? null,
    userId: String(request.params.userId)
  });
  sendSuccess(response, "User rejected successfully.", null);
};

export const suspendUser = async (request: Request, response: Response): Promise<void> => {
  await adminService.suspendUser({
    actorUserId: request.admin!.userId,
    reason: request.body.reason ?? null,
    userId: String(request.params.userId)
  });
  sendSuccess(response, "User suspended successfully.", null);
};

export const reactivateUser = async (request: Request, response: Response): Promise<void> => {
  await adminService.reactivateUser({
    actorUserId: request.admin!.userId,
    userId: String(request.params.userId)
  });
  sendSuccess(response, "User reactivated successfully.", null);
};

export const updateUserRole = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.updateUserRole({
    actorUserId: request.admin!.userId,
    platformRole: request.body.platformRole,
    userId: String(request.params.userId)
  });
  sendSuccess(response, "User role updated successfully.", result);
};

export const listOrganizations = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.listOrganizations({
    limit: parsePage(request.query.limit, 20),
    page: parsePage(request.query.page, 1),
    query: typeof request.query.q === "string" ? request.query.q : undefined
  });

  response.status(200).json({
    success: true,
    message: "Admin organizations retrieved successfully.",
    data: result.items,
    meta: {
      pagination: {
        limit: result.limit,
        page: result.page,
        total: result.total,
        totalPages: result.totalPages
      },
      requestId: request.requestId ?? null
    }
  });
};

export const createOrganization = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.createOrganization({
    actorUserId: request.admin!.userId,
    name: String(request.body.name)
  });
  sendSuccess(response, "Organization created successfully.", result, 201);
};

export const getOrganizationDetail = async (request: Request, response: Response): Promise<void> => {
  const detail = await adminService.getOrganizationDetail(String(request.params.organizationId));
  sendSuccess(response, "Admin organization detail retrieved successfully.", detail);
};

export const listAuditLogs = async (request: Request, response: Response): Promise<void> => {
  const result = await adminService.listAuditLogs({
    action: typeof request.query.action === "string" ? request.query.action : undefined,
    limit: parsePage(request.query.limit, 20),
    page: parsePage(request.query.page, 1),
    targetType: typeof request.query.targetType === "string" ? request.query.targetType : undefined
  });

  response.status(200).json({
    success: true,
    message: "Audit logs retrieved successfully.",
    data: result.items,
    meta: {
      pagination: {
        limit: result.limit,
        page: result.page,
        total: result.total,
        totalPages: result.totalPages
      },
      requestId: request.requestId ?? null
    }
  });
};
