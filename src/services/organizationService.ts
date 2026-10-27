import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
} from "firebase/firestore";

import { auth, db } from "../config/firebase";

import type {
    NexusMembership,
    NexusOrganization,
    OrganizationType,
} from "../types/approval";

export interface CreateOrganizationInput {
  name: string;
  type: OrganizationType;
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<string> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in before registering an organisation.");
  }

  if (!user.emailVerified) {
    throw new Error(
      "Please verify your email before registering an organisation.",
    );
  }

  const name = input.name.trim();

  if (name.length < 3) {
    throw new Error("Organisation name must contain at least 3 characters.");
  }

  if (!["hospital", "vendor"].includes(input.type)) {
    throw new Error("Invalid organisation type.");
  }

  const organizationRef = doc(collection(db, "organizations"));

  const organization = {
    id: organizationRef.id,
    name,
    type: input.type,
    status: "pending",
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    approvedBy: null,
    rejectionReason: null,
  };

  await setDoc(organizationRef, organization);

  return organizationRef.id;
}

export async function getOrganization(
  organizationId: string,
): Promise<NexusOrganization | null> {
  const snapshot = await getDoc(doc(db, "organizations", organizationId));

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as NexusOrganization;
}

export async function getMyOrganizations(): Promise<NexusOrganization[]> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const organizationsQuery = query(
    collection(db, "organizations"),
    where("createdBy", "==", user.uid),
  );

  const snapshot = await getDocs(organizationsQuery);

  return snapshot.docs.map((document) => document.data() as NexusOrganization);
}

export async function getMyMemberships(): Promise<NexusMembership[]> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const membershipsQuery = query(
    collection(db, "memberships"),
    where("uid", "==", user.uid),
  );

  const snapshot = await getDocs(membershipsQuery);

  return snapshot.docs.map((document) => document.data() as NexusMembership);
}
