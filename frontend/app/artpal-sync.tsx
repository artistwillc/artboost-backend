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
    var MAX_STEPS = 90;
    var WAIT_MS = 550;
    var stableRounds = 0;
    var previousCount = -1;
    var step = 0;
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
        var url = new URL(
          value,
          window.location.href
        );
        var host =
          String(url.hostname || "")
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

      var candidates = [
        img.getAttribute("data-original"),
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-image"),
        img.getAttribute("data-url"),
        img.currentSrc,
        img.getAttribute("src")
      ];

      for (
        var i = 0;
        i < candidates.length;
        i += 1
      ) {
        var value =
          absoluteUrl(candidates[i]);

        if (
          !value ||
          value.indexOf("/img/c.gif") >= 0 ||
          value.indexOf("data:image/gif") === 0 ||
          value.indexOf("spacer") >= 0 ||
          value.indexOf("logo") >= 0 ||
          value.indexOf("icon") >= 0 ||
          value.indexOf("avatar") >= 0
        ) {
          continue;
        }

        return value;
      }

      return "";
    }

    function looksLikeArtworkImage(img) {
      if (!img) return false;

      var src = usableImage(img);
      if (!src) return false;

      var width =
        Number(
          img.naturalWidth ||
          img.width ||
          img.getAttribute("width") ||
          0
        );

      var height =
        Number(
          img.naturalHeight ||
          img.height ||
          img.getAttribute("height") ||
          0
        );

      var rect =
        img.getBoundingClientRect
          ? img.getBoundingClientRect()
          : { width: 0, height: 0 };

      width =
        Math.max(
          width,
          Number(rect.width) || 0
        );
      height =
        Math.max(
          height,
          Number(rect.height) || 0
        );

      /*
       * ArtPal artwork thumbnails are visually substantial.
       * Exclude tiny social icons, logos, badges, etc.
       */
      return (
        width >= 90 &&
        height >= 70
      );
    }

    function nearestLink(img) {
      if (!img) return null;

      var node = img;
      var depth = 0;

      while (
        node &&
        node !== document.body &&
        depth < 8
      ) {
        if (
          node.tagName &&
          String(node.tagName)
            .toLowerCase() === "a"
        ) {
          return node;
        }

        node = node.parentElement;
        depth += 1;
      }

      return null;
    }

    function linkFromDataAttributes(node) {
      if (!node || !node.getAttribute) {
        return "";
      }

      var attrs = [
        "href",
        "data-href",
        "data-url",
        "data-link",
        "data-target",
        "data-product-url",
        "data-art-url"
      ];

      for (
        var i = 0;
        i < attrs.length;
        i += 1
      ) {
        var raw =
          node.getAttribute(attrs[i]);

        if (!raw) continue;

        var url = absoluteUrl(raw);

        if (
          url &&
          sameArtPalHost(url)
        ) {
          return url;
        }
      }

      return "";
    }

    function isExcludedUrl(urlValue) {
      try {
        var url = new URL(urlValue);
        var path =
          String(url.pathname || "")
            .toLowerCase();

        if (
          path === "/" ||
          path === "/artistwill" ||
          /\/(login|signup|register|cart|contact|about|help|privacy|terms|blog|search)(\/|$)/i.test(
            path
          )
        ) {
          return true;
        }

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|css|js)(\?|$)/i.test(
            path
          )
        ) {
          return true;
        }

        return false;
      } catch {
        return true;
      }
    }

    function titleFor(img, link) {
      var container =
        link ||
        (img && img.parentElement);

      var values = [
        img &&
          img.getAttribute &&
          img.getAttribute("alt"),
        img &&
          img.getAttribute &&
          img.getAttribute("title"),
        link &&
          link.getAttribute &&
          link.getAttribute("title"),
        link &&
          link.getAttribute &&
          link.getAttribute("aria-label")
      ];

      if (container) {
        var node = container;
        var depth = 0;

        while (
          node &&
          node !== document.body &&
          depth < 5
        ) {
          if (node.querySelector) {
            var titleNode =
              node.querySelector(
                "h1,h2,h3,h4,strong,.title,.name,[class*='title'],[class*='name']"
              );

            if (
              titleNode &&
              titleNode !== node
            ) {
              values.push(
                titleNode.textContent
              );
            }
          }

          node = node.parentElement;
          depth += 1;
        }
      }

      for (
        var i = 0;
        i < values.length;
        i += 1
      ) {
        var value =
          cleanText(values[i]);

        if (
          value &&
          value.length > 2 &&
          value.length < 260 &&
          value.toLowerCase() !== "artpal" &&
          value.toLowerCase() !== "artistwill"
        ) {
          return value;
        }
      }

      return "ArtPal Artwork";
    }

    function candidateUrl(img) {
      var link = nearestLink(img);

      if (link) {
        var url =
          linkFromDataAttributes(link);

        if (
          url &&
          !isExcludedUrl(url)
        ) {
          return {
            url: url,
            link: link
          };
        }
      }

      /*
       * Some ArtPal cards put navigation attributes on a wrapping div
       * rather than on the image's nearest anchor.
       */
      var node =
        img && img.parentElement;
      var depth = 0;

      while (
        node &&
        node !== document.body &&
        depth < 8
      ) {
        var dataUrl =
          linkFromDataAttributes(node);

        if (
          dataUrl &&
          !isExcludedUrl(dataUrl)
        ) {
          return {
            url: dataUrl,
            link: node
          };
        }

        node = node.parentElement;
        depth += 1;
      }

      return {
        url: "",
        link: link
      };
    }

    function collectProducts() {
      var images =
        Array.from(
          document.querySelectorAll("img")
        );

      images.forEach(function (img) {
        if (!looksLikeArtworkImage(img)) {
          return;
        }

        var candidate =
          candidateUrl(img);

        if (!candidate.url) {
          return;
        }

        var imageUrl =
          usableImage(img);

        if (!imageUrl) {
          return;
        }

        var title =
          titleFor(
            img,
            candidate.link
          );

        /*
         * Keep the first good rendition for a URL, but improve the
         * title/image later if a better duplicate card appears.
         */
        var current =
          discoveredByUrl[
            candidate.url
          ];

        if (!current) {
          discoveredByUrl[
            candidate.url
          ] = {
            title: title,
            description: "",
            productUrl:
              candidate.url,
            imageUrl: imageUrl,
            price: null,
            currency: "USD"
          };
          return;
        }

        if (
          current.title ===
            "ArtPal Artwork" &&
          title !==
            "ArtPal Artwork"
        ) {
          current.title = title;
        }

        if (
          !current.imageUrl &&
          imageUrl
        ) {
          current.imageUrl =
            imageUrl;
        }
      });

      /*
       * Second pass: inspect all same-host links whose surrounding
       * card contains a substantial image. This catches ArtPal card
       * layouts where the image itself is not nested directly in the link.
       */
      var links =
        Array.from(
          document.querySelectorAll(
            "a[href],[data-href],[data-url],[data-link]"
          )
        );

      links.forEach(function (node) {
        var url =
          linkFromDataAttributes(node);

        if (
          !url ||
          isExcludedUrl(url) ||
          discoveredByUrl[url]
        ) {
          return;
        }

        var scope = node;
        var depth = 0;
        var image = null;

        while (
          scope &&
          scope !== document.body &&
          depth < 5 &&
          !image
        ) {
          if (
            scope.querySelectorAll
          ) {
            var imgs =
              Array.from(
                scope.querySelectorAll(
                  "img"
                )
              );

            image =
              imgs.find(
                looksLikeArtworkImage
              ) || null;
          }

          scope =
            scope.parentElement;
          depth += 1;
        }

        if (!image) return;

        var imageUrl =
          usableImage(image);

        if (!imageUrl) return;

        discoveredByUrl[url] = {
          title:
            titleFor(
              image,
              node
            ),
          description: "",
          productUrl: url,
          imageUrl: imageUrl,
          price: null,
          currency: "USD"
        };
      });

      return Object.keys(
        discoveredByUrl
      ).map(function (key) {
        return discoveredByUrl[key];
      });
    }

    function sampleDiagnostics() {
      var anchors =
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        )
          .slice(0, 40)
          .map(function (a) {
            return {
              text:
                cleanText(
                  a.textContent
                ).slice(0, 100),
              href:
                absoluteUrl(
                  a.getAttribute("href")
                )
            };
          });

      var images =
        Array.from(
          document.querySelectorAll(
            "img"
          )
        )
          .slice(0, 40)
          .map(function (img) {
            return {
              alt:
                cleanText(
                  img.getAttribute("alt")
                ).slice(0, 100),
              src:
                usableImage(img),
              width:
                img.naturalWidth ||
                img.width ||
                0,
              height:
                img.naturalHeight ||
                img.height ||
                0
            };
          });

      return {
        sampleLinks: anchors,
        sampleImages: images
      };
    }

    function post(type, extra) {
      var products =
        collectProducts();

      var payload =
        Object.assign(
          {
            type: type,
            products: products,
            scannedCount:
              products.length,
            step: step,
            pageUrl:
              window.location.href,
            scrollY:
              window.scrollY,
            scrollHeight:
              Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
              )
          },
          extra || {}
        );

      if (
        type ===
          "artpal_complete" &&
        products.length === 0
      ) {
        payload =
          Object.assign(
            payload,
            sampleDiagnostics()
          );
      }

      window.ReactNativeWebView.postMessage(
        JSON.stringify(payload)
      );

      return products;
    }

    function clickLoadMore() {
      var candidates =
        Array.from(
          document.querySelectorAll(
            "button,a,[role='button']"
          )
        );

      candidates.forEach(function (el) {
        var label =
          cleanText(
            el.textContent
          ).toLowerCase();

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

    function continueScan() {
      step += 1;

      var products =
        post("artpal_progress");

      if (
        products.length ===
        previousCount
      ) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        previousCount =
          products.length;
      }

      clickLoadMore();

      var viewport =
        Math.max(
          window.innerHeight || 0,
          document.documentElement.clientHeight || 0,
          600
        );

      /*
       * Move gradually so ArtPal's lazy-loaded cards actually enter
       * the viewport instead of jumping directly past them.
       */
      var nextY =
        window.scrollY +
        Math.max(
          Math.floor(
            viewport * 0.78
          ),
          420
        );

      var maxY =
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ) - viewport;

      window.scrollTo(
        0,
        Math.min(
          nextY,
          Math.max(
            maxY,
            0
          )
        )
      );

      var reachedBottom =
        window.scrollY >=
        Math.max(
          maxY - 30,
          0
        );

      if (
        step >= MAX_STEPS ||
        (
          reachedBottom &&
          stableRounds >= 8
        )
      ) {
        /*
         * One final collection pass after lazy content settles.
         */
        setTimeout(
          function () {
            post(
              "artpal_complete"
            );
          },
          900
        );
        return;
      }

      setTimeout(
        continueScan,
        WAIT_MS
      );
    }

    setTimeout(
      continueScan,
      1200
    );
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "artpal_error",
        error:
          error &&
          error.message
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

      if (
        Number(message.scannedCount || 0) === 0
      ) {
        console.log(
          "ARTPAL SCAN DIAGNOSTICS",
          message
        );
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
