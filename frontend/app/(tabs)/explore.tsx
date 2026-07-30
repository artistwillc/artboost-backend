import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ToolItem = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  status?: "available" | "coming";
  route?: string;
  tier?: "Starter" | "Pro" | "Business";
};

const marketingTools: ToolItem[] = [
  {
    title: "AI Title Generator",
    description:
      "Generate stronger titles for artwork, products, and listings.",
    icon: "text-outline",
    status: "coming",
    tier: "Starter",
  },
  {
    title: "AI Description Generator",
    description:
      "Create polished, SEO-friendly descriptions for your artwork.",
    icon: "document-text-outline",
    status: "coming",
    tier: "Starter",
  },
  {
    title: "AI Hashtag Generator",
    description:
      "Build platform-ready hashtag groups for every campaign.",
    icon: "pricetag-outline",
    status: "coming",
    tier: "Starter",
  },
  {
    title: "AI CTA Generator",
    description:
      "Create calls-to-action designed to increase clicks and sales.",
    icon: "megaphone-outline",
    status: "coming",
    tier: "Pro",
  },
];

const businessTools: ToolItem[] = [
  {
    title: "Art Pricing Calculator",
    description:
      "Estimate a selling price using costs, time, fees, and desired profit.",
    icon: "calculator-outline",
    status: "coming",
    tier: "Starter",
  },
  {
    title: "POD Profit Calculator",
    description:
      "Calculate profit margins for print-on-demand products.",
    icon: "cash-outline",
    status: "coming",
    tier: "Pro",
  },
  {
    title: "Collection Builder",
    description:
      "Organize related artwork into stronger collections and campaigns.",
    icon: "albums-outline",
    status: "coming",
    tier: "Pro",
  },
  {
    title: "AI Store Critique",
    description:
      "Review a store and identify opportunities to improve listings and sales.",
    icon: "storefront-outline",
    status: "coming",
    tier: "Business",
  },
];

const growthTools: ToolItem[] = [
  {
    title: "Trending Artwork Ideas",
    description:
      "Discover themes, subjects, and niches gaining attention.",
    icon: "trending-up-outline",
    status: "coming",
    tier: "Pro",
  },
  {
    title: "Holiday Marketing Calendar",
    description:
      "Plan campaigns around seasonal and holiday opportunities.",
    icon: "calendar-outline",
    status: "coming",
    tier: "Starter",
  },
  {
    title: "Opportunity Scanner",
    description:
      "Identify promising artwork categories and campaign opportunities.",
    icon: "scan-outline",
    status: "coming",
    tier: "Business",
  },
  {
    title: "AI Business Coach",
    description:
      "Receive recommendations based on artwork and campaign performance.",
    icon: "sparkles-outline",
    status: "coming",
    tier: "Business",
  },
];

export default function CreatorToolsScreen() {
  function openTool(item: ToolItem) {
    if (item.route) {
      router.push(item.route as any);
      return;
    }

    // Coming-soon tools remain visible without routing to unfinished screens.
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: "Creator Tools",
        }}
      />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() =>
              router.replace({
                pathname: "/(tabs)/index" as any,
              })
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#ffffff"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              ARTBOOST TOOLBOX
            </Text>

            <Text style={styles.headerTitle}>
              Creator Tools
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="construct-outline"
                size={30}
                color="#c4b5fd"
              />
            </View>

            <Text style={styles.heroTitle}>
              Tools built for artists
            </Text>

            <Text style={styles.heroText}>
              Create better listings, price your work, discover opportunities,
              and grow your creative business.
            </Text>
          </View>

          <ToolSection
            title="AI Marketing Tools"
            items={marketingTools}
            onPress={openTool}
          />

          <ToolSection
            title="Business Tools"
            items={businessTools}
            onPress={openTool}
          />

          <ToolSection
            title="Growth Tools"
            items={growthTools}
            onPress={openTool}
          />

          <View style={styles.footerCard}>
            <Ionicons
              name="rocket-outline"
              size={24}
              color="#86efac"
            />

            <View style={styles.footerTextWrap}>
              <Text style={styles.footerTitle}>
                More tools are coming
              </Text>

              <Text style={styles.footerText}>
                New creator and business tools will be added as ArtBoost grows.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function ToolSection({
  title,
  items,
  onPress,
}: {
  title: string;
  items: ToolItem[];
  onPress: (item: ToolItem) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {items.map((item) => (
        <Pressable
          key={item.title}
          style={styles.toolCard}
          onPress={() => onPress(item)}
        >
          <View style={styles.toolIconWrap}>
            <Ionicons
              name={item.icon}
              size={23}
              color="#c4b5fd"
            />
          </View>

          <View style={styles.toolContent}>
            <View style={styles.toolTitleRow}>
              <Text style={styles.toolTitle}>
                {item.title}
              </Text>

              {item.tier ? (
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>
                    {item.tier}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.toolDescription}>
              {item.description}
            </Text>
          </View>

          <View style={styles.statusWrap}>
            <Text style={styles.comingText}>
              SOON
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#101010",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
    paddingLeft: 14,
  },

  eyebrow: {
    color: "#8b5cf6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 3,
  },

  content: {
    padding: 20,
    paddingBottom: 48,
  },

  heroCard: {
    borderRadius: 22,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#4c3979",
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
  },

  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 14,
  },

  heroText: {
    color: "#aaa0ba",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },

  toolCard: {
    minHeight: 94,
    borderRadius: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  toolIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  toolContent: {
    flex: 1,
    paddingHorizontal: 13,
  },

  toolTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },

  toolTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  toolDescription: {
    color: "#939393",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  tierBadge: {
    borderRadius: 99,
    backgroundColor: "#3a2a61",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  tierBadgeText: {
    color: "#d8ccf4",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  statusWrap: {
    paddingLeft: 6,
  },

  comingText: {
    color: "#737373",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  footerCard: {
    borderRadius: 18,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  footerTextWrap: {
    flex: 1,
    paddingLeft: 12,
  },

  footerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  footerText: {
    color: "#9ed3b3",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});