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

const API_BASE = "https://artboost-ai.onrender.com";

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

    const [productsResponse, storesResponse] = await Promise.all([
      fetch(
        `${API_BASE}/products?userId=${encodeURIComponent(currentUserId)}`
      ),
      fetch(
        `${API_BASE}/stores?userId=${encodeURIComponent(currentUserId)}`
      ),
    ]);

    const [productsData, storesData] = await Promise.all([
      productsResponse.json(),
      storesResponse.json(),
    ]);

    if (!productsResponse.ok || !productsData.success) {
      throw new Error(
        productsData.details ||
          productsData.error ||
          "Unable to load products."
      );
    }

    if (!storesResponse.ok || !storesData.success) {
      throw new Error(
        storesData.details ||
          storesData.error ||
          "Unable to load stores."
      );
    }

    setProducts(
      (productsData.products || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        imageUrl: item.image_url,
        productUrl: item.product_url,
        price: item.price,
        currency: item.currency,
        storeType: item.store_type,
        storeName: item.store_name,
        status: item.status,
        automationEnabled: item.automation_enabled || false,
        timesPosted: item.times_posted || 0,
        lastPostedAt: item.last_posted_at,
      }))
    );

    setSources(storesData.stores || []);
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
    const matchingProducts = products.filter(
      (product) =>
        product.storeName === store.storeName ||
        product.storeType === store.storeType
    );

    return Math.max(
      store.productCount || 0,
      matchingProducts.length
    );
  }

  function getStoreAutomationCount(store: Store) {
    return products.filter(
      (product) =>
        (product.storeName === store.storeName ||
          product.storeType === store.storeType) &&
        product.automationEnabled
    ).length;
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
    return "Artwork Assets";
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
              Artwork
            </Text>

            <Text style={styles.subtitle}>
              Review your connected art businesses,
              artwork sources, and automatic
              marketing activity.
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {products.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Artwork Assets
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {connectedSources.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Sources
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {activeAutomationCount}
            </Text>

            <Text style={styles.summaryLabel}>
              Active Auto
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {totalPostsCreated}
            </Text>

            <Text style={styles.summaryLabel}>
              Posts Made
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Artwork Sources
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select a source to review its artwork,
              products, and automation settings.
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
              Loading artwork sources...
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
              No artwork sources yet
            </Text>

            <Text style={styles.emptyText}>
              Connect a store or upload artwork
              to begin automatic marketing.
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
                          ? `${automated} Active Auto`
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
                    Uploaded Artwork
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
                    Artwork
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color="#777777"
                />
              </Pressable>
            ) : null}

            <Pressable
              style={styles.addSourceCard}
              onPress={openImportOptions}
            >
              <View
                style={
                  styles.addSourceIconWrap
                }
              >
                <Ionicons
                  name="add"
                  size={25}
                  color="#ffffff"
                />
              </View>

              <View style={styles.sourceContent}>
                <Text
                  style={styles.addSourceTitle}
                >
                  Add Artwork or Store
                </Text>

                <Text
                  style={
                    styles.addSourceDescription
                  }
                >
                  Connect another business, import a
                  store, or upload artwork directly.
                </Text>
              </View>
            </Pressable>
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

  addSourceCard: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#5b3fa3",
    padding: 15,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },

  addSourceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  addSourceTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  addSourceDescription: {
    color: "#aaa0ba",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
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