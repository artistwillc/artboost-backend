// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_WHITE_TEXT_AUDIT_V3141
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  router,
  Stack,
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
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from "react-native";

import ArtBoostBrandIcon from "@/components/ArtBoostBrandIcon";
import { supabase } from "@/lib/supabase";

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

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function platformLabel(value: string) {
  const clean = normalize(value);

  if (clean === "redbubble") return "Redbubble";
  if (clean === "shopify") return "Shopify";
  if (clean === "etsy") return "Etsy";
  if (clean === "ebay") return "eBay";
  if (clean === "gumroad") return "Gumroad";
  if (clean === "artpal") return "ArtPal";
  if (
    clean === "fine_art_america" ||
    clean === "fineartamerica"
  ) {
    return "Fine Art America";
  }

  return clean
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

export default function StoreProductsScreen() {
  // ARTBOOST_SHOPIFY_ORIGINAL_FRONTEND_IMAGE_FOUNDATION_V31648

  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    productCount?: string;
    connected?: string;
  }>();

  const storeId = String(params.storeId || "");
  const storeName = String(
    params.storeName || "Connected Store"
  );
  const storeType = String(
    params.storeType || "store"
  );

  const [products, setProducts] = useState<
    Product[]
  >([]);
  // ARTBOOST_STORE_PRODUCT_SEARCH_V1_1_20260821
  const [productSearch, setProductSearch] = useState("");
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => String(product.title || "").toLowerCase().includes(query));
  }, [products, productSearch]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const displayPlatform = useMemo(
    () => platformLabel(storeType),
    [storeType]
  );

  const matchesStore = useCallback(
    (product: Product) => {
      const productType = normalize(
        product.storeType
      );
      const selectedType = normalize(storeType);

      const productConnectionId = String(
        product.storeConnectionId || ""
      );
      const selectedConnectionId = String(
        storeId || ""
      );

      // The connection ID is the authoritative store/product link.
      // This prevents name differences such as "ArtPal" vs artist/shop
      // names from making a valid persisted catalog appear empty.
      if (
        selectedConnectionId &&
        productConnectionId
      ) {
        return (
          selectedConnectionId === productConnectionId
        );
      }

      const productStore = normalize(
        product.storeName
      );
      const selectedStore = normalize(storeName);

      // Legacy rows may not have store_connection_id. Keep a safe
      // fallback for those rows, scoped to the selected platform.
      if (productType !== selectedType) {
        return false;
      }

      if (
        productStore &&
        selectedStore &&
        productStore === selectedStore
      ) {
        return true;
      }

      // Never accept every product from the same platform as a fallback.
      // If legacy metadata is incomplete, only rows with missing store names
      // may fall back after the backend has already scoped by storeId.
      return !productStore || !selectedStore;
    },
    [storeId, storeName, storeType]
  );

  const loadProducts = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) {
          setLoading(true);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user || null;

        if (!user) {
          throw new Error(
            "Please sign in to view products."
          );
        }

        const authHeaders = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` } : ({} as Record<string, string>);

        const pageSize = 500;
        let offset = 0;
        let total = Number.POSITIVE_INFINITY;
        const allRows: any[] = [];

        // Fetch only this platform and page through the complete catalog.
        // The backend caps a page at 500 products, so a single request
        // would silently hide products for large stores.
        while (offset < total) {
          const query = new URLSearchParams({
            userId: user.id,
            storeType: normalize(storeType),
            limit: String(pageSize),
            offset: String(offset),
          });

          if (storeId) {
            query.set("storeId", storeId);
          }

          const response = await fetch(
            `${API_BASE}/products?${query.toString()}`,
            { headers: authHeaders }
          );

          const responseText =
            await response.text();

          let data: any;

          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error(
              `Backend returned ${response.status}: ${responseText.slice(
                0,
                160
              )}`
            );
          }

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

          allRows.push(...rows);

          total = Number.isFinite(Number(data.total))
            ? Number(data.total)
            : allRows.length;

          offset += rows.length;

          if (rows.length === 0) {
            break;
          }
        }

        const mappedProducts: Product[] = allRows.map(
          (item: any) => ({
            id: String(item.id),
            title: String(
              item.title || "Untitled Product"
            ),
            description:
              item.description || null,
            // ARTBOOST_PRODUCT_FIELD_COMPAT_V1
            imageUrl:
              item.image_url ||
              item.imageUrl ||
              item.thumbnail_url ||
              item.thumbnailUrl ||
              null,
            productUrl: String(
              item.product_url ||
              item.productUrl ||
              item.url ||
              ""
            ),
            price:
              item.price === null ||
              item.price === undefined
                ? null
                : Number(item.price),
            currency: item.currency || "USD",
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
            status: item.status || null,
            automationEnabled: Boolean(
              item.automation_enabled ??
              item.automationEnabled
            ),
            timesPosted:
              Number(
                item.times_posted ??
                item.timesPosted
              ) || 0,
            lastPostedAt:
              item.last_posted_at ||
              item.lastPostedAt ||
              null,
          })
        );

        setProducts(
          mappedProducts.filter(matchesStore)
        );
      } catch (error: any) {
        console.log(
          "Store product load failed:",
          error
        );

        Alert.alert(
          "Products Unavailable",
          error?.message ||
            "ArtBoost could not load this store catalog."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [matchesStore, storeId, storeType]
  );

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts])
  );

  function openProduct(product: Product) {
    router.push({
      pathname: "/product-details" as any,
      params: {
        productId: product.id,
        title: product.title,
        description:
          product.description || "",
        imageUrl: product.imageUrl || "",
        productUrl: product.productUrl,
        price:
          product.price === null ||
          product.price === undefined
            ? ""
            : String(product.price),
        currency: product.currency || "USD",
        storeId,
        storeName,
        storeType,
        automationEnabled: String(
          Boolean(product.automationEnabled)
        ),
        timesPosted: String(
          product.timesPosted || 0
        ),
      },
    });
  }

  function createProductPost(product: Product) {
    router.push({
      pathname: "/product-post" as any,
      params: { productId: product.id },
    });
  }

  function createProductVideo(product: Product) {
    router.push({
      pathname: "/video-studio" as any,
      params: {
        productId: product.id,
        storeId:
          product.storeConnectionId || storeId,
        storeName:
          product.storeName || storeName,
        storeType:
          product.storeType || storeType,
      },
    });
  }

  function importProduct() {
    if (normalize(storeType) === "redbubble") {
      router.push({
        pathname:
          "/product-import-wizard" as any,
        params: {
          storeId,
          storeName,
          storeType,
        },
      });
      return;
    }

    router.push({
      pathname: "/catalog-importer" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    });
  }

  function createStoreAutomation() {
    router.push({
      pathname: "/store-automation" as any,
      params: {
        storeId,
        storeName,
        storeType,
        productCount: String(products.length),
      },
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/store-dashboard" as any); }}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>
            {displayPlatform.toUpperCase()}
          </Text>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {storeName}
          </Text>
        </View>

        <Pressable
          style={styles.headerButton}
          onPress={importProduct}
        >
          <Ionicons
            name="add"
            size={25}
            color="#ffffff"
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadProducts(false);
            }}
            tintColor="#9b5cff"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <ArtBoostBrandIcon
              name={storeType || storeName}
              size={44}
            />
          </View>

          <View style={styles.summaryContent}>
            <Text style={styles.summaryTitle}>
              {products.length}{" "}
              {products.length === 1
                ? "Product"
                : "Products"}
            </Text>
            <Text style={styles.summaryText}>
              Imported products are ready for
              campaigns, Post Now, and scheduled
              promotions.
            </Text>
          </View>
        </View>

        {!loading && products.length > 0 ? (
          <View style={styles.automationPrompt}>
            <View style={styles.automationPromptIcon}>
              <Ionicons
                name="sparkles"
                size={25}
                color="#c4b5fd"
              />
            </View>

            <View style={styles.automationPromptContent}>
              <Text style={styles.automationPromptTitle}>
                Would you like ArtBoost to create an
                automation for this store?
              </Text>

              <Text style={styles.automationPromptText}>
                Choose your schedule and let ArtBoost
                cycle through these listings automatically.
              </Text>

              <Pressable
                style={styles.automationPromptButton}
                onPress={createStoreAutomation}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color="#ffffff"
                />

                <Text
                  style={
                    styles.automationPromptButtonText
                  }
                >
                  Create Automation
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ARTBOOST_STORE_PRODUCT_SEARCH_V1_1_20260821 */}
        {!loading && products.length > 0 ? (
          <View style={styles.productSearchWrap}>
            <Ionicons name="search-outline" size={19} color="#9b5cff" />
            <TextInput value={productSearch} onChangeText={setProductSearch} placeholder="Search products" placeholderTextColor="#9b94b7" autoCapitalize="none" autoCorrect={false} style={styles.productSearchInput} />
            {productSearch ? <Pressable onPress={() => setProductSearch("")} hitSlop={8}><Ionicons name="close-circle" size={20} color="#9b94b7" /></Pressable> : null}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator
              size="large"
              color="#9b5cff"
            />
            <Text style={styles.loadingText}>
              Loading store products...
            </Text>
          </View>
        ) : visibleProducts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="cube-outline"
              size={48}
              color="#a78bfa"
            />
            <Text style={styles.emptyTitle}>
              No imported products
            </Text>
            <Text style={styles.emptyText}>
              Import a product from this store to
              use it in ArtBoost campaigns and
              automations.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={importProduct}
            >
              <Ionicons
                name="add"
                size={21}
                color="#ffffff"
              />
              <Text
                style={styles.primaryButtonText}
              >
                Import Product
              </Text>
            </Pressable>
          </View>
        ) : (
          visibleProducts.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <Pressable
                style={styles.productMainRow}
                onPress={() => openProduct(product)}
              >
                {product.imageUrl ? (
                  <Image
                    source={{ uri: product.imageUrl }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.productImage, styles.imagePlaceholder]}>
                    <Ionicons name="image-outline" size={33} color="#9b94b7" />
                  </View>
                )}

                <View style={styles.productContent}>
                  <Text style={styles.productTitle} numberOfLines={2}>
                    {product.title}
                  </Text>
                  <Text style={styles.productDescription} numberOfLines={2}>
                    {product.description || "No description available."}
                  </Text>
                  <View style={styles.productMetaRow}>
                    {product.price !== null && product.price !== undefined ? (
                      <Text style={styles.productPrice}>
                        {product.currency || "USD"}{" "}{product.price.toFixed(2)}
                      </Text>
                    ) : (
                      <Text style={styles.productPrice}>Price not imported</Text>
                    )}
                    <Text
                      style={[
                        styles.automationStatus,
                        product.automationEnabled && styles.automationStatusActive,
                      ]}
                    >
                      {product.automationEnabled ? "Automation On" : "Automation Off"}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#9b94b7" />
              </Pressable>

              {/* ARTBOOST_PRODUCT_ACTIONS */}
              <View style={styles.productActionRow}>
                <Pressable
                  style={styles.productActionButton}
                  onPress={() => createProductPost(product)}
                >
                  <Ionicons name="sparkles-outline" size={17} color="#ffffff" />
                  <Text
                    style={styles.productActionText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    Create Post
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.productActionButton, styles.productVideoButton]}
                  onPress={() => createProductVideo(product)}
                >
                  <Ionicons name="videocam-outline" size={18} color="#ffffff" />
                  <Text
                    style={styles.productActionText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    Create Video
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "rgba(7, 6, 17, 0.90)",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#141126",
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 13,
  },
  eyebrow: {
    color: "#9b5cff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  summaryCard: {
    borderRadius: 20,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginBottom: 19,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryContent: {
    flex: 1,
    paddingLeft: 14,
  },
  summaryTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  summaryText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  automationPrompt: {
    borderRadius: 20,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#4c3979",
    padding: 16,
    marginBottom: 19,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  automationPromptIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },

  automationPromptContent: {
    flex: 1,
    paddingLeft: 13,
  },

  automationPromptTitle: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },

  automationPromptText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  automationPromptButton: {
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: "#9b5cff",
    marginTop: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  automationPromptButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  loadingWrap: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 13,
    marginTop: 12,
  },
  emptyCard: {
    minHeight: 330,
    borderRadius: 22,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 15,
  },
  emptyText: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#9b5cff",
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  productSearchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 18, marginBottom: 14, paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1, borderColor: "#2b2b2f", backgroundColor: "#151518" },
  productSearchInput: { flex: 1, color: "#ffffff", fontSize: 15, paddingVertical: 0 },
  productCard: {
    borderRadius: 20,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    padding: 12,
    marginBottom: 12,
  },
  productMainRow: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
  },
  productImage: {
    width: 92,
    height: 104,
    borderRadius: 14,
    backgroundColor: "#1d1733",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  productContent: {
    flex: 1,
    paddingHorizontal: 13,
  },
  productTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  productDescription: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  productMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  productPrice: {
    color: "#c4b5fd",
    fontSize: 10,
    fontWeight: "900",
  },
  automationStatus: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  automationStatusActive: {
    color: "#86efac",
  },
  productActionRow: {
    flexDirection: "row",
    gap: 9,
    paddingTop: 11,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#3f2e68",
  },
  productActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 43,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  productVideoButton: {
    backgroundColor: "#4338ca",
  },
  productActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
    includeFontPadding: false,
  },
});