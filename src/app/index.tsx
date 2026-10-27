import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { onAuthStateChanged, User } from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../config/firebase";

type NexusRoute =
  | "/(auth)/login"
  | "/(dashboard)/admin"
  | "/(dashboard)/employee"
  | "/(dashboard)/vendor"
  | "/(dashboard)/client";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState<NexusRoute>("/(auth)/login");

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      let nextRoute: NexusRoute = "/(auth)/login";

      try {
        if (user) {
          await user.reload();

          if (user.emailVerified) {
            const token = await user.getIdTokenResult(true);

            const isAdmin =
              token.claims.admin === true &&
              token.claims.nexusRole === "nexus_admin";

            if (isAdmin) {
              nextRoute = "/(dashboard)/admin";
            } else {
              const snapshot = await getDoc(doc(db, "users", user.uid));

              if (snapshot.exists()) {
                const profile = snapshot.data();

                if (profile.status === "approved") {
                  switch (profile.role) {
                    case "employee":
                      nextRoute = "/(dashboard)/employee";
                      break;

                    case "vendor":
                      nextRoute = "/(dashboard)/vendor";
                      break;

                    case "client":
                      nextRoute = "/(dashboard)/client";
                      break;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Nexus startup authentication error:", error);
      } finally {
        if (active) {
          setDestination(nextRoute);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3B00CC" />

        <Text style={styles.loadingText}>
          Loading Nexus Biomedical Services...
        </Text>
      </View>
    );
  }

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F7FC",
  },

  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A0061",
    textAlign: "center",
  },
});
