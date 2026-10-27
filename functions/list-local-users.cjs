const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");

initializeApp({projectId: "nexus-biomedical-services"});

async function main() {
  const result = await getAuth().listUsers(1000);

  for (const user of result.users) {
    console.log({
      email: user.email,
      uid: user.uid,
      verified: user.emailVerified,
      claims: user.customClaims || {},
    });
  }
}

main().catch(console.error);
