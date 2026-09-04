// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_WHITE_TEXT_AUDIT_V3141
// ARTBOOST_ANALYTICS_DIRECT_MORE_BACK_V3110
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ArtBoostBrandIcon from "@/components/ArtBoostBrandIcon";
import { supabase } from "../lib/supabase";

const BACKEND_URL = "https://artboost-ai.onrender.com";

type AnalyticsData = {
  totalCampaigns: number;
  scheduled: number;
  published: number;
  failed: number;
  saved: number;
  ended: number;
  active: number;
  paused: number;
  totalPosts: number;
  successRate: number;
  averagePostsPerCampaign: number;
  pinterestPosts: number;
  facebookPosts: number;
  instagramPosts: number;
  xPosts: number;
  upcoming: any | null;
  topArtwork?: { title?: string; confirmedPosts?: number } | null;
  attentionCount?: number;
};

type Detail = {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string | number; note?: string }[];
};

// ARTBOOST_ANALYTICS_RECORD_DRILLDOWNS_V393
function getBestPlatform(
  analytics: AnalyticsData | null
) {
  const candidates = [
    { name: "Pinterest", posts: Number(analytics?.pinterestPosts || 0) },
    { name: "Facebook", posts: Number(analytics?.facebookPosts || 0) },
    { name: "Instagram", posts: Number(analytics?.instagramPosts || 0) },
    { name: "X", posts: Number(analytics?.xPosts || 0) },
  ];

  const best = candidates.reduce(
    (leader, candidate) =>
      candidate.posts > leader.posts ? candidate : leader,
    candidates[0]
  );

  return best && best.posts > 0
    ? best.name
    : "No platform data yet";
}
export default function AnalyticsScreen() {
  const routeParams = useLocalSearchParams<{ storeId?: string; storeName?: string; storeType?: string }>();
  const storeId = String(routeParams.storeId || "").trim();
  const storeName = String(routeParams.storeName || "").trim();
  const storeType = String(routeParams.storeType || "").trim();
  const analyticsScopeQuery = [storeId ? `storeId=${encodeURIComponent(storeId)}` : "", storeName ? `storeName=${encodeURIComponent(storeName)}` : "", storeType ? `storeType=${encodeURIComponent(storeType)}` : ""].filter(Boolean).join("&");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  /* ARTBOOST_ANALYTICS_RANGE_ATTENTION_V390 */
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  // ARTBOOST_ANALYTICS_RANGE_NATIVE_STATE_V3131
  const analyticsRequestSerial = useRef(0);
  const [rangeReloading, setRangeReloading] = useState(false);

  const loadAnalytics = useCallback(async (requestedRange: "7d" | "30d" | "90d" | "all" = range) => {
    const requestId = ++analyticsRequestSerial.current;
    setRangeReloading(true);
    try {
      setError("");
      // ARTBOOST_ANALYTICS_BEARER_AUTH_V394
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const accessToken = session?.access_token || "";

      if (!accessToken) {
        throw new Error(
          "Your ArtBoost session is unavailable. Please sign in again."
        );
      }

      const response = await fetch(`${BACKEND_URL}/analytics?range=${requestedRange}${analyticsScopeQuery ? `&${analyticsScopeQuery}` : ""}&_=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-cache",
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load analytics.");
      if (requestId !== analyticsRequestSerial.current) return;
      setAnalytics({
        totalCampaigns: data.totalCampaigns || 0,
        scheduled: data.scheduled || 0,
        published: data.published || 0,
        failed: data.failed || 0,
        saved: data.saved || 0,
        ended: data.ended || 0,
        active: data.active || 0,
        paused: data.paused || 0,
        totalPosts: data.totalPosts || 0,
        successRate: data.successRate || 0,
        averagePostsPerCampaign: data.averagePostsPerCampaign || 0,
        pinterestPosts: data.pinterestPosts || 0,
        facebookPosts: data.facebookPosts || 0,
        instagramPosts: data.instagramPosts || 0,
        xPosts: data.xPosts || 0,
        upcoming: data.upcoming || null,
        topArtwork: data.topArtwork || null,
        attentionCount: Number(data.attentionCount || 0),
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      if (requestId === analyticsRequestSerial.current) {
        setLoading(false);
        setRefreshing(false);
        setRangeReloading(false);
      }
    }
  }, [range, analyticsScopeQuery]);

  useEffect(() => { loadAnalytics(range); }, [loadAnalytics, range]);

  const attentionCount = useMemo(
    () => Number(analytics?.attentionCount ?? ((analytics?.failed || 0) + (analytics?.paused || 0))),
    [analytics?.attentionCount, analytics?.failed, analytics?.paused]
  );

  function formatDate(value?: string) {
    if (!value) return "No upcoming posts";
    return new Date(value).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  function openRecords(kind: string, title: string, platform = "") {
    router.push({
      pathname: "/analytics-records" as any,
      params: { kind, title, platform, range, storeId, storeName, storeType },
    });
  }

  function openSummary(label: string, _value: number | string) {
    const kindMap: Record<string, string> = {
      "Posts Published": "published",
      "Active Automations": "automation-active",
      "Success Rate": "attempts",
      "Total Posts": "published",
      "Scheduled": "scheduled",
      "Paused": "paused",
      "Failed": "failed",
      "Saved": "saved",
    };
    openRecords(kindMap[label] || "all", label);
  }

  function openPlatform(name: string, _posts: number) {
    openRecords("platform", `${name} Analytics`, name);
  }

  if (loading) {
    return <><Stack.Screen options={{ headerShown: false }} /><View style={styles.center}><ActivityIndicator size="large" color="#9b5cff" /><Text style={styles.loadingText}>Loading business analytics...</Text></View></>;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen} testID="artboost-screen-analytics-root"
        nativeID="artboost-screen-analytics-root"
        accessibilityLabel="Analytics screen"
        accessible={false}
        accessibilityElementsHidden={false}
      >
        <View style={styles.header}>
          {/* ARTBOOST_ANALYTICS_BACK_NAV_V398
              Match the proven Campaign Manager back-navigation pattern. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to More"
            testID="artboost-back-analytics"
            nativeID="artboost-back-analytics"
            collapsable={false}
            accessible={true}
            focusable={true}
            pointerEvents="auto"
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onAccessibilityTap={() => {
              router.replace("/(tabs)/more" as any);
            }}
            onPress={() => {
              router.replace("/(tabs)/more" as any);
            }}
          >
            <Ionicons name="arrow-back" size={23} color="#ffffff" />
          </Pressable>
          <View style={styles.headerTextWrap}><Text style={styles.eyebrow}>BUSINESS PERFORMANCE</Text><Text style={styles.headerTitle} testID="artboost-screen-analytics" nativeID="artboost-screen-analytics" accessibilityLabel="Analytics" accessible>Analytics</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(range); }} tintColor="#9b5cff" />} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>Date Range</Text>
          <View style={styles.rangeRow}>
            {(["7d", "30d", "90d", "all"] as const).map((item) => (
              <Pressable
                key={item}
                testID={`artboost-analytics-range-${item}`}
                nativeID={`artboost-analytics-range-${item}`}
                accessibilityRole="button"
                accessibilityLabel={`Analytics range ${item === "all" ? "All" : item.toUpperCase()}`}
                accessibilityState={{ selected: range === item, busy: rangeReloading && range === item }}
                accessible={true}
                style={[styles.rangeButton, range === item && styles.rangeButtonActive]}
                onPress={() => setRange(item)}
              >
                <Text style={[styles.rangeText, range === item && styles.rangeTextActive]}>{item === "all" ? "All" : item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text
            testID="artboost-analytics-range-status"
            nativeID="artboost-analytics-range-status"
            accessibilityLabel={`Analytics showing ${range === "all" ? "All recorded activity" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}${rangeReloading ? ", refreshing" : ""}`}
            accessible={true}
            style={styles.rangeStatus}
          >
            {rangeReloading ? `Refreshing ${range === "all" ? "All recorded activity" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}…` : `Showing ${range === "all" ? "All recorded activity" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"}`}
          </Text>

          <Text style={styles.sectionTitle}>Business Performance</Text>
          <View style={styles.grid}>
            <StatCard label="Posts Published" value={analytics?.published || 0} onPress={() => openSummary("Posts Published", analytics?.published || 0)} />
            <StatCard label="Active Automations" value={analytics?.active || 0} onPress={() => openSummary("Active Automations", analytics?.active || 0)} />
            <StatCard label="Success Rate" value={`${analytics?.successRate || 0}%`} onPress={() => openSummary("Success Rate", `${analytics?.successRate || 0}%`)} />
            <StatCard label="Total Posts" value={analytics?.totalPosts || 0} onPress={() => openSummary("Total Posts", analytics?.totalPosts || 0)} />
          </View>

          <Pressable style={[styles.attentionCard, attentionCount === 0 && styles.attentionCardClear]} onPress={() => router.push({ pathname: "/analytics-issues" as any, params: { range, storeId, storeName, storeType } })}>
            <Ionicons name={attentionCount ? "warning-outline" : "checkmark-circle-outline"} size={24} color={attentionCount ? "#fbbf24" : "#86efac"} />
            <View style={styles.attentionCopy}><Text style={styles.attentionTitle}>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention` : "No current issues detected"}</Text><Text style={styles.attentionText}>Tap to review failures and paused activity.</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#9b94b7" />
          </Pressable>

          <Text style={styles.sectionTitle}>Platform Performance</Text>
          <View style={styles.platformList}>
            <PlatformCard name="Pinterest" icon="logo-pinterest" posts={analytics?.pinterestPosts || 0} onPress={() => openPlatform("Pinterest", analytics?.pinterestPosts || 0)} />
            <PlatformCard name="Facebook" icon="logo-facebook" posts={analytics?.facebookPosts || 0} onPress={() => openPlatform("Facebook", analytics?.facebookPosts || 0)} />
            <PlatformCard name="Instagram" icon="logo-instagram" posts={analytics?.instagramPosts || 0} onPress={() => openPlatform("Instagram", analytics?.instagramPosts || 0)} />
            <PlatformCard name="X" icon="logo-twitter" posts={analytics?.xPosts || 0} onPress={() => openPlatform("X", analytics?.xPosts || 0)} />
          </View>

          <Text style={styles.sectionTitle}>Campaign Health</Text>
          <View style={styles.compactGrid}>
            <SmallStat label="Scheduled" value={analytics?.scheduled || 0} onPress={() => openSummary("Scheduled", analytics?.scheduled || 0)} />
            <SmallStat label="Paused" value={analytics?.paused || 0} onPress={() => openSummary("Paused", analytics?.paused || 0)} />
            <SmallStat label="Failed" value={analytics?.failed || 0} onPress={() => openSummary("Failed", analytics?.failed || 0)} />
            <SmallStat label="Saved" value={analytics?.saved || 0} onPress={() => openSummary("Saved", analytics?.saved || 0)} />
          </View>

          <Pressable style={styles.upcomingCard} onPress={() => setDetail({ title: "Next Scheduled Post", rows: analytics?.upcoming ? [
            { label: "Campaign", value: analytics.upcoming.title || "Scheduled campaign" },
            { label: "Publish time", value: formatDate(analytics.upcoming.publish_at) },
          ] : [{ label: "Status", value: "No upcoming campaign found" }] })}>
            <Text style={styles.upcomingLabel}>NEXT SCHEDULED POST</Text>
            <Text style={styles.upcomingTitle}>{analytics?.upcoming ? analytics.upcoming.title : "No upcoming campaign found"}</Text>
            <Text style={styles.upcomingText}>{analytics?.upcoming ? formatDate(analytics.upcoming.publish_at) : "Create or schedule a campaign to see it here."}</Text>
            <Text style={styles.tapHint}>Tap for details</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Top Performers</Text>
          <Pressable style={styles.insightCard} onPress={() => setDetail({ title: "Top Artwork", rows: analytics?.topArtwork ? [{ label: "Artwork", value: analytics.topArtwork.title || "Artwork" }, { label: "Confirmed posts", value: Number(analytics.topArtwork.confirmedPosts || 0), note: "Based on ArtBoost first-party publishing history for the selected store and date range." }] : [{ label: "Status", value: "No confirmed publishing history in this selection" }] })}>
            <Text style={styles.insightLabel}>TOP ARTWORK</Text><Text style={styles.insightTitle}>{analytics?.topArtwork?.title || "Not enough data yet"}</Text><Text style={styles.insightText}>{analytics?.topArtwork ? `${Number(analytics.topArtwork.confirmedPosts || 0)} confirmed published post${Number(analytics.topArtwork.confirmedPosts || 0) === 1 ? "" : "s"} in this selection.` : "ArtBoost will identify your top artwork from first-party publishing history as records accumulate."}</Text>
          </Pressable>
          <Pressable style={styles.insightCard} onPress={() => setDetail({ title: "Best Platform", rows: [{ label: "Current leader", value: getBestPlatform(analytics) }, { label: "Basis", value: "Published post volume" }] })}>
            <Text style={styles.insightLabel}>BEST PLATFORM</Text><Text style={styles.insightTitle}>{getBestPlatform(analytics)}</Text><Text style={styles.insightText}>Based on published post volume. Reach, clicks, and engagement will improve this recommendation as platform data becomes available.</Text>
          </Pressable>
        </ScrollView>
      </View>

      <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalShade}><View style={styles.modalCard}>
          <View style={styles.modalHeader}><View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>ANALYTICS DRILL-DOWN</Text><Text style={styles.modalTitle}>{detail?.title}</Text>{detail?.subtitle ? <Text style={styles.modalSubtitle}>{detail.subtitle}</Text> : null}</View><Pressable style={styles.closeButton} onPress={() => setDetail(null)}><Ionicons name="close" size={23} color="#fff" /></Pressable></View>
          <ScrollView style={{ maxHeight: 440 }}>{detail?.rows.map((row, i) => <View style={styles.detailRow} key={`${row.label}-${i}`}><View style={{ flex: 1 }}><Text style={styles.detailLabel}>{row.label}</Text>{row.note ? <Text style={styles.detailNote}>{row.note}</Text> : null}</View><Text style={styles.detailValue}>{String(row.value)}</Text></View>)}</ScrollView>
        </View></View>
      </Modal>
    </>
  );
}

function StatCard({ label, value, onPress }: { label: string; value: number | string; onPress: () => void }) { return <Pressable style={styles.statCard} onPress={onPress}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.tapHint}>View details</Text></Pressable>; }
function SmallStat({ label, value, onPress }: { label: string; value: number; onPress: () => void }) { return <Pressable style={styles.smallStat} onPress={onPress}><Text style={styles.smallStatValue}>{value}</Text><Text style={styles.smallStatLabel}>{label}</Text></Pressable>; }
function PlatformCard({ name, icon, posts, onPress }: { name: string; icon: any; posts: number; onPress: () => void }) { return <Pressable style={styles.platformCard} onPress={onPress}><View style={styles.platformIconWrap}><ArtBoostBrandIcon name={name} size={38} /></View><View style={styles.platformContent}><Text style={styles.platformName}>{name}</Text><Text style={styles.platformMetric}>{posts} published posts</Text></View><Text style={styles.platformValue}>{posts}</Text><Ionicons name="chevron-forward" size={18} color="#7c728f" /></Pressable>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"rgba(7, 6, 17, 0.88)"}, header:{paddingHorizontal:20,paddingTop:18,paddingBottom:15,borderBottomWidth:1,borderBottomColor:"#1d1733",flexDirection:"row",alignItems:"center"}, backButton:{width:44,height:44,borderRadius:15,backgroundColor:"rgba(18, 16, 36, 0.92)",borderWidth:1,borderColor:"#3b3158",alignItems:"center",justifyContent:"center"}, headerTextWrap:{flex:1,paddingLeft:14}, eyebrow:{color:"#9b5cff",fontSize:9,fontWeight:"900",letterSpacing:1.2}, headerTitle:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:3}, content:{padding:20,paddingBottom:48}, center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(7, 6, 17, 0.88)"}, loadingText:{color:"#fff",marginTop:12}, error:{padding:12,borderRadius:12,backgroundColor:"#3a1111",color:"#ffb4b4",marginBottom:16}, sectionTitle:{color:"#fff",fontSize:19,fontWeight:"900",marginTop:18,marginBottom:12},
  rangeRow:{flexDirection:"row",gap:8}, rangeButton:{flex:1,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:"#30234d",alignItems:"center",backgroundColor:"rgba(16, 13, 32, 0.92)"}, rangeButtonActive:{backgroundColor:"#21183a",borderColor:"#9b5cff"}, rangeText:{color: "#ffffff",fontWeight:"800",fontSize:11}, rangeTextActive:{color:"#fff"}, rangeStatus:{color: "#ffffff",fontSize:10,fontWeight:"700",marginTop:8},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10}, statCard:{width:"48%",minHeight:118,backgroundColor:"rgba(18, 16, 36, 0.92)",borderWidth:1,borderColor:"#3b3158",padding:16,borderRadius:18,justifyContent:"center"}, statValue:{fontSize:29,fontWeight:"900",color:"#fff"}, statLabel:{color: "#ffffff",fontSize:11,fontWeight:"700",marginTop:5}, tapHint:{color:"#9b5cff",fontSize:10,fontWeight:"800",marginTop:8},
  attentionCard:{marginTop:14,minHeight:84,borderRadius:18,borderWidth:1,borderColor:"#5c4818",backgroundColor:"#29230f",padding:14,flexDirection:"row",alignItems:"center",gap:12}, attentionCardClear:{borderColor:"#24543d",backgroundColor:"#12281e"}, attentionCopy:{flex:1}, attentionTitle:{color:"#fff",fontWeight:"900",fontSize:14}, attentionText:{color: "#ffffff",fontSize:11,marginTop:4},
  platformList:{gap:10}, platformCard:{minHeight:82,backgroundColor:"rgba(18, 16, 36, 0.92)",borderWidth:1,borderColor:"#3b3158",borderRadius:18,padding:14,flexDirection:"row",alignItems:"center",gap:10}, platformIconWrap:{width:46,height:46,borderRadius:15,backgroundColor:"#21183a",alignItems:"center",justifyContent:"center"}, platformContent:{flex:1}, platformName:{color:"#fff",fontSize:15,fontWeight:"900"}, platformMetric:{color: "#ffffff",fontSize:11,marginTop:4}, platformValue:{color:"#c4b5fd",fontSize:18,fontWeight:"900"},
  compactGrid:{flexDirection:"row",flexWrap:"wrap",gap:10}, smallStat:{width:"48%",backgroundColor:"rgba(18, 16, 36, 0.92)",borderRadius:16,borderWidth:1,borderColor:"#3b3158",padding:14}, smallStatValue:{color:"#fff",fontSize:23,fontWeight:"900"}, smallStatLabel:{color: "#ffffff",fontSize:11,marginTop:3,fontWeight:"700"}, upcomingCard:{marginTop:14,borderRadius:19,backgroundColor:"#24183b",borderWidth:1,borderColor:"#4c3979",padding:17}, upcomingLabel:{color:"#c4b5fd",fontSize:9,fontWeight:"900",letterSpacing:1}, upcomingTitle:{color:"#fff",fontSize:16,fontWeight:"900",marginTop:8}, upcomingText:{color: "#ffffff",fontSize:12,lineHeight:18,marginTop:5},
  insightCard:{borderRadius:18,backgroundColor:"rgba(18, 16, 36, 0.92)",borderWidth:1,borderColor:"#3b3158",padding:16,marginBottom:10}, insightLabel:{color:"#9b5cff",fontSize:9,fontWeight:"900",letterSpacing:1}, insightTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginTop:7}, insightText:{color: "#ffffff",fontSize:12,lineHeight:18,marginTop:6},
  modalShade:{flex:1,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"flex-end"}, modalCard:{backgroundColor:"#0f0c1d",borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,paddingBottom:34,borderWidth:1,borderColor:"#343434"}, modalHeader:{flexDirection:"row",alignItems:"flex-start",gap:12,marginBottom:14}, modalEyebrow:{color:"#9b5cff",fontSize:9,fontWeight:"900",letterSpacing:1.1}, modalTitle:{color:"#fff",fontSize:23,fontWeight:"900",marginTop:4}, modalSubtitle:{color: "#ffffff",fontSize:11,lineHeight:17,marginTop:5}, closeButton:{width:40,height:40,borderRadius:13,backgroundColor:"#211a38",alignItems:"center",justifyContent:"center"}, detailRow:{minHeight:68,borderTopWidth:1,borderTopColor:"#3f2e68",paddingVertical:13,flexDirection:"row",alignItems:"center",gap:12}, detailLabel:{color:"#ddd",fontSize:13,fontWeight:"800"}, detailValue:{color:"#c4b5fd",fontSize:16,fontWeight:"900",maxWidth:"42%",textAlign:"right"}, detailNote:{color: "#ffffff",fontSize:10,lineHeight:15,marginTop:4},
});
