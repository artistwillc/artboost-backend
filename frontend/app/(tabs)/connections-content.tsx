// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_WHITE_TEXT_AUDIT_V3141
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
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  ImageBackground,
  type ImageSourcePropType,
} from "react-native";

import { supabase } from "@/lib/supabase";

const SOCIAL_LOGOS: Record<string, ImageSourcePropType> = {
  Pinterest: require("../../assets/platform-logos/pinterest.webp"),
  Facebook: require("../../assets/platform-logos/facebook.webp"),
  Instagram: require("../../assets/platform-logos/instagram.webp"),
  Threads: require("../../assets/platform-logos/threads.webp"),
  LinkedIn: require("../../assets/platform-logos/linkedin.webp"),
  X: require("../../assets/platform-logos/x.webp"),
  TikTok: require("../../assets/platform-logos/tiktok.webp"),
};

const STORE_LOGOS: Record<string, ImageSourcePropType> = {
  artpal: require("../../assets/platform-logos/artpal.webp"),
  fine_art_america: require("../../assets/platform-logos/fine-art-america.png"),
  gumroad: require("../../assets/platform-logos/gumroad.png"),
  redbubble: require("../../assets/platform-logos/redbubble.webp"),
  shopify: require("../../assets/platform-logos/shopify.webp"),
  etsy: require("../../assets/platform-logos/etsy.webp"),
};

function socialLogoSource(name: string) {
  return SOCIAL_LOGOS[name] || null;
}

function connectedStoreLogoSource(storeType: string) {
  return STORE_LOGOS[String(storeType || "").trim().toLowerCase()] || null;
}

function BrandSquareIcon({
  source,
  size = 52,
  fallback = "storefront-outline",
}: {
  source: ImageSourcePropType | null;
  size?: number;
  fallback?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const innerSize = Math.round(size * 0.92);

  return (
    <ImageBackground
      source={require("../../assets/platform-logos/brand-square-frame.png")}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
      imageStyle={{ borderRadius: Math.round(size * 0.22) }}
      resizeMode="contain"
    >
      {source ? (
        <Image
          source={source}
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: Math.round(innerSize * 0.16),
          }}
          resizeMode="contain"
        />
      ) : (
        <Ionicons
          name={fallback}
          size={Math.round(size * 0.42)}
          color="#d7c9ff"
        />
      )}
    </ImageBackground>
  );
}

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
    name: "Threads",
    description:
      "Publish artwork, product links, images, and marketing posts to Threads.",
    premium: true,
    available: true,
  },
  {
    name: "LinkedIn",
    description:
      "Publish artwork, product links, images, and professional marketing posts to LinkedIn.",
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
    storeId?: string;
    mode?: string;
  }>();

  // ARTBOOST_STORE_SETTINGS_FOCUS_V396
  const requestedStoreId = String(
    params.storeId || ""
  ).trim();
  const storeSettingsMode =
    params.mode === "settings";

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

  const [socialModalOpen, setSocialModalOpen] =
    useState(false);

  const [disconnectingId, setDisconnectingId] =
    useState<string | null>(null);

  const connectedStores = useMemo(() => {
    const visibleStores = stores;

    if (!requestedStoreId) {
      return visibleStores;
    }

    return [...visibleStores].sort((left, right) => {
      const leftSelected =
        String(left.id) === requestedStoreId;
      const rightSelected =
        String(right.id) === requestedStoreId;

      if (leftSelected === rightSelected) return 0;
      return leftSelected ? -1 : 1;
    });
  }, [stores, requestedStoreId]);

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
      `${BACKEND_URL}/api/v2/store-connections?userId=${encodeURIComponent(
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

    const mappedStores = loadedStores.map((store: any) => ({
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
    }));

    let etsySummary: any = null;
    let shopifyStatus: any = null;

    await Promise.all([
      (async () => {
        try {
          const etsyResponse =
            await fetch(
              `${BACKEND_URL}/etsy/store-summary?userId=${encodeURIComponent(
                userId
              )}`
            );

          const etsyText =
            await etsyResponse.text();

          let etsyData: any = {};

          try {
            etsyData =
              etsyText
                ? JSON.parse(etsyText)
                : {};
          } catch {
            etsyData = {};
          }

          if (
            etsyResponse.ok &&
            etsyData?.success &&
            etsyData?.connected
          ) {
            etsySummary =
              etsyData;
          }
        } catch (error) {
          console.log(
            "Etsy store summary load failed:",
            error
          );
        }
      })(),
      (async () => {
        try {
          const shopifyResponse =
            await fetch(
              `${BACKEND_URL}/shopify/status?userId=${encodeURIComponent(
                userId
              )}`
            );

          const shopifyText =
            await shopifyResponse.text();

          let shopifyData: any = {};

          try {
            shopifyData =
              shopifyText
                ? JSON.parse(
                    shopifyText
                  )
                : {};
          } catch {
            shopifyData = {};
          }

          if (
            shopifyResponse.ok &&
            shopifyData?.connected &&
            shopifyData?.shopDomain
          ) {
            shopifyStatus =
              shopifyData;

            console.log(
              "ARTBOOST SHOPIFY STORE SUMMARY",
              {
                shopDomain:
                  shopifyData.shopDomain,
                productCount:
                  Number(
                    shopifyData.productCount
                  ) || 0,
                liveProductCount:
                  Number(
                    shopifyData.liveProductCount
                  ) || 0,
                localProductCount:
                  Number(
                    shopifyData.localProductCount
                  ) || 0,
                precision:
                  shopifyData.productCountPrecision ||
                  null,
              }
            );
          }
        } catch (error) {
          console.log(
            "Shopify store status load failed:",
            error
          );
        }
      })(),
    ]);

    if (etsySummary) {
      const etsyIndex =
        mappedStores.findIndex(
          (store: any) =>
            String(
              store.storeType || ""
            )
              .trim()
              .toLowerCase() ===
            "etsy"
        );

      const etsyStore: ConnectedStore = {
        id:
          String(
            etsySummary.connectionId ||
              etsySummary.shopId ||
              "etsy"
          ),
        storeType: "etsy",
        storeName:
          etsySummary.shopName ||
          "Etsy",
        storeUrl:
          etsySummary.shopName
            ? `https://www.etsy.com/shop/${encodeURIComponent(
                String(
                  etsySummary.shopName
                )
              )}`
            : "https://www.etsy.com",
        hostname:
          "www.etsy.com",
        connectionMethod:
          "live_sync",
        connected: true,
        productCount:
          Number(
            etsySummary.productCount
          ) || 0,
        updatedAt:
          etsySummary.lastSyncAt ||
          null,
      };

      if (etsyIndex >= 0) {
        mappedStores[etsyIndex] = {
          ...mappedStores[etsyIndex],
          ...etsyStore,
        };
      } else {
        mappedStores.push(
          etsyStore
        );
      }
    }

    if (shopifyStatus) {
      const shopifyIndex =
        mappedStores.findIndex(
          (store: any) =>
            String(
              store.storeType || ""
            )
              .trim()
              .toLowerCase() ===
            "shopify"
        );

      const shopDomain =
        String(
          shopifyStatus.shopDomain ||
            ""
        ).trim();

      const shopifyStore: ConnectedStore = {
        id:
          String(
            shopifyStatus.connectionId ||
              `shopify:${shopDomain}`
          ),
        storeType:
          "shopify",
        storeName:
          shopDomain ||
          "Shopify",
        storeUrl:
          shopDomain
            ? `https://${shopDomain}`
            : null,
        hostname:
          shopDomain || null,
        connectionMethod:
          "live_sync",
        connected: true,
        productCount:
          Number(
            shopifyStatus.productCount
          ) || 0,
        connectedAt:
          shopifyStatus.connectedAt ||
          null,
      };

      if (shopifyIndex >= 0) {
        mappedStores[shopifyIndex] = {
          ...mappedStores[
            shopifyIndex
          ],
          ...shopifyStore,
        };
      } else {
        mappedStores.push(
          shopifyStore
        );
      }
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authHeaders =
      session?.access_token
        ? {
            Authorization:
              `Bearer ${session.access_token}`,
          }
        : ({} as Record<string, string>);

    const reconciledStores =
      await Promise.all(
        mappedStores.map(
          async (
            store: ConnectedStore
          ) => {
            const normalizedType =
              String(
                store.storeType || ""
              )
                .trim()
                .toLowerCase();

            if (
              normalizedType ===
                "etsy" &&
              etsySummary
            ) {
              return {
                ...store,
                productCount:
                  Number(
                    etsySummary.productCount
                  ) || 0,
              };
            }

            if (
              normalizedType ===
                "shopify" &&
              shopifyStatus
            ) {
              return {
                ...store,
                productCount:
                  Number(
                    shopifyStatus.productCount
                  ) || 0,
              };
            }

            try {
              const query =
                new URLSearchParams({
                  userId,
                  storeType:
                    String(
                      store.storeType ||
                        "custom_store"
                    )
                      .trim()
                      .toLowerCase(),
                  storeId:
                    String(
                      store.id
                    ),
                  limit: "1",
                  offset: "0",
                });

              const productResponse =
                await fetch(
                  `${BACKEND_URL}/products?${query.toString()}`,
                  {
                    headers:
                      authHeaders,
                  }
                );

              const productText =
                await productResponse.text();

              let productData: any = {};

              try {
                productData =
                  productText
                    ? JSON.parse(
                        productText
                      )
                    : {};
              } catch {
                productData = {};
              }

              if (
                productResponse.ok &&
                productData?.success
              ) {
                const rows =
                  Array.isArray(
                    productData.products
                  )
                    ? productData.products
                    : [];

                const authoritativeCount =
                  Number.isFinite(
                    Number(
                      productData.total
                    )
                  )
                    ? Number(
                        productData.total
                      )
                    : rows.length;

                return {
                  ...store,
                  productCount:
                    Math.max(
                      0,
                      authoritativeCount
                    ),
                };
              }
            } catch (error) {
              console.log(
                "Store product count reconciliation failed:",
                store.id,
                error
              );
            }

            return store;
          }
        )
      );

    setStores(reconciledStores);
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
            userId
              ? `/pinterest/status?userId=${encodeURIComponent(
                  userId
                )}`
              : "/pinterest/status"
          ),
          checkSimpleStatus(
            "Facebook",
            "/facebook/test"
          ),
          checkSimpleStatus(
            "Instagram",
            userId
              ? `/instagram/status?userId=${encodeURIComponent(
                  userId
                )}`
              : "/instagram/status"
          ),
          checkSimpleStatus(
            "Threads",
            userId
              ? `/threads/status?userId=${encodeURIComponent(
                  userId
                )}`
              : "/threads/status"
          ),
          checkSimpleStatus(
            "LinkedIn",
            userId
              ? `/linkedin/status?userId=${encodeURIComponent(
                  userId
                )}`
              : "/linkedin/status"
          ),
          checkSimpleStatus(
            "X",
            userId
              ? `/x/status?userId=${encodeURIComponent(
                  userId
                )}`
              : "/x/status"
          ),
          checkSimpleStatus(
            "TikTok",
            userId
              ? `/tiktok/status?userId=${encodeURIComponent(
                  userId
                )}`
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
      // Preserve refreshStores as an intentional focus refresh trigger.
      void params.refreshStores;

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

  // ARTBOOST_TIKTOK_NATIVE_LOGIN_V9
  async function readArtBoostJsonResponse(
    response: Response,
    label: string
  ) {
    const responseText = await response.text();
    let data: any = {};

    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch {
        const looksLikeHtml = /^\s*</.test(responseText);

        if (looksLikeHtml) {
          throw new Error(
            `${label} is not live on the ArtBoost server yet (HTTP ${response.status}). Wait for the backend deploy to finish, then try again.`
          );
        }

        throw new Error(
          `${label} returned an invalid server response (HTTP ${response.status}).`
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
          data?.details ||
          `${label} failed with HTTP ${response.status}.`
      );
    }

    return data;
  }

  async function connectTikTokThroughInstalledApp(userId: string) {
    if (Platform.OS !== "android") {
      Alert.alert(
        "TikTok App Login",
        "Native TikTok app authorization is currently enabled for Android. Use the existing TikTok authorization flow on iPhone."
      );
      return;
    }

    const nativeLogin = (NativeModules as any).ArtBoostTikTokLogin;

    if (!nativeLogin?.authorize) {
      Alert.alert(
        "Android Rebuild Required",
        "This ArtBoost Android build does not contain the TikTok native bridge. Reinstall the already-built V8 APK, then try again."
      );
      return;
    }

    const healthResponse = await fetch(
      `${BACKEND_URL}/tiktok/native-health?ts=${Date.now()}`,
      {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );

    const health = await readArtBoostJsonResponse(
      healthResponse,
      "TikTok native backend"
    );

    if (!health?.native || !health?.configured) {
      throw new Error(
        health?.error ||
          "TikTok native login is not configured on the ArtBoost server."
      );
    }

    const configResponse = await fetch(
      `${BACKEND_URL}/tiktok/native-config?ts=${Date.now()}`,
      {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );

    const config = await readArtBoostJsonResponse(
      configResponse,
      "TikTok native configuration"
    );

    if (
      !config?.configured ||
      !config?.clientKey ||
      !config?.redirectUri
    ) {
      throw new Error(
        config?.error ||
          "TikTok native login is not configured on the ArtBoost server."
      );
    }

    const result = await nativeLogin.authorize(
      String(config.clientKey),
      String(
        config.scopes ||
          "user.info.basic,video.publish,video.upload"
      ),
      String(config.redirectUri)
    );

    if (!result?.code || !result?.codeVerifier) {
      throw new Error(
        "TikTok did not return a usable native authorization code."
      );
    }

    const exchangeResponse = await fetch(
      `${BACKEND_URL}/auth/tiktok/native-exchange`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          userId,
          code: result.code,
          codeVerifier: result.codeVerifier,
          redirectUri: config.redirectUri,
        }),
      }
    );

    const exchange = await readArtBoostJsonResponse(
      exchangeResponse,
      "TikTok native token exchange"
    );

    if (!exchange?.success) {
      throw new Error(
        exchange?.error ||
          "ArtBoost could not finish the TikTok native login."
      );
    }

    await refreshAllStatuses();

    Alert.alert(
      "TikTok Connected",
      exchange?.displayName
        ? `Connected to TikTok as ${exchange.displayName}.`
        : "TikTok was connected through the installed TikTok app."
    );
  }

  async function connectSocialPlatform(
  platform: string
) {
  console.log("Platform pressed:", JSON.stringify(platform));

  if (platform === "Pinterest") {
    const { data: sessionData } =
      await supabase.auth.getSession();

    const userId =
      sessionData.session?.user?.id;

    if (!userId) {
      Alert.alert(
        "Login Required",
        "Please log in before connecting Pinterest."
      );
      return;
    }

    await Linking.openURL(
      `${BACKEND_URL}/auth/pinterest?userId=${encodeURIComponent(
        userId
      )}`
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

      try {
        await connectTikTokThroughInstalledApp(userId);
      } catch (error: any) {
        Alert.alert(
          "TikTok Connection Failed",
          error?.message || "TikTok app authorization could not be completed."
        );
      }

      return;
    }


    if (
      platform === "Threads" ||
      platform === "LinkedIn" ||
      platform === "X"
    ) {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        Alert.alert(
          "Login Required",
          `Please log in before connecting ${platform}.`
        );
        return;
      }

      const authPaths: Record<string, string> = {
        Threads: "/auth/threads",
        LinkedIn: "/auth/linkedin",
        X: "/auth/x",
      };

      await Linking.openURL(
        `${BACKEND_URL}${authPaths[platform]}?userId=${encodeURIComponent(
          userId
        )}`
      );

      Alert.alert(
        `${platform} Login Opened`,
        `Complete the ${platform} authorization, return to ArtBoost, and refresh the connection status.`
      );

      return;
    }

    Alert.alert(
      `${platform} Connection`,
      `${platform} is currently configured through the ArtBoost server.`
    );
  }

// ARTBOOST_CONNECT_DISCONNECT_UI_FIX_20260907
  async function disconnectSocialPlatform(
    platform: string
  ) {
    try {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        throw new Error(
          `Please log in before disconnecting ${platform}.`
        );
      }

      const endpointMap: Record<
        string,
        { path: string; method: "DELETE" | "POST" }
      > = {
        Threads: {
          path: "/threads/disconnect",
          method: "DELETE",
        },
        LinkedIn: {
          path: "/linkedin/disconnect",
          method: "DELETE",
        },
        X: {
          path: "/x/disconnect",
          method: "DELETE",
        },
        TikTok: {
          path: "/tiktok/disconnect",
          method: "POST",
        },
      };

      const endpoint = endpointMap[platform];
      const isSpecificEndpoint = Boolean(endpoint);
      const method = endpoint?.method || "POST";
      const endpointPath =
        endpoint?.path || "/disconnect-platform";
      const url =
        method === "DELETE"
          ? `${BACKEND_URL}${endpointPath}?userId=${encodeURIComponent(
              userId
            )}`
          : `${BACKEND_URL}${endpointPath}`;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body:
          method === "POST"
            ? JSON.stringify({
                userId,
                platform,
              })
            : undefined,
      });

      const responseText = await response.text();
      let data: any = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = {};
        }
      }

      if (
        !response.ok ||
        data?.success === false
      ) {
        throw new Error(
          data?.error ||
            data?.details ||
            `Unable to disconnect ${platform}.`
        );
      }

      await updateStoredConnection(
        platform,
        false
      );
      await refreshAllStatuses();

      Alert.alert(
        `${platform} Disconnected`,
        `${platform} was disconnected successfully.`
      );

      if (!isSpecificEndpoint) {
        console.log(
          `${platform} disconnected through the ArtBoost generic platform endpoint.`
        );
      }
    } catch (error: any) {
      console.log(
        `${platform} disconnect failed:`,
        error
      );

      Alert.alert(
        "Disconnect Failed",
        error?.message ||
          `Unable to disconnect ${platform}.`
      );
    }
  }

  function confirmSocialDisconnect(
    platform: string
  ) {
    Alert.alert(
      `Disconnect ${platform}?`,
      `ArtBoost will stop posting to this ${platform} account until you connect it again.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () =>
            void disconnectSocialPlatform(
              platform
            ),
        },
      ]
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

      const normalizedStoreType =
        String(
          store.storeType || ""
        )
          .trim()
          .toLowerCase();

      const disconnectUrl =
        normalizedStoreType ===
        "etsy"
          ? `${BACKEND_URL}/etsy/connection?userId=${encodeURIComponent(
              userId
            )}`
          : normalizedStoreType ===
            "shopify"
          ? `${BACKEND_URL}/shopify/connection?userId=${encodeURIComponent(
              userId
            )}`
          : `${BACKEND_URL}/api/v2/store-connections/${encodeURIComponent(
              store.id
            )}?userId=${encodeURIComponent(
              userId
            )}`;

      const response =
        await fetch(
          disconnectUrl,
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
          <View style={styles.platformLogoWrap}>
            <BrandSquareIcon
              source={socialLogoSource(platform.name)}
              size={52}
              fallback="share-social-outline"
            />
          </View>

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
          {/* ARTBOOST_SOCIAL_CONNECT_RECONNECT_DISCONNECT_UI_FIX_V3_20260907 */}
          <View style={styles.socialButtonColumn}>
            {connected ? (
              <>
                <Pressable
                  style={[
                    styles.button,
                    styles.reconnectButton,
                  ]}
                  onPress={() =>
                    void connectSocialPlatform(
                      platform.name
                    )
                  }
                >
                  <Text style={styles.buttonText}>
                    Reconnect
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.button,
                    styles.disconnectButton,
                  ]}
                  onPress={() =>
                    confirmSocialDisconnect(
                      platform.name
                    )
                  }
                >
                  <Text style={styles.buttonText}>
                    Disconnect
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[
                  styles.button,
                  styles.connectButton,
                ]}
                onPress={() =>
                  void connectSocialPlatform(
                    platform.name
                  )
                }
              >
                <Text style={styles.buttonText}>
                  Connect
                </Text>
              </Pressable>
            )}
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
    const selectedForSettings =
      storeSettingsMode &&
      requestedStoreId &&
      String(store.id) === requestedStoreId;

    return (
      <View
        key={store.id}
        style={[
          styles.storeCard,
          selectedForSettings &&
            styles.storeCardSettingsTarget,
        ]}
        testID={
          selectedForSettings
            ? "artboost-store-settings-target"
            : undefined
        }
      >
        {selectedForSettings ? (
          <View style={styles.settingsTargetBanner}>
            <Ionicons
              name="settings-outline"
              size={16}
              color="#ffffff"
            />
            <Text style={styles.settingsTargetText}>
              Store Settings
            </Text>
          </View>
        ) : null}
        <View style={styles.storeTopRow}>
          <View style={styles.storeIcon}>
            <BrandSquareIcon
              source={connectedStoreLogoSource(store.storeType)}
              size={48}
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
                style={
                  store.connected
                    ? styles.connectedText
                    : styles.storeMetric
                }
              >
                {store.connected
                  ? "Connected"
                  : "Saved Store"}
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
    <>
      <ScrollView
        accessibilityLabel="Connections"
      contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(tabs)" as any);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#ffffff"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text testID="artboost-screen-connect" nativeID="artboost-screen-connect" accessibilityLabel="ArtBoost Connect screen" accessible style={styles.header}>
              Connections
            </Text>

            <Text style={styles.subheader}>
              Connect publishing platforms and online stores.
            </Text>
          </View>
        </View>

        <View style={styles.segmentedControl}>
          <Pressable
            style={[
              styles.segmentButton,
              activeSection === "social" &&
                styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSection("social")}
          >
            <Ionicons
              name="share-social-outline"
              size={18}
              color={
                activeSection === "social"
                  ? "#ffffff"
                  : "#8e8e8e"
              }
            />

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
            onPress={() => setActiveSection("stores")}
          >
            <Ionicons
              name="storefront-outline"
              size={18}
              color={
                activeSection === "stores"
                  ? "#ffffff"
                  : "#8e8e8e"
              }
            />

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

        {activeSection === "social" ? (
          <>
            <View style={styles.sectionIntroCard}>
              <View style={styles.sectionIntroIcon}>
                <Ionicons
                  name="megaphone-outline"
                  size={24}
                  color="#ffffff"
                />
              </View>

              <View style={styles.sectionIntroTextWrap}>
                <Text style={styles.sectionIntroTitle}>
                  Social Publishing
                </Text>

                <Text style={styles.sectionIntroText}>
                  Connect destinations for generated, immediate, and scheduled campaigns.
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.connectSocialButton}
              onPress={() => router.push("/universal-social" as any)}
            >
              <View style={styles.primaryActionIcon}>
                <Ionicons
                  name="add"
                  size={25}
                  color="#ffffff"
                />
              </View>

              <View style={styles.primaryActionTextWrap}>
                <Text style={styles.primaryActionTitle}>
                  Connect Social Platform
                </Text>

                <Text style={styles.primaryActionDescription}>
                  Connect supported social platforms now, with more platforms coming soon.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={22}
                color="#d8ccff"
              />
            </Pressable>

            <Pressable
              style={styles.refreshButton}
              onPress={refreshAllStatuses}
              disabled={loadingStatus}
            >
              {loadingStatus ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={19}
                  color="#ffffff"
                />
              )}

              <Text style={styles.buttonText}>
                {loadingStatus
                  ? "Checking Connections..."
                  : "Refresh Connection Status"}
              </Text>
            </Pressable>

            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeaderTitle}>
                Publishing Accounts
              </Text>

              <Text style={styles.listHeaderCount}>
                {
                  socialPlatforms.filter(platform =>
                    Boolean(socialConnections[platform.name])
                  ).length
                }
                /{socialPlatforms.length} connected
              </Text>
            </View>

            {socialPlatforms.map(renderSocialPlatform)}
          </>
        ) : (
          <>
            <View style={styles.sectionIntroCard}>
              <View style={styles.sectionIntroIcon}>
                <Ionicons
                  name="storefront-outline"
                  size={24}
                  color="#ffffff"
                />
              </View>

              <View style={styles.sectionIntroTextWrap}>
                <Text style={styles.sectionIntroTitle}>
                  Store Connections
                </Text>

                <Text style={styles.sectionIntroText}>
                  Connect storefronts and marketplaces where your artwork and products are sold.
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.connectStoreButton}
              onPress={() => openUniversalStoreConnector()}
            >
              <View style={styles.connectStorePlus}>
                <Ionicons
                  name="add"
                  size={26}
                  color="#ffffff"
                />
              </View>

              <View style={styles.connectStoreTextWrap}>
                <Text style={styles.connectStoreTitle}>
                  Connect Any Store
                </Text>

                <Text style={styles.connectStoreDescription}>
                  Paste the main storefront link. Product importing remains a separate step.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={22}
                color="#c4b5fd"
              />
            </Pressable>

            <Pressable
              style={styles.refreshButton}
              onPress={refreshAllStatuses}
              disabled={loadingStatus}
            >
              {loadingStatus ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={19}
                  color="#ffffff"
                />
              )}

              <Text style={styles.buttonText}>
                {loadingStatus
                  ? "Checking Connections..."
                  : "Refresh Store Status"}
              </Text>
            </Pressable>

            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeaderTitle}>
                Connected Stores
              </Text>

              <Text style={styles.listHeaderCount}>
                {connectedStores.length}
              </Text>
            </View>

            {loadingStatus && connectedStores.length === 0 ? (
              <View style={styles.emptyStoresCard}>
                <ActivityIndicator
                  size="large"
                  color="#9b5cff"
                />

                <Text style={styles.emptyStoresText}>
                  Loading connected stores...
                </Text>
              </View>
            ) : connectedStores.length === 0 ? (
              <View style={styles.emptyStoresCard}>
                <Ionicons
                  name="storefront-outline"
                  size={36}
                  color="#716781"
                />

                <Text style={styles.emptyStoresTitle}>
                  No stores connected
                </Text>

                <Text style={styles.emptyStoresText}>
                  Connect your first storefront. It will appear here with management controls.
                </Text>
              </View>
            ) : (
              connectedStores.map(renderStore)
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={socialModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSocialModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSocialModalOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={event => event.stopPropagation()}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>
                  Connect Social Platform
                </Text>

                <Text style={styles.modalSubtitle}>
                  Choose a supported platform to authorize or reconnect. More platforms are coming soon.
                </Text>
              </View>

              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setSocialModalOpen(false)}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            {socialPlatforms.map(platform => {
              const connected = Boolean(
                socialConnections[platform.name]
              );

              return (
                <Pressable
                  key={platform.name}
                  style={styles.modalPlatformRow}
                  onPress={async () => {
                    setSocialModalOpen(false);
                    await connectSocialPlatform(platform.name);
                  }}
                >
                  <View style={styles.modalPlatformIcon}>
                    <BrandSquareIcon
                      source={socialLogoSource(platform.name)}
                      size={42}
                      fallback="share-social-outline"
                    />
                  </View>

                  <View style={styles.modalPlatformTextWrap}>
                    <Text style={styles.modalPlatformName}>
                      {platform.name}
                    </Text>

                    <Text style={styles.modalPlatformStatus}>
                      {connected
                        ? "Connected — authorize again"
                        : "Not connected — connect now"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.modalStatusDot,
                      connected && styles.modalStatusDotConnected,
                    ]}
                  />

                  <Ionicons
                    name="chevron-forward"
                    size={21}
                    color="#9b94b7"
                  />
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 110,
    backgroundColor: "rgba(7, 6, 17, 0.88)",
    minHeight: "100%",
  },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  header: {
    color: "#ffffff",
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "900",
  },

  subheader: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderRadius: 16,
    padding: 5,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#3b3158",
    gap: 5,
  },

  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 7,
  },

  segmentButtonActive: {
    backgroundColor: "#9b5cff",
  },

  segmentText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },

  segmentTextActive: {
    color: "#ffffff",
  },

  sectionIntroCard: {
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#3f2e68",
    flexDirection: "row",
    alignItems: "center",
  },

  sectionIntroIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  sectionIntroTextWrap: {
    flex: 1,
  },

  sectionIntroTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  sectionIntroText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  connectSocialButton: {
    minHeight: 94,
    borderRadius: 18,
    backgroundColor: "rgba(36, 24, 61, 0.92)",
    borderWidth: 1,
    borderColor: "#9b5cff",
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  primaryActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryActionTextWrap: {
    flex: 1,
    paddingHorizontal: 13,
  },

  primaryActionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  primaryActionDescription: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  refreshButton: {
    minHeight: 47,
    backgroundColor: "#665cff",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 20,
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },

  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  listHeaderTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  listHeaderCount: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },

  connectStoreButton: {
    minHeight: 94,
    borderRadius: 18,
    backgroundColor: "rgba(36, 24, 61, 0.92)",
    borderWidth: 1,
    borderColor: "#9b5cff",
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  connectStorePlus: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
  },

  connectStoreTextWrap: {
    flex: 1,
    paddingHorizontal: 13,
  },

  connectStoreTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  connectStoreDescription: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  emptyStoresCard: {
    borderRadius: 18,
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderWidth: 1,
    borderColor: "#3b3158",
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
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    textAlign: "center",
  },

  card: {
    backgroundColor: "rgba(18, 16, 36, 0.92)",
    borderRadius: 18,
    padding: 17,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#49366f",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  platformLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#49366f",
  },

  platformBrandLogo: {
    width: 50,
    height: 50,
    borderRadius: 15,
  },

  platformInfo: {
    flex: 1,
    paddingRight: 10,
  },

  socialButtonColumn: {
    width: 100,
    gap: 10,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  name: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  description: {
    color: "#ffffff",
    marginTop: 7,
    lineHeight: 18,
    fontSize: 12,
  },

  status: {
    marginTop: 9,
    fontSize: 12,
    fontWeight: "800",
  },

  connectedText: {
    color: "#16c784",
    fontWeight: "800",
  },

  disconnectedText: {
    color: "#ffffff",
  },

  button: {
    minHeight: 42,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  connectButton: {
    backgroundColor: "#12a86b",
  },

  reconnectButton: {
    backgroundColor: "#665cff",
  },

  proBadge: {
    backgroundColor: "#9b5cff",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 8,
  },

  proBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },

  storeCardSettingsTarget: {
    borderColor: "#9b5cff",
    borderWidth: 2,
    backgroundColor: "#171126",
  },

  settingsTargetBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    backgroundColor: "#6d28d9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },

  settingsTargetText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  storeCard: {
    backgroundColor: "rgba(18, 16, 36, 0.92)",
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
    backgroundColor: "#21183a",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  storeBrandLogo: {
    width: 45,
    height: 45,
    borderRadius: 13,
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
    color: "#ffffff",
    fontSize: 11,
    marginTop: 6,
  },

  storeMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
  },

  storeMetric: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },

  metricSeparator: {
    color: "#ffffff",
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
    backgroundColor: "#9b5cff",
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },

  modalCard: {
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
  },

  modalHandle: {
    width: 46,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#484848",
    alignSelf: "center",
    marginBottom: 18,
  },

  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
  },

  modalTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },

  modalTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#211a38",
    alignItems: "center",
    justifyContent: "center",
  },

  modalPlatformRow: {
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: "#18142d",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  modalPlatformIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  modalPlatformBrandLogo: {
    width: 41,
    height: 41,
    borderRadius: 12,
  },

  modalPlatformTextWrap: {
    flex: 1,
  },

  modalPlatformName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  modalPlatformStatus: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 4,
  },

  modalStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: "#7c728f",
    marginRight: 10,
  },

  modalStatusDotConnected: {
    backgroundColor: "#16c784",
  },
});
