// ARTBOOST_NAVIGATION_UX_INTEGRITY_V31510
// ARTBOOST_VISUAL_PARITY_V3153
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

const BACKEND_URL = "https://artboost-ai.onrender.com";

type RecordItem = {
  id?: string | null;
  source?: string | null;
  title?: string | null;
  status?: string | null;
  platform?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  storeType?: string | null;
  timestamp?: string | null;
  reason?: string | null;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function displayPlatform(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.toLowerCase() === "x") return "X";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AnalyticsRecordsScreen() {
  const params = useLocalSearchParams<{
    kind?: string;
    title?: string;
    platform?: string;
    range?: string;
    storeId?: string;
    storeName?: string;
    storeType?: string;
  }>();

  const kind = normalize(params.kind) || "all";
  const title = String(params.title || "Analytics Records");
  const platform = normalize(params.platform);
  const storeId = String(params.storeId || "").trim();
  const storeName = String(params.storeName || "").trim();
  const storeType = String(params.storeType || "").trim();
  const scopeQuery = [storeId ? `storeId=${encodeURIComponent(storeId)}` : "", storeName ? `storeName=${encodeURIComponent(storeName)}` : "", storeType ? `storeType=${encodeURIComponent(storeType)}` : ""].filter(Boolean).join("&");
  const range = ["7d", "30d", "90d", "all"].includes(String(params.range))
    ? String(params.range)
    : "30d";

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw new Error(sessionError.message);
      const accessToken = session?.access_token || "";
      if (!accessToken) {
        throw new Error("Your ArtBoost session is unavailable. Please sign in again.");
      }

      const response = await fetch(`${BACKEND_URL}/analytics?range=${range}${scopeQuery ? `&${scopeQuery}` : ""}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error || "Unable to load Analytics records.");
      }
      setRecords(Array.isArray(body?.recordItems) ? body.recordItems : []);
    } catch (err: any) {
      setError(err?.message || "Unable to load Analytics records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, scopeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const items = records.filter((item) => {
      const status = normalize(item.status);
      const itemPlatform = normalize(item.platform);

      const publishedStatuses = ["published", "success", "post_success"];
      const failedStatuses = ["failed", "error", "post_failed"];
      if (kind === "platform") return itemPlatform === platform && publishedStatuses.includes(status);
      if (kind === "published") return publishedStatuses.includes(status);
      if (kind === "attempts") return publishedStatuses.includes(status) || failedStatuses.includes(status);
      if (kind === "failed") return failedStatuses.includes(status);
      if (kind === "paused") return ["paused", "disabled", "inactive"].includes(status);
      if (kind === "scheduled") return ["scheduled", "pending", "queued"].includes(status);
      if (kind === "saved") return ["saved", "draft"].includes(status);
      if (kind === "automation-active") {
        return normalize(item.source) === "automation" && ["active", "scheduled", "pending", "queued", "running"].includes(status);
      }
      if (kind === "active") {
        return ["active", "scheduled", "pending", "queued", "running"].includes(status);
      }
      return true;
    });

    return items;
  }, [kind, platform, records]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Analytics"
            testID="artboost-back-analytics-records"
            style={styles.back}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/analytics" as any);
            }}
          >
            <Ionicons name="arrow-back" size={23} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ANALYTICS DRILL-DOWN</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {range === "all" ? "All recorded activity" : `Last ${range.replace("d", "")} days`}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#9b5cff" />
            <Text style={styles.muted}>Loading records...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
                tintColor="#9b5cff"
              />
            }
          >
            <View style={styles.summary}>
              <Text style={styles.summaryValue}>{filtered.length}</Text>
              <Text style={styles.summaryLabel}>records in this drill-down</Text>
            </View>

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

            {!error && filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="analytics-outline" size={28} color="#a78bfa" />
                <Text style={styles.emptyTitle}>No matching records</Text>
                <Text style={styles.muted}>
                  There are no recorded items for this selection and date range.
                </Text>
              </View>
            ) : null}

            {filtered.map((item, index) => (
              <View
                key={`${item.source || "record"}-${item.id || index}-${item.platform || ""}`}
                style={styles.card}
                testID={`artboost-analytics-record-${index}`}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title || "Analytics record"}</Text>
                    <Text style={styles.meta}>
                      {[
                        item.source?.replace(/_/g, " "),
                        displayPlatform(item.platform),
                        item.status,
                      ].filter(Boolean).join(" • ")}
                    </Text>
                  </View>
                  <Ionicons
                    name={normalize(item.status).includes("fail") ? "warning-outline" : "checkmark-circle-outline"}
                    size={22}
                    color={normalize(item.status).includes("fail") ? "#fbbf24" : "#86efac"}
                  />
                </View>

                {item.storeName ? (
                  <Text style={styles.line}>Store: {item.storeName}</Text>
                ) : null}
                {item.timestamp ? (
                  <Text style={styles.line}>
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>
                ) : null}
                {item.reason ? (
                  <Text style={styles.reason}>{item.reason}</Text>
                ) : null}
                {item.id ? (
                  <Text style={styles.id}>Record ID: {item.id}</Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "rgba(7, 6, 17, 0.88)" },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 16, flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#241b3b" },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#171126" },
  eyebrow: { color: "#9b5cff", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 23, fontWeight: "900", marginTop: 3 },
  subtitle: { color: "#ffffff", marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  content: { padding: 16, paddingBottom: 44, gap: 12 },
  summary: { padding: 16, borderRadius: 16, backgroundColor: "#21183a", borderWidth: 1, borderColor: "#4c3979" },
  summaryValue: { color: "#fff", fontSize: 28, fontWeight: "900" },
  summaryLabel: { color: "#c4b5fd", marginTop: 4, fontWeight: "700" },
  card: { padding: 15, borderRadius: 16, backgroundColor: "rgba(18, 16, 36, 0.92)", borderWidth: 1, borderColor: "#3b3158" },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  meta: { color: "#a78bfa", fontSize: 12, marginTop: 4, textTransform: "capitalize" },
  line: { color: "#ffffff", fontSize: 12, marginTop: 8 },
  reason: { color: "#f0d7a6", fontSize: 12, lineHeight: 18, marginTop: 8 },
  id: { color: "#ffffff", fontSize: 10, marginTop: 9 },
  muted: { color: "#ffffff", textAlign: "center" },
  error: { color: "#fca5a5", backgroundColor: "#28131a", padding: 14, borderRadius: 12 },
  empty: { alignItems: "center", gap: 8, padding: 24, borderRadius: 16, backgroundColor: "rgba(18, 16, 36, 0.92)", borderWidth: 1, borderColor: "#3b3158" },
  emptyTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  errorBlock: { gap: 10, alignItems: "flex-start" },
  retryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2d1b4e" },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
