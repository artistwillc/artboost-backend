import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

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
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type PlatformMetrics = {
  successfulPosts: number;
  failedPosts: number;
  totalAttempts: number;
};

type AnalyticsData = {
  postsPublished: number;
  totalPostAttempts: number;
  failedPostAttempts: number;
  successRate: number;

  activeAutomations: number;
  pausedAutomations: number;
  totalAutomations: number;

  automationRuns: {
    successful: number;
    partial: number;
    failed: number;
    skipped: number;
    total: number;
  };

  automationHealth: {
    currentNeedsAttention: number;
    historicalFailedRuns: number;
  };

  campaigns: {
    total: number;
    scheduled: number;
    failed: number;
    published: number;
    saved: number;
  };

  platformBreakdown: Record<
    string,
    PlatformMetrics
  >;

  topArtwork:
    | {
        title: string;
        confirmedPosts: number;
      }
    | null;

  bestPlatform:
    | {
        platform: string;
        successfulPosts: number;
        failedPosts: number;
        totalAttempts: number;
      }
    | null;

  upcoming:
    | {
        type: "campaign" | "automation";
        title: string;
        platform?: string;
        storeName?: string;
        platforms?: string[];
        scheduledAt: string;
      }
    | null;

  performanceTracking: {
    engagementAvailable: boolean;
    clicksAvailable: boolean;
    conversionsAvailable: boolean;
    engagement: number | null;
    clicks: number | null;
    conversions: number | null;
  };

  insight: string;
  generatedAt: string;
};

const PLATFORM_ORDER = [
  {
    key: "pinterest",
    name: "Pinterest",
    icon: "logo-pinterest",
  },
  {
    key: "facebook",
    name: "Facebook",
    icon: "logo-facebook",
  },
  {
    key: "instagram",
    name: "Instagram",
    icon: "logo-instagram",
  },
  {
    key: "x",
    name: "X",
    icon: "logo-twitter",
  },
  {
    key: "threads",
    name: "Threads",
    icon: "at-outline",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    icon: "logo-linkedin",
  },
  {
    key: "tiktok",
    name: "TikTok",
    icon: "musical-notes-outline",
  },
];

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

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData?.session?.access_token
      ) {
        throw new Error(
          "Please sign in again to load Analytics."
        );
      }

      const response = await fetch(
        `${BACKEND_URL}/analytics`,
        {
          headers: {
            Authorization:
              `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load analytics."
        );
      }

      setAnalytics(data);
    } catch (err: any) {
      setError(
        err?.message ||
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

  function formatDate(
    value?: string
  ) {
    if (!value) {
      return "No upcoming posts";
    }

    return new Date(
      value
    ).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatPlatform(
    value?: string
  ) {
    const normalized =
      String(value || "")
        .trim()
        .toLowerCase();

    if (normalized === "x") {
      return "X";
    }

    if (
      normalized === "linkedin"
    ) {
      return "LinkedIn";
    }

    if (
      normalized === "tiktok"
    ) {
      return "TikTok";
    }

    if (!normalized) {
      return "";
    }

    return (
      normalized
        .charAt(0)
        .toUpperCase() +
      normalized.slice(1)
    );
  }

  function getUpcomingDetails() {
    if (!analytics?.upcoming) {
      return "No upcoming campaign or automation found.";
    }

    const upcoming =
      analytics.upcoming;

    if (
      upcoming.type ===
      "automation"
    ) {
      const platforms =
        Array.isArray(
          upcoming.platforms
        )
          ? upcoming.platforms
              .map(
                formatPlatform
              )
              .filter(Boolean)
              .join(", ")
          : "";

      return [
        upcoming.storeName
          ? `Store: ${upcoming.storeName}`
          : "",
        platforms
          ? `Platforms: ${platforms}`
          : "",
        formatDate(
          upcoming.scheduledAt
        ),
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      upcoming.platform
        ? `Platform: ${formatPlatform(
            upcoming.platform
          )}`
        : "",
      formatDate(
        upcoming.scheduledAt
      ),
    ]
      .filter(Boolean)
      .join("\n");
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

          <Text
            style={
              styles.loadingText
            }
          >
            Loading real analytics...
          </Text>
        </View>
      </>
    );
  }

  const tracking =
    analytics?.performanceTracking;

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
            style={
              styles.backButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#ffffff"
            />
          </Pressable>

          <View
            style={
              styles.headerTextWrap
            }
          >
            <Text
              style={styles.eyebrow}
            >
              BUSINESS PERFORMANCE
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
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
              refreshing={
                refreshing
              }
              onRefresh={() => {
                setRefreshing(true);
                loadAnalytics();
              }}
              tintColor="#8b5cf6"
            />
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {error ? (
            <Text
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          <Text
            style={
              styles.sectionTitle
            }
          >
            Publishing Performance
          </Text>

          <View style={styles.grid}>
            <StatCard
              label="Confirmed Posts"
              value={
                analytics?.postsPublished ||
                0
              }
            />

            <StatCard
              label="Active Automations"
              value={
                analytics?.activeAutomations ||
                0
              }
            />

            <StatCard
              label="Post Success Rate"
              value={`${
                analytics?.successRate ||
                0
              }%`}
            />

            <StatCard
              label="Automation Runs"
              value={
                analytics
                  ?.automationRuns
                  ?.total || 0
              }
            />
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Automation Health
          </Text>

          <View
            style={
              styles.compactGrid
            }
          >
            <SmallStat
              label="Successful"
              value={
                analytics
                  ?.automationRuns
                  ?.successful || 0
              }
            />

            <SmallStat
              label="Partial"
              value={
                analytics
                  ?.automationRuns
                  ?.partial || 0
              }
            />

            <SmallStat
              label="Failed"
              value={
                analytics
                  ?.automationRuns
                  ?.failed || 0
              }
            />

            <SmallStat
              label="Paused"
              value={
                analytics
                  ?.pausedAutomations ||
                0
              }
            />

            <SmallStat
              label="Needs Attention"
              value={
                analytics
                  ?.automationHealth
                  ?.currentNeedsAttention ||
                0
              }
            />
          </View>

          <Text
            style={
              styles.healthNote
            }
          >
            Failed runs are historical. Current attention only applies to active automations with an unresolved latest error.
          </Text>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Platform Performance
          </Text>

          <View
            style={
              styles.platformList
            }
          >
            {PLATFORM_ORDER.map(
              (platform) => (
                <PlatformCard
                  key={
                    platform.key
                  }
                  name={
                    platform.name
                  }
                  icon={
                    platform.icon
                  }
                  metrics={
                    analytics
                      ?.platformBreakdown?.[
                      platform.key
                    ] || {
                      successfulPosts: 0,
                      failedPosts: 0,
                      totalAttempts: 0,
                    }
                  }
                />
              )
            )}
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Top Performers
          </Text>

          <View
            style={
              styles.insightCard
            }
          >
            <Text
              style={
                styles.insightLabel
              }
            >
              MOST PUBLISHED ARTWORK
            </Text>

            <Text
              style={
                styles.insightTitle
              }
            >
              {analytics
                ?.topArtwork
                ?.title ||
                "Not enough publishing history yet"}
            </Text>

            <Text
              style={
                styles.insightText
              }
            >
              {analytics
                ?.topArtwork
                ? `${analytics.topArtwork.confirmedPosts} confirmed platform posts from ArtBoost automation history.`
                : "Run store automations to build artwork-level publishing history."}
            </Text>
          </View>

          <View
            style={
              styles.insightCard
            }
          >
            <Text
              style={
                styles.insightLabel
              }
            >
              MOST USED PLATFORM
            </Text>

            <Text
              style={
                styles.insightTitle
              }
            >
              {analytics
                ?.bestPlatform
                ? formatPlatform(
                    analytics
                      .bestPlatform
                      .platform
                  )
                : "Not enough data yet"}
            </Text>

            <Text
              style={
                styles.insightText
              }
            >
              {analytics
                ?.bestPlatform
                ? `${analytics.bestPlatform.successfulPosts} confirmed posts through ArtBoost.`
                : "Platform rankings appear after confirmed posts are recorded."}
            </Text>
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Growth Insight
          </Text>

          <View
            style={
              styles.growthCard
            }
          >
            <Ionicons
              name="sparkles-outline"
              size={25}
              color="#86efac"
            />

            <View
              style={
                styles.growthTextWrap
              }
            >
              <Text
                style={
                  styles.growthTitle
                }
              >
                Live publishing insight
              </Text>

              <Text
                style={
                  styles.growthText
                }
              >
                {analytics?.insight ||
                  "Keep publishing to build performance history."}
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Campaign Manager Health
          </Text>

          <View
            style={
              styles.compactGrid
            }
          >
            <SmallStat
              label="Scheduled"
              value={
                analytics
                  ?.campaigns
                  ?.scheduled || 0
              }
            />

            <SmallStat
              label="Published"
              value={
                analytics
                  ?.campaigns
                  ?.published || 0
              }
            />

            <SmallStat
              label="Failed"
              value={
                analytics
                  ?.campaigns
                  ?.failed || 0
              }
            />

            <SmallStat
              label="Saved"
              value={
                analytics
                  ?.campaigns
                  ?.saved || 0
              }
            />
          </View>

          <View
            style={
              styles.upcomingCard
            }
          >
            <Text
              style={
                styles.upcomingLabel
              }
            >
              NEXT SCHEDULED POST
            </Text>

            <Text
              style={
                styles.upcomingTitle
              }
            >
              {analytics?.upcoming
                ?.title ||
                "No upcoming post found"}
            </Text>

            <Text
              style={
                styles.upcomingText
              }
            >
              {getUpcomingDetails()}
            </Text>
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Engagement & Sales
          </Text>

          <View
            style={
              styles.compactGrid
            }
          >
            <TrackingStat
              label="Engagement"
              available={
                Boolean(
                  tracking
                    ?.engagementAvailable
                )
              }
              value={
                tracking
                  ?.engagement
              }
            />

            <TrackingStat
              label="Clicks"
              available={
                Boolean(
                  tracking
                    ?.clicksAvailable
                )
              }
              value={
                tracking?.clicks
              }
            />

            <TrackingStat
              label="Conversions"
              available={
                Boolean(
                  tracking
                    ?.conversionsAvailable
                )
              }
              value={
                tracking
                  ?.conversions
              }
            />

            <TrackingStat
              label="Data Source"
              available={false}
              unavailableText="Platform tracking not connected"
            />
          </View>

          <Text
            style={
              styles.trackingNote
            }
          >
            ArtBoost only displays engagement, click,
            and conversion totals when those metrics
            are actually available. Missing platform
            analytics are not reported as zero.
          </Text>
        </ScrollView>
      </View>
    </>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View
      style={styles.statCard}
    >
      <Text
        style={styles.statValue}
      >
        {value}
      </Text>

      <Text
        style={styles.statLabel}
      >
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
    <View
      style={styles.smallStat}
    >
      <Text
        style={
          styles.smallStatValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.smallStatLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function TrackingStat({
  label,
  available,
  value = null,
  unavailableText = "Not connected",
}: {
  label: string;
  available: boolean;
  value?: number | null;
  unavailableText?: string;
}) {
  return (
    <View
      style={styles.smallStat}
    >
      <Text
        style={[
          styles.smallStatValue,
          !available &&
            styles.unavailableValue,
        ]}
      >
        {available
          ? value || 0
          : "—"}
      </Text>

      <Text
        style={
          styles.smallStatLabel
        }
      >
        {label}
      </Text>

      {!available ? (
        <Text
          style={
            styles.unavailableText
          }
        >
          {unavailableText}
        </Text>
      ) : null}
    </View>
  );
}

function PlatformCard({
  name,
  icon,
  metrics,
}: {
  name: string;
  icon: any;
  metrics: PlatformMetrics;
}) {
  return (
    <View
      style={
        styles.platformCard
      }
    >
      <View
        style={
          styles.platformIconWrap
        }
      >
        <Ionicons
          name={icon}
          size={22}
          color="#c4b5fd"
        />
      </View>

      <View
        style={
          styles.platformContent
        }
      >
        <Text
          style={
            styles.platformName
          }
        >
          {name}
        </Text>

        <Text
          style={
            styles.platformMetric
          }
        >
          {metrics.successfulPosts} confirmed
          {metrics.failedPosts > 0
            ? ` • ${metrics.failedPosts} failed`
            : ""}
        </Text>
      </View>

      <Text
        style={
          styles.platformValue
        }
      >
        {metrics.successfulPosts}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#101010",
    },

    header: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor:
        "#242424",
      flexDirection: "row",
      alignItems: "center",
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor:
        "#1b1b1b",
      borderWidth: 1,
      borderColor:
        "#303030",
      alignItems: "center",
      justifyContent:
        "center",
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
      justifyContent:
        "center",
      backgroundColor:
        "#101010",
    },

    loadingText: {
      color: "#ffffff",
      marginTop: 12,
    },

    error: {
      padding: 12,
      borderRadius: 12,
      backgroundColor:
        "#3a1111",
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
      backgroundColor:
        "#1b1b1b",
      borderWidth: 1,
      borderColor:
        "#303030",
      padding: 16,
      borderRadius: 18,
      justifyContent:
        "center",
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
      backgroundColor:
        "#1b1b1b",
      borderWidth: 1,
      borderColor:
        "#303030",
      borderRadius: 18,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
    },

    platformIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 15,
      backgroundColor:
        "#2b2145",
      alignItems: "center",
      justifyContent:
        "center",
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
      backgroundColor:
        "#1b1b1b",
      borderWidth: 1,
      borderColor:
        "#303030",
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
      backgroundColor:
        "#14281e",
      borderWidth: 1,
      borderColor:
        "#28533d",
      padding: 16,
      flexDirection: "row",
      alignItems:
        "flex-start",
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
      minHeight: 86,
      borderRadius: 16,
      backgroundColor:
        "#171717",
      borderWidth: 1,
      borderColor:
        "#292929",
      padding: 13,
      justifyContent:
        "center",
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

    unavailableValue: {
      color: "#777777",
    },

    unavailableText: {
      color: "#666666",
      fontSize: 9,
      lineHeight: 13,
      marginTop: 4,
    },

    upcomingCard: {
      borderRadius: 18,
      backgroundColor:
        "#1d1730",
      borderWidth: 1,
      borderColor:
        "#3c2d63",
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

    healthNote: {
      color: "#777777",
      fontSize: 10,
      lineHeight: 15,
      marginTop: 10,
    },

    trackingNote: {
      color: "#777777",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 12,
      marginBottom: 18,
    },
  });
