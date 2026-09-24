import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

export default function AccountSettingsScreen() {
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email || "");
    });
  }, []);

  async function deleteAccount() {
    if (confirmation.trim().toUpperCase() !== "DELETE") {
      Alert.alert("Confirmation Required", 'Type DELETE to permanently delete your ArtBoost AI account.');
      return;
    }

    Alert.alert(
      "Permanently Delete Account?",
      "This permanently deletes your ArtBoost AI account and ArtBoost-managed account data. This cannot be undone. App Store subscriptions must be canceled separately through Apple.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              const { data } = await supabase.auth.getSession();
              const token = data.session?.access_token;
              if (!token) throw new Error("Your session expired. Please sign in again.");

              const response = await fetch(`${BACKEND_URL}/account/delete`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ confirmation: "DELETE" }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok || !result?.success) {
                throw new Error(result?.error || "Account deletion failed.");
              }

              await supabase.auth.signOut();
              Alert.alert("Account Deleted", "Your ArtBoost AI account has been permanently deleted.");
              router.replace("/(tabs)" as any);
            } catch (error: any) {
              Alert.alert("Unable to Delete Account", error?.message || "Please try again.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account & Privacy</Text>
      <Text style={styles.subtitle}>{email || "Signed-in ArtBoost account"}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.copy}>
          Subscription billing and account deletion are separate. Cancel or change your subscription before deleting your account if you do not want future billing.
        </Text>
        <Pressable style={styles.primary} onPress={() => router.push("/(tabs)/pro" as any)}>
          <Text style={styles.primaryText}>Manage Subscription</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Legal & Privacy</Text>
        <Pressable style={styles.linkButton} onPress={() => Linking.openURL("https://artboostai.com/terms")}>
          <Text style={styles.linkText}>Terms of Service</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => Linking.openURL("https://artboostai.com/privacy")}>
          <Text style={styles.linkText}>Privacy Policy</Text>
        </Pressable>
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.dangerTitle}>Delete Account</Text>
        <Text style={styles.copy}>
          Permanently deletes your ArtBoost AI account and ArtBoost-managed account data. This action cannot be undone.
        </Text>
        <Text style={styles.confirmLabel}>Type DELETE to confirm</Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
          placeholderTextColor="#8d879d"
          style={styles.input}
          editable={!deleting}
        />
        <Pressable
          style={[styles.deleteButton, deleting && styles.disabled]}
          onPress={deleteAccount}
          disabled={deleting}
          testID="artboost-delete-account"
        >
          {deleting ? <ActivityIndicator /> : <Text style={styles.deleteText}>Permanently Delete Account</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101019" },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 8 },
  subtitle: { color: "#b9b4c9", marginTop: 6, marginBottom: 20 },
  card: { backgroundColor: "#1c1a2b", borderColor: "#2d2850", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  dangerCard: { borderColor: "#7f1d1d" },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  dangerTitle: { color: "#fca5a5", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  copy: { color: "#ddd9e8", fontSize: 13, lineHeight: 20 },
  primary: { marginTop: 14, borderRadius: 12, backgroundColor: "#8b5cf6", paddingVertical: 13, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  linkButton: { paddingVertical: 11 },
  linkText: { color: "#a78bfa", fontWeight: "800" },
  confirmLabel: { color: "#fff", fontWeight: "800", marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: "#11101a", borderColor: "#4b465d", borderWidth: 1, borderRadius: 10, color: "#fff", padding: 12 },
  deleteButton: { marginTop: 12, borderRadius: 12, backgroundColor: "#b91c1c", paddingVertical: 14, alignItems: "center" },
  deleteText: { color: "#fff", fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
