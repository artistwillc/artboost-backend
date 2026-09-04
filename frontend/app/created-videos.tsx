import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

type VideoJob = {
  id: string;
  status: string;
  progress?: number;
  video_url?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  output_width?: number | null;
  output_height?: number | null;
  duration_seconds?: number | null;
  source_snapshot?: any;
};

export default function CreatedVideosScreen() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/video-studio/jobs?limit=100`);
      const data = await readApiJson(response, "Created Videos");
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to load created videos.");
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (error: any) {
      Alert.alert("Created Videos", error?.message || "Unable to load created videos.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function download(job: VideoJob) {
    if (!job.video_url) return;
    try {
      setDownloadingId(job.id);
      const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!base) throw new Error("A writable download location is unavailable.");
      const local = `${base}ArtBoost-${job.id}.mp4`;
      const result = await FileSystem.downloadAsync(job.video_url, local);
      if (result.status < 200 || result.status >= 300) throw new Error(`Video download failed (${result.status}).`);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: "video/mp4", dialogTitle: "ArtBoost Video" });
      else Alert.alert("Video Saved", "The video was downloaded to ArtBoost app storage.");
    } catch (error: any) {
      Alert.alert("Download Failed", error?.message || "Unable to download this video.");
    } finally { setDownloadingId(null); }
  }

  function confirmDelete(job: VideoJob) {
    Alert.alert("Delete Created Video", "Remove this retained ArtBoost video from your Library? This does not delete the original artwork or product.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          const response = await fetch(`${BACKEND_URL}/video-studio/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
          const data = await readApiJson(response, "Created Videos");
          if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to delete video.");
          setJobs(current => current.filter(item => item.id !== job.id));
        } catch (error: any) { Alert.alert("Delete Failed", error?.message || "Unable to delete this video."); }
      }},
    ]);
  }

  return <>
    <Stack.Screen options={{ headerShown:false }} />
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color="#fff" /></Pressable>
        <View style={{flex:1}}><Text style={styles.eyebrow}>LIBRARY</Text><Text style={styles.title}>Created Videos</Text><Text style={styles.subtitle}>Your retained ArtBoost Video Studio generations.</Text></View>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#9b5cff" /><Text style={styles.muted}>Loading videos...</Text></View> :
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); void load();}} tintColor="#9b5cff" />}>
        {!jobs.length ? <View style={styles.empty}><Ionicons name="videocam-outline" size={34} color="#a78bfa" /><Text style={styles.emptyTitle}>No created videos yet</Text><Text style={styles.muted}>Videos generated in Video Studio will appear here while they are retained by your plan.</Text></View> : null}
        {jobs.map(job => {
          const snapshot = job.source_snapshot || {};
          const name = snapshot?.product_title || snapshot?.title || "ArtBoost Video";
          const quality = job.output_width && job.output_height ? `${job.output_width}Ã—${job.output_height}` : String(snapshot?.video_output_quality || "").toUpperCase();
          return <View key={job.id} style={styles.card}>
            <View style={styles.cardTop}><View style={{flex:1}}><Text style={styles.cardTitle}>{name}</Text><Text style={styles.meta}>{[job.status, quality, job.duration_seconds ? `${job.duration_seconds}s` : "", job.completed_at ? new Date(job.completed_at).toLocaleString() : job.created_at ? new Date(job.created_at).toLocaleString() : ""].filter(Boolean).join(" â€¢ ")}</Text></View><Ionicons name={job.status === "completed" ? "checkmark-circle-outline" : job.status === "failed" ? "warning-outline" : "time-outline"} size={24} color={job.status === "completed" ? "#86efac" : "#fbbf24"} /></View>
            {job.error_message ? <Text style={styles.error}>{job.error_message}</Text> : null}
            <View style={styles.actions}>
              {job.video_url ? <Pressable style={styles.button} onPress={() => router.push({ pathname:"/video-studio" as any, params:{ jobId:job.id }})}><Ionicons name="play-outline" size={17} color="#fff" /><Text style={styles.buttonText}>Open</Text></Pressable> : null}
              {job.video_url ? <Pressable style={styles.button} disabled={downloadingId===job.id} onPress={() => void download(job)}><Ionicons name="download-outline" size={17} color="#fff" /><Text style={styles.buttonText}>{downloadingId===job.id ? "Downloading..." : "Download"}</Text></Pressable> : null}
              <Pressable style={styles.button} onPress={() => router.push({ pathname:"/video-studio" as any, params:{ productId:String(snapshot?.product_id || "") }})}><Ionicons name="refresh-outline" size={17} color="#fff" /><Text style={styles.buttonText}>Regenerate</Text></Pressable>
              {job.video_url ? <Pressable style={[styles.button,styles.campaign]} onPress={() => router.push({ pathname:"/campaign-manager" as any, params:{ videoUrl:job.video_url }})}><Ionicons name="megaphone-outline" size={17} color="#fff" /><Text style={styles.buttonText}>Use in Campaign</Text></Pressable> : null}
              <Pressable style={[styles.button,styles.delete]} onPress={() => confirmDelete(job)}><Ionicons name="trash-outline" size={17} color="#fecaca" /><Text style={[styles.buttonText,{color:"#fecaca"}]}>Delete</Text></Pressable>
            </View>
          </View>;
        })}
      </ScrollView>}
    </View>
  </>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#080711"}, header:{paddingHorizontal:18,paddingVertical:16,flexDirection:"row",gap:12,alignItems:"center",borderBottomWidth:1,borderBottomColor:"#241b3b"}, back:{width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:"#171126"},
  eyebrow:{color:"#9b5cff",fontSize:10,fontWeight:"900",letterSpacing:1.2}, title:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:3}, subtitle:{color:"#bcb7cd",fontSize:12,marginTop:3}, center:{flex:1,alignItems:"center",justifyContent:"center",gap:12}, content:{padding:16,paddingBottom:48,gap:12},
  muted:{color:"#bcb7cd",textAlign:"center",lineHeight:19}, empty:{padding:28,borderRadius:18,backgroundColor:"#12101d",alignItems:"center",gap:10}, emptyTitle:{color:"#fff",fontSize:18,fontWeight:"900"}, card:{padding:15,borderRadius:17,backgroundColor:"#12101d",borderWidth:1,borderColor:"#332b4b"}, cardTop:{flexDirection:"row",alignItems:"flex-start",gap:10}, cardTitle:{color:"#fff",fontSize:15,fontWeight:"900"}, meta:{color:"#a78bfa",fontSize:11,lineHeight:16,marginTop:5,textTransform:"capitalize"}, error:{color:"#fca5a5",marginTop:8,fontSize:12}, actions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:13}, button:{minHeight:40,paddingHorizontal:12,borderRadius:11,backgroundColor:"#242033",borderWidth:1,borderColor:"#43395c",flexDirection:"row",alignItems:"center",gap:6}, campaign:{backgroundColor:"#5b36bd",borderColor:"#815df0"}, delete:{backgroundColor:"#35151c",borderColor:"#7f1d1d"}, buttonText:{color:"#fff",fontSize:11,fontWeight:"800"}
});

