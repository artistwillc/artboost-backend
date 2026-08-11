import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  WebViewMessageEvent,
} from "react-native-webview";

import { supabase } from "@/lib/supabase";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type ArtPalProduct = {
  title: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  price: number | null;
  currency: string;
};

type ScannerMessage = {
  type?: string;
  products?: ArtPalProduct[];
  scannedCount?: number;
  step?: number;
  error?: string;
  pageUrl?: string;
};

function normalizeUrl(value: unknown, base?: string) {
  try {
    return new URL(
      String(value || ""),
      base || undefined
    ).toString();
  } catch {
    return "";
  }
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const ARTPAL_FULL_SYNC_SCRIPT = `
(function () {
  try {
    var MAX_STEPS = 55;
    var WAIT_MS = 650;
    var stableRounds = 0;
    var previousCount = -1;
    var step = 0;

    function cleanText(value) {
      return String(value || "")
        .replace(/\\s+/g, " ")
        .trim();
    }

    function absoluteUrl(value) {
      try {
        return new URL(
          String(value || ""),
          window.location.href
        ).toString();
      } catch {
        return "";
      }
    }

    function usableImage(img) {
      if (!img) return "";

      var value =
        img.getAttribute("data-original") ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-image") ||
        img.currentSrc ||
        img.getAttribute("src") ||
        "";

      value = absoluteUrl(value);

      if (
        !value ||
        value.indexOf("/img/c.gif") >= 0 ||
        value.indexOf("data:image/gif") === 0 ||
        value.indexOf("spacer") >= 0
      ) {
        return "";
      }

      return value;
    }

    function candidateImage(anchor) {
      var direct =
        anchor.querySelector &&
        anchor.querySelector("img");

      var directUrl = usableImage(direct);
      if (directUrl) return directUrl;

      var node = anchor;
      var depth = 0;

      while (
        node &&
        node !== document.body &&
        depth < 7
      ) {
        if (node.querySelectorAll) {
          var imgs =
            Array.from(
              node.querySelectorAll("img")
            );

          for (var i = 0; i < imgs.length; i += 1) {
            var url = usableImage(imgs[i]);
            if (url) return url;
          }
        }

        node = node.parentElement;
        depth += 1;
      }

      return "";
    }

    function candidateTitle(anchor, image) {
      var values = [
        image &&
          image.getAttribute &&
          image.getAttribute("alt"),
        image &&
          image.getAttribute &&
          image.getAttribute("title"),
        anchor.getAttribute("aria-label"),
        anchor.getAttribute("title"),
        anchor.querySelector &&
          anchor.querySelector("strong") &&
          anchor.querySelector("strong").textContent,
        anchor.querySelector &&
          anchor.querySelector("[title]") &&
          anchor.querySelector("[title]").getAttribute("title"),
        anchor.textContent
      ];

      for (var i = 0; i < values.length; i += 1) {
        var text = cleanText(values[i]);
        if (
          text &&
          text.length > 2 &&
          text.toLowerCase() !== "view" &&
          text.toLowerCase() !== "buy"
        ) {
          return text.slice(0, 240);
        }
      }

      return "ArtPal Artwork";
    }

    function isListingLink(anchor) {
      var raw =
        anchor.getAttribute("href") || "";

      if (!raw) return false;

      var url;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return false;
      }

      var host =
        String(url.hostname || "")
          .replace(/^www\\./i, "")
          .toLowerCase();

      if (
        host !== "artpal.com" &&
        !host.endsWith(".artpal.com")
      ) {
        return false;
      }

      if (url.searchParams.has("i")) {
        return true;
      }

      return (
        /[?&]i=[^&#]+/i.test(url.href) ||
        /\\/artwork\\//i.test(url.pathname) ||
        /\\/art\\//i.test(url.pathname)
      );
    }

    function collectProducts() {
      var anchors =
        Array.from(
          document.querySelectorAll("a[href]")
        );

      var products = [];
      var seen = {};

      anchors.forEach(function (anchor) {
        if (!isListingLink(anchor)) {
          return;
        }

        var productUrl =
          absoluteUrl(
            anchor.getAttribute("href")
          );

        if (
          !productUrl ||
          seen[productUrl]
        ) {
          return;
        }

        var image =
          anchor.querySelector &&
          anchor.querySelector("img");

        var imageUrl =
          candidateImage(anchor);

        var title =
          candidateTitle(anchor, image);

        seen[productUrl] = true;

        products.push({
          title: title,
          description: "",
          productUrl: productUrl,
          imageUrl: imageUrl,
          price: null,
          currency: "USD"
        });
      });

      return products;
    }

    function post(type, extra) {
      var products = collectProducts();

      window.ReactNativeWebView.postMessage(
        JSON.stringify(
          Object.assign(
            {
              type: type,
              products: products,
              scannedCount: products.length,
              step: step,
              pageUrl: window.location.href
            },
            extra || {}
          )
        )
      );

      return products;
    }

    function continueScan() {
      step += 1;

      var products = post("artpal_progress");

      if (products.length === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        previousCount = products.length;
      }

      window.scrollTo(
        0,
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        )
      );

      var moreButtons =
        Array.from(
          document.querySelectorAll(
            "button, a"
          )
        );

      moreButtons.forEach(function (el) {
        var label =
          cleanText(el.textContent)
            .toLowerCase();

        if (
          label === "show more" ||
          label === "load more" ||
          label === "more"
        ) {
          try {
            el.click();
          } catch {}
        }
      });

      if (
        step >= MAX_STEPS ||
        stableRounds >= 6
      ) {
        post("artpal_complete");
        return;
      }

      setTimeout(
        continueScan,
        WAIT_MS
      );
    }

    setTimeout(
      continueScan,
      900
    );
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "artpal_error",
        error:
          error && error.message
            ? error.message
            : String(error)
      })
    );
  }

  true;
})();
`;

export default function ArtPalSyncScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    storeUrl?: string;
    productCount?: string;
  }>();

  const webViewRef = useRef<WebView>(null);
  const startedRef = useRef(false);

  const storeId = String(params.storeId || "");
  const storeName = String(params.storeName || "ArtPal");
  const storeUrl = normalizeUrl(
    params.storeUrl || ""
  );

  const previousCount = useMemo(() => {
    const parsed = Number(params.productCount);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [params.productCount]);

  const [status, setStatus] = useState(
    "Loading ArtPal storefront..."
  );
  const [syncing, setSyncing] =
    useState(true);
  const [detected, setDetected] =
    useState(0);

  async function importProducts(
    products: ArtPalProduct[]
  ) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(userError.message);
    }

    if (!user) {
      throw new Error(
        "Please sign in before syncing ArtPal."
      );
    }

    const unique = new Map<
      string,
      ArtPalProduct
    >();

    for (const raw of products) {
      const productUrl =
        normalizeUrl(
          raw.productUrl,
          storeUrl
        );

      if (!productUrl) continue;

      const imageUrl =
        normalizeUrl(
          raw.imageUrl,
          productUrl
        );

      unique.set(productUrl, {
        title:
          cleanText(raw.title) ||
          "ArtPal Artwork",
        description:
          cleanText(raw.description),
        productUrl,
        imageUrl,
        price:
          raw.price === null ||
          raw.price === undefined
            ? null
            : Number(raw.price),
        currency:
          cleanText(raw.currency) ||
          "USD",
      });
    }

    const items = [...unique.values()];

    if (items.length === 0) {
      throw new Error(
        "ArtBoost could not identify ArtPal listing URLs in the rendered storefront."
      );
    }

    setStatus(
      `Syncing ${items.length} ArtPal listings...`
    );

    let imported = 0;
    let updated = 0;
    const failed: string[] = [];

    for (
      let index = 0;
      index < items.length;
      index += 1
    ) {
      const product = items[index];

      setStatus(
        `Syncing ArtPal listing ${
          index + 1
        } of ${items.length}...`
      );

      try {
        const response = await fetch(
          `${API_BASE}/catalog/import-product`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              storeId,
              storeName,
              storeType: "artpal",
              title: product.title,
              description:
                product.description,
              imageUrl:
                product.imageUrl || null,
              productUrl:
                product.productUrl,
              price:
                Number.isFinite(
                  Number(product.price)
                )
                  ? Number(product.price)
                  : null,
              currency:
                product.currency,
              productType:
                "Artwork",
              tags: [],
            }),
          }
        );

        const text =
          await response.text();

        let data: any;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            `Backend returned ${response.status}.`
          );
        }

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              data.details ||
              "Import failed."
          );
        }

        if (data.action === "created") {
          imported += 1;
        } else {
          updated += 1;
        }
      } catch (error: any) {
        failed.push(
          `${product.title}: ${
            error?.message ||
            "sync failed"
          }`
        );
      }
    }

    setSyncing(false);
    setStatus("ArtPal sync complete.");

    const estimatedTotal =
      Math.max(
        previousCount + imported,
        items.length
      );

    Alert.alert(
      "ArtPal Synced",
      [
        `${imported} new listings added.`,
        `${updated} existing listings refreshed.`,
        failed.length
          ? `${failed.length} listings could not be synced.`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      [
        {
          text: "View Products",
          onPress: () =>
            router.replace({
              pathname:
                "/store-products" as any,
              params: {
                storeId,
                storeName,
                storeType:
                  "artpal",
                productCount:
                  String(
                    estimatedTotal
                  ),
                connected:
                  "true",
              },
            }),
        },
        {
          text: "Done",
          onPress: () =>
            router.replace({
              pathname:
                "/store-dashboard" as any,
              params: {
                storeId,
                storeName,
                storeType:
                  "artpal",
                storeUrl,
                productCount:
                  String(
                    estimatedTotal
                  ),
                connected:
                  "true",
                lastSyncedAt:
                  new Date()
                    .toISOString(),
              },
            }),
        },
      ]
    );
  }

  function handleMessage(
    event: WebViewMessageEvent
  ) {
    try {
      const message: ScannerMessage =
        JSON.parse(
          event.nativeEvent.data
        );

      if (
        message.type ===
        "artpal_progress"
      ) {
        const count =
          Number(
            message.scannedCount
          ) || 0;

        setDetected(count);
        setStatus(
          `${count} ArtPal listings found — scanning store...`
        );
        return;
      }

      if (
        message.type ===
        "artpal_error"
      ) {
        throw new Error(
          message.error ||
            "ArtPal scan failed."
        );
      }

      if (
        message.type !==
        "artpal_complete"
      ) {
        return;
      }

      const products =
        Array.isArray(
          message.products
        )
          ? message.products
          : [];

      setDetected(
        products.length
      );

      importProducts(
        products
      ).catch((error: any) => {
        setSyncing(false);
        setStatus(
          "ArtPal sync failed."
        );
        Alert.alert(
          "Sync Failed",
          error?.message ||
            "ArtBoost could not sync ArtPal."
        );
      });
    } catch (error: any) {
      setSyncing(false);
      setStatus(
        "ArtPal sync failed."
      );
      Alert.alert(
        "Sync Failed",
        error?.message ||
          "ArtBoost could not read the ArtPal storefront."
      );
    }
  }

  if (!storeUrl) {
    return (
      <SafeAreaView
        style={styles.screen}
      >
        <View
          style={styles.centerCard}
        >
          <Text
            style={styles.title}
          >
            ArtPal Sync
          </Text>
          <Text
            style={styles.message}
          >
            The saved ArtPal store URL is missing. Return to Connections and reconnect the ArtPal storefront URL.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={styles.buttonText}
            >
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#ffffff"
          />
        </Pressable>

        <View
          style={styles.headerText}
        >
          <Text
            style={styles.eyebrow}
          >
            ARTPAL CLIENT SYNC
          </Text>
          <Text
            style={styles.title}
          >
            Sync ArtPal
          </Text>
        </View>
      </View>

      <View
        style={styles.statusCard}
      >
        <View
          style={styles.statusRow}
        >
          {syncing ? (
            <ActivityIndicator
              size="small"
              color="#a78bfa"
            />
          ) : (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color="#86efac"
            />
          )}

          <View
            style={styles.statusTextWrap}
          >
            <Text
              style={styles.statusText}
            >
              {status}
            </Text>
            <Text
              style={styles.countText}
            >
              {detected} detected
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.helper}>
        ArtPal blocks ArtBoost's Render server from reading product pages. This screen scans the storefront from the in-app browser instead, then sends the discovered listings to the same ArtBoost catalog.
      </Text>

      <View
        style={styles.webViewWrap}
      >
        <WebView
          ref={webViewRef}
          source={{ uri: storeUrl }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onMessage={
            handleMessage
          }
          onLoadEnd={() => {
            if (
              startedRef.current
            ) {
              return;
            }

            startedRef.current =
              true;
            setStatus(
              "Scanning ArtPal storefront..."
            );

            webViewRef.current
              ?.injectJavaScript(
                ARTPAL_FULL_SYNC_SCRIPT
              );
          }}
          onError={(event) => {
            setSyncing(false);
            setStatus(
              "ArtPal page failed to load."
            );
            Alert.alert(
              "ArtPal Load Failed",
              event.nativeEvent
                .description ||
                "The ArtPal storefront could not be opened."
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    paddingLeft: 14,
  },
  eyebrow: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 3,
  },
  statusCard: {
    marginHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#302641",
    backgroundColor: "#171717",
    padding: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  statusText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  countText: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },
  helper: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 18,
    marginHorizontal: 20,
    marginVertical: 14,
  },
  webViewWrap: {
    flex: 1,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  centerCard: {
    margin: 22,
    borderRadius: 20,
    backgroundColor: "#171717",
    padding: 20,
  },
  message: {
    color: "#b6b6b6",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  button: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
