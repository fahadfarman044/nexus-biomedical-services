import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";
import {onAuthStateChanged} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {useEffect, useMemo, useState} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {auth, db} from "../../config/firebase";

const NAVY = "#1A0061";
const BLUE = "#3B00CC";
const MUTED = "#718096";
const BG = "#F5F7FC";
type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Data = Record<string, any>;
type Item = {id: string; data: Data};
type Identity = {
  name: string;
  email: string;
  hospital: string;
  organizationId: string;
  approved: boolean;
};
const emptyIdentity: Identity = {
  name: "", email: "", hospital: "", organizationId: "", approved: false,
};

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function Icon({name, color = NAVY, size = 22}: {
  name: IconName; color?: string; size?: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function timestampMillis(value: any): number {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
}

function equipmentLabel(item: Item): string {
  const eq = item.data.equipment || item.data;
  return stringValue(eq.name, eq.equipmentName, eq.type, "Equipment");
}

function equipmentCode(item: Item): string {
  const eq = item.data.equipment || item.data;
  return stringValue(eq.id, eq.equipmentId, item.id);
}

function isOpen(status: unknown): boolean {
  const value = String(status || "").toLowerCase();
  return !["completed", "closed", "cancelled", "rejected"].includes(value);
}

export default function ClientHomeScreen() {
  const {width} = useWindowDimensions();
  const wide = width >= 700;
  const [search, setSearch] = useState("");
  const [identity, setIdentity] = useState<Identity>(emptyIdentity);
  const [requests, setRequests] = useState<Item[]>([]);


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    let stopOrg: (() => void) | undefined;
    let stopRequests: (() => void) | undefined;


    let active = true;
    let generation = 0;
    const stopData = () => {
      stopOrg?.(); stopOrg = undefined;
      stopRequests?.(); stopRequests = undefined;


    };
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const current = ++generation;
      stopProfile?.(); stopProfile = undefined;
      stopData();
      setRequests([]);
      setIdentity(emptyIdentity); setError("");
      setLoading(!!user);
      if (!user) return;
      stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
        if (!active || current !== generation) return;
        stopData();
        setRequests([]);
        if (!snapshot.exists()) {
          setError("Your Nexus profile was not found.");
          setLoading(false);
          return;
        }
        const profile = snapshot.data();
        const details = profile.details || {};
        const orgId = stringValue(profile.organizationId);
        const approved = profile.role === "client" && profile.status === "approved";
        const base: Identity = {
          name: [
            details.contactName,
            details.fullName,
            details.clientName,
            details.name,
            profile.fullName,
            profile.name,
            user.displayName,
          ].find(
            (value) =>
              typeof value === "string" &&
              value.trim().length > 0 &&
              /[a-zA-Z]/.test(value) &&
              !/^\+?[\d\s\-()]+$/.test(value.trim())
          )?.trim() || "Client",
          email: user.email || "",
          hospital: stringValue(details.facilityName, details.hospitalName,
            details.organizationName, profile.facilityName, profile.hospitalName),
          organizationId: orgId,
          approved,
        };
        setIdentity(base);
        setLoading(false);
        if (!approved || !orgId) return;
        stopOrg = onSnapshot(doc(db, "organizations", orgId), (orgSnap) => {
          if (!active || current !== generation) return;
          const org = orgSnap.data();
          setIdentity((prev) => ({...prev, hospital: stringValue(org?.name, base.hospital)}));
        }, (err) => console.warn("Organization lookup:", err.message));
        const listen = (name: string, setter: (items: Item[]) => void) =>
          onSnapshot(query(collection(db, name), where("organizationId", "==", orgId)),
            (result) => {
              if (!active || current !== generation) return;
              setter(result.docs.map((record) => ({id: record.id, data: record.data()})));
            },
            (err) => {
              if (!active || current !== generation) return;
              setter([]);
              setError(`Unable to load ${name}: ${err.message}`);
            });
        stopRequests = listen("serviceRequests", setRequests);


      }, (err) => {
        if (!active || current !== generation) return;
        setError(`Unable to load your profile: ${err.message}`);
        setLoading(false);
      });
    });
    return () => {
      active = false;
      generation++;
      unsubscribeAuth();
      stopProfile?.();
      stopData();
    };
  }, []);

  const openRequests = useMemo(() => requests.filter((item) => isOpen(item.data.status)), [requests]);
  const completed = useMemo(() => requests.filter((r) => ["completed", "closed"].includes(String(r.data.status || "").toLowerCase())), [requests]);
  const active = useMemo(() => requests.filter((r) => ["assigned", "in_progress", "pending_assignment", "engineer_assigned"].includes(String(r.data.status || "").toLowerCase())), [requests]);
  const recent = useMemo(() => [...requests].sort((a,b) => timestampMillis(b.data.createdAt)-timestampMillis(a.data.createdAt)).slice(0,5), [requests]);
  const searchResults = useMemo(() => recent.filter((r) => `${r.data.requestNumber || r.id} ${equipmentLabel(r)} ${r.data.issueType || ""}`.toLowerCase().includes(search.toLowerCase().trim())), [recent, search]);
  const statusLabel = (v: unknown) => {
    const status = String(v || "submitted").toLowerCase();
    if (["completed", "closed"].includes(status)) return "Service completed";
    if (["in_progress", "in progress"].includes(status)) return "Service in progress";
    if (["assigned", "engineer_assigned"].includes(status)) return "Engineer assigned";
    if (["pending_assignment", "submitted", "open"].includes(status)) return "Request submitted";
    return status.replace(/_/g, " ");
  };
  const initials = identity.name.trim().split(/\s+/).slice(0, 2)
    .map((word) => word.charAt(0)).join("").toUpperCase() || "CL";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const stats = [
    {number: requests.length, label: "Total Requests", icon: "layers-outline" as IconName, tint: "#EEE9FF"},
    {number: openRequests.length, label: "Open Requests", icon: "time-outline" as IconName, tint: "#FFF3E6"},
    {number: active.length, label: "In Service Queue", icon: "construct-outline" as IconName, tint: "#E9F1FF"},
    {number: completed.length, label: "Completed", icon: "checkmark-done-outline" as IconName, tint: "#E7F8EF"},
  ];
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <ScrollView contentContainerStyle={[styles.content, wide && styles.desktopContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={require("../../../assets/images/nexus-logo.jpg")} style={styles.logo} resizeMode="contain" />
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/client-requests" as any)} style={styles.notificationButton}>
              <Icon name="notifications-outline" size={25} />
            </Pressable>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          </View>
        </View>
        <View style={styles.hero}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>{loading ? "Loading profile..." : identity.name || "Client"}</Text>
          <Text style={styles.hospital}>{identity.hospital || "Healthcare Organisation"}</Text>

        </View>
        {!loading && !identity.approved && <View style={styles.notice}><Text style={styles.noticeText}>Your client account is awaiting approval or organisation linking. Records will appear after approval.</Text></View>}
        {!!error && <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text></View>}
        <View style={styles.quickActions}>
          <Pressable style={[styles.quickCard, styles.primaryCard]} onPress={() => router.push("/client-create-request" as any)}>
            <Icon name="add-circle-outline" color="#FFFFFF" size={28} />
            <Text style={styles.primaryActionTitle}>New Service Request</Text>
            <Text style={styles.primaryActionSubtitle}>Submit a biomedical service issue</Text>
          </Pressable>
          <Pressable style={[styles.quickCard, styles.scanCard]} onPress={() => router.push("/client-requests" as any)}>
            <Icon name="documents-outline" color={BLUE} size={28} />
            <Text style={styles.actionTitle}>Request History</Text>
            <Text style={styles.actionSubtitle}>Track previous and active requests</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={BLUE} /> : <View style={styles.statsGrid}>
          {stats.map((item) => <View key={item.label} style={styles.statCard}>
            <View style={[styles.statIcon, {backgroundColor: item.tint}]}><Icon name={item.icon} color={BLUE} size={22} /></View>
            <Text style={styles.statNumber}>{item.number}</Text><Text style={styles.statLabel}>{item.label}</Text>
          </View>)}
        </View>}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Service Requests</Text>
          <Pressable onPress={() => router.push("/client-requests" as any)} style={{flexDirection:"row",alignItems:"center",gap:4}}>
            <Text style={styles.viewAll}>View all requests</Text><Icon name="arrow-forward" size={16} color={BLUE} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Icon name="search-outline" size={21} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search requests by ID, equipment or issue" placeholderTextColor="#8792A5" />
        </View>
        <View style={styles.listCard}>
          {searchResults.length === 0 ? <Text style={styles.emptyText}>{requests.length ? "No matching requests." : "No requests submitted yet. Create your first service request."}</Text> :
            searchResults.map((item) =>
              <Pressable key={item.id} style={styles.listRow} onPress={() => router.push({pathname:"/client-request-details" as any,params:{id:item.id}})}>
                <View style={styles.equipmentIcon}><Icon name="document-text-outline" color={BLUE} size={25} /></View>
                <View style={styles.rowContent}>
                  <Text style={styles.equipmentName}>{stringValue(item.data.requestNumber, item.id)}</Text>
                  <Text style={styles.secondaryText}>{equipmentLabel(item)}  •  {stringValue(item.data.issueType, "Service request")}</Text>
                  <Text style={[styles.secondaryText,{color:BLUE,fontWeight:"700"}]}>{statusLabel(item.data.status)}</Text>
                </View>
                <Icon name="chevron-forward" size={19} color={MUTED}/>
              </Pressable>)}
        </View>
      </ScrollView>
      <View style={styles.bottomNav}>
        {[
          {label: "Home", icon: "home" as IconName, route: "/client-home"},
          {label: "Service", icon: "clipboard-outline" as IconName, route: "/client-service"},
          
          {label: "Settings", icon: "settings-outline" as IconName, route: "/client-settings"},
        ].map((item) => <Pressable key={item.label} style={styles.navItem}
          onPress={() => router.push(item.route as any)}>
          <Icon name={item.icon} color={item.label === "Home" ? BLUE : "#52617B"} size={25} />
          <Text style={[styles.navText, item.label === "Home" && styles.navActive]}>{item.label}</Text>
        </Pressable>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  content: {paddingHorizontal: 16, paddingTop: 20, paddingBottom: 30, width: "100%"},
  desktopContent: {maxWidth: 780, alignSelf: "center"},
  header: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22},
  logo: {width: 168, height: 58},
  headerActions: {flexDirection: "row", alignItems: "center", gap: 15},
  notificationButton: {padding: 5},
  avatar: {width: 40, height: 40, borderRadius: 20, backgroundColor: NAVY, alignItems: "center", justifyContent: "center"},
  avatarText: {color: "#FFFFFF", fontWeight: "700"},
  hero: {marginBottom: 20},
  greeting: {color: MUTED, fontSize: 16},
  name: {color: NAVY, fontSize: 30, fontWeight: "800", marginTop: 3},
  hospital: {color: MUTED, fontSize: 15, marginTop: 4},
  searchBox: {backgroundColor: "#FFFFFF", borderRadius: 13, borderWidth: 1, borderColor: "#E6ECF4", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 56, gap: 9, marginBottom: 16},
  searchInput: {flex: 1, color: NAVY, fontSize: 13, minWidth: 0},
  searchScan: {padding: 4},
  quickActions: {flexDirection: "row", gap: 10, marginBottom: 18},
  quickCard: {flex: 1, minHeight: 116, borderRadius: 13, padding: 13, justifyContent: "center", gap: 6},
  primaryCard: {backgroundColor: BLUE},
  scanCard: {backgroundColor: "#EEE9FF"},
  primaryActionTitle: {color: "#FFFFFF", fontSize: 14, fontWeight: "700"},
  primaryActionSubtitle: {color: "#E2EDFF", fontSize: 11},
  actionTitle: {color: NAVY, fontSize: 14, fontWeight: "700"},
  actionSubtitle: {color: MUTED, fontSize: 11},
  statsGrid: {flexDirection: "row", gap: 7, marginBottom: 25},
  statCard: {flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, alignItems: "center", paddingVertical: 12, paddingHorizontal: 3, minWidth: 0},
  statIcon: {width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 8},
  statNumber: {fontSize: 22, color: NAVY, fontWeight: "800"},
  statLabel: {color: MUTED, fontSize: 10, textAlign: "center", marginTop: 4},
  sectionHeader: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11, marginTop: 4},
  sectionTitle: {color: NAVY, fontSize: 17, fontWeight: "800", flexShrink: 1},
  viewAll: {color: BLUE, fontSize: 13, fontWeight: "600"},
  listCard: {backgroundColor: "#FFFFFF", borderRadius: 14, paddingHorizontal: 12, marginBottom: 22},
  listRow: {flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EFF2F7"},
  equipmentIcon: {width: 56, height: 56, backgroundColor: "#EFF0FF", borderRadius: 11, alignItems: "center", justifyContent: "center"},
  rowContent: {flex: 1, gap: 4},
  equipmentName: {color: NAVY, fontSize: 13, fontWeight: "700"},
  secondaryText: {color: MUTED, fontSize: 12},
  issueText: {color: "#D94343", fontSize: 11, fontWeight: "600"},
  emptyText: {color: MUTED, fontSize: 13, paddingVertical: 22, textAlign: "center"},
  notice: {padding: 12, backgroundColor: "#FFF1E9", borderRadius: 10, marginBottom: 15},
  noticeText: {color: "#8F4300", fontSize: 12},
  bottomNav: {backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E9EEF5", flexDirection: "row", justifyContent: "space-around", paddingTop: 12, paddingBottom: 13},
  navItem: {alignItems: "center", justifyContent: "center", gap: 4, flex: 1},
  navText: {color: "#52617B", fontSize: 11},
  navActive: {color: BLUE, fontWeight: "700"},
});

