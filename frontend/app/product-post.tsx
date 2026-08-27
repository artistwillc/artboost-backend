/* eslint-disable react/no-unescaped-entities */
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "https://artboost-ai.onrender.com";
const PLATFORMS = ["Instagram", "Facebook", "Pinterest", "X", "Threads", "LinkedIn", "TikTok"] as const;
type Platform = (typeof PLATFORMS)[number];

export default function ProductPostScreen() {
  const params = useLocalSearchParams<{
    productId?: string;
    productTitle?: string;
    productDescription?: string;
    productImageUrl?: string;
    productLink?: string;
    storeName?: string;
    storeType?: string;
  }>();

  const productId = String(params.productId || "");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [tone, setTone] = useState("Professional Sales");
  const [title, setTitle] = useState(String(params.productTitle || ""));
  const [caption, setCaption] = useState(String(params.productDescription || ""));
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [altText, setAltText] = useState("");
  const [imageUrl, setImageUrl] = useState(String(params.productImageUrl || ""));
  const [productLink, setProductLink] = useState(String(params.productLink || ""));
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const fullPost = useMemo(() => {
    const pieces = [title, caption, cta, hashtags].map((v) => String(v || "").trim()).filter(Boolean);
    if (productLink && !["Instagram", "TikTok"].includes(platform)) pieces.push(productLink);
    return pieces.join("\n\n");
  }, [title, caption, cta, hashtags, productLink, platform]);

  async function generatePost() {
    if (!productId) return Alert.alert("Product Missing", "Open Create Post from an imported product.");
    try {
      setGenerating(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please sign in again to create a post.");

      const response = await fetch(`${API_BASE}/product-posts/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ productId, platform, tone }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to create post.");

      setTitle(data.post.title || "");
      setCaption(data.post.caption || "");
      setCta(data.post.cta || "");
      setHashtags(data.post.hashtags || "");
      setAltText(data.post.altText || "");
      setImageUrl(data.post.product?.imageUrl || imageUrl);
      setProductLink(data.post.product?.productUrl || productLink);
      setGenerated(true);
    } catch (error: any) {
      Alert.alert("Post Creation Failed", error?.message || "ArtBoost could not create this post.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPost() {
    if (!fullPost) return Alert.alert("Nothing to Copy", "Generate the post first.");
    await Clipboard.setStringAsync(fullPost);
    Alert.alert("Copied", "The complete post is ready to paste into your social app.");
  }

  async function shareManually() {
    if (!fullPost) return Alert.alert("Nothing to Share", "Generate the post first.");
    try {
      await Share.share({ message: fullPost, url: imageUrl || undefined, title: title || "ArtBoost Post" });
    } catch (error: any) {
      Alert.alert("Share Failed", error?.message || "Unable to open the share sheet.");
    }
  }

  function openCampaignManager() {
    router.push({
      pathname: "/campaign-manager" as any,
      params: {
        productId,
        productTitle: title,
        productDescription: caption,
        productImageUrl: imageUrl,
        productLink,
        productHashtags: hashtags,
        productCta: cta,
        productPlatform: platform,
      },
    });
  }

  function openVideoStudio() {
    router.push({ pathname: "/video-studio" as any, params: { productId } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={23} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AI PRODUCT MARKETING</Text>
          <Text style={styles.headerTitle}>Create Post</Text>
        </View>
        <View style={styles.sparkle}><Ionicons name="sparkles" size={20} color="#fff" /></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.productCard}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" /> : <View style={[styles.image, styles.placeholder]}><Ionicons name="image-outline" size={36} color="#777" /></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.productTitle} numberOfLines={2}>{String(params.productTitle || title || "Imported Product")}</Text>
            <Text style={styles.productMeta} numberOfLines={1}>{String(params.storeName || params.storeType || "Imported store")}</Text>
            <Text style={styles.productHint}>ArtBoost will use this product's imported listing data and image.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Where is this post going?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformRow}>
          {PLATFORMS.map((item) => (
            <Pressable key={item} style={[styles.platformChip, platform === item && styles.platformChipActive]} onPress={() => { setPlatform(item); setGenerated(false); }}>
              <Text style={[styles.platformText, platform === item && styles.platformTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Tone</Text>
        <TextInput value={tone} onChangeText={setTone} style={styles.input} placeholder="Professional Sales" placeholderTextColor="#666" />

        <Pressable style={[styles.generateButton, generating && styles.disabled]} onPress={generatePost} disabled={generating}>
          {generating ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={20} color="#fff" />}
          <Text style={styles.generateText}>{generating ? "Creating your post…" : generated ? "Regenerate Post" : "Create First Post"}</Text>
        </Pressable>

        {generated ? <>
          <View style={styles.readyBanner}><Ionicons name="checkmark-circle" size={21} color="#6ee7b7" /><Text style={styles.readyText}>Post created. Review or edit anything before sharing.</Text></View>

          <Text style={styles.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.label}>Caption</Text>
          <TextInput value={caption} onChangeText={setCaption} style={[styles.input, styles.largeInput]} multiline />
          <Text style={styles.label}>CTA</Text>
          <TextInput value={cta} onChangeText={setCta} style={[styles.input, styles.mediumInput]} multiline />
          <Text style={styles.label}>Hashtags</Text>
          <TextInput value={hashtags} onChangeText={setHashtags} style={[styles.input, styles.mediumInput]} multiline />
          <Text style={styles.label}>Accessibility Alt Text</Text>
          <TextInput value={altText} onChangeText={setAltText} style={[styles.input, styles.mediumInput]} multiline />

          <View style={styles.linkCard}>
            <Ionicons name="link" size={19} color="#c4b5fd" />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>{productLink ? "Product link attached" : "No product link available"}</Text>
              <Text style={styles.linkText} numberOfLines={2}>{productLink || "ArtBoost will not invent a destination URL."}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryButton} onPress={copyPost}><Ionicons name="copy-outline" size={18} color="#fff" /><Text style={styles.actionText}>Copy</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={shareManually}><Ionicons name="share-outline" size={18} color="#fff" /><Text style={styles.actionText}>Share</Text></Pressable>
          </View>

          <Pressable style={styles.campaignButton} onPress={openCampaignManager}>
            <Ionicons name="paper-plane-outline" size={19} color="#fff" />
            <View style={{ flex: 1 }}><Text style={styles.campaignTitle}>Send to Campaign Manager</Text><Text style={styles.campaignText}>Carry this product, image, caption, CTA, hashtags and link into ArtBoost's existing publishing workflow.</Text></View>
            <Ionicons name="chevron-forward" size={19} color="#c4b5fd" />
          </Pressable>

          <Pressable style={styles.videoButton} onPress={openVideoStudio}>
            <Ionicons name="videocam" size={20} color="#fff" />
            <View style={{ flex: 1 }}><Text style={styles.videoTitle}>Create TikTok / Short-Form Video</Text><Text style={styles.videoText}>Open the new Video Studio with this same product already selected.</Text></View>
            <Ionicons name="chevron-forward" size={19} color="#fff" />
          </Pressable>
        </> : null}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#08090d" },
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#292a32" },
  backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#171820", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#a78bfa", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  headerTitle: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 1 },
  sparkle: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center" },
  content: { padding: 16 },
  productCard: { borderRadius: 20, padding: 13, flexDirection: "row", gap: 13, backgroundColor: "#14151b", borderWidth: 1, borderColor: "#292b34", marginBottom: 22 },
  image: { width: 92, height: 92, borderRadius: 14, backgroundColor: "#202127" },
  placeholder: { alignItems: "center", justifyContent: "center" },
  productTitle: { color: "#fff", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  productMeta: { color: "#a78bfa", fontSize: 11, marginTop: 5, fontWeight: "700" },
  productHint: { color: "#8c91a0", fontSize: 11, lineHeight: 16, marginTop: 7 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "900", marginBottom: 12 },
  platformRow: { gap: 8, paddingBottom: 18 },
  platformChip: { borderRadius: 999, borderWidth: 1, borderColor: "#343640", paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#15161c" },
  platformChipActive: { backgroundColor: "#2b2145", borderColor: "#8b5cf6" },
  platformText: { color: "#a0a4b1", fontSize: 12, fontWeight: "800" },
  platformTextActive: { color: "#fff" },
  label: { color: "#d7d8df", fontSize: 12, fontWeight: "800", marginBottom: 7, marginTop: 10 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: "#30323b", backgroundColor: "#14151a", color: "#fff", paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  largeInput: { minHeight: 140, textAlignVertical: "top" },
  mediumInput: { minHeight: 84, textAlignVertical: "top" },
  generateButton: { height: 56, borderRadius: 16, marginTop: 18, backgroundColor: "#7c3aed", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  generateText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  disabled: { opacity: 0.55 },
  readyBanner: { marginTop: 16, borderRadius: 14, padding: 12, flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#0d201b", borderWidth: 1, borderColor: "#1c4b3b" },
  readyText: { color: "#c9f7e6", fontSize: 12, flex: 1 },
  linkCard: { marginTop: 14, borderRadius: 15, padding: 13, flexDirection: "row", gap: 10, backgroundColor: "#18142b", borderWidth: 1, borderColor: "#44347b" },
  linkTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  linkText: { color: "#9d97af", fontSize: 11, lineHeight: 16, marginTop: 3 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryButton: { flex: 1, height: 48, borderRadius: 13, borderWidth: 1, borderColor: "#3a3c47", backgroundColor: "#1b1c23", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  campaignButton: { marginTop: 11, minHeight: 72, borderRadius: 16, padding: 13, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#171820", borderWidth: 1, borderColor: "#343640" },
  campaignTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  campaignText: { color: "#8e93a2", fontSize: 10, lineHeight: 15, marginTop: 3 },
  videoButton: { marginTop: 11, minHeight: 76, borderRadius: 16, padding: 13, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#5b21b6" },
  videoTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  videoText: { color: "#ddd6fe", fontSize: 10, lineHeight: 15, marginTop: 3 },
});
