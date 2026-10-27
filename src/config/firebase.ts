import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
const storage = getStorage(app);

const useEmulators =
  __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";

const emulatorHost =
  Platform.OS === "web"
    ? "127.0.0.1"
    : process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";

if (useEmulators) {
  const globalState = globalThis as typeof globalThis & {
    __nexusEmulatorsConnected?: boolean;
  };

  if (!globalState.__nexusEmulatorsConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, {
      disableWarnings: true,
    });

    connectFirestoreEmulator(db, emulatorHost, 8080);

    connectFunctionsEmulator(functions, emulatorHost, 5001);

    globalState.__nexusEmulatorsConnected = true;
  }
}

export { app, auth, db, functions, storage };

