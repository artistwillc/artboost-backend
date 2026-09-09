// ARTBOOST_PERSONAL_MARKETING_AGENT_V15
// ARTBOOST_ARTWORK_APPRAISAL_V14
// ARTBOOST_CREATOR_TOOLS_ENABLEMENT_V31614
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

// ARTBOOST_CONSULTANT_CANONICAL_ACTION_ROUTING_V13_4
const CANONICAL_ACTION_BASES: Record<string, string> = {
  open_connections: "/(tabs)/connections",
  open_library: "/(tabs)/products",
  open_campaign_manager: "/campaign-manager",
  open_campaign_history: "/(tabs)/history",
  open_studio: "/video-studio",
  open_created_videos: "/created-videos",
  open_marketing_consultant: "/(tabs)/brand",
  open_creator_tools: "/(tabs)/explore",
  open_schedule: "/(tabs)/schedule",
  review_schedule: "/(tabs)/schedule",
  view_publishing_history: "/publishing-history",
  review_publishing_history: "/publishing-history",
  open_faq: "/faq",
  open_subscription: "/(tabs)/pro",
  open_consultant_settings: "/consultant-settings",
  open_home: "/(tabs)",
  open_ai_consultant: "/(tabs)/consultant",
  open_more: "/(tabs)/more",
  open_connect_store: "/connect-store",
  open_catalog_importer: "/catalog-importer",
  open_product_url_import: "/catalog-import-urls",
  open_csv_import: "/catalog-import-csv",
  open_store_scanner: "/ai-store-scanner",
  open_artpal_scanner: "/artpal-store-scanner",
  open_saved_campaigns: "/saved",
  open_notifications: "/notifications",
  open_notification_settings: "/notification-settings",
  open_store_dashboard: "/(tabs)/store-dashboard",
  open_store_automation: "/store-automation",
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  actions?: AssistantAction[];
  followUps?: string[];
  usedAccountData?: boolean;
  intelligenceSources?: string[];
  evidenceNote?: string | null;
  confidence?: "high" | "moderate" | "preliminary" | "unknown" | null;
  marketResearchUsed?: boolean;
  severity?: "info" | "success" | "warning" | "error";
};

const STARTERS = [
  "Appraise an artwork photo and help me price it.",
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
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // ARTBOOST_CONSULTANT_PHYSICAL_INPUT_HARDENING_V13_10_1

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
        "I’m your personal ArtBoost AI marketing agent. Ask me anything about art, marketing, the art market, your ArtBoost business, or how the app works. Attach artwork and keep asking follow-up questions—I’ll keep that artwork active until you clear or replace it.",
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
    const canonicalBase = CANONICAL_ACTION_BASES[action?.id];
    if (!canonicalBase) return;
    const supplied = String(action?.route || "").trim();
    const suppliedBase = supplied.split("?")[0];
    let destination = canonicalBase;
    if (supplied && suppliedBase === canonicalBase) destination = supplied;
    if (action.id === "review_publishing_history" && !destination.includes("?")) {
      destination += "?range=all&status=failed_skipped";
    }
    router.push(destination as any);
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
    if (busy || recording || voiceProcessing) return;
    Alert.alert("Add to Consultant", "Choose an image source.", [
      { text: "Take Photo", onPress: () => attachImage("camera") },
      { text: "Choose Photo", onPress: () => attachImage("library") },
      { text: "ArtBoost Library", onPress: () => router.push("/(tabs)/products" as any) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function toggleVoice() {
    if (busy || voiceProcessing) return;
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
      setVoiceProcessing(true);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
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
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
      Alert.alert("Voice Input", error?.message || "Unable to process voice input.");
    } finally {
      setVoiceProcessing(false);
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
          actions: Array.isArray(data.actions)
            ? data.actions.filter((action: any) => {
                const route = String(action?.route || "").toLowerCase();
                return !route.startsWith("/analytics");
              })
            : [],
          followUps: Array.isArray(data.followUps)
            ? data.followUps
            : [],
          usedAccountData: Boolean(data.usedAccountData),
          intelligenceSources: Array.isArray(data.intelligenceSources) ? data.intelligenceSources : [],
          evidenceNote: data.evidenceNote ? String(data.evidenceNote) : null,
          confidence: data.confidence || null,
          marketResearchUsed: Boolean(data.marketResearchUsed),
          severity: data.severity || "info",
        },
      ]);
      // V15: keep the latest attached artwork active across follow-up turns.
      // The user can explicitly clear it with the X button or replace it by attaching another image.
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
            active={busy || recording || voiceProcessing}
            state={recording ? "listening" : voiceProcessing ? "working" : busy ? "thinking" : "idle"}
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
            Your personal AI marketing agent for art, marketing, current art-market research, and ArtBoost.
            Attach artwork once and keep asking follow-up questions.
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
              (message.usedAccountData || message.intelligenceSources?.length || message.evidenceNote || message.confidence) ? (
                <View style={styles.intelligenceWrap}>
                  {message.intelligenceSources?.length ? (
                    <Text style={styles.accountContext}>
                      Intelligence: {message.intelligenceSources.map((source) =>
                        source === "artboost" ? "ArtBoost" : source === "artwork" ? "Artwork" : source === "web" ? "Current market" : "Expert guidance"
                      ).join(" + ")}
                    </Text>
                  ) : message.usedAccountData ? (
                    <Text style={styles.accountContext}>Based on your ArtBoost account data</Text>
                  ) : null}
                  {message.confidence ? (
                    <Text style={styles.confidenceText}>Confidence: {message.confidence}</Text>
                  ) : null}
                  {message.evidenceNote ? (
                    <Text style={styles.evidenceText}>{message.evidenceNote}</Text>
                  ) : null}
                </View>
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
            <Text style={styles.attachmentText}>Active artwork • stays with this conversation until cleared or replaced</Text>
            <Pressable onPress={() => { setImageUri(null); setImageDataUrl(null); }} style={styles.attachmentRemove}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composer}>
          <Pressable
            onPress={chooseAttachment}
            disabled={busy || recording || voiceProcessing}
            style={[styles.composerIcon, (busy || recording || voiceProcessing) && styles.composerIconDisabled]}
            accessibilityLabel="Add image or ArtBoost Library item"
            testID="artboost-consultant-add-image"
          >
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
          <Pressable
            onPress={toggleVoice}
            disabled={busy || voiceProcessing}
            style={[styles.composerIcon, recording && styles.recording, voiceProcessing && styles.composerIconDisabled]}
            accessibilityLabel={recording ? "Stop voice recording" : voiceProcessing ? "Processing voice input" : "Start voice input"}
            testID="artboost-consultant-voice"
          >
            <Ionicons name={recording ? "stop" : voiceProcessing ? "hourglass-outline" : "mic"} size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => send()}
            disabled={busy || recording || voiceProcessing || !input.trim()}
            testID="artboost-consultant-send"
            style={[
              styles.send,
              (busy || recording || voiceProcessing || !input.trim()) && styles.sendDisabled,
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
  intelligenceWrap: {
    marginTop: 10,
    gap: 4,
  },
  accountContext: {
    color: "#7fe9ad",
    fontSize: 10,
    fontWeight: "700",
  },
  confidenceText: {
    color: "#c9c1e8",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  evidenceText: {
    color: "#aaa2c8",
    fontSize: 10,
    lineHeight: 14,
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
  composerIconDisabled: { opacity: 0.45 },
  recording: { backgroundColor: "#7b2432" },
  attachmentPreview: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(12,11,24,0.97)", borderTopWidth: 1, borderTopColor: "#242039" },
  attachmentImage: { width: 42, height: 42, borderRadius: 8 },
  attachmentText: { flex: 1, color: "#d8d2ff", fontSize: 12, fontWeight: "700" },
  attachmentRemove: { padding: 8 },
});
