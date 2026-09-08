import { Ionicons } from "@expo/vector-icons";
import ArtBoostRemoteImage from "@/components/ArtBoostRemoteImage";
import {
  router,
  Stack,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  WebView,
  WebViewMessageEvent,
} from "react-native-webview";

import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type ScannedProduct = {
  id: string;
  title: string;
  description: string;
  productUrl: string;
  imageUrl: string;
  price: number | null;
  currency: string;
  selected: boolean;
};

type RawScannedProduct = {
  title?: string;
  description?: string;
  productUrl?: string;
  imageUrl?: string;
  price?: number | null;
  currency?: string;
};

type ScannerMessage = {
  type?: string;
  products?: RawScannedProduct[];
  error?: string;
  pageUrl?: string;
  pageTitle?: string;
  totalLinks?: number;
  totalImages?: number;
  sampleLinks?: Array<{
    href?: string;
    text?: string;
  }>;
  sampleImages?: Array<{
    src?: string;
    alt?: string;
  }>;
  htmlSnippet?: string;
  scannedCount?: number;
  scrollStep?: number;
  maxScrollSteps?: number;
  elapsedMs?: number;
  pageNumber?: number;
};

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(
  value: unknown,
  baseUrl?: string
) {
  try {
    const input = String(value || "").trim();

    if (!input) {
      return "";
    }

    return new URL(
      input,
      baseUrl || undefined
    ).toString();
  } catch {
    return "";
  }
}

function getRedbubbleArtworkId(
  value: unknown
) {
  const text = String(value || "");

  const match =
    text.match(
      /\/shop\/ap\/(\d+)/i
    ) ||
    text.match(
      /\/i\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i
    );

  return match?.[1] || "";
}

function getRedbubbleExplorePageUrl(
  value: unknown,
  page: number
) {
  try {
    const parsed =
      new URL(String(value || ""));

    const host =
      parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    if (
      host !== "redbubble.com" &&
      !host.endsWith(".redbubble.com")
    ) {
      return "";
    }

    const usernameMatch =
      parsed.pathname.match(
        /\/people\/([^/]+)/i
      );

    if (!usernameMatch?.[1]) {
      return "";
    }

    const username =
      decodeURIComponent(
        usernameMatch[1]
      );

    const next =
      new URL(
        `https://www.redbubble.com/people/${encodeURIComponent(
          username
        )}/explore`
      );

    next.searchParams.set(
      "page",
      String(
        Math.max(1, Math.floor(page))
      )
    );

    next.searchParams.set(
      "sortOrder",
      "recent"
    );

    return next.toString();
  } catch {
    return "";
  }
}

function makeProductId(productUrl: string) {
  return productUrl
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

/*
 * This script runs inside the WebView.
 *
 * It uses multiple discovery strategies:
 *
 * 1. Product-like links and cards
 * 2. Images wrapped in clickable links
 * 3. Lazy-loaded image attributes
 * 4. Nearby text for titles and descriptions
 * 5. Price extraction from nearby elements
 *
 * It also sends page inspection data to Metro so we
 * can diagnose unsupported storefront layouts.
 */
const SCAN_PAGE_SCRIPT = `
(function () {
  try {
    const cleanText = function (value) {
      return String(value || "")
        .replace(/\\s+/g, " ")
        .trim();
    };

    const absoluteUrl = function (value) {
      try {
        return new URL(
          String(value || ""),
          window.location.href
        ).toString();
      } catch {
        return "";
      }
    };

    const imageCandidate = function (image) {
      if (!image) {
        return "";
      }

      const srcset =
        image.getAttribute("srcset") ||
        image.getAttribute("data-srcset") ||
        "";

      const srcsetFirst =
        srcset
          .split(",")
          .map(function (part) {
            return cleanText(part).split(" ")[0] || "";
          })
          .filter(Boolean)[0] || "";

      return (
        image.getAttribute("data-original") ||
        image.getAttribute("data-src") ||
        image.getAttribute("data-lazy-src") ||
        image.currentSrc ||
        image.getAttribute("src") ||
        srcsetFirst ||
        ""
      );
    };

    const nearbyImage = function (link) {
      let image = link.querySelector("img");

      if (image) {
        return image;
      }

      let node = link.parentElement;
      let depth = 0;

      while (node && depth < 6) {
        image = node.querySelector
          ? node.querySelector("img")
          : null;

        if (image) {
          return image;
        }

        node = node.parentElement;
        depth += 1;
      }

      return null;
    };

    const redbubbleInfo = function (rawHref) {
      try {
        const url = new URL(
          String(rawHref || ""),
          window.location.href
        );

        if (
          !/(^|\\.)redbubble\\.com$/i.test(
            url.hostname
          )
        ) {
          return null;
        }

        const parts = url.pathname
          .split("/")
          .filter(Boolean);

        const iIndex = parts.findIndex(function (part) {
          return part.toLowerCase() === "i";
        });

        if (
          iIndex < 0 ||
          parts.length < iIndex + 5
        ) {
          return null;
        }

        const designId =
          parts[iIndex + 3] || "";

        if (!/^\\d+$/.test(designId)) {
          return null;
        }

        const slug =
          decodeURIComponent(
            parts[iIndex + 2] || ""
          );

        const byIndex =
          slug.toLowerCase().lastIndexOf("-by-");

        const titleFromSlug =
          cleanText(
            (byIndex > 0
              ? slug.slice(0, byIndex)
              : slug
            ).replace(/[-_]+/g, " ")
          );

        url.search = "";
        url.hash = "";

        return {
          productUrl: url.toString(),
          designId,
          titleFromSlug
        };
      } catch {
        return null;
      }
    };

    const cleanRedbubbleTitle = function (
      rawTitle,
      fallbackTitle
    ) {
      const clean =
        cleanText(rawTitle || "");

      const itemPreview =
        clean.match(
          /^Item preview,\\s*(.*?)\\s+designed and sold by\\b/i
        );

      if (itemPreview?.[1]) {
        return cleanText(
          itemPreview[1]
        );
      }

      if (
        !clean ||
        /<\\/?(?:img|svg|div|span|a)\\b/i.test(clean) ||
        /data-testid=/i.test(clean)
      ) {
        return cleanText(
          fallbackTitle || ""
        );
      }

      return clean;
    };

    const products = [];
    const seen = {};

    const addProduct = function (product, key) {
      if (
        !product ||
        !product.productUrl ||
        !product.imageUrl ||
        seen[key || product.productUrl]
      ) {
        return;
      }

      seen[key || product.productUrl] = true;
      products.push(product);
    };

    Array.from(
      document.querySelectorAll("a.iCg[href]")
    ).forEach(function (card) {
      const rawHref =
        card.getAttribute("href") || "";

      const productUrl =
        absoluteUrl(rawHref);

      if (
        !productUrl ||
        !rawHref.includes("?i=")
      ) {
        return;
      }

      const image =
        card.querySelector("img");

      const imageUrl =
        absoluteUrl(imageCandidate(image));

      if (
        !imageUrl ||
        imageUrl.includes("/img/c.gif")
      ) {
        return;
      }

      const titleElement =
        card.querySelector("strong");

      addProduct(
        {
          title:
            cleanText(
              titleElement?.textContent ||
              image?.getAttribute("alt") ||
              "ArtPal Artwork"
            ),
          description: "",
          productUrl,
          imageUrl,
          price: null,
          currency: "USD"
        },
        productUrl
      );
    });

    Array.from(
      document.querySelectorAll("a[href]")
    ).forEach(function (link) {
      const info =
        redbubbleInfo(
          link.getAttribute("href") || ""
        );

      if (!info) {
        return;
      }

      const image =
        nearbyImage(link);

      const imageUrl =
        absoluteUrl(
          imageCandidate(image)
        );

      if (!imageUrl) {
        return;
      }

      const title =
        cleanRedbubbleTitle(
          image?.getAttribute("alt") ||
            link.getAttribute("aria-label") ||
            link.textContent,
          info.titleFromSlug ||
            "Redbubble Artwork"
        );

      addProduct(
        {
          title:
            title ||
            info.titleFromSlug ||
            "Redbubble Artwork",
          description: "",
          productUrl:
            info.productUrl,
          imageUrl,
          price: null,
          currency: "USD"
        },
        "redbubble:" + info.designId
      );
    });

    const sampleLinks =
      Array.from(
        document.querySelectorAll("a[href]")
      )
        .slice(0, 25)
        .map(function (link) {
          return {
            href:
              absoluteUrl(
                link.getAttribute("href") || ""
              ),
            text:
              cleanText(
                link.textContent ||
                link.getAttribute("aria-label") ||
                ""
              ).slice(0, 140)
          };
        });

    const sampleImages =
      Array.from(
        document.querySelectorAll("img")
      )
        .slice(0, 20)
        .map(function (image) {
          return {
            src:
              absoluteUrl(
                imageCandidate(image)
              ),
            alt:
              cleanText(
                image.getAttribute("alt") || ""
              ).slice(0, 140)
          };
        });

    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "scan_results",
        products,
        pageUrl: window.location.href,
        pageTitle: document.title,
        totalLinks:
          document.querySelectorAll("a[href]").length,
        totalImages:
          document.querySelectorAll("img").length,
        sampleLinks,
        sampleImages,
        htmlSnippet:
          String(
            document.body?.innerHTML || ""
          ).slice(0, 2500),
        pageNumber:
          Number(
            new URL(
              window.location.href
            ).searchParams.get("page") || 1
          ) || 1
      })
    );
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "scan_error",
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

const FULL_STORE_SCAN_SCRIPT = `
(function () {
  try {
    var MAX_STEPS = 90;
    var WAIT_MS = 650;
    var MAX_RUNTIME_MS = 70000;
    var scanStartedAt = Date.now();
    var stableRounds = 0;
    var previousHeight = 0;
    var previousCount = 0;
    var currentStep = 0;
    var accumulated = {};
    var accumulatedOrder = [];
    var finished = false;

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

    function imageCandidate(image) {
      if (!image) {
        return "";
      }

      var srcset =
        image.getAttribute("srcset") ||
        image.getAttribute("data-srcset") ||
        "";

      var srcsetFirst =
        srcset
          .split(",")
          .map(function (part) {
            return cleanText(part).split(" ")[0] || "";
          })
          .filter(Boolean)[0] || "";

      return (
        image.getAttribute("data-original") ||
        image.getAttribute("data-src") ||
        image.getAttribute("data-lazy-src") ||
        image.currentSrc ||
        image.getAttribute("src") ||
        srcsetFirst ||
        ""
      );
    }

    function nearbyImage(link) {
      var image = link.querySelector("img");

      if (image) {
        return image;
      }

      var node = link.parentElement;
      var depth = 0;

      while (node && depth < 6) {
        image = node.querySelector
          ? node.querySelector("img")
          : null;

        if (image) {
          return image;
        }

        node = node.parentElement;
        depth += 1;
      }

      return null;
    }

    function redbubbleInfo(rawHref) {
      try {
        var url = new URL(
          String(rawHref || ""),
          window.location.href
        );

        if (
          !/(^|\\.)redbubble\\.com$/i.test(
            url.hostname
          )
        ) {
          return null;
        }

        var parts = url.pathname
          .split("/")
          .filter(Boolean);

        var iIndex = parts.findIndex(function (part) {
          return part.toLowerCase() === "i";
        });

        if (
          iIndex < 0 ||
          parts.length < iIndex + 5
        ) {
          return null;
        }

        var designId =
          parts[iIndex + 3] || "";

        if (!/^\\d+$/.test(designId)) {
          return null;
        }

        var slug =
          decodeURIComponent(
            parts[iIndex + 2] || ""
          );

        var byIndex =
          slug.toLowerCase().lastIndexOf("-by-");

        var titleFromSlug =
          cleanText(
            (byIndex > 0
              ? slug.slice(0, byIndex)
              : slug
            ).replace(/[-_]+/g, " ")
          );

        url.search = "";
        url.hash = "";

        return {
          productUrl: url.toString(),
          designId: designId,
          titleFromSlug: titleFromSlug
        };
      } catch {
        return null;
      }
    }

    function cleanRedbubbleTitle(
      rawTitle,
      fallbackTitle
    ) {
      var clean =
        cleanText(rawTitle || "");

      var itemPreview =
        clean.match(
          /^Item preview,\\s*(.*?)\\s+designed and sold by\\b/i
        );

      if (
        itemPreview &&
        itemPreview[1]
      ) {
        return cleanText(
          itemPreview[1]
        );
      }

      if (
        !clean ||
        /<\\/?(?:img|svg|div|span|a)\\b/i.test(clean) ||
        /data-testid=/i.test(clean)
      ) {
        return cleanText(
          fallbackTitle || ""
        );
      }

      return clean;
    }

    function addAccumulated(product, key) {
      if (
        !product ||
        !product.productUrl ||
        !product.imageUrl ||
        accumulated[key]
      ) {
        return;
      }

      accumulated[key] = product;
      accumulatedOrder.push(key);
    }

    function collectProducts() {
      Array.from(
        document.querySelectorAll("a.iCg[href]")
      ).forEach(function (card) {
        var rawHref =
          card.getAttribute("href") || "";

        if (!rawHref.includes("?i=")) {
          return;
        }

        var productUrl =
          absoluteUrl(rawHref);

        var image =
          card.querySelector("img");

        var imageUrl =
          absoluteUrl(
            imageCandidate(image)
          );

        if (
          !productUrl ||
          !imageUrl ||
          imageUrl.includes("/img/c.gif")
        ) {
          return;
        }

        var titleElement =
          card.querySelector("strong");

        addAccumulated(
          {
            title:
              cleanText(
                titleElement &&
                  titleElement.textContent
              ) ||
              cleanText(
                image &&
                  image.getAttribute("alt")
              ) ||
              "ArtPal Artwork",
            description: "",
            productUrl: productUrl,
            imageUrl: imageUrl,
            price: null,
            currency: "USD"
          },
          "artpal:" + productUrl
        );
      });

      Array.from(
        document.querySelectorAll("a[href]")
      ).forEach(function (link) {
        var info =
          redbubbleInfo(
            link.getAttribute("href") || ""
          );

        if (!info) {
          return;
        }

        var image =
          nearbyImage(link);

        var imageUrl =
          absoluteUrl(
            imageCandidate(image)
          );

        if (!imageUrl) {
          return;
        }

        var title =
          cleanRedbubbleTitle(
            (image &&
              image.getAttribute("alt")) ||
              link.getAttribute("aria-label") ||
              link.textContent,
            info.titleFromSlug ||
              "Redbubble Artwork"
          );

        addAccumulated(
          {
            title:
              title ||
              info.titleFromSlug ||
              "Redbubble Artwork",
            description: "",
            productUrl:
              info.productUrl,
            imageUrl: imageUrl,
            price: null,
            currency: "USD"
          },
          "redbubble:" + info.designId
        );
      });

      return accumulatedOrder.map(function (key) {
        return accumulated[key];
      });
    }

    function maybeClickLoadMore() {
      var controls = Array.from(
        document.querySelectorAll(
          "button, [role='button'], a[href]"
        )
      );

      var button = controls.find(function (item) {
        var text =
          cleanText(
            item.textContent ||
            item.getAttribute("aria-label") ||
            ""
          ).toLowerCase();

        return (
          text === "load more" ||
          text === "show more" ||
          text === "view more" ||
          text === "load more products" ||
          text === "show more products"
        );
      });

      if (
        button &&
        typeof button.click === "function"
      ) {
        button.click();
        return true;
      }

      return false;
    }

    function sampleLinks() {
      return Array.from(
        document.querySelectorAll("a[href]")
      )
        .slice(0, 25)
        .map(function (link) {
          return {
            href:
              absoluteUrl(
                link.getAttribute("href") || ""
              ),
            text:
              cleanText(
                link.textContent ||
                link.getAttribute("aria-label") ||
                ""
              ).slice(0, 140)
          };
        });
    }

    function sampleImages() {
      return Array.from(
        document.querySelectorAll("img")
      )
        .slice(0, 20)
        .map(function (image) {
          return {
            src:
              absoluteUrl(
                imageCandidate(image)
              ),
            alt:
              cleanText(
                image.getAttribute("alt") || ""
              ).slice(0, 140)
          };
        });
    }

    function sendProgress() {
      var products =
        collectProducts();

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "scan_progress",
          scannedCount: products.length,
          scrollStep: currentStep,
          maxScrollSteps: MAX_STEPS,
          elapsedMs:
            Date.now() - scanStartedAt
        })
      );
    }

    function finishScan() {
      if (finished) {
        return;
      }

      finished = true;
      collectProducts();

      window.scrollTo(
        0,
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        )
      );

      setTimeout(function () {
        var products =
          collectProducts();

        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "scan_results",
            products: products,
            pageUrl:
              window.location.href,
            pageTitle:
              document.title,
            totalLinks:
              document.querySelectorAll(
                "a[href]"
              ).length,
            totalImages:
              document.querySelectorAll(
                "img"
              ).length,
            sampleLinks:
              sampleLinks(),
            sampleImages:
              sampleImages(),
            htmlSnippet:
              String(
                document.body &&
                  document.body.innerHTML ||
                  ""
              ).slice(0, 2500)
          })
        );
      }, 700);
    }

    function scrollAndScan() {
      if (finished) {
        return;
      }

      if (
        Date.now() - scanStartedAt >=
        MAX_RUNTIME_MS
      ) {
        finishScan();
        return;
      }

      currentStep += 1;

      var beforeProducts =
        collectProducts().length;

      maybeClickLoadMore();

      var currentHeight =
        Math.max(
          document.body.scrollHeight,
          document.documentElement
            .scrollHeight
        );

      window.scrollTo({
        top: currentHeight,
        behavior: "smooth"
      });

      sendProgress();

      setTimeout(function () {
        var products =
          collectProducts();

        var newHeight =
          Math.max(
            document.body.scrollHeight,
            document.documentElement
              .scrollHeight
          );

        var countChanged =
          products.length > previousCount ||
          products.length > beforeProducts;

        var heightChanged =
          newHeight >
          previousHeight + 10;

        if (
          !heightChanged &&
          !countChanged
        ) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }

        previousHeight =
          newHeight;
        previousCount =
          products.length;

        if (
          stableRounds >= 5 ||
          currentStep >= MAX_STEPS ||
          Date.now() - scanStartedAt >=
            MAX_RUNTIME_MS
        ) {
          finishScan();
          return;
        }

        scrollAndScan();
      }, WAIT_MS);
    }

    previousHeight =
      Math.max(
        document.body.scrollHeight,
        document.documentElement
          .scrollHeight
      );

    previousCount =
      collectProducts().length;

    sendProgress();
    scrollAndScan();
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "scan_error",
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

export default function AIStoreScannerScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    storeUrl?: string;
    autoSync?: string;
  }>();

  const webViewRef =
    useRef<WebView>(null);

  const autoSync =
    params.autoSync === "true";

  const autoSyncResolvedRef =
    useRef(false);

  const autoSyncScanStartedRef =
    useRef(false);

  const redbubblePageScanTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const redbubblePagedScanRef =
    useRef<{
      active: boolean;
      page: number;
      maxPages: number;
      emptyOrDuplicatePages: number;
      pageScanRetries: number;
      lastRequestedUrl: string;
      products: Map<
        string,
        ScannedProduct
      >;
    }>({
      active: false,
      page: 1,
      maxPages: 20,
      emptyOrDuplicatePages: 0,
      pageScanRetries: 0,
      lastRequestedUrl: "",
      products: new Map(),
    });

  const storeId = String(
    params.storeId || ""
  );

  const storeName = String(
    params.storeName ||
      "Connected Store"
  );

  const storeType = String(
    params.storeType ||
      "custom_store"
  )
    .trim()
    .toLowerCase();

  const [storeUrl, setStoreUrl] =
    useState(
      String(params.storeUrl || "")
    );

  const [browserUrl, setBrowserUrl] =
    useState("");

  const [products, setProducts] =
    useState<ScannedProduct[]>([]);

  const [pageLoading, setPageLoading] =
    useState(false);

  const [scanning, setScanning] =
    useState(false);

    const [fullStoreScanning, setFullStoreScanning] =
  useState(false);

const [scanProgress, setScanProgress] =
  useState("");

  const [importing, setImporting] =
    useState(false);

  const selectedProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.selected
      ),
    [products]
  );

  useEffect(() => {
    return () => {
      if (
        redbubblePageScanTimerRef.current
      ) {
        clearTimeout(
          redbubblePageScanTimerRef.current
        );
        redbubblePageScanTimerRef.current =
          null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      storeType !== "redbubble" ||
      !redbubblePagedScanRef.current.active ||
      !browserUrl
    ) {
      return;
    }

    if (
      redbubblePageScanTimerRef.current
    ) {
      clearTimeout(
        redbubblePageScanTimerRef.current
      );
    }

    redbubblePageScanTimerRef.current =
      setTimeout(() => {
        if (
          redbubblePagedScanRef.current.active
        ) {
          webViewRef.current?.injectJavaScript(
            SCAN_PAGE_SCRIPT
          );
        }
      }, 1800);

    return () => {
      if (
        redbubblePageScanTimerRef.current
      ) {
        clearTimeout(
          redbubblePageScanTimerRef.current
        );
        redbubblePageScanTimerRef.current =
          null;
      }
    };
  }, [
    browserUrl,
    storeType,
  ]);

  useEffect(() => {
    if (
      !autoSync ||
      autoSyncResolvedRef.current
    ) {
      return;
    }

    autoSyncResolvedRef.current = true;
    let active = true;

    async function resolveSavedStoreUrl() {
      try {
        const directUrl = normalizeUrl(
          String(params.storeUrl || "")
        );

        if (directUrl) {
          if (active) {
            setStoreUrl(directUrl);

            const refreshUrl =
              storeType === "redbubble"
                ? getRedbubbleExplorePageUrl(
                    directUrl,
                    1
                  ) || directUrl
                : directUrl;

            if (storeType === "redbubble") {
            redbubblePagedScanRef.current = {
              active: true,
              page: 1,
              maxPages: 20,
              emptyOrDuplicatePages: 0,
              pageScanRetries: 0,
              lastRequestedUrl: "",
              products: new Map(),
            };
            setFullStoreScanning(true);
            setScanProgress(
              "Refreshing Redbubble — loading page 1..."
            );
            autoSyncScanStartedRef.current = true;
            redbubblePagedScanRef.current.lastRequestedUrl =
              refreshUrl;
            scheduleRedbubblePageWatchdog(
              refreshUrl
            );
          }

          setBrowserUrl(refreshUrl);
          }
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error(userError.message);
        }

        if (!user) {
          throw new Error(
            "Please sign in before refreshing a store."
          );
        }

        const response = await fetch(
          `${API_BASE}/api/v2/store-connections/${encodeURIComponent(storeId)}?userId=${encodeURIComponent(user.id)}&_=${Date.now()}`,
          { headers: { "Cache-Control": "no-cache" } }
        );
        const responseText = await response.text();
        let data: any;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Store lookup returned HTTP ${response.status}.`
          );
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.details ||
              data.error ||
              "Unable to load the saved store connection."
          );
        }

        const savedStore = data.connection || null;

        const savedUrl = normalizeUrl(
          savedStore?.storeUrl || ""
        );

        if (!savedUrl) {
          throw new Error(
            "This store connection is missing its saved storefront URL. Open Store Settings once to repair the connection."
          );
        }

        if (active) {
          setStoreUrl(savedUrl);

          const refreshUrl =
            storeType === "redbubble"
              ? getRedbubbleExplorePageUrl(
                  savedUrl,
                  1
                ) || savedUrl
              : savedUrl;

          if (storeType === "redbubble") {
            redbubblePagedScanRef.current = {
              active: true,
              page: 1,
              maxPages: 20,
              emptyOrDuplicatePages: 0,
              pageScanRetries: 0,
              lastRequestedUrl: "",
              products: new Map(),
            };
            setFullStoreScanning(true);
            setScanProgress(
              "Refreshing Redbubble — loading page 1..."
            );
            autoSyncScanStartedRef.current = true;
            redbubblePagedScanRef.current.lastRequestedUrl =
              refreshUrl;
            scheduleRedbubblePageWatchdog(
              refreshUrl
            );
          }

          setBrowserUrl(refreshUrl);
        }
      } catch (error: any) {
        if (active) {
          Alert.alert(
            "Refresh Unavailable",
            error?.message ||
              "ArtBoost could not load this store's saved connection."
          );
        }
      }
    }

    resolveSavedStoreUrl();

    return () => {
      active = false;
    };
  }, [
    autoSync,
    params.storeUrl,
    storeId,
    storeType,
  ]);

  function openStore() {
    let normalized =
      normalizeUrl(storeUrl);

    if (
      !normalized &&
      storeUrl &&
      !storeUrl.startsWith("http")
    ) {
      normalized = normalizeUrl(
        `https://${storeUrl}`
      );
    }

    if (!normalized) {
      Alert.alert(
        "Store URL Required",
        "Enter a valid storefront URL."
      );

      return;
    }

    setStoreUrl(normalized);
    setBrowserUrl(normalized);
    setProducts([]);
  }

  function scheduleRedbubblePageWatchdog(
    expectedUrl: string
  ) {
    setTimeout(() => {
      const state =
        redbubblePagedScanRef.current;

      if (
        !state.active ||
        state.lastRequestedUrl !== expectedUrl
      ) {
        return;
      }

      if (state.pageScanRetries >= 2) {
        state.active = false;
        state.lastRequestedUrl = "";
        setFullStoreScanning(false);
        setScanProgress("");

        Alert.alert(
          "Redbubble Page Scan Failed",
          "The Redbubble page loaded, but ArtBoost did not receive the page scan result."
        );
        return;
      }

      state.pageScanRetries += 1;

      setScanProgress(
        `Refreshing Redbubble — retrying page ${state.page}...`
      );

      webViewRef.current?.injectJavaScript(
        SCAN_PAGE_SCRIPT
      );

      scheduleRedbubblePageWatchdog(
        expectedUrl
      );
    }, 12000);
  }

  function startRedbubblePagedScan() {
    const firstPageUrl =
      getRedbubbleExplorePageUrl(
        storeUrl || browserUrl,
        1
      );

    if (!firstPageUrl) {
      Alert.alert(
        "Redbubble Refresh Unavailable",
        "ArtBoost could not determine the saved Redbubble Explore URL."
      );
      return;
    }

    redbubblePagedScanRef.current = {
      active: true,
      page: 1,
      maxPages: 20,
      emptyOrDuplicatePages: 0,
      pageScanRetries: 0,
      lastRequestedUrl: "",
      products: new Map(),
    };

    setProducts([]);
    setFullStoreScanning(true);
    setScanProgress(
      "Refreshing Redbubble — loading page 1..."
    );

    redbubblePagedScanRef.current.lastRequestedUrl =
      firstPageUrl;

    scheduleRedbubblePageWatchdog(
      firstPageUrl
    );

    if (browserUrl === firstPageUrl) {
      if (
        redbubblePageScanTimerRef.current
      ) {
        clearTimeout(
          redbubblePageScanTimerRef.current
        );
      }

      redbubblePageScanTimerRef.current =
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(
            SCAN_PAGE_SCRIPT
          );
        }, 1800);
    } else {
      setBrowserUrl(firstPageUrl);
    }
  }

  function scanVisiblePage() {
  if (!browserUrl) {
    Alert.alert(
      "Open Store First",
      "Open the storefront before scanning for products."
    );

    return;
  }

  setScanning(true);

  webViewRef.current?.injectJavaScript(
    SCAN_PAGE_SCRIPT
  );

  setTimeout(() => {
    setScanning((current) => {
      if (current) {
        Alert.alert(
          "Scan Timed Out",
          "ArtBoost did not receive a response from the storefront. Reload the page and try again."
        );
      }

      return false;
    });
  }, 15000);
}

function scanEntireStore() {
  if (!browserUrl) {
    Alert.alert(
      "Open Store First",
      "Open the storefront before scanning the entire store."
    );

    return;
  }

  if (storeType === "redbubble") {
    startRedbubblePagedScan();
    return;
  }

  setProducts([]);
  setFullStoreScanning(true);
  setScanProgress(
    "Starting full store scan..."
  );

  webViewRef.current?.injectJavaScript(
    FULL_STORE_SCAN_SCRIPT
  );

  setTimeout(() => {
    setFullStoreScanning(
      (stillScanning) => {
        if (stillScanning) {
          Alert.alert(
            "Full Scan Timed Out",
            "The storefront did not return final scan results within 100 seconds. Reload the store and try again."
          );
        }

        return false;
      }
    );
  }, 100000);
}

  async function importCatalogProductsBatch(
    userId: string,
    items: ScannedProduct[]
  ) {
    if (items.length === 0) {
      return {
        importedCount: 0,
        failed: [] as any[],
      };
    }

    const response = await fetch(
      `${API_BASE}/catalog/import-products-batch`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          userId,
          storeId:
            storeId || null,
          storeName,
          storeType,
          products:
            items.map(
              (product) => ({
                title:
                  product.title,
                description:
                  product.description,
                imageUrl:
                  product.imageUrl,
                productUrl:
                  product.productUrl,
                price:
                  product.price,
                currency:
                  product.currency,
                productType:
                  "Artwork",
                tags: [],
              })
            ),
        }),
      }
    );

    const responseText =
      await response.text();

    let data: any;

    try {
      data =
        JSON.parse(responseText);
    } catch {
      throw new Error(
        `Batch import returned HTTP ${response.status}.`
      );
    }

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
          data.details ||
          "Batch import failed."
      );
    }

    return {
      importedCount:
        Number(data.importedCount) || 0,
      failed:
        Array.isArray(data.failed)
          ? data.failed
          : [],
    };
  }

  async function syncDiscoveredProducts(
    discoveredProducts: ScannedProduct[]
  ) {
    try {
      setImporting(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message);
      }

      if (!user) {
        throw new Error(
          "Please sign in before refreshing products."
        );
      }

      const productsResponse = await fetch(
        `${API_BASE}/products?userId=${encodeURIComponent(
          user.id
        )}`
      );
      const productsText =
        await productsResponse.text();
      let productsData: any;

      try {
        productsData = JSON.parse(productsText);
      } catch {
        throw new Error(
          `Product lookup returned HTTP ${productsResponse.status}.`
        );
      }

      if (
        !productsResponse.ok ||
        !productsData.success
      ) {
        throw new Error(
          productsData.details ||
            productsData.error ||
            "Unable to compare the existing catalog."
        );
      }

      const existingUrls = new Set(
        (productsData.products || [])
          .map((item: any) =>
            normalizeUrl(item.product_url || "")
          )
          .filter(Boolean)
      );

      const newProducts = discoveredProducts.filter(
        (product) =>
          !existingUrls.has(
            normalizeUrl(product.productUrl)
          )
      );

      const batchResult =
        await importCatalogProductsBatch(
          user.id,
          newProducts
        );

      const importedCount =
        batchResult.importedCount;

      const failed =
        batchResult.failed.map(
          (item: any) =>
            `${item.title || "Listing"}: ${
              item.error ||
              "Import failed"
            }`
        );

      if (storeUrl) {
        try {
          await fetch(`${API_BASE}/stores/connect`, {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              storeName,
              storeType,
              storeUrl,
              connectionMethod:
                "saved_connection_refresh",
            }),
          });
        } catch {
          // Product refresh remains valid if timestamp touch fails.
        }
      }

      const unchangedCount =
        discoveredProducts.length -
        newProducts.length;

      Alert.alert(
        failed.length
          ? "Refresh Completed with Issues"
          : "Store Refresh Complete",
        [
          `${discoveredProducts.length} listing${
            discoveredProducts.length === 1
              ? ""
              : "s"
          } found.`,
          `${unchangedCount} already in ArtBoost.`,
          `${importedCount} new listing${
            importedCount === 1 ? "" : "s"
          } added.`,
          failed.length
            ? `${failed.length} could not be imported. First error: ${failed[0]}`
            : "Saved store connection reused — no link entry required.",
        ].join("\n"),
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
                  storeType,
                  connected: "true",
                },
              }),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        "Refresh Failed",
        error?.message ||
          "ArtBoost could not refresh this store."
      );
    } finally {
      setImporting(false);
    }
  }

  async function finishRedbubblePagedScan() {
    const state =
      redbubblePagedScanRef.current;

    if (!state.active) {
      return;
    }

    state.active = false;
    state.lastRequestedUrl = "";

    const allProducts =
      Array.from(
        state.products.values()
      );

    setProducts(allProducts);
    setFullStoreScanning(false);
    setScanProgress("");

    if (allProducts.length === 0) {
      Alert.alert(
        "No Products Detected",
        "ArtBoost could not identify Redbubble designs from the saved Explore pages."
      );
      return;
    }

    if (autoSync) {
      await syncDiscoveredProducts(
        allProducts
      );
      return;
    }

    Alert.alert(
      "Full Scan Complete",
      `${allProducts.length} unique Redbubble design${
        allProducts.length === 1
          ? ""
          : "s"
      } detected.`
    );
  }

  async function handleScannerMessage(
    event: WebViewMessageEvent
  ) {
    try {
      const message: ScannerMessage =
        JSON.parse(
          event.nativeEvent.data
        );

        if (
  message.type ===
  "scan_progress"
) {
  setScanProgress(
    `${message.scannedCount || 0} products found — scanning store section ${
      message.scrollStep || 0
    }${
      message.elapsedMs
        ? ` (${Math.round(message.elapsedMs / 1000)}s)`
        : ""
    }`
  );

  return;
}

      if (
        message.type ===
        "scan_error"
      ) {
        throw new Error(
          message.error ||
            "The storefront could not be scanned."
        );
      }

      if (
        message.type !==
        "scan_results"
      ) {
        return;
      }

      console.log(
        "ARTBOOST PAGE INSPECTION",
        {
          pageTitle:
            message.pageTitle,
          pageUrl:
            message.pageUrl,
          totalLinks:
            message.totalLinks,
          totalImages:
            message.totalImages,
          sampleLinks:
            message.sampleLinks,
          sampleImages:
            message.sampleImages,
          htmlSnippet:
            message.htmlSnippet,
        }
      );

      const discovered =
        Array.isArray(
          message.products
        )
          ? message.products
          : [];

      const mapped:
        ScannedProduct[] = [];

      const seen =
        new Set<string>();

      for (
        const item of discovered
      ) {
        const productUrl =
          normalizeUrl(
            item.productUrl,
            browserUrl
          );

        const imageUrl =
          normalizeUrl(
            item.imageUrl,
            browserUrl
          );

        if (
          !productUrl ||
          !imageUrl ||
          seen.has(productUrl)
        ) {
          continue;
        }

        seen.add(productUrl);

        const parsedPrice =
          item.price === null ||
          item.price ===
            undefined
            ? null
            : Number(item.price);

        mapped.push({
          id:
            makeProductId(
              productUrl
            ) ||
            `${mapped.length}`,
          title:
            cleanText(
              item.title
            ) ||
            "Imported Artwork",
          description:
            cleanText(
              item.description
            ),
          productUrl,
          imageUrl,
          price:
            parsedPrice !== null &&
            Number.isFinite(
              parsedPrice
            )
              ? parsedPrice
              : null,
          currency:
            cleanText(
              item.currency
            ) || "USD",
          selected: true,
        });
      }

      if (
        storeType === "redbubble" &&
        redbubblePagedScanRef.current.active
      ) {
        const state =
          redbubblePagedScanRef.current;

        state.pageScanRetries = 0;
        state.lastRequestedUrl = "";

        let newUniqueCount = 0;

        for (const product of mapped) {
          const artworkId =
            getRedbubbleArtworkId(
              product.productUrl
            );

          const key =
            artworkId
              ? `redbubble:${artworkId}`
              : normalizeUrl(
                  product.productUrl
                );

          if (!key) {
            continue;
          }

          const existing =
            state.products.get(key);

          if (!existing) {
            state.products.set(
              key,
              product
            );
            newUniqueCount += 1;
          } else if (
            !existing.imageUrl &&
            product.imageUrl
          ) {
            state.products.set(
              key,
              product
            );
          }
        }

        if (newUniqueCount === 0) {
          state.emptyOrDuplicatePages += 1;
        } else {
          state.emptyOrDuplicatePages = 0;
        }

        setProducts(
          Array.from(
            state.products.values()
          )
        );

        setScanProgress(
          `${state.products.size} unique Redbubble designs found — page ${state.page}`
        );

        console.log(
          "ARTBOOST REDBUBBLE PAGE COMPLETE",
          {
            page: state.page,
            browserUrl,
            discovered: mapped.length,
            uniqueTotal:
              state.products.size,
          }
        );

        const shouldFinish =
          state.emptyOrDuplicatePages >= 1 ||
          state.page >= state.maxPages;

        if (shouldFinish) {
          await finishRedbubblePagedScan();
          return;
        }

        state.page += 1;

        const nextPageUrl =
          getRedbubbleExplorePageUrl(
            storeUrl || browserUrl,
            state.page
          );

        if (!nextPageUrl) {
          await finishRedbubblePagedScan();
          return;
        }

        state.lastRequestedUrl =
          nextPageUrl;

        scheduleRedbubblePageWatchdog(
          nextPageUrl
        );

        setBrowserUrl(nextPageUrl);
        return;
      }

      setProducts(mapped);

      if (autoSync && mapped.length > 0) {
        await syncDiscoveredProducts(mapped);
        return;
      }

      if (mapped.length === 0) {
        Alert.alert(
          "No Products Detected",
          [
            "ArtBoost could not identify product links on this visible page.",
            "",
            `Links found: ${
              message.totalLinks || 0
            }`,
            `Images found: ${
              message.totalImages || 0
            }`,
            "",
            fullStoreScanning
              ? "ArtBoost automatically scrolled the storefront but could not identify supported product links."
              : "Try Scan Entire Store so ArtBoost can automatically load more storefront listings.",
            "",
            "Inspection details were also printed in the Metro terminal.",
          ].join("\n")
        );
      } else {
        Alert.alert(
          "Scan Complete",
          `${mapped.length} product${
            mapped.length === 1
              ? ""
              : "s"
          } detected on this page.`
        );
      }
    } catch (error: any) {
      Alert.alert(
        "Scan Failed",
        error?.message ||
          "ArtBoost could not analyze this storefront."
      );
    } finally {
      setScanning(false);

      if (
        !redbubblePagedScanRef.current.active
      ) {
        setFullStoreScanning(false);
        setScanProgress("");
      }
    }
  }

  function toggleProduct(
    productId: string
  ) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
              ...product,
              selected:
                !product.selected,
            }
          : product
      )
    );
  }

  function selectAll() {
    setProducts((current) =>
      current.map((product) => ({
        ...product,
        selected: true,
      }))
    );
  }

  function clearAll() {
    setProducts((current) =>
      current.map((product) => ({
        ...product,
        selected: false,
      }))
    );
  }

  async function importSelected() {
    if (
      selectedProducts.length === 0
    ) {
      Alert.alert(
        "Nothing Selected",
        "Select at least 1 product to import."
      );

      return;
    }

    try {
      setImporting(true);

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          userError.message
        );
      }

      if (!user) {
        throw new Error(
          "Please sign in before importing products."
        );
      }

      const batchResult =
        await importCatalogProductsBatch(
          user.id,
          selectedProducts
        );

      const importedCount =
        batchResult.importedCount;

      const failed =
        batchResult.failed.map(
          (item: any) =>
            `${item.title || "Listing"}: ${
              item.error ||
              "Import failed"
            }`
        );

      if (importedCount === 0) {
        throw new Error(
          failed[0] ||
            "No products were imported."
        );
      }

      Alert.alert(
        "Import Complete",
        [
          `${importedCount} product${
            importedCount === 1
              ? ""
              : "s"
          } imported.`,
          failed.length
            ? `${failed.length} failed.`
            : "All selected products imported successfully.",
        ].join("\n"),
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
                  storeType,
                  connected:
                    "true",
                },
              }),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        "Import Failed",
        error?.message ||
          "ArtBoost could not import the selected products."
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <SafeAreaView
        style={styles.screen}
      >
        <View style={styles.header}>
          <Pressable
            style={
              styles.headerButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#ffffff"
            />
          </Pressable>

          <View
            style={
              styles.headerTextWrap
            }
          >
            <Text
              style={styles.eyebrow}
            >
              AI STORE IMPORT
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
              Universal Scanner
            </Text>
          </View>

          <View
            style={styles.aiBadge}
          >
            <Ionicons
              name="sparkles"
              size={17}
              color="#ffffff"
            />
          </View>
        </View>

        <View
          style={styles.urlSection}
        >
          <Text
            style={styles.storeLabel}
          >
            {storeName}
          </Text>

          <View
            style={styles.urlRow}
          >
            <TextInput
              value={
                storeType === "redbubble" &&
                autoSync &&
                browserUrl
                  ? browserUrl
                  : storeUrl
              }
              onChangeText={
                setStoreUrl
              }
              editable={
                !(
                  storeType === "redbubble" &&
                  autoSync &&
                  fullStoreScanning
                )
              }
              placeholder="https://www.artpal.com/artistwill"
              placeholderTextColor="#666666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.urlInput}
            />

            <Pressable
              style={
                styles.openButton
              }
              onPress={openStore}
            >
              <Ionicons
                name="globe-outline"
                size={19}
                color="#ffffff"
              />
            </Pressable>
          </View>
        </View>

        {browserUrl ? (
          <View
            style={
              styles.browserWrap
            }
          >
            {pageLoading ? (
              <View
                style={
                  styles.pageLoader
                }
              >
                <ActivityIndicator
                  size="small"
                  color="#8b5cf6"
                />

                <Text
                  style={
                    styles.pageLoaderText
                  }
                >
                  Loading storefront...
                </Text>
              </View>
            ) : null}

            <WebView
              ref={webViewRef}
              source={{
                uri: browserUrl,
              }}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsBackForwardNavigationGestures
              setSupportMultipleWindows={
                false
              }
              onLoadStart={() =>
                setPageLoading(true)
              }
              onLoadEnd={() => {
                setPageLoading(false);

                if (
                  autoSync &&
                  !autoSyncScanStartedRef.current
                ) {
                  autoSyncScanStartedRef.current =
                    true;

                  setTimeout(() => {
                    scanEntireStore();
                  }, 500);
                }
              }}
              onNavigationStateChange={(
                state
              ) => {
                if (state.url) {
                  setBrowserUrl(
                    state.url
                  );
                }
              }}
              onMessage={
                handleScannerMessage
              }
              onError={(event) => {
                Alert.alert(
                  "Store Unavailable",
                  event.nativeEvent
                    .description ||
                    "The storefront could not be opened."
                );
              }}
            />

            <View
              style={styles.scanBar}
            >
              <Pressable
                style={[
                  styles.scanButton,
                  (scanning || fullStoreScanning) &&
                    styles.disabledButton,
                ]}
                onPress={
                  scanVisiblePage
                }
                disabled={scanning || fullStoreScanning}
              >
                {scanning ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <Ionicons
                    name="scan-outline"
                    size={21}
                    color="#ffffff"
                  />
                )}

                <Text
                  style={
                    styles.scanButtonText
                  }
                >
                  {scanning
                    ? "Scanning..."
                    : "Scan Visible Products"}
                </Text>
              </Pressable>

<Pressable
  style={[
    styles.fullScanButton,
    fullStoreScanning &&
      styles.disabledButton,
  ]}
  onPress={scanEntireStore}
  disabled={
    fullStoreScanning ||
    scanning
  }
>
  {fullStoreScanning ? (
    <ActivityIndicator
      size="small"
      color="#ffffff"
    />
  ) : (
    <Ionicons
      name="cloud-download-outline"
      size={21}
      color="#ffffff"
    />
  )}

  <Text
    style={styles.scanButtonText}
  >
    {fullStoreScanning
      ? "Scanning Entire Store..."
      : "Scan Entire Store"}
  </Text>
</Pressable>

{fullStoreScanning &&
scanProgress ? (
  <Text style={styles.scanProgressText}>
    {scanProgress}
  </Text>
) : null}

            </View>
          </View>
        ) : (
          <View
            style={
              styles.emptyBrowser
            }
          >
            <Ionicons
              name="globe-outline"
              size={48}
              color="#8b5cf6"
            />

            <Text
              style={
                styles.emptyBrowserTitle
              }
            >
              Open the storefront
            </Text>

            <Text
              style={
                styles.emptyBrowserText
              }
            >
              ArtBoost will scan the
              rendered page for product
              titles, images, links,
              descriptions, and prices.
            </Text>
          </View>
        )}

        {products.length > 0 ? (
          <View
            style={
              styles.resultsWrap
            }
          >
            <View
              style={
                styles.resultsHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.resultsTitle
                  }
                >
                  {products.length}{" "}
                  Detected
                </Text>

                <Text
                  style={
                    styles.resultsSubtitle
                  }
                >
                  {
                    selectedProducts.length
                  }{" "}
                  selected
                </Text>
              </View>

              <View
                style={
                  styles.selectionActions
                }
              >
                <Pressable
                  onPress={selectAll}
                >
                  <Text
                    style={
                      styles.actionText
                    }
                  >
                    Select All
                  </Text>
                </Pressable>

                <Pressable
                  onPress={clearAll}
                >
                  <Text
                    style={
                      styles.actionText
                    }
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>
            </View>

            <FlatList
              data={products}
              keyExtractor={(item) =>
                item.id
              }
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.productList
              }
              renderItem={({
                item,
              }) => (
                <Pressable
                  style={[
                    styles.productCard,
                    item.selected &&
                      styles.productCardSelected,
                  ]}
                  onPress={() =>
                    toggleProduct(
                      item.id
                    )
                  }
                >
                  <ArtBoostRemoteImage uri={item.imageUrl} style={styles.productImage} contentFit="cover" alt={item.title} />

                  <View
                    style={[
                      styles.checkCircle,
                      item.selected &&
                        styles.checkCircleSelected,
                    ]}
                  >
                    {item.selected ? (
                      <Ionicons
                        name="checkmark"
                        size={15}
                        color="#ffffff"
                      />
                    ) : null}
                  </View>

                  <Text
                    style={
                      styles.productTitle
                    }
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                </Pressable>
              )}
            />

            <Pressable
              style={[
                styles.importButton,
                importing &&
                  styles.disabledButton,
              ]}
              onPress={importSelected}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="cloud-download-outline"
                  size={21}
                  color="#ffffff"
                />
              )}

              <Text
                style={
                  styles.importButtonText
                }
              >
                {importing
                  ? "Importing..."
                  : `Import ${selectedProducts.length} Selected`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },

  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1d1d1d",
    flexDirection: "row",
    alignItems: "center",
  },

  headerButton: {
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
    paddingHorizontal: 13,
  },

  eyebrow: {
    color: "#8b5cf6",
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

  aiBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  urlSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1d1d1d",
  },

  storeLabel: {
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
  },

  urlRow: {
    flexDirection: "row",
    gap: 9,
  },

  urlInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    color: "#ffffff",
    fontSize: 12,
    paddingHorizontal: 13,
  },

  openButton: {
    width: 48,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  browserWrap: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  webView: {
    flex: 1,
  },

  pageLoader: {
    minHeight: 36,
    backgroundColor: "#171717",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  pageLoaderText: {
    color: "#aaaaaa",
    fontSize: 11,
  },

  scanBar: {
    padding: 10,
    backgroundColor: "#111111",
    borderTopWidth: 1,
    borderTopColor: "#292929",
  },

  scanButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  fullScanButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#33205e",
    borderWidth: 1,
    borderColor: "#6d4ab4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 9,
  },

  scanProgressText: {
    color: "#c4b5fd",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 7,
  },

  scanButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  emptyBrowser: {
    flex: 1,
    margin: 18,
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  emptyBrowserTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 15,
  },

  emptyBrowserText: {
    color: "#999999",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },

  resultsWrap: {
    maxHeight: 260,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "#292929",
    backgroundColor: "#111111",
  },

  resultsHeader: {
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  resultsTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  resultsSubtitle: {
    color: "#888888",
    fontSize: 10,
    marginTop: 3,
  },

  selectionActions: {
    flexDirection: "row",
    gap: 15,
  },

  actionText: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "900",
  },

  productList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },

  productCard: {
    width: 112,
    borderRadius: 15,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#2b2b2b",
    padding: 7,
  },

  productCardSelected: {
    borderColor: "#8b5cf6",
    backgroundColor: "#211936",
  },

  productImage: {
    width: "100%",
    height: 82,
    borderRadius: 10,
    backgroundColor: "#292929",
  },

  checkCircle: {
    position: "absolute",
    top: 11,
    right: 11,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor:
      "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "#aaaaaa",
    alignItems: "center",
    justifyContent: "center",
  },

  checkCircleSelected: {
    backgroundColor: "#8b5cf6",
    borderColor: "#c4b5fd",
  },

  productTitle: {
    color: "#ffffff",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    marginTop: 7,
  },

  importButton: {
    minHeight: 48,
    marginHorizontal: 16,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  importButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.6,
  },
});