require("dotenv").config();

const {
  initializeApp,
  getApps,
  applicationDefault,
} = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");

async function main() {
  const email = process.env.NEXUS_ADMIN_EMAIL?.trim().toLowerCase();

  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!email) {
    throw new Error("NEXUS_ADMIN_EMAIL is missing.");
  }

  if (!credentials) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is missing.");
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: "nexus-biomedical-services",
    });
  }

  const auth = getAuth();

  console.log("Connecting to Nexus Firebase...");

  const user = await auth.getUserByEmail(email);

  if (!user.emailVerified) {
    throw new Error("Administrator email must be verified first.");
  }

  if (user.disabled) {
    throw new Error("Administrator account is disabled.");
  }

  const existingClaims = user.customClaims || {};

  if (existingClaims.admin === true) {
    console.log("Nexus Admin already configured.");
    console.log("UID:", user.uid);
    return;
  }

  await auth.setCustomUserClaims(user.uid, {
    ...existingClaims,
    admin: true,
    nexusRole: "nexus_admin",
  });

  console.log("SUCCESS: Nexus Admin access granted.");
  console.log("Administrator:", email);
  console.log("UID:", user.uid);
  console.log("Sign out and sign in again.");
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
