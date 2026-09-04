import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type DashboardActionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
};

function DashboardAction({
  icon,
  title,
  description,
  onPress,
  disabled = false,
}: DashboardActionProps) {
  return (
    <Pressable
      style={[
        styles.actionCard,
        disabled && styles.actionCardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View
        style={[
          styles.actionIconWrap,
          disabled && styles.actionIconWrapDisabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={24}
          color={disabled ? "#666666" : "#a78bfa"}
        />
      </View>

      <View style={styles.actionContent}>
        <Text
          style={[
            styles.actionTitle,
            disabled && styles.disabledText,
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.actionDescription,
            disabled && styles.disabledText,
          ]}
        >
          {description}
        </Text>
      </View>

      {disabled ? (
        <View style={styles.comingSoonPill}>
          <Text style={styles.comingSoonText}>Soon</Text>
        </View>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={21}
          color="#666666"
        />
      )}
    </Pressable>
  );
}

export default function StoreDashboardScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    productCount?: string;
    connected?: string;
    lastSyncedAt?: string;
  }>();

  const storeId = params.storeId || "";
  const storeName = params.storeName || "Connected Store";
  const storeType = params.storeType || "store";

  const initialProductCount = useMemo(() => {
    const parsedCount = Number(params.productCount);

    if (Number.isNaN(parsedCount)) {
      return 0;
    }

    return parsedCount;
  }, [params.productCount]);

  const [productCount, setProductCount] =
    useState(initialProductCount);

  const [lastSyncedAt, setLastSyncedAt] =
    useState(params.lastSyncedAt || "");

  const [syncing, setSyncing] =
    useState(false);

  const connected =
    params.connected === undefined ||
    params.connected === "true";

  const platformLabel = useMemo(() => {
    const cleanType = String(storeType)
      .trim()
      .toLowerCase();

    if (cleanType === "shopify") {
      return "Shopify";
    }

    if (cleanType === "etsy") {
      return "Etsy";
    }

    if (cleanType === "ebay") {
      return "eBay";
    }

    if (cleanType === "redbubble") {
      return "Redbubble";
    }

    if (
      cleanType === "fine_art_america" ||
      cleanType === "fine-art-america" ||
      cleanType === "fineartamerica"
    ) {
      return "Fine Art America";
    }

    if (cleanType === "artpal") {
      return "ArtPal";
    }

    if (cleanType === "gumroad") {
      return "Gumroad";
    }

    if (!cleanType) {
      return "Store";
    }

    return cleanType
      .split(/[_\-\s]+/)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(" ");
  }, [storeType]);

  const displayStoreName = useMemo(() => {
    if (
      storeName.toLowerCase().includes("myshopify.com")
    ) {
      return platformLabel;
    }

    return storeName;
  }, [platformLabel, storeName]);

  const lastSyncedText = useMemo(() => {
    if (!lastSyncedAt) {
      return "Not available";
    }

    const date = new Date(lastSyncedAt);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return date.toLocaleString();
  }, [lastSyncedAt]);

const syncButtonLabel = useMemo(() => {
  const type = String(storeType)
    .trim()
    .toLowerCase();

  if (type === "shopify") {
    return "Live Sync";
  }

  if (type === "etsy") {
    return syncing ? "Syncing..." : "Sync Listings";
  }

  return syncing
    ? "Refreshing..."
    : "Refresh / Sync";
}, [storeType, syncing]);

  function openProducts() {
    router.push({
      pathname: "/store-products" as any,
      params: {
        storeId,
        storeName,
        storeType,
        productCount: String(productCount),
        connected: String(connected),
      },
    });
  }

  async function syncProducts() {
    const type = String(storeType)
      .trim()
      .toLowerCase();

    if (type === "shopify") {
      Alert.alert(
        "Live Sync Active",
        "Shopify products are synchronized through the connected Shopify store."
      );

      return;
    }

    if (type === "etsy") {
      if (syncing) {
        return;
      }

      try {
        setSyncing(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "Please sign in to ArtBoost before syncing Etsy listings."
          );
        }

        const response = await fetch(
          `${API_BASE}/etsy/sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
            }),
          }
        );

        const responseText =
          await response.text();

        let data: any = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          throw new Error(
            `ArtBoost received an invalid Etsy sync response (${response.status}).`
          );
        }

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error ||
              "Etsy listings could not be synchronized."
          );
        }

        const syncedCount =
          Number(data.discovered);

        if (Number.isFinite(syncedCount)) {
          setProductCount(syncedCount);
        }

        if (data.syncedAt) {
          setLastSyncedAt(
            String(data.syncedAt)
          );
        }

        Alert.alert(
          "Etsy Sync Complete",
          [
            `${Number(data.discovered) || 0} active listings found.`,
            `${Number(data.imported) || 0} new listings imported.`,
            `${Number(data.updated) || 0} existing listings refreshed.`,
            `${Number(data.skipped) || 0} listings skipped.`,
          ].join("\n")
        );
      } catch (error) {
        Alert.alert(
          "Etsy Sync Failed",
          error instanceof Error
            ? error.message
            : "Etsy listings could not be synchronized."
        );
      } finally {
        setSyncing(false);
      }

      return;
    }

    if (!connected) {
      Alert.alert(
        "Store Disconnected",
        "Reconnect this store before refreshing its products."
      );
      return;
    }

    if (!storeId) {
      Alert.alert(
        "Store Unavailable",
        "ArtBoost could not identify this saved store connection."
      );
      return;
    }

    router.push({
      pathname: "/ai-store-scanner" as any,
      params: {
        storeId,
        storeName,
        storeType,
        autoSync: "true",
      },
    });
  }

  function openStoreConnection() {
    router.push({
      pathname: "/connections" as any,
      params: {
        section: "stores",
        storeId,
      },
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
  style={styles.backButton}
  onPress={() =>
  router.replace({
    pathname:
      "/(tabs)/connections" as any,
    params: {
      section: "stores",
    },
  })
}
>
  <Ionicons
    name="arrow-back"
    size={24}
    color="#ffffff"
  />
</Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>
            STORE DASHBOARD
          </Text>

          <Text
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {displayStoreName}
          </Text>
        </View>

        <Pressable
          style={styles.settingsButton}
          onPress={openStoreConnection}
        >
          <Ionicons
            name="settings-outline"
            size={22}
            color="#ffffff"
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.storeCard}>
          <View style={styles.storeTopRow}>
            <View style={styles.storeIconWrap}>
              <Ionicons
                name="storefront-outline"
                size={32}
                color="#c4b5fd"
              />
            </View>

            <View style={styles.storeIdentity}>
              <Text style={styles.platformText}>
                {platformLabel}
              </Text>

              <Text
                style={styles.storeNameText}
                numberOfLines={2}
              >
                {storeName}
              </Text>
            </View>

            <View
              style={[
                styles.connectionPill,
                connected
                  ? styles.connectionPillConnected
                  : styles.connectionPillDisconnected,
              ]}
            >
              <View
                style={[
                  styles.connectionDot,
                  connected
                    ? styles.connectionDotConnected
                    : styles.connectionDotDisconnected,
                ]}
              />

              <Text
                style={[
                  styles.connectionText,
                  connected
                    ? styles.connectionTextConnected
                    : styles.connectionTextDisconnected,
                ]}
              >
                {connected
                  ? "Connected"
                  : "Disconnected"}
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text
                style={[
                  styles.metricNumber,
                  productCount === 0 &&
                    styles.metricNumberPending,
                ]}
              >
                {productCount > 0
                  ? productCount
                  : "Awaiting"}
              </Text>
              <Text style={styles.metricLabel}>
                {productCount > 0
                  ? "Products"
                  : "Import"}
              </Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metric}>
              <Text style={styles.metricNumber}>
                {connected ? "Active" : "Off"}
              </Text>
              <Text style={styles.metricLabel}>
                Connection
              </Text>
            </View>
          </View>

          <View style={styles.syncInfoRow}>
            <Ionicons
              name="time-outline"
              size={18}
              color="#8b8b8b"
            />

            <View style={styles.syncInfoTextWrap}>
              <Text style={styles.syncInfoLabel}>
                Last product sync
              </Text>

              <Text style={styles.syncInfoValue}>
                {lastSyncedText}
              </Text>
            </View>
          </View>

          <View style={styles.primaryActionsRow}>
            <Pressable
              style={[
                styles.syncButton,
                syncing && styles.syncButtonDisabled,
              ]}
              onPress={syncProducts}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="sync"
                  size={20}
                  color="#ffffff"
                />
              )}
              <Text style={styles.syncButtonText}>
                {syncButtonLabel}
              </Text>
            </Pressable>

            <Pressable
              style={styles.viewProductsButton}
              onPress={openProducts}
            >
              <Ionicons
                name="cube-outline"
                size={20}
                color="#c4b5fd"
              />
              <Text
                style={styles.viewProductsButtonText}
              >
                View Products
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Store Management
        </Text>

        <DashboardAction
          icon="cube-outline"
          title="Products"
          description={
            productCount > 0
              ? `View and manage ${productCount} imported products.`
              : "Import your first product or open the empty product catalog."
          }
          onPress={openProducts}
        />

        <DashboardAction
  icon="megaphone-outline"
  title="Grow My Business"
  description="Automatically promote your store products on Facebook, Instagram, Pinterest, and more."
  onPress={() =>
    router.push({
      pathname:
        "/store-automation" as any,
      params: {
        storeId,
        storeName,
        storeType,
        productCount:
          String(productCount),
      },
    })
  }
/>

<DashboardAction
  icon="calendar-outline"
  title="Scheduled Promotions"
  description="Review, run, pause, and manage your scheduled store promotions."
  onPress={() =>
    router.push({
      pathname:
        "/schedule" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    })
  }
/>

        <DashboardAction
          icon="analytics-outline"
          title="Analytics"
          description="Track product views, clicks, and social performance."
          onPress={() => {}}
          disabled
        />

        <DashboardAction
          icon="folder-open-outline"
          title="Collections"
          description="Organize products into categories and campaigns."
          onPress={() => {}}
          disabled
        />

        <DashboardAction
          icon="search-outline"
          title="SEO Tools"
          description="Improve titles, descriptions, keywords, and tags."
          onPress={() => {}}
          disabled
        />

        <DashboardAction
          icon="layers-outline"
          title="Inventory"
          description="Review product availability and listing status."
          onPress={() => {}}
          disabled
        />

        <DashboardAction
          icon="settings-outline"
          title="Store Settings"
          description="Manage this connection and store preferences."
          onPress={openStoreConnection}
        />

        <View style={styles.futureCard}>
          <View style={styles.futureIconWrap}>
            <Ionicons
              name="sparkles"
              size={25}
              color="#c4b5fd"
            />
          </View>

          <View style={styles.futureTextWrap}>
            <Text style={styles.futureTitle}>
              More store tools are coming
            </Text>

            <Text style={styles.futureText}>
              ArtBoost will eventually manage product
              synchronization, promotion history, analytics,
              collections, inventory, and SEO from this dashboard.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1d1d1d",
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },

  eyebrow: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 3,
  },

  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  storeCard: {
    borderRadius: 24,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 18,
    marginBottom: 26,
  },

  storeTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  storeIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  storeIdentity: {
    flex: 1,
    paddingHorizontal: 13,
  },

  platformText: {
    color: "#a78bfa",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  storeNameText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21,
    marginTop: 3,
  },

  connectionPill: {
    minHeight: 30,
    borderRadius: 99,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  connectionPillConnected: {
    backgroundColor: "#153425",
  },

  connectionPillDisconnected: {
    backgroundColor: "#3a1f24",
  },

  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },

  connectionDotConnected: {
    backgroundColor: "#4ade80",
  },

  connectionDotDisconnected: {
    backgroundColor: "#fb7185",
  },

  connectionText: {
    fontSize: 11,
    fontWeight: "900",
  },

  connectionTextConnected: {
    color: "#86efac",
  },

  connectionTextDisconnected: {
    color: "#fda4af",
  },

  metricsRow: {
    marginTop: 20,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#292929",
    flexDirection: "row",
    alignItems: "center",
  },

  metric: {
    flex: 1,
    alignItems: "center",
  },

  metricNumber: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
  },

  metricNumberPending: {
    fontSize: 17,
  },

  metricLabel: {
    color: "#858585",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#333333",
  },

  syncInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
  },

  syncInfoTextWrap: {
    marginLeft: 10,
  },

  syncInfoLabel: {
    color: "#7d7d7d",
    fontSize: 11,
    fontWeight: "700",
  },

  syncInfoValue: {
    color: "#d0d0d0",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },

  primaryActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  syncButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  syncButtonDisabled: {
    opacity: 0.65,
  },

  syncButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  viewProductsButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  viewProductsButtonText: {
    color: "#c4b5fd",
    fontSize: 14,
    fontWeight: "900",
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
  },

  actionCard: {
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 14,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  actionCardDisabled: {
    opacity: 0.68,
  },

  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  actionIconWrapDisabled: {
    backgroundColor: "#242424",
  },

  actionContent: {
    flex: 1,
    paddingHorizontal: 13,
  },

  actionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  actionDescription: {
    color: "#898989",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  disabledText: {
    color: "#727272",
  },

  comingSoonPill: {
    borderRadius: 99,
    backgroundColor: "#292929",
    paddingVertical: 5,
    paddingHorizontal: 9,
  },

  comingSoonText: {
    color: "#888888",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  futureCard: {
    borderRadius: 20,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 17,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  futureIconWrap: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  futureTextWrap: {
    flex: 1,
    paddingLeft: 13,
  },

  futureTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  futureText: {
    color: "#aaa0ba",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});