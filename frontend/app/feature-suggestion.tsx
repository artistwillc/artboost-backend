import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";
const CATEGORIES = ["Creator Tools","Marketing","Analytics","Stores","Video","AI Consultant","Automations","Other"];

export default function FeatureSuggestionScreen() {
  const [category, setCategory] = useState("Creator Tools");
  const [suggestion, setSuggestion] = useState("");
  const [useCase, setUseCase] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (suggestion.trim().length < 5) { Alert.alert("Suggestion", "Tell us a little more about your idea."); return; }
    try {
      setSaving(true);
      const response = await fetch(`${BACKEND_URL}/creator-tools/suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, suggestion: suggestion.trim(), useCase: useCase.trim(),
          appVersion: Constants.expoConfig?.version || Constants.nativeAppVersion || "1.0.0",
        }),
      });
      const data = await readApiJson(response, "Feature Suggestion");
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to submit your suggestion.");
      setSuggestion(""); setUseCase("");
      Alert.alert("Thanks for the suggestion!", "Your feedback has been submitted to the ArtBoost team and will be considered for future updates.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert("Suggestion Not Sent", error?.message || "Unable to submit your suggestion.");
    } finally { setSaving(false); }
  }

  return <>
    <Stack.Screen options={{ headerShown:false }} />
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color="#fff" /></Pressable>
        <View><Text style={styles.eyebrow}>HELP SHAPE ARTBOOST AI</Text><Text style={styles.title}>Suggest a Tool</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.copy}>Tell us what would make ArtBoost more useful for your creative business.</Text>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>{CATEGORIES.map(item => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, item===category && styles.chipActive]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View>
        <Text style={styles.label}>What would you like ArtBoost to do?</Text>
        <TextInput value={suggestion} onChangeText={setSuggestion} multiline style={styles.input} placeholder="Describe the tool or feature you would use..." placeholderTextColor="#777" />
        <Text style={styles.label}>How would you use it? (optional)</Text>
        <TextInput value={useCase} onChangeText={setUseCase} multiline style={styles.input} placeholder="Tell us how this would help your workflow or business..." placeholderTextColor="#777" />
        <Pressable disabled={saving} onPress={submit} style={[styles.submit, saving && {opacity:.5}]}><Text style={styles.submitText}>{saving ? "Submitting..." : "Submit Suggestion"}</Text></Pressable>
      </ScrollView>
    </View>
  </>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#080711"}, header:{paddingHorizontal:18,paddingVertical:16,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#241b3b"},
  back:{width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:"#171126"}, eyebrow:{color:"#46e891",fontSize:10,fontWeight:"900",letterSpacing:1.2}, title:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:3},
  content:{padding:18,paddingBottom:48}, copy:{color:"#d7d2e7",fontSize:15,lineHeight:22,marginBottom:20}, label:{color:"#fff",fontWeight:"800",fontSize:13,marginTop:14,marginBottom:8},
  chips:{flexDirection:"row",flexWrap:"wrap",gap:8}, chip:{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:"#191625",borderWidth:1,borderColor:"#3b3158"}, chipActive:{backgroundColor:"#24513a",borderColor:"#46e891"}, chipText:{color:"#fff",fontSize:11,fontWeight:"700"},
  input:{minHeight:110,borderRadius:15,borderWidth:1,borderColor:"#38304d",backgroundColor:"#12101d",color:"#fff",padding:13,textAlignVertical:"top"}, submit:{marginTop:22,minHeight:50,borderRadius:14,backgroundColor:"#22c55e",alignItems:"center",justifyContent:"center"}, submitText:{color:"#07120b",fontWeight:"900",fontSize:15}
});
