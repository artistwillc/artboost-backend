import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "https://artboost-ai.onrender.com";

type Product = { id: string; title: string; imageUrl?: string | null; storeName?: string | null; storeType?: string | null };
type Template = { id: string; name: string; description: string };
type VideoJob = { id: string; status: string; progress: number; video_url?: string | null; error_message?: string | null; template_id: string; source_snapshot?: any };

export default function VideoStudioScreen() {
  const params = useLocalSearchParams<{ productId?: string }>();
  const [userId, setUserId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(String(params.productId || ""));
  const [selectedTemplateId, setSelectedTemplateId] = useState("cinematic");
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const selectedProduct = useMemo(() => products.find((p) => p.id === selectedProductId) || null, [products, selectedProductId]);

  useEffect(() => { loadFoundation(); }, []);

  useEffect(() => {
    if (!job?.id || !userId || !["queued", "processing"].includes(job.status)) return;
    const timer = setInterval(() => refreshJob(job.id, userId), 2500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status, userId]);

  async function loadFoundation() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in to use Video Studio.");
      setUserId(user.id);
      const [productResponse, templateResponse] = await Promise.all([
        fetch(`${API_BASE}/products?userId=${encodeURIComponent(user.id)}`),
        fetch(`${API_BASE}/video-studio/templates`),
      ]);
      const productData = await productResponse.json();
      const templateData = await templateResponse.json();
      if (!productResponse.ok || !productData.success) throw new Error(productData.error || "Unable to load products.");
      if (!templateResponse.ok || !templateData.success) throw new Error(templateData.error || "Unable to load video styles.");
      const mapped = (productData.products || []).map((item: any) => ({
        id: String(item.id),
        title: String(item.title || "Untitled Product"),
        imageUrl: item.image_url || null,
        storeName: item.store_name || null,
        storeType: item.store_type || null,
      }));
      setProducts(mapped);
      setTemplates(templateData.templates || []);
      if (!selectedProductId && mapped.length) setSelectedProductId(mapped[0].id);
    } catch (error: any) {
      Alert.alert("Video Studio", error.message || "Unable to open Video Studio.");
    } finally { setLoading(false); }
  }

  async function refreshJob(jobId: string, uid = userId) {
    try {
      const response = await fetch(`${API_BASE}/video-studio/jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(uid)}`);
      const data = await response.json();
      if (response.ok && data.success) setJob(data.job);
    } catch (error) { console.log("Video job refresh failed:", error); }
  }

  async function createVideo() {
    if (!selectedProductId) return Alert.alert("Choose a Product", "Select the listing you want ArtBoost to turn into a video.");
    try {
      setCreating(true);
      setJob(null);
      const response = await fetch(`${API_BASE}/video-studio/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, productId: selectedProductId, templateId: selectedTemplateId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to create video.");
      setJob(data.job);
    } catch (error: any) {
      Alert.alert("Video Creation Failed", error.message || "ArtBoost could not create this video.");
    } finally { setCreating(false); }
  }

  async function regenerate() {
    if (!job?.id) return createVideo();
    try {
      setCreating(true);
      const response = await fetch(`${API_BASE}/video-studio/jobs/${encodeURIComponent(job.id)}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, templateId: selectedTemplateId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to regenerate video.");
      setJob(data.job);
    } catch (error: any) { Alert.alert("Regenerate Failed", error.message || "Unable to regenerate video."); }
    finally { setCreating(false); }
  }

  const videoHtml = job?.video_url ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;background:#000;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#000}</style></head><body><video src="${String(job.video_url).replace(/"/g, "&quot;")}" controls playsinline autoplay muted></video></body></html>` : "";

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.eyebrow}>ARTBOOST AI</Text><Text style={styles.title}>Video Studio</Text></View>
        <View style={styles.proBadge}><Ionicons name="sparkles" size={14} color="#f8d66d" /><Text style={styles.proText}>PREMIUM</Text></View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /><Text style={styles.muted}>Loading your products…</Text></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}><Text style={styles.heroTitle}>Turn a listing into a polished product video.</Text><Text style={styles.heroText}>Choose a product and a style. ArtBoost handles the 9:16 composition, camera motion, transitions, rendering, and high-quality export.</Text></View>

          <Text style={styles.step}>1  Choose Product</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {products.map((product) => {
              const active = product.id === selectedProductId;
              return <Pressable key={product.id} onPress={() => { setSelectedProductId(product.id); setJob(null); }} style={[styles.productCard, active && styles.activeCard]}>
                {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" /> : <View style={[styles.productImage, styles.placeholder]}><Ionicons name="image-outline" size={30} color="#777" /></View>}
                <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                <Text style={styles.storeText} numberOfLines={1}>{product.storeName || product.storeType || "Imported listing"}</Text>
                {active ? <View style={styles.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
              </Pressable>;
            })}
          </ScrollView>

          <Text style={styles.step}>2  Choose Video Style</Text>
          {templates.map((template) => {
            const active = template.id === selectedTemplateId;
            return <Pressable key={template.id} onPress={() => setSelectedTemplateId(template.id)} style={[styles.templateCard, active && styles.activeCard]}>
              <View style={styles.templateIcon}><Ionicons name={template.id === "fast_social" ? "flash" : template.id === "artwork_focus" ? "color-palette" : template.id === "luxury" ? "diamond" : "videocam"} size={22} color="#c4b5fd" /></View>
              <View style={{ flex: 1 }}><Text style={styles.templateName}>{template.name}</Text><Text style={styles.templateDescription}>{template.description}</Text></View>
              <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={23} color={active ? "#8b5cf6" : "#666"} />
            </Pressable>;
          })}

          <Text style={styles.step}>3  Create</Text>
          {selectedProduct ? <View style={styles.readyCard}><Ionicons name="shield-checkmark" size={23} color="#6ee7b7" /><View style={{ flex: 1 }}><Text style={styles.readyTitle}>Artwork-safe rendering</Text><Text style={styles.readyText}>The original listing image stays intact. ArtBoost adds motion around it instead of redrawing your product.</Text></View></View> : null}

          <Pressable disabled={creating || !selectedProductId || job?.status === "processing" || job?.status === "queued"} onPress={createVideo} style={[styles.createButton, (creating || !selectedProductId || job?.status === "processing" || job?.status === "queued") && styles.disabled]}>
            {creating ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={20} color="#fff" />}
            <Text style={styles.createText}>{creating ? "Starting…" : "Create Product Video"}</Text>
          </Pressable>

          {job ? <View style={styles.jobCard}>
            <View style={styles.jobTop}><Text style={styles.jobTitle}>{job.status === "completed" ? "Your video is ready" : job.status === "failed" ? "Video needs attention" : "Creating your video"}</Text><Text style={styles.percent}>{job.progress || 0}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(Math.max(job.progress || 0, 0), 100)}%` }]} /></View>
            {job.status === "processing" || job.status === "queued" ? <Text style={styles.jobText}>ArtBoost is rendering the final 1080 × 1920 MP4. You can leave this screen and return later.</Text> : null}
            {job.status === "failed" ? <Text style={styles.error}>{job.error_message || "Rendering failed."}</Text> : null}
            {job.status === "completed" && job.video_url ? <>
              <View style={styles.preview}><WebView originWhitelist={["*"]} source={{ html: videoHtml }} javaScriptEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} style={{ backgroundColor: "#000" }} /></View>
              <View style={styles.actionRow}><Pressable style={styles.secondaryButton} onPress={regenerate}><Ionicons name="refresh" size={18} color="#fff" /><Text style={styles.secondaryText}>Regenerate</Text></Pressable><Pressable style={styles.publishButton} onPress={() => router.push({ pathname: "/campaign-manager" as any, params: { videoUrl: job.video_url || "", productId: selectedProductId } })}><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={styles.secondaryText}>Use in Campaign</Text></Pressable></View>
            </> : null}
          </View> : null}
          <View style={{ height: 44 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#08090d" }, header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#292a32" },
  backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#171820", alignItems: "center", justifyContent: "center" }, eyebrow: { color: "#a78bfa", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 1 },
  proBadge: { flexDirection: "row", gap: 5, alignItems: "center", borderWidth: 1, borderColor: "#665720", backgroundColor: "#272310", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, proText: { color: "#f8d66d", fontWeight: "800", fontSize: 9, letterSpacing: .7 },
  content: { padding: 16 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, muted: { color: "#9ca3af" },
  heroCard: { borderRadius: 22, padding: 20, backgroundColor: "#141226", borderWidth: 1, borderColor: "#30275a", marginBottom: 23 }, heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 28 }, heroText: { color: "#bbb8cb", fontSize: 14, lineHeight: 21, marginTop: 8 }, step: { color: "#fff", fontSize: 17, fontWeight: "800", marginBottom: 12, marginTop: 4 },
  rowScroll: { gap: 11, paddingBottom: 22 }, productCard: { width: 142, borderRadius: 17, backgroundColor: "#15161c", borderWidth: 1, borderColor: "#282a33", padding: 8, position: "relative" }, activeCard: { borderColor: "#8b5cf6", backgroundColor: "#191627" }, productImage: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#202127" }, placeholder: { alignItems: "center", justifyContent: "center" }, productTitle: { color: "#fff", fontWeight: "700", fontSize: 13, lineHeight: 17, marginTop: 8 }, storeText: { color: "#7f8493", fontSize: 11, marginTop: 4 }, check: { position: "absolute", top: 13, right: 13, width: 23, height: 23, borderRadius: 12, backgroundColor: "#8b5cf6", alignItems: "center", justifyContent: "center" },
  templateCard: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#14151b", borderWidth: 1, borderColor: "#292b34", marginBottom: 10 }, templateIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "#231e39", alignItems: "center", justifyContent: "center" }, templateName: { color: "#fff", fontSize: 15, fontWeight: "800" }, templateDescription: { color: "#9297a6", fontSize: 12, lineHeight: 17, marginTop: 3 },
  readyCard: { padding: 14, borderRadius: 15, backgroundColor: "#0d201b", borderWidth: 1, borderColor: "#1c4b3b", flexDirection: "row", gap: 11, marginBottom: 14 }, readyTitle: { color: "#d1fae5", fontWeight: "800", fontSize: 14 }, readyText: { color: "#87b5a6", fontSize: 12, lineHeight: 17, marginTop: 2 }, createButton: { height: 56, borderRadius: 16, backgroundColor: "#7c3aed", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginBottom: 18 }, disabled: { opacity: .48 }, createText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  jobCard: { borderRadius: 20, padding: 16, backgroundColor: "#121319", borderWidth: 1, borderColor: "#2b2d36" }, jobTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, jobTitle: { color: "#fff", fontWeight: "800", fontSize: 17 }, percent: { color: "#a78bfa", fontWeight: "800" }, progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#252631", overflow: "hidden", marginTop: 13 }, progressFill: { height: 8, backgroundColor: "#8b5cf6", borderRadius: 999 }, jobText: { color: "#9398a7", fontSize: 13, lineHeight: 19, marginTop: 11 }, error: { color: "#fca5a5", fontSize: 13, marginTop: 11 }, preview: { marginTop: 15, alignSelf: "center", width: 240, height: 427, borderRadius: 18, overflow: "hidden", backgroundColor: "#000" }, actionRow: { flexDirection: "row", gap: 10, marginTop: 14 }, secondaryButton: { flex: 1, height: 48, borderRadius: 13, borderWidth: 1, borderColor: "#3a3c47", backgroundColor: "#1b1c23", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, publishButton: { flex: 1.2, height: 48, borderRadius: 13, backgroundColor: "#7c3aed", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, secondaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
