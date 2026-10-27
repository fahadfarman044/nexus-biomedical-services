import React, {useEffect, useState} from "react";
import {router} from "expo-router";
import {Ionicons} from "@expo/vector-icons";
import {auth, db, functions} from "../../config/firebase";
import {doc, getDoc} from "firebase/firestore";
import {httpsCallable} from "firebase/functions";
import * as ImagePicker from "expo-image-picker";
import {getStorage, ref, uploadBytes} from "firebase/storage";
import {ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions} from "react-native";

type Priority="Low"|"Medium"|"High"|"Urgent";
type Method="Phone"|"Email"|"App Notification";
const NAVY="#1A0061", BLUE="#3B00CC", MUTED="#718096";
const validPhone=(v:string)=>/^\+?[0-9]{7,15}$/.test(v.replace(/[\s()-]/g,""));
const validEmail=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export default function CreateServiceRequest(){
  const {width}=useWindowDimensions();
  const [step,setStep]=useState(0),[busy,setBusy]=useState(false);
  const [facility,setFacility]=useState(""),[contactName,setContactName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState("");
  const [issueType,setIssueType]=useState("Repair Required"),[priority,setPriority]=useState<Priority>("Medium"),[description,setDescription]=useState("");
  const [method,setMethod]=useState<Method>("Phone"),[costCenter,setCostCenter]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
  const [photos,setPhotos]=useState<ImagePicker.ImagePickerAsset[]>([]),[number,setNumber]=useState(""),[photoError,setPhotoError]=useState("");
  useEffect(()=>{let active=true; (async()=>{const user=auth.currentUser;if(!user)return;try{const p=(await getDoc(doc(db,"users",user.uid))).data();const d=p?.details||{};if(active){setContactName(String(d.contactName||d.fullName||d.name||p?.fullName||""));setEmail(user.email||"");const orgId=p?.organizationId;if(orgId){const o=(await getDoc(doc(db,"organizations",orgId))).data();if(active)setFacility(String(o?.name||""));}}}catch{}})();return()=>{active=false};},[]);
  const message=(s:string)=>Alert.alert("Check information",s);
  const check=()=>{if(!facility.trim())return "Facility is required";if(!contactName.trim())return "Contact name is required";if(!validPhone(phone))return "Enter a valid phone number with 7 to 15 digits";if(!validEmail(email))return "Enter a valid email address";if(!description.trim())return "Describe the service issue";return "";};
  const pick=async()=>{const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.75,allowsMultipleSelection:true,selectionLimit:3});if(!result.canceled)setPhotos(result.assets.slice(0,3));};
  async function submit(){const err=check();if(err){message(err);return;}if(busy)return;setBusy(true);setPhotoError("");try{
    const user=auth.currentUser;if(!user)throw new Error("Please sign in again");
    const call=httpsCallable<any,{success:boolean;requestNumber:string}>(functions,"createServiceRequest");
    const result=await call({issueType,priority,description:description.trim(),notes:notes.trim(),costCenter:costCenter.trim(),customerReference:reference.trim(),contact:{name:contactName.trim(),phone:phone.trim(),email:email.trim(),preferredMethod:method}});
    const requestNumber=result.data.requestNumber;setNumber(requestNumber);setStep(2);
    if(photos.length){try{const storage=getStorage();for(let i=0;i<photos.length;i++){const r=await fetch(photos[i].uri);const blob=await r.blob();await uploadBytes(ref(storage,`serviceRequestAttachments/${user.uid}/${requestNumber}/photo-${i+1}.jpg`),blob,{contentType:photos[i].mimeType||"image/jpeg"});}}catch(e){setPhotoError("Request saved, but photo upload failed. " +(e instanceof Error?e.message:"Storage unavailable"));}}
  }catch(e){message(e instanceof Error?e.message:"Request could not be submitted");}finally{setBusy(false);}}
  const field=(label:string,v:string,set:(v:string)=>void,opts?:{phone?:boolean;email?:boolean;multi?:boolean;required?:boolean})=><View style={s.field}><Text style={s.label}>{label}{opts?.required?" *":""}</Text><TextInput value={v} onChangeText={set} style={[s.input,opts?.multi&&s.multiline]} multiline={opts?.multi} keyboardType={opts?.phone?"phone-pad":opts?.email?"email-address":"default"} autoCapitalize={opts?.email?"none":"sentences"} placeholder={label} placeholderTextColor="#9AA6BB"/></View>;
  return <ScrollView style={s.page} contentContainerStyle={[s.content,width>800&&s.wide]} keyboardShouldPersistTaps="handled">
    <View style={s.header}><Pressable onPress={()=>step===0?router.back():setStep(step-1)}><Ionicons name="arrow-back" color={NAVY} size={25}/></Pressable><Image source={require("../../../assets/images/nexus-logo.jpg")} style={s.logo} resizeMode="contain"/><View style={{width:25}}/></View>
    <Text style={s.title}>Create Service Request</Text><Text style={s.sub}>Submit a service issue. Our team will review and assign an engineer.</Text>
    <View style={s.steps}>{["Request details","Review","Submitted"].map((v,i)=><Text key={v} style={[s.step,i===step&&s.current]}>{i+1}. {v}</Text>)}</View>
    {step===0?<>
      <View style={s.card}><Text style={s.heading}>Facility & contact</Text>
        {field("Facility / Hospital",facility,setFacility,{required:true})}{field("Contact person",contactName,setContactName,{required:true})}
        {field("Contact phone",phone,setPhone,{phone:true,required:true})}{field("Contact email",email,setEmail,{email:true,required:true})}
        <Text style={s.label}>Preferred contact method</Text><View style={s.options}>{(["Phone","Email","App Notification"] as Method[]).map(v=><Pressable key={v} onPress={()=>setMethod(v)} style={[s.option,method===v&&s.selected]}><Text style={s.optionText}>{v}</Text></Pressable>)}</View>
      </View>
      <View style={s.card}><Text style={s.heading}>Service details</Text>
        <Text style={s.label}>Issue type</Text><View style={s.options}>{["Repair Required","Equipment Not Working","Equipment Malfunction","Calibration Required","Inspection Required","Other"].map(v=><Pressable key={v} onPress={()=>setIssueType(v)} style={[s.option,issueType===v&&s.selected]}><Text style={s.optionText}>{v}</Text></Pressable>)}</View>
        <Text style={s.label}>Priority</Text><View style={s.options}>{(["Low","Medium","High","Urgent"] as Priority[]).map(v=><Pressable key={v} onPress={()=>setPriority(v)} style={[s.option,priority===v&&s.selected]}><Text style={s.optionText}>{v}</Text></Pressable>)}</View>
        {field("Describe the issue",description,setDescription,{multi:true,required:true})}{field("Additional notes",notes,setNotes,{multi:true})}
        {field("Cost centre (optional)",costCenter,setCostCenter)}{field("Customer reference (optional)",reference,setReference)}
      </View>
      <View style={s.card}><Text style={s.heading}>Supporting photos (optional)</Text><Text style={s.sub}>Select up to 3 images.</Text><Pressable style={s.photoButton} onPress={pick}><Ionicons name="camera-outline" size={23} color={BLUE}/><Text style={s.optionText}>Choose photos ({photos.length}/3)</Text></Pressable><View style={s.photos}>{photos.map((p,i)=><Image key={i} source={{uri:p.uri}} style={s.thumbnail}/>)}</View></View>
      <Pressable style={s.primary} onPress={()=>{const err=check();err?message(err):setStep(1)}}><Text style={s.primaryText}>Review request</Text></Pressable>
    </>:step===1?<><View style={s.card}><Text style={s.heading}>Review before submitting</Text>{[["Facility",facility],["Contact",contactName],["Phone",phone],["Email",email],["Issue type",issueType],["Priority",priority],["Description",description],["Notes",notes],["Cost centre",costCenter],["Customer reference",reference],["Photos",String(photos.length)]].map(([k,v])=><View key={k} style={s.reviewRow}><Text style={s.reviewLabel}>{k}</Text><Text style={s.reviewValue}>{v||"—"}</Text></View>)}</View><Pressable style={s.primary} disabled={busy} onPress={submit}>{busy?<ActivityIndicator color="white"/>:<Text style={s.primaryText}>Submit service request</Text>}</Pressable><Pressable style={s.secondary} onPress={()=>setStep(0)}><Text style={s.optionText}>Back to edit</Text></Pressable></>:<View style={s.card}><Ionicons name="checkmark-circle" size={48} color="#16864D"/><Text style={s.heading}>Request submitted successfully</Text><Text style={s.sub}>Reference: {number}</Text><Text style={s.sub}>Your request is awaiting engineer assignment. Confirmation emails are processed by the server.</Text>{photoError?<Text style={s.warning}>{photoError}</Text>:null}<Pressable style={s.primary} onPress={()=>router.replace("/client-requests" as any)}><Text style={s.primaryText}>View my requests</Text></Pressable></View>}
  </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#F6F7FD"},content:{padding:20,paddingBottom:70},wide:{maxWidth:900,width:"100%",alignSelf:"center"},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:16},logo:{width:170,height:58},title:{fontSize:29,fontWeight:"800",color:NAVY},sub:{fontSize:14,color:MUTED,lineHeight:22,marginTop:7,marginBottom:16},steps:{flexDirection:"row",gap:8,marginVertical:20,flexWrap:"wrap"},step:{padding:11,borderRadius:10,backgroundColor:"#E9ECF5",color:MUTED,fontWeight:"600"},current:{backgroundColor:"#E9E1FF",color:BLUE},card:{backgroundColor:"white",borderRadius:18,borderWidth:1,borderColor:"#E3E6F1",padding:20,marginBottom:16,gap:9},heading:{fontSize:19,fontWeight:"800",color:NAVY,marginBottom:8},field:{marginBottom:12,gap:7},label:{color:NAVY,fontSize:14,fontWeight:"700",marginTop:5},input:{borderWidth:1,borderColor:"#DCE2EE",borderRadius:11,padding:13,fontSize:15,color:NAVY,backgroundColor:"#FFF"},multiline:{height:112,textAlignVertical:"top"},options:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:12},option:{paddingVertical:11,paddingHorizontal:14,borderRadius:10,borderWidth:1,borderColor:"#DDE2EE",backgroundColor:"#FAFBFE"},selected:{borderColor:BLUE,backgroundColor:"#ECE7FF"},optionText:{color:NAVY,fontWeight:"600"},photoButton:{borderWidth:1,borderColor:BLUE,borderRadius:12,padding:15,flexDirection:"row",gap:10,alignSelf:"flex-start"},photos:{flexDirection:"row",gap:10},thumbnail:{height:75,width:75,borderRadius:10},primary:{backgroundColor:BLUE,padding:17,borderRadius:12,alignItems:"center",marginVertical:12},primaryText:{color:"white",fontWeight:"800",fontSize:16},secondary:{alignItems:"center",padding:14},reviewRow:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#EFF1F6",gap:4},reviewLabel:{color:MUTED,fontSize:13},reviewValue:{color:NAVY,fontSize:15,fontWeight:"600"},warning:{color:"#B45309"}});
