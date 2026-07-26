declare namespace Express {
  export interface AuthenticatedUser {
    userId: string;
    email: string | null;
    sessionId: string;
  }

  export interface AuthenticatedAdmin {
    userId: string;
    email: string | null;
    sessionId: string;
  }

  export interface AccountProfile {
    userId: string;
    fullName: string;
    role: "business_owner" | "admin";
    accountStatus: "pending" | "approved" | "rejected" | "suspended";
    approvedAt: string | null;
    rejectedAt: string | null;
    suspendedAt: string | null;
  }

  export interface AuthenticatedRespondent {
    invitationId: string;
    sessionId: string;
    surveyId: string;
  }

  export interface Request {
    account?: AccountProfile;
    admin?: AuthenticatedAdmin;
    auth?: AuthenticatedUser;
    respondent?: AuthenticatedRespondent;
    requestId?: string;
  }
}
