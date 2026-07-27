import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { AdminRepository } from "./admin.repository";

export class AdminService {
  public constructor(private readonly adminRepository = new AdminRepository()) {}

  public async getDashboardSummary() {
    return this.adminRepository.getDashboardSummary();
  }

  public async listUsers(input: {
    limit: number;
    page: number;
    query?: string;
    status?: "approved" | "pending" | "rejected" | "suspended";
  }) {
    return this.adminRepository.listUsers(input);
  }

  public async getUserDetail(userId: string) {
    const user = await this.adminRepository.getUserById(userId);

    if (!user) {
      throw new AppError(ERROR_CODES.userProfileNotFound, "User was not found.", 404);
    }

    const recentAudit = await this.adminRepository.listRecentAuditForUser(userId);

    return {
      recentAudit,
      user
    };
  }

  public async approveUser(input: {
    actorUserId: string;
    organizationName: string;
    userId: string;
  }) {
    return this.adminRepository.approveUser(input);
  }

  public async rejectUser(input: {
    actorUserId: string;
    reason: string | null;
    userId: string;
  }) {
    return this.adminRepository.rejectUser(input);
  }

  public async suspendUser(input: {
    actorUserId: string;
    reason: string | null;
    userId: string;
  }) {
    return this.adminRepository.suspendUser(input);
  }

  public async reactivateUser(input: { actorUserId: string; userId: string }) {
    return this.adminRepository.reactivateUser(input);
  }

  public async updateUserRole(input: {
    actorUserId: string;
    platformRole: "admin" | "business_owner";
    userId: string;
  }) {
    return this.adminRepository.updateUserRole(input);
  }

  public async listOrganizations(input: { limit: number; page: number; query?: string }) {
    return this.adminRepository.listOrganizations(input);
  }

  public async createOrganization(input: { actorUserId: string; name: string }) {
    return this.adminRepository.createOrganization(input);
  }

  public async getOrganizationDetail(organizationId: string) {
    const organization = await this.adminRepository.getOrganizationById(organizationId);

    if (!organization) {
      throw new AppError(ERROR_CODES.organizationNotFound, "Organization was not found.", 404);
    }

    const recentAudit = await this.adminRepository.listRecentAuditForOrganization(organizationId);

    return {
      organization,
      recentAudit
    };
  }

  public async listAuditLogs(input: {
    action?: string;
    limit: number;
    page: number;
    targetType?: string;
  }) {
    return this.adminRepository.listAuditLogs(input);
  }
}
