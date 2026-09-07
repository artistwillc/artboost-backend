// ARTBOOST_CONSULTANT_PLATFORM_SCOPE_V13_6
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type PlatformResult = {
  platform: string;
  status: "success" | "failed" | "skipped" | "unknown";
  error?: string | null;
};

type PublishingRecord = {
  storeId?: string | null;
  storeName?: string | null;
  storeType?: string | null;
  productTitle?: string | null;
  eventType?: string | null;
  status?: string | null;
  platforms?: string[];
  publishResult?: any;
  message?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
};

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Successful", value: "success" },
  { label: "Failed", value: "failed" },
  { label: "Skipped", value: "skipped" },
];

function cleanPlatform(value: any) {
  const v = String(value || "").trim().toLowerCase();
  return v === "twitter" ? "x" : v;
}

function pretty(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  if (normalized === "x") return "X";
  if (normalized === "tiktok") return "TikTok";
  if (normalized === "linkedin") return "LinkedIn";
  if (normalized === "fine_art_america") return "Fine Art America";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseResult(value: any) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function platformResults(record: PublishingRecord): PlatformResult[] {
  const parsed = parseResult(record.publishResult);
  const rawResults = Array.isArray(parsed?.results) ? parsed.results : [];
  const results: PlatformResult[] = rawResults
    .map((item: any) => {
      const platform = cleanPlatform(item?.platform || item?.name);
      if (!platform) return null;
      return {
        platform,
        status: item?.success === true ? "success" : item?.success === false ? "failed" : "unknown",
        error: item?.error || item?.message || null,
      } as PlatformResult;
    })
    .filter(Boolean) as PlatformResult[];

  if (results.length) return results;

  const platforms = Array.isArray(record.platforms)
    ? record.platforms.map(cleanPlatform).filter(Boolean)
    : [];
  const event = String(record.eventType || "").toLowerCase();
  const status = String(record.status || "").toLowerCase();

  let derived: PlatformResult["status"] = "unknown";
  if (event === "post_skipped" || status === "skipped") derived = "skipped";
  else if (event === "post_failed" || status === "failed") derived = "failed";
  else if (event === "post_success" || status === "success") derived = "success";

  return platforms.map((platform) => ({ platform, status: derived }));
}

function recordStatuses(record: PublishingRecord) {
  return new Set(platformResults(record).map((item) => item.status));
}

function storeLabel(record: PublishingRecord) {
  const type = pretty(record.storeType);
  const name = String(record.storeName || "").trim();
  if (type && name && name.toLowerCase() !== type.toLowerCase()) return `${type} (${name})`;
  return name || type || "Connected Store";
}

function rangeLabel(range: string) {
  if (range === "today") return "Today";
  if (range === "yesterday") return "Yesterday";
  if (range === "this_week") return "This Week";
  if (range === "this_month") return "This Month";
  if (range === "last_7_days") return "Last 7 Days";
  if (range === "last_30_days") return "Last 30 Days";
  return "Publishing History";
}

export default function PublishingHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    range?: string;
    status?: string;
    storeId?: string;
    platform?: string;
  }>();
  const range = String(params.range || "all");
  const requestedStatus = String(params.status || "all");
  const storeId = String(params.storeId || "");
  const platform = cleanPlatform(params.platform || "");

  const [records, setRecords] = useState<PublishingRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState(
    requestedStatus === "failed_skipped" ? "failed_skipped" : requestedStatus
  );
  const [timezone, setTimezone] = useState("America/Chicago");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to review publishing history.");

      const query = new URLSearchParams({
        range,
        status: requestedStatus,
      });
      if (storeId) query.set("storeId", storeId);
      if (platform) query.set("platform", platform);

      const response = await fetch(`${BACKEND_URL}/ai/publishing-history?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json",
        },
      });
      const data = await readApiJson(response, "Publishing History");
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load publishing history.");
      }

      setRecords(Array.isArray(data.records) ? data.records : []);
      setTimezone(String(data.timezone || "America/Chicago"));
    } catch (e: any) {
      setRecords([]);
      setError(e?.message || "Unable to load publishing history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, requestedStatus, storeId, platform]);

  useEffect(() => { load(false); }, [load]);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const results = platformResults(record).filter((item) =>
        !platform || item.platform === platform
      );
      if (!results.length) return false;
      if (activeFilter === "all") return true;
      const statuses = new Set(results.map((item) => item.status));
      if (activeFilter === "failed_skipped") {
        return statuses.has("failed") || statuses.has("skipped");
      }
      return statuses.has(activeFilter as any);
    });
  }, [records, activeFilter, platform]);

  const summary = useMemo(() => {
    let success = 0, failed = 0, skipped = 0;
    for (const record of records) {
      for (const result of platformResults(record).filter((item) => !platform || item.platform === platform)) {
        if (result.status === "success") success += 1;
        if (result.status === "failed") failed += 1;
        if (result.status === "skipped") skipped += 1;
      }
    }
    return { success, failed, skipped };
  }, [records, platform]);

  const visibleFilters = requestedStatus === "failed_skipped"
    ? [{ label: "Failed + Skipped", value: "failed_skipped" }, ...FILTERS]
    : FILTERS;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Loading scheduler publishing history…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Publishing History</Text>
            <Text style={styles.subtitle}>
              {rangeLabel(range)}{platform ? ` · ${pretty(platform)}` : ""} · Scheduler evidence · {timezone}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Summary label="Successful" value={summary.success} />
          <Summary label="Failed" value={summary.failed} />
          <Summary label="Skipped" value={summary.skipped} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
          {visibleFilters.map((filter) => (
            <Pressable
              key={filter.value}
              style={[styles.filter, activeFilter === filter.value && styles.filterActive]}
              onPress={() => setActiveFilter(filter.value)}
            >
              <Text style={styles.filterText}>{filter.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Unable to load history</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!error && filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matching scheduler records</Text>
            <Text style={styles.muted}>
              ArtBoost does not have a scheduler publishing record matching this store, platform, date range, and status filter.
            </Text>
          </View>
        ) : null}

        {filtered.map((record, index) => {
          const results = platformResults(record).filter((item) => !platform || item.platform === platform);
          const detail = record.errorMessage || record.message || "";
          return (
            <View key={`${record.createdAt || "record"}-${index}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.store}>{storeLabel(record)}</Text>
                <Text style={styles.time}>
                  {record.createdAt ? new Date(record.createdAt).toLocaleString() : "Time unavailable"}
                </Text>
              </View>

              {record.productTitle ? (
                <Text style={styles.product}>{record.productTitle}</Text>
              ) : null}

              <View style={styles.platformWrap}>
                {results.length ? results.map((result, idx) => (
                  <View key={`${result.platform}-${idx}`} style={styles.platformRow}>
                    <Text style={styles.platform}>{pretty(result.platform)}</Text>
                    <Text style={[
                      styles.status,
                      result.status === "success" && styles.success,
                      result.status === "failed" && styles.failed,
                      result.status === "skipped" && styles.skipped,
                    ]}>
                      {result.status.toUpperCase()}
                    </Text>
                  </View>
                )) : (
                  <Text style={styles.muted}>No platform attribution in this scheduler record.</Text>
                )}
              </View>

              {detail ? (
                <View style={styles.detailBox}>
                  <Text style={styles.detail}>{detail}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#090713" },
  screen: { flex: 1, backgroundColor: "#090713" },
  content: { padding: 20, paddingBottom: 70 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 18 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#171225" },
  title: { color: "#fff", fontSize: 30, fontWeight: "900" },
  subtitle: { color: "#b8abc9", marginTop: 4, fontSize: 13 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  summary: { flex: 1, padding: 13, borderWidth: 1, borderColor: "#49366f", borderRadius: 16, backgroundColor: "#15111f" },
  summaryValue: { color: "#fff", fontSize: 23, fontWeight: "900" },
  summaryLabel: { color: "#cfc5da", fontSize: 12, marginTop: 3, fontWeight: "700" },
  filters: { marginBottom: 16 },
  filter: { paddingVertical: 10, paddingHorizontal: 15, marginRight: 8, borderRadius: 999, borderWidth: 1, borderColor: "#49366f", backgroundColor: "#15111f" },
  filterActive: { backgroundColor: "#6d39dc", borderColor: "#8b5cf6" },
  filterText: { color: "#fff", fontWeight: "800" },
  card: { padding: 16, borderWidth: 1, borderColor: "#392957", borderRadius: 18, backgroundColor: "#12101c", marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  store: { color: "#fff", fontWeight: "900", fontSize: 17, flex: 1 },
  time: { color: "#a99cb9", fontSize: 11, maxWidth: 130, textAlign: "right" },
  product: { color: "#ddd4e8", marginTop: 8, lineHeight: 20, fontWeight: "700" },
  platformWrap: { marginTop: 12, gap: 7 },
  platformRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1b1726", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 11 },
  platform: { color: "#fff", fontWeight: "800" },
  status: { fontWeight: "900", fontSize: 11 },
  success: { color: "#61e7a2" },
  failed: { color: "#ff7b89" },
  skipped: { color: "#f0c36b" },
  detailBox: { marginTop: 12, padding: 11, borderRadius: 11, backgroundColor: "#1b1726" },
  detail: { color: "#d8cfe2", lineHeight: 19 },
  empty: { borderWidth: 1, borderColor: "#392957", borderRadius: 18, padding: 18, backgroundColor: "#12101c" },
  emptyTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 7 },
  muted: { color: "#b8abc9", lineHeight: 20 },
  errorBox: { borderWidth: 1, borderColor: "#7d3341", borderRadius: 16, padding: 15, marginBottom: 15, backgroundColor: "#24131a" },
  errorTitle: { color: "#fff", fontWeight: "900", marginBottom: 5 },
  errorText: { color: "#ffb7bf", lineHeight: 19 },
});
