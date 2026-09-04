// ARTBOOST_NAVIGATION_UX_INTEGRITY_V31510
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// ARTBOOST_ANALYTICS_ACTION_ROUTING_V391
// ARTBOOST_ANALYTICS_ISSUE_AUTOMATION_DEEPLINK_V3101C
export default function AnalyticsIssueScreen() {
  const p = useLocalSearchParams<{
    type?: string; id?: string; automationId?: string; title?: string;
    status?: string; platform?: string; storeId?: string;
    storeName?: string; storeType?: string;
    timestamp?: string; reason?: string;
  }>();

  const type = String(p.type || "issue");
  const rows = [
    ["Record ID", p.id],
    ["Type", type],
    ["Status", p.status],
    ["Platform", p.platform],
    ["Store ID", p.storeId],
    ["Store", p.storeName],
    ["Time", p.timestamp ? new Date(String(p.timestamp)).toLocaleString() : ""],
    ["Reason / error", p.reason],
  ].filter((row) => Boolean(row[1]));

  const openRelevantTool = () => {
    if (type === "campaign") {
      router.push("/campaign-manager" as any);
      return;
    }

    const automationId = String(p.automationId || "").trim();
    const storeId = String(p.storeId || "").trim();

    if (automationId || storeId) {
      router.push({
        pathname: "/store-automation" as any,
        params: {
          automationId,
          storeId,
          storeName: String(p.storeName || "Connected Store"),
          storeType: String(p.storeType || p.platform || "store"),
        },
      });
      return;
    }

    router.replace("/analytics" as any);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to issue list"
            testID="artboost-back-analytics-issue"
            style={styles.back}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/analytics-issues" as any);
            }}
          >
            <Ionicons name="arrow-back" size={23} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>AFFECTED RECORD</Text>
            <Text style={styles.title}>{String(p.title || "Analytics issue")}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statusCard}>
            <Ionicons name={p.status === "paused" ? "pause-circle-outline" : "warning-outline"} size={28} color="#fbbf24" />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{String(p.status || "Needs attention")}</Text>
              <Text style={styles.muted}>This is the actual record reported by Analytics.</Text>
            </View>
          </View>

          <View style={styles.details}>
            {rows.map(([label, value]) => (
              <View style={styles.row} key={String(label)}>
                <Text style={styles.label}>{String(label)}</Text>
                <Text style={styles.value}>{String(value)}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.action} onPress={openRelevantTool}>
            <Text style={styles.actionText}>
              {type === "campaign" ? "Open Campaign Manager" : "Open Automation"}
            </Text>
            <Ionicons name="arrow-forward" size={19} color="#fff" />
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080711" },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 16, flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#241b3b" },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#171126" },
  eyebrow: { color: "#a78bfa", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 3 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  statusCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, backgroundColor: "#21172d", borderRadius: 16, borderWidth: 1, borderColor: "#4b365d" },
  statusTitle: { color: "#fff", fontSize: 17, fontWeight: "900", textTransform: "capitalize" },
  muted: { color: "#ffffff", marginTop: 4 },
  details: { backgroundColor: "#12101d", borderRadius: 16, borderWidth: 1, borderColor: "#2b2144", overflow: "hidden" },
  row: { padding: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#302643" },
  label: { color: "#ffffff", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: .8 },
  value: { color: "#fff", fontSize: 15, marginTop: 5, lineHeight: 21 },
  action: { minHeight: 52, paddingHorizontal: 18, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#6d28d9" },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
