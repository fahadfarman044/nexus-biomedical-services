import * as DocumentPicker from "expo-document-picker";
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
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Eye,
  EyeOff,
  FileText,
  Hospital,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react-native";

import { registerNexusUser, type NexusRole } from "../../services/authService";
import { COLORS } from "../../theme/colors";

type FormData = Record<string, string>;
type Step = 1 | 2 | 3 | 4;

type Field = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
};

type SelectedDocument = {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
};

const ROLE_FIELDS: Record<NexusRole, Field[]> = {
  employee: [
    {
      key: "fullName",
      label: "Full Name",
      placeholder: "Enter your full name",
      required: true,
    },
    {
      key: "email",
      label: "Nexus Work Email",
      placeholder: "name@company.com",
      keyboardType: "email-address",
      required: true,
    },
    {
      key: "department",
      label: "Department",
      placeholder: "Biomedical Engineering",
      required: true,
    },
    {
      key: "jobTitle",
      label: "Job Title",
      placeholder: "Service Coordinator",
      required: true,
    },
    {
      key: "phone",
      label: "Phone Number",
      placeholder: "Enter your phone number",
      keyboardType: "phone-pad",
      required: true,
    },
  ],

  vendor: [
    {
      key: "companyName",
      label: "Registered Company Name",
      placeholder: "Company legal name",
      required: true,
    },
    {
      key: "contactName",
      label: "Primary Contact",
      placeholder: "Contact person's full name",
      required: true,
    },
    {
      key: "email",
      label: "Business Email",
      placeholder: "contact@company.com",
      keyboardType: "email-address",
      required: true,
    },
    {
      key: "phone",
      label: "Business Phone",
      placeholder: "Phone number",
      keyboardType: "phone-pad",
      required: true,
    },
    {
      key: "address",
      label: "Business Address",
      placeholder: "Full registered address",
      multiline: true,
      required: true,
    },
    {
      key: "taxId",
      label: "Tax ID / W-9 Reference",
      placeholder: "Tax reference",
    },
    {
      key: "serviceCategories",
      label: "Service Categories",
      placeholder: "Imaging, Calibration, Repairs...",
      required: true,
    },
    {
      key: "insurance",
      label: "Insurance / COI Reference",
      placeholder: "Insurance policy reference",
    },
  ],

  client: [
    {
      key: "facilityName",
      label: "Facility Name",
      placeholder: "Hospital, clinic or laboratory",
      required: true,
    },
    {
      key: "facilityType",
      label: "Facility Type",
      placeholder: "Hospital / Clinic / Laboratory",
      required: true,
    },
    {
      key: "contactName",
      label: "Primary Contact",
      placeholder: "Contact person's full name",
      required: true,
    },
    {
      key: "email",
      label: "Work Email",
      placeholder: "contact@facility.com",
      keyboardType: "email-address",
      required: true,
    },
    {
      key: "phone",
      label: "Contact Phone",
      placeholder: "Phone number",
      keyboardType: "phone-pad",
      required: true,
    },
    {
      key: "address",
      label: "Facility Address",
      placeholder: "Full facility address",
      multiline: true,
      required: true,
    },
    {
      key: "department",
      label: "Department",
      placeholder: "Clinical Engineering",
    },
    {
      key: "specialRequirements",
      label: "Special Requirements",
      placeholder: "Additional information",
      multiline: true,
    },
  ],
};

const ROLE_OPTIONS = [
  {
    value: "employee" as NexusRole,
    title: "Employee",
    subtitle: "Nexus internal staff",
    icon: UserRound,
  },
  {
    value: "vendor" as NexusRole,
    title: "Vendor",
    subtitle: "Service partner",
    icon: Building2,
  },
  {
    value: "client" as NexusRole,
    title: "Client",
    subtitle: "Healthcare facility",
    icon: Hospital,
  },
];

const STEP_LABELS = ["Account", "Details", "Documents", "Review"];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 5;

export default function RegisterScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<NexusRole>("employee");
  const [data, setData] = useState<FormData>({});
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const updateField = (key: string, value: string) => {
    setData((previous) => ({ ...previous, [key]: value }));
    setError("");
  };

  const selectRole = (newRole: NexusRole) => {
    if (newRole === role) return;

    setRole(newRole);
    setData({});
    setDocuments([]);
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const validateDetails = () => {
    for (const field of ROLE_FIELDS[role]) {
      if (field.required && !data[field.key]?.trim()) {
        setError(`${field.label} is required.`);
        return false;
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email?.trim() || "")) {
      setError("Enter a valid email address.");
      return false;
    }

    return true;
  };

  const validateSecurity = () => {
    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }

    return true;
  };

  const nextStep = () => {
    setError("");

    if (step === 2 && !validateDetails()) return;
    if (step === 3 && !validateSecurity()) return;

    if (step < 4) {
      setStep((step + 1) as Step);
    }
  };

  const previousStep = () => {
    setError("");

    if (step === 1) {
      router.replace("/(auth)/login");
      return;
    }

    setStep((step - 1) as Step);
  };

  const pickDocuments = async () => {
    if (documents.length >= MAX_DOCUMENTS) {
      setError("Maximum 5 documents are allowed.");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const newFiles: SelectedDocument[] = [];

      for (const asset of result.assets) {
        if (asset.size && asset.size > MAX_FILE_SIZE) {
          setError(`${asset.name} exceeds the 10 MB file limit.`);
          return;
        }

        newFiles.push({
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType,
          size: asset.size,
        });
      }

      setDocuments((previous) => {
        const combined = [...previous];

        for (const file of newFiles) {
          if (
            combined.length < MAX_DOCUMENTS &&
            !combined.some(
              (item) => item.name === file.name && item.size === file.size,
            )
          ) {
            combined.push(file);
          }
        }

        return combined;
      });

      setError("");
    } catch (err) {
      console.error("Document picker error:", err);
      setError("Unable to select documents.");
    }
  };

  const removeDocument = (uri: string) => {
    setDocuments((previous) => previous.filter((item) => item.uri !== uri));
  };

  const submitRegistration = async () => {
    if (loading) return;

    setError("");

    if (!validateDetails() || !validateSecurity()) return;

    setLoading(true);

    try {
      const details: Record<string, string> = {};

      for (const field of ROLE_FIELDS[role]) {
        details[field.key] = (data[field.key] || "").trim();
      }

      details.email = details.email.toLowerCase();

      // Never accept an Employee ID from the client.
      // A trusted backend must generate it separately.
      await registerNexusUser(role, details, password);

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Registration error:", err);

      let message = err?.message || "Registration failed. Please try again.";

      if (err?.code === "auth/email-already-in-use") {
        message = "This email is already registered.";
      } else if (
        err?.code === "permission-denied" ||
        err?.code === "firestore/permission-denied"
      ) {
        message = "Firestore access denied. Check your security rules.";
      }

      setError(message);

      if (Platform.OS !== "web") {
        Alert.alert("Registration Error", message);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: Field) => (
    <View key={field.key} style={styles.fieldGroup}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>

      <TextInput
        style={[styles.input, field.multiline && styles.multilineInput]}
        placeholder={field.placeholder}
        placeholderTextColor="#9C95AE"
        value={data[field.key] || ""}
        onChangeText={(value) => updateField(field.key, value)}
        keyboardType={field.keyboardType || "default"}
        autoCapitalize={field.key === "email" ? "none" : "sentences"}
        autoCorrect={false}
        multiline={field.multiline}
        textAlignVertical={field.multiline ? "top" : "center"}
        editable={!loading}
      />
    </View>
  );

  const formatSize = (size?: number) => {
    if (!size) return "Unknown size";
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.successScreen}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={46} color={COLORS.secondary} />
          </View>

          <Text style={styles.successTitle}>Registration Submitted</Text>

          <Text style={styles.successText}>
            Your Nexus account has been created. Please verify your email
            address and wait for administrator approval.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.primaryButtonText}>Back to Login</Text>
            <ArrowRight size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={previousStep}>
              <ArrowLeft size={21} color={COLORS.primary} />
            </TouchableOpacity>

            <Image
              source={require("../../../assets/images/nexus-logo.jpg")}
              style={styles.logo}
              resizeMode="contain"
            />

            <View style={{ width: 40 }} />
          </View>

          <Text style={styles.pageTitle}>Create your account</Text>

          <Text style={styles.pageSubtitle}>
            Secure access to Nexus Biomedical Services
          </Text>

          {/* Progress */}
          <View style={styles.progressContainer}>
            {STEP_LABELS.map((label, index) => {
              const number = index + 1;
              const active = number === step;
              const completed = number < step;

              return (
                <View key={label} style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressCircle,
                      (active || completed) && styles.progressCircleActive,
                    ]}
                  >
                    {completed ? (
                      <CheckCircle2 size={17} color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.progressNumber,
                          active && styles.progressNumberActive,
                        ]}
                      >
                        {number}
                      </Text>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.progressLabel,
                      active && styles.progressLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Step 1: Role */}
          {step === 1 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Select Account Type</Text>

              <Text style={styles.sectionDescription}>
                Choose the account that best describes your role.
              </Text>

              {ROLE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = role === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.roleCard,
                      selected && styles.roleCardSelected,
                    ]}
                    onPress={() => selectRole(option.value)}
                  >
                    <View style={styles.roleIcon}>
                      <Icon size={23} color={COLORS.secondary} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleTitle}>{option.title}</Text>

                      <Text style={styles.roleDescription}>
                        {option.subtitle}
                      </Text>
                    </View>

                    {selected ? (
                      <CheckCircle2 size={22} color={COLORS.secondary} />
                    ) : (
                      <ChevronRight size={20} color={COLORS.muted} />
                    )}
                  </TouchableOpacity>
                );
              })}

              <View style={styles.notice}>
                <ShieldCheck size={19} color={COLORS.secondary} />
                <Text style={styles.noticeText}>
                  All registrations require administrator approval.
                </Text>
              </View>
            </View>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {role === "employee"
                  ? "Employee Information"
                  : role === "vendor"
                    ? "Vendor Information"
                    : "Client Information"}
              </Text>

              <Text style={styles.sectionDescription}>
                Provide accurate information for verification.
              </Text>

              {role === "employee" && (
                <View style={styles.notice}>
                  <ShieldCheck size={19} color={COLORS.secondary} />
                  <Text style={styles.noticeText}>
                    Your Employee ID will be generated automatically by the
                    Nexus backend.
                  </Text>
                </View>
              )}

              {ROLE_FIELDS[role].map(renderField)}
            </View>
          )}

          {/* Step 3: Documents & Security */}
          {step === 3 && (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Supporting Documents</Text>

                <Text style={styles.sectionDescription}>
                  {role === "employee"
                    ? "Select identification, qualifications or employment documents."
                    : role === "vendor"
                      ? "Select business licences, insurance certificates or tax documents."
                      : "Select facility registration or authorization documents."}
                </Text>

                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={pickDocuments}
                >
                  <View style={styles.uploadIcon}>
                    <CloudUpload size={29} color={COLORS.secondary} />
                  </View>

                  <Text style={styles.uploadTitle}>
                    Choose Supporting Documents
                  </Text>

                  <Text style={styles.uploadDescription}>PDF, JPG or PNG</Text>

                  <Text style={styles.uploadDescription}>
                    Maximum 10 MB per file • Up to 5 files
                  </Text>

                  <View style={styles.uploadButton}>
                    <Text style={styles.uploadButtonText}>Browse Files</Text>
                  </View>
                </TouchableOpacity>

                {documents.length > 0 && (
                  <View style={styles.documentList}>
                    <Text style={styles.documentHeading}>
                      Selected Documents ({documents.length})
                    </Text>

                    {documents.map((file) => (
                      <View key={file.uri} style={styles.documentItem}>
                        <View style={styles.fileIcon}>
                          <FileText size={21} color={COLORS.secondary} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.fileName} numberOfLines={1}>
                            {file.name}
                          </Text>

                          <Text style={styles.fileSize}>
                            {formatSize(file.size)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => removeDocument(file.uri)}
                        >
                          <X size={19} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.documentNotice}>
                  Documents are selected locally for now. Secure Firebase
                  Storage upload will be connected in the next backend stage.
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.securityHeading}>
                  <LockKeyhole size={22} color={COLORS.secondary} />

                  <Text style={styles.sectionTitle}>Account Security</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>
                    Password <Text style={styles.required}>*</Text>
                  </Text>

                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Minimum 12 characters"
                      placeholderTextColor="#9C95AE"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff size={19} color={COLORS.muted} />
                      ) : (
                        <Eye size={19} color={COLORS.muted} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>
                    Confirm Password
                    <Text style={styles.required}> *</Text>
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter your password"
                    placeholderTextColor="#9C95AE"
                    secureTextEntry={!showPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            </>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <View style={styles.card}>
              <View style={styles.reviewHeader}>
                <CheckCircle2 size={27} color={COLORS.secondary} />
                <Text style={styles.sectionTitle}>Review Registration</Text>
              </View>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Account Type</Text>
                <Text style={styles.reviewValue}>{role.toUpperCase()}</Text>
              </View>

              {ROLE_FIELDS[role].map((field) => (
                <View key={field.key} style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{field.label}</Text>

                  <Text style={styles.reviewValue}>
                    {data[field.key] || "Not provided"}
                  </Text>
                </View>
              ))}

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Supporting Documents</Text>

                <Text style={styles.reviewValue}>
                  {documents.length} selected (not uploaded)
                </Text>
              </View>

              <View style={styles.notice}>
                <ShieldCheck size={19} color={COLORS.secondary} />

                <Text style={styles.noticeText}>
                  Your registration will remain pending until a Nexus
                  administrator approves it. Email verification is also
                  required.
                </Text>
              </View>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary Action */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && { opacity: 0.6 }]}
            disabled={loading}
            onPress={step === 4 ? submitRegistration : nextStep}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  {step === 4 ? "Submit Registration" : "Continue"}
                </Text>

                <ArrowRight size={19} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {step > 1 && (
            <TouchableOpacity
              style={styles.previousButton}
              onPress={previousStep}
            >
              <Text style={styles.previousButtonText}>Previous Step</Text>
            </TouchableOpacity>
          )}

          <View style={styles.footer}>
            <ShieldCheck size={16} color={COLORS.secondary} />

            <Text style={styles.footerText}>
              Nexus Biomedical Services • Secure Registration
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 35,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  backButton: {
    width: 40,
    height: 40,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: 175,
    height: 70,
  },

  pageTitle: {
    fontSize: 27,
    fontWeight: "900",
    color: COLORS.primary,
  },

  pageSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 6,
    marginBottom: 24,
  },

  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 27,
  },

  progressItem: {
    flex: 1,
    alignItems: "center",
  },

  progressCircle: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  progressCircleActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },

  progressNumber: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.muted,
  },

  progressNumberActive: {
    color: COLORS.white,
  },

  progressLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "600",
  },

  progressLabelActive: {
    color: COLORS.secondary,
    fontWeight: "800",
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 7,
  },

  sectionDescription: {
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.muted,
    marginBottom: 20,
  },

  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    marginBottom: 12,
  },

  roleCardSelected: {
    borderColor: COLORS.secondary,
    borderWidth: 2,
    backgroundColor: COLORS.surfaceLight,
  },

  roleIcon: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  roleTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.primary,
  },

  roleDescription: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },

  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.primary,
  },

  fieldGroup: {
    marginBottom: 18,
  },

  label: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 8,
  },

  required: {
    color: COLORS.accent,
  },

  input: {
    height: 52,
    backgroundColor: "#FBFAFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.primary,
  },

  multilineInput: {
    height: 95,
    paddingTop: 13,
  },

  uploadBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#B9A1ED",
    borderRadius: 15,
    padding: 23,
    alignItems: "center",
    backgroundColor: "#FCFAFF",
  },

  uploadIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },

  uploadTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.primary,
    textAlign: "center",
  },

  uploadDescription: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 7,
    textAlign: "center",
  },

  uploadButton: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 18,
  },

  uploadButtonText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "800",
  },

  documentList: {
    marginTop: 20,
  },

  documentHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 12,
  },

  documentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    marginBottom: 9,
  },

  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  fileName: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  fileSize: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
  },

  documentNotice: {
    fontSize: 11,
    lineHeight: 18,
    color: COLORS.muted,
    marginTop: 15,
  },

  securityHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 20,
  },

  passwordContainer: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBFAFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
  },

  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    height: "100%",
    color: COLORS.primary,
    fontSize: 14,
  },

  eyeButton: {
    padding: 13,
  },

  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
  },

  reviewRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  reviewLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 5,
  },

  reviewValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },

  errorBox: {
    padding: 13,
    backgroundColor: "#FFF1F1",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F5B9B9",
    marginBottom: 15,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 19,
  },

  primaryButton: {
    height: 55,
    borderRadius: 12,
    backgroundColor: COLORS.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },

  previousButton: {
    alignItems: "center",
    padding: 16,
  },

  previousButtonText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 25,
  },

  footerText: {
    color: COLORS.muted,
    fontSize: 11,
  },

  successScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 25,
  },

  successTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.primary,
    textAlign: "center",
  },

  successText: {
    fontSize: 14,
    lineHeight: 23,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 13,
    marginBottom: 30,
  },
});
