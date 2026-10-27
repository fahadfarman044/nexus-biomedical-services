import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";
import {onAuthStateChanged} from "firebase/auth";
import {collection, doc, getDoc, onSnapshot, query, where} from "firebase/firestore";
import React, {useEffect, useMemo, useState} from "react";
import {ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View} from "react-native";
import {auth, db} from "../../config/firebase";

const NAVY = "#1A0061";
const PURPLE = "#3B00CC";
const MUTED = "#718096";
const BG = "#F5F9FF";

type ServiceRecord = {
  id: string;
  requestNumber?: string;
  organizationId?: string;
  createdBy?: string;
  equipment?: {id?: string; name?: string; model?: string; location?: string};
  description?: string;
  issueType?: string;
  status?: string;
  assignedEngineerName?: string | null;
  createdAt?: {toDate?: () => Date; seconds?: number};
};

const filters = ["All", "Open", "In Progress", "Pending Parts", "Completed", "Closed"] as const;
type Filter = (typeof filters)[number];

function labelStatus(status?: string): string {
  const s = (status || "pending_assignment").toLowerCase();
  if (["pending_assignment", "open", "submitted", "pending", "new", "sent_to_engineer"].includes(s)) return "Open";
  if (["in_progress", "assigned", "working"].includes(s)) return "In Progress";
  if (["pending_parts", "awaiting_parts"].includes(s)) return "Pending Parts";
  if (s === "completed") return "Completed";
  if (s === "closed") return "Closed";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeValue(value: ServiceRecord["createdAt"]): number {
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

function statusColors(status: string) {
  if (status === "Completed") return {color: "#16834A", bg: "#DFF7E7"};
  if (status === "Closed") return {color: "#64748B", bg: "#EDF1F6"};
  if (status === "Pending Parts") return {color: "#9B6412", bg: "#FFF1D3"};
  if (status === "In Progress") return {color: "#0866F5", bg: "#E4F0FF"};
  return {color: "#8A51BD", bg: "#F2E9FF"};
}

export default function ClientRequestsScreen() {
  const {width} = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [requests, setRequests] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribeRequests: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeRequests?.();
      unsubscribeRequests = undefined;
      setRequests([]);
      setError("");
      setLoading(true);
      if (!user) {
        setError("Please sign in to view your service requests.");
        setLoading(false);
        return;
      }
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (!active || auth.currentUser?.uid !== user.uid) return;
        const profile = profileSnap.data();
        if (profile?.role !== "client" || profile?.status !== "approved") {
          setError("Your client account must be approved before viewing requests.");
          setLoading(false);
          return;
        }
        const orgId = profile.organizationId;
        if (typeof orgId !== "string" || !orgId) {
          setError("Your account is not linked to an organisation.");
          setLoading(false);
          return;
        }
        const orgSnap = await getDoc(doc(db, "organizations", orgId));
        if (!active || auth.currentUser?.uid !== user.uid) return;
        if (!orgSnap.exists() || orgSnap.data().status !== "approved") {
          setError("Your organisation is not approved.");
          setLoading(false);
          return;
        }
        unsubscribeRequests = onSnapshot(
          query(collection(db, "serviceRequests"), where("organizationId", "==", orgId)),
          (snapshot) => {
            if (!active || auth.currentUser?.uid !== user.uid) return;
            setRequests(snapshot.docs.map((item) => ({...item.data(), id: item.id} as ServiceRecord)));
            setError("");
            setLoading(false);
          },
          (err) => {
            if (!active) return;
            setRequests([]);
            setError(`Unable to load service requests: ${err.message}`);
            setLoading(false);
          },
        );
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load your account.");
        setLoading(false);
      }
    });
    return () => {active = false; unsubscribeRequests?.(); unsubscribeAuth();};
  }, []);

  const visibleRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((item) => {
      const status = labelStatus(item.status);
      const matchesStatus = filter === "All" || status === filter;
      const matchesSearch = !q || [item.requestNumber, item.id, item.equipment?.name, item.equipment?.id,
        item.equipment?.model, item.equipment?.location, item.description, item.assignedEngineerName]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    }).sort((a, b) => newestFirst ? timeValue(b.createdAt) - timeValue(a.createdAt) : timeValue(a.createdAt) - timeValue(b.createdAt));
  }, [requests, search, filter, newestFirst]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, width >= 700 && styles.desktopContent]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/client-service" as any)} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={25} color={NAVY}/>
          </Pressable>
          <Image source={require("../../../assets/images/nexus-logo.jpg")} style={styles.logo} resizeMode="contain"/>
          <Pressable style={styles.addButton} onPress={() => router.push("/client-create-request" as any)}>
            <Ionicons name="add" size={27} color="#FFFFFF"/>
          </Pressable>
        </View>
        <Text style={styles.title}>Service Requests</Text>
        <Text style={styles.subtitle}>View and track your organisation's real service requests.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterButton, filter === item && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={21} color={NAVY}/>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search request, equipment or location" placeholderTextColor="#94A3B8" style={styles.searchInput}/>
            {search.length > 0 && <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={19} color={MUTED}/></Pressable>}
          </View>
        </View>
        <View style={styles.resultHeader}>
          <Text style={styles.resultCount}>{loading ? "Loading requests..." : `${visibleRequests.length} service requests`}</Text>
          <Pressable onPress={() => setNewestFirst((v) => !v)}>
            <Text style={styles.sortText}>Sort by: {newestFirst ? "Newest" : "Oldest"} ↕</Text>
          </Pressable>
        </View>
        {loading && <ActivityIndicator color={PURPLE} size="large" style={{marginTop: 30}}/>}
        {!!error && !loading && <View style={styles.emptyState}><Ionicons name="alert-circle-outline" size={34} color="#D94150"/><Text style={styles.errorText}>{error}</Text></View>}
        {!loading && !error && visibleRequests.map((item) => {
          const status = labelStatus(item.status);
          const colors = statusColors(status);
          const created = timeValue(item.createdAt);
          return (
            <Pressable key={item.id} style={styles.requestCard} onPress={() => router.push({pathname: "/client-request-details" as any, params: {id: item.id}})}>
              <View style={styles.equipmentImage}><Ionicons name="medkit-outline" size={29} color={PURPLE}/></View>
              <View style={styles.requestInfo}>
                <Text style={styles.requestId}>{item.requestNumber || item.id}</Text>
                <Text style={styles.equipmentName}>{item.equipment?.name || item.issueType || "Service request"}{item.equipment?.id ? ` · ${item.equipment.id}` : ""}</Text>
                {!!item.equipment?.model && <Text style={styles.model}>{item.equipment.model}</Text>}
                {!!item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}
                <Text style={styles.metaText}>{created ? new Date(created).toLocaleDateString() : "Date pending"} · {item.assignedEngineerName || "Awaiting assignment"}</Text>
              </View>
              <View style={styles.rightColumn}>
                <View style={[styles.statusBadge, {backgroundColor: colors.bg}]}><Text style={{color: colors.color, fontSize: 11, fontWeight: "700"}}>{status}</Text></View>
                <Ionicons name="chevron-forward" size={18} color={MUTED}/>
              </View>
            </Pressable>
          );
        })}
        {!loading && !error && visibleRequests.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={42} color={PURPLE}/>
            <Text style={styles.emptyTitle}>{requests.length ? "No matching requests" : "No service requests yet"}</Text>
            <Text style={styles.emptyDescription}>{requests.length ? "Try a different filter or search." : "Your organisation has not submitted any service requests yet."}</Text>
            {!requests.length && <Pressable style={styles.createButton} onPress={() => router.push("/client-create-request" as any)}><Text style={styles.createText}>Create Service Request</Text></Pressable>}
          </View>
        )}
      </ScrollView>
      <View style={styles.bottomNav}>
        {([{label: "Home", icon: "home-outline", route: "/client-home"}, {label: "Service", icon: "clipboard", route: "/client-service"}, {label: "Requests", icon: "document-text", route: ""}] as const).map((nav) => (
          <Pressable key={nav.label} style={styles.navItem} onPress={() => nav.route && router.push(nav.route as any)}>
            <Ionicons name={nav.icon} size={23} color={nav.label === "Requests" ? PURPLE : MUTED}/>
            <Text style={[styles.navText, nav.label === "Requests" && {color: PURPLE}]}>{nav.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  content: {paddingHorizontal: 16, paddingTop: 20, paddingBottom: 35, width: "100%"},
  desktopContent: {maxWidth: 850, alignSelf: "center"},
  header: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 25},
  iconButton: {padding: 9}, logo: {width: 165, height: 55},
  addButton: {width: 44, height: 44, borderRadius: 12, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center"},
  title: {fontSize: 29, fontWeight: "800", color: NAVY}, subtitle: {fontSize: 14, color: MUTED, marginTop: 5, marginBottom: 22},
  filters: {gap: 9, paddingBottom: 15}, filterButton: {backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E4E8F0", paddingVertical: 9, paddingHorizontal: 15},
  filterActive: {backgroundColor: PURPLE, borderColor: PURPLE}, filterText: {fontSize: 12, fontWeight: "600", color: NAVY}, filterTextActive: {color: "#FFFFFF"},
  searchRow: {marginBottom: 18}, searchBox: {height: 52, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5EAF1", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10},
  searchInput: {flex: 1, minWidth: 0, color: NAVY, fontSize: 13},
  resultHeader: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14},
  resultCount: {fontWeight: "700", color: NAVY}, sortText: {fontSize: 12, color: PURPLE},
  requestCard: {backgroundColor: "#FFFFFF", borderRadius: 14, padding: 13, flexDirection: "row", gap: 12, marginBottom: 11, alignItems: "center"},
  equipmentImage: {width: 58, height: 58, backgroundColor: "#F0ECFF", borderRadius: 12, alignItems: "center", justifyContent: "center"},
  requestInfo: {flex: 1, gap: 4}, requestId: {fontSize: 14, color: NAVY, fontWeight: "800"}, equipmentName: {fontSize: 12, color: NAVY, fontWeight: "600"},
  model: {fontSize: 12, color: MUTED}, description: {fontSize: 12, color: MUTED}, metaText: {fontSize: 11, color: MUTED, marginTop: 3},
  rightColumn: {alignItems: "flex-end", justifyContent: "space-between", alignSelf: "stretch", gap: 18},
  statusBadge: {borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6},
  emptyState: {backgroundColor: "#FFFFFF", borderRadius: 15, padding: 26, alignItems: "center", gap: 12, marginTop: 15},
  emptyTitle: {fontSize: 18, fontWeight: "800", color: NAVY, textAlign: "center"},
  emptyDescription: {fontSize: 13, color: MUTED, textAlign: "center"}, errorText: {fontSize: 13, color: "#D94150", textAlign: "center"},
  createButton: {backgroundColor: PURPLE, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 5}, createText: {color: "#FFFFFF", fontWeight: "700"},
  bottomNav: {backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E9EEF5", flexDirection: "row", paddingVertical: 12},
  navItem: {flex: 1, alignItems: "center", gap: 4}, navText: {fontSize: 11, color: MUTED},
});
