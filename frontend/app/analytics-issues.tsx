// ARTBOOST_NAVIGATION_UX_INTEGRITY_V31510
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type Issue = {
  type?: string;
  id?: string | null;
  automationId?: string | null;
  title?: string | null;
  status?: string | null;
  platform?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  storeType?: string | null;
  timestamp?: string | null;
  reason?: string | null;
  issueKey?: string | null;
};

// ARTBOOST_ANALYTICS_ACTION_ROUTING_V391
export default function AnalyticsIssuesScreen() {
  const params = useLocalSearchParams<{ range?: string; storeId?: string; storeName?: string; storeType?: string }>();
  const storeId = String(params.storeId || "").trim();
  const storeName = String(params.storeName || "").trim();
  const storeType = String(params.storeType || "").trim();
  const scopeQuery = [storeId ? `storeId=${encodeURIComponent(storeId)}` : "", storeName ? `storeName=${encodeURIComponent(storeName)}` : "", storeType ? `storeType=${encodeURIComponent(storeType)}` : ""].filter(Boolean).join("&");
  const range = ["7d", "30d", "90d", "all"].includes(String(params.range))
    ? String(params.range)
    : "30d";
  const [items, setItems] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");

      const response = await fetch(`${BACKEND_URL}/analytics?range=${range}${scopeQuery ? `&${scopeQuery}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await readApiJson(response, "Analytics");
      if (!response.ok) throw new Error(body.error || "Unable to load Analytics issues.");
      setItems(Array.isArray(body.attentionItems) ? body.attentionItems : []);
    } catch (err: any) {
      setError(err?.message || "Unable to load Analytics issues.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, scopeQuery]);

  useEffect(() => { void load(); }, [load]);

  const openIssue = (item: Issue) => {
    router.push({
      pathname: "/analytics-issue" as any,
      params: {
        type: String(item.type || ""),
        id: String(item.id || ""),
        automationId: String(item.automationId || ""),
        title: String(item.title || "Analytics issue"),
        status: String(item.status || ""),
        platform: String(item.platform || ""),
        storeId: String(item.storeId || ""),
        storeName: String(item.storeName || ""),
        storeType: String(item.storeType || ""),
        timestamp: String(item.timestamp || ""),
        reason: String(item.reason || ""),
      },
    });
  };

  const issueKeyFor = (item: Issue, index: number) =>
    String(item.issueKey || `${item.type || "issue"}:${item.id || item.title || index}`);

  async function dismissIssue(item: Issue, index: number) {
    try {
      const issueKey = issueKeyFor(item, index);
      const response = await fetch(`${BACKEND_URL}/analytics-attention/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey }),
      });
      const data = await readApiJson(response, "Analytics Dismiss");
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to dismiss this issue.");
      setItems((current) => current.filter((candidate, candidateIndex) => issueKeyFor(candidate, candidateIndex) !== issueKey));
    } catch (error: any) {
      Alert.alert("Dismiss Failed", error?.message || "Unable to dismiss this issue.");
    }
  }

  function confirmDismissAll() {
    if (!items.length) return;
    Alert.alert(
      "Dismiss all issues?",
      "This removes these attention records from the active list. It does not delete products, posts, campaigns, or automations.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dismiss All",
          style: "destructive",
          onPress: async () => {
            try {
              const issueKeys = items.map(issueKeyFor);
              const response = await fetch(`${BACKEND_URL}/analytics-attention/dismiss-all`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ issueKeys }),
              });
              const data = await readApiJson(response, "Analytics Dismiss All");
              if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to dismiss all issues.");
              setItems([]);
            } catch (error: any) {
              Alert.alert("Dismiss Failed", error?.message || "Unable to dismiss all issues.");
            }
          },
        },
      ]
    );
  }

  const visibleItems = items;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Analytics"
            testID="artboost-back-analytics-issues"
            style={styles.back}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/analytics" as any);
            }}
          >
            <Ionicons name="arrow-back" size={23} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ANALYTICS</Text>
            <Text style={styles.title}>Needs Attention</Text>
            <Text style={styles.subtitle}>
              {range === "all" ? "All recorded activity" : `Last ${range.replace("d", "")} days`}
            </Text>
          </View>
        </View>

        {!loading && !error && visibleItems.length > 0 ? (
          <View style={styles.bulkRow}>
            <Text style={styles.bulkCount}>{visibleItems.length} active issue{visibleItems.length === 1 ? "" : "s"}</Text>
            <Pressable style={styles.clearAll} onPress={confirmDismissAll}>
              <Text style={styles.clearAllText}>Dismiss All</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#9b5cff" />
            <Text style={styles.muted}>Loading affected records...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); void load(); }}
                tintColor="#9b5cff"
              />
            }
          >
            {error ? (
              <View style={styles.errorBlock}>
                <Text style={styles.error}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading Analytics"
                  style={styles.retryButton}
                  disabled={loading || refreshing}
                  onPress={() => void load()}
                >
                  <Text style={styles.retryText}>
                    {loading || refreshing ? "Retrying..." : "Retry"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {!error && visibleItems.length === 0 ? (
              <View style={styles.clearCard}>
                <Ionicons name="checkmark-circle-outline" size={30} color="#86efac" />
                <Text style={styles.clearTitle}>No current issues in this range</Text>
                <Text style={styles.muted}>Failed and paused activity will appear here with record-level details.</Text>
              </View>
            ) : null}

            {visibleItems.map((item, index) => (
              <Pressable
                key={`${item.type || "issue"}-${item.id || index}`}
                testID={`artboost-analytics-issue-${index}`}
                style={styles.card}
                onPress={() => openIssue(item)}
              >
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={item.status === "paused" ? "pause-circle-outline" : "warning-outline"}
                    size={23}
                    color="#fbbf24"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title || "Analytics issue"}</Text>
                  <Text style={styles.meta}>
                    {[item.type, item.platform, item.storeName, item.status].filter(Boolean).join(" • ")}
                  </Text>
                  {item.reason ? <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text> : null}
                </View>
                <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Dismiss issue from this view" onPress={(event) => { event.stopPropagation(); void dismissIssue(item, index); }} style={styles.dismiss}><Ionicons name="close" size={17} color="#fff" /></Pressable><Ionicons name="chevron-forward" size={20} color="#9b94b7" /></View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080711" },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 16, flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#241b3b" },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#171126" },
  eyebrow: { color: "#a78bfa", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 3 },
  subtitle: { color: "#ffffff", marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  bulkRow: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "#151221", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bulkCount: { color: "#d8d2ff", fontSize: 12, fontWeight: "800" },
  clearAll: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#3a2030", borderWidth: 1, borderColor: "#7f364d" },
  clearAllText: { color: "#fecdd3", fontWeight: "900", fontSize: 11 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 16, backgroundColor: "#12101d", borderWidth: 1, borderColor: "#2b2144" },
  iconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#21172d" },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  meta: { color: "#a78bfa", fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  reason: { color: "#ffffff", fontSize: 13, marginTop: 6, lineHeight: 18 },
  muted: { color: "#ffffff", textAlign: "center" },
  error: { color: "#fca5a5", padding: 14, backgroundColor: "#28131a", borderRadius: 12 },
  clearCard: { alignItems: "center", gap: 9, padding: 24, backgroundColor: "#101a16", borderRadius: 16, borderWidth: 1, borderColor: "#1e4636" },
  clearTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  dismiss: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#2a2138", borderWidth: 1, borderColor: "#493b5e" },
  errorBlock: { gap: 10, alignItems: "flex-start" },
  retryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2d1b4e" },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
