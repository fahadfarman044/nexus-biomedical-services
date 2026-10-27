export type ServiceRequestPriority =
  | "Low"
  | "Medium"
  | "High"
  | "Urgent";

export type ServiceRequestStatus =
  | "pending_assignment"
  | "engineer_notified"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "closed";

export type ServiceContactMethod =
  | "Phone"
  | "Email"
  | "App Notification";

export interface ServiceRequestEquipment {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  department: string;
}

export interface ServiceRequestContact {
  name: string;
  phone: string;
  email: string;
  preferredMethod: ServiceContactMethod;
}

export interface ServiceRequest {
  id: string;
  requestNumber: string;

  organizationId: string;
  createdBy: string;

  facilityName: string;
  costCenter: string;
  customerReference: string;

  equipment: ServiceRequestEquipment;

  issueType: string;
  priority: ServiceRequestPriority;
  description: string;
  notes: string;

  contact: ServiceRequestContact;

  serviceArea: string;
  workgroup: string;

  assignedEngineerId: string | null;
  assignedEngineerName: string | null;

  status: ServiceRequestStatus;

  createdAt: unknown;
  updatedAt: unknown;
  closedAt: unknown | null;
}

export type CreateServiceRequestInput = Pick<
  ServiceRequest,
  | "costCenter"
  | "customerReference"
  | "equipment"
  | "issueType"
  | "priority"
  | "description"
  | "notes"
  | "contact"
  | "serviceArea"
  | "workgroup"
>;
