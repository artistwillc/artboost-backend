import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type AssistantAction = {
  id: string;
  label: string;
  route: string;
};

type SupportMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  steps?: string[];
  actions?: AssistantAction[];
  followUps?: string[];
  usedAccountData?: boolean;
  severity?: "info" | "success" | "warning" | "error";
  fallback?: boolean;
};

const POPULAR_QUESTIONS = [
  "What should I do first?",
  "How do I connect a store?",
  "Why didn't my post publish?",
  "Why didn't my automation run?",
  "How do I schedule a campaign?",
  "What Creator Tools are available?",
];

function fallbackAnswer(question: string): SupportMessage {
  const normalized = question.toLowerCase();

  if (normalized.includes("connect") || normalized.includes("store")) {
    return {
      id: `assistant-${Date.now()}`,
      sender: "assistant",
      text: "Live AI support is temporarily unavailable. Open Connect, choose Social Platforms or Stores, and use the Connect or Reconnect action for the account you need.",
      steps: [
        "Open the Connect tab.",
        "Choose Social Platforms or Stores.",
        "Select the account or store.",
        "Complete authorization or import, then refresh the status.",
      ],
      actions: [
        {
          id: "open_connections",
          label: "Open Connections",
          route: "/(tabs)/connections",
        },
      ],
      severity: "warning",
      fallback: true,
    };
  }

  if (
    normalized.includes("post") ||
    normalized.includes("campaign") ||
    normalized.includes("schedule")
  ) {
    return {
      id: `assistant-${Date.now()}`,
      sender: "assistant",
      text: "Live AI support is temporarily unavailable. Check the platform connection, required image and product information, and the campaign's latest status or error before trying again.",
      steps: [
        "Open Connections and confirm the platform is connected.",
        "Open Campaign Manager and review the campaign.",
        "Confirm the image, link, Page, or Pinterest board is present.",
        "Retry the post or schedule after correcting the error.",
      ],
      actions: [
        {
          id: "open_campaign_manager",
          label: "Open Campaign Manager",
          route: "/campaign-manager",
        },
      ],
      severity: "warning",
      fallback: true,
    };
  }

  return {
    id: `assistant-${Date.now()}`,
    sender: "assistant",
    text: "ArtBoost AI Support is temporarily unavailable. You can open Help & FAQ for built-in instructions, then retry your question when the connection is restored.",
    actions: [
      {
        id: "open_faq",
        label: "Open Help & FAQ",
        route: "/faq",
      },
    ],
    severity: "warning",
    fallback: true,
  };
}

export default function CustomerServiceScreen() {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Welcome to ArtBoost AI Support. Ask me anything about ArtBoost, including stores, social connections, products, campaigns, scheduling, automations, analytics, Creator Tools, subscriptions, and troubleshooting.",
      severity: "info",
    },
  ]);

  const scrollViewRef = useRef<ScrollView>(null);
  const hasConversation = messages.length > 1;

  const conversationForApi = useMemo(
    () =>
      messages.slice(-10).map((message) => ({
        role: message.sender,
        content: message.text,
      })),
    [messages]
  );

  function scrollToBottom() {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }

  async function submitQuestion(selectedQuestion?: string) {
    const finalQuestion = String(selectedQuestion || question).trim();

    if (!finalQuestion || sending) {
      return;
    }

    const timestamp = Date.now();
    const userMessage: SupportMessage = {
      id: `user-${timestamp}`,
      sender: "user",
      text: finalQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSending(true);
    scrollToBottom();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(`${BACKEND_URL}/ai/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: finalQuestion,
          userId: user?.id || null,
          currentScreen: "customer-service",
          appVersion:
            Constants.expoConfig?.version ||
            Constants.nativeAppVersion ||
            "1.0.0",
          conversation: conversationForApi,
        }),
      });

      const responseText = await response.text();
      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("ArtBoost received an invalid AI support response.");
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "ArtBoost AI Support could not answer right now."
        );
      }

      const assistantMessage: SupportMessage = {
        id: `assistant-${timestamp}`,
        sender: "assistant",
        text: String(data.answer || "").trim(),
        steps: Array.isArray(data.steps) ? data.steps : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
        followUps: Array.isArray(data.followUps) ? data.followUps : [],
        usedAccountData: Boolean(data.usedAccountData),
        severity: data.severity || "info",
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.log("AI support request failed:", error);
      setMessages((current) => [...current, fallbackAnswer(finalQuestion)]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  function clearConversation() {
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text: "Welcome to ArtBoost AI Support. Ask me anything about ArtBoost, including stores, social connections, products, campaigns, scheduling, automations, analytics, Creator Tools, subscriptions, and troubleshooting.",
        severity: "info",
      },
    ]);
    setQuestion("");
  }

  function openAction(action: AssistantAction) {
    if (!action?.route) {
      return;
    }

    router.push(action.route as any);
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/(tabs)" as any,
      params: { openMore: "true" },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={goBack}>
            <Ionicons name="chevron-back" size={25} color="#ffffff" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>ArtBoost AI Support</Text>
            <Text style={styles.headerSubtitle}>
              AI help for every part of ArtBoost
            </Text>
          </View>

          {hasConversation ? (
            <Pressable style={styles.headerButton} onPress={clearConversation}>
              <Ionicons name="refresh-outline" size={22} color="#ffffff" />
            </Pressable>
          ) : (
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles" size={22} color="#ffffff" />
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (hasConversation) scrollToBottom();
          }}
        >
          {!hasConversation ? (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIcon}>
                  <Ionicons name="sparkles" size={29} color="#ffffff" />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.heroTitle}>How can I help?</Text>
                  <Text style={styles.heroDescription}>
                    Ask a real question in your own words. ArtBoost AI Support can
                    explain features, guide workflows, inspect available account
                    context, and help troubleshoot problems.
                  </Text>
                </View>
              </View>

              <View style={styles.liveNotice}>
                <Ionicons name="shield-checkmark" size={22} color="#86efac" />
                <View style={styles.liveNoticeTextWrap}>
                  <Text style={styles.liveNoticeTitle}>Live AI Support</Text>
                  <Text style={styles.liveNoticeText}>
                    Answers are generated by the ArtBoost backend using official app
                    knowledge and available account data. The assistant will not
                    invent account facts or unsupported features.
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          <View style={styles.chatSection}>
            <View style={styles.messageList}>
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    message.sender === "user" && styles.messageRowUser,
                  ]}
                >
                  {message.sender === "assistant" ? (
                    <View style={styles.assistantAvatar}>
                      <Ionicons name="sparkles" size={18} color="#ffffff" />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.messageBubble,
                      message.sender === "user"
                        ? styles.userBubble
                        : styles.assistantBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        message.sender === "user" && styles.userMessageText,
                      ]}
                    >
                      {message.text}
                    </Text>

                    {message.usedAccountData ? (
                      <View style={styles.accountBadge}>
                        <Ionicons name="person-circle" size={14} color="#c4b5fd" />
                        <Text style={styles.accountBadgeText}>
                          Used your ArtBoost account data
                        </Text>
                      </View>
                    ) : null}

                    {message.fallback ? (
                      <View style={styles.fallbackBadge}>
                        <Ionicons name="cloud-offline" size={14} color="#fcd34d" />
                        <Text style={styles.fallbackBadgeText}>
                          Offline fallback answer
                        </Text>
                      </View>
                    ) : null}

                    {message.steps?.length ? (
                      <View style={styles.stepsContainer}>
                        {message.steps.map((step, index) => (
                          <View key={`${message.id}-step-${index}`} style={styles.stepRow}>
                            <View style={styles.stepNumber}>
                              <Text style={styles.stepNumberText}>{index + 1}</Text>
                            </View>
                            <Text style={styles.stepText}>{step}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {message.actions?.length ? (
                      <View style={styles.actionsContainer}>
                        {message.actions.map((action) => (
                          <Pressable
                            key={`${message.id}-${action.id}`}
                            style={styles.actionButton}
                            onPress={() => openAction(action)}
                          >
                            <Text style={styles.actionButtonText}>{action.label}</Text>
                            <Ionicons
                              name="arrow-forward"
                              size={17}
                              color="#ffffff"
                            />
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    {message.followUps?.length ? (
                      <View style={styles.followUpContainer}>
                        <Text style={styles.followUpLabel}>You can also ask:</Text>
                        {message.followUps.map((followUp) => (
                          <Pressable
                            key={`${message.id}-${followUp}`}
                            style={styles.followUpButton}
                            onPress={() => submitQuestion(followUp)}
                          >
                            <Text style={styles.followUpText}>{followUp}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}

              {sending ? (
                <View style={styles.messageRow}>
                  <View style={styles.assistantAvatar}>
                    <Ionicons name="sparkles" size={18} color="#ffffff" />
                  </View>
                  <View style={[styles.messageBubble, styles.assistantBubble]}>
                    <View style={styles.thinkingRow}>
                      <ActivityIndicator size="small" color="#a78bfa" />
                      <Text style={styles.thinkingText}>
                        Checking ArtBoost and preparing an answer...
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {!hasConversation ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Popular Questions</Text>
                <Text style={styles.sectionSubtitle}>
                  Tap a question or type your own below.
                </Text>
              </View>

              <View style={styles.popularQuestionsList}>
                {POPULAR_QUESTIONS.map((popularQuestion) => (
                  <Pressable
                    key={popularQuestion}
                    style={styles.popularQuestion}
                    onPress={() => submitQuestion(popularQuestion)}
                  >
                    <View style={styles.questionIcon}>
                      <Ionicons name="help" size={17} color="#d8b4fe" />
                    </View>
                    <Text style={styles.popularQuestionText}>{popularQuestion}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color="#707077"
                    />
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.faqCard} onPress={() => router.push("/faq")}>
                <View style={styles.faqIcon}>
                  <Ionicons name="book-outline" size={25} color="#ffffff" />
                </View>
                <View style={styles.faqTextWrap}>
                  <Text style={styles.faqTitle}>Browse Help & FAQ</Text>
                  <Text style={styles.faqDescription}>
                    Open the complete built-in ArtBoost user guide.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#a78bfa" />
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask anything about ArtBoost..."
              placeholderTextColor="#73737a"
              multiline
              maxLength={1200}
              returnKeyType="send"
              blurOnSubmit
              editable={!sending}
              onSubmitEditing={() => submitQuestion()}
            />

            <Pressable
              style={[
                styles.sendButton,
                (!question.trim() || sending) && styles.sendButtonDisabled,
              ]}
              disabled={!question.trim() || sending}
              onPress={() => submitQuestion()}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="arrow-up" size={21} color="#ffffff" />
              )}
            </Pressable>
          </View>

          <Text style={styles.inputHint}>
            ArtBoost support only. External orders and fulfillment remain with the
            applicable store or provider.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0c0c0d" },
  keyboardView: { flex: 1 },
  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#111112",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#202024",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextWrap: { flex: 1 },
  headerTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  headerSubtitle: { color: "#8f8f96", fontSize: 12, marginTop: 2 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#29212f",
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  contentContainer: { padding: 18, paddingBottom: 30 },
  heroCard: {
    backgroundColor: "#18131f",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#3a2750",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroIcon: {
    width: 53,
    height: 53,
    borderRadius: 17,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  heroTextWrap: { flex: 1 },
  heroTitle: { color: "#ffffff", fontSize: 21, fontWeight: "900" },
  heroDescription: {
    color: "#b8b2c0",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  liveNotice: {
    backgroundColor: "#12251b",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#28533d",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
  },
  liveNoticeTextWrap: { flex: 1, marginLeft: 11 },
  liveNoticeTitle: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  liveNoticeText: {
    color: "#9ed3b3",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  chatSection: { marginTop: 22 },
  messageList: { gap: 13 },
  messageRow: { flexDirection: "row", alignItems: "flex-start" },
  messageRowUser: { justifyContent: "flex-end" },
  assistantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  messageBubble: { maxWidth: "86%", borderRadius: 18, padding: 14 },
  assistantBubble: {
    backgroundColor: "#19191c",
    borderWidth: 1,
    borderColor: "#2b2b30",
    borderTopLeftRadius: 6,
  },
  userBubble: { backgroundColor: "#7c3aed", borderTopRightRadius: 6 },
  messageText: { color: "#d0cdd3", fontSize: 13, lineHeight: 20 },
  userMessageText: { color: "#ffffff", fontWeight: "700" },
  accountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  accountBadgeText: { color: "#c4b5fd", fontSize: 10, fontWeight: "700" },
  fallbackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  fallbackBadgeText: { color: "#fcd34d", fontSize: 10, fontWeight: "700" },
  stepsContainer: { marginTop: 14 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 99,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  stepNumberText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  stepText: { flex: 1, color: "#c5c1c8", fontSize: 12, lineHeight: 18 },
  actionsContainer: { marginTop: 12, gap: 8 },
  actionButton: {
    minHeight: 42,
    backgroundColor: "#6d28d9",
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  followUpContainer: { marginTop: 14, gap: 8 },
  followUpLabel: { color: "#8f8f96", fontSize: 10, fontWeight: "800" },
  followUpButton: {
    borderWidth: 1,
    borderColor: "#3d3152",
    backgroundColor: "#221a2c",
    borderRadius: 12,
    padding: 10,
  },
  followUpText: { color: "#d8ccf4", fontSize: 11, lineHeight: 16 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  thinkingText: { color: "#b8b2c0", fontSize: 12 },
  sectionHeader: { marginTop: 25, marginBottom: 12 },
  sectionTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  sectionSubtitle: { color: "#8f8f96", fontSize: 12, marginTop: 3 },
  popularQuestionsList: { gap: 9 },
  popularQuestion: {
    backgroundColor: "#171719",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    flexDirection: "row",
    alignItems: "center",
  },
  questionIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  popularQuestionText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    paddingRight: 8,
  },
  faqCard: {
    backgroundColor: "#18131f",
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3a2750",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 25,
  },
  faqIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  faqTextWrap: { flex: 1, paddingRight: 10 },
  faqTitle: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  faqDescription: { color: "#a59dab", fontSize: 11, lineHeight: 17, marginTop: 4 },
  inputArea: {
    backgroundColor: "#111112",
    borderTopWidth: 1,
    borderTopColor: "#242424",
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: Platform.OS === "ios" ? 10 : 12,
  },
  inputContainer: {
    minHeight: 52,
    maxHeight: 130,
    backgroundColor: "#1b1b1e",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#333338",
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 39,
    maxHeight: 110,
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 9,
    paddingRight: 9,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: "#39343e" },
  inputHint: {
    color: "#67676d",
    fontSize: 9,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 13,
  },
});
