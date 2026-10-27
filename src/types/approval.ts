/**
 * Nexus Biomedical Services
 * Account Approval System
 *
 * Shared TypeScript types for:
 * - Nexus administrators
 * - Hospital and vendor managers
 * - Employees and organisation members
 * - Registration and approval workflows
 */

export type OrganizationType = "hospital" | "vendor";

export type OrganizationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

export type NexusRole = "nexus_admin" | "employee" | "vendor" | "client";

export type MembershipRole = "manager" | "member";

export type ApprovalAction = "approve" | "reject" | "suspend" | "reactivate";

export type ApprovalTarget = "organization" | "membership" | "nexus_employee";

export interface NexusOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;

  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;

  approvedBy?: string | null;
  approvedAt?: unknown;

  rejectionReason?: string | null;
}

export interface NexusUserProfile {
  uid: string;
  email: string;

  role: NexusRole;
  status: AccountStatus;

  organizationId?: string | null;
  membershipRole?: MembershipRole | null;

  details: Record<string, string>;

  createdAt: unknown;
  updatedAt: unknown;

  approvedBy?: string | null;
  approvedAt?: unknown;

  rejectionReason?: string | null;
}

export interface NexusMembership {
  id: string;
  uid: string;
  organizationId: string;

  role: MembershipRole;
  status: AccountStatus;

  createdAt: unknown;
  updatedAt: unknown;

  approvedBy?: string | null;
  approvedAt?: unknown;

  rejectionReason?: string | null;
}

export interface ApprovalAuditEntry {
  id: string;

  targetType: ApprovalTarget;
  targetId: string;

  action: ApprovalAction;
  performedBy: string;

  organizationId?: string | null;
  reason?: string | null;

  createdAt: unknown;
}

export interface ApprovalDecision {
  targetType: ApprovalTarget;
  targetId: string;
  action: ApprovalAction;
  reason?: string;
}

/**
 * These helpers are intended for UI presentation only.
 *
 * Actual permissions must be verified by trusted
 * Firebase backend functions and security rules.
 */

export function isApprovedAccount(
  profile: NexusUserProfile | null | undefined,
): boolean {
  return profile?.status === "approved";
}

export function isOrganizationManager(
  membership: NexusMembership | null | undefined,
): boolean {
  return membership?.role === "manager" && membership?.status === "approved";
}

export function isApprovedOrganization(
  organization: NexusOrganization | null | undefined,
): boolean {
  return organization?.status === "approved";
}

export function getApprovalStatusLabel(
  status: AccountStatus | OrganizationStatus,
): string {
  switch (status) {
    case "pending":
      return "Pending Approval";

    case "approved":
      return "Approved";

    case "rejected":
      return "Rejected";

    case "suspended":
      return "Suspended";

    default:
      return "Unknown";
  }
}
