// ARTBOOST_UNIFIED_AI_CONSULTANT_SUPPORT_V3160
// ARTBOOST_AI_CONSULTANT_CONTEXT_PROPAGATION_V3159
// ARTBOOST_VISUAL_PARITY_V3153
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Alert,
} from "react-native";
import AIConsultantAvatar from "@/components/AIConsultantAvatar";
import { supabase } from "@/lib/supabase";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type AssistantAction = {
  id: string;
  label?: string;
  route?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  actions?: AssistantAction[];
  followUps?: string[];
  usedAccountData?: boolean;
  severity?: "info" | "success" | "warning" | "error";
};

const STARTERS = [
  "What should I promote today?",
  "Create an Instagram post for my newest product.",
  "Show me what needs attention and help me fix it.",
  "Refresh my connected stores.",
  "Show me the video I just created.",
  "How is my business performing this week?",
  "Schedule my favorite product for tomorrow.",
];

export default function ConsultantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    storeId?: string;
    dateRange?: string;
  }>();
  const selectedStoreId = String(params.storeId || "").trim();
  const selectedDateRange = String(params.dateRange || "").trim();

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [consultantName, setConsultantName] = useState("ArtBoost AI Consultant");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    let active = true;
    const loadConsultantName = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch(`${BACKEND_URL}/ai/consultant-preferences`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await readApiJson(response, "AI Consultant");
        if (active && response.ok && data?.consultantName) {
          setConsultantName(String(data.consultantName));
        }
      } catch {}
    };
    loadConsultantName();
    return () => { active = false; };
  }, []);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "I’m your ArtBoost AI Consultant. Ask me anything about ArtBoost or your art business—or tell me what you’d like to get done. I can analyze your verified ArtBoost data, recommend what to do next, and help manage your products, stores, social connections, campaigns, content, scheduling, automations, analytics, videos, marketing, and business growth. Ask a question, get advice, or give me a task.",
      severity: "info",
    },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const conversation = useMemo(
    () =>
      messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.text,
      })),
    [messages]
  );

  function scrollToBottom() {
    setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      120
    );
  }

  function openAction(action: AssistantAction) {
    if (!action?.route) return;
    router.push(action.route as any);
  }

  async function attachImage(source: "camera" | "library") {
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", source === "camera" ? "Camera access is required to take a photo." : "Photo Library access is required to choose an image.");
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.55, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.55, base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error("The selected image could not be prepared.");
      const mime = asset.mimeType || "image/jpeg";
      setImageUri(asset.uri);
      setImageDataUrl(`data:${mime};base64,${asset.base64}`);
    } catch (error: any) {
      Alert.alert("Image Attachment", error?.message || "Unable to attach that image.");
    }
  }

  function chooseAttachment() {
    Alert.alert("Add to Consultant", "Choose an image source.", [
      { text: "Take Photo", onPress: () => attachImage("camera") },
      { text: "Choose Photo", onPress: () => attachImage("library") },
      { text: "ArtBoost Library", onPress: () => router.push("/(tabs)/products" as any) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function toggleVoice() {
    if (busy) return;
    try {
      if (!recording) {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Microphone Permission", "Microphone access is required for voice input.");
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setRecording(true);
        return;
      }
      await audioRecorder.stop();
      setRecording(false);
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No voice recording was captured.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to use voice input.");
      const form = new FormData();
      form.append("audio", { uri, name: "artboost-voice.m4a", type: "audio/mp4" } as any);
      const response = await fetch(`${BACKEND_URL}/ai/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await readApiJson(response, "Voice Input");
      if (!response.ok || !data?.success) throw new Error(data?.error || "Voice transcription failed.");
      setInput(String(data.text || ""));
    } catch (error: any) {
      setRecording(false);
      Alert.alert("Voice Input", error?.message || "Unable to process voice input.");
    }
  }

  async function send(starter?: string) {
    const question = String(starter || input).trim();
    if (!question || busy) return;

    const stamp = Date.now();
    setMessages((current) => [
      ...current,
      { id: `u-${stamp}`, role: "user", text: question },
    ]);
    setInput("");
    setBusy(true);
    scrollToBottom();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sign in to use the AI Consultant.");
      }

      const response = await fetch(`${BACKEND_URL}/ai/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question,
          currentScreen: "ai-consultant",
          appVersion:
            Constants.expoConfig?.version ||
            Constants.nativeAppVersion ||
            "1.0.0",
          conversation,
          assistantMode: "consultant",
          storeId: selectedStoreId || null,
          dateRange: selectedDateRange || null,
          imageDataUrl: imageDataUrl || null,
        }),
      });

      const responseText = await response.text();
      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "ArtBoost received an invalid AI Consultant response."
        );
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "The AI Consultant could not answer right now."
        );
      }

      setMessages((current) => [
        ...current,
        {
          id: `a-${stamp}`,
          role: "assistant",
          text: String(data.answer || "").trim(),
          steps: Array.isArray(data.steps) ? data.steps : [],
          actions: Array.isArray(data.actions) ? data.actions : [],
          followUps: Array.isArray(data.followUps)
            ? data.followUps
            : [],
          usedAccountData: Boolean(data.usedAccountData),
          severity: data.severity || "info",
        },
      ]);
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        {
          id: `e-${stamp}`,
          role: "assistant",
          text:
            error?.message ||
            "The AI Consultant is temporarily unavailable.",
          severity: "error",
        },
      ]);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  return (
    <SafeAreaView
      style={styles.safe}
      testID="artboost-screen-consultant"
      nativeID="artboost-screen-consultant"
      accessibilityLabel="ArtBoost AI Consultant"
      accessible={false}
      accessibilityElementsHidden={false}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={styles.header}>
          <AIConsultantAvatar
            size={66}
            label={consultantName}
            compact
            active={busy}
            state={busy ? "thinking" : "idle"}
          />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.title}>{consultantName}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Consultant Settings"
              onPress={() => router.push("/consultant-settings" as any)}
              style={{ padding: 8 }}
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Ask a question, get advice, attach an image, use voice, or give me a task.
            Answers and actions are grounded in your verified account.
          </Text>

          <View style={styles.starterWrap}>
            {STARTERS.map((item) => (
              <Pressable
                key={item}
                style={styles.starter}
                onPress={() => send(item)}
              >
                <Text style={styles.starterText}>{item}</Text>
              </Pressable>
            ))}
          </View>

          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === "user"
                  ? styles.userBubble
                  : styles.aiBubble,
              ]}
            >
              <Text style={styles.bubbleLabel}>
                {message.role === "user" ? "YOU" : "ARTBOOST AI"}
              </Text>
              <Text style={styles.bubbleText}>{message.text}</Text>

              {message.role === "assistant" &&
              message.steps?.length ? (
                <View style={styles.stepsWrap}>
                  {message.steps.map((step, index) => (
                    <View
                      key={`${message.id}-step-${index}`}
                      style={styles.stepRow}
                    >
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>
                          {index + 1}
                        </Text>
                      </View>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {message.role === "assistant" &&
              message.actions?.length ? (
                <View style={styles.actionsWrap}>
                  {message.actions.map((action) => (
                    <Pressable
                      key={`${message.id}-${action.id}`}
                      style={styles.actionButton}
                      onPress={() => openAction(action)}
                      disabled={!action.route}
                    >
                      <Text style={styles.actionButtonText}>
                        {action.label || "Open"}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={15}
                        color="#fff"
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {message.role === "assistant" &&
              message.followUps?.length ? (
                <View style={styles.followWrap}>
                  <Text style={styles.followLabel}>You can also ask</Text>
                  {message.followUps.map((followUp) => (
                    <Pressable
                      key={`${message.id}-${followUp}`}
                      style={styles.followButton}
                      onPress={() => send(followUp)}
                    >
                      <Text style={styles.followText}>{followUp}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {message.role === "assistant" &&
              message.usedAccountData ? (
                <Text style={styles.accountContext}>
                  Based on your ArtBoost account data
                </Text>
              ) : null}
            </View>
          ))}

          {busy ? (
            <View style={styles.thinking}>
              <ActivityIndicator />
              <Text style={styles.thinkingText}>
                Consultant is thinking…
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {imageUri ? (
          <View style={styles.attachmentPreview}>
            <Image source={{ uri: imageUri }} style={styles.attachmentImage} />
            <Text style={styles.attachmentText}>Image attached</Text>
            <Pressable onPress={() => { setImageUri(null); setImageDataUrl(null); }} style={styles.attachmentRemove}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composer}>
          <Pressable onPress={chooseAttachment} style={styles.composerIcon} accessibilityLabel="Add image or ArtBoost Library item">
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask your ArtBoost AI Consultant…"
            placeholderTextColor="#9b94b7"
            multiline
            style={styles.input}
          />
          <Pressable onPress={toggleVoice} style={[styles.composerIcon, recording && styles.recording]} accessibilityLabel={recording ? "Stop voice recording" : "Start voice input"}>
            <Ionicons name={recording ? "stop" : "mic"} size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => send()}
            disabled={busy || !input.trim()}
            style={[
              styles.send,
              (busy || !input.trim()) && styles.sendDisabled,
            ]}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "rgba(7, 6, 17, 0.90)" },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#242039",
    backgroundColor: "rgba(12, 11, 24, 0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#14251d",
    borderWidth: 1,
    borderColor: "#276749",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#46e891",
  },
  liveText: {
    color: "#87f5b5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  content: { padding: 18, paddingBottom: 28 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  subtitle: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  starterWrap: { gap: 8, marginBottom: 20 },
  starter: {
    backgroundColor: "#151326",
    borderWidth: 1,
    borderColor: "#342d5c",
    borderRadius: 13,
    padding: 12,
  },
  starterText: {
    color: "#d8d2ff",
    fontWeight: "700",
    fontSize: 13,
  },
  bubble: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    maxWidth: "94%",
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#131220",
    borderWidth: 1,
    borderColor: "#2c2850",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#382879",
    borderWidth: 1,
    borderColor: "#6d4be5",
  },
  bubbleLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#a99aff",
    marginBottom: 5,
  },
  bubbleText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  stepsWrap: { marginTop: 12, gap: 9 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#3d2a79",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumberText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  stepText: {
    flex: 1,
    color: "#efecff",
    fontSize: 13,
    lineHeight: 19,
  },
  actionsWrap: { marginTop: 12, gap: 8 },
  actionButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#7447e8",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actionButtonText: {
    flex: 1,
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  followWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#292542",
    paddingTop: 10,
    gap: 7,
  },
  followLabel: {
    color: "#a9a1c8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  followButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#302a52",
    backgroundColor: "#171426",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  followText: {
    color: "#d8d2ff",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  accountContext: {
    color: "#7fe9ad",
    marginTop: 10,
    fontSize: 10,
    fontWeight: "700",
  },
  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 10,
  },
  thinkingText: { color: "#ffffff" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#242039",
    backgroundColor: "rgba(12, 11, 24, 0.94)",
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#302a4e",
    backgroundColor: "#141321",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#8b4dff",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.35 },
  composerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#242039", alignItems: "center", justifyContent: "center" },
  recording: { backgroundColor: "#7b2432" },
  attachmentPreview: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(12,11,24,0.97)", borderTopWidth: 1, borderTopColor: "#242039" },
  attachmentImage: { width: 42, height: 42, borderRadius: 8 },
  attachmentText: { flex: 1, color: "#d8d2ff", fontSize: 12, fontWeight: "700" },
  attachmentRemove: { padding: 8 },
});
