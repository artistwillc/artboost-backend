import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
};

type Detail = {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string | number; note?: string }[];
};

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  async function loadAnalytics() {
    try {
      setError("");
      const response = await fetch(`${BACKEND_URL}/analytics`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load analytics.");
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
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAnalytics(); }, []);

  const attentionCount = useMemo(
    () => (analytics?.failed || 0) + (analytics?.paused || 0),
    [analytics?.failed, analytics?.paused]
  );

  function formatDate(value?: string) {
    if (!value) return "No upcoming posts";
    return new Date(value).toLocaleString([], {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  function openSummary(label: string, value: number | string) {
    const rows: Detail["rows"] = [{ label, value }];
    if (label === "Posts Published") rows.push({ label: "Total recorded posts", value: analytics?.totalPosts || 0 });
    if (label === "Active Campaigns") rows.push({ label: "All campaigns", value: analytics?.totalCampaigns || 0 });
    if (label === "Success Rate") rows.push({ label: "Failed", value: analytics?.failed || 0 });
    setDetail({ title: label, subtitle: `Analytics range: ${rangeLabel(range)}`, rows });
  }

  function openPlatform(name: string, posts: number) {
    setDetail({
      title: `${name} Analytics`,
      subtitle: "Platform detail currently available from ArtBoost publishing records.",
      rows: [
        { label: "Published posts", value: posts },
        { label: "Range", value: rangeLabel(range) },
        { label: "Engagement / reach", value: "Not connected yet", note: "ArtBoost will show additional official platform metrics when the connected platform/API returns them." },
      ],
    });
  }

  if (loading) {
    return <><Stack.Screen options={{ headerShown: false }} /><View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /><Text style={styles.loadingText}>Loading business analytics...</Text></View></>;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace({ pathname: "/(tabs)/pro" as any })}>
            <Ionicons name="arrow-back" size={23} color="#ffffff" />
          </Pressable>
          <View style={styles.headerTextWrap}><Text style={styles.eyebrow}>BUSINESS PERFORMANCE</Text><Text style={styles.headerTitle}>Analytics</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(); }} tintColor="#8b5cf6" />} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>Date Range</Text>
          <View style={styles.rangeRow}>
            {(["7d", "30d", "90d", "all"] as const).map((item) => (
              <Pressable key={item} style={[styles.rangeButton, range === item && styles.rangeButtonActive]} onPress={() => setRange(item)}>
                <Text style={[styles.rangeText, range === item && styles.rangeTextActive]}>{item === "all" ? "All" : item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Business Performance</Text>
          <View style={styles.grid}>
            <StatCard label="Posts Published" value={analytics?.published || 0} onPress={() => openSummary("Posts Published", analytics?.published || 0)} />
            <StatCard label="Active Campaigns" value={analytics?.active || 0} onPress={() => openSummary("Active Campaigns", analytics?.active || 0)} />
            <StatCard label="Success Rate" value={`${analytics?.successRate || 0}%`} onPress={() => openSummary("Success Rate", `${analytics?.successRate || 0}%`)} />
            <StatCard label="Total Posts" value={analytics?.totalPosts || 0} onPress={() => openSummary("Total Posts", analytics?.totalPosts || 0)} />
          </View>

          <Pressable style={[styles.attentionCard, attentionCount === 0 && styles.attentionCardClear]} onPress={() => setDetail({ title: "Needs Attention", rows: [
            { label: "Failed campaigns/posts", value: analytics?.failed || 0 },
            { label: "Paused automations/campaigns", value: analytics?.paused || 0 },
            { label: "Total needing attention", value: attentionCount },
          ]})}>
            <Ionicons name={attentionCount ? "warning-outline" : "checkmark-circle-outline"} size={24} color={attentionCount ? "#fbbf24" : "#86efac"} />
            <View style={styles.attentionCopy}><Text style={styles.attentionTitle}>{attentionCount ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention` : "No current issues detected"}</Text><Text style={styles.attentionText}>Tap to review failures and paused activity.</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#777" />
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
          <Pressable style={styles.insightCard} onPress={() => setDetail({ title: "Top Artwork", rows: [{ label: "Status", value: "Not enough connected engagement data yet" }] })}>
            <Text style={styles.insightLabel}>TOP ARTWORK</Text><Text style={styles.insightTitle}>Not enough data yet</Text><Text style={styles.insightText}>ArtBoost will identify your highest-performing artwork after engagement and click tracking are connected.</Text>
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

function rangeLabel(range: "7d" | "30d" | "90d" | "all") { return range === "all" ? "All recorded activity" : range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Last 90 days"; }
function getBestPlatform(analytics: AnalyticsData | null) {
  if (!analytics) return "Not enough data yet";
  const platforms = [{ name: "Pinterest", value: analytics.pinterestPosts }, { name: "Facebook", value: analytics.facebookPosts }, { name: "Instagram", value: analytics.instagramPosts }, { name: "X", value: analytics.xPosts }];
  const best = [...platforms].sort((a, b) => b.value - a.value)[0];
  return best.value > 0 ? best.name : "Not enough data yet";
}
function StatCard({ label, value, onPress }: { label: string; value: number | string; onPress: () => void }) { return <Pressable style={styles.statCard} onPress={onPress}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.tapHint}>View details</Text></Pressable>; }
function SmallStat({ label, value, onPress }: { label: string; value: number; onPress: () => void }) { return <Pressable style={styles.smallStat} onPress={onPress}><Text style={styles.smallStatValue}>{value}</Text><Text style={styles.smallStatLabel}>{label}</Text></Pressable>; }
function PlatformCard({ name, icon, posts, onPress }: { name: string; icon: any; posts: number; onPress: () => void }) { return <Pressable style={styles.platformCard} onPress={onPress}><View style={styles.platformIconWrap}><Ionicons name={icon} size={22} color="#c4b5fd" /></View><View style={styles.platformContent}><Text style={styles.platformName}>{name}</Text><Text style={styles.platformMetric}>{posts} published posts</Text></View><Text style={styles.platformValue}>{posts}</Text><Ionicons name="chevron-forward" size={18} color="#666" /></Pressable>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#101010"}, header:{paddingHorizontal:20,paddingTop:18,paddingBottom:15,borderBottomWidth:1,borderBottomColor:"#242424",flexDirection:"row",alignItems:"center"}, backButton:{width:44,height:44,borderRadius:15,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",alignItems:"center",justifyContent:"center"}, headerTextWrap:{flex:1,paddingLeft:14}, eyebrow:{color:"#8b5cf6",fontSize:9,fontWeight:"900",letterSpacing:1.2}, headerTitle:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:3}, content:{padding:20,paddingBottom:48}, center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#101010"}, loadingText:{color:"#fff",marginTop:12}, error:{padding:12,borderRadius:12,backgroundColor:"#3a1111",color:"#ffb4b4",marginBottom:16}, sectionTitle:{color:"#fff",fontSize:19,fontWeight:"900",marginTop:18,marginBottom:12},
  rangeRow:{flexDirection:"row",gap:8}, rangeButton:{flex:1,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:"#333",alignItems:"center",backgroundColor:"#171717"}, rangeButtonActive:{backgroundColor:"#2b2145",borderColor:"#8b5cf6"}, rangeText:{color:"#999",fontWeight:"800",fontSize:11}, rangeTextActive:{color:"#fff"},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:10}, statCard:{width:"48%",minHeight:118,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",padding:16,borderRadius:18,justifyContent:"center"}, statValue:{fontSize:29,fontWeight:"900",color:"#fff"}, statLabel:{color:"#999",fontSize:11,fontWeight:"700",marginTop:5}, tapHint:{color:"#8b5cf6",fontSize:10,fontWeight:"800",marginTop:8},
  attentionCard:{marginTop:14,minHeight:84,borderRadius:18,borderWidth:1,borderColor:"#5c4818",backgroundColor:"#29230f",padding:14,flexDirection:"row",alignItems:"center",gap:12}, attentionCardClear:{borderColor:"#24543d",backgroundColor:"#12281e"}, attentionCopy:{flex:1}, attentionTitle:{color:"#fff",fontWeight:"900",fontSize:14}, attentionText:{color:"#aaa",fontSize:11,marginTop:4},
  platformList:{gap:10}, platformCard:{minHeight:82,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",borderRadius:18,padding:14,flexDirection:"row",alignItems:"center",gap:10}, platformIconWrap:{width:46,height:46,borderRadius:15,backgroundColor:"#2b2145",alignItems:"center",justifyContent:"center"}, platformContent:{flex:1}, platformName:{color:"#fff",fontSize:15,fontWeight:"900"}, platformMetric:{color:"#929292",fontSize:11,marginTop:4}, platformValue:{color:"#c4b5fd",fontSize:18,fontWeight:"900"},
  compactGrid:{flexDirection:"row",flexWrap:"wrap",gap:10}, smallStat:{width:"48%",backgroundColor:"#1b1b1b",borderRadius:16,borderWidth:1,borderColor:"#303030",padding:14}, smallStatValue:{color:"#fff",fontSize:23,fontWeight:"900"}, smallStatLabel:{color:"#8e8e8e",fontSize:11,marginTop:3,fontWeight:"700"}, upcomingCard:{marginTop:14,borderRadius:19,backgroundColor:"#24183b",borderWidth:1,borderColor:"#4c3979",padding:17}, upcomingLabel:{color:"#c4b5fd",fontSize:9,fontWeight:"900",letterSpacing:1}, upcomingTitle:{color:"#fff",fontSize:16,fontWeight:"900",marginTop:8}, upcomingText:{color:"#aaa0ba",fontSize:12,lineHeight:18,marginTop:5},
  insightCard:{borderRadius:18,backgroundColor:"#1b1b1b",borderWidth:1,borderColor:"#303030",padding:16,marginBottom:10}, insightLabel:{color:"#8b5cf6",fontSize:9,fontWeight:"900",letterSpacing:1}, insightTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginTop:7}, insightText:{color:"#999",fontSize:12,lineHeight:18,marginTop:6},
  modalShade:{flex:1,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"flex-end"}, modalCard:{backgroundColor:"#151515",borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,paddingBottom:34,borderWidth:1,borderColor:"#343434"}, modalHeader:{flexDirection:"row",alignItems:"flex-start",gap:12,marginBottom:14}, modalEyebrow:{color:"#8b5cf6",fontSize:9,fontWeight:"900",letterSpacing:1.1}, modalTitle:{color:"#fff",fontSize:23,fontWeight:"900",marginTop:4}, modalSubtitle:{color:"#999",fontSize:11,lineHeight:17,marginTop:5}, closeButton:{width:40,height:40,borderRadius:13,backgroundColor:"#262626",alignItems:"center",justifyContent:"center"}, detailRow:{minHeight:68,borderTopWidth:1,borderTopColor:"#292929",paddingVertical:13,flexDirection:"row",alignItems:"center",gap:12}, detailLabel:{color:"#ddd",fontSize:13,fontWeight:"800"}, detailValue:{color:"#c4b5fd",fontSize:16,fontWeight:"900",maxWidth:"42%",textAlign:"right"}, detailNote:{color:"#808080",fontSize:10,lineHeight:15,marginTop:4},
});
