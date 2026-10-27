import {createHash, randomBytes, timingSafeEqual} from "node:crypto";
/* eslint-disable max-len, require-jsdoc */
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {Resend} from "resend";

initializeApp();

const resendApiKey = defineSecret("RESEND_API_KEY");
const ADMIN_EMAIL = "fwaheed897@gmail.com";
const SENDER = "Nexus Biomedical Services <notifications@nexusbiomedicalservices.com>";

type Decision = "approved" | "rejected";
type NexusUser = {
  uid?: string;
  email?: string;
  role?: string;
  status?: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  rejectionReason?: string | null;
  organizationId?: string | null;
  details?: Record<string, unknown>;
};

function requireAdmin(request: {auth?: {uid: string; token: Record<string, unknown>}}): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in first.");
  const claims = request.auth.token;
  if (claims.admin !== true || claims.nexusRole !== "nexus_admin" || claims.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified Nexus administrator is required.");
  }
  return request.auth.uid;
}

function decisionOf(value: unknown): Decision {
  if (value !== "approved" && value !== "rejected") {
    throw new HttpsError("invalid-argument", "Decision must be approved or rejected.");
  }
  return value;
}

function documentId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError("invalid-argument", `Invalid ${label}.`);
  }
  return value;
}

function rejectionReason(decision: Decision, value: unknown): string | null {
  if (decision === "approved") return null;
  if (typeof value !== "string" || value.trim().length < 10 || value.trim().length > 1000) {
    throw new HttpsError("invalid-argument", "Rejection reason must be 10 to 1000 characters.");
  }
  return value.trim();
}

function requiredText(value: unknown, label: string, maxLength = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new HttpsError("invalid-argument", `${label} must contain 1 to ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength = 1000): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new HttpsError("invalid-argument", `${label} cannot exceed ${maxLength} characters.`);
  }
  return value.trim();
}

function objectOf(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${label} is required.`);
  }
  return value as Record<string, unknown>;
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && /[A-Za-z\u00C0-\u024F\u0600-\u06FF]/u.test(name) ? name : null;
}

function displayName(user: NexusUser): string {
  const details = user.details || {};
  const first = cleanName(user.firstName) || cleanName(details.firstName);
  const last = cleanName(user.lastName) || cleanName(details.lastName);
  if (first || last) return [first, last].filter(Boolean).join(" ");
  const candidates = [
    user.fullName, user.name, user.contactName,
    details.fullName, details.name, details.contactName,
    details.applicantName, details.contactPerson,
    details.companyName, details.facilityName, details.organizationName,
  ];
  for (const candidate of candidates) {
    const name = cleanName(candidate);
    if (name) return name;
  }
  return user.email || "Nexus Applicant";
}

async function sendEmail(to: string, subject: string, message: string): Promise<void> {
  const key = resendApiKey.value();
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  const result = await new Resend(key).emails.send({from: SENDER, to: [to], subject, text: message});
  if (result.error) throw new Error(result.error.message);
  console.log("Nexus email accepted:", {to, emailId: result.data?.id});
}

export const notifyNewRegistration = onDocumentCreated(
  {document: "users/{userId}", region: "us-central1", secrets: [resendApiKey], retry: false},
  async (event) => {
    if (!event.data) return;
    const user = event.data.data() as NexusUser;
    const userId = event.params.userId;
    if (user.status !== "pending" || !["employee", "vendor", "client"].includes(user.role || "")) return;
    const name = displayName(user);

    if (validEmail(user.email)) {
      try {
        const authUser = await getAuth().getUser(userId);
        if (authUser.email && authUser.email.toLowerCase() === user.email.toLowerCase() && !authUser.emailVerified) {
          const link = await getAuth().generateEmailVerificationLink(authUser.email);
          await sendEmail(authUser.email, "Verify Your Nexus Biomedical Services Email", [
            `Hello ${name},`, "",
            "Thank you for registering with Nexus Biomedical Services.", "",
            "Verify your email address using this link:", link, "",
            "Your registration also requires administrator approval.",
            "If you did not register, you can ignore this email.", "",
            "Nexus Biomedical Services",
          ].join("\n"));
        }
      } catch (error) {
        console.error("Verification email failed:", error);
      }
    }

    try {
      await sendEmail(ADMIN_EMAIL, `Nexus Registration Request - ${user.role}`, [
        "Nexus Biomedical Services", "",
        "A new registration requires administrator review.", "",
        `Applicant: ${name}`,
        `Email: ${user.email || "Not provided"}`,
        `Role: ${user.role}`,
        `User ID: ${userId}`, "",
        "Sign in to the Nexus Admin Dashboard to review this registration.",
      ].join("\n"));
    } catch (error) {
      console.error("Administrator notification failed:", error);
    }
  },
);

export const notifyRegistrationDecision = onDocumentUpdated(
  {document: "users/{userId}", region: "us-central1", secrets: [resendApiKey], retry: false},
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data() as NexusUser;
    const after = event.data.after.data() as NexusUser;
    if (before.status === after.status || !["approved", "rejected"].includes(after.status || "")) return;
    if (!validEmail(after.email)) {
      console.error("Decision email skipped: invalid recipient.");
      return;
    }
    const name = displayName(after);
    const approved = after.status === "approved";
    const subject = approved ? "Nexus Registration Approved" : "Nexus Registration Rejected";
    const message = approved ? [
      `Hello ${name},`, "",
      "Your Nexus Biomedical Services registration has been approved.", "",
      "You can sign in using your registered email and password once your email is verified.", "",
      "Nexus Biomedical Services",
    ].join("\n") : [
      `Hello ${name},`, "",
      "Your Nexus Biomedical Services registration has not been approved.", "",
      "Reason:", after.rejectionReason?.trim() || "No reason was recorded.", "",
      "Please contact Nexus administration if you need clarification.", "",
      "Nexus Biomedical Services",
    ].join("\n");
    try {
      await sendEmail(after.email, subject, message);
    } catch (error) {
      console.error("Registration decision email failed:", error);
    }
  },
);

export const reviewOrganization = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    const adminUid = requireAdmin(request);
    const organizationId = documentId(request.data?.organizationId, "organization ID");
    const decision = decisionOf(request.data?.decision);
    const db = getFirestore();
    const orgRef = db.collection("organizations").doc(organizationId);
    const auditRef = db.collection("approvalAudit").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orgRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Organization not found.");
      const organization = snapshot.data();
      if (organization?.status !== "pending") {
        throw new HttpsError("failed-precondition", "Only pending organizations can be reviewed.");
      }
      if (!["hospital", "vendor"].includes(organization?.type)) {
        throw new HttpsError("failed-precondition", "Invalid organization type.");
      }
      transaction.update(orgRef, {
        status: decision, reviewedBy: adminUid,
        reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef, {
        action: "organization_review", organizationId, decision,
        performedBy: adminUid, createdAt: FieldValue.serverTimestamp(),
      });
    });
    return {success: true, organizationId, status: decision};
  },
);

export const reviewUser = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    const adminUid = requireAdmin(request);
    const userId = documentId(request.data?.userId, "user ID");
    const decision = decisionOf(request.data?.decision);
    const reason = rejectionReason(decision, request.data?.rejectionReason);
    const db = getFirestore();
    const userRef = db.collection("users").doc(userId);
    const orgRef = db.collection("organizations").doc(`client_${userId}`);
    const auditRef = db.collection("approvalAudit").doc();
    let organizationId: string | null = null;

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "User profile not found.");
      const user = snapshot.data() as NexusUser;
      if (user.status !== "pending") {
        throw new HttpsError("failed-precondition", "Only pending users can be reviewed.");
      }
      if (!["employee", "vendor", "client"].includes(user.role || "")) {
        throw new HttpsError("failed-precondition", "Invalid user role.");
      }
      if (user.uid && user.uid !== userId) {
        throw new HttpsError("failed-precondition", "User UID does not match document ID.");
      }

      let facilityName: string | null = null;
      let organizationExists = false;
      if (decision === "approved" && user.role === "client") {
        facilityName = cleanName(user.details?.facilityName);
        if (!facilityName || facilityName.length < 3) {
          throw new HttpsError("failed-precondition", "Client must have a valid facility name.");
        }
        const orgSnapshot = await transaction.get(orgRef);
        organizationExists = orgSnapshot.exists;
        if (organizationExists) {
          const existing = orgSnapshot.data();
          if (existing?.createdBy !== userId || existing?.type !== "hospital" || existing?.status !== "approved") {
            throw new HttpsError("failed-precondition", "Client organization ID conflict.");
          }
        }
        if (user.organizationId && user.organizationId !== orgRef.id) {
          throw new HttpsError("failed-precondition", "Client belongs to another organization. Review manually.");
        }
        organizationId = orgRef.id;
      }

      const reviewedAt = FieldValue.serverTimestamp();
      if (facilityName && !organizationExists) {
        transaction.create(orgRef, {
          id: orgRef.id, name: facilityName, type: "hospital", status: "approved",
          createdBy: userId, createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(), approvedBy: adminUid,
          approvedAt: reviewedAt, rejectionReason: null,
        });
      }
      transaction.update(userRef, {
        status: decision, rejectionReason: reason, reviewedBy: adminUid,
        reviewedAt, updatedAt: FieldValue.serverTimestamp(),
        ...(organizationId ? {organizationId, membershipRole: "manager"} : {}),
      });
      transaction.create(auditRef, {
        action: "user_review", userId, decision, rejectionReason: reason,
        performedBy: adminUid, ...(organizationId ? {organizationId} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    console.log("Nexus registration reviewed:", {userId, decision, adminUid, organizationId});
    return {success: true, userId, status: decision, organizationId};
  },
);

export const createServiceRequest = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: [resendApiKey]},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in first.");
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "Please verify your email first.");
    }
    const uid = request.auth.uid;
    const data = objectOf(request.data, "Service request");
    const db = getFirestore();
    const userSnapshot = await db.collection("users").doc(uid).get();
    if (!userSnapshot.exists) throw new HttpsError("not-found", "Nexus account profile not found.");
    const user = userSnapshot.data() as NexusUser;
    if (user.role !== "client" || user.status !== "approved") {
      throw new HttpsError("permission-denied", "Only approved clients can create service requests.");
    }
    const organizationId = user.organizationId;
    if (!organizationId || !/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)) {
      throw new HttpsError("failed-precondition", "Your account is not linked to an organization.");
    }
    const orgSnapshot = await db.collection("organizations").doc(organizationId).get();
    if (!orgSnapshot.exists || orgSnapshot.data()?.status !== "approved") {
      throw new HttpsError("failed-precondition", "Your organization is not approved.");
    }

    const equipment = data.equipment == null ? null : objectOf(data.equipment, "Equipment information");
    const contact = objectOf(data.contact, "Contact information");
    const priority = requiredText(data.priority, "Priority", 20);
    if (!["Low", "Medium", "High", "Urgent"].includes(priority)) {
      throw new HttpsError("invalid-argument", "Invalid priority.");
    }
    const preferredMethod = requiredText(contact.preferredMethod, "Contact method", 30);
    if (!["Phone", "Email", "App Notification"].includes(preferredMethod)) {
      throw new HttpsError("invalid-argument", "Invalid contact method.");
    }
    const contactEmail = optionalText(contact.email, "Contact email", 254);
    const contactPhone = optionalText(contact.phone, "Contact phone", 40);
    if (contactEmail && !validEmail(contactEmail)) {
      throw new HttpsError("invalid-argument", "Invalid contact email.");
    }
    if (preferredMethod === "Email" && !contactEmail) {
      throw new HttpsError("invalid-argument", "Contact email is required.");
    }
    if (preferredMethod === "Phone" && !contactPhone) {
      throw new HttpsError("invalid-argument", "Contact phone is required.");
    }

    const requestRef = db.collection("serviceRequests").doc();
    const requestNumber = `NSR-${requestRef.id.slice(0, 12).toUpperCase()}`;
    await requestRef.create({
      id: requestRef.id, requestNumber, organizationId, createdBy: uid,
      facilityName: requiredText(orgSnapshot.data()?.name, "Facility name", 200),
      costCenter: optionalText(data.costCenter, "Cost center", 100),
      customerReference: optionalText(data.customerReference, "Customer reference", 100),
      equipment: equipment ? {
        id: requiredText(equipment.id, "Equipment ID", 100),
        name: requiredText(equipment.name, "Equipment name", 200),
        model: optionalText(equipment.model, "Equipment model", 200),
        serialNumber: optionalText(equipment.serialNumber, "Serial number", 150),
        location: optionalText(equipment.location, "Equipment location", 200),
        department: optionalText(equipment.department, "Department", 200),
      } : null,
      issueType: requiredText(data.issueType, "Issue type", 100),
      priority,
      description: requiredText(data.description, "Description", 500),
      notes: optionalText(data.notes, "Notes", 2000),
      contact: {
        name: requiredText(contact.name, "Contact name", 150),
        phone: contactPhone, email: contactEmail, preferredMethod,
      },
      serviceArea: optionalText(data.serviceArea, "Service area", 150),
      workgroup: optionalText(data.workgroup, "Workgroup", 150),
      assignedEngineerId: null, assignedEngineerName: null,
      status: "pending_assignment", createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), closedAt: null,
    });
    // Email delivery is best effort: a mail outage never creates a duplicate request.
    const facility = String(orgSnapshot.data()?.name || "Hospital");
    const clientEmail = user.email;
    const contactName = String(contact.name);
    const detailLines = [
      `Request: ${requestNumber}`, `Facility: ${facility}`,
      `Submitted by: ${contactName}`, `Client email: ${clientEmail || "Not available"}`,
      `Issue: ${String(data.issueType)}`, `Priority: ${priority}`,
      `Description: ${String(data.description)}`,
      `Contact phone: ${contactPhone || "Not provided"}`,
      `Contact email: ${contactEmail || "Not provided"}`,
      `Preferred contact: ${preferredMethod}`,
      `Cost centre: ${String(data.costCenter || "Not provided")}`,
      `Customer reference: ${String(data.customerReference || "Not provided")}`,
      `Additional notes: ${String(data.notes || "Not provided")}`,
      `Status: Request submitted — awaiting engineer assignment`,
    ];
    const emails: Promise<void>[] = [];
    if (validEmail(clientEmail)) {
      emails.push(sendEmail(clientEmail, `Nexus Service Request Received - ${requestNumber}`,
        [`Hello ${contactName},`, "", "Your service request was submitted successfully.",
          "We will notify you as the request progresses.", "", ...detailLines].join("\n")));
    }
    emails.push(sendEmail(ADMIN_EMAIL, `New Nexus Service Request - ${requestNumber}`,
      ["A new client service request needs administrator attention.", "", ...detailLines].join("\n")));
    const emailResults = await Promise.allSettled(emails);
    emailResults.forEach((result, index) => {
      if (result.status === "rejected") console.error("Service request email failed", index, result.reason);
    });
    console.log("Nexus service request created:", {requestNumber, organizationId, createdBy: uid});
    return {success: true, requestId: requestRef.id, requestNumber, status: "pending_assignment"};
  },
);

// ============================================
// NEXUS EQUIPMENT MANAGEMENT
// All mutations require a verified Nexus Admin.
// ============================================

export const createEquipment = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    const adminUid = requireAdmin(request);
    const data = objectOf(request.data, "Equipment data");
    const organizationId = documentId(data.organizationId, "organization ID");
    const name = requiredText(data.name, "Equipment name", 200);
    const model = optionalText(data.model, "Model", 200);
    const serialNumber = optionalText(data.serialNumber, "Serial number", 150);
    const location = optionalText(data.location, "Location", 200);
    const department = optionalText(data.department, "Department", 200);
    const db = getFirestore();
    const organization = await db.collection("organizations").doc(organizationId).get();
    if (!organization.exists || organization.data()?.status !== "approved") {
      throw new HttpsError("failed-precondition", "An approved organisation is required.");
    }

    const equipmentRef = db.collection("equipment").doc();
    const auditRef = db.collection("approvalAudit").doc();
    const batch = db.batch();
    batch.create(equipmentRef, {
      id: equipmentRef.id,
      organizationId,
      name,
      model,
      serialNumber,
      location,
      department,
      status: "active",
      createdBy: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(auditRef, {
      action: "equipment_create",
      equipmentId: equipmentRef.id,
      organizationId,
      performedBy: adminUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return {success: true, equipmentId: equipmentRef.id};
  },
);

export const updateEquipment = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    const adminUid = requireAdmin(request);
    const data = objectOf(request.data, "Equipment data");
    const equipmentId = documentId(data.equipmentId, "equipment ID");
    const updates: Record<string, string> = {};
    if (data.name !== undefined) updates.name = requiredText(data.name, "Equipment name", 200);
    if (data.model !== undefined) updates.model = optionalText(data.model, "Model", 200);
    if (data.serialNumber !== undefined) {
      updates.serialNumber = optionalText(data.serialNumber, "Serial number", 150);
    }
    if (data.location !== undefined) updates.location = optionalText(data.location, "Location", 200);
    if (data.department !== undefined) {
      updates.department = optionalText(data.department, "Department", 200);
    }
    if (!Object.keys(updates).length) {
      throw new HttpsError("invalid-argument", "Provide at least one editable equipment field.");
    }

    const db = getFirestore();
    const equipmentRef = db.collection("equipment").doc(equipmentId);
    const auditRef = db.collection("approvalAudit").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(equipmentRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Equipment not found.");
      const equipment = snapshot.data();
      if (equipment?.status === "retired") {
        throw new HttpsError("failed-precondition", "Retired equipment cannot be edited.");
      }
      if (typeof equipment?.organizationId !== "string") {
        throw new HttpsError("failed-precondition", "Equipment has no organisation.");
      }
      transaction.update(equipmentRef, {
        ...updates,
        updatedBy: adminUid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef, {
        action: "equipment_update",
        equipmentId,
        organizationId: equipment.organizationId,
        changedFields: Object.keys(updates),
        performedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return {success: true, equipmentId};
  },
);

export const retireEquipment = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    const adminUid = requireAdmin(request);
    const equipmentId = documentId(request.data?.equipmentId, "equipment ID");
    const db = getFirestore();
    const equipmentRef = db.collection("equipment").doc(equipmentId);
    const auditRef = db.collection("approvalAudit").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(equipmentRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Equipment not found.");
      const equipment = snapshot.data();
      if (equipment?.status === "retired") {
        throw new HttpsError("failed-precondition", "Equipment is already retired.");
      }
      transaction.update(equipmentRef, {
        status: "retired",
        retiredBy: adminUid,
        retiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef, {
        action: "equipment_retire",
        equipmentId,
        organizationId: equipment?.organizationId || null,
        performedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return {success: true, equipmentId};
  },
);


// Authenticated client password reset using a single-use, 120-second email OTP.
const OTP_LIFETIME_MS = 120_000;
const OTP_COOLDOWN_MS = 60_000;
const OTP_LIMIT = 5;
function otpDigest(uid: string, otp: string, nonce: string): string {
  return createHash("sha256").update(`${uid}:${nonce}:${otp}`).digest("hex");
}

export const requestClientPasswordOtp = onCall(
  {region: "us-central1", secrets: [resendApiKey], enforceAppCheck: false},
  async (request) => {
    if (!request.auth?.uid || request.auth.token.email_verified !== true) {
      throw new HttpsError("unauthenticated", "Sign in with your verified account first.");
    }
    const uid = request.auth.uid;
    const user = await getAuth().getUser(uid);
    if (!user.email || !user.emailVerified) {
      throw new HttpsError("failed-precondition", "Your email must be verified.");
    }
    const ref = getFirestore().collection("passwordResetOtps").doc(uid);
    const now = Date.now();
    const otp = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
    const nonce = randomBytes(24).toString("hex");
    await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.data();
      if (old?.lastSentAt && now - old.lastSentAt < OTP_COOLDOWN_MS) {
        throw new HttpsError("resource-exhausted", "Wait 60 seconds before requesting another code.");
      }
      tx.set(ref, {hash: otpDigest(uid, otp, nonce), nonce, expiresAt: now + OTP_LIFETIME_MS,
        lastSentAt: now, attempts: 0, sending: true});
    });
    try {
      await sendEmail(user.email, "Nexus Password Reset Verification Code", [
        "Nexus Biomedical Services", "", `Your password reset code is: ${otp}`, "",
        "This code expires in 120 seconds. Never share it with anyone.",
        "If you did not request this, ignore this email.",
      ].join("\n"));
      await ref.update({sending: false});
    } catch (error) {
      await ref.delete().catch(() => {});
      console.error("Password OTP email delivery failed", error);
      throw new HttpsError("unavailable", "Unable to send the code. Please try again later.");
    }
    return {success: true, expiresInSeconds: 120};
  },
);

export const confirmClientPasswordOtp = onCall(
  {region: "us-central1", enforceAppCheck: false},
  async (request) => {
    if (!request.auth?.uid || request.auth.token.email_verified !== true) {
      throw new HttpsError("unauthenticated", "Sign in with your verified account first.");
    }
    const uid = request.auth.uid;
    const data = objectOf(request.data, "Password reset");
    const code = String(data.code || "").trim();
    const newPassword = String(data.newPassword || "");
    if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter a valid six-digit code.");
    if (newPassword.length < 12 || newPassword.length > 128) {
      throw new HttpsError("invalid-argument", "Password must contain 12 to 128 characters.");
    }
    const ref = getFirestore().collection("passwordResetOtps").doc(uid);
    const accepted = await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const state = snap.data();
      if (!state || state.sending || Date.now() >= state.expiresAt) {
        throw new HttpsError("deadline-exceeded", "Code expired. Request a new one.");
      }
      if (state.attempts >= OTP_LIMIT || !state.hash) {
        throw new HttpsError("resource-exhausted", "Too many attempts. Request a new code.");
      }
      const actual = Buffer.from(otpDigest(uid, code, state.nonce), "hex");
      const expected = Buffer.from(state.hash, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        tx.update(ref, {attempts: state.attempts + 1});
        return false;
      }
      tx.update(ref, {hash: "", expiresAt: 0, attempts: OTP_LIMIT});
      return true;
    });
    if (!accepted) throw new HttpsError("permission-denied", "Incorrect code.");
    await getAuth().updateUser(uid, {password: newPassword});
    await getAuth().revokeRefreshTokens(uid);
    await ref.delete();
    return {success: true};
  },
);
