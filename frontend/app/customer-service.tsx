// ARTBOOST_HELP_ABSORBED_BY_CONSULTANT_LAUNCH_V1
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

export default function CustomerServiceRedirect() {
  useEffect(() => {
    const timer = setTimeout(() => router.replace("/(tabs)/consultant" as any), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.root}>
      <ActivityIndicator />
      <Text style={styles.text}>Opening your ArtBoost AI Consultant…</Text>
    </View>
  );
}
const styles = StyleSheet.create({ root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#070611" }, text: { color: "#fff", fontWeight: "700" } });
