import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { supabase } from "../../lib/supabase";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
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

type Product = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  productUrl: string;
  price?: number | null;
  currency?: string | null;
  storeType?: string | null;
  storeName?: string | null;
  storeConnectionId?: string | null;
  status?: string | null;
  automationEnabled?: boolean;
  timesPosted?: number;
  lastPostedAt?: string | null;
};

export default function ProductsScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const [products, setProducts] = useState<Product[]>([]);
  type Store = {
  id: string;
  storeType: string;
  storeName: string;
  connected: boolean;
  productCount: number;
};

const [stores, setSources] = useState<Store[]>([]);
// ARTBOOST_LIBRARY_AUTOMATION_STATUS_FIX_V1_20260821
const [activeAutomationCounts, setActiveAutomationCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const loadProducts = useCallback(
  async (
    currentUserId: string,
    showLoader = true
  ) => {
  try {
    if (showLoader) {
      setLoading(true);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || "";
    const authHeaders = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};

    // ARTBOOST_59_TEST_LAUNCH_FIX_V1:
    // Load the complete catalog instead of only the backend's first page.
    const pageSize = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    const allProducts: any[] = [];

    while (offset < total) {
      const query = new URLSearchParams({
        userId: currentUserId,
        limit: String(pageSize),
        offset: String(offset),
      });

      const response = await fetch(
        `${API_BASE}/products?${query.toString()}`,
        { headers: authHeaders }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ||
            data.error ||
            "Unable to load products."
        );
      }

      const rows = Array.isArray(data.products)
        ? data.products
        : [];

      allProducts.push(...rows);
      total = Number.isFinite(Number(data.total))
        ? Number(data.total)
        : allProducts.length;
      offset += rows.length;

      if (rows.length === 0) break;
    }

    const storesResponse = await fetch(
      `${API_BASE}/stores?userId=${encodeURIComponent(currentUserId)}`,
      { headers: authHeaders }
    );
    const storesData = await storesResponse.json();

    if (!storesResponse.ok || !storesData.success) {
      throw new Error(
        storesData.details ||
          storesData.error ||
          "Unable to load stores."
      );
    }

    setProducts(
      allProducts.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        imageUrl:
          item.image_url ||
          item.imageUrl ||
          item.thumbnail_url ||
          item.thumbnailUrl ||
          null,
        productUrl:
          item.product_url ||
          item.productUrl ||
          item.url ||
          "",
        price: item.price,
        currency: item.currency,
        storeType:
          item.store_type ||
          item.storeType ||
          null,
        storeName:
          item.store_name ||
          item.storeName ||
          null,
        storeConnectionId:
          item.store_connection_id ||
          item.storeConnectionId ||
          item.store_id ||
          null,
        status: item.status,
        automationEnabled:
          item.automation_enabled ||
          item.automationEnabled ||
          false,
        timesPosted:
          item.times_posted ||
          item.timesPosted ||
          0,
        lastPostedAt:
          item.last_posted_at ||
          item.lastPostedAt,
      }))
    );

    setSources(storesData.stores || []);

    const automationsResponse = await fetch(
      `${API_BASE}/automations?userId=${encodeURIComponent(currentUserId)}`,
      { headers: authHeaders }
    );
    const automationsData = await automationsResponse.json();
    const counts: Record<string, number> = {};
    if (automationsResponse.ok && automationsData?.success && Array.isArray(automationsData.automations)) {
      for (const automation of automationsData.automations) {
        if (!automation?.enabled) continue;
        const automationStoreId = String(automation.store_id || automation.storeId || "");
        if (!automationStoreId) continue;
        counts[automationStoreId] = (counts[automationStoreId] || 0) + 1;
      }
    } else {
      console.warn("Library automation status unavailable; showing Automation Off until refresh.");
    }
    setActiveAutomationCounts(counts);
  } catch (error: any) {
    console.log("Products or stores load failed:", error);

    Alert.alert(
      "Products Unavailable",
      error?.message ||
        "ArtBoost could not load your products and stores."
    );
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);

  useFocusEffect(
  useCallback(() => {
    async function initialize() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert(
          "Not Signed In",
          "Please sign in to view your products."
        );
        return;
      }

      setUserId(user.id);

      loadProducts(user.id);
    }

    initialize();
  }, [loadProducts])
);



  function openImportOptions() {
    Alert.alert(
      "Add Artwork",
      "Choose how you want to add artwork or products.",
      [
        {
          text: "Upload Artwork",
          onPress: () =>
            router.push("/product-create" as any),
        },
        {
          text: "Connect Store",
          onPress: () =>
            router.push({
              pathname:
                "/connect-store" as any,
            }),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  }

  const activeAutomationCount =
    products.filter(
      (item) => item.automationEnabled
    ).length;

  const totalPostsCreated = products.reduce(
    (total, item) =>
      total + (item.timesPosted || 0),
    0
  );

  const connectedSources = stores.filter(
    (store) => store.connected
  );

  const manualProducts = products.filter(
    (product) =>
      !product.storeType &&
      !product.storeName
  );

  function getStoreProductCount(store: Store) {
    const storeId = String(store.id || "");
    const type = String(store.storeType || "")
      .trim()
      .toLowerCase();
    const name = String(store.storeName || "")
      .trim()
      .toLowerCase();

    const matchingProducts = products.filter(
      (product) => {
        const productConnectionId = String(
          product.storeConnectionId || ""
        );

        if (storeId && productConnectionId) {
          return storeId === productConnectionId;
        }

        return (
          String(product.storeType || "")
            .trim()
            .toLowerCase() === type &&
          String(product.storeName || "")
            .trim()
            .toLowerCase() === name
        );
      }
    );

    return Math.max(
      Number(store.productCount || 0),
      matchingProducts.length
    );
  }

  function getStoreAutomationCount(store: Store) {
    return activeAutomationCounts[String(store.id)] || 0;
  }

  function openStore(store: Store) {
    router.push({
      pathname: "/store-dashboard" as any,
      params: {
        storeId: store.id,
        storeName: store.storeName,
        storeType: store.storeType,
        productCount: String(
          getStoreProductCount(store)
        ),
        connected: String(store.connected),
      },
    });
  }

  function sourceLabel(_store: Store) {
    return "Products";
  }

  function displayStoreName(store: Store) {
    const type = String(store.storeType || "")
      .trim()
      .toLowerCase();

    if (
      type === "shopify" &&
      store.storeName.includes(
        "myshopify.com"
      )
    ) {
      return "Shopify Store";
    }

    if (type === "redbubble") {
      return store.storeName || "Redbubble Store";
    }

    if (type === "etsy") {
      return store.storeName || "Etsy Store";
    }

    return store.storeName;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              tabBarHeight + 32,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);

              if (userId) {
                loadProducts(
                  userId,
                  false
                );
              }
            }}
            tintColor="#8b5cf6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              ARTBOOST AI
            </Text>

            <Text style={styles.title}>
              Library
            </Text>

            <Text style={styles.subtitle}>
              Manage your connected stores, products,
              artwork, and marketing automations.
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {products.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Products
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {connectedSources.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Stores
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {activeAutomationCount}
            </Text>

            <Text style={styles.summaryLabel}>
              Active Automations
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {totalPostsCreated}
            </Text>

            <Text style={styles.summaryLabel}>
              Published
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Connected Stores
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select a store to manage its products
              and marketing automations.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator
              size="large"
              color="#8b5cf6"
            />

            <Text style={styles.loadingText}>
              Loading connected stores...
            </Text>
          </View>
        ) : connectedSources.length === 0 &&
          manualProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name="images-outline"
                size={44}
                color="#a78bfa"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No products yet
            </Text>

            <Text style={styles.emptyText}>
              Connect a store from the Connections tab
              or upload artwork to build your Library.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={openImportOptions}
            >
              <Ionicons
                name="add"
                size={21}
                color="#ffffff"
              />

              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Add Artwork
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.sourcesList}>
            {connectedSources.map((store) => {
              const count =
                getStoreProductCount(store);

              const automated =
                getStoreAutomationCount(
                  store
                );

              return (
                <Pressable
                  key={store.id}
                  style={styles.sourceCard}
                  onPress={() =>
                    openStore(store)
                  }
                >
                  <View
                    style={
                      styles.sourceIconWrap
                    }
                  >
                    <Ionicons
                      name={
                        String(
                          store.storeType
                        ).toLowerCase() ===
                        "redbubble"
                          ? "color-palette-outline"
                          : "storefront-outline"
                      }
                      size={28}
                      color="#c4b5fd"
                    />
                  </View>

                  <View
                    style={
                      styles.sourceContent
                    }
                  >
                    <Text
                      style={styles.sourceName}
                      numberOfLines={1}
                    >
                      {displayStoreName(
                        store
                      )}
                    </Text>

                    <Text
                      style={styles.sourceType}
                    >
                      {String(
                        store.storeType
                      ).toUpperCase()}
                    </Text>

                    <View
                      style={
                        styles.sourceMetricsRow
                      }
                    >
                      <Text
                        style={
                          styles.sourceMetric
                        }
                      >
                        {count}{" "}
                        {sourceLabel(store)}
                      </Text>

                      <Text
                        style={
                          styles.metricSeparator
                        }
                      >
                        •
                      </Text>

                      <Text
                        style={[
                          styles.sourceMetric,
                          automated > 0 &&
                            styles.sourceMetricActive,
                        ]}
                      >
                        {automated > 0
                          ? `${automated} Active Automations`
                          : "Automation Off"}
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color="#777777"
                  />
                </Pressable>
              );
            })}

            {manualProducts.length > 0 ? (
              <Pressable
                style={styles.sourceCard}
                onPress={() =>
                  router.push(
                    "/product-create" as any
                  )
                }
              >
                <View
                  style={
                    styles.sourceIconWrap
                  }
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color="#c4b5fd"
                  />
                </View>

                <View
                  style={
                    styles.sourceContent
                  }
                >
                  <Text
                    style={styles.sourceName}
                  >
                    Manual Uploads
                  </Text>

                  <Text
                    style={styles.sourceType}
                  >
                    MANUAL UPLOADS
                  </Text>

                  <Text
                    style={
                      styles.sourceMetric
                    }
                  >
                    {manualProducts.length}{" "}
                    Products
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color="#777777"
                />
              </Pressable>
            ) : null}

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },

  scrollContent: {
    paddingBottom: 40,
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  headerTextWrap: {
    flex: 1,
    paddingRight: 16,
  },

  eyebrow: {
    color: "#8b5cf6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 5,
  },

  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
  },

  subtitle: {
    color: "#929292",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 290,
    marginTop: 5,
  },

  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 17,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    flexDirection: "row",
    alignItems: "center",
  },

  summaryItem: {
    flex: 1,
    alignItems: "center",
  },

  summaryNumber: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },

  summaryLabel: {
    color: "#838383",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },

  summaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: "#333333",
  },

  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 13,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#898989",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  sourcesList: {
    paddingHorizontal: 20,
  },

  sourceCard: {
    minHeight: 104,
    borderRadius: 20,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  sourceIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  sourceContent: {
    flex: 1,
    paddingHorizontal: 14,
  },

  sourceName: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  sourceType: {
    color: "#a78bfa",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 4,
  },

  sourceMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 8,
  },

  sourceMetric: {
    color: "#929292",
    fontSize: 11,
    fontWeight: "700",
  },

  sourceMetricActive: {
    color: "#86efac",
  },

  metricSeparator: {
    color: "#555555",
    marginHorizontal: 7,
  },





  loadingWrap: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: "#888888",
    fontSize: 14,
    marginTop: 12,
  },

  emptyState: {
    minHeight: 350,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  emptyIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
  },

  emptyText: {
    color: "#999999",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 24,
  },

  primaryButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
});