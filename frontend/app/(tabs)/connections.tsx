import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type ConnectionSection =
  | "social"
  | "stores";

type SocialPlatform = {
  name: string;
  description: string;
  premium: boolean;
  available: boolean;
};

type ConnectedStore = {
  id: string;
  storeType: string;
  storeName: string;
  storeUrl?: string | null;
  hostname?: string | null;
  connectionMethod?: string | null;
  connected: boolean;
  productCount: number;
  connectedAt?: string | null;
  updatedAt?: string | null;
};

const socialPlatforms: SocialPlatform[] = [
  {
    name: "Pinterest",
    description:
      "Publish pins, artwork, and product campaigns.",
    premium: true,
    available: true,
  },
  {
    name: "Facebook",
    description:
      "Post product and artwork campaigns to Facebook Pages.",
    premium: true,
    available: true,
  },
  {
    name: "Instagram",
    description:
      "Publish images and captions to Instagram Business.",
    premium: true,
    available: true,
  },
  {
    name: "X",
    description:
      "Publish product links, artwork, images, and short posts.",
    premium: true,
    available: true,
  },
  {
    name: "TikTok",
    description:
      "Publish artwork marketing content and short-form campaigns to TikTok.",
    premium: true,
    available: true,
  },
];

function formatStoreType(value: string) {
  const clean = String(value || "")
    .trim()
    .toLowerCase();

  const names: Record<string, string> = {
    shopify: "Live Sync",
    etsy: "Live Sync",
    redbubble: "Artwork Import",
    amazon: "Product Link Import",
    ebay: "Product Link Import",
    fine_art_america:
      "Product Link Import",
    society6: "Product Link Import",
    artpal: "Product Link Import",
    gumroad: "Product Link Import",
    big_cartel: "Product Link Import",
    squarespace: "Product Link Import",
    wix: "Product Link Import",
    woocommerce:
      "Product Link Import",
    custom_store:
      "Custom Store / URL Import",
  };

  return (
    names[clean] ||
    "Store / Product Link Import"
  );
}

function platformDisplayName(store: ConnectedStore) {
  const platform = String(store.storeType || "")
    .trim()
    .toLowerCase();

  const names: Record<string, string> = {
    shopify: "Shopify",
    etsy: "Etsy",
    redbubble: "Redbubble",
    amazon: "Amazon",
    ebay: "eBay",
    fine_art_america: "Fine Art America",
    society6: "Society6",
    artpal: "ArtPal",
    gumroad: "Gumroad",
    big_cartel: "Big Cartel",
    squarespace: "Squarespace",
    wix: "Wix",
    woocommerce: "WooCommerce",
    printify: "Printify",
    printful: "Printful",
    custom_store: "Custom Store",
  };

  return names[platform] || "Connected Store";
}

function storeDisplayName(store: ConnectedStore) {
  const rawName = String(
    store.storeName || ""
  ).trim();

  if (!rawName) {
    return "Connected Store";
  }

  try {
    if (
      rawName.startsWith("http://") ||
      rawName.startsWith("https://")
    ) {
      return new URL(rawName).hostname.replace(
        /^www\./i,
        ""
      );
    }
  } catch {}

  return rawName;
}

export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{
    section?: string;
    refreshStores?: string;
  }>();

  const [activeSection, setActiveSection] =
    useState<ConnectionSection>(
      params.section === "stores"
        ? "stores"
        : "social"
    );

  const [
    socialConnections,
    setSocialConnections,
  ] = useState<Record<string, boolean>>(
    {}
  );

  const [stores, setStores] = useState<
    ConnectedStore[]
  >([]);

  const [loadingStatus, setLoadingStatus] =
    useState(false);

  const [disconnectingId, setDisconnectingId] =
    useState<string | null>(null);

  const connectedStores = useMemo(
    () =>
      stores.filter(
        store => store.connected !== false
      ),
    [stores]
  );

  const getStoredConnections =
    useCallback(async () => {
      try {
        const saved =
          await AsyncStorage.getItem(
            "artboost_connections"
          );

        return saved
          ? JSON.parse(saved)
          : {};
      } catch {
        return {};
      }
    }, []);

  const updateStoredConnection =
    useCallback(
      async (
        platform: string,
        connected: boolean
      ) => {
        setSocialConnections(current => {
          const updated = {
            ...current,
            [platform]: connected,
          };

          AsyncStorage.setItem(
            "artboost_connections",
            JSON.stringify(updated)
          ).catch(error => {
            console.log(
              "Connection storage failed:",
              error
            );
          });

          return updated;
        });
      },
      []
    );

  const loadStores = useCallback(
  async (userId: string) => {
    const response = await fetch(
      `${BACKEND_URL}/stores?userId=${encodeURIComponent(
        userId
      )}`
    );

    const responseText = await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "ArtBoost received an invalid response while loading stores."
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
          data.details ||
          "Unable to load connected stores."
      );
    }

    const loadedStores = Array.isArray(data.connections)
      ? data.connections
      : Array.isArray(data.stores)
        ? data.stores
        : [];

    setStores(
      loadedStores.map((store: any) => ({
        id: String(store.id),
        storeType:
          store.platform ||
          store.storeType ||
          "custom_store",
        storeName:
          store.storeName ||
          store.store_name ||
          store.platform ||
          "Connected Store",
        storeUrl:
          store.storeUrl ||
          store.store_url ||
          null,
        hostname:
          store.metadata?.hostname ||
          store.hostname ||
          null,
        connectionMethod:
          store.metadata?.connectionMethod ||
          store.connectionMethod ||
          null,
        connected:
          store.connected !== false,
        productCount:
          Number(
            store.productCount ||
              store.product_count ||
              store.metadata?.productCount ||
              0
          ) || 0,
        connectedAt:
          store.connectedAt ||
          store.connected_at ||
          store.createdAt ||
          store.created_at ||
          null,
        updatedAt:
          store.updatedAt ||
          store.updated_at ||
          null,
      }))
    );
  },
  []
);

  const checkSimpleStatus =
    useCallback(
      async (
        platform: string,
        path: string
      ) => {
        try {
          const response = await fetch(
            `${BACKEND_URL}${path}`
          );

          const responseText =
            await response.text();

          let data: any = {};

          try {
            data = JSON.parse(responseText);
          } catch {
            data = {};
          }

          await updateStoredConnection(
            platform,
            Boolean(data.connected)
          );
        } catch (error) {
          console.log(
            `${platform} status check failed:`,
            error
          );
        }
      },
      [updateStoredConnection]
    );

  const refreshAllStatuses =
    useCallback(async () => {
      try {
        setLoadingStatus(true);

        const { data: sessionData } =
          await supabase.auth.getSession();

        const userId =
          sessionData.session?.user?.id;

        const localConnections =
          await getStoredConnections();

        setSocialConnections(
          localConnections
        );

        await Promise.all([
          checkSimpleStatus(
            "Pinterest",
            "/pinterest/status"
          ),
          checkSimpleStatus(
            "Facebook",
            "/facebook/test"
          ),
          checkSimpleStatus(
            "Instagram",
            userId
              ? `/instagram/status?userId=${encodeURIComponent(userId)}`
              : "/instagram/status"
          ),
          checkSimpleStatus(
            "X",
            userId
               ? `/x/status?userId=${encodeURIComponent(userId)}`
               : "/x/status"
         ),
          checkSimpleStatus(
            "TikTok",
            userId
              ? `/tiktok/status?userId=${encodeURIComponent(userId)}`
              : "/tiktok/status"
          ),
        ]);

        if (!userId) {
          setStores([]);
          return;
        }

        await loadStores(userId);
      } catch (error: any) {
        console.log(
          "Connection refresh failed:",
          error
        );

        Alert.alert(
          "Unable to Refresh",
          error?.message ||
            "ArtBoost could not refresh your connections."
        );
      } finally {
        setLoadingStatus(false);
      }
    }, [
      checkSimpleStatus,
      getStoredConnections,
      loadStores,
    ]);

  useFocusEffect(
    useCallback(() => {
      if (params.section === "stores") {
        setActiveSection("stores");
      } else if (
        params.section === "social"
      ) {
        setActiveSection("social");
      }

      refreshAllStatuses();
    }, [
      params.section,
      params.refreshStores,
      refreshAllStatuses,
    ])
  );

  async function connectSocialPlatform(
    platform: string
  ) {
    if (platform === "Pinterest") {
      await Linking.openURL(
        `${BACKEND_URL}/auth/pinterest`
      );

      Alert.alert(
        "Pinterest Login Opened",
        "Complete the Pinterest authorization, return to ArtBoost, and refresh the connection status."
      );

      return;
    }

    if (platform === "Facebook") {
      await Linking.openURL(
        `${BACKEND_URL}/auth/facebook`
      );

      Alert.alert(
        "Facebook Login Opened",
        "Complete the Facebook authorization, return to ArtBoost, and refresh the connection status."
      );

      return;
    }

    if (platform === "Instagram") {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        Alert.alert(
          "Login Required",
          "Please log in before connecting Instagram."
        );
        return;
      }

      await Linking.openURL(
        `${BACKEND_URL}/auth/instagram?userId=${encodeURIComponent(userId)}`
      );

      Alert.alert(
        "Instagram Login Opened",
        "Complete the Meta authorization, return to ArtBoost, and refresh the connection status."
      );

      return;
    }

    if (platform === "TikTok") {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        Alert.alert(
          "Login Required",
          "Please log in before connecting TikTok."
        );
        return;
      }

      await Linking.openURL(
        `${BACKEND_URL}/auth/tiktok?userId=${encodeURIComponent(userId)}`
      );

      Alert.alert(
        "TikTok Login Opened",
        "Complete the TikTok authorization, return to ArtBoost, and refresh the connection status."
      );

      return;
    }

    Alert.alert(
      `${platform} Connection`,
      `${platform} is currently configured through the ArtBoost server. Account-level authorization will be expanded in a later update.`
    );
  }

  function openUniversalStoreConnector(
    initialUrl?: string
  ) {
    router.push({
      pathname: "/connect-store" as any,
      params: initialUrl
        ? {
            initialUrl,
          }
        : undefined,
    });
  }

  function manageStore(
    store: ConnectedStore
  ) {
    router.push({
      pathname: "/store-dashboard" as any,
      params: {
        storeId: store.id,
        storeName:
          storeDisplayName(store),
        storeType:
          store.storeType ||
          "custom_store",
        storeUrl:
          store.storeUrl ||
          store.hostname ||
          "",
        productCount: String(
          Number(store.productCount) || 0
        ),
        connected: "true",
      },
    });
  }

  function reconnectStore(
    store: ConnectedStore
  ) {
    const url =
      store.storeUrl ||
      store.hostname ||
      store.storeName ||
      "";

    openUniversalStoreConnector(url);
  }

  async function disconnectStore(
    store: ConnectedStore
  ) {
    try {
      setDisconnectingId(store.id);

      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        throw new Error(
          "Please log in before disconnecting a store."
        );
      }

      const response = await fetch(
        `${BACKEND_URL}/api/v2/store-connections/${encodeURIComponent(
          store.id
        )}?userId=${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
        }
      );

      const responseText =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "ArtBoost could not complete this store request. Please try again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.details ||
            "Unable to disconnect this store."
        );
      }

      setStores(current =>
        current.filter(
          item => item.id !== store.id
        )
      );

      Alert.alert(
        "Store Disconnected",
        `${storeDisplayName(
          store
        )} was disconnected successfully.`
      );
    } catch (error: any) {
      console.log(
        "Store disconnect failed:",
        error
      );

      Alert.alert(
        "Disconnect Failed",
        error?.message ||
          "ArtBoost could not disconnect this store."
      );
    } finally {
      setDisconnectingId(null);
    }
  }

  function confirmDisconnect(
    store: ConnectedStore
  ) {
    Alert.alert(
      `Disconnect ${storeDisplayName(
        store
      )}?`,
      "The store will be removed from Connected Stores. Existing imported products will remain in your Library unless deleted separately.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () =>
            disconnectStore(store),
        },
      ]
    );
  }

  function renderSocialPlatform(
    platform: SocialPlatform
  ) {
    const connected = Boolean(
      socialConnections[platform.name]
    );

    return (
      <View
        key={platform.name}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={styles.platformInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>
                {platform.name}
              </Text>

              {platform.premium ? (
                <View style={styles.proBadge}>
                  <Text
                    style={
                      styles.proBadgeText
                    }
                  >
                    PRO
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={styles.description}
            >
              {platform.description}
            </Text>

            <Text
              style={[
                styles.status,
                connected
                  ? styles.connectedText
                  : styles.disconnectedText,
              ]}
            >
              {connected
                ? "Connected"
                : "Not Connected"}
            </Text>
          </View>

          <View style={styles.socialButtonColumn}>
            <Pressable
              style={[
                styles.button,
                connected
                  ? styles.reconnectButton
                  : styles.connectButton,
              ]}
              onPress={() =>
                connectSocialPlatform(
                  platform.name
                )
              }
            >
              <Text
                style={styles.buttonText}
              >
                {connected
                  ? "Reconnect"
                  : "Connect"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  function renderStore(
    store: ConnectedStore
  ) {
    const disconnecting =
      disconnectingId === store.id;

    return (
      <View
        key={store.id}
        style={styles.storeCard}
      >
        <View style={styles.storeTopRow}>
          <View style={styles.storeIcon}>
            <Ionicons
              name="storefront-outline"
              size={25}
              color="#c4b5fd"
            />
          </View>

          <View style={styles.storeInfo}>
            <View style={styles.titleRow}>
              <Text
                style={styles.storeName}
                numberOfLines={2}
              >
                {platformDisplayName(store)}
              </Text>

              <View style={styles.proBadge}>
                <Text
                  style={styles.proBadgeText}
                >
                  PRO
                </Text>
              </View>
            </View>

            <Text
              style={styles.connectionType}
            >
              {formatStoreType(
                store.storeType
              )}
            </Text>

            {store.storeName ||
            store.hostname ||
            store.storeUrl ? (
              <Text
                style={styles.storeDomain}
                numberOfLines={1}
              >
                {storeDisplayName(store)}
              </Text>
            ) : null}

            <View
              style={styles.storeMetricsRow}
            >
              <Text
                style={styles.storeMetric}
              >
                {Number(
                  store.productCount
                ) || 0}{" "}
                Products
              </Text>

              <Text
                style={styles.metricSeparator}
              >
                •
              </Text>

              <Text
                style={styles.connectedText}
              >
                Connected
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.storeActions}>
          <Pressable
            style={[
              styles.storeActionButton,
              styles.manageStoreButton,
            ]}
            onPress={() => manageStore(store)}
          >
            <Ionicons
              name="settings-outline"
              size={17}
              color="#ffffff"
            />

            <Text
              style={styles.storeActionText}
            >
              Manage Store
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.storeActionButton,
              styles.reconnectButton,
            ]}
            onPress={() =>
              reconnectStore(store)
            }
          >
            <Ionicons
              name="refresh-outline"
              size={17}
              color="#ffffff"
            />

            <Text
              style={styles.storeActionText}
            >
              Reconnect
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.storeActionButton,
              styles.disconnectButton,
              disconnecting &&
                styles.disabledButton,
            ]}
            disabled={disconnecting}
            onPress={() =>
              confirmDisconnect(store)
            }
          >
            {disconnecting ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <Ionicons
                name="unlink-outline"
                size={17}
                color="#ffffff"
              />
            )}

            <Text
              style={styles.storeActionText}
            >
              {disconnecting
                ? "Disconnecting..."
                : "Disconnect"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={
        styles.container
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.header}>
        Connections
      </Text>

      <Text style={styles.subheader}>
        Connect social platforms for
        publishing and connect any online
        store where your artwork or products
        are available.
      </Text>

      <View style={styles.segmentedControl}>
        <Pressable
          style={[
            styles.segmentButton,
            activeSection === "social" &&
              styles.segmentButtonActive,
          ]}
          onPress={() =>
            setActiveSection("social")
          }
        >
          <Text
            style={[
              styles.segmentText,
              activeSection === "social" &&
                styles.segmentTextActive,
            ]}
          >
            Social Platforms
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.segmentButton,
            activeSection === "stores" &&
              styles.segmentButtonActive,
          ]}
          onPress={() =>
            setActiveSection("stores")
          }
        >
          <Text
            style={[
              styles.segmentText,
              activeSection === "stores" &&
                styles.segmentTextActive,
            ]}
          >
            Stores
          </Text>
        </Pressable>
      </View>

      <View style={styles.proBox}>
        <Text style={styles.proTitle}>
          {activeSection === "social"
            ? "Social Publishing"
            : "Universal Store Connections"}
        </Text>

        <Text style={styles.proText}>
          {activeSection === "social"
            ? "Connect publishing destinations for generated and scheduled campaigns."
            : "Connect Amazon, Shopify, Etsy, Redbubble, marketplaces, personal websites, and stores ArtBoost has never encountered before."}
        </Text>
      </View>

      <Pressable
        style={styles.refreshButton}
        onPress={refreshAllStatuses}
        disabled={loadingStatus}
      >
        {loadingStatus ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />

            <Text style={styles.buttonText}>
              Checking Connections...
            </Text>
          </View>
        ) : (
          <View style={styles.loadingRow}>
            <Ionicons
              name="refresh-outline"
              size={19}
              color="#ffffff"
            />

            <Text style={styles.buttonText}>
              Refresh Connection Status
            </Text>
          </View>
        )}
      </Pressable>

      {activeSection === "stores" ? (
        <>
          <Pressable
            style={styles.connectStoreButton}
            onPress={() =>
              openUniversalStoreConnector()
            }
          >
            <View style={styles.connectStorePlus}>
              <Ionicons
                name="add"
                size={26}
                color="#ffffff"
              />
            </View>

            <View
              style={
                styles.connectStoreTextWrap
              }
            >
              <Text
                style={styles.connectStoreTitle}
              >
                Connect Any Store
              </Text>

              <Text
                style={
                  styles.connectStoreDescription
                }
              >
                Paste the main storefront link.
                Connecting the store will not
                automatically send you to product
                importing.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#c4b5fd"
            />
          </Pressable>

          <Text
            style={
              styles.connectedStoresTitle
            }
          >
            Connected Stores
          </Text>

          {loadingStatus &&
          connectedStores.length === 0 ? (
            <View
              style={styles.emptyStoresCard}
            >
              <ActivityIndicator
                size="large"
                color="#8b5cf6"
              />

              <Text
                style={styles.emptyStoresText}
              >
                Loading connected stores...
              </Text>
            </View>
          ) : connectedStores.length === 0 ? (
            <View
              style={styles.emptyStoresCard}
            >
              <Ionicons
                name="storefront-outline"
                size={36}
                color="#716781"
              />

              <Text
                style={styles.emptyStoresTitle}
              >
                No stores connected
              </Text>

              <Text
                style={styles.emptyStoresText}
              >
                Connect your first storefront.
                It will appear here with a
                Manage Store button.
              </Text>
            </View>
          ) : (
            connectedStores.map(renderStore)
          )}
        </>
      ) : (
        socialPlatforms.map(
          renderSocialPlatform
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 50,
    backgroundColor: "#101010",
    minHeight: "100%",
  },

  header: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 40,
    textAlign: "center",
  },

  subheader: {
    color: "#aaaaaa",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 21,
  },

  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#303030",
  },

  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  segmentButtonActive: {
    backgroundColor: "#8b5cf6",
  },

  segmentText: {
    color: "#8e8e8e",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  segmentTextActive: {
    color: "#ffffff",
  },

  proBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#8b5cf6",
  },

  proTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },

  proText: {
    color: "#cfcfcf",
    lineHeight: 21,
    fontSize: 13,
  },

  refreshButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  connectStoreButton: {
    minHeight: 105,
    borderRadius: 18,
    backgroundColor: "#24183d",
    borderWidth: 1,
    borderColor: "#8b5cf6",
    padding: 16,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
  },

  connectStorePlus: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  connectStoreTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },

  connectStoreTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  connectStoreDescription: {
    color: "#b7aec7",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  connectedStoresTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
  },

  emptyStoresCard: {
    borderRadius: 18,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
  },

  emptyStoresTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },

  emptyStoresText: {
    color: "#909090",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    textAlign: "center",
  },

  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#282828",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  platformInfo: {
    flex: 1,
    paddingRight: 12,
  },

  socialButtonColumn: {
    width: 112,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  name: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },

  description: {
    color: "#aaaaaa",
    marginTop: 8,
    lineHeight: 20,
    fontSize: 13,
  },

  status: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
  },

  connectedText: {
    color: "#12a86b",
    fontWeight: "800",
  },

  disconnectedText: {
    color: "#999999",
  },

  button: {
    minHeight: 43,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  connectButton: {
    backgroundColor: "#12a86b",
  },

  reconnectButton: {
    backgroundColor: "#2d6cdf",
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  proBadge: {
    backgroundColor: "#8b5cf6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 10,
  },

  proBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  storeCard: {
    backgroundColor: "#1b1b1b",
    borderRadius: 19,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#343434",
  },

  storeTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  storeIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  storeInfo: {
    flex: 1,
  },

  storeName: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    flexShrink: 1,
  },

  connectionType: {
    color: "#a78bfa",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 6,
  },

  storeDomain: {
    color: "#888888",
    fontSize: 11,
    marginTop: 6,
  },

  storeMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },

  storeMetric: {
    color: "#b0b0b0",
    fontSize: 11,
    fontWeight: "700",
  },

  metricSeparator: {
    color: "#555555",
    marginHorizontal: 7,
  },

  storeActions: {
    marginTop: 15,
    gap: 9,
  },

  storeActionButton: {
    minHeight: 45,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  manageStoreButton: {
    backgroundColor: "#8b5cf6",
  },

  disconnectButton: {
    backgroundColor: "#a62828",
  },

  disabledButton: {
    opacity: 0.6,
  },

  storeActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});