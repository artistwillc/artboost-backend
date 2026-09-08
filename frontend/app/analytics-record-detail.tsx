// ARTBOOST_ANALYTICS_RECORD_DETAIL_V31664
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";

const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com"
).trim().replace(/\/+$/, "");

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function displayPlatform(value: string) {
  if (!value) return "Not specified";
  if (value.toLowerCase() === "x") return "X";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatDate(value: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AnalyticsRecordDetailScreen() {
  const p = useLocalSearchParams<Record<string, string>>();
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [platformData, setPlatformData] = useState<any>(null);
  const platform = String(p.platform || "").trim().toLowerCase();
  const externalId = String(p.externalId || "").trim();

  const loadMetrics = useCallback(async () => {
    if (!platform || !externalId) {
      setPlatformData({ available: false, reason: "This publication does not yet have a saved platform post/media ID." });
      return;
    }
    setLoadingMetrics(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      const response = await fetch(
        `${BACKEND_URL}/analytics/platform-metrics?platform=${encodeURIComponent(platform)}&externalId=${encodeURIComponent(externalId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await response.json();
      setPlatformData(body);
    } catch (error: any) {
      setPlatformData({ available: false, reason: error?.message || "Unable to load platform metrics." });
    } finally {
      setLoadingMetrics(false);
    }
  }, [externalId, platform]);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const metricRows = useMemo(
    () => Object.entries(platformData?.metrics || {}).filter(([, value]) => value !== null && value !== undefined),
    [platformData]
  );

  const backToOrigin = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({
      pathname: "/analytics-records" as any,
      params: {
        kind: p.originKind || "all",
        title: p.originTitle || "Analytics Records",
        platform: p.originPlatform || "",
        productId: p.originProductId || "",
        productTitle: p.originProductTitle || "",
        range: p.range || "30d",
        storeId: p.originStoreId || "",
        storeName: p.originStoreName || "",
        storeType: p.originStoreType || "",
      },
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={backToOrigin} accessibilityLabel="Back to Analytics drill-down">
            <Ionicons name="arrow-back" size={23} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ANALYTICS RECORD</Text>
            <Text style={styles.title}>{String(p.title || "Analytics record")}</Text>
            <Text style={styles.subtitle}>{displayPlatform(platform)} • {String(p.status || "unknown")}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.section}>ARTBOOST ATTRIBUTION</Text>
            <Row label="Listing" value={String(p.productTitle || p.title || "Not available")} />
            <Row label="Platform" value={displayPlatform(platform)} />
            <Row label="Status" value={String(p.status || "unknown")} />
            <Row label="Published / recorded" value={formatDate(String(p.timestamp || ""))} />
            <Row label="Source" value={String(p.source || "ArtBoost")} />
            {p.campaignId ? <Row label="Campaign ID" value={String(p.campaignId)} /> : null}
            {p.automationId ? <Row label="Automation ID" value={String(p.automationId)} /> : null}
            {p.externalId ? <Row label="Platform post/media ID" value={String(p.externalId)} /> : null}
            {p.reason ? <Row label="Record note" value={String(p.reason)} /> : null}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.section}>PLATFORM PERFORMANCE</Text>
                <Text style={styles.help}>Only metrics returned by the connected platform are shown. Missing metrics are never converted to zero.</Text>
              </View>
              <Pressable style={styles.refresh} onPress={() => void loadMetrics()}>
                <Ionicons name="refresh" size={18} color="#c4b5fd" />
              </Pressable>
            </View>
            {loadingMetrics ? (
              <View style={styles.loading}><ActivityIndicator color="#a78bfa" /><Text style={styles.muted}>Loading platform-reported metrics...</Text></View>
            ) : platformData?.available && metricRows.length ? (
              metricRows.map(([key, value]) => <Row key={key} label={labelize(key)} value={Number(value).toLocaleString()} />)
            ) : (
              <View style={styles.unavailable}>
                <Ionicons name="information-circle-outline" size={22} color="#fbbf24" />
                <Text style={styles.muted}>{platformData?.reason || "Platform metrics are not available for this record yet."}</Text>
              </View>
            )}
            {platformData?.retrievedAt ? <Text style={styles.retrieved}>Platform data retrieved {formatDate(platformData.retrievedAt)}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>DATA PROVENANCE</Text>
            <Row label="Publication status" value="ArtBoost first-party" />
            <Row label="Campaign/listing attribution" value="ArtBoost first-party" />
            <Row label="Performance metrics" value={platformData?.available ? `${displayPlatform(platform)} reported` : "Unavailable"} />
          </View>

          {(p.campaignId || p.automationId || p.productId) ? (
            <View style={styles.actions}>
              {p.productId ? <Pressable style={styles.action} onPress={() => router.push({ pathname: "/product-details" as any, params: { productId: p.productId } })}><Text style={styles.actionText}>View Product</Text></Pressable> : null}
              {p.campaignId ? <Pressable style={styles.action} onPress={() => router.push("/campaign-manager" as any)}><Text style={styles.actionText}>View Campaign</Text></Pressable> : null}
              {p.automationId ? <Pressable style={styles.action} onPress={() => router.push({ pathname: "/store-automation" as any, params: { automationId: p.automationId, storeId: p.storeId || "", storeName: p.storeName || "Connected Store", storeType: p.storeType || "" } })}><Text style={styles.actionText}>View Automation</Text></Pressable> : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#030014"},header:{paddingTop:62,paddingHorizontal:20,paddingBottom:18,flexDirection:"row",gap:12,alignItems:"center",borderBottomWidth:1,borderBottomColor:"#2d2442"},
  back:{width:42,height:42,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"#171226",borderWidth:1,borderColor:"#33274b"},
  eyebrow:{color:"#a855f7",fontSize:11,fontWeight:"800",letterSpacing:1.2},title:{color:"#fff",fontSize:22,fontWeight:"800",marginTop:4},subtitle:{color:"#c7bdd8",fontSize:13,marginTop:4},
  content:{padding:20,paddingBottom:48,gap:14},card:{backgroundColor:"#171426",borderWidth:1,borderColor:"#3d3158",borderRadius:18,padding:16,gap:10},
  section:{color:"#c084fc",fontSize:11,fontWeight:"900",letterSpacing:1.1},help:{color:"#948aa8",fontSize:12,lineHeight:17,marginTop:5},sectionHeader:{flexDirection:"row",gap:12},
  refresh:{width:36,height:36,borderRadius:12,backgroundColor:"#2a1f40",alignItems:"center",justifyContent:"center"},row:{borderTopWidth:1,borderTopColor:"#29223a",paddingTop:10,gap:4},
  rowLabel:{color:"#948aa8",fontSize:11,fontWeight:"700"},rowValue:{color:"#fff",fontSize:14,fontWeight:"700"},loading:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:8},
  muted:{color:"#aaa1bb",fontSize:13,lineHeight:18,flex:1},unavailable:{flexDirection:"row",gap:10,alignItems:"flex-start",paddingVertical:6},retrieved:{color:"#766d86",fontSize:10},
  actions:{gap:10},action:{backgroundColor:"#7c3aed",borderRadius:14,paddingVertical:14,alignItems:"center"},actionText:{color:"#fff",fontWeight:"800"},
});
