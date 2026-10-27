import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { auth, db } from "../../config/firebase";

const NAVY = "#1A0061";
const PURPLE = "#3B00CC";
const MUTED = "#64748B";
const BORDER = "#E5E9F2";

// Match the Auth/Firestore emulator configuration used by this app.
const functions = getFunctions(undefined, "us-central1");
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
  const host =
    Platform.OS === "web"
      ? "127.0.0.1"
      : process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  try {
    connectFunctionsEmulator(functions, host, 5001);
  } catch (error) {
    // Expo hot reload may have already connected this Functions instance.
    if (!(error instanceof Error && /already|configured/i.test(error.message)))
      throw error;
  }
}

function otpError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/permission-denied":
        return "Incorrect OTP. Check the six-digit code and try again.";
      case "functions/deadline-exceeded":
        return "Your OTP has expired. Request a new code.";
      case "functions/resource-exhausted":
        return "Too many attempts or a resend was requested too soon. Please wait before trying again.";
      case "functions/unauthenticated":
        return "Your session has expired. Sign in again and verify your email.";
      case "functions/not-found":
        return "Password reset service is not running. Restart the Functions emulator or deploy the functions.";
      case "functions/unavailable":
        return "Password reset service is unavailable. Check the Functions emulator and email configuration.";
      case "functions/invalid-argument":
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

type Profile = {
  status?: string;
  organizationId?: string;
  details?: Record<string, unknown>;
};

function firstText(...values: unknown[]): string {
  const found = values.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return typeof found === "string" ? found.trim() : "";
}

function getContactName(
  details: Record<string, unknown>,
  email: string,
): string {
  const name = firstText(
    details.contactName,
    details.fullName,
    details.clientName,
    details.name,
  );
  if (name && !/^[\d\s()+-]+$/.test(name) && !name.includes("@")) return name;
  return email.split("@")[0] || "Client";
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={19} color={PURPLE} />
      </View>
      <View style={styles.detailText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text selectable style={styles.fieldValue}>
          {value || "Not provided"}
        </Text>
      </View>
    </View>
  );
}

export default function ClientSettingsScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!otpStep) return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [otpStep, expiresAt]);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = undefined;
      setProfile(null);
      setEmail(user?.email || "");
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      stopProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          setProfile((snapshot.data() as Profile | undefined) || null);
          setLoading(false);
        },
        (error) => {
          setNotice({
            kind: "error",
            message: `Unable to load profile: ${error.message}`,
          });
          setLoading(false);
        },
      );
    });
    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  async function requestPasswordReset() {
    if (!email || resetting || signingOut) return;
    setNotice(null);
    setResetting(true);
    try {
      const fn = httpsCallable(functions, "requestClientPasswordOtp");
      await fn({});
      setOtp("");
      setOtpStep(true);
      setExpiresAt(Date.now() + 120000);
      setNotice({
        kind: "success",
        message: `A 6-digit code has been sent to ${email}. It expires in 120 seconds.`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: otpError(error) });
    } finally {
      setResetting(false);
    }
  }

  async function confirmOtpReset() {
    if (resetting) return;
    if (!/^\d{6}$/.test(otp)) {
      setNotice({ kind: "error", message: "Enter the six-digit code." });
      return;
    }
    if (secondsLeft <= 0) {
      setNotice({ kind: "error", message: "Code expired. Request a new one." });
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setNotice({
        kind: "error",
        message: "Password must be 12 to 128 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({
        kind: "error",
        message: "New password and confirmation do not match.",
      });
      return;
    }
    setResetting(true);
    setNotice(null);
    try {
      const fn = httpsCallable(functions, "confirmClientPasswordOtp");
      await fn({ code: otp, newPassword });
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setOtpStep(false);
      setNotice({
        kind: "success",
        message:
          "Password updated successfully. Please sign in again using your new password.",
      });
      await signOut(auth);
      router.replace("/login" as any);
    } catch (error) {
      setNotice({ kind: "error", message: otpError(error) });
    } finally {
      setResetting(false);
    }
  }

  async function logout() {
    if (signingOut || resetting) return;
    setSigningOut(true);
    setNotice(null);
    try {
      await signOut(auth);
      router.replace("/login" as any);
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to sign out.",
      });
    } finally {
      setSigningOut(false);
    }
  }

  const details = profile?.details || {};
  const name = getContactName(details, email);
  const facility =
    firstText(
      details.facilityName,
      details.hospitalName,
      details.organizationName,
    ) || "Organisation not provided";
  const phone = firstText(
    details.phone,
    details.contactPhone,
    details.phoneNumber,
  );
  const approved = profile?.status === "approved";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
    >
      <Pressable
        onPress={() => router.back()}
        style={styles.back}
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={19} color={NAVY} />
        <Text style={styles.backText}>Back to dashboard</Text>
      </Pressable>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroTop}>
          <Text style={styles.eyebrow}>
            NEXUS BIOMEDICAL SERVICES / CLIENT PORTAL
          </Text>
          <Ionicons name="shield-checkmark-outline" size={25} color="#C9C0FF" />
        </View>
        <Text style={styles.heroTitle}>Account & Profile</Text>
        <Text style={styles.heroSubtitle}>
          Manage your account information and security preferences.
        </Text>
      </View>

      {notice && (
        <View
          style={[
            styles.notice,
            notice.kind === "success"
              ? styles.successNotice
              : styles.errorNotice,
          ]}
        >
          <Ionicons
            name={
              notice.kind === "success"
                ? "checkmark-circle-outline"
                : "alert-circle-outline"
            }
            size={20}
            color={notice.kind === "success" ? "#08754C" : "#B42318"}
          />
          <Text
            style={[
              styles.noticeText,
              { color: notice.kind === "success" ? "#08754C" : "#B42318" },
            ]}
          >
            {notice.message}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={styles.muted}>Loading your profile...</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.overline}>PRIMARY CONTACT</Text>
                <Text style={styles.profileName}>{name}</Text>
                <Text style={styles.muted}>Client account</Text>
              </View>
              <View
                style={[styles.statusPill, !approved && styles.pendingPill]}
              >
                <Ionicons
                  name={approved ? "checkmark-circle" : "time-outline"}
                  size={15}
                  color={approved ? "#08754C" : "#9A6700"}
                />
                <Text
                  style={[styles.statusText, !approved && styles.pendingText]}
                >
                  {approved ? "Approved" : profile?.status || "Unknown"}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.columns, compact && styles.columnsCompact]}>
            <View style={styles.column}>
              <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Ionicons name="business-outline" size={21} color={PURPLE} />
                  <Text style={styles.sectionTitle}>Organisation</Text>
                </View>
                <View style={styles.rule} />
                <Text style={styles.fieldLabel}>REGISTERED FACILITY</Text>
                <Text style={styles.organisationName}>{facility}</Text>
                <Text style={styles.helper}>
                  Your account is associated with this organisation.
                </Text>
              </View>
            </View>
            <View style={styles.column}>
              <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Ionicons
                    name="person-circle-outline"
                    size={22}
                    color={PURPLE}
                  />
                  <Text style={styles.sectionTitle}>Contact Information</Text>
                </View>
                <View style={styles.rule} />
                <Detail
                  icon="mail-outline"
                  label="Registered email"
                  value={email}
                />
                <View style={styles.rule} />
                <Detail
                  icon="call-outline"
                  label="Contact number"
                  value={phone}
                />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <Ionicons name="lock-closed-outline" size={21} color={PURPLE} />
              <Text style={styles.sectionTitle}>Security & Password</Text>
            </View>
            <View style={styles.rule} />
            <View
              style={[styles.actionRow, compact && styles.actionRowCompact]}
            >
              <View style={styles.actionDescription}>
                <Text style={styles.actionTitle}>Reset your password</Text>
                <Text style={styles.helper}>
                  Receive a six-digit email verification code, valid for 120
                  seconds.
                </Text>
              </View>
              <Pressable
                onPress={requestPasswordReset}
                disabled={resetting || signingOut || !email}
                style={[
                  styles.resetButton,
                  (resetting || !email) && styles.disabled,
                ]}
                accessibilityRole="button"
              >
                {resetting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons name="key-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.resetButtonText}>
                  {resetting
                    ? "Sending..."
                    : otpStep
                      ? "Resend OTP"
                      : "Send OTP"}
                </Text>
              </Pressable>
            </View>
            {otpStep && (
              <View style={{ marginTop: 18, gap: 12 }}>
                <Text style={{ color: NAVY, fontWeight: "700" }}>
                  Verification code · {secondsLeft}s remaining
                </Text>
                <TextInput
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  style={otpStyles.input}
                />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="New password (minimum 12 characters)"
                  style={otpStyles.input}
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholder="Confirm new password"
                  style={otpStyles.input}
                />
                <Pressable
                  onPress={confirmOtpReset}
                  disabled={resetting || secondsLeft === 0}
                  style={[
                    styles.resetButton,
                    (resetting || secondsLeft === 0) && styles.disabled,
                  ]}
                >
                  <Text style={styles.resetButtonText}>
                    {resetting
                      ? "Verifying..."
                      : "Verify OTP & Change Password"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View
              style={[styles.actionRow, compact && styles.actionRowCompact]}
            >
              <View style={styles.actionDescription}>
                <Text style={styles.actionTitle}>Sign out of Nexus</Text>
                <Text style={styles.helper}>
                  Securely end your current session on this device.
                </Text>
              </View>
              <Pressable
                onPress={logout}
                disabled={signingOut || resetting}
                style={[styles.signOutButton, signingOut && styles.disabled]}
                accessibilityRole="button"
              >
                {signingOut ? (
                  <ActivityIndicator color="#B42318" size="small" />
                ) : (
                  <Ionicons name="log-out-outline" size={19} color="#B42318" />
                )}
                <Text style={styles.signOutText}>
                  {signingOut ? "Signing out..." : "Sign Out"}
                </Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.footer}>
            Nexus Biomedical Services · Secure Client Portal
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7FC" },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    padding: 30,
    paddingBottom: 64,
    gap: 18,
  },
  compactContent: { padding: 16, gap: 14 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  backText: { fontSize: 14, color: NAVY, fontWeight: "600" },
  hero: { backgroundColor: NAVY, borderRadius: 20, padding: 32, gap: 10 },
  heroCompact: { padding: 22 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    color: "#CEC5FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    flexShrink: 1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
  },
  heroSubtitle: { color: "#D9D2F5", fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 23,
    gap: 14,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: "#EEE9FF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 28, fontWeight: "800", color: PURPLE },
  profileText: { flex: 1, minWidth: 140, gap: 4 },
  overline: { fontSize: 10, color: MUTED, fontWeight: "800", letterSpacing: 1 },
  profileName: { fontSize: 21, color: NAVY, fontWeight: "800", flexShrink: 1 },
  muted: { fontSize: 13, color: MUTED },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E6F6ED",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingPill: { backgroundColor: "#FFF5D9" },
  statusText: {
    color: "#08754C",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "capitalize",
  },
  pendingText: { color: "#9A6700" },
  columns: { flexDirection: "row", gap: 18, alignItems: "stretch" },
  columnsCompact: { flexDirection: "column", gap: 14 },
  column: { flex: 1, minWidth: 0 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 18, color: NAVY, fontWeight: "800", flexShrink: 1 },
  rule: { height: 1, backgroundColor: "#EDF0F6" },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.3,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: "600",
    color: NAVY,
    lineHeight: 21,
    flexShrink: 1,
  },
  organisationName: {
    color: NAVY,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "700",
  },
  helper: { color: MUTED, fontSize: 13, lineHeight: 20 },
  detail: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  detailIcon: {
    backgroundColor: "#F3F0FF",
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detailText: { flex: 1, minWidth: 0, gap: 5 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  actionRowCompact: { flexDirection: "column", alignItems: "stretch" },
  actionDescription: { flex: 1, minWidth: 0, gap: 5 },
  actionTitle: { color: NAVY, fontSize: 15, fontWeight: "700" },
  resetButton: {
    backgroundColor: PURPLE,
    paddingVertical: 13,
    paddingHorizontal: 19,
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  resetButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  signOutButton: {
    backgroundColor: "#FFF0F1",
    borderWidth: 1,
    borderColor: "#FFD5D9",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  successNotice: { backgroundColor: "#EDFCF3", borderColor: "#B7E7CB" },
  errorNotice: { backgroundColor: "#FFF1F0", borderColor: "#F7C5BF" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  loading: { padding: 50, alignItems: "center", gap: 12 },
  footer: { textAlign: "center", color: "#94A3B8", fontSize: 12, marginTop: 5 },
});

const otpStyles = StyleSheet.create({
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#1A0061",
    fontSize: 15,
  },
});
