import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet,
  Text, useWindowDimensions, View,
} from "react-native";
import { auth, db } from "../../config/firebase";
import type { ServiceRequest } from "../../types/serviceRequest";

const NAVY = "#1A0061";
const BLUE = "#3B00CC";
const MUTED = "#718096";
const BG = "#F5F7FD";

type TabName = "Details" | "Updates" | "Parts" | "Documents" | "History";
const tabs: TabName[] = ["Details", "Updates", "Parts", "Documents", "History"];
type IconName = React.ComponentProps<typeof Ionicons>["name"];

function value(input: unknown): string {
  return typeof input === "string" && input.trim() ? input.trim() : "Not provided";
}
function formatDate(input: unknown): string {
  if (!input) return "Not available";
  try {
    const raw = input as { toDate?: () => Date; seconds?: number };
    const date = typeof raw.toDate === "function" ? raw.toDate() :
      typeof raw.seconds === "number" ? new Date(raw.seconds * 1000) : null;
    return date && !isNaN(date.getTime()) ? date.toLocaleString() : "Not available";
  } catch { return "Not available"; }
}
function statusText(status: string): string {
  const labels: Record<string, string> = {
    pending_assignment: "Pending Assignment", assigned: "Assigned",
    in_progress: "In Progress", pending_parts: "Pending Parts",
    completed: "Completed", closed: "Closed", cancelled: "Cancelled",
  };
  return labels[status] || status.replace(/_/g, " ");
}
function InfoItem({ icon, label, content }: { icon: IconName; label: string; content: string }) {
  return (
    <View style={{ marginBottom: 16, minWidth: 0, width: "100%" }}>
      <Ionicons name={icon} color={BLUE} size={19} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.infoValue}>{content}</Text>
      </View>
    </View>
  );
}

export default function ClientRequestDetailsScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = typeof params.id === "string" ? params.id : "";
  const [activeTab, setActiveTab] = useState<TabName>("Details");
  const [record, setRecord] = useState<ServiceRequest | null>(null);
  const [creator, setCreator] = useState("Not available");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let stopRecord: (() => void) | undefined;
    let revision = 0;
    const stopAuth = onAuthStateChanged(auth, async (user: User | null) => {
      const current = ++revision;
      stopRecord?.();
      stopRecord = undefined;
      setRecord(null);
      setError("");
      setLoading(true);
      if (!user) {
        setError("Please sign in to view this request.");
        setLoading(false);
        return;
      }
      if (!requestId || requestId.includes("/")) {
        setError("Invalid request link. Open a request from your Service Requests list.");
        setLoading(false);
        return;
      }
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (!alive || current !== revision) return;
        const profile = profileSnap.data();
        const orgId = profile?.organizationId;
        if (!profileSnap.exists() || profile?.role !== "client" ||
            profile?.status !== "approved" || typeof orgId !== "string" || !orgId) {
          setError("Your client account is not approved or linked to an organisation.");
          setLoading(false);
          return;
        }
        const details = profile.details as Record<string, unknown> | undefined;
        const name = [details?.fullName, details?.contactName, profile.fullName,
          user.displayName, user.email].find((x) => typeof x === "string" && x.trim());
        setCreator(typeof name === "string" ? name : "Client");
        stopRecord = onSnapshot(doc(db, "serviceRequests", requestId), (snapshot) => {
          if (!alive || current !== revision) return;
          const data = snapshot.data();
          if (!snapshot.exists() || !data || data.organizationId !== orgId) {
            setRecord(null);
            setError("Request not found or access denied.");
          } else {
            setRecord({ ...data, id: snapshot.id } as ServiceRequest);
            setError("");
          }
          setLoading(false);
        }, (e) => {
          if (!alive || current !== revision) return;
          setRecord(null);
          setError(`Unable to load request: ${e.message}`);
          setLoading(false);
        });
      } catch (e) {
        if (!alive || current !== revision) return;
        setError(e instanceof Error ? e.message : "Unable to load your profile.");
        setLoading(false);
      }
    });
    return () => { alive = false; revision++; stopRecord?.(); stopAuth(); };
  }, [requestId]);

  const contact = record?.contact;
  const status = record ? statusText(String(record.status)) : "";
  const assigned = record?.assignedEngineerName || "Not assigned yet";
  const row = (label: string, content: unknown) => (
    <View style={styles.detailRow} key={label}><Text style={styles.label}>{label}</Text><Text style={styles.infoValue}>{value(content)}</Text></View>
  );
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, width >= 700 && styles.desktopContent]}>
    <View style={styles.header}><Pressable onPress={() => router.push("/client-requests" as any)}><Ionicons name="arrow-back" color={NAVY} size={26}/></Pressable><Image source={require("../../../assets/images/nexus-logo.jpg")} style={styles.logo} resizeMode="contain"/><View style={{width:26}}/></View>
    {loading ? <ActivityIndicator color={BLUE}/> : error ? <View style={styles.card}><Text style={styles.title}>Unable to load request</Text><Text>{error}</Text></View> : record ? <>
      <View style={styles.card}>
        <Text style={styles.overline}>SERVICE REQUEST</Text>
        <Text style={styles.title}>{value(record.requestNumber)}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{status}</Text></View>
        <Text style={styles.muted}>Submitted {formatDate(record.createdAt)}</Text>
        <Text style={styles.sectionTitle}>{value(record.issueType)}</Text>
        <Text style={styles.description}>{value(record.description)}</Text>
      </View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Request progress</Text>
        {(["Request submitted","Engineer assigned","Service in progress","Service completed"] as const).map((label,index)=>{
          const stage = ["pending_assignment","assigned","in_progress","completed","closed"].indexOf(String(record.status));
          const current = stage < 0 ? 0 : stage === 4 ? 3 : stage;
          return <View key={label} style={styles.progressLine}><Ionicons name={index<=current?"checkmark-circle":"ellipse-outline"} size={23} color={index<=current?BLUE:"#B6BDCE"}/><Text style={[styles.progressText,index<=current&&styles.progressActive]}>{label}</Text></View>;
        })}
        {row("Assigned engineer",assigned)}
        {row("Last updated",formatDate(record.updatedAt))}
      </View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Service details</Text>
        {row("Facility",record.facilityName)}{row("Priority",record.priority)}{row("Description",record.description)}{row("Additional notes",record.notes)}
        {row("Cost centre",(record as any).costCenter)}{row("Customer reference",(record as any).customerReference)}
      </View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Contact information</Text>
        {row("Contact name",contact?.name)}{row("Contact phone",contact?.phone)}{row("Contact email",contact?.email)}{row("Preferred contact",contact?.preferredMethod)}
      </View>
      {record.equipment ? <View style={styles.card}><Text style={styles.sectionTitle}>Equipment (legacy request)</Text>{row("Equipment",record.equipment.name)}{row("Model",record.equipment.model)}{row("Serial",record.equipment.serialNumber)}</View>:null}
      <View style={styles.card}><Text style={styles.sectionTitle}>Service report</Text><Text style={styles.muted}>A PDF report will appear here when the assigned team completes the service and publishes a report.</Text></View>
    </>:null}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F5F7FD"},content:{padding:16,paddingBottom:55},desktopContent:{maxWidth:900,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:18},logo:{width:170,height:58},
  card:{backgroundColor:"white",borderRadius:18,padding:22,marginBottom:16,borderWidth:1,borderColor:"#E6E9F3",gap:12},
  title:{fontSize:24,fontWeight:"800",color:NAVY},overline:{fontSize:11,color:MUTED,fontWeight:"800",letterSpacing:1},
  sectionTitle:{fontSize:18,fontWeight:"800",color:NAVY,marginBottom:5},description:{color:NAVY,fontSize:15,lineHeight:24},
  muted:{color:MUTED,fontSize:14,lineHeight:21},badge:{alignSelf:"flex-start",backgroundColor:"#EEE9FF",paddingVertical:8,paddingHorizontal:12,borderRadius:9},badgeText:{color:BLUE,fontWeight:"700"},
  detailRow:{paddingVertical:11,borderBottomWidth:1,borderBottomColor:"#EEF0F6",gap:5},label:{fontSize:13,color:MUTED},infoValue:{fontSize:15,color:NAVY,fontWeight:"600",lineHeight:23,flexShrink:1},
  progressLine:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:9},progressText:{fontSize:15,color:MUTED,flexShrink:1},progressActive:{color:NAVY,fontWeight:"700"},
});
