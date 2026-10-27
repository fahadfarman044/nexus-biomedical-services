const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");

initializeApp({projectId: "nexus-biomedical-services"});

async function main() {
  const result = await getAuth().listUsers(1000);

  console.log("TOTAL USERS:", result.users.length);

  for (const user of result.users) {
    console.log(
      user.email,
      "| UID:", user.uid,
      "| Admin:", user.customClaims?.admin === true
    );
  }
}

main().catch(console.error);
