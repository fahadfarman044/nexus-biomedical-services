import {httpsCallable} from "firebase/functions";

import {functions} from "../config/firebase";

import type {
  CreateServiceRequestInput,
} from "../types/serviceRequest";

export interface CreateServiceRequestResult {
  success: boolean;
  requestId: string;
  requestNumber: string;
  status: "pending_assignment";
}

export async function createNexusServiceRequest(
  input: CreateServiceRequestInput,
): Promise<CreateServiceRequestResult> {
  const callable = httpsCallable<
    CreateServiceRequestInput,
    CreateServiceRequestResult
  >(functions, "createServiceRequest");

  const result = await callable(input);

  if (!result.data.success || !result.data.requestId) {
    throw new Error("Unable to create service request.");
  }

  return result.data;
}
