import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db, functions } from "../../config/firebase";

const C = {
  navy: "#1A0061",
  purple: "#3B00CC",
  accent: "#8600E1",
  background: "#F8F7FC",
  white: "#FFFFFF",
  border: "#E6DFF2",
  muted: "#756E8D",
  green: "#16804A",
  red: "#C83249",
  orange: "#B66A00",
};

type Status = "pending" | "approved" | "rejected";
type Role = "employee" | "vendor" | "client";
type StatusFilter = "all" | Status;
type RoleFilter = "all" | Role;
type Decision = "approved" | "rejected";

type Applicant = {
  id: string;
  email: string;
  role: string;
  status: Status;
  details: Record<string, unknown>;
  createdAt: unknown;
  rejectionReason?: string;
  organizationId?: string;
};

function field(item: Applicant, key: string): string {
  const value = item.details?.[key];

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function isPhone(value: string): boolean {
  return /^[+\d\s()-]+$/.test(value);
}

function applicantName(item: Applicant): string {
  const keys =
    item.role === "client"
      ? ["facilityName", "contactName", "fullName"]
      : item.role === "vendor"
        ? ["companyName", "contactName", "fullName"]
        : ["fullName", "contactName"];

  for (const key of keys) {
    const value = field(item, key);

    if (value && !isPhone(value)) {
      return value;
    }
  }

  return item.email || "Unnamed Applicant";
}

function secondaryName(item: Applicant): string {
  const contact = field(item, "contactName");

  if (contact && !isPhone(contact) && contact !== applicantName(item)) {
    return contact;
  }

  return item.email;
}

function getDate(value: unknown): string {
  if (!value) return "Date unavailable";

  try {
    let date: Date;

    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof value.toDate === "function"
    ) {
      date = value.toDate() as Date;
    } else if (typeof value === "string") {
      date = new Date(value);
    } else {
      return "Date unavailable";
    }

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Date unavailable";
  }
}

function readableLabel(key: string): string {
  const labels: Record<string, string> = {
    fullName: "Full Name",
    facilityName: "Healthcare Facility",
    companyName: "Company Name",
    contactName: "Contact Person",
    phone: "Phone Number",
    phoneNumber: "Phone Number",
    mobile: "Mobile Number",
    email: "Email Address",
    address: "Address",
    city: "City",
    country: "Country",
    department: "Department",
    designation: "Designation",
    jobTitle: "Job Title",
    licenseNumber: "Licence Number",
    registrationNumber: "Registration Number",
    organizationName: "Organisation Name",
  };

  if (labels[key]) return labels[key];

  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type EquipmentRecord = {
  id: string;
  organizationId: string;
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  department: string;
  status: string;
};

type EquipmentForm = {
  organizationId: string;
  name: string;
  model: string;
  serialNumber: string;
  location: string;
  department: string;
};

const emptyEquipmentForm: EquipmentForm = {
  organizationId: "", name: "", model: "", serialNumber: "", location: "", department: "",
};

function EquipmentManagement({applicants}: {applicants: Applicant[]}) {
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [form, setForm] = useState<EquipmentForm>(emptyEquipmentForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retireTarget, setRetireTarget] = useState<EquipmentRecord | null>(null);

  const hospitals = useMemo(() => {
    const byId = new Map<string, string>();
    applicants.filter((a) => a.role === "client" && a.status === "approved").forEach((a) => {
      // Use the actual organization ID assigned to an approved client, never the user UID.
      const id = a.organizationId || field(a, "organizationId");
      if (id) byId.set(id, field(a, "facilityName") || field(a, "organizationName") || a.email);
    });
    return Array.from(byId, ([id, name]) => ({id, name}));
  }, [applicants]);

  useEffect(() => {
    const stop = onSnapshot(collection(db, "equipment"), (snapshot) => {
      setRecords(snapshot.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id, organizationId: String(x.organizationId || ""),
          name: String(x.name || ""), model: String(x.model || ""),
          serialNumber: String(x.serialNumber || ""), location: String(x.location || ""),
          department: String(x.department || ""), status: String(x.status || "active"),
        };
      }));
      setError("");
    }, (err) => setError(err.message));
    return stop;
  }, []);

  const filtered = useMemo(() => records.filter((r) =>
    [r.id, r.name, r.model, r.serialNumber, r.department, r.location, r.organizationId,
      hospitals.find((h) => h.id === r.organizationId)?.name || ""]
      .join(" ").toLowerCase().includes(search.trim().toLowerCase())), [records, search, hospitals]);

  const change = (key: keyof EquipmentForm, value: string) =>
    setForm((old) => ({...old, [key]: value}));

  const save = async () => {
    if (busy) return;
    setError(""); setMessage("");
    if (!form.organizationId || !form.name.trim() || !form.serialNumber.trim()) {
      setError("Choose an approved hospital and enter equipment name and serial number.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        organizationId: form.organizationId,
        name: form.name.trim(), model: form.model.trim(),
        serialNumber: form.serialNumber.trim(), location: form.location.trim(),
        department: form.department.trim(),
      };
      if (editingId) {
        await httpsCallable(functions, "updateEquipment")({equipmentId: editingId, ...payload});
        setMessage("Equipment updated successfully.");
      } else {
        await httpsCallable(functions, "createEquipment")(payload);
        setMessage("Equipment added successfully.");
      }
      setForm(emptyEquipmentForm);
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message || "Unable to save equipment.");
    } finally { setBusy(false); }
  };

  const edit = (r: EquipmentRecord) => {
    setEditingId(r.id);
    setForm({organizationId: r.organizationId, name: r.name, model: r.model,
      serialNumber: r.serialNumber, location: r.location, department: r.department});
    setMessage(""); setError("");
  };

  const retire = async () => {
    if (!retireTarget || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await httpsCallable(functions, "retireEquipment")({equipmentId: retireTarget.id});
      setMessage("Equipment retired. Its history remains available.");
      if (editingId === retireTarget.id) {setEditingId(null); setForm(emptyEquipmentForm);}
      setRetireTarget(null);
    } catch (err: any) {setError(err?.message || "Unable to retire equipment.");}
    finally {setBusy(false);}
  };

  return (
    <View style={equipmentStyles.section}>
      <Text style={styles.heading}>Equipment Management</Text>
      <Text style={styles.subtitle}>Add, update and retire hospital biomedical equipment.</Text>
      <View style={equipmentStyles.panel}>
        <Text style={equipmentStyles.title}>{editingId ? "Edit Equipment" : "Add New Equipment"}</Text>
        <Text style={equipmentStyles.label}>Approved Hospital</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={equipmentStyles.hospitalRow}>
          {hospitals.map((h) => (
            <Pressable key={h.id} disabled={busy || !!editingId} onPress={() => change("organizationId", h.id)}
              style={[equipmentStyles.hospitalChip, form.organizationId === h.id && equipmentStyles.selectedChip]}>
              <Text style={[equipmentStyles.chipText, form.organizationId === h.id && equipmentStyles.selectedChipText]}>{h.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {hospitals.length === 0 && <Text style={equipmentStyles.hint}>No approved hospital organization IDs are available in registration details. An organization must be approved and linked before adding equipment.</Text>}
        {(["name", "model", "serialNumber", "location", "department"] as const).map((key) => (
          <View key={key} style={equipmentStyles.inputGroup}>
            <Text style={equipmentStyles.label}>{({name:"Equipment Name", model:"Model", serialNumber:"Serial Number", location:"Location", department:"Department"})[key]}</Text>
            <TextInput style={equipmentStyles.input} value={form[key]} onChangeText={(value) => change(key, value)} editable={!busy}
              placeholder={`Enter ${key === "serialNumber" ? "serial number" : key}`} placeholderTextColor="#928AA7" />
          </View>
        ))}
        <View style={equipmentStyles.actions}>
          <Pressable onPress={save} disabled={busy || hospitals.length === 0} style={[equipmentStyles.primary, (busy || hospitals.length === 0) && styles.disabled]}>
            <Text style={equipmentStyles.primaryText}>{busy ? "Saving..." : editingId ? "Save Changes" : "Add Equipment"}</Text>
          </Pressable>
          {editingId && <Pressable onPress={() => {setEditingId(null); setForm(emptyEquipmentForm);}} style={equipmentStyles.secondary}>
            <Text style={equipmentStyles.secondaryText}>Cancel Edit</Text>
          </Pressable>}
        </View>
      </View>
      {!!error && <Text style={equipmentStyles.error}>{error}</Text>}
      {!!message && <Text style={equipmentStyles.success}>{message}</Text>}
      <View style={equipmentStyles.panel}>
        <Text style={equipmentStyles.title}>Equipment Inventory ({records.length})</Text>
        <TextInput style={equipmentStyles.input} value={search} onChangeText={setSearch} placeholder="Search equipment, hospital, serial number..." placeholderTextColor="#928AA7" />
        {filtered.length === 0 && <Text style={equipmentStyles.hint}>No matching equipment records.</Text>}
        {filtered.map((r) => (
          <View key={r.id} style={equipmentStyles.record}>
            <View style={{flex: 1}}>
              <Text style={equipmentStyles.recordTitle}>{r.name} {r.status === "retired" ? "(Retired)" : ""}</Text>
              <Text style={equipmentStyles.hint}>{hospitals.find((h) => h.id === r.organizationId)?.name || r.organizationId}</Text>
              <Text style={equipmentStyles.hint}>ID: {r.id} | Serial: {r.serialNumber} | Model: {r.model}</Text>
              <Text style={equipmentStyles.hint}>{r.department} {r.location ? `• ${r.location}` : ""}</Text>
            </View>
            {r.status !== "retired" && <View style={equipmentStyles.actions}>
              <Pressable style={equipmentStyles.secondary} onPress={() => edit(r)}><Text style={equipmentStyles.secondaryText}>Edit</Text></Pressable>
              <Pressable style={equipmentStyles.retireButton} onPress={() => setRetireTarget(r)}><Text style={equipmentStyles.retireText}>Retire</Text></Pressable>
            </View>}
          </View>
        ))}
      </View>
      <Modal visible={!!retireTarget} transparent animationType="fade" onRequestClose={() => setRetireTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Retire equipment?</Text>
            <Text style={styles.subtitle}>{retireTarget?.name} will no longer be selectable for new service requests. Its history will be preserved.</Text>
            <View style={equipmentStyles.actions}>
              <Pressable style={equipmentStyles.secondary} disabled={busy} onPress={() => setRetireTarget(null)}><Text style={equipmentStyles.secondaryText}>Cancel</Text></Pressable>
              <Pressable style={equipmentStyles.retireButton} disabled={busy} onPress={retire}><Text style={equipmentStyles.retireText}>{busy ? "Retiring..." : "Confirm Retire"}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const equipmentStyles = StyleSheet.create({
  section: {marginTop: 24, marginBottom: 28},
  panel: {backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 17, padding: 18, marginTop: 18},
  title: {fontSize: 18, fontWeight: "800", color: C.navy, marginBottom: 12},
  label: {fontSize: 12, fontWeight: "700", color: C.navy, marginBottom: 6},
  hospitalRow: {gap: 8, paddingVertical: 8},
  hospitalChip: {borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10},
  selectedChip: {backgroundColor: C.purple, borderColor: C.purple},
  chipText: {color: C.navy, fontSize: 12, fontWeight: "700"},
  selectedChipText: {color: C.white},
  inputGroup: {marginTop: 12},
  input: {borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.navy, fontSize: 14, marginBottom: 5},
  actions: {flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center"},
  primary: {backgroundColor: C.purple, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 13},
  primaryText: {color: C.white, fontWeight: "800"},
  secondary: {backgroundColor: "#EEE8FF", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12},
  secondaryText: {color: C.purple, fontWeight: "700"},
  retireButton: {backgroundColor: "#FCE9ED", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12},
  retireText: {color: C.red, fontWeight: "700"},
  hint: {color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 5},
  record: {borderTopWidth: 1, borderColor: C.border, paddingVertical: 15, flexDirection: "row", flexWrap: "wrap", gap: 12},
  recordTitle: {color: C.navy, fontWeight: "800", fontSize: 15},
  error: {color: C.red, marginTop: 12},
  success: {color: C.green, marginTop: 12},
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value || "Not provided"}
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  tint,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  tint: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={23} color={color} />
      </View>

      <Text style={styles.summaryNumber}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const [selected, setSelected] = useState<Applicant | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    let stopUsers: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopUsers?.();
      stopUsers = undefined;

      if (!active) return;

      setLoading(true);
      setAuthorized(false);

      if (!user) {
        setLoading(false);
        router.replace("/(auth)/login");
        return;
      }

      try {
        await user.reload();
        const token = await user.getIdTokenResult(true);

        const isAdmin =
          user.emailVerified &&
          token.claims.admin === true &&
          token.claims.nexusRole === "nexus_admin" &&
          token.claims.email_verified === true;

        if (!isAdmin) {
          setError("Administrator access required.");
          setLoading(false);
          router.replace("/(auth)/login");
          return;
        }

        setAuthorized(true);

        const usersQuery = query(
          collection(db, "users"),
          orderBy("createdAt", "desc"),
        );

        stopUsers = onSnapshot(
          usersQuery,
          (snapshot) => {
            if (!active) return;

            const records: Applicant[] = snapshot.docs.map((document) => {
              const data = document.data();

              return {
                id: document.id,
                email: typeof data.email === "string" ? data.email : "",
                role: typeof data.role === "string" ? data.role : "",
                status:
                  data.status === "approved" || data.status === "rejected"
                    ? data.status
                    : "pending",
                details:
                  data.details &&
                  typeof data.details === "object" &&
                  !Array.isArray(data.details)
                    ? data.details
                    : {},
                createdAt: data.createdAt,
                organizationId: typeof data.organizationId === "string" ? data.organizationId : undefined,
                rejectionReason:
                  typeof data.rejectionReason === "string"
                    ? data.rejectionReason
                    : undefined,
              };
            });

            setApplicants(records);
            setError("");
            setLoading(false);
          },
          (err) => {
            if (!active) return;
            setError(err.message);
            setLoading(false);
          },
        );
      } catch (err: any) {
        if (!active) return;

        setError(err?.message || "Unable to load applications.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
      stopAuth();
      stopUsers?.();
    };
  }, [router]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return applicants.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (roleFilter !== "all" && item.role !== roleFilter) {
        return false;
      }

      if (!term) return true;

      const searchable = [
        applicantName(item),
        secondaryName(item),
        item.email,
        item.role,
        ...Object.values(item.details || {}).filter(
          (value): value is string => typeof value === "string",
        ),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [applicants, search, statusFilter, roleFilter]);

  const pending = applicants.filter((item) => item.status === "pending").length;

  const approved = applicants.filter(
    (item) => item.status === "approved",
  ).length;

  const rejected = applicants.filter(
    (item) => item.status === "rejected",
  ).length;

  const openDecision = (nextDecision: Decision) => {
    if (!selected || selected.status !== "pending") return;

    setFeedback("");
    setRejectionReason("");
    setDecision(nextDecision);
  };

  const submitDecision = async () => {
    if (!selected || !decision || busy) return;

    const reason = rejectionReason.trim();

    if (decision === "rejected" && reason.length < 10) {
      setFeedback(
        "Please enter a clear rejection reason of at least 10 characters.",
      );
      return;
    }

    setBusy(true);
    setFeedback("");

    try {
      const reviewUser = httpsCallable<
        {
          userId: string;
          decision: Decision;
          rejectionReason?: string;
        },
        {
          success: boolean;
          status: Status;
        }
      >(functions, "reviewUser");

      const result = await reviewUser({
        userId: selected.id,
        decision,
        ...(decision === "rejected" ? { rejectionReason: reason } : {}),
      });

      if (!result.data.success) {
        throw new Error("The review was not confirmed.");
      }

      setDecision(null);
      setSelected(null);
      setRejectionReason("");
      setFeedback("");

      // The Firestore listener updates the list automatically.
    } catch (err: any) {
      console.error("Nexus review failed:", err);

      const code = err?.code || "";
      const message = err?.message || "Review failed.";

      setFeedback(
        code.includes("internal")
          ? "The Firebase review function failed. Check the Functions emulator logs for the underlying error."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (err: any) {
      setError(err?.message || "Unable to sign out.");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.purple} />
        <Text style={styles.loadingText}>Loading Nexus Administration...</Text>
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error || "Administrator access denied."}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.logoFrame}>
              <Image
                source={require("../../../assets/images/nexus-logo.jpg")}
                resizeMode="contain"
                style={styles.logo}
              />
            </View>

            <Pressable style={styles.logout} onPress={logout}>
              <Ionicons name="log-out-outline" size={19} color={C.white} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>NEXUS ADMINISTRATION</Text>
          <Text style={styles.heroTitle}>Admin Dashboard</Text>
          <Text style={styles.heroDescription}>
            Registration management, account verification and access approvals.
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.heading}>Registration Overview</Text>
            <Text style={styles.subtitle}>
              Review application information before making a decision.
            </Text>
          </View>

          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live Records</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Total Applications"
            value={applicants.length}
            icon="people-outline"
            color={C.purple}
            tint="#EEE8FF"
          />
          <SummaryCard
            label="Pending Review"
            value={pending}
            icon="time-outline"
            color={C.orange}
            tint="#FFF1DE"
          />
          <SummaryCard
            label="Approved"
            value={approved}
            icon="checkmark-circle-outline"
            color={C.green}
            tint="#E6F6ED"
          />
          <SummaryCard
            label="Rejected"
            value={rejected}
            icon="close-circle-outline"
            color={C.red}
            tint="#FCE9ED"
          />
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.heading}>Applications</Text>
            <Text style={styles.subtitle}>
              Employee, vendor and client registrations
            </Text>
          </View>

          <Text style={styles.resultCount}>{filtered.length} results</Text>
        </View>

        <View style={styles.filterPanel}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={21} color={C.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, email, organisation..."
              placeholderTextColor="#9B94AE"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                ["all", "All"],
                ["pending", "Pending"],
                ["approved", "Approved"],
                ["rejected", "Rejected"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={[
                  styles.filterButton,
                  statusFilter === value && styles.filterButtonActive,
                ]}
                onPress={() => setStatusFilter(value)}
              >
                <Text
                  style={[
                    styles.filterText,
                    statusFilter === value && styles.filterTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                ["all", "All Roles"],
                ["employee", "Employees"],
                ["vendor", "Vendors"],
                ["client", "Clients"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={[
                  styles.roleButton,
                  roleFilter === value && styles.roleButtonActive,
                ]}
                onPress={() => setRoleFilter(value)}
              >
                <Text
                  style={[
                    styles.roleText,
                    roleFilter === value && styles.roleTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="folder-open-outline" size={35} color={C.muted} />
            <Text style={styles.emptyTitle}>No matching applications</Text>
            <Text style={styles.subtitle}>Try another search or filter.</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const name = applicantName(item);

            return (
              <View key={item.id} style={styles.applicantCard}>
                <View style={styles.applicantTop}>
                  <View style={styles.applicantIdentity}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.applicantText}>
                      <Text style={styles.applicantName}>{name}</Text>
                      <Text style={styles.applicantEmail}>{item.email}</Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          item.status === "approved"
                            ? "#E6F6ED"
                            : item.status === "rejected"
                              ? "#FCE9ED"
                              : "#FFF1DE",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            item.status === "approved"
                              ? C.green
                              : item.status === "rejected"
                                ? C.red
                                : C.orange,
                        },
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.applicantMeta}>
                  <Ionicons
                    name="briefcase-outline"
                    size={17}
                    color={C.purple}
                  />
                  <Text style={styles.metaText}>
                    {readableLabel(item.role)}
                  </Text>

                  <Ionicons
                    name="calendar-outline"
                    size={17}
                    color={C.purple}
                  />
                  <Text style={styles.metaText}>{getDate(item.createdAt)}</Text>
                </View>

                {secondaryName(item) !== item.email ? (
                  <Text style={styles.contactLine}>
                    Contact: {secondaryName(item)}
                  </Text>
                ) : null}

                <View style={styles.cardDivider} />

                <Pressable
                  style={styles.viewButton}
                  onPress={() => {
                    setSelected(item);
                    setFeedback("");
                  }}
                >
                  <Ionicons name="eye-outline" size={20} color={C.purple} />
                  <Text style={styles.viewButtonText}>
                    View Full Application
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        <EquipmentManagement applicants={applicants} />

        <Text style={styles.footer}>
          Nexus Biomedical Services | Secure Administration
        </Text>
      </ScrollView>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) {
            setSelected(null);
            setDecision(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: decision ? 520 : 760 }]}>
            {selected && !decision ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeadingText}>
                    <Text style={styles.modalTitle}>Application Details</Text>
                    <Text style={styles.subtitle}>
                      Review the applicant's submitted information.
                    </Text>
                  </View>

                  <Pressable
                    style={styles.closeButton}
                    onPress={() => setSelected(null)}
                  >
                    <Ionicons name="close" size={23} color={C.navy} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.identityPanel}>
                    <Text style={styles.identityName}>
                      {applicantName(selected)}
                    </Text>
                    <Text style={styles.identityEmail}>{selected.email}</Text>
                    <Text style={styles.identityRole}>
                      {readableLabel(selected.role)} Registration
                    </Text>
                  </View>

                  <Text style={styles.detailsHeading}>
                    Registration Information
                  </Text>

                  <DetailRow
                    label="Application Status"
                    value={selected.status.toUpperCase()}
                  />
                  <DetailRow
                    label="Submitted"
                    value={getDate(selected.createdAt)}
                  />
                  <DetailRow label="Email Address" value={selected.email} />

                  {Object.entries(selected.details)
                    .filter(
                      ([key, value]) =>
                        key !== "email" &&
                        value !== null &&
                        value !== undefined &&
                        typeof value !== "object",
                    )
                    .map(([key, value]) => (
                      <DetailRow
                        key={key}
                        label={readableLabel(key)}
                        value={String(value)}
                      />
                    ))}

                  {selected.rejectionReason ? (
                    <View style={styles.reasonPanel}>
                      <Text style={styles.reasonHeading}>Rejection Reason</Text>
                      <Text style={styles.reasonBody}>
                        {selected.rejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.recordNote}>
                    Application ID: {selected.id}
                  </Text>
                </ScrollView>

                {selected.status === "pending" ? (
                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.rejectButton}
                      onPress={() => openDecision("rejected")}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={19}
                        color={C.red}
                      />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </Pressable>

                    <Pressable
                      style={styles.approveButton}
                      onPress={() => openDecision("approved")}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={19}
                        color={C.white}
                      />
                      <Text style={styles.approveButtonText}>
                        Approve Registration
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : selected && decision ? (
              <>
                <View
                  style={[
                    styles.decisionIcon,
                    {
                      backgroundColor:
                        decision === "rejected" ? "#FCE9ED" : "#E6F6ED",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      decision === "rejected"
                        ? "alert-circle-outline"
                        : "checkmark-circle-outline"
                    }
                    size={39}
                    color={decision === "rejected" ? C.red : C.green}
                  />
                </View>

                <Text style={styles.decisionTitle}>
                  {decision === "rejected"
                    ? "Reject Registration?"
                    : "Approve Registration?"}
                </Text>

                <Text style={styles.decisionDescription}>
                  {decision === "rejected"
                    ? `Please explain why ${applicantName(selected)} is being rejected.`
                    : `Confirm approval for ${applicantName(selected)}.`}
                </Text>

                {decision === "rejected" ? (
                  <View style={styles.reasonInputArea}>
                    <Text style={styles.inputLabel}>
                      Rejection Reason (Required)
                    </Text>

                    <TextInput
                      style={styles.reasonInput}
                      multiline
                      numberOfLines={5}
                      maxLength={1000}
                      textAlignVertical="top"
                      placeholder="Explain the reason for rejecting this application..."
                      placeholderTextColor="#9B94AE"
                      value={rejectionReason}
                      onChangeText={setRejectionReason}
                      editable={!busy}
                    />

                    <Text style={styles.reasonHint}>
                      At least 10 characters. This reason will be included in
                      the applicant's email after the backend notification is
                      updated.
                    </Text>
                  </View>
                ) : null}

                {feedback ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{feedback}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    disabled={busy}
                    style={styles.cancelButton}
                    onPress={() => {
                      setDecision(null);
                      setFeedback("");
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    disabled={
                      busy ||
                      (decision === "rejected" &&
                        rejectionReason.trim().length < 10)
                    }
                    style={[
                      styles.confirmButton,
                      {
                        backgroundColor:
                          decision === "rejected" ? C.red : C.purple,
                      },
                      busy && styles.disabled,
                    ]}
                    onPress={submitDecision}
                  >
                    {busy ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <Text style={styles.confirmText}>
                        {decision === "rejected"
                          ? "Confirm Rejection"
                          : "Confirm Approval"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.background,
  },
  page: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 50,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
    padding: 24,
  },
  loadingText: {
    marginTop: 15,
    color: C.muted,
  },
  hero: {
    backgroundColor: C.navy,
    borderRadius: 22,
    padding: 26,
    marginBottom: 30,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  logoFrame: {
    backgroundColor: C.white,
    padding: 7,
    borderRadius: 12,
  },
  logo: {
    width: 170,
    height: 45,
  },
  logout: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoutText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 13,
  },
  eyebrow: {
    color: "#C6B7FF",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 13,
  },
  heroTitle: {
    color: C.white,
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 8,
  },
  heroDescription: {
    color: "#E4DDF9",
    fontSize: 14,
    lineHeight: 22,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  heading: {
    fontSize: 23,
    fontWeight: "900",
    color: C.navy,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
  },
  livePill: {
    backgroundColor: "#E5F7EC",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.green,
  },
  liveText: {
    color: C.green,
    fontWeight: "800",
    fontSize: 11,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 35,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 140,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 17,
    padding: 20,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  summaryNumber: {
    fontSize: 29,
    fontWeight: "900",
    color: C.navy,
  },
  summaryLabel: {
    color: C.muted,
    fontSize: 12,
    marginTop: 8,
  },
  resultCount: {
    color: C.purple,
    fontSize: 13,
    fontWeight: "800",
  },
  filterPanel: {
    backgroundColor: C.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 18,
  },
  searchBox: {
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: C.navy,
    fontSize: 14,
    minWidth: 0,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 8,
  },
  filterButton: {
    backgroundColor: "#F3F1F8",
    borderRadius: 10,
    paddingHorizontal: 17,
    paddingVertical: 11,
  },
  filterButtonActive: {
    backgroundColor: C.purple,
  },
  filterText: {
    color: C.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  filterTextActive: {
    color: C.white,
  },
  roleButton: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  roleButtonActive: {
    borderColor: C.purple,
    backgroundColor: "#EEE8FF",
  },
  roleText: {
    color: C.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  roleTextActive: {
    color: C.purple,
  },
  applicantCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 17,
    padding: 20,
    marginBottom: 14,
  },
  applicantTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  applicantIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 180,
  },
  avatar: {
    width: 55,
    height: 55,
    backgroundColor: "#EEE8FF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: C.purple,
    fontSize: 21,
    fontWeight: "900",
  },
  applicantText: {
    flex: 1,
  },
  applicantName: {
    color: C.navy,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 5,
  },
  applicantEmail: {
    color: C.muted,
    fontSize: 12,
  },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  applicantMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 17,
  },
  metaText: {
    color: C.muted,
    fontSize: 12,
    marginRight: 12,
  },
  contactLine: {
    color: C.muted,
    fontSize: 12,
    marginTop: 12,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#EFEAF6",
    marginVertical: 16,
  },
  viewButton: {
    backgroundColor: "#F0EBFF",
    borderRadius: 11,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  viewButtonText: {
    color: C.purple,
    fontSize: 13,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 15,
    padding: 35,
    alignItems: "center",
    gap: 9,
  },
  emptyTitle: {
    color: C.navy,
    fontSize: 16,
    fontWeight: "800",
  },
  footer: {
    textAlign: "center",
    color: C.muted,
    fontSize: 11,
    marginTop: 30,
  },
  errorBox: {
    backgroundColor: "#FFF0F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F3C6CE",
    padding: 13,
    marginVertical: 10,
  },
  errorText: {
    color: C.red,
    fontSize: 12,
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(16,8,44,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 22,
    width: "100%",
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 18,
  },
  modalHeadingText: {
    flex: 1,
  },
  modalTitle: {
    color: C.navy,
    fontSize: 23,
    fontWeight: "900",
    marginBottom: 6,
  },
  closeButton: {
    padding: 5,
  },
  modalScroll: {
    flexGrow: 0,
  },
  identityPanel: {
    backgroundColor: "#F2EDFF",
    borderRadius: 13,
    padding: 18,
    marginBottom: 20,
  },
  identityName: {
    color: C.navy,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  identityEmail: {
    color: C.muted,
    fontSize: 12,
    marginBottom: 9,
  },
  identityRole: {
    color: C.purple,
    fontSize: 12,
    fontWeight: "800",
  },
  detailsHeading: {
    color: C.navy,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  detailRow: {
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEAF6",
    gap: 5,
  },
  detailLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  detailValue: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "700",
  },
  recordNote: {
    color: C.muted,
    fontSize: 10,
    marginTop: 17,
    marginBottom: 15,
  },
  reasonPanel: {
    backgroundColor: "#FFF1F2",
    padding: 14,
    borderRadius: 12,
    marginTop: 15,
  },
  reasonHeading: {
    color: C.red,
    fontWeight: "800",
    marginBottom: 8,
  },
  reasonBody: {
    color: C.navy,
    fontSize: 13,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 11,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  rejectButtonText: {
    color: C.red,
    fontWeight: "800",
    fontSize: 12,
  },
  approveButton: {
    flex: 1.5,
    backgroundColor: C.purple,
    borderRadius: 11,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  approveButtonText: {
    color: C.white,
    fontWeight: "800",
    fontSize: 12,
  },
  decisionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  decisionTitle: {
    color: C.navy,
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  decisionDescription: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 18,
  },
  reasonInputArea: {
    marginTop: 5,
  },
  inputLabel: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 9,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 13,
    minHeight: 115,
    color: C.navy,
    fontSize: 13,
  },
  reasonHint: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F1EFF7",
    borderRadius: 11,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: C.navy,
    fontWeight: "800",
    fontSize: 12,
  },
  confirmButton: {
    flex: 1.3,
    borderRadius: 11,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    color: C.white,
    fontWeight: "800",
    fontSize: 12,
  },
  disabled: {
    opacity: 0.6,
  },
});
