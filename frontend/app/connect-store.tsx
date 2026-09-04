// ARTBOOST_VISUAL_PARITY_V3153
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  Stack,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

function cleanHostname(hostname: string) {
  return hostname
    .replace(/^www\./i, "")
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function identifyStore(url: URL) {
  const hostname = cleanHostname(url.hostname);
  const fullUrl = url.toString().toLowerCase();

  const knownStores: {
    match: (host: string, value: string) => boolean;
    storeType: string;
    storeName: string;
    connectionMethod: string;
  }[] = [
    {
      match: host =>
        host.includes("myshopify.com") ||
        host === "shopify.com",
      storeType: "shopify",
      storeName: "Shopify",
      connectionMethod: "oauth",
    },
    {
      match: host => host.includes("etsy.com"),
      storeType: "etsy",
      storeName: "Etsy",
      connectionMethod: "oauth",
    },
    {
      match: host => host.includes("redbubble.com"),
      storeType: "redbubble",
      storeName: "Redbubble",
      connectionMethod: "artwork_import",
    },
    {
      match: host =>
        host.includes("amazon.com") ||
        host.includes("amazon.") ||
        host.includes("amzn.to"),
      storeType: "amazon",
      storeName: "Amazon",
      connectionMethod: "product_url_import",
    },
    {
      match: host => host.includes("ebay.com"),
      storeType: "ebay",
      storeName: "eBay",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("fineartamerica.com"),
      storeType: "fine_art_america",
      storeName: "Fine Art America",
      connectionMethod: "product_url_import",
    },
    {
      match: host => host.includes("artpal.com"),
      storeType: "artpal",
      storeName: "ArtPal",
      connectionMethod: "product_url_import",
    },
    {
      match: host => host.includes("society6.com"),
      storeType: "society6",
      storeName: "Society6",
      connectionMethod: "product_url_import",
    },
    {
      match: host => host.includes("gumroad.com"),
      storeType: "gumroad",
      storeName: "Gumroad",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("bigcartel.com"),
      storeType: "big_cartel",
      storeName: "Big Cartel",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("squarespace.com"),
      storeType: "squarespace",
      storeName: "Squarespace",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("wixsite.com") ||
        fullUrl.includes("wix.com"),
      storeType: "wix",
      storeName: "Wix",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("woocommerce.com"),
      storeType: "woocommerce",
      storeName: "WooCommerce",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("printify.me") ||
        host.includes("printify.com"),
      storeType: "printify",
      storeName: "Printify",
      connectionMethod: "product_url_import",
    },
    {
      match: host =>
        host.includes("printful.me") ||
        host.includes("printful.com"),
      storeType: "printful",
      storeName: "Printful",
      connectionMethod: "product_url_import",
    },
  ];

  const known = knownStores.find(item =>
    item.match(hostname, fullUrl)
  );

  if (known) {
    return {
      hostname,
      ...known,
    };
  }

  const domainWithoutSuffix =
    hostname.split(".")[0] || hostname;

  return {
    hostname,
    storeType: "custom_store",
    storeName:
      titleCase(domainWithoutSuffix) ||
      hostname,
    connectionMethod: "product_url_import",
  };
}

function getConnectionDescription(
  connectionMethod: string
) {
  if (connectionMethod === "oauth") {
    return "Secure account authorization";
  }

  if (
    connectionMethod === "artwork_import"
  ) {
    return "Artwork and product link importing";
  }

  return "Product link and manual importing";
}

export default function ConnectStoreScreen() {
  const params = useLocalSearchParams<{
    preferredType?: string;
    initialUrl?: string;
  }>();

  const [storeUrl, setStoreUrl] = useState(
    String(params.initialUrl || "")
  );

  const [connecting, setConnecting] =
    useState(false);

  const normalizedUrl = useMemo(
    () => normalizeUrl(storeUrl),
    [storeUrl]
  );

  const detectedStore = useMemo(() => {
    if (!normalizedUrl) {
      return null;
    }

    try {
      return identifyStore(
        new URL(normalizedUrl)
      );
    } catch {
      return null;
    }
  }, [normalizedUrl]);

  function returnToStores() {
    router.replace({
      pathname: "/connections" as any,
      params: {
        section: "stores",
        refreshStores: String(Date.now()),
      },
    });
  }

  async function saveUniversalStore(
    userId: string,
    parsedUrl: URL
  ) {
    if (!detectedStore) {
      throw new Error(
        "ArtBoost could not identify this website."
      );
    }

    const response = await fetch(
      `${BACKEND_URL}/api/v2/store-connections`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          platform: detectedStore.storeType,
          storeName: detectedStore.storeName,
          storeUrl: parsedUrl.toString(),
          connected: true,
          syncEnabled: true,
          metadata: {
            hostname: detectedStore.hostname,
            connectionMethod:
              detectedStore.connectionMethod,
          },
        }),
      }
    );

    const responseText =
      await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "ArtBoost could not connect this store. Please verify the storefront URL and try again."
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
          data.details ||
          "ArtBoost could not connect this store."
      );
    }

    Alert.alert(
      "Store Connected",
      `${data.connection?.storeName || detectedStore.storeName} is now connected to ArtBoost. You can manage the store and import products from the Stores tab.`,
      [
        {
          text: "View Connected Stores",
          onPress: returnToStores,
        },
      ]
    );
  }

  async function connectStore() {
    if (!normalizedUrl) {
      Alert.alert(
        "Store URL Required",
        "Paste the main link to your store or storefront."
      );
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalizedUrl);

      if (
        !["http:", "https:"].includes(
          parsedUrl.protocol
        )
      ) {
        throw new Error("Invalid protocol");
      }
    } catch {
      Alert.alert(
        "Invalid Store URL",
        "Enter a valid store or website address."
      );
      return;
    }

    try {
      setConnecting(true);

      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        Alert.alert(
          "Login Required",
          "Please log in before connecting a store."
        );
        return;
      }

      if (
        detectedStore?.storeType ===
        "shopify"
      ) {
        const shop = parsedUrl.hostname
          .replace(/^www\./i, "")
          .replace(
            /\.myshopify\.com$/i,
            ""
          );

        await Linking.openURL(
          `${BACKEND_URL}/auth/shopify?userId=${encodeURIComponent(
            userId
          )}&shop=${encodeURIComponent(shop)}`
        );

        Alert.alert(
          "Complete Shopify Connection",
          "Finish the Shopify authorization in your browser. After Shopify confirms the connection, return to ArtBoost and open Connect > Stores.",
          [
            {
              text: "OK",
              onPress: returnToStores,
            },
          ]
        );

        return;
      }

      if (
        detectedStore?.storeType === "etsy"
      ) {
        await Linking.openURL(
          `${BACKEND_URL}/auth/etsy?userId=${encodeURIComponent(
            userId
          )}`
        );

        Alert.alert(
          "Complete Etsy Connection",
          "Finish the Etsy authorization in your browser. After Etsy confirms the connection, return to ArtBoost and open Connect > Stores.",
          [
            {
              text: "OK",
              onPress: returnToStores,
            },
          ]
        );

        return;
      }

      await saveUniversalStore(
        userId,
        parsedUrl
      );
    } catch (error: any) {
      console.log(
        "Universal store connection failed:",
        error
      );

      Alert.alert(
        "Connection Failed",
        error?.message ||
          "ArtBoost could not connect this store."
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: "Connect Store",
        }}
      />

      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={returnToStores}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color="#ffffff"
              />
            </Pressable>

            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>
                UNIVERSAL CONNECTION
              </Text>

              <Text style={styles.headerTitle}>
                Connect Store
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={
              styles.scrollContent
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name="storefront-outline"
                  size={30}
                  color="#c4b5fd"
                />
              </View>

              <Text style={styles.heroTitle}>
                Connect any store
              </Text>

              <Text style={styles.heroText}>
                Paste the main storefront link
                for Amazon, Shopify, Etsy,
                Redbubble, Fine Art America, a
                personal website, or any other
                store.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>
              Store or website URL
            </Text>

            <TextInput
              style={styles.input}
              value={storeUrl}
              onChangeText={setStoreUrl}
              placeholder="https://www.yourstore.com"
              placeholderTextColor="#7c728f"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!connecting}
            />

            {detectedStore ? (
              <View style={styles.detectedCard}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={23}
                  color="#86efac"
                />

                <View
                  style={styles.detectedTextWrap}
                >
                  <Text
                    style={styles.detectedTitle}
                  >
                    {detectedStore.storeName}{" "}
                    detected
                  </Text>

                  <Text
                    style={styles.detectedText}
                  >
                    {getConnectionDescription(
                      detectedStore.connectionMethod
                    )}
                  </Text>

                  <Text
                    style={styles.detectedDomain}
                  >
                    {detectedStore.hostname}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.connectButton,
                (!storeUrl.trim() ||
                  connecting) &&
                  styles.connectButtonDisabled,
              ]}
              onPress={connectStore}
              disabled={
                !storeUrl.trim() || connecting
              }
            >
              {connecting ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="link-outline"
                  size={21}
                  color="#ffffff"
                />
              )}

              <Text
                style={styles.connectButtonText}
              >
                {connecting
                  ? "Connecting Store..."
                  : "Connect Store"}
              </Text>
            </Pressable>

            <View style={styles.explanationCard}>
              <Ionicons
                name="information-circle-outline"
                size={23}
                color="#c4b5fd"
              />

              <View
                style={styles.explanationTextWrap}
              >
                <Text
                  style={styles.explanationTitle}
                >
                  Connecting is separate from
                  importing
                </Text>

                <Text
                  style={styles.explanationText}
                >
                  This button only connects and
                  saves the store. After it appears
                  under Connected Stores, use
                  Manage Store to import products,
                  review artwork, and configure
                  automations.
                </Text>
              </View>
            </View>

            <View style={styles.examplesCard}>
              <Text style={styles.examplesTitle}>
                Examples
              </Text>

              <Text style={styles.example}>
                amazon.com/shops/yourstore
              </Text>

              <Text style={styles.example}>
                fineartamerica.com/profiles/your-name
              </Text>

              <Text style={styles.example}>
                redbubble.com/people/yourname/shop
              </Text>

              <Text style={styles.example}>
                etsy.com/shop/yourshop
              </Text>

              <Text style={styles.example}>
                www.yourwebsite.com
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
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

  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  heroCard: {
    borderRadius: 22,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
  },

  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 14,
  },

  heroText: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 10,
  },

  input: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#343434",
    color: "#ffffff",
    fontSize: 14,
    paddingHorizontal: 15,
  },

  detectedCard: {
    borderRadius: 16,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 14,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  detectedTextWrap: {
    flex: 1,
  },

  detectedTitle: {
    color: "#d1fae5",
    fontSize: 13,
    fontWeight: "900",
  },

  detectedText: {
    color: "#9ed3b3",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },

  detectedDomain: {
    color: "#70b98e",
    fontSize: 10,
    marginTop: 4,
  },

  connectButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  connectButtonDisabled: {
    backgroundColor: "#40345d",
    opacity: 0.7,
  },

  connectButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  explanationCard: {
    borderRadius: 18,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  explanationTextWrap: {
    flex: 1,
    marginLeft: 11,
  },

  explanationTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  explanationText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },

  examplesCard: {
    borderRadius: 18,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    padding: 16,
    marginTop: 18,
  },

  examplesTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 10,
  },

  example: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 19,
  },
});