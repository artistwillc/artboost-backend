import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type MoreItem = { title: string; icon: string; route: string; testId?: string; params?: Record<string, string> };

const items: MoreItem[] = [
  { testId: "artboost-more-customer-service", title: "Customer Service", icon: "chatbubbles", route: "/customer-service" },
  { title: "Help & FAQ", icon: "help-circle", route: "/faq", testId: "artboost-more-help-faq" },
  { title: "Campaign Manager", icon: "megaphone", route: "/campaign-manager", testId: "artboost-more-campaign-manager" },
  { testId: "artboost-more-schedule", title: "Schedule", icon: "calendar", route: "/schedule" },
  { title: "Analytics", icon: "bar-chart", route: "/analytics", testId: "artboost-more-analytics" },
  { testId: "artboost-more-saved", title: "Saved Campaigns", icon: "bookmark", route: "/saved" },
  { testId: "artboost-more-ai-marketing-consultant", title: "AI Marketing Consultant", icon: "sparkles", route: "/brand" },
  { testId: "artboost-more-campaign-history", title: "Campaign History", icon: "time", route: "/history" },
  { testId: "artboost-more-notifications", title: "Notifications", icon: "notifications", route: "/notifications" },
  { testId: "artboost-more-platform-status", title: "Platform Status", icon: "radio", route: "/(tabs)/connections", params: { section: "social" } },
  { testId: "artboost-more-creator-tools", title: "Creator Tools", icon: "compass", route: "/explore" },
  { testId: "artboost-more-subscription", title: "Subscription", icon: "card", route: "/(tabs)/pro" }
];

// ARTBOOST_MORE_CHILD_DETERMINISTIC_A11Y_V3105A
export default function MoreToolsScreen() {
  return (
    <View
  style={styles.screen}
  testID="artboost-screen-more"
  nativeID="artboost-screen-more"
  accessible={false}

  accessibilityElementsHidden={false}

  importantForAccessibility="yes"
>
  {/* ARTBOOST_MORE_CHILD_ACCESSIBILITY_V397
      Keep the screen container out of the iOS accessibility tree so
      child tool buttons remain individually discoverable. */}
      <View style={styles.header}>
        <Text style={styles.title}>More Tools</Text>
        <Text style={styles.subtitle}>Manage campaigns, analytics, brand tools, help, and settings.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}

        accessibilityElementsHidden={false}
>
        {items.map((item) => (
          <Pressable
            key={item.title}
            style={styles.item}

            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`ArtBoost More ${item.title}`}
            accessibilityHint={`Open ${item.title}`}
            testID={item.testId}
            nativeID={item.testId}
            collapsable={false}
            onPress={() => {
              if ("params" in item && item.params) {
                router.push({ pathname: item.route as any, params: item.params as any });
              } else {
                router.push(item.route as any);
              }
            }}

            focusable={true}

            pointerEvents="auto"

            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}

            pressRetentionOffset={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onAccessibilityTap={() => {
              if ("params" in item && item.params) {
                router.push({ pathname: item.route as any, params: item.params as any });
              } else {
                router.push(item.route as any);
              }
            }}
          >
            <View style={styles.iconBox}><Ionicons name={item.icon as any} size={21} color="#ffffff" /></View>
            <Text style={styles.itemText}>{item.title}</Text>
            <Ionicons name="chevron-forward" size={20} color="#777" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101019" },
  header: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10 },
  title: { color: "#ffffff", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#ffffff", fontSize: 14, lineHeight: 20, marginTop: 5 },
  content: { padding: 16, paddingBottom: 28 },
  item: { backgroundColor: "#1c1a2b", borderColor: "#2d2850", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" },
  iconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#8b5cf6", alignItems: "center", justifyContent: "center", marginRight: 12 },
  itemText: { color: "#ffffff", fontSize: 16, fontWeight: "800", flex: 1 },
});
