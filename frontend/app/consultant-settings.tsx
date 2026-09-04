import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { readApiJson } from "@/lib/apiJson";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

export default function ConsultantSettingsScreen() {
  const [name, setName] = useState("ArtBoost AI Consultant");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Sign in to manage Consultant settings.");
        const response = await fetch(`${BACKEND_URL}/ai/consultant-preferences`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await readApiJson(response, "Consultant Settings");
        if (!response.ok) throw new Error(data?.error || "Unable to load Consultant settings.");
        setName(String(data?.consultantName || "ArtBoost AI Consultant"));
      } catch (error: any) {
        Alert.alert("Consultant Settings", error?.message || "Unable to load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const consultantName = name.trim();
    if (!consultantName) {
      Alert.alert("Consultant name", "Enter a name for your AI Consultant.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to save Consultant settings.");
      const response = await fetch(`${BACKEND_URL}/ai/consultant-preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ consultantName }),
      });
      const data = await readApiJson(response, "Consultant Settings");
      if (!response.ok) throw new Error(data?.error || "Unable to save Consultant settings.");
      setName(String(data?.consultantName || consultantName));
      Alert.alert("Saved", `Your AI Consultant is now named ${data?.consultantName || consultantName}.`);
    } catch (error: any) {
      Alert.alert("Consultant Settings", error?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Consultant Settings</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Name your AI Consultant</Text>
        <Text style={styles.copy}>
          Choose the name ArtBoost uses for your Consultant. This changes its display identity, not its permissions or safeguards.
        </Text>
        {loading ? <ActivityIndicator /> : (
          <>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={40}
              autoCapitalize="words"
              placeholder="ArtBoost AI Consultant"
              placeholderTextColor="#777"
              style={styles.input}
            />
            <Pressable onPress={save} disabled={saving} style={styles.save}>
              <Text style={styles.saveText}>{saving ? "Saving..." : "Save Consultant Name"}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070812" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14 },
  back: { padding: 8, marginRight: 8 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  card: { margin: 18, padding: 20, borderRadius: 18, backgroundColor: "#121424" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  copy: { color: "#b9bdd1", fontSize: 15, lineHeight: 21, marginBottom: 18 },
  input: { color: "#fff", backgroundColor: "#090b15", borderWidth: 1, borderColor: "#34384f", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 17 },
  save: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#7c3aed" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
