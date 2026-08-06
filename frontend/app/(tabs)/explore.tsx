import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

type ToolTier = "Starter" | "Pro" | "Business";
type ToolStatus = "available" | "coming";
type ToolCategory = "AI Writing" | "Business" | "Growth";

type ToolItem = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tier: ToolTier;
  status: ToolStatus;
  category: ToolCategory;
  route?: string;
  details: string;
};

const TOOLS: ToolItem[] = [
  {
    id: "ai-title",
    title: "AI Title Generator",
    description: "Generate stronger titles for artwork, products, and listings.",
    icon: "text-outline",
    tier: "Starter",
    status: "available",
    route: `/creator-tools/ai-title`,
    category: "AI Writing",
    details:
      "Create concise, searchable title options for artwork, product listings, and social campaigns.",
  },
  {
    id: "ai-description",
    title: "AI Description Generator",
    description: "Create polished, SEO-friendly descriptions for your artwork.",
    icon: "document-text-outline",
    tier: "Starter",
    status: "available",
    route: `/creator-tools/ai-description`,
    category: "AI Writing",
    details:
      "Generate listing descriptions tailored to the artwork, audience, marketplace, and brand voice.",
  },
  {
    id: "ai-hashtag",
    title: "AI Hashtag Generator",
    description: "Build platform-ready hashtag groups for every campaign.",
    icon: "pricetag-outline",
    tier: "Starter",
    status: "available",
    route: `/creator-tools/ai-hashtag`,
    category: "AI Writing",
    details:
      "Build hashtag groups customized for Pinterest, Instagram, Facebook, X, and future platforms.",
  },
  {
    id: "ai-cta",
    title: "AI CTA Generator",
    description: "Create calls-to-action designed to increase clicks and sales.",
    icon: "megaphone-outline",
    tier: "Pro",
    status: "available",
    route: `/creator-tools/ai-cta`,
    category: "AI Writing",
    details:
      "Generate calls-to-action matched to the platform, campaign goal, and product destination.",
  },
  {
    id: "pricing",
    title: "Art Pricing Calculator",
    description: "Estimate a selling price using costs, time, fees, and desired profit.",
    icon: "calculator-outline",
    tier: "Starter",
    status: "available",
    route: `/creator-tools/pricing`,
    category: "Business",
    details:
      "Estimate a recommended selling price using materials, labor, overhead, marketplace fees, and target profit.",
  },
  {
    id: "pod-profit",
    title: "POD Profit Calculator",
    description: "Calculate profit margins for print-on-demand products.",
    icon: "cash-outline",
    tier: "Pro",
    status: "available",
    route: `/creator-tools/pod-profit`,
    category: "Business",
    details:
      "Compare retail price, production cost, marketplace fees, and estimated profit per sale.",
  },
  {
    id: "collection-builder",
    title: "Collection Builder",
    description: "Organize related artwork into stronger collections and campaigns.",
    icon: "albums-outline",
    tier: "Pro",
    status: "coming",
    category: "Business",
    details:
      "Group related artwork, identify gaps, and create collection themes for stronger marketing campaigns.",
  },
  {
    id: "store-critique",
    title: "AI Store Critique",
    description: "Review a store and identify opportunities to improve listings and sales.",
    icon: "storefront-outline",
    tier: "Business",
    status: "coming",
    category: "Business",
    details:
      "Review store presentation, product titles, descriptions, images, pricing, and merchandising opportunities.",
  },
  {
    id: "trending-ideas",
    title: "Trending Artwork Ideas",
    description: "Discover themes, subjects, and niches gaining attention.",
    icon: "trending-up-outline",
    tier: "Pro",
    status: "coming",
    category: "Growth",
    details:
      "Surface promising themes and niches using current demand signals and your existing catalog.",
  },
  {
    id: "holiday-calendar",
    title: "Holiday Marketing Calendar",
    description: "Plan campaigns around seasonal and holiday opportunities.",
    icon: "calendar-outline",
    tier: "Starter",
    status: "coming",
    category: "Growth",
    details:
      "Build a campaign calendar around major holidays, seasonal demand, and preparation deadlines.",
  },
  {
    id: "opportunity-scanner",
    title: "Opportunity Scanner",
    description: "Identify promising artwork categories and campaign opportunities.",
    icon: "scan-outline",
    tier: "Business",
    status: "coming",
    category: "Growth",
    details:
      "Compare your catalog, stores, campaigns, and performance data to identify underused opportunities.",
  },
  {
    id: "business-coach",
    title: "AI Business Coach",
    description: "Receive recommendations based on artwork and campaign performance.",
    icon: "sparkles-outline",
    tier: "Business",
    status: "coming",
    category: "Growth",
    details:
      "Turn campaign, store, and analytics data into clear recommendations and next actions.",
  },
];

const CATEGORY_ORDER: ToolCategory[] = ["AI Writing", "Business", "Growth"];

const CATEGORY_META: Record<
  ToolCategory,
  { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  "AI Writing": {
    title: "AI Writing Tools",
    subtitle: "Create stronger titles, descriptions, hashtags, and calls to action.",
    icon: "create-outline",
  },
  Business: {
    title: "Business Tools",
    subtitle: "Price products, improve stores, and organize your catalog.",
    icon: "briefcase-outline",
  },
  Growth: {
    title: "Growth Tools",
    subtitle: "Find opportunities, plan campaigns, and grow strategically.",
    icon: "trending-up-outline",
  },
};

export default function CreatorToolsScreen() {
  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return TOOLS;

    return TOOLS.filter(tool =>
      `${tool.title} ${tool.description} ${tool.category}`
        .toLowerCase()
        .includes(query)
    );
  }, [search]);

  const availableCount = TOOLS.filter(tool => tool.status === "available").length;
  const plannedCount = TOOLS.length - availableCount;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/(tabs)/index" as any,
      params: { openMore: "true" },
    });
  }

  function openTool(tool: ToolItem) {
    if (tool.status === "available" && tool.route) {
      router.push(tool.route as any);
      return;
    }

    setSelectedTool(tool);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={23} color="#ffffff" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>ARTBOOST TOOLBOX</Text>
            <Text style={styles.headerTitle}>Creator Tools</Text>
            <Text style={styles.headerSubtitle}>
              Build, market, price, and grow your creative business.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="construct-outline" size={29} color="#ffffff" />
              </View>

              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitle}>Tools built for artists</Text>
                <Text style={styles.heroText}>
                  Everything you need to create better listings, price your work,
                  discover opportunities, and grow your business.
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <SummaryItem value={TOOLS.length} label="Total tools" />
              <View style={styles.summaryDivider} />
              <SummaryItem value={availableCount} label="Ready" />
              <View style={styles.summaryDivider} />
              <SummaryItem value={plannedCount} label="Planned" />
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={20} color="#8f8f8f" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search creator tools"
              placeholderTextColor="#777777"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {search ? (
              <Pressable onPress={() => setSearch("")} style={styles.clearSearchButton}>
                <Ionicons name="close-circle" size={20} color="#8f8f8f" />
              </Pressable>
            ) : null}
          </View>

          {CATEGORY_ORDER.map(category => {
            const items = filteredTools.filter(tool => tool.category === category);
            if (items.length === 0) return null;

            const meta = CATEGORY_META[category];

            return (
              <View key={category} style={styles.section}>
                <View style={styles.sectionHeadingRow}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name={meta.icon} size={20} color="#c4b5fd" />
                  </View>

                  <View style={styles.sectionHeadingText}>
                    <Text style={styles.sectionTitle}>{meta.title}</Text>
                    <Text style={styles.sectionSubtitle}>{meta.subtitle}</Text>
                  </View>
                </View>

                {items.map(item => (
                  <ToolCard key={item.id} item={item} onPress={() => openTool(item)} />
                ))}
              </View>
            );
          })}

          {filteredTools.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="search-outline" size={32} color="#8b5cf6" />
              <Text style={styles.emptyTitle}>No tools found</Text>
              <Text style={styles.emptyText}>
                Try another search term or clear the search field.
              </Text>
            </View>
          ) : null}

          <View style={styles.footerCard}>
            <Ionicons name="rocket-outline" size={24} color="#86efac" />

            <View style={styles.footerTextWrap}>
              <Text style={styles.footerTitle}>More tools are coming</Text>
              <Text style={styles.footerText}>
                New creator and business tools will appear here as ArtBoost grows.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={Boolean(selectedTool)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTool(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedTool(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                {selectedTool ? (
                  <>
                    <View style={styles.modalIconWrap}>
                      <Ionicons
                        name={selectedTool.icon}
                        size={28}
                        color="#ffffff"
                      />
                    </View>

                    <Text style={styles.modalTitle}>{selectedTool.title}</Text>

                    <View style={styles.modalBadgeRow}>
                      <TierBadge tier={selectedTool.tier} />
                      <StatusBadge status={selectedTool.status} />
                    </View>

                    <Text style={styles.modalDescription}>{selectedTool.details}</Text>

                    <View style={styles.modalNotice}>
                      <Ionicons
                        name="information-circle-outline"
                        size={20}
                        color="#c4b5fd"
                      />
                      <Text style={styles.modalNoticeText}>
                        This tool is visible in the launch roadmap, but its working screen
                        and backend workflow still need to be completed before it can be
                        marked Ready.
                      </Text>
                    </View>

                    <Pressable
                      style={styles.modalCloseButton}
                      onPress={() => setSelectedTool(null)}
                    >
                      <Text style={styles.modalCloseText}>Close</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function ToolCard({ item, onPress }: { item: ToolItem; onPress: () => void }) {
  const ready = item.status === "available";

  return (
    <Pressable
      style={({ pressed }) => [styles.toolCard, pressed && styles.toolCardPressed]}
      onPress={onPress}
    >
      <View style={styles.toolIconWrap}>
        <Ionicons name={item.icon} size={23} color="#c4b5fd" />
      </View>

      <View style={styles.toolContent}>
        <View style={styles.toolTitleRow}>
          <Text style={styles.toolTitle}>{item.title}</Text>
          <TierBadge tier={item.tier} />
        </View>

        <Text style={styles.toolDescription}>{item.description}</Text>
      </View>

      <View style={styles.toolStatusColumn}>
        <View
          style={[
            styles.statusDot,
            ready ? styles.readyDot : styles.comingDot,
          ]}
        />
        <Text style={[styles.statusText, ready && styles.readyStatusText]}>
          {ready ? "READY" : "PLANNED"}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#777777" />
      </View>
    </Pressable>
  );
}

function TierBadge({ tier }: { tier: ToolTier }) {
  return (
    <View style={styles.tierBadge}>
      <Text style={styles.tierBadgeText}>{tier}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: ToolStatus }) {
  const ready = status === "available";

  return (
    <View style={[styles.statusBadge, ready ? styles.readyBadge : styles.plannedBadge]}>
      <Text style={styles.statusBadgeText}>{ready ? "Ready" : "Planned"}</Text>
    </View>
  );
}

function SummaryItem({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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
  headerSubtitle: {
    color: "#8f8f8f",
    fontSize: 11,
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
    padding: 18,
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    paddingLeft: 14,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  heroText: {
    color: "#aaa0ba",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  summaryRow: {
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#3c2d63",
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#9c91ad",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#4c3979",
  },
  searchWrap: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  clearSearchButton: {
    padding: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeadingText: {
    flex: 1,
    paddingLeft: 11,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "#858585",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  toolCard: {
    minHeight: 98,
    borderRadius: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  toolCardPressed: {
    opacity: 0.78,
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
    flexShrink: 1,
  },
  toolDescription: {
    color: "#939393",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  toolStatusColumn: {
    width: 58,
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  readyDot: {
    backgroundColor: "#22c55e",
  },
  comingDot: {
    backgroundColor: "#8b5cf6",
  },
  statusText: {
    color: "#8d7bb5",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  readyStatusText: {
    color: "#86efac",
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
  statusBadge: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readyBadge: {
    backgroundColor: "#164e2f",
  },
  plannedBadge: {
    backgroundColor: "#3a2a61",
  },
  statusBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 10,
  },
  emptyText: {
    color: "#8d8d8d",
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 22,
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#3a2f4f",
    padding: 22,
  },
  modalIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
  },
  modalBadgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  modalDescription: {
    color: "#b4b4b4",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 16,
  },
  modalNotice: {
    borderRadius: 15,
    backgroundColor: "#221b31",
    borderWidth: 1,
    borderColor: "#4c3979",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 18,
  },
  modalNoticeText: {
    flex: 1,
    color: "#b8accd",
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 9,
  },
  modalCloseButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  modalCloseText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
