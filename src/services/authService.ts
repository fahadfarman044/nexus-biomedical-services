import {
    createUserWithEmailAndPassword,
    reload,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    User,
} from "firebase/auth";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../config/firebase";

export type NexusRole = "employee" | "vendor" | "client";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface NexusProfile {
  uid: string;
  email: string;
  role: NexusRole;
  status: ApprovalStatus;
  details: Record<string, string>;
}

export async function registerNexusUser(
  role: NexusRole,
  details: Record<string, string>,
  password: string,
) {
  const email = details.email?.trim().toLowerCase();

  if (!email) throw new Error("Email is required.");

  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );

  const user = credential.user;

  try {
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email,
      role,
      status: "pending",
      details: { ...details, email },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await sendEmailVerification(user);

    return {
      uid: user.uid,
      email,
      role,
      status: "pending" as const,
    };
  } finally {
    await signOut(auth).catch(() => {});
  }
}

export async function loginNexusUser(
  email: string,
  password: string,
): Promise<NexusProfile> {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password,
  );

  try {
    await reload(credential.user);

    if (!credential.user.emailVerified) {
      throw new Error("Please verify your email before signing in.");
    }

    const snapshot = await getDoc(doc(db, "users", credential.user.uid));

    if (!snapshot.exists()) {
      throw new Error("Account profile not found. Contact Nexus support.");
    }

    const profile = snapshot.data() as NexusProfile;

    if (profile.status === "pending") {
      throw new Error("Your account is awaiting administrator approval.");
    }

    if (profile.status === "rejected") {
      throw new Error("Your registration has not been approved.");
    }

    if (profile.status !== "approved") {
      throw new Error("Account status is invalid.");
    }

    if (!["employee", "vendor", "client"].includes(profile.role)) {
      throw new Error("Account role is invalid.");
    }

    return profile;
  } catch (error) {
    await signOut(auth).catch(() => {});
    throw error;
  }
}

export async function resetNexusPassword(email: string) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function resendNexusVerification() {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");
  await sendEmailVerification(user);
}

export async function logoutNexusUser() {
  await signOut(auth);
}

export async function getNexusProfile(
  user: User,
): Promise<NexusProfile | null> {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  return snapshot.exists() ? (snapshot.data() as NexusProfile) : null;
}
