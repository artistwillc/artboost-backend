import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";

const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

export default function SafetyScreen() {
  const [details, setDetails] = useState("");
  const [reportedUserId, setReportedUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(kind: "report" | "block") {
    try {
      setBusy(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in first.");
      const response = await fetch(`${BACKEND_URL}/safety/${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reportedUserId: reportedUserId.trim() || null, details: details.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.error || "Unable to submit.");
      Alert.alert(kind === "block" ? "User Blocked" : "Report Submitted",
        kind === "block"
          ? "This user is blocked in ArtBoost. Their user-generated content will no longer be shown to you."
          : "ArtBoost received your report for moderation review.");
      setDetails("");
      if (kind === "report") setReportedUserId("");
    } catch (error: any) {
      Alert.alert("Safety Request Failed", error?.message || "Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Safety & Moderation</Text>
      <Text style={styles.copy}>ArtBoost AI has zero tolerance for objectionable content and abusive behavior. Report content or behavior here. If another ArtBoost user is involved, you can also block that user.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ArtBoost user ID (if applicable)</Text>
        <TextInput style={styles.input} value={reportedUserId} onChangeText={setReportedUserId} autoCapitalize="none" placeholder="User ID" placeholderTextColor="#817a94" />
        <Text style={styles.label}>What happened?</Text>
        <TextInput style={[styles.input, styles.multiline]} value={details} onChangeText={setDetails} multiline placeholder="Describe the content or behavior" placeholderTextColor="#817a94" />
        <Pressable disabled={busy || !details.trim()} style={[styles.primary, (busy || !details.trim()) && styles.disabled]} onPress={() => submit("report")} testID="artboost-report-content">
          <Text style={styles.primaryText}>Report Content or Behavior</Text>
        </Pressable>
        <Pressable disabled={busy || !reportedUserId.trim()} style={[styles.block, (busy || !reportedUserId.trim()) && styles.disabled]} onPress={() => submit("block")} testID="artboost-block-user">
          <Text style={styles.primaryText}>Block User</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>Safety reports are sent to ArtBoost for review. Blocking is immediate for ArtBoost surfaces that display user-generated content.</Text>
    </ScrollView>
  );
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#101019"},content:{padding:20,paddingBottom:48},title:{color:"#fff",fontSize:28,fontWeight:"900",marginTop:8,marginBottom:12},copy:{color:"#ddd9e8",lineHeight:21,marginBottom:16},card:{backgroundColor:"#1c1a2b",borderWidth:1,borderColor:"#2d2850",borderRadius:16,padding:16},label:{color:"#fff",fontWeight:"800",marginBottom:7,marginTop:8},input:{backgroundColor:"#11101a",borderWidth:1,borderColor:"#4b465d",borderRadius:10,color:"#fff",padding:12},multiline:{minHeight:120,textAlignVertical:"top"},primary:{marginTop:16,borderRadius:12,backgroundColor:"#8b5cf6",paddingVertical:14,alignItems:"center"},block:{marginTop:10,borderRadius:12,backgroundColor:"#9f1239",paddingVertical:14,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900"},disabled:{opacity:.45},note:{color:"#aaa4ba",fontSize:12,lineHeight:18,marginTop:14}
});
