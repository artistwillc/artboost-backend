import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
    var MAX_STEPS = 70;
    var WAIT_MS = 500;
    var step = 0;
    var previousCount = -1;
    var stableRounds = 0;
    var discoveredByUrl = {};

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

    function sameArtPalHost(value) {
      try {
        var url = new URL(value, window.location.href);
        var host = String(url.hostname || "")
          .replace(/^www\\./i, "")
          .toLowerCase();

        return (
          host === "artpal.com" ||
          host.endsWith(".artpal.com")
        );
      } catch {
        return false;
      }
    }

    function usableImage(img) {
      if (!img) return "";

      var values = [
        img.getAttribute("data-original"),
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-image"),
        img.getAttribute("data-url"),
        img.currentSrc,
        img.getAttribute("src")
      ];

      for (var i = 0; i < values.length; i += 1) {
        var url = absoluteUrl(values[i]);

        if (
          !url ||
          url.indexOf("data:image/gif") === 0 ||
          url.indexOf("/img/c.gif") >= 0 ||
          /(?:logo|icon|avatar|spacer)/i.test(url)
        ) {
          continue;
        }

        return url;
      }

      return "";
    }

    function looksLikeArtworkImage(img) {
      if (!img) return false;

      var src = usableImage(img);
      if (!src) return false;

      var rect = img.getBoundingClientRect
        ? img.getBoundingClientRect()
        : { width: 0, height: 0 };

      var width = Math.max(
        Number(img.naturalWidth || img.width || 0),
        Number(rect.width || 0)
      );

      var height = Math.max(
        Number(img.naturalHeight || img.height || 0),
        Number(rect.height || 0)
      );

      return width >= 90 && height >= 70;
    }

    function readUrlFromNode(node) {
      if (!node || !node.getAttribute) return "";

      var attrs = [
        "href",
        "data-href",
        "data-url",
        "data-link",
        "data-target",
        "data-product-url",
        "data-art-url"
      ];

      for (var i = 0; i < attrs.length; i += 1) {
        var raw = node.getAttribute(attrs[i]);
        if (!raw) continue;

        var url = absoluteUrl(raw);
        if (url && sameArtPalHost(url)) {
          return url;
        }
      }

      return "";
    }

    function excludedUrl(value) {
      try {
        var url = new URL(value);
        var path = String(url.pathname || "").toLowerCase();

        if (
          path === "/" ||
          path === "/artistwill" ||
          /\/(?:login|signup|register|cart|contact|about|help|privacy|terms|blog|search)(?:\/|$)/i.test(path) ||
          /\.(?:jpg|jpeg|png|gif|webp|svg|css|js)(?:\?|$)/i.test(path)
        ) {
          return true;
        }

        return false;
      } catch {
        return true;
      }
    }

    function nearestCandidateNode(img) {
      var node = img;
      var depth = 0;

      while (
        node &&
        node !== document.body &&
        depth < 10
      ) {
        var url = readUrlFromNode(node);
        if (url && !excludedUrl(url)) {
          return { node: node, url: url };
        }

        node = node.parentElement;
        depth += 1;
      }

      return { node: null, url: "" };
    }

    function titleFor(img, node) {
      var values = [
        img && img.getAttribute && img.getAttribute("alt"),
        img && img.getAttribute && img.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("title"),
        node && node.getAttribute && node.getAttribute("aria-label")
      ];

      var scope = node || (img && img.parentElement);
      var depth = 0;

      while (
        scope &&
        scope !== document.body &&
        depth < 5
      ) {
        if (scope.querySelector) {
          var titleNode = scope.querySelector(
            "h1,h2,h3,h4,strong,.title,.name,[class*='title'],[class*='name']"
          );

          if (titleNode && titleNode !== scope) {
            values.push(titleNode.textContent);
          }
        }

        scope = scope.parentElement;
        depth += 1;
      }

      for (var i = 0; i < values.length; i += 1) {
        var text = cleanText(values[i]);

        if (
          text &&
          text.length > 2 &&
          text.length < 260 &&
          text.toLowerCase() !== "artpal" &&
          text.toLowerCase() !== "artistwill"
        ) {
          return text;
        }
      }

      return "ArtPal Artwork";
    }

    function collectProducts() {
      var images = Array.from(document.querySelectorAll("img"));

      images.forEach(function (img) {
        if (!looksLikeArtworkImage(img)) return;

        var candidate = nearestCandidateNode(img);
        if (!candidate.url) return;

        var imageUrl = usableImage(img);
        if (!imageUrl) return;

        if (!discoveredByUrl[candidate.url]) {
          discoveredByUrl[candidate.url] = {
            title: titleFor(img, candidate.node),
            description: "",
            productUrl: candidate.url,
            imageUrl: imageUrl,
            price: null,
            currency: "USD"
          };
        }
      });

      return Object.keys(discoveredByUrl).map(function (key) {
        return discoveredByUrl[key];
      });
    }

    function getScrollableCandidates() {
      var nodes = [document.scrollingElement, document.documentElement, document.body]
        .concat(Array.from(document.querySelectorAll("div,main,section")));

      var ranked = [];

      nodes.forEach(function (el) {
        if (!el) return;

        var scrollHeight = Number(el.scrollHeight || 0);
        var clientHeight = Number(el.clientHeight || 0);

        if (scrollHeight <= clientHeight + 40) {
          return;
        }

        var overflowY = "";
        try {
          overflowY = window.getComputedStyle(el).overflowY || "";
        } catch {}

        var score =
          (scrollHeight - clientHeight) +
          (/auto|scroll/i.test(overflowY) ? 100000 : 0);

        ranked.push({
          el: el,
          score: score,
          scrollHeight: scrollHeight,
          clientHeight: clientHeight
        });
      });

      ranked.sort(function (a, b) {
        return b.score - a.score;
      });

      return ranked;
    }

    function getScroller() {
      var ranked = getScrollableCandidates();
      return ranked.length ? ranked[0].el : (document.scrollingElement || document.documentElement || document.body);
    }

    function clickLoadMore() {
      Array.from(
        document.querySelectorAll("button,a,[role='button']")
      ).forEach(function (el) {
        var label = cleanText(el.textContent).toLowerCase();

        if (
          label === "show more" ||
          label === "load more" ||
          label === "more artworks" ||
          label === "view more"
        ) {
          try {
            el.click();
          } catch {}
        }
      });
    }

    function diagnostics() {
      var scroller = getScroller();

      return {
        pageTitle: document.title,
        bodyScrollHeight: document.body ? document.body.scrollHeight : 0,
        documentScrollHeight: document.documentElement ? document.documentElement.scrollHeight : 0,
        scrollerTag: scroller && scroller.tagName ? scroller.tagName : "unknown",
        scrollerClass: scroller && scroller.className ? String(scroller.className).slice(0, 300) : "",
        scrollerScrollTop: scroller ? Number(scroller.scrollTop || 0) : 0,
        scrollerScrollHeight: scroller ? Number(scroller.scrollHeight || 0) : 0,
        scrollerClientHeight: scroller ? Number(scroller.clientHeight || 0) : 0,
        sampleLinks: Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 80)
          .map(function (a) {
            return {
              text: cleanText(a.textContent).slice(0, 120),
              href: absoluteUrl(a.getAttribute("href"))
            };
          }),
        sampleImages: Array.from(document.querySelectorAll("img"))
          .slice(0, 80)
          .map(function (img) {
            return {
              alt: cleanText(img.getAttribute("alt")).slice(0, 120),
              src: usableImage(img),
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0
            };
          })
      };
    }

    function post(type, extra) {
      var products = collectProducts();

      var payload = Object.assign(
        {
          type: type,
          products: products,
          scannedCount: products.length,
          step: step,
          pageUrl: window.location.href
        },
        extra || {}
      );

      window.ReactNativeWebView.postMessage(
        JSON.stringify(payload)
      );

      return products;
    }

    function finish(reason) {
      post(
        "artpal_complete",
        Object.assign(
          { finishReason: reason || "complete" },
          diagnostics()
        )
      );
    }

    function advanceScroller() {
      var scroller = getScroller();

      if (!scroller) return false;

      var viewport = Math.max(
        Number(scroller.clientHeight || 0),
        Number(window.innerHeight || 0),
        500
      );

      var maxTop = Math.max(
        Number(scroller.scrollHeight || 0) - viewport,
        0
      );

      var currentTop =
        scroller === document.documentElement ||
        scroller === document.body ||
        scroller === document.scrollingElement
          ? Number(window.scrollY || scroller.scrollTop || 0)
          : Number(scroller.scrollTop || 0);

      var nextTop = Math.min(
        currentTop + Math.max(Math.floor(viewport * 0.75), 400),
        maxTop
      );

      try {
        if (
          scroller === document.documentElement ||
          scroller === document.body ||
          scroller === document.scrollingElement
        ) {
          window.scrollTo(0, nextTop);
        } else {
          scroller.scrollTop = nextTop;
          if (scroller.scrollTo) {
            scroller.scrollTo(0, nextTop);
          }
        }
      } catch {}

      return nextTop >= Math.max(maxTop - 20, 0);
    }

    function runStep() {
      step += 1;

      var products = post("artpal_progress");

      if (products.length === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        previousCount = products.length;
      }

      clickLoadMore();
      var reachedBottom = advanceScroller();

      if (
        step >= MAX_STEPS ||
        (reachedBottom && stableRounds >= 8)
      ) {
        setTimeout(function () {
          finish(
            step >= MAX_STEPS
              ? "max_steps"
              : "stable_bottom"
          );
        }, 700);
        return;
      }

      setTimeout(runStep, WAIT_MS);
    }

    /*
     * Hard watchdog: never allow this WebView scan to spin indefinitely.
     */
    setTimeout(function () {
      finish("hard_timeout");
    }, 58000);

    setTimeout(runStep, 1000);
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
  const finishedRef = useRef(false);

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

  useEffect(() => {
    if (!syncing) return;

    const timer = setTimeout(() => {
      if (finishedRef.current) return;

      finishedRef.current = true;
      setSyncing(false);
      setStatus("ArtPal scan timed out.");

      Alert.alert(
        "ArtPal Scan Timed Out",
        "ArtBoost stopped the ArtPal scan after 65 seconds. Check the Metro terminal for ARTPAL SCAN DIAGNOSTICS."
      );
    }, 65000);

    return () => clearTimeout(timer);
  }, [syncing]);

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

      if (finishedRef.current) {
        return;
      }

      finishedRef.current = true;

      console.log(
        "ARTPAL SCAN DIAGNOSTICS",
        message
      );

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
