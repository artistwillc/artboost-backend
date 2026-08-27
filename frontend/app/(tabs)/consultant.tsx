import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AIConsultantAvatar from "@/components/AIConsultantAvatar";
import { supabase } from "@/lib/supabase";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

type Message = { id: string; role: "user" | "assistant"; text: string };

const STARTERS = [
  "What should I market today?",
  "Review my current marketing priorities.",
  "Which product should I promote next?",
  "Help me improve my posting strategy.",
];

export default function ConsultantScreen() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", text: "I’m your ArtBoost AI Marketing Consultant. I can use your ArtBoost account context to help prioritize products, campaigns, platforms, scheduling, and practical next actions." },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const conversation = useMemo(() => messages.slice(-10).map((m) => ({ role: m.role, content: m.text })), [messages]);

  async function send(starter?: string) {
    const question = String(starter || input).trim();
    if (!question || busy) return;
    const stamp = Date.now();
    setMessages((m) => [...m, { id: `u-${stamp}`, role: "user", text: question }]);
    setInput(""); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to use the AI Consultant.");
      const response = await fetch(`${BACKEND_URL}/ai/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          question,
          currentScreen: "ai-marketing-consultant",
          appVersion: Constants.expoConfig?.version || Constants.nativeAppVersion || "1.0.0",
          conversation,
          assistantMode: "marketing_consultant",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "The AI Consultant could not answer right now.");
      setMessages((m) => [...m, { id: `a-${stamp}`, role: "assistant", text: String(data.answer || "").trim() }]);
    } catch (error: any) {
      setMessages((m) => [...m, { id: `e-${stamp}`, role: "assistant", text: error?.message || "The AI Consultant is temporarily unavailable." }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <View style={styles.header}>
          <AIConsultantAvatar size={66} label="Your live marketing agent" compact active={busy} />
          <View style={styles.livePill}><View style={styles.liveDot}/><Text style={styles.liveText}>LIVE</Text></View>
        </View>
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Marketing Consultant</Text>
          <Text style={styles.subtitle}>Strategy and next-step guidance grounded in your ArtBoost account.</Text>
          <View style={styles.starterWrap}>
            {STARTERS.map((item) => <Pressable key={item} style={styles.starter} onPress={() => send(item)}><Text style={styles.starterText}>{item}</Text></Pressable>)}
          </View>
          {messages.map((m) => <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}><Text style={styles.bubbleLabel}>{m.role === "user" ? "YOU" : "ARTBOOST AI"}</Text><Text style={styles.bubbleText}>{m.text}</Text></View>)}
          {busy ? <View style={styles.thinking}><ActivityIndicator/><Text style={styles.thinkingText}>Consultant is thinking…</Text></View> : null}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput value={input} onChangeText={setInput} placeholder="Ask your marketing consultant…" placeholderTextColor="#77778a" multiline style={styles.input}/>
          <Pressable onPress={() => send()} disabled={busy || !input.trim()} style={[styles.send, (busy || !input.trim()) && styles.sendDisabled]}><Ionicons name="arrow-up" size={20} color="#fff"/></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#070711"}, flex:{flex:1}, header:{paddingHorizontal:18,paddingVertical:13,borderBottomWidth:1,borderBottomColor:"#242039",backgroundColor:"#0c0b18",flexDirection:"row",alignItems:"center",justifyContent:"space-between"}, livePill:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:"#14251d",borderWidth:1,borderColor:"#276749"}, liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#46e891"},liveText:{color:"#87f5b5",fontSize:10,fontWeight:"900",letterSpacing:1},content:{padding:18,paddingBottom:28},title:{color:"#fff",fontSize:28,fontWeight:"900"},subtitle:{color:"#aaa9bb",fontSize:14,lineHeight:20,marginTop:6,marginBottom:18},starterWrap:{gap:8,marginBottom:20},starter:{backgroundColor:"#151326",borderWidth:1,borderColor:"#342d5c",borderRadius:13,padding:12},starterText:{color:"#d8d2ff",fontWeight:"700",fontSize:13},bubble:{borderRadius:18,padding:14,marginBottom:10,maxWidth:"92%"},aiBubble:{alignSelf:"flex-start",backgroundColor:"#131220",borderWidth:1,borderColor:"#2c2850"},userBubble:{alignSelf:"flex-end",backgroundColor:"#382879",borderWidth:1,borderColor:"#6d4be5"},bubbleLabel:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#a99aff",marginBottom:5},bubbleText:{color:"#fff",fontSize:14,lineHeight:20},thinking:{flexDirection:"row",alignItems:"center",gap:9,padding:10},thinkingText:{color:"#aaa9bb"},composer:{flexDirection:"row",alignItems:"flex-end",gap:10,padding:12,borderTopWidth:1,borderTopColor:"#242039",backgroundColor:"#0c0b18"},input:{flex:1,minHeight:46,maxHeight:120,borderRadius:16,borderWidth:1,borderColor:"#302a4e",backgroundColor:"#141321",paddingHorizontal:14,paddingVertical:12,color:"#fff",fontSize:14},send:{width:46,height:46,borderRadius:23,backgroundColor:"#7c4dff",alignItems:"center",justifyContent:"center"},sendDisabled:{opacity:.35}
});
