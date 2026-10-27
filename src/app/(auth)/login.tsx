import { useRouter } from "expo-router";
import { useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react-native";

import {
  reload,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const COLORS = {
  primary: "#1A0061",
  secondary: "#3B00CC",
  accent: "#8600E1",
  background: "#F8F7FC",
  surface: "#FFFFFF",
  surfaceLight: "#F1EBFF",
  muted: "#6B6480",
  border: "#E6DFF2",
  white: "#FFFFFF",
  danger: "#B42318",
  success: "#16804A",
};

type NexusRole = "employee" | "vendor" | "client";

function isNexusRole(value: unknown): value is NexusRole {
  return value === "employee" || value === "vendor" || value === "client";
}

function getFirebaseErrorMessage(error: any): string {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email address or password. If you are testing locally, confirm the account exists in the Firebase Auth Emulator.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-disabled":
      return "This account has been disabled. Contact Nexus administration.";

    case "auth/too-many-requests":
      return "Too many login attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Firebase Authentication connection failed. Check whether the Auth Emulator is running on port 9099 and Expo is using the correct emulator host.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "Firestore access denied. Check your security rules and account permissions.";

    default:
      return error?.message || "Unable to sign in. Please try again.";
  }
}

function logFirebaseError(error: any) {
  console.error("========== NEXUS LOGIN DEBUG ==========");
  console.error("Firebase error code:", error?.code);
  console.error("Firebase error message:", error?.message);
  console.error("Firebase project:", auth.app.options.projectId);
  console.error(
    "Using Firebase emulators:",
    __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true",
  );
  console.error("Platform:", Platform.OS);
  console.error("=======================================");
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const usingEmulators =
    __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";

  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage("");

    if (Platform.OS !== "web") {
      Alert.alert("Nexus Login", message);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage("");

    if (Platform.OS !== "web") {
      Alert.alert("Nexus Biomedical Services", message);
    }
  };

  const handleLogin = async () => {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      showError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      console.log("Nexus: Starting authentication.");
      console.log("Firebase project:", auth.app.options.projectId);
      console.log("Using emulators:", usingEmulators);

      const credential = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password,
      );

      const user = credential.user;

      await reload(user);

      if (!user.emailVerified) {
        await signOut(auth);

        showError(
          "Please verify your email address using the verification link sent to your registered email, then sign in again.",
        );
        return;
      }

      const tokenResult = await user.getIdTokenResult(true);

      const isNexusAdmin =
        tokenResult.claims.admin === true &&
        tokenResult.claims.nexusRole === "nexus_admin" &&
        tokenResult.claims.email_verified === true;

      if (isNexusAdmin) {
        console.log("Nexus administrator authenticated.");

        router.replace("/(dashboard)/admin");
        return;
      }

      if (
        tokenResult.claims.admin === true ||
        tokenResult.claims.nexusRole === "nexus_admin"
      ) {
        await signOut(auth);

        showError(
          "Administrator permissions are incomplete. Please contact Nexus administration.",
        );
        return;
      }

      const profileSnapshot = await getDoc(doc(db, "users", user.uid));

      if (!profileSnapshot.exists()) {
        await signOut(auth);

        showError(
          "Your account exists, but your Nexus profile was not found. Please contact the administrator.",
        );
        return;
      }

      const profile = profileSnapshot.data();

      if (profile.uid !== undefined && profile.uid !== user.uid) {
        await signOut(auth);
        showError("Account profile identity mismatch.");
        return;
      }

      if (
        typeof profile.email !== "string" ||
        profile.email.toLowerCase() !== (user.email || "").toLowerCase()
      ) {
        await signOut(auth);
        showError("Account profile email mismatch.");
        return;
      }

      if (profile.status === "pending") {
        await signOut(auth);

        showError(
          "Your email is verified. Your registration is awaiting Nexus administrator approval.",
        );
        return;
      }

      if (profile.status === "rejected") {
        await signOut(auth);

        showError(
          "Your registration was not approved. Please contact Nexus administration.",
        );
        return;
      }

      if (profile.status !== "approved") {
        await signOut(auth);

        showError("Your account does not have a valid approval status.");
        return;
      }

      if (!isNexusRole(profile.role)) {
        await signOut(auth);

        showError("Your account does not have a valid Nexus role.");
        return;
      }

      switch (profile.role) {
        case "employee":
          router.replace("/(dashboard)/employee");
          return;

        case "vendor":
          router.replace("/(dashboard)/vendor");
          return;

        case "client":
          router.replace("/(dashboard)/client");
          return;
      }
    } catch (error: any) {
      logFirebaseError(error);

      await signOut(auth).catch(() => {});

      showError(getFirebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showError("Enter your registered email address first.");
      return;
    }

    if (resetLoading || loading) return;

    setResetLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await sendPasswordResetEmail(auth, cleanEmail);

      showSuccess(
        usingEmulators
          ? "Password reset requested. Check the Firebase Auth Emulator logs for the reset link."
          : "If an account exists for this email, password reset instructions will be sent.",
      );
    } catch (error: any) {
      logFirebaseError(error);

      if (error?.code === "auth/invalid-email") {
        showError("Please enter a valid email address.");
      } else if (error?.code === "auth/network-request-failed") {
        showError("Unable to connect to Firebase Authentication.");
      } else {
        showError("Unable to process the password reset request.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoContainer}>
            <Image
              source={require("../../../assets/images/nexus-logo.jpg")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Nexus Biomedical Services logo"
            />
          </View>

          <View style={styles.introSection}>
            <Text style={styles.welcomeTitle}>Welcome back</Text>

            <Text style={styles.welcomeDescription}>
              Access your secure biomedical services workspace.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>

            <Text style={styles.cardSubtitle}>
              Enter your account credentials to continue.
            </Text>

            <Text style={styles.label}>Email address</Text>

            <View style={styles.inputContainer}>
              <Mail size={19} color={COLORS.muted} style={styles.inputIcon} />

              <TextInput
                style={styles.input}
                placeholder="name@company.com"
                placeholderTextColor="#9B93AB"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                editable={!loading}
              />
            </View>

            <Text style={styles.label}>Password</Text>

            <View style={styles.inputContainer}>
              <LockKeyhole
                size={19}
                color={COLORS.muted}
                style={styles.inputIcon}
              />

              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9B93AB"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                editable={!loading}
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? (
                  <EyeOff size={19} color={COLORS.muted} />
                ) : (
                  <Eye size={19} color={COLORS.muted} />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.forgotContainer}
              onPress={handleForgotPassword}
              disabled={loading || resetLoading}
            >
              <Text style={styles.forgotText}>
                {resetLoading ? "Processing..." : "Forgot password?"}
              </Text>
            </TouchableOpacity>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Sign In</Text>

                  <ArrowRight size={20} color={COLORS.white} />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.registerContainer}>
              <Text style={styles.registerQuestion}>New to Nexus?</Text>

              <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
                <Text style={styles.registerLink}>Create an account</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.securityContainer}>
            <ShieldCheck size={18} color={COLORS.secondary} />

            <Text style={styles.securityText}>
              Secure access for Nexus administrators, employees, vendors and
              healthcare clients.
            </Text>
          </View>

          <Text style={styles.footerText}>© Nexus Biomedical Services</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 30,
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },

  logoContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },

  logo: {
    width: "100%",
    height: 100,
  },

  introSection: {
    marginBottom: 20,
  },

  welcomeTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 8,
  },

  welcomeDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.muted,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },

  cardTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 6,
  },

  cardSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 24,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 9,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBFAFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    height: 54,
    marginBottom: 20,
  },

  inputIcon: {
    marginLeft: 15,
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.primary,
    paddingHorizontal: 12,
    height: "100%",
  },

  eyeButton: {
    padding: 13,
  },

  forgotContainer: {
    alignItems: "flex-end",
    marginTop: -5,
    marginBottom: 22,
  },

  forgotText: {
    fontSize: 13,
    color: COLORS.secondary,
    fontWeight: "700",
  },

  errorBox: {
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#F5B9B9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },

  errorText: {
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.danger,
  },

  successBox: {
    backgroundColor: "#EFFAF3",
    borderWidth: 1,
    borderColor: "#B7E2C6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },

  successText: {
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.success,
  },

  loginButton: {
    height: 54,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  disabledButton: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },

  registerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 24,
  },

  registerQuestion: {
    fontSize: 13,
    color: COLORS.muted,
  },

  registerLink: {
    fontSize: 13,
    color: COLORS.secondary,
    fontWeight: "800",
  },

  securityContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.surfaceLight,
    padding: 15,
    borderRadius: 12,
    marginTop: 22,
  },

  securityText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.muted,
  },

  footerText: {
    textAlign: "center",
    marginTop: 24,
    color: COLORS.muted,
    fontSize: 11,
  },
});
