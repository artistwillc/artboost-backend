import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BACKEND_URL =
  "https://artboost-ai.onrender.com";

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

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] =
    useState<AnalyticsData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  async function loadAnalytics() {
    try {
      setError("");

      const response = await fetch(
        `${BACKEND_URL}/analytics`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load analytics."
        );
      }

      setAnalytics({
        totalCampaigns:
          data.totalCampaigns || 0,
        scheduled: data.scheduled || 0,
        published: data.published || 0,
        failed: data.failed || 0,
        saved: data.saved || 0,
        ended: data.ended || 0,
        active: data.active || 0,
        paused: data.paused || 0,
        totalPosts: data.totalPosts || 0,
        successRate:
          data.successRate || 0,
        averagePostsPerCampaign:
          data.averagePostsPerCampaign || 0,
        pinterestPosts:
          data.pinterestPosts || 0,
        facebookPosts:
          data.facebookPosts || 0,
        instagramPosts:
          data.instagramPosts || 0,
        xPosts: data.xPosts || 0,
        upcoming: data.upcoming || null,
      });
    } catch (err: any) {
      setError(
        err.message ||
          "Something went wrong."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  function formatDate(value?: string) {
    if (!value) {
      return "No upcoming posts";
    }

    return new Date(value).toLocaleString(
      [],
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#8b5cf6"
          />

          <Text style={styles.loadingText}>
            Loading business analytics...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() =>
              router.replace({
                pathname:
                  "/(tabs)/pro" as any,
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
              BUSINESS PERFORMANCE
            </Text>

            <Text style={styles.headerTitle}>
              Analytics
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={
            styles.content
          }
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
            <Text style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>
            Business Performance
          </Text>

          <View style={styles.grid}>
            <StatCard
              label="Posts Published"
              value={analytics?.published || 0}
            />

            <StatCard
              label="Active Campaigns"
              value={analytics?.active || 0}
            />

            <StatCard
              label="Success Rate"
              value={`${analytics?.successRate || 0}%`}
            />

            <StatCard
              label="Total Posts"
              value={analytics?.totalPosts || 0}
            />
          </View>

          <Text style={styles.sectionTitle}>
            Platform Performance
          </Text>

          <View style={styles.platformList}>
            <PlatformCard
              name="Pinterest"
              icon="logo-pinterest"
              posts={
                analytics?.pinterestPosts || 0
              }
            />

            <PlatformCard
              name="Facebook"
              icon="logo-facebook"
              posts={
                analytics?.facebookPosts || 0
              }
            />

            <PlatformCard
              name="Instagram"
              icon="logo-instagram"
              posts={
                analytics?.instagramPosts || 0
              }
            />

            <PlatformCard
              name="X"
              icon="logo-twitter"
              posts={analytics?.xPosts || 0}
            />
          </View>

          <Text style={styles.sectionTitle}>
            Top Performers
          </Text>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>
              TOP ARTWORK
            </Text>

            <Text style={styles.insightTitle}>
              Not enough data yet
            </Text>

            <Text style={styles.insightText}>
              ArtBoost will identify your
              highest-performing artwork after
              engagement and click tracking are
              connected.
            </Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>
              BEST PLATFORM
            </Text>

            <Text style={styles.insightTitle}>
              {getBestPlatform(analytics)}
            </Text>

            <Text style={styles.insightText}>
              Based on published post volume.
              Reach, clicks, and engagement will
              improve this recommendation later.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>
            Growth Insights
          </Text>

          <View style={styles.growthCard}>
            <Ionicons
              name="sparkles-outline"
              size={25}
              color="#86efac"
            />

            <View style={styles.growthTextWrap}>
              <Text style={styles.growthTitle}>
                AI recommendations are coming
              </Text>

              <Text style={styles.growthText}>
                ArtBoost will use campaign and
                store performance to tell you
                what to market more and what to
                create next.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            Campaign Health
          </Text>

          <View style={styles.compactGrid}>
            <SmallStat
              label="Scheduled"
              value={analytics?.scheduled || 0}
            />

            <SmallStat
              label="Paused"
              value={analytics?.paused || 0}
            />

            <SmallStat
              label="Failed"
              value={analytics?.failed || 0}
            />

            <SmallStat
              label="Saved"
              value={analytics?.saved || 0}
            />
          </View>

          <View style={styles.upcomingCard}>
            <Text style={styles.upcomingLabel}>
              NEXT SCHEDULED POST
            </Text>

            <Text style={styles.upcomingTitle}>
              {analytics?.upcoming
                ? analytics.upcoming.title
                : "No upcoming campaign found"}
            </Text>

            <Text style={styles.upcomingText}>
              {analytics?.upcoming
                ? formatDate(
                    analytics.upcoming
                      .publish_at
                  )
                : "Create or schedule a campaign to see it here."}
            </Text>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function getBestPlatform(
  analytics: AnalyticsData | null
) {
  if (!analytics) {
    return "Not enough data yet";
  }

  const platforms = [
    {
      name: "Pinterest",
      value: analytics.pinterestPosts,
    },
    {
      name: "Facebook",
      value: analytics.facebookPosts,
    },
    {
      name: "Instagram",
      value: analytics.instagramPosts,
    },
    {
      name: "X",
      value: analytics.xPosts,
    },
  ];

  const best = [...platforms].sort(
    (a, b) => b.value - a.value
  )[0];

  return best.value > 0
    ? best.name
    : "Not enough data yet";
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>
        {value}
      </Text>

      <Text style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.smallStat}>
      <Text style={styles.smallStatValue}>
        {value}
      </Text>

      <Text style={styles.smallStatLabel}>
        {label}
      </Text>
    </View>
  );
}

function PlatformCard({
  name,
  icon,
  posts,
}: {
  name: string;
  icon: any;
  posts: number;
}) {
  return (
    <View style={styles.platformCard}>
      <View style={styles.platformIconWrap}>
        <Ionicons
          name={icon}
          size={22}
          color="#c4b5fd"
        />
      </View>

      <View style={styles.platformContent}>
        <Text style={styles.platformName}>
          {name}
        </Text>

        <Text style={styles.platformMetric}>
          {posts} published posts
        </Text>
      </View>

      <Text style={styles.platformValue}>
        {posts}
      </Text>
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

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101010",
  },

  loadingText: {
    color: "#ffffff",
    marginTop: 12,
  },

  error: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#3a1111",
    color: "#ffb4b4",
    marginBottom: 16,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 18,
    marginBottom: 12,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  statCard: {
    width: "48%",
    minHeight: 112,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 16,
    borderRadius: 18,
    justifyContent: "center",
  },

  statValue: {
    fontSize: 29,
    fontWeight: "900",
    color: "#ffffff",
  },

  statLabel: {
    color: "#999999",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },

  platformList: {
    gap: 10,
  },

  platformCard: {
    minHeight: 82,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  platformIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  platformContent: {
    flex: 1,
    paddingHorizontal: 13,
  },

  platformName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  platformMetric: {
    color: "#8f8f8f",
    fontSize: 11,
    marginTop: 4,
  },

  platformValue: {
    color: "#c4b5fd",
    fontSize: 22,
    fontWeight: "900",
  },

  insightCard: {
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
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
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  growthCard: {
    borderRadius: 18,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  growthTextWrap: {
    flex: 1,
    paddingLeft: 12,
  },

  growthTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  growthText: {
    color: "#9ed3b3",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  compactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  smallStat: {
    width: "48%",
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 13,
    justifyContent: "center",
  },

  smallStatValue: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
  },

  smallStatLabel: {
    color: "#8d8d8d",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },

  upcomingCard: {
    borderRadius: 18,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 17,
    marginTop: 20,
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
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});