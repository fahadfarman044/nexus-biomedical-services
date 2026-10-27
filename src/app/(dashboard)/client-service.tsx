import React from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, Pressable, StyleSheet } from "react-native";
export default function ClientServiceScreen() {
  return <View style={s.page}><Text style={s.title}>Service Requests</Text><Text style={s.sub}>Submit a request and follow its progress in one place.</Text><Pressable style={s.primary} onPress={() => router.push("/client-create-request" as any)}><Ionicons name="add-circle-outline" color="white" size={24}/><Text style={s.primaryText}>Create Service Request</Text></Pressable><Pressable style={s.secondary} onPress={() => router.push("/client-requests" as any)}><Ionicons name="time-outline" color="#3B00CC" size={24}/><Text style={s.secondaryText}>My Requests & History</Text><Ionicons name="chevron-forward" color="#3B00CC" size={20}/></Pressable></View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#F5F7FC",padding:24},title:{fontSize:30,fontWeight:"800",color:"#1A0061",marginBottom:8},sub:{color:"#718096",fontSize:15,marginBottom:28},primary:{backgroundColor:"#3B00CC",padding:20,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12,marginBottom:14},primaryText:{color:"white",fontWeight:"800",fontSize:16},secondary:{backgroundColor:"white",borderRadius:16,borderWidth:1,borderColor:"#E3E6F2",padding:20,flexDirection:"row",alignItems:"center",gap:12},secondaryText:{color:"#1A0061",fontWeight:"700",fontSize:16,flex:1}});
