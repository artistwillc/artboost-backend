import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

type Campaign = {
  id: string;
  userId?: string | null;
  platform?: string;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  productLink?: string | null;
  boardId?: string | null;
  publishAt?: string | null;
  status?: string;
  publishedAt?: string | null;
  error?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  campaignStatus?: string | null;
  endedAt?: string | null;
  repeatType?: string | null;
  nextRunAt?: string | null;
  repeatUntil?: string | null;
};

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Published", value: "published" },
  { label: "Failed", value: "failed" },
  { label: "Paused", value: "paused" },
  { label: "Saved", value: "saved" },
  { label: "Ended", value: "ended" },
];

export default function CampaignHistoryScreen() {
  const [session, setSession] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState<Campaign[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    loadSessionAndCampaigns();
  }, []);

  useEffect(() => {
    applyFilter(activeFilter, campaigns);
  }, [activeFilter, campaigns]);

  async function loadSessionAndCampaigns() {
    try {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await loadCampaigns(data.session?.user?.id || "");
    } catch (error: any) {
      Alert.alert(
        "Load Error",
        error?.message || "Failed to load campaign history."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadCampaigns(userId?: string) {
    const url = userId
      ? `${BACKEND_URL}/scheduled-campaigns?userId=${encodeURIComponent(
          userId
        )}`
      : `${BACKEND_URL}/scheduled-campaigns`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load scheduled campaigns.");
    }

    setCampaigns(data.campaigns || []);
  }

  function applyFilter(filter: string, list: Campaign[]) {
    if (filter === "all") {
      setFilteredCampaigns(list);
      return;
    }

    const filtered = list.filter((campaign) => {
      if (filter === "paused") {
        return campaign.campaignStatus === "paused" || campaign.status === "paused";
      }

      if (filter === "saved") {
        return campaign.campaignStatus === "saved" || campaign.status === "saved";
      }

      if (filter === "ended") {
        return campaign.campaignStatus === "ended" || campaign.status === "ended";
      }

      return campaign.status === filter;
    });

    setFilteredCampaigns(filtered);
  }

  function formatDate(value?: string | null) {
    if (!value) return "Not set";

    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getStatusLabel(campaign: Campaign) {
    if (campaign.campaignStatus === "paused") return "Paused";
    if (campaign.campaignStatus === "saved") return "Saved";
    if (campaign.status === "scheduled") return "Scheduled";
    if (campaign.status === "published") return "Published";
    if (campaign.status === "failed") return "Failed";
    if (campaign.status === "publishing") return "Publishing";
    if (campaign.status === "ended") return "Ended";
    return campaign.status || "Unknown";
  }

  function getStatusStyle(campaign: Campaign) {
    const label = getStatusLabel(campaign).toLowerCase();

    if (label === "published") return styles.statusPublished;
    if (label === "failed") return styles.statusFailed;
    if (label === "paused") return styles.statusPaused;
    if (label === "saved") return styles.statusSaved;
    if (label === "ended") return styles.statusEnded;

    return styles.statusScheduled;
  }

  async function refresh() {
    setRefreshing(true);
    await loadSessionAndCampaigns();
  }

  async function updateCampaignLifecycle(
    campaign: Campaign,
    campaignStatus: "active" | "paused" | "ended" | "saved"
  ) {
    try {
      setActionLoadingId(campaign.id);

      const response = await fetch(
        `${BACKEND_URL}/scheduled-campaigns/${campaign.id}/lifecycle`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session?.user?.id || campaign.userId || null,
            campaignStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update campaign.");
      }

      await loadCampaigns(session?.user?.id || "");

      Alert.alert(
        "Campaign Updated",
        `Campaign status changed to ${campaignStatus}.`
      );
    } catch (error: any) {
      Alert.alert(
        "Update Failed",
        error?.message || "Unable to update this campaign."
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    Alert.alert(
      "Delete Campaign",
      "Are you sure you want to delete this campaign?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoadingId(campaign.id);

              const userId = session?.user?.id || campaign.userId || "";
              const url = userId
                ? `${BACKEND_URL}/scheduled-campaigns/${campaign.id}?userId=${encodeURIComponent(
                    userId
                  )}`
                : `${BACKEND_URL}/scheduled-campaigns/${campaign.id}`;

              const response = await fetch(url, {
                method: "DELETE",
              });

              const data = await response.json();

              if (!response.ok) {
                throw new Error(data.error || "Failed to delete campaign.");
              }

              setCampaigns(data.campaigns || []);
              Alert.alert("Deleted", "Campaign deleted successfully.");
            } catch (error: any) {
              Alert.alert(
                "Delete Failed",
                error?.message || "Unable to delete this campaign."
              );
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  }

  function renderControls(campaign: Campaign) {
    const isBusy = actionLoadingId === campaign.id;
    const status = getStatusLabel(campaign).toLowerCase();

    return (
      <View style={styles.controlsRow}>
        {status !== "paused" && status !== "published" && status !== "ended" ? (
          <Pressable
            style={[styles.controlButton, styles.pauseButton]}
            disabled={isBusy}
            onPress={() => updateCampaignLifecycle(campaign, "paused")}
          >
            <Text style={styles.controlText}>{isBusy ? "..." : "Pause"}</Text>
          </Pressable>
        ) : null}

        {status === "paused" ? (
          <Pressable
            style={[styles.controlButton, styles.resumeButton]}
            disabled={isBusy}
            onPress={() => updateCampaignLifecycle(campaign, "active")}
          >
            <Text style={styles.controlText}>{isBusy ? "..." : "Resume"}</Text>
          </Pressable>
        ) : null}

        {status !== "ended" && status !== "published" ? (
          <Pressable
            style={[styles.controlButton, styles.endButton]}
            disabled={isBusy}
            onPress={() => updateCampaignLifecycle(campaign, "ended")}
          >
            <Text style={styles.controlText}>{isBusy ? "..." : "End"}</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.controlButton, styles.deleteButton]}
          disabled={isBusy}
          onPress={() => deleteCampaign(campaign)}
        >
          <Text style={styles.controlText}>{isBusy ? "..." : "Delete"}</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading campaign history...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Text style={styles.title}>Campaign History</Text>
      <Text style={styles.subtitle}>
        Review and manage scheduled, published, saved, paused, and failed
        ArtBoost campaigns.
      </Text>

      <View style={styles.summaryRow}>
        <SummaryCard label="Total" value={campaigns.length} />
        <SummaryCard
          label="Scheduled"
          value={campaigns.filter((item) => item.status === "scheduled").length}
        />
        <SummaryCard
          label="Published"
          value={campaigns.filter((item) => item.status === "published").length}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
      >
        {FILTERS.map((filter) => (
          <Pressable
            key={filter.value}
            style={[
              styles.filterButton,
              activeFilter === filter.value && styles.filterButtonActive,
            ]}
            onPress={() => setActiveFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === filter.value && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filteredCampaigns.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No campaigns found</Text>
          <Text style={styles.emptyText}>
            Campaigns will appear here after you schedule, save, publish, pause,
            or end them.
          </Text>
        </View>
      ) : (
        filteredCampaigns.map((campaign) => (
          <View key={campaign.id} style={styles.card}>
            {campaign.imageUrl ? (
              <Image source={{ uri: campaign.imageUrl }} style={styles.image} />
            ) : null}

            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {campaign.title || "Untitled Campaign"}
              </Text>

              <View style={[styles.statusBadge, getStatusStyle(campaign)]}>
                <Text style={styles.statusText}>
                  {getStatusLabel(campaign)}
                </Text>
              </View>
            </View>

            <Text style={styles.metaText}>
              Platform: {campaign.platform || "Unknown"}
            </Text>

            <Text style={styles.metaText}>
              Publish At: {formatDate(campaign.publishAt)}
            </Text>

            {campaign.publishedAt ? (
              <Text style={styles.metaText}>
                Published: {formatDate(campaign.publishedAt)}
              </Text>
            ) : null}

            {campaign.repeatType && campaign.repeatType !== "one_time" ? (
              <Text style={styles.metaText}>Repeat: {campaign.repeatType}</Text>
            ) : null}

            {campaign.error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Error</Text>
                <Text style={styles.errorText}>{campaign.error}</Text>
              </View>
            ) : null}

            {campaign.description ? (
              <Text style={styles.description} numberOfLines={4}>
                {campaign.description}
              </Text>
            ) : null}

            {renderControls(campaign)}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
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
  container: {
    padding: 20,
    paddingBottom: 110,
  },
  center: {
    flex: 1,
    backgroundColor: "#101010",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#ffffff",
    marginTop: 12,
    fontWeight: "700",
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 28,
    marginBottom: 6,
  },
  subtitle: {
    color: "#b8b8b8",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2d2d2d",
  },
  summaryValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  summaryLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "700",
  },
  filterScroll: {
    marginBottom: 18,
  },
  filterButton: {
    backgroundColor: "#202020",
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  filterButtonActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  filterText: {
    color: "#aaa",
    fontWeight: "800",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  emptyBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#2d2d2d",
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyText: {
    color: "#aaa",
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d2d2d",
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    backgroundColor: "#222",
    resizeMode: "cover",
    marginBottom: 14,
  },
  cardHeader: {
    gap: 10,
    marginBottom: 10,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 24,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  statusScheduled: {
    backgroundColor: "#2563eb",
  },
  statusPublished: {
    backgroundColor: "#12a86b",
  },
  statusFailed: {
    backgroundColor: "#b91c1c",
  },
  statusPaused: {
    backgroundColor: "#f59e0b",
  },
  statusSaved: {
    backgroundColor: "#8b5cf6",
  },
  statusEnded: {
    backgroundColor: "#555",
  },
  statusText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metaText: {
    color: "#cfcfcf",
    fontSize: 14,
    marginBottom: 5,
  },
  description: {
    color: "#e6e6e6",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  errorBox: {
    backgroundColor: "#3A1111",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  errorTitle: {
    color: "#ffb4b4",
    fontWeight: "900",
    marginBottom: 4,
  },
  errorText: {
    color: "#ffd6d6",
    lineHeight: 20,
  },
  controlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  controlButton: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  pauseButton: {
    backgroundColor: "#f59e0b",
  },
  resumeButton: {
    backgroundColor: "#12a86b",
  },
  endButton: {
    backgroundColor: "#555",
  },
  deleteButton: {
    backgroundColor: "#b91c1c",
  },
  controlText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 13,
  },
});