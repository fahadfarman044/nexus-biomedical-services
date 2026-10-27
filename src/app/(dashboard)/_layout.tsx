import { Redirect, Stack, useSegments } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { auth, db } from "../../config/firebase";

type NexusRole = "admin" | "employee" | "vendor" | "client";

const clientRoutes = [
  "client",
  "client-home",
  "client-service",
  "client-requests",
  "client-request-details",
  "client-create-request",
  "client-settings",
];

const authorizedDestinations = {
  admin: "/(dashboard)/admin",
  employee: "/(dashboard)/employee",
  vendor: "/(dashboard)/vendor",
  client: "/(dashboard)/client",
} as const;

export default function DashboardLayout() {
  const segments = useSegments();

  const [role, setRole] = useState<NexusRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const currentRequest = ++requestId;

      if (!active) return;

      setLoading(true);
      setRole(null);

      if (!user) {
        setLoading(false);
        return;
      }

      let authorizedRole: NexusRole | null = null;

      try {
        await user.reload();

        if (user.emailVerified) {
          const token = await user.getIdTokenResult(true);

          const isAdmin =
            token.claims.admin === true &&
            token.claims.nexusRole === "nexus_admin" &&
            token.claims.email_verified === true;

          if (isAdmin) {
            authorizedRole = "admin";
          } else {
            const snapshot = await getDoc(doc(db, "users", user.uid));

            if (snapshot.exists()) {
              const profile = snapshot.data();

              const validRole =
                profile.role === "employee" ||
                profile.role === "vendor" ||
                profile.role === "client";

              const isApproved = profile.status === "approved";

              const isCorrectUser = profile.uid === user.uid;

              if (validRole && isApproved && isCorrectUser) {
                authorizedRole = profile.role as NexusRole;
              }
            }
          }
        }
      } catch (error) {
        console.error("Nexus dashboard authorization error:", error);
      } finally {
        if (active && currentRequest === requestId) {
          setRole(authorizedRole);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      requestId++;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B00CC" />
        <Text style={styles.loadingText}>Verifying Nexus account...</Text>
      </View>
    );
  }

  if (!role) {
    return <Redirect href="/(auth)/login" />;
  }

  const currentRoute = String(segments[1] ?? "");

  const isAuthorizedRoute =
    role === "client"
      ? clientRoutes.includes(currentRoute)
      : currentRoute === role;

  if (!isAuthorizedRoute) {
    return <Redirect href={authorizedDestinations[role]} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#F5F9FF",
        },
      }}
    >
      <Stack.Screen name="admin" />
      <Stack.Screen name="employee" />
      <Stack.Screen name="vendor" />

      <Stack.Screen name="client" />
      <Stack.Screen name="client-home" />
      <Stack.Screen name="client-service" />
      <Stack.Screen name="client-requests" />
      <Stack.Screen name="client-request-details" />
      <Stack.Screen name="client-create-request" />
      <Stack.Screen name="client-settings" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F9FF",
  },

  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A0061",
  },
});
