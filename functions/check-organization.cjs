const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "nexus-biomedical-services" });

async function main() {
  const orgId = "client_I8Yx2hhamxSQxqI4xw92lKIXiJ4g";

  const snapshot = await getFirestore()
    .collection("organizations")
    .doc(orgId)
    .get();

  if (!snapshot.exists) {
    console.log("ORGANISATION NOT FOUND");
    return;
  }

  console.log("ORGANISATION FOUND");
  console.log(JSON.stringify(snapshot.data(), null, 2));
}

main().catch(console.error);
