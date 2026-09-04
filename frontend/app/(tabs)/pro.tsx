// ARTBOOST_VISUAL_PARITY_V3153
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type CampaignSummary = {
  id?: string;
  status?: string;
  campaignStatus?: string;
};

type StoreSummary = {
  id: string;
  connected: boolean;
};

function formatTier(value?: string | null) {
  const normalized = String(value || "starter")
    .trim()
    .toLowerCase();

  if (normalized === "business") {
    return "Business";
  }

  if (
    normalized === "pro" ||
    normalized === "professional"
  ) {
    return "Pro";
  }

  if (normalized === "free") {
    return "Starter";
  }

  return (
    normalized.charAt(0).toUpperCase() +
    normalized.slice(1)
  );
}

export default function ProScreen() {
  const [session, setSession] =
    useState<any>(null);

  const [profile, setProfile] =
    useState<any>(null);

  const [campaigns, setCampaigns] =
    useState<CampaignSummary[]>([]);

  const [stores, setStores] =
    useState<StoreSummary[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [openingBilling, setOpeningBilling] =
    useState(false);

  const tierName = useMemo(
    () =>
      formatTier(
        profile?.subscription_tier
      ),
    [profile?.subscription_tier]
  );

  const activeCampaigns = useMemo(
    () =>
      campaigns.filter((item) => {
        const lifecycle =
          item.campaignStatus ||
          item.status ||
          "";

        return [
          "active",
          "scheduled",
          "publishing",
        ].includes(
          lifecycle.toLowerCase()
        );
      }).length,
    [campaigns]
  );

  const publishedCampaigns = useMemo(
    () =>
      campaigns.filter(
        (item) =>
          String(item.status).toLowerCase() ===
          "published"
      ).length,
    [campaigns]
  );

  const connectedStores = useMemo(
    () =>
      stores.filter(
        (store) => store.connected
      ).length,
    [stores]
  );

  const loadDashboard = useCallback(
    async () => {
      try {
        setLoading(true);

        const { data: sessionData } =
          await supabase.auth.getSession();

        const currentSession =
          sessionData.session;

        setSession(currentSession);

        const userId =
          currentSession?.user?.id;

        if (!userId) {
          setProfile(null);
          setCampaigns([]);
          setStores([]);
          return;
        }

        const [
          profileResult,
          campaignsResponse,
          storesResponse,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single(),
          fetch(
            `${BACKEND_URL}/scheduled-campaigns?userId=${encodeURIComponent(
              userId
            )}`
          ),
          fetch(
            `${BACKEND_URL}/stores?userId=${encodeURIComponent(
              userId
            )}`
          ),
        ]);

        if (!profileResult.error) {
          setProfile(profileResult.data);
        }

        const campaignsData =
          await campaignsResponse.json();

        const storesData =
          await storesResponse.json();

        setCampaigns(
          Array.isArray(
            campaignsData?.campaigns
          )
            ? campaignsData.campaigns
            : []
        );

        setStores(
          Array.isArray(storesData?.stores)
            ? storesData.stores
            : []
        );
      } catch (error) {
        console.log(
          "Business manager load failed:",
          error
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  useEffect(() => {
    const { data } =
      supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          setSession(newSession);
        }
      );

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function copyReferralCode() {
    const code =
      profile?.referral_code;

    if (!code) {
      Alert.alert(
        "Referral Code Unavailable",
        "Refresh this page and try again."
      );
      return;
    }

    await Clipboard.setStringAsync(code);

    Alert.alert(
      "Copied",
      "Your referral code was copied."
    );
  }

  async function openBillingPortal() {
    try {
      if (
        !session?.user?.id ||
        !session?.user?.email
      ) {
        Alert.alert(
          "Login Required",
          "Please sign in before managing your subscription."
        );
        return;
      }

      setOpeningBilling(true);

      const response = await fetch(
        `${BACKEND_URL}/create-billing-portal`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customerId:
              profile?.stripe_customer_id ||
              null,
            email: session.user.email,
            userId: session.user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(
          data.error ||
            "Unable to open billing."
        );
      }

      await Linking.openURL(data.url);
    } catch (error: any) {
      Alert.alert(
        "Billing Error",
        error?.message ||
          "Unable to open billing."
      );
    } finally {
      setOpeningBilling(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color="#9b5cff"
        />

        <Text style={styles.loadingText}>
          Loading your business manager...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>
        ARTBOOST {tierName.toUpperCase()}
      </Text>

      <Text style={styles.header}>
        AI Business Manager
      </Text>

      <Text style={styles.subheader}>
        Track marketing activity, review
        business growth, and manage your
        subscription.
      </Text>

      <View style={styles.tierCard}>
        <View style={styles.tierTopRow}>
          <View>
            <Text style={styles.tierLabel}>
              CURRENT PLAN
            </Text>

            <Text style={styles.tierName}>
              {tierName}
            </Text>
          </View>

          <View style={styles.activeBadge}>
            <Text
              style={styles.activeBadgeText}
            >
              ACTIVE
            </Text>
          </View>
        </View>

        <Text style={styles.accountEmail}>
          {session?.user?.email ||
            "Not signed in"}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Business Overview
      </Text>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>
            {activeCampaigns}
          </Text>

          <Text style={styles.metricLabel}>
            Active Campaigns
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>
            {publishedCampaigns}
          </Text>

          <Text style={styles.metricLabel}>
            Posts Published
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>
            {connectedStores}
          </Text>

          <Text style={styles.metricLabel}>
            Connected Stores
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricNumber}>
            {profile?.monthly_campaign_count ||
              0}
          </Text>

          <Text style={styles.metricLabel}>
            Campaigns This Month
          </Text>
        </View>
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightEyebrow}>
          AI BUSINESS INSIGHTS
        </Text>

        <Text style={styles.insightTitle}>
          Performance insights are being
          prepared.
        </Text>

        <Text style={styles.insightText}>
          As ArtBoost collects campaign,
          engagement, click, and store data,
          this section will identify your
          strongest artwork and recommend what
          to market or create next.
        </Text>
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>
            Campaign Manager
          </Text>

          <Text style={styles.actionText}>
            Create, schedule, publish, pause,
            and manage marketing campaigns.
          </Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.push(
              "/campaign-manager" as any
            )
          }
        >
          <Text
            style={styles.primaryButtonText}
          >
            Open
          </Text>
        </Pressable>
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionTextWrap}>
          <Text style={styles.actionTitle}>
            Analytics
          </Text>

          <Text style={styles.actionText}>
            Review trends, top artwork,
            campaign performance, and growth.
          </Text>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() =>
            router.push(
              "/analytics" as any
            )
          }
        >
          <Text
            style={styles.secondaryButtonText}
          >
            View
          </Text>
        </Pressable>
      </View>

      <View style={styles.referralCard}>
        <Text style={styles.sectionTitle}>
          Referral Rewards
        </Text>

        <Text style={styles.referralText}>
          Share your code and earn up to 3
          free months.
        </Text>

        <View style={styles.referralCodeBox}>
          <Text style={styles.referralLabel}>
            YOUR CODE
          </Text>

          <Text style={styles.referralCode}>
            {profile?.referral_code ||
              "Loading..."}
          </Text>
        </View>

        <View style={styles.referralMetrics}>
          <Text style={styles.referralMetric}>
            Referrals:{" "}
            {profile?.referral_count || 0}
          </Text>

          <Text style={styles.referralMetric}>
            Free Months:{" "}
            {profile?.free_months || 0}
          </Text>
        </View>

        <Pressable
          style={styles.copyButton}
          onPress={copyReferralCode}
        >
          <Text style={styles.copyButtonText}>
            Copy Referral Code
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.billingButton}
        onPress={openBillingPortal}
        disabled={openingBilling}
      >
        <Text style={styles.billingButtonText}>
          {openingBilling
            ? "Opening Billing..."
            : "Manage Subscription"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: "rgba(7, 6, 17, 0.88)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#ffffff",
    marginTop: 12,
  },

  container: {
    padding: 22,
    paddingBottom: 60,
    backgroundColor: "rgba(7, 6, 17, 0.88)",
    minHeight: "100%",
  },

  eyebrow: {
    color: "#9b5cff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 28,
  },

  header: {
    color: "#ffffff",
    fontSize: 31,
    fontWeight: "900",
    marginTop: 7,
  },

  subheader: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },

  tierCard: {
    borderRadius: 20,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#5b3fa3",
    padding: 18,
    marginBottom: 24,
  },

  tierTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  tierLabel: {
    color: "#a78bfa",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  tierName: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 4,
  },

  activeBadge: {
    borderRadius: 99,
    backgroundColor: "#12a86b",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  activeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  accountEmail: {
    color: "#ffffff",
    fontSize: 12,
    marginTop: 12,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
  },

  metricCard: {
    width: "48%",
    minHeight: 100,
    borderRadius: 18,
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderWidth: 1,
    borderColor: "#2f2f2f",
    padding: 14,
    justifyContent: "center",
  },

  metricNumber: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900",
  },

  metricLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },

  insightCard: {
    borderRadius: 20,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 17,
    marginBottom: 14,
  },

  insightEyebrow: {
    color: "#86efac",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  insightTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 8,
  },

  insightText: {
    color: "#9ed3b3",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },

  actionCard: {
    borderRadius: 18,
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderWidth: 1,
    borderColor: "#3b3158",
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  actionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },

  actionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  actionText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  primaryButton: {
    minWidth: 72,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  secondaryButton: {
    minWidth: 72,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#665cff",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  referralCard: {
    borderRadius: 20,
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderWidth: 1,
    borderColor: "#3b3158",
    padding: 17,
    marginTop: 10,
  },

  referralText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
  },

  referralCodeBox: {
    borderRadius: 14,
    backgroundColor: "#3f2e68",
    padding: 14,
    marginTop: 14,
  },

  referralLabel: {
    color: "#9b5cff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  referralCode: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5,
  },

  referralMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },

  referralMetric: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },

  copyButton: {
    borderRadius: 12,
    backgroundColor: "#665cff",
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
  },

  copyButtonText: {
    color: "#ffffff",
    fontWeight: "900",
  },

  billingButton: {
    borderRadius: 14,
    backgroundColor: "#12a86b",
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },

  billingButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});