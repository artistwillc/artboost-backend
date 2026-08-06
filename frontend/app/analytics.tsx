import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BACKEND_URL = "https://artboost-ai.onrender.com";

type AnalyticsData = {
  totalCampaigns: number;
  scheduled: number;
  published: number;
  failed: number;
  saved: number;
  ended: number;
  active: number;
  paused: number;
  totalPosts: number;
  successRate: number;
  averagePostsPerCampaign: number;
  pinterestPosts: number;
  facebookPosts: number;
  instagramPosts: number;
  xPosts: number;
  upcoming: any | null;
};

type PlatformSummary = {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  posts: number;
};

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadAnalytics() {
    try {
      setError("");

      const response = await fetch(`${BACKEND_URL}/analytics`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load analytics.");
      }

      setAnalytics({
        totalCampaigns: Number(data.totalCampaigns) || 0,
        scheduled: Number(data.scheduled) || 0,
        published: Number(data.published) || 0,
        failed: Number(data.failed) || 0,
        saved: Number(data.saved) || 0,
        ended: Number(data.ended) || 0,
        active: Number(data.active) || 0,
        paused: Number(data.paused) || 0,
        totalPosts: Number(data.totalPosts) || 0,
        successRate: Number(data.successRate) || 0,
        averagePostsPerCampaign:
          Number(data.averagePostsPerCampaign) || 0,
        pinterestPosts: Number(data.pinterestPosts) || 0,
        facebookPosts: Number(data.facebookPosts) || 0,
        instagramPosts: Number(data.instagramPosts) || 0,
        xPosts: Number(data.xPosts) || 0,
        upcoming: data.upcoming || null,
      });
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const platforms = useMemo<PlatformSummary[]>(
    () => [
      {
        name: "Pinterest",
        icon: "logo-pinterest",
        posts: analytics?.pinterestPosts || 0,
      },
      {
        name: "Facebook",
        icon: "logo-facebook",
        posts: analytics?.facebookPosts || 0,
      },
      {
        name: "Instagram",
        icon: "logo-instagram",
        posts: analytics?.instagramPosts || 0,
      },
      {
        name: "X",
        icon: "logo-twitter",
        posts: analytics?.xPosts || 0,
      },
    ],
    [analytics]
  );

  const highestPlatformPostCount = Math.max(
    1,
    ...platforms.map((platform) => platform.posts)
  );

  const bestPlatform = useMemo(() => {
    const best = [...platforms].sort((a, b) => b.posts - a.posts)[0];
    return best?.posts > 0 ? best.name : "Waiting for more data";
  }, [platforms]);

  function formatDate(value?: string) {
    if (!value) {
      return "No upcoming campaigns";
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "Schedule unavailable";
    }

    return parsed.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/pro" as any);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingTitle}>Loading Analytics</Text>
          <Text style={styles.loadingText}>
            Gathering your latest campaign performance.
          </Text>
        </View>
      </>
    );
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
            <Text style={styles.headerTitle}>Analytics</Text>
            <Text style={styles.headerSubtitle}>
              Your business performance at a glance.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadAnalytics();
              }}
              tintColor="#8b5cf6"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={22}
                color="#fca5a5"
              />
              <View style={styles.errorTextWrap}>
                <Text style={styles.errorTitle}>Analytics unavailable</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
              <Pressable style={styles.retryButton} onPress={loadAnalytics}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Business Performance</Text>

          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroEyebrow}>POSTS PUBLISHED</Text>
                <Text style={styles.heroValue}>
                  {analytics?.published || 0}
                </Text>
              </View>

              <View style={styles.successBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#86efac"
                />
                <Text style={styles.successBadgeText}>
                  {analytics?.successRate || 0}% success
                </Text>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricsRow}>
              <HeroMetric
                icon="flash-outline"
                value={analytics?.active || 0}
                label="Active"
              />
              <HeroMetric
                icon="calendar-outline"
                value={analytics?.scheduled || 0}
                label="Scheduled"
              />
              <HeroMetric
                icon="layers-outline"
                value={analytics?.totalCampaigns || 0}
                label="Campaigns"
              />
            </View>
          </View>

          <View style={styles.miniGrid}>
            <MiniMetricCard
              icon="paper-plane-outline"
              label="Total Posts"
              value={analytics?.totalPosts || 0}
            />
            <MiniMetricCard
              icon="analytics-outline"
              label="Avg. per Campaign"
              value={formatAverage(
                analytics?.averagePostsPerCampaign || 0
              )}
            />
          </View>

          <Text style={styles.sectionTitle}>Platform Performance</Text>

          <View style={styles.platformCardList}>
            {platforms.map((platform) => (
              <PlatformPerformanceCard
                key={platform.name}
                platform={platform}
                maxPosts={highestPlatformPostCount}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Top Performers</Text>

          <View style={styles.insightGrid}>
            <InsightCard
              icon="images-outline"
              eyebrow="TOP ARTWORK"
              title="Waiting for more data"
              description="ArtBoost will identify your top artwork after engagement and click tracking are connected."
            />

            <InsightCard
              icon="trophy-outline"
              eyebrow="BEST PLATFORM"
              title={bestPlatform}
              description="Currently based on published post volume. Engagement and click data will improve this recommendation."
            />
          </View>

          <Text style={styles.sectionTitle}>AI Business Coach</Text>

          <View style={styles.coachCard}>
            <View style={styles.coachIconWrap}>
              <Ionicons name="sparkles" size={24} color="#86efac" />
            </View>

            <View style={styles.coachContent}>
              <Text style={styles.coachTitle}>
                Keep publishing to unlock recommendations
              </Text>

              <Text style={styles.coachText}>
                ArtBoost will use your campaign and store performance to
                identify the best platforms, posting times, stores, and
                artwork opportunities.
              </Text>

              <View style={styles.coachFeatureList}>
                <CoachFeature label="Best posting times" />
                <CoachFeature label="Top-performing platforms" />
                <CoachFeature label="Artwork and store opportunities" />
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Campaign Health</Text>

          <View style={styles.healthGrid}>
            <HealthCard
              label="Scheduled"
              value={analytics?.scheduled || 0}
              icon="calendar-outline"
              tone="blue"
            />
            <HealthCard
              label="Paused"
              value={analytics?.paused || 0}
              icon="pause-circle-outline"
              tone="yellow"
            />
            <HealthCard
              label="Failed"
              value={analytics?.failed || 0}
              icon="alert-circle-outline"
              tone="red"
            />
            <HealthCard
              label="Saved"
              value={analytics?.saved || 0}
              icon="bookmark-outline"
              tone="purple"
            />
          </View>

          <View style={styles.upcomingCard}>
            <View style={styles.upcomingIconWrap}>
              <Ionicons name="time-outline" size={24} color="#c4b5fd" />
            </View>

            <View style={styles.upcomingContent}>
              <Text style={styles.upcomingLabel}>NEXT SCHEDULED CAMPAIGN</Text>
              <Text style={styles.upcomingTitle}>
                {analytics?.upcoming
                  ? analytics.upcoming.title || "Scheduled Campaign"
                  : "No upcoming campaign"}
              </Text>
              <Text style={styles.upcomingText}>
                {analytics?.upcoming
                  ? formatDate(
                      analytics.upcoming.publish_at ||
                        analytics.upcoming.publishAt
                    )
                  : "Create or schedule a campaign to see it here."}
              </Text>

              {analytics?.upcoming?.platform ? (
                <View style={styles.upcomingPlatformBadge}>
                  <Text style={styles.upcomingPlatformText}>
                    {String(analytics.upcoming.platform)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function formatAverage(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function HeroMetric({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.heroMetric}>
      <Ionicons name={icon} size={18} color="#c4b5fd" />
      <Text style={styles.heroMetricValue}>{value}</Text>
      <Text style={styles.heroMetricLabel}>{label}</Text>
    </View>
  );
}

function MiniMetricCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.miniMetricCard}>
      <View style={styles.miniMetricIconWrap}>
        <Ionicons name={icon} size={20} color="#c4b5fd" />
      </View>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function PlatformPerformanceCard({
  platform,
  maxPosts,
}: {
  platform: PlatformSummary;
  maxPosts: number;
}) {
  const widthPercent =
    platform.posts > 0
      ? Math.max(8, Math.round((platform.posts / maxPosts) * 100))
      : 0;

  return (
    <View style={styles.platformCard}>
      <View style={styles.platformTopRow}>
        <View style={styles.platformIdentity}>
          <View style={styles.platformIconWrap}>
            <Ionicons
              name={platform.icon}
              size={21}
              color="#c4b5fd"
            />
          </View>

          <View>
            <Text style={styles.platformName}>{platform.name}</Text>
            <Text style={styles.platformMetric}>
              {platform.posts} published {platform.posts === 1 ? "post" : "posts"}
            </Text>
          </View>
        </View>

        <Text style={styles.platformValue}>{platform.posts}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${widthPercent}%` as any },
          ]}
        />
      </View>
    </View>
  );
}

function InsightCard({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIconWrap}>
        <Ionicons name={icon} size={21} color="#c4b5fd" />
      </View>
      <Text style={styles.insightLabel}>{eyebrow}</Text>
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightText}>{description}</Text>
    </View>
  );
}

function CoachFeature({ label }: { label: string }) {
  return (
    <View style={styles.coachFeatureRow}>
      <Ionicons name="checkmark-circle" size={16} color="#86efac" />
      <Text style={styles.coachFeatureText}>{label}</Text>
    </View>
  );
}

type HealthTone = "blue" | "yellow" | "red" | "purple";

function HealthCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: HealthTone;
}) {
  const toneStyles = {
    blue: styles.healthBlue,
    yellow: styles.healthYellow,
    red: styles.healthRed,
    purple: styles.healthPurple,
  };

  const iconColors: Record<HealthTone, string> = {
    blue: "#93c5fd",
    yellow: "#fde68a",
    red: "#fca5a5",
    purple: "#c4b5fd",
  };

  return (
    <View style={[styles.healthCard, toneStyles[tone]]}>
      <Ionicons name={icon} size={21} color={iconColors[tone]} />
      <Text style={styles.healthValue}>{value}</Text>
      <Text style={styles.healthLabel}>{label}</Text>
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
    borderRadius: 22,
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

  headerTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#929292",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  content: {
    padding: 20,
    paddingBottom: 56,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101010",
    paddingHorizontal: 30,
  },

  loadingTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 15,
  },

  loadingText: {
    color: "#8f8f8f",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },

  errorCard: {
    backgroundColor: "#301717",
    borderWidth: 1,
    borderColor: "#653131",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  errorTextWrap: {
    flex: 1,
    paddingHorizontal: 11,
  },

  errorTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  errorText: {
    color: "#fca5a5",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  retryButton: {
    backgroundColor: "#a62828",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 18,
    marginBottom: 12,
  },

  heroCard: {
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#4b3478",
    borderRadius: 22,
    padding: 18,
  },

  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  heroEyebrow: {
    color: "#a78bfa",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  heroValue: {
    color: "#ffffff",
    fontSize: 46,
    lineHeight: 52,
    fontWeight: "900",
    marginTop: 4,
  },

  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#173426",
    borderWidth: 1,
    borderColor: "#28533d",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  successBadgeText: {
    color: "#bbf7d0",
    fontSize: 10,
    fontWeight: "900",
  },

  heroDivider: {
    height: 1,
    backgroundColor: "#44375b",
    marginVertical: 16,
  },

  heroMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  heroMetric: {
    flex: 1,
    alignItems: "center",
  },

  heroMetricValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6,
  },

  heroMetricLabel: {
    color: "#aaa0ba",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },

  miniGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  miniMetricCard: {
    flex: 1,
    minHeight: 108,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 18,
    padding: 15,
  },

  miniMetricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  miniMetricValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 9,
  },

  miniMetricLabel: {
    color: "#8f8f8f",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  platformCardList: {
    gap: 10,
  },

  platformCard: {
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 18,
    padding: 14,
  },

  platformTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  platformIdentity: {
    flexDirection: "row",
    alignItems: "center",
  },

  platformIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  platformName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  platformMetric: {
    color: "#8f8f8f",
    fontSize: 10,
    marginTop: 3,
  },

  platformValue: {
    color: "#c4b5fd",
    fontSize: 21,
    fontWeight: "900",
  },

  progressTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: "#2d2d2d",
    marginTop: 13,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#8b5cf6",
  },

  insightGrid: {
    gap: 10,
  },

  insightCard: {
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 18,
    padding: 16,
  },

  insightIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  insightLabel: {
    color: "#8b5cf6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  insightTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 7,
  },

  insightText: {
    color: "#999999",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },

  coachCard: {
    borderRadius: 20,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 17,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  coachIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#1d3b2b",
    alignItems: "center",
    justifyContent: "center",
  },

  coachContent: {
    flex: 1,
    paddingLeft: 13,
  },

  coachTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  coachText: {
    color: "#9ed3b3",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  coachFeatureList: {
    marginTop: 11,
    gap: 7,
  },

  coachFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  coachFeatureText: {
    color: "#d1fae5",
    fontSize: 10,
    fontWeight: "700",
  },

  healthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  healthCard: {
    width: "48%",
    minHeight: 104,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },

  healthBlue: {
    backgroundColor: "#17243a",
    borderColor: "#294973",
  },

  healthYellow: {
    backgroundColor: "#332b16",
    borderColor: "#635329",
  },

  healthRed: {
    backgroundColor: "#331919",
    borderColor: "#683333",
  },

  healthPurple: {
    backgroundColor: "#251b3a",
    borderColor: "#49356f",
  },

  healthValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 9,
  },

  healthLabel: {
    color: "#b4b4b4",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  upcomingCard: {
    borderRadius: 20,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 17,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  upcomingIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  upcomingContent: {
    flex: 1,
    paddingLeft: 13,
  },

  upcomingLabel: {
    color: "#a78bfa",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  upcomingTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 7,
  },

  upcomingText: {
    color: "#aaa0ba",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  upcomingPlatformBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#8b5cf6",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },

  upcomingPlatformText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
});
