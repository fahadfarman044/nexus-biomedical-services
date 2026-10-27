require("dotenv").config();

const {
  initializeApp,
  getApps,
  applicationDefault,
} = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");

async function main() {
  const email = process.env.NEXUS_ADMIN_EMAIL;

  if (!email) {
    throw new Error("NEXUS_ADMIN_EMAIL is missing.");
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: "nexus-biomedical-services",
    });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);

  if (user.emailVerified) {
    console.log("Email is already verified.");
    return;
  }

  const link = await auth.generateEmailVerificationLink(email);

  console.log("Email verification link:");
  console.log(link);
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
