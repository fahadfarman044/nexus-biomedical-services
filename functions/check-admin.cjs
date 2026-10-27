const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");

initializeApp({projectId: "nexus-biomedical-services"});

async function main() {
  try {
    const user = await getAuth().getUserByEmail(
      "fwaheed897@gmail.com"
    );

    console.log("ACCOUNT FOUND");
    console.log("UID:", user.uid);
    console.log("Email verified:", user.emailVerified);
    console.log("Disabled:", user.disabled);
    console.log("Admin claims:", user.customClaims || {});
  } catch (error) {
    console.log("ERROR:", error.message);
  }
}

main();
