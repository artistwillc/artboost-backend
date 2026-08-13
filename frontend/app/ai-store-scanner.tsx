import { Ionicons } from "@expo/vector-icons";
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
  Image,
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
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { buildCatalogCsv } from "@/lib/catalogCsv";

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
  artworkId?: string | null;
  designTitle?: string | null;
};

type ScannerSessionState = {
  storeUrl: string;
  browserUrl: string;
  products: ScannedProduct[];
};

// Keep a scanner session alive while the app is running. This prevents
// leaving the scanner (for example to view imported products) from wiping
// the current storefront, detected thumbnails, and selected products.
const scannerSessionCache = new Map<string, ScannerSessionState>();

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
  scanMode?: string;
  finishReason?: string;
  nextUrl?: string;
  pageNumber?: number;
  showMoreAvailable?: boolean;
  showMoreClicked?: boolean;
  diagnosticHtmlOnlyIds?: string[];
  diagnosticAnchorIds?: string[];
  diagnosticCollectedIds?: string[];
  diagnosticHtmlOnlyCount?: number;
  diagnosticDocumentArtworkCount?: number;
  productUrl?: string;
  artworkId?: string | null;
  designTitle?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string;
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

function makeProductId(productUrl: string) {
  return productUrl
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}


function getRedbubbleArtworkIdFromUrl(value: string) {
  const text = String(value || "");
  const match =
    text.match(/\/shop\/ap\/(\d+)/i) ||
    text.match(/\/i\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i);

  return match?.[1] || "";
}

function hasVerifiedCatalogImage(value: string) {
  const image = String(value || "").trim();

  return (
    /^https?:\/\//i.test(image) &&
    /redbubble\.net/i.test(image) &&
    !/\.svg(?:[?#]|$)/i.test(image) &&
    !/(placeholder|transparent|spacer|blank)/i.test(image)
  );
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

    const getHttpImageUrl = function (image) {
      if (!image) {
        return "";
      }

      const candidates = [
        image.currentSrc,
        image.getAttribute("src"),
        image.getAttribute("data-src"),
        image.getAttribute("data-original"),
        image.getAttribute("data-lazy-src")
      ];

      const srcset =
        image.getAttribute("srcset") ||
        image.getAttribute("data-srcset") ||
        "";

      if (srcset) {
        srcset.split(",").forEach(function (entry) {
          const candidate =
            String(entry || "")
              .trim()
              .split(/\s+/)[0];

          if (candidate) {
            candidates.push(candidate);
          }
        });
      }

      // Redbubble lazy-loads multiple versions of each tile. Prefer the
      // largest real CDN raster instead of a tiny/blank currentSrc placeholder.
      const picture = image.closest && image.closest("picture");
      if (picture) {
        Array.from(picture.querySelectorAll("source")).forEach(function (source) {
          const sourceSet = source.getAttribute("srcset") || source.getAttribute("data-srcset") || "";
          sourceSet.split(",").forEach(function (entry) {
            const candidate = String(entry || "").trim().split(/\s+/)[0];
            if (candidate) candidates.push(candidate);
          });
        });
      }

      const normalizedCandidates = candidates
        .map(function (candidate) { return absoluteUrl(candidate); })
        .filter(function (candidate) {
          const lower = String(candidate || "").toLowerCase();
          const isHttp =
            lower.startsWith("https://") ||
            lower.startsWith("http://");
          const looksBlank =
            lower.includes("transparent") ||
            lower.includes("placeholder") ||
            lower.includes("spacer") ||
            lower.includes("blank") ||
            lower.includes("/raf/");

          return isHttp && !looksBlank;
        });

      const redbubbleCandidates = normalizedCandidates.filter(function (candidate) {
        return String(candidate || "").toLowerCase().includes("redbubble.net");
      });

      for (let index = redbubbleCandidates.length - 1; index >= 0; index -= 1) {
        const candidate = redbubbleCandidates[index];
        if (/[.](?:jpe?g|png|webp)(?:[?#]|$)/i.test(candidate)) return candidate;
      }

      return redbubbleCandidates[redbubbleCandidates.length - 1] ||
        normalizedCandidates[normalizedCandidates.length - 1] || "";
    };


    const getPrice = function (card) {
      if (!card) {
        return null;
      }

      const text =
        cleanText(card.textContent || "");

      const match = text.match(
        /(?:US\$|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/
      );

      if (!match) {
        return null;
      }

      const value = Number(match[1]);
      return Number.isFinite(value)
        ? value
        : null;
    };


    function bestImageFromNode(node) {
      if (!node) return "";

      var candidates = [];
      var seenImages = [];

      function rememberImage(image) {
        if (!image || seenImages.indexOf(image) >= 0) return;
        seenImages.push(image);
        var url = getHttpImageUrl(image);
        if (!url) return;

        var score = 0;
        var lower = String(url).toLowerCase();
        var width = Number(image.naturalWidth || image.width || image.getAttribute && image.getAttribute("width") || 0);
        var height = Number(image.naturalHeight || image.height || image.getAttribute && image.getAttribute("height") || 0);
        score += Math.min(5000, width * height) / 1000;
        if (/fineartamerica\.com|pixels\.com/i.test(lower)) score += 1000;
        if (/artworkimages|images-medium|mediumlarge|rendered/i.test(lower)) score += 750;
        if (/logo|icon|avatar|profile|sprite/i.test(lower)) score -= 1000;
        candidates.push({ url: url, score: score });
      }

      if (node.tagName && String(node.tagName).toLowerCase() === "img") {
        rememberImage(node);
      }
      if (node.querySelectorAll) {
        Array.from(node.querySelectorAll("img")).forEach(rememberImage);
      }

      var current = node;
      for (var depth = 0; current && depth < 6; depth += 1) {
        if (current.querySelectorAll) {
          Array.from(current.querySelectorAll("img")).forEach(rememberImage);
        }
        current = current.parentElement;
      }

      var attributeNames = [
        "data-image",
        "data-image-url",
        "data-src-large",
        "data-large-image",
        "data-original-src",
        "data-zoom-image",
        "data-full",
        "data-full-src"
      ];

      var attributeNodes = [node];
      if (node.querySelectorAll) {
        attributeNodes = attributeNodes.concat(Array.from(node.querySelectorAll("*")));
      }

      attributeNodes.slice(0, 220).forEach(function (candidateNode) {
        if (!candidateNode || !candidateNode.getAttribute) return;

        attributeNames.forEach(function (name) {
          var raw = candidateNode.getAttribute(name);
          var url = raw ? absoluteUrl(raw) : "";
          if (!url || !/^https?:\/\//i.test(url)) return;
          var lower = url.toLowerCase();
          var score = 0;
          if (/fineartamerica\.com|pixels\.com/i.test(lower)) score += 1000;
          if (/artworkimages|images-medium|mediumlarge|rendered/i.test(lower)) score += 750;
          if (/logo|icon|avatar|profile|sprite/i.test(lower)) score -= 1000;
          candidates.push({ url: url, score: score });
        });

        var style = candidateNode.getAttribute("style") || "";
        var bgMatch = style.match(/background(?:-image)?\s*:[^;]*url\(["']?([^"')]+)["']?\)/i);
        if (bgMatch && bgMatch[1]) {
          var bgUrl = absoluteUrl(bgMatch[1]);
          if (/^https?:\/\//i.test(bgUrl)) {
            var bgScore = /fineartamerica\.com|pixels\.com/i.test(bgUrl) ? 1600 : 300;
            candidates.push({ url: bgUrl, score: bgScore });
          }
        }
      });

      candidates.sort(function (a, b) { return b.score - a.score; });
      return candidates.length ? candidates[0].url : "";
    }

    function nearestProductCard(link) {
      if (!link) return null;
      var current = link;
      var fallback = link.parentElement || link;

      for (var depth = 0; current && depth < 7; depth += 1) {
        if (current.querySelectorAll) {
          var featuredCount = current.querySelectorAll('a[href*="/featured/"]').length;
          var imageCount = current.querySelectorAll("img").length;
          if (imageCount > 0 && featuredCount <= 3) {
            return current;
          }
        }
        current = current.parentElement;
      }

      return fallback;
    }
    const products = [];
    const seen = {};

    const addProduct = function (
      productUrl,
      imageUrl,
      title,
      description,
      price
    ) {
      if (
        !productUrl ||
        !imageUrl ||
        seen[productUrl]
      ) {
        return;
      }

      seen[productUrl] = true;
      products.push({
        title:
          cleanText(title) ||
          "Imported Artwork",
        description:
          cleanText(description),
        productUrl: productUrl,
        imageUrl: imageUrl,
        price:
          Number.isFinite(Number(price))
            ? Number(price)
            : null,
        currency: "USD"
      });
    };

    /*
     * ArtPal
     */
    Array.from(
      document.querySelectorAll("a.iCg[href]")
    ).forEach(function (card) {
      const rawHref =
        card.getAttribute("href") || "";

      if (!rawHref.includes("?i=")) {
        return;
      }

      const image =
        card.querySelector("img");

      if (!image) {
        return;
      }

      const imageUrl =
        getHttpImageUrl(image);

      if (
        !imageUrl ||
        imageUrl.includes("/img/c.gif")
      ) {
        return;
      }

      const titleElement =
        card.querySelector("strong");

      addProduct(
        absoluteUrl(rawHref),
        imageUrl,
        titleElement?.textContent ||
          image.getAttribute("alt") ||
          "ArtPal Artwork",
        "",
        null
      );
    });

    /*
     * Fine Art America + other supported storefronts.
     *
     * Keep every marketplace detector additive. Fine Art America artwork
     * pages use /featured/<slug>.html. Product-option query strings are
     * stripped so canvas/print/sticker variants do not create duplicate art.
     */
    Array.from(
      document.querySelectorAll("a[href]")
    ).forEach(function (link) {
      const rawHref =
        link.getAttribute("href") || "";

      let parsed;
      try {
        parsed = new URL(
          rawHref,
          window.location.href
        );
      } catch {
        return;
      }

      const host =
        parsed.hostname
          .toLowerCase()
          .replace(/^www\\./, "");

      const pathname =
        parsed.pathname || "";

      let marketplace = "";
      let isProductLink = false;

      if (
        host === "fineartamerica.com" ||
        host.endsWith(".fineartamerica.com")
      ) {
        marketplace = "Fine Art America";

        // FAA profile pages contain recommendation links for other artists.
        // Derive the connected profile slug and keep only that artist's work.
        const profileMatch =
          window.location.pathname.match(/^\\/profiles\\/([^/?#]+)/i);
        const ownerSlug =
          profileMatch?.[1]?.toLowerCase() || "";
        const featuredMatch =
          pathname.match(/^\\/featured\\/([^/?#]+)\\.html$/i);
        const featuredSlug =
          featuredMatch?.[1]?.toLowerCase() || "";

        var ownerName = ownerSlug.replace(/[-_]+/g, " ").trim();
        var cardTextForOwner = cleanText(
          (link.closest && link.closest("article, li, [class*=\"card\"], [class*=\"tile\"], [class*=\"artwork\"], [class*=\"product\"]") || link.parentElement || link).textContent || ""
        ).toLowerCase();
        var ownerMarker = "-" + ownerSlug;
        var ownerIndex = ownerSlug ? featuredSlug.lastIndexOf(ownerMarker) : -1;
        var ownerTail = ownerIndex >= 0
          ? featuredSlug.slice(ownerIndex + ownerMarker.length)
          : "";
        var slugOwnerMatch = Boolean(ownerSlug) && (
          featuredSlug === ownerSlug ||
          featuredSlug.endsWith(ownerMarker) ||
          (ownerIndex >= 0 && (ownerTail === "" || /^\-\d+$/.test(ownerTail)))
        );
        var textOwnerMatch = Boolean(ownerName) && cardTextForOwner.includes(ownerName);

        isProductLink = Boolean(featuredMatch) &&
          (!ownerSlug || slugOwnerMatch || textOwnerMatch);

        if (isProductLink) {
          parsed.search = "";
          parsed.hash = "";
        }
      } else if (
        host.endsWith(".myshopify.com") ||
        host === "shopify.com" ||
        host.endsWith(".shopify.com")
      ) {
        marketplace = "Shopify";
        isProductLink = /^\\/products\\/[^/?#]+/i.test(pathname);
      } else if (
        host === "etsy.com" ||
        host.endsWith(".etsy.com")
      ) {
        marketplace = "Etsy";
        isProductLink = /^\\/listing\\/\\d+/i.test(pathname);
      } else if (
        host === "society6.com" ||
        host.endsWith(".society6.com")
      ) {
        marketplace = "Society6";
        isProductLink = /^\\/product\\/[^/?#]+/i.test(pathname);
      } else if (
        host === "gumroad.com" ||
        host.endsWith(".gumroad.com")
      ) {
        marketplace = "Gumroad";
        isProductLink = /^\\/l\\/[^/?#]+/i.test(pathname);
      } else if (
        host === "ebay.com" ||
        host.endsWith(".ebay.com")
      ) {
        marketplace = "eBay";
        isProductLink = /^\\/itm\\/(?:[^/]+\\/)?\\d+/i.test(pathname);
      }

      if (!isProductLink) {
        return;
      }

      const card =
        marketplace === "Fine Art America"
          ? nearestProductCard(link)
          : (link.closest(
              "article, li, [data-testid], [class*='card'], [class*='tile'], [class*='product'], [class*='artwork'], [class*='image']"
            ) || link.parentElement || link);

      const image =
        link.querySelector("img") ||
        (card && card.querySelector && card.querySelector("img"));

      const imageUrl =
        marketplace === "Fine Art America"
          ? bestImageFromNode(card || link)
          : getHttpImageUrl(image);

      if (!imageUrl && marketplace !== "Fine Art America") {
        return;
      }

      const titleNode =
        card && card.querySelector &&
        card.querySelector(
          "h1, h2, h3, h4, strong, [class*='title'], [data-testid*='title']"
        );

      addProduct(
        parsed.toString(),
        imageUrl,
        cleanText(image && image.getAttribute("alt")) ||
          cleanText(link.getAttribute("aria-label")) ||
          cleanText(link.getAttribute("title")) ||
          cleanText(titleNode && titleNode.textContent) ||
          marketplace + " Artwork",
        "",
        getPrice(card)
      );
    });

    /*
     * Redbubble
     *
     * Current storefronts can expose artwork links as:
     * /shop/ap/123456789
     * /i/<product-type>/<slug>/<artwork-id>/<variant>
     */
    Array.from(
      document.querySelectorAll("a[href]")
    ).forEach(function (link) {
      const rawHref =
        link.getAttribute("href") || "";

      let parsed;
      try {
        parsed = new URL(
          rawHref,
          window.location.href
        );
      } catch {
        return;
      }

      const host =
        parsed.hostname
          .toLowerCase()
          .replace(/^www\\./, "");

      if (
        host !== "redbubble.com" &&
        !host.endsWith(".redbubble.com")
      ) {
        return;
      }

      const pathname =
        parsed.pathname || "";

      const isArtworkLink =
        /^\\/shop\\/ap\\/\\d+/i.test(pathname) ||
        /^\\/i\\/[^/]+\\/[^/]+\\/\\d+(?:\\/|$)/i.test(
          pathname
        );

      if (!isArtworkLink) {
        return;
      }

      const card =
        link.closest(
          "article, li, [data-testid], [class*='card'], [class*='tile'], [class*='product']"
        ) || link;

      const image =
        link.querySelector("img") ||
        card.querySelector("img");

      if (!image) {
        return;
      }

      const imageUrl =
        getHttpImageUrl(image);

      if (!imageUrl) {
        return;
      }

      const alt =
        image.getAttribute("alt") || "";

      const aria =
        link.getAttribute("aria-label") || "";

      const titleNode =
        card.querySelector(
          "h1, h2, h3, h4, [class*='title'], [data-testid*='title']"
        );

      addProduct(
        parsed.toString(),
        imageUrl,
        alt ||
          aria ||
          titleNode?.textContent ||
          "Redbubble Artwork",
        "",
        getPrice(card)
      );
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
          document.querySelectorAll("img").length
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

const FULL_STORE_SCAN_SCRIPT = String.raw`
(function () {
  try {
    var accumulatedProducts = {};
    var accumulatedOrder = [];
    var currentStep = 0;
    var stableBottomRounds = 0;
    var lastUniqueCount = 0;
    var lastGrowthAt = Date.now();

    // Catalog-size agnostic: there is intentionally NO expected product count.
    // The scan ends only after the storefront has been at its end for many
    // consecutive passes without discovering another unique artwork.
    var WAIT_MS = 850;
    var BOTTOM_STABLE_ROUNDS_TO_FINISH = 32;
    var FAILSAFE_RUNTIME_MS = 30 * 60 * 1000;
    var startedAt = Date.now();
    var isFineArtAmericaPage = /(^|\.)fineartamerica\.com$/i.test(String(window.location.hostname || ""));
    if (isFineArtAmericaPage) {
      WAIT_MS = 1100;
      BOTTOM_STABLE_ROUNDS_TO_FINISH = 40;
    }

    function cleanText(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
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

    function isVisible(node) {
      if (!node || !node.getBoundingClientRect) return false;
      var rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      return !style || (style.display !== "none" && style.visibility !== "hidden");
    }

    function getHttpImageUrl(image) {
      if (!image) return "";

      var candidates = [
        image.currentSrc,
        image.getAttribute && image.getAttribute("src"),
        image.getAttribute && image.getAttribute("data-src"),
        image.getAttribute && image.getAttribute("data-original"),
        image.getAttribute && image.getAttribute("data-lazy-src")
      ];

      var srcset =
        (image.getAttribute && image.getAttribute("srcset")) ||
        (image.getAttribute && image.getAttribute("data-srcset")) ||
        "";

      if (srcset) {
        String(srcset).split(",").forEach(function (entry) {
          var candidate = String(entry || "").trim().split(/\s+/)[0];
          if (candidate) candidates.push(candidate);
        });
      }

      var picture = image.closest && image.closest("picture");
      if (picture) {
        Array.from(picture.querySelectorAll("source")).forEach(function (source) {
          var sourceSet =
            source.getAttribute("srcset") ||
            source.getAttribute("data-srcset") ||
            "";

          String(sourceSet).split(",").forEach(function (entry) {
            var candidate = String(entry || "").trim().split(/\s+/)[0];
            if (candidate) candidates.push(candidate);
          });
        });
      }

      var normalized = candidates
        .map(function (candidate) { return absoluteUrl(candidate); })
        .filter(function (candidate) {
          var lower = String(candidate || "").toLowerCase();
          if (!/^https?:\/\//i.test(lower)) return false;
          return !(
            lower.includes("transparent") ||
            lower.includes("placeholder") ||
            lower.includes("spacer") ||
            lower.includes("blank") ||
            lower.includes("/raf/")
          );
        });

      var rb = normalized.filter(function (candidate) {
        return /redbubble\.net/i.test(candidate);
      });

      return rb[rb.length - 1] || normalized[normalized.length - 1] || "";
    }


    function bestImageFromNode(node) {
      if (!node) return "";

      var candidates = [];
      var seenImages = [];

      function rememberImage(image) {
        if (!image || seenImages.indexOf(image) >= 0) return;
        seenImages.push(image);
        var url = getHttpImageUrl(image);
        if (!url) return;

        var score = 0;
        var lower = String(url).toLowerCase();
        var width = Number(image.naturalWidth || image.width || image.getAttribute && image.getAttribute("width") || 0);
        var height = Number(image.naturalHeight || image.height || image.getAttribute && image.getAttribute("height") || 0);
        score += Math.min(5000, width * height) / 1000;
        if (/fineartamerica\.com|pixels\.com/i.test(lower)) score += 1000;
        if (/artworkimages|images-medium|mediumlarge|rendered/i.test(lower)) score += 750;
        if (/logo|icon|avatar|profile|sprite/i.test(lower)) score -= 1000;
        candidates.push({ url: url, score: score });
      }

      if (node.tagName && String(node.tagName).toLowerCase() === "img") {
        rememberImage(node);
      }
      if (node.querySelectorAll) {
        Array.from(node.querySelectorAll("img")).forEach(rememberImage);
      }

      var current = node;
      for (var depth = 0; current && depth < 6; depth += 1) {
        if (current.querySelectorAll) {
          Array.from(current.querySelectorAll("img")).forEach(rememberImage);
        }
        current = current.parentElement;
      }

      var attributeNames = [
        "data-image",
        "data-image-url",
        "data-src-large",
        "data-large-image",
        "data-original-src",
        "data-zoom-image",
        "data-full",
        "data-full-src"
      ];

      var attributeNodes = [node];
      if (node.querySelectorAll) {
        attributeNodes = attributeNodes.concat(Array.from(node.querySelectorAll("*")));
      }

      attributeNodes.slice(0, 220).forEach(function (candidateNode) {
        if (!candidateNode || !candidateNode.getAttribute) return;

        attributeNames.forEach(function (name) {
          var raw = candidateNode.getAttribute(name);
          var url = raw ? absoluteUrl(raw) : "";
          if (!url || !/^https?:\/\//i.test(url)) return;
          var lower = url.toLowerCase();
          var score = 0;
          if (/fineartamerica\.com|pixels\.com/i.test(lower)) score += 1000;
          if (/artworkimages|images-medium|mediumlarge|rendered/i.test(lower)) score += 750;
          if (/logo|icon|avatar|profile|sprite/i.test(lower)) score -= 1000;
          candidates.push({ url: url, score: score });
        });

        var style = candidateNode.getAttribute("style") || "";
        var bgMatch = style.match(/background(?:-image)?\s*:[^;]*url\(["']?([^"')]+)["']?\)/i);
        if (bgMatch && bgMatch[1]) {
          var bgUrl = absoluteUrl(bgMatch[1]);
          if (/^https?:\/\//i.test(bgUrl)) {
            var bgScore = /fineartamerica\.com|pixels\.com/i.test(bgUrl) ? 1600 : 300;
            candidates.push({ url: bgUrl, score: bgScore });
          }
        }
      });

      candidates.sort(function (a, b) { return b.score - a.score; });
      return candidates.length ? candidates[0].url : "";
    }

    function nearestProductCard(link) {
      if (!link) return null;
      var current = link;
      var fallback = link.parentElement || link;

      for (var depth = 0; current && depth < 7; depth += 1) {
        if (current.querySelectorAll) {
          var featuredCount = current.querySelectorAll('a[href*="/featured/"]').length;
          var imageCount = current.querySelectorAll("img").length;
          if (imageCount > 0 && featuredCount <= 3) {
            return current;
          }
        }
        current = current.parentElement;
      }

      return fallback;
    }
    function getPrice(card) {
      if (!card) return null;
      var text = cleanText(card.textContent || "");
      var match = text.match(/(?:US\$|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/);
      if (!match) return null;
      var value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    }

    function redbubbleArtworkId(value) {
      var text = String(value || "");
      var match =
        text.match(/\/shop\/ap\/(\d+)/i) ||
        text.match(/\/i\/[^/]+\/[^/]+\/(\d+)(?:[./\/]|$)/i);
      return match && match[1] ? match[1] : "";
    }

    function productKey(productUrl) {
      var artworkId = redbubbleArtworkId(productUrl);
      if (artworkId) return "redbubble:" + artworkId;

      try {
        var parsed = new URL(productUrl, window.location.href);
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString();
      } catch {
        return String(productUrl || "");
      }
    }

    function addRememberedProduct(product) {
      var key = productKey(product && product.productUrl);
      if (!key) return false;

      var previous = accumulatedProducts[key];
      if (!previous) accumulatedOrder.push(key);

      accumulatedProducts[key] = {
        title: cleanText(product.title) || (previous && previous.title) || "Imported Artwork",
        description: cleanText(product.description) || (previous && previous.description) || "",
        productUrl: product.productUrl || (previous && previous.productUrl) || "",
        imageUrl: product.imageUrl || (previous && previous.imageUrl) || "",
        price: product.price !== null && product.price !== undefined
          ? product.price
          : (previous && previous.price !== undefined ? previous.price : null),
        currency: product.currency || (previous && previous.currency) || "USD"
      };

      return !previous;
    }

    function collectVisibleProducts() {
      var found = [];
      var localSeen = {};

      function push(product) {
        var key = productKey(product.productUrl);
        if (!key || localSeen[key]) return;
        localSeen[key] = true;
        found.push(product);
      }

      // ArtPal support remains available for the Universal Scanner.
      Array.from(document.querySelectorAll("a.iCg[href]")).forEach(function (card) {
        var rawHref = card.getAttribute("href") || "";
        if (!rawHref.includes("?i=")) return;

        var image = card.querySelector("img");
        var imageUrl = getHttpImageUrl(image);
        if (!imageUrl || imageUrl.includes("/img/c.gif")) return;

        var titleElement = card.querySelector("strong");
        push({
          title: cleanText(titleElement && titleElement.textContent) ||
            cleanText(image && image.getAttribute("alt")) ||
            "ArtPal Artwork",
          description: "",
          productUrl: absoluteUrl(rawHref),
          imageUrl: imageUrl,
          price: null,
          currency: "USD"
        });
      });

      // Fine Art America and the remaining supported storefronts.
      // Keep these detectors independent from Redbubble and ArtPal so changes
      // for one marketplace cannot silently disable another marketplace.
      Array.from(document.querySelectorAll("a[href]")).forEach(function (link) {
        var rawHref = link.getAttribute("href") || "";
        var parsed;
        try {
          parsed = new URL(rawHref, window.location.href);
        } catch {
          return;
        }

        var host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        var pathname = parsed.pathname || "";
        var marketplace = "";
        var isProductLink = false;

        if (host === "fineartamerica.com" || host.endsWith(".fineartamerica.com")) {
          marketplace = "Fine Art America";

          // FAA profile pages contain recommendation links for other artists.
          // Derive the connected profile slug and keep only that artist's work.
          var profileMatch =
            window.location.pathname.match(/^\/profiles\/([^/?#]+)/i);
          var ownerSlug =
            profileMatch && profileMatch[1]
              ? String(profileMatch[1]).toLowerCase()
              : "";
          var featuredMatch =
            pathname.match(/^\/featured\/([^/?#]+)\.html$/i);
          var featuredSlug =
            featuredMatch && featuredMatch[1]
              ? String(featuredMatch[1]).toLowerCase()
              : "";

          var ownerName = ownerSlug.replace(/[-_]+/g, " ").trim();
          var ownerCardCandidate =
            (link.closest && link.closest("article, li, [class*=\"card\"], [class*=\"tile\"], [class*=\"artwork\"], [class*=\"product\"]")) ||
            link.parentElement ||
            link;
          var cardTextForOwner = cleanText(
            ownerCardCandidate && ownerCardCandidate.textContent || ""
          ).toLowerCase();
          var ownerMarker = "-" + ownerSlug;
          var ownerIndex = ownerSlug ? featuredSlug.lastIndexOf(ownerMarker) : -1;
          var ownerTail = ownerIndex >= 0
            ? featuredSlug.slice(ownerIndex + ownerMarker.length)
            : "";
          var slugOwnerMatch = Boolean(ownerSlug) && (
            featuredSlug === ownerSlug ||
            featuredSlug.endsWith(ownerMarker) ||
            (ownerIndex >= 0 && (ownerTail === "" || /^\-\d+$/.test(ownerTail)))
          );
          var textOwnerMatch = Boolean(ownerName) && cardTextForOwner.includes(ownerName);

          isProductLink = Boolean(featuredMatch) &&
            (!ownerSlug || slugOwnerMatch || textOwnerMatch);

          if (isProductLink) {
            parsed.search = "";
            parsed.hash = "";
          }
        } else if (
          host.endsWith(".myshopify.com") ||
          host === "shopify.com" ||
          host.endsWith(".shopify.com")
        ) {
          marketplace = "Shopify";
          isProductLink = /^\/products\/[^/?#]+/i.test(pathname);
        } else if (host === "etsy.com" || host.endsWith(".etsy.com")) {
          marketplace = "Etsy";
          isProductLink = /^\/listing\/\d+/i.test(pathname);
        } else if (host === "society6.com" || host.endsWith(".society6.com")) {
          marketplace = "Society6";
          isProductLink = /^\/product\/[^/?#]+/i.test(pathname);
        } else if (host === "gumroad.com" || host.endsWith(".gumroad.com")) {
          marketplace = "Gumroad";
          isProductLink = /^\/l\/[^/?#]+/i.test(pathname);
        } else if (host === "ebay.com" || host.endsWith(".ebay.com")) {
          marketplace = "eBay";
          isProductLink = /^\/itm\/(?:[^/]+\/)?\d+/i.test(pathname);
        }

        if (!isProductLink) return;

        var card = marketplace === "Fine Art America"
          ? nearestProductCard(link)
          : (link.closest(
              "article, li, [data-testid], [class*='card'], [class*='tile'], [class*='product'], [class*='artwork'], [class*='image']"
            ) || link.parentElement || link);

        var image =
          link.querySelector("img") ||
          (card && card.querySelector && card.querySelector("img"));
        var imageUrl = marketplace === "Fine Art America"
          ? bestImageFromNode(card || link)
          : getHttpImageUrl(image);
        var titleNode = card && card.querySelector && card.querySelector(
          "h1, h2, h3, h4, strong, [class*='title'], [data-testid*='title']"
        );

        push({
          title:
            cleanText(image && image.getAttribute("alt")) ||
            cleanText(link.getAttribute("aria-label")) ||
            cleanText(link.getAttribute("title")) ||
            cleanText(titleNode && titleNode.textContent) ||
            marketplace + " Artwork",
          description: "",
          productUrl: parsed.toString(),
          imageUrl: imageUrl || "",
          price: getPrice(card),
          currency: "USD"
        });
      });

      // Redbubble: remember the PRODUCT LINK even when its lazy thumbnail has
      // not loaded yet. The isolated detail importer can enrich that artwork later.
      Array.from(document.querySelectorAll("a[href]")).forEach(function (link) {
        var rawHref = link.getAttribute("href") || "";
        var parsed;
        try {
          parsed = new URL(rawHref, window.location.href);
        } catch {
          return;
        }

        var host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        if (host !== "redbubble.com" && !host.endsWith(".redbubble.com")) return;

        var pathname = parsed.pathname || "";
        var isArtworkLink =
          /^\/shop\/ap\/\d+/i.test(pathname) ||
          /^\/i\/[^/]+\/[^/]+\/\d+(?:\/|$)/i.test(pathname);

        if (!isArtworkLink) return;

        var card = link.closest(
          "article, li, [data-testid], [class*='card'], [class*='tile'], [class*='product']"
        ) || link;

        var image = link.querySelector("img") || (card && card.querySelector("img"));
        var imageUrl = getHttpImageUrl(image);
        var titleNode = card && card.querySelector(
          "h1, h2, h3, h4, [class*='title'], [data-testid*='title']"
        );

        push({
          title:
            cleanText(image && image.getAttribute("alt")) ||
            cleanText(link.getAttribute("aria-label")) ||
            cleanText(titleNode && titleNode.textContent) ||
            "Redbubble Artwork",
          description: "",
          productUrl: parsed.toString(),
          imageUrl: imageUrl || "",
          price: getPrice(card),
          currency: "USD"
        });
      });

      return found;
    }

    function rememberVisibleProducts() {
      collectVisibleProducts().forEach(addRememberedProduct);
      return accumulatedOrder.length;
    }

    function getAccumulatedProducts() {
      return accumulatedOrder
        .map(function (key) { return accumulatedProducts[key]; })
        .filter(Boolean);
    }

    function sendProgress() {
      var uniqueCount = rememberVisibleProducts();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "scan_progress",
        scannedCount: uniqueCount,
        scrollStep: currentStep,
        maxScrollSteps: 0
      }));
      return uniqueCount;
    }

    function finishScan(reason) {
      rememberVisibleProducts();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "scan_results",
        scanMode: "full_store",
        finishReason: reason || "store_exhausted",
        products: getAccumulatedProducts(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        totalLinks: document.querySelectorAll("a[href]").length,
        totalImages: document.querySelectorAll("img").length
      }));
    }

    function findLoadMoreControl() {
      var nodes = Array.from(document.querySelectorAll(
        "button, [role='button'], input[type='button'], input[type='submit'], a[href]"
      ));

      var pattern = /^(?:load|show|view|see)\s+more(?:\s+(?:designs|products|results|artwork))?$|^more\s+(?:designs|products|results|artwork)$/i;

      return nodes.find(function (node) {
        if (!isVisible(node)) return false;
        var text = cleanText(
          node.textContent ||
          node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.value ||
          ""
        );
        if (!pattern.test(text)) return false;

        if (node.tagName && node.tagName.toLowerCase() === "a") {
          var href = node.getAttribute("href") || "";
          // Avoid navigating the visible WebView to a different page. Buttons
          // and in-page anchors are safe; page-to-page pagination is not.
          if (href && href !== "#" && !/^javascript:/i.test(href)) return false;
        }

        return true;
      }) || null;
    }

    function scrollingElement() {
      return document.scrollingElement || document.documentElement || document.body;
    }

    function metrics() {
      var scroller = scrollingElement();
      var viewport = Math.max(
        window.innerHeight || 0,
        document.documentElement && document.documentElement.clientHeight || 0,
        500
      );
      var y = window.pageYOffset || (scroller && scroller.scrollTop) || 0;
      var height = Math.max(
        document.body && document.body.scrollHeight || 0,
        document.documentElement && document.documentElement.scrollHeight || 0,
        scroller && scroller.scrollHeight || 0
      );
      return {
        viewport: viewport,
        y: y,
        height: height,
        maxY: Math.max(0, height - viewport)
      };
    }

    function stimulateLazyLoad(atBottom) {
      try {
        window.dispatchEvent(new Event("scroll"));
        document.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch {}

      if (atBottom) {
        var m = metrics();
        // Bounce off the bottom so intersection observers and virtualized lists
        // get a fresh enter/leave cycle before the next pass.
        window.scrollTo({
          top: Math.max(0, m.maxY - Math.max(180, Math.floor(m.viewport * 0.35))),
          behavior: "auto"
        });
        setTimeout(function () {
          var again = metrics();
          window.scrollTo({ top: again.maxY, behavior: "auto" });
        }, 120);
      }
    }

    function scanNext() {
      currentStep += 1;

      if (Date.now() - startedAt >= FAILSAFE_RUNTIME_MS) {
        finishScan("failsafe_runtime");
        return;
      }

      var before = metrics();
      var stepDistance = Math.max(300, Math.floor(before.viewport * 0.72));
      var targetY = Math.min(before.maxY, before.y + stepDistance);
      window.scrollTo({ top: targetY, behavior: "auto" });

      setTimeout(function () {
        var uniqueCount = sendProgress();
        var grew = uniqueCount > lastUniqueCount;

        if (grew) {
          lastUniqueCount = uniqueCount;
          lastGrowthAt = Date.now();
          stableBottomRounds = 0;
        }

        var after = metrics();
        var atBottom = after.y >= after.maxY - Math.max(40, after.viewport * 0.04);

        if (atBottom) {
          var loadMore = findLoadMoreControl();
          if (loadMore) {
            try {
              loadMore.click();
              stableBottomRounds = 0;
              setTimeout(scanNext, 1400);
              return;
            } catch {}
          }

          if (!grew) stableBottomRounds += 1;
          stimulateLazyLoad(true);

          if (isFineArtAmericaPage && stableBottomRounds > 0 && stableBottomRounds % 6 === 0) {
            var faaMetrics = metrics();
            var faaRevisit = Math.max(0, faaMetrics.maxY - Math.max(faaMetrics.viewport * 2.2, 1200));
            window.scrollTo({ top: faaRevisit, behavior: "auto" });
          }

          if (stableBottomRounds >= BOTTOM_STABLE_ROUNDS_TO_FINISH) {
            // Final delayed pass: give the storefront one last opportunity to
            // append/virtualize another batch before declaring it exhausted.
            setTimeout(function () {
              var finalCount = rememberVisibleProducts();
              if (finalCount > lastUniqueCount) {
                lastUniqueCount = finalCount;
                stableBottomRounds = 0;
                scanNext();
              } else {
                finishScan("store_exhausted");
              }
            }, 1800);
            return;
          }
        } else {
          stableBottomRounds = 0;
          stimulateLazyLoad(false);
        }

        setTimeout(scanNext, atBottom ? 450 : 0);
      }, WAIT_MS);
    }

    // Start from the top and accumulate every unique artwork as Redbubble's
    // virtualized/lazy list rotates products through the DOM.
    window.scrollTo({ top: 0, behavior: "auto" });
    setTimeout(function () {
      lastUniqueCount = sendProgress();
      lastGrowthAt = Date.now();
      scanNext();
    }, 650);
  } catch (error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "scan_error",
      error: error && error.message ? error.message : String(error)
    }));
  }

  true;
})();
`;

const REDBUBBLE_EXPLORE_PAGE_SCRIPT = String.raw`
(function () {
  try {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function absolute(value) {
      try {
        return new URL(String(value || ""), window.location.href).toString();
      } catch {
        return "";
      }
    }

    function artworkId(value) {
      var href = String(value || "");
      var match =
        href.match(/\/shop\/ap\/(\d+)/i) ||
        href.match(/\/i\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i);

      return match && match[1] ? match[1] : "";
    }

    function allArtworkIdsFromDocument() {
      var ids = {};

      function remember(value) {
        var id = String(value || "").trim();
        if (/^\d+$/.test(id)) {
          ids[id] = true;
        }
      }

      // Live DOM anchors.
      Array.from(
        document.querySelectorAll('a[href*="/shop/ap/"], a[href*="/i/"]')
      ).forEach(function (link) {
        remember(
          artworkId(
            absolute(link.getAttribute("href"))
          )
        );
      });

      // Redbubble can keep additional catalog entries in serialized HTML/JSON
      // even when their cards are not currently mounted in the visible DOM.
      var html = String(
        document.documentElement &&
        document.documentElement.innerHTML ||
        ""
      );

      var patterns = [
        /\/shop\/ap\/(\d+)/gi,
        /\/i\/[^/"'\\\s]+\/[^/"'\\\s]+\/(\d+)(?:\/|\\u002F|["'\\\s<])/gi,
        /["']artworkId["']\s*:\s*["']?(\d+)["']?/gi,
        /["']artwork_id["']\s*:\s*["']?(\d+)["']?/gi
      ];

      patterns.forEach(function (regex) {
        var match;
        while ((match = regex.exec(html))) {
          if (match[1]) {
            remember(match[1]);
          }
        }
      });

      return Object.keys(ids);
    }

    function imageUrl(img) {
      if (!img) return "";

      var values = [
        img.currentSrc,
        img.getAttribute && img.getAttribute("src"),
        img.getAttribute && img.getAttribute("data-src"),
        img.getAttribute && img.getAttribute("data-original"),
        img.getAttribute && img.getAttribute("data-lazy-src")
      ];

      [
        img.getAttribute && img.getAttribute("srcset"),
        img.getAttribute && img.getAttribute("data-srcset")
      ].forEach(function (set) {
        String(set || "").split(",").forEach(function (entry) {
          var value = String(entry || "").trim().split(/\s+/)[0];
          if (value) values.push(value);
        });
      });

      var picture = img.closest && img.closest("picture");
      if (picture) {
        Array.from(picture.querySelectorAll("source")).forEach(function (source) {
          String(
            source.getAttribute("srcset") ||
            source.getAttribute("data-srcset") ||
            ""
          ).split(",").forEach(function (entry) {
            var value = String(entry || "").trim().split(/\s+/)[0];
            if (value) values.push(value);
          });
        });
      }

      var usable = values
        .map(absolute)
        .filter(function (value) {
          return (
            /^https?:\/\//i.test(value) &&
            !/(placeholder|transparent|spacer|blank)/i.test(value)
          );
        });

      var redbubble = usable.filter(function (value) {
        return /redbubble\.net/i.test(value);
      });

      return redbubble[redbubble.length - 1] ||
        usable[usable.length - 1] ||
        "";
    }

    function findShowMore() {
      // Verified against Redbubble Explore DOM on 2026-08-08:
      // <button type="button">...<span>Show more</span>...</button>
      return (
        Array.from(
          document.querySelectorAll('button[type="button"]')
        ).find(function (button) {
          return clean(button.textContent) === "Show more";
        }) || null
      );
    }

    function collect() {
      var remembered = {};
      var products = [];

      // Verified live Explore card structure:
      // <a id="182156808" href="https://www.redbubble.com/shop/ap/182156808">
      //   ... artwork <img src="https://ih1.redbubble.net/image....jpg">
      //   ... Maul Skull ... Shop all products
      // </a>
      //
      // Restrict collection to these artwork-card anchors so the Favorite
      // heart button/icon can never be mistaken for the design.
      Array.from(
        document.querySelectorAll(
          'a[href*="/shop/ap/"]'
        )
      ).forEach(function (link) {
        var href = absolute(link.getAttribute("href"));
        var id = artworkId(href);

        if (!id || remembered[id]) return;

        // Desktop Redbubble currently adds a numeric id attribute matching
        // the artwork id. Mobile/WebView can omit that id entirely, so the
        // artwork URL is the source of truth. If an id is present, validate
        // it; otherwise continue normally.
        var linkId = clean(link.getAttribute("id"));

        if (
          linkId &&
          /^\d+$/.test(linkId) &&
          linkId !== id
        ) {
          return;
        }

        var artworkImg =
          Array.from(link.querySelectorAll("img")).find(function (img) {
            var src = absolute(
              img.currentSrc ||
              img.getAttribute("src") ||
              img.getAttribute("data-src") ||
              img.getAttribute("data-original") ||
              img.getAttribute("data-lazy-src") ||
              ""
            );

            var alt = clean(
              img.getAttribute("alt") || ""
            );

            return (
              /redbubble\.net/i.test(src) &&
              !/favorite/i.test(alt) &&
              !/\.svg(?:[?#]|$)/i.test(src)
            );
          }) || null;

        var rawText = clean(link.textContent);
        var title = clean(
          rawText
            .replace(/Shop all products/gi, " ")
            .replace(/\s+/g, " ")
        );

        if (!title) {
          var titleSpan =
            Array.from(
              link.querySelectorAll("span")
            ).find(function (span) {
              var value = clean(span.textContent);
              return (
                value &&
                value !== "Shop all products" &&
                value.length > 2
              );
            }) || null;

          title = clean(
            titleSpan && titleSpan.textContent
          );
        }

        remembered[id] = true;

        products.push({
          title:
            title || "Redbubble Artwork",
          description: "",
          productUrl: href,
          imageUrl: imageUrl(artworkImg),
          price: null,
          currency: "USD"
        });
      });

      allArtworkIdsFromDocument().forEach(function (id) {
        if (remembered[id]) return;

        var candidateLink =
          document.querySelector(
            'a[href*="/shop/ap/' + id + '"]'
          ) ||
          document.querySelector(
            'a[href*="/' + id + '/"]'
          );

        var href = candidateLink
          ? absolute(candidateLink.getAttribute("href"))
          : "https://www.redbubble.com/shop/ap/" + id;

        var artworkImg =
          candidateLink
            ? (
                Array.from(
                  candidateLink.querySelectorAll("img")
                ).find(function (img) {
                  var src = absolute(
                    img.currentSrc ||
                    img.getAttribute("src") ||
                    img.getAttribute("data-src") ||
                    img.getAttribute("data-original") ||
                    img.getAttribute("data-lazy-src") ||
                    ""
                  );

                  var alt = clean(
                    img.getAttribute("alt") || ""
                  );

                  return (
                    /redbubble\.net/i.test(src) &&
                    !/favorite/i.test(alt) &&
                    !/\.svg(?:[?#]|$)/i.test(src)
                  );
                }) || null
              )
            : null;

        var rawText =
          candidateLink
            ? clean(candidateLink.textContent)
            : "";

        var title = clean(
          rawText
            .replace(/Shop all products/gi, " ")
            .replace(/\s+/g, " ")
        );

        remembered[id] = true;

        products.push({
          title:
            title ||
            "Redbubble Artwork " + id,
          description: "",
          productUrl: href,
          imageUrl: imageUrl(artworkImg),
          price: null,
          currency: "USD"
        });
      });

      return products;
    }

    function sendSnapshot() {
      var products = collect();
      var showMore = findShowMore();

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "redbubble_full_snapshot",
          pageUrl: window.location.href,
          products: products,
          showMoreAvailable: !!showMore,
          diagnosticDocumentArtworkCount:
            allArtworkIdsFromDocument().length
        })
      );
    }

    // Force Redbubble to render the bottom control and any lazy design cards.
    var height = Math.max(
      (document.body && document.body.scrollHeight) || 0,
      (document.documentElement && document.documentElement.scrollHeight) || 0
    );

    window.scrollTo({ top: height, behavior: "auto" });

    try {
      window.dispatchEvent(new Event("scroll"));
    } catch {}

    setTimeout(sendSnapshot, 1700);
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "redbubble_full_page_error",
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

const REDBUBBLE_CLICK_SHOW_MORE_SCRIPT = String.raw`
(function () {
  try {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    // Verified Redbubble control:
    // <button type="button"><span><span>Show more</span></span></button>
    var target =
      Array.from(
        document.querySelectorAll('button[type="button"]')
      ).find(function (button) {
        return clean(button.textContent) === "Show more";
      }) || null;

    if (!target) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "redbubble_show_more_result",
          showMoreClicked: false
        })
      );
      true;
      return;
    }

    try {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto"
      });
    } catch {}

    setTimeout(function () {
      try {
        if (typeof PointerEvent !== "undefined") {
          ["pointerdown", "pointerup"].forEach(function (type) {
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse"
              })
            );
          });
        }
      } catch {}

      try {
        ["mousedown", "mouseup"].forEach(function (type) {
          target.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window
            })
          );
        });
      } catch {}

      try {
        target.click();
      } catch {}

      try {
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
          })
        );
      } catch {}

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "redbubble_show_more_result",
          showMoreClicked: true
        })
      );
    }, 250);
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "redbubble_show_more_result",
        showMoreClicked: false,
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

const REDBUBBLE_FULL_STORE_VISIBLE_SCRIPT = String.raw`
(function () {
  try {
    var remembered = {};
    var order = [];
    var showMoreClicks = 0;
    var confirmedNoGrowth = 0;
    var startedAt = Date.now();

    // Catalog-size agnostic: there is no maximum design count.
    var POLL_MS = 650;
    var GROWTH_TIMEOUT_MS = 18000;
    var CONFIRMED_NO_GROWTH_TO_FINISH = 12;
    var FAILSAFE_RUNTIME_MS = 30 * 60 * 1000;

    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function absolute(value) {
      try {
        return new URL(String(value || ""), window.location.href).toString();
      } catch {
        return "";
      }
    }

    function artworkId(value) {
      var href = String(value || "");
      var match =
        href.match(/\/shop\/ap\/(\d+)/i) ||
        href.match(/\/i\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i);
      return match && match[1] ? match[1] : "";
    }

    function getArtworkImage(link) {
      var candidates = [];

      Array.from(link.querySelectorAll("img")).forEach(function (img) {
        var alt = clean(img.getAttribute("alt") || "");
        if (/favorite/i.test(alt)) return;

        [
          img.currentSrc,
          img.getAttribute("src"),
          img.getAttribute("data-src"),
          img.getAttribute("data-original"),
          img.getAttribute("data-lazy-src")
        ].forEach(function (value) {
          if (value) candidates.push(value);
        });

        [
          img.getAttribute("srcset"),
          img.getAttribute("data-srcset")
        ].forEach(function (set) {
          String(set || "").split(",").forEach(function (entry) {
            var value = String(entry || "").trim().split(/\s+/)[0];
            if (value) candidates.push(value);
          });
        });
      });

      Array.from(link.querySelectorAll("source")).forEach(function (source) {
        [
          source.getAttribute("srcset"),
          source.getAttribute("data-srcset")
        ].forEach(function (set) {
          String(set || "").split(",").forEach(function (entry) {
            var value = String(entry || "").trim().split(/\s+/)[0];
            if (value) candidates.push(value);
          });
        });
      });

      var usable = candidates
        .map(absolute)
        .filter(function (value) {
          return (
            /^https?:\/\//i.test(value) &&
            /redbubble\.net/i.test(value) &&
            !/\.svg(?:[?#]|$)/i.test(value) &&
            !/(placeholder|transparent|spacer|blank)/i.test(value)
          );
        });

      if (usable.length) {
        return usable[usable.length - 1];
      }

      var nested = Array.from(link.querySelectorAll("*"));
      for (var i = 0; i < nested.length; i += 1) {
        var styleValue =
          nested[i].getAttribute &&
          nested[i].getAttribute("style");

        var match =
          String(styleValue || "").match(
            /url\(["']?([^"')]+)["']?\)/i
          );

        if (match && match[1]) {
          var backgroundUrl = absolute(match[1]);
          if (
            /redbubble\.net/i.test(backgroundUrl) &&
            !/\.svg(?:[?#]|$)/i.test(backgroundUrl)
          ) {
            return backgroundUrl;
          }
        }
      }

      return "";
    }

    function pageThumbnailForArtwork(id, link) {
      if (!id) return "";

      var direct = getArtworkImage(link);
      if (direct) return direct;

      var selectors = [
        'a[id="' + id + '"]',
        '[data-id="' + id + '"]',
        '[data-artwork-id="' + id + '"]',
        '[href*="/shop/ap/' + id + '"]'
      ];

      for (var s = 0; s < selectors.length; s += 1) {
        var nodes = Array.from(
          document.querySelectorAll(selectors[s])
        );

        for (var n = 0; n < nodes.length; n += 1) {
          var node = nodes[n];

          var containers = [
            node,
            node.parentElement,
            node.parentElement &&
              node.parentElement.parentElement,
            node.closest &&
              node.closest('[data-testid="ds-box"]')
          ].filter(Boolean);

          for (var c = 0; c < containers.length; c += 1) {
            var container = containers[c];

            var imgs = Array.from(
              container.querySelectorAll
                ? container.querySelectorAll("img")
                : []
            );

            for (var i = 0; i < imgs.length; i += 1) {
              var img = imgs[i];
              var alt = clean(img.getAttribute("alt") || "");

              if (/favorite/i.test(alt)) continue;

              var values = [
                img.currentSrc,
                img.getAttribute("src"),
                img.getAttribute("data-src"),
                img.getAttribute("data-original"),
                img.getAttribute("data-lazy-src")
              ];

              var srcset =
                img.getAttribute("srcset") ||
                img.getAttribute("data-srcset") ||
                "";

              String(srcset).split(",").forEach(function (entry) {
                var candidate =
                  String(entry || "").trim().split(/\s+/)[0];
                if (candidate) values.push(candidate);
              });

              var usable = values
                .map(absolute)
                .filter(function (value) {
                  return (
                    /^https?:\/\//i.test(value) &&
                    /redbubble\.net/i.test(value) &&
                    !/\.svg(?:[?#]|$)/i.test(value) &&
                    !/(placeholder|transparent|spacer|blank)/i.test(value)
                  );
                });

              if (usable.length) {
                return usable[usable.length - 1];
              }
            }
          }
        }
      }

      return "";
    }

    function refreshMissingThumbnails() {
      order.forEach(function (id) {
        var item = remembered[id];
        if (!item || item.imageUrl) return;

        var link =
          document.querySelector(
            'a[href*="/shop/ap/' + id + '"]'
          ) ||
          document.getElementById(id);

        if (!link) return;

        var recovered =
          pageThumbnailForArtwork(id, link);

        if (recovered) {
          item.imageUrl = recovered;
        }
      });
    }

    function getTitle(link) {
      var value = clean(link.textContent || "");
      value = clean(
        value
          .replace(/Shop all products/gi, " ")
          .replace(/\s+/g, " ")
      );

      return (
        value && !/^favorite$/i.test(value)
          ? value
          : "Redbubble Artwork"
      );
    }

    function collect() {
      var before = order.length;

      Array.from(
        document.querySelectorAll('a[href*="/shop/ap/"]')
      ).forEach(function (link) {
        var href = absolute(link.getAttribute("href"));
        var id = artworkId(href);
        if (!id) return;

        var existing = remembered[id];

        if (!existing) {
          order.push(id);
        }

        remembered[id] = {
          title:
            getTitle(link) ||
            (existing && existing.title) ||
            "Redbubble Artwork",
          description:
            (existing && existing.description) || "",
          productUrl:
            href ||
            (existing && existing.productUrl) || "",
          imageUrl:
            pageThumbnailForArtwork(id, link) ||
            (existing && existing.imageUrl) || "",
          price:
            existing && existing.price !== undefined
              ? existing.price
              : null,
          currency: "USD"
        };
      });

      // Promote every artwork ID discovered in Redbubble's serialized
      // document into the catalog even if its visual card is currently
      // virtualized out of the DOM. These rows intentionally remain
      // image-pending until a real thumbnail/detail page resolves them.
      htmlArtworkIds().forEach(function (id) {
        if (remembered[id]) return;

        order.push(id);
        remembered[id] = {
          title: "Redbubble Artwork " + id,
          description: "",
          productUrl:
            "https://www.redbubble.com/shop/ap/" + id,
          imageUrl: "",
          price: null,
          currency: "USD"
        };
      });

      return order.length - before;
    }

    function products() {
      // Return every discovered Redbubble artwork. Some entries will not yet
      // have a rendered thumbnail; those remain visible as image-pending and
      // are resolved during import instead of being discarded here.
      return order
        .map(function (id) {
          return remembered[id];
        })
        .filter(Boolean);
    }

    function anchorArtworkIds() {
      var ids = {};

      Array.from(
        document.querySelectorAll('a[href*="/shop/ap/"]')
      ).forEach(function (link) {
        var id = artworkId(
          absolute(link.getAttribute("href"))
        );

        if (id) {
          ids[id] = true;
        }
      });

      return Object.keys(ids);
    }

    function htmlArtworkIds() {
      var ids = {};
      var html =
        String(
          document.documentElement &&
          document.documentElement.innerHTML ||
          ""
        );

      function remember(value) {
        var id = String(value || "").trim();
        if (/^\d+$/.test(id)) {
          ids[id] = true;
        }
      }

      var patterns = [
        /(?:https?:\/\/www\.redbubble\.com)?\/shop\/ap\/(\d+)/gi,
        /\/i\/[^/"'\\\s]+\/[^/"'\\\s]+\/(\d+)(?:\/|\\u002F|["'\\\s<])/gi,
        /["']artworkId["']\s*:\s*["']?(\d+)["']?/gi,
        /["']artwork_id["']\s*:\s*["']?(\d+)["']?/gi
      ];

      patterns.forEach(function (regex) {
        var match;
        while ((match = regex.exec(html))) {
          if (match[1]) {
            remember(match[1]);
          }
        }
      });

      return Object.keys(ids);
    }

    function diagnosticSnapshot() {
      var collected = order.slice();
      var collectedSet = {};

      collected.forEach(function (id) {
        collectedSet[id] = true;
      });

      var anchorIds = anchorArtworkIds();
      var htmlIds = htmlArtworkIds();

      var htmlOnly = htmlIds.filter(function (id) {
        return !collectedSet[id];
      });

      return {
        anchorIds: anchorIds,
        htmlIds: htmlIds,
        collectedIds: collected,
        htmlOnlyIds: htmlOnly
      };
    }

    function showMoreButton() {
      return (
        Array.from(
          document.querySelectorAll('button[type="button"]')
        ).find(function (button) {
          return clean(button.textContent) === "Show more";
        }) || null
      );
    }

    function goBottom() {
      var height = Math.max(
        (document.body && document.body.scrollHeight) || 0,
        (document.documentElement && document.documentElement.scrollHeight) || 0
      );

      window.scrollTo({
        top: height,
        behavior: "auto"
      });

      try {
        window.dispatchEvent(new Event("scroll"));
      } catch {}

      setTimeout(function () {
        collect();
        refreshMissingThumbnails();
      }, 300);
    }

    function sendProgress() {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "scan_progress",
          scanMode: "full_store",
          scannedCount: order.length,
          scrollStep: showMoreClicks,
          maxScrollSteps: 0
        })
      );
    }

    function finish(reason) {
      collect();
      refreshMissingThumbnails();

      var diagnostic =
        diagnosticSnapshot();

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "scan_results",
          scanMode: "full_store",
          finishReason: reason,
          products: products(),
          pageUrl: window.location.href,
          pageTitle: document.title,
          totalLinks: document.querySelectorAll("a[href]").length,
          totalImages: document.querySelectorAll("img").length,
          diagnosticHtmlOnlyIds:
            diagnostic.htmlOnlyIds,
          diagnosticAnchorIds:
            diagnostic.anchorIds,
          diagnosticCollectedIds:
            diagnostic.collectedIds,
          diagnosticHtmlOnlyCount:
            diagnostic.htmlOnlyIds.length
        })
      );
    }

    function waitForGrowth(beforeCount, deadline) {
      collect();
      sendProgress();

      if (order.length > beforeCount) {
        // A real new batch appeared. This is the only event that resets
        // confirmed no-growth.
        confirmedNoGrowth = 0;

        setTimeout(function () {
          runNextPass();
        }, 350);
        return;
      }

      if (Date.now() < deadline) {
        setTimeout(function () {
          waitForGrowth(beforeCount, deadline);
        }, POLL_MS);
        return;
      }

      // The entire growth window elapsed without one new unique artwork ID.
      confirmedNoGrowth += 1;

      if (
        confirmedNoGrowth >=
        CONFIRMED_NO_GROWTH_TO_FINISH
      ) {
        finish("confirmed_no_growth");
        return;
      }

      // Redbubble may have ignored a click or temporarily recycled the button.
      // Re-check the bottom and attempt another verified Show more click.
      setTimeout(function () {
        runNextPass();
      }, 700);
    }

    function runNextPass() {
      if (
        Date.now() - startedAt >=
        FAILSAFE_RUNTIME_MS
      ) {
        finish("failsafe_runtime");
        return;
      }

      goBottom();

      setTimeout(function () {
        collect();
        sendProgress();

        var button = showMoreButton();

        if (!button) {
          // Do not immediately finish just because the button is absent for
          // one render. Give Redbubble the same full growth window.
          var beforeNoButton = order.length;
          var noButtonDeadline =
            Date.now() + GROWTH_TIMEOUT_MS;

          function waitForButtonOrGrowth() {
            collect();
            sendProgress();

            if (order.length > beforeNoButton) {
              confirmedNoGrowth = 0;
              setTimeout(runNextPass, 350);
              return;
            }

            var lateButton = showMoreButton();
            if (lateButton) {
              setTimeout(runNextPass, 250);
              return;
            }

            if (Date.now() < noButtonDeadline) {
              setTimeout(
                waitForButtonOrGrowth,
                POLL_MS
              );
              return;
            }

            confirmedNoGrowth += 1;

            if (
              confirmedNoGrowth >=
              CONFIRMED_NO_GROWTH_TO_FINISH
            ) {
              finish("show_more_exhausted");
              return;
            }

            setTimeout(runNextPass, 700);
          }

          setTimeout(
            waitForButtonOrGrowth,
            POLL_MS
          );
          return;
        }

        try {
          button.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto"
          });
        } catch {}

        var beforeClick = order.length;

        setTimeout(function () {
          try {
            button.click();
          } catch {}

          showMoreClicks += 1;
          sendProgress();

          waitForGrowth(
            beforeClick,
            Date.now() + GROWTH_TIMEOUT_MS
          );
        }, 250);
      }, 700);
    }

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });

    setTimeout(function () {
      collect();
      sendProgress();
      runNextPass();
    }, 900);
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

const REDBUBBLE_DETAIL_SCRIPT = `
(function () {
  try {
    function clean(value) {
      return String(value || "")
        .replace(/\\s+/g, " ")
        .trim();
    }

    function httpUrl(value) {
      try {
        var raw =
          String(value || "").trim();

        if (!raw) {
          return "";
        }

        var url = new URL(
          raw,
          window.location.href
        ).toString();

        return /^https?:\\/\\//i.test(url)
          ? url
          : "";
      } catch {
        return "";
      }
    }

    function artworkIdFromUrl(value) {
      var text = String(value || "");

      var match =
        text.match(
          /\\/i\\/[^/]+\\/[^/]+\\/(\\d+)(?:[./\\/]|$)/i
        ) ||
        text.match(
          /\\/shop\\/ap\\/(\\d+)/i
        );

      return match && match[1]
        ? match[1]
        : "";
    }

    function designTitleFromUrl(value) {
      try {
        var path =
          new URL(value).pathname;

        var match =
          path.match(
            /^\\/i\\/[^/]+\\/([^/]+)-by-[^/]+\\/\\d+/i
          );

        if (!match || !match[1]) {
          return "";
        }

        return clean(
          decodeURIComponent(
            match[1]
          ).replace(/-/g, " ")
        );
      } catch {
        return "";
      }
    }

    function getImageFromNode(node) {
      if (!node) {
        return "";
      }

      var values = [];

      var srcset =
        (
          node.getAttribute &&
          (
            node.getAttribute("srcset") ||
            node.getAttribute("data-srcset")
          )
        ) || "";

      if (srcset) {
        String(srcset)
          .split(",")
          .forEach(function (entry) {
            var value =
              String(entry || "")
                .trim()
                .split(/\\s+/)[0];

            if (value) {
              values.push(value);
            }
          });
      }

      values.push(
        node.currentSrc,
        node.getAttribute &&
          node.getAttribute("src"),
        node.getAttribute &&
          node.getAttribute("data-src")
      );

      for (
        var index = 0;
        index < values.length;
        index += 1
      ) {
        var resolved =
          httpUrl(values[index]);

        if (
          resolved &&
          /redbubble\\.net/i.test(resolved) &&
          !/\\/raf\\/?$/i.test(resolved) &&
          !/^data:/i.test(resolved) &&
          !/^blob:/i.test(resolved)
        ) {
          return resolved;
        }
      }

      return "";
    }

    var artworkId =
      artworkIdFromUrl(
        window.location.href
      );

    var designTitle =
      designTitleFromUrl(
        window.location.href
      );

    function findArtworkImage() {
      var images =
        Array.from(
          document.querySelectorAll("img")
        );

      /*
       * Preferred Redbubble artwork nodes.
       */
      var thumbnail =
        images.find(function (img) {
          var alt =
            clean(
              img.getAttribute("alt")
            );

          return /^Artwork thumbnail\\b/i.test(
            alt
          );
        }) || null;

      var imageUrl =
        getImageFromNode(
          thumbnail
        );

      if (
        !imageUrl &&
        thumbnail
      ) {
        var picture =
          thumbnail.closest(
            "picture"
          );

        if (picture) {
          var sources =
            Array.from(
              picture.querySelectorAll(
                "source"
              )
            );

          for (
            var sourceIndex = 0;
            sourceIndex < sources.length;
            sourceIndex += 1
          ) {
            imageUrl =
              getImageFromNode(
                sources[sourceIndex]
              );

            if (imageUrl) {
              break;
            }
          }
        }
      }

      if (!imageUrl) {
        var artworkView =
          images.find(function (img) {
            var alt =
              clean(
                img.getAttribute("alt")
              );

            if (
              !/^Artwork view\\b/i.test(alt)
            ) {
              return false;
            }

            if (
              designTitle &&
              !alt
                .toLowerCase()
                .includes(
                  designTitle.toLowerCase()
                )
            ) {
              return false;
            }

            return true;
          }) || null;

        imageUrl =
          getImageFromNode(
            artworkView
          );
      }

      /*
       * Some Redbubble product pages do not label the artwork image
       * "Artwork thumbnail" or "Artwork view" in the mobile WebView.
       * Search every rendered raster image/source before waiting for
       * another lazy-load pass.
       */
      if (!imageUrl) {
        for (
          var imageIndex = 0;
          imageIndex < images.length;
          imageIndex += 1
        ) {
          var candidateImage =
            getImageFromNode(
              images[imageIndex]
            );

          if (candidateImage) {
            imageUrl =
              candidateImage;
            break;
          }
        }
      }

      if (!imageUrl) {
        var allSources =
          Array.from(
            document.querySelectorAll(
              "source"
            )
          );

        for (
          var allSourceIndex = 0;
          allSourceIndex < allSources.length;
          allSourceIndex += 1
        ) {
          var candidateSource =
            getImageFromNode(
              allSources[
                allSourceIndex
              ]
            );

          if (candidateSource) {
            imageUrl =
              candidateSource;
            break;
          }
        }
      }

      /*
       * Open Graph/Twitter metadata is often present before Redbubble's
       * React artwork component finishes rendering.
       */
      if (!imageUrl) {
        var metaImage =
          document.querySelector(
            'meta[property="og:image"]'
          ) ||
          document.querySelector(
            'meta[name="twitter:image"]'
          ) ||
          document.querySelector(
            'meta[property="twitter:image"]'
          ) ||
          document.querySelector(
            'meta[name="twitter:image:src"]'
          );

        if (metaImage) {
          var metaUrl =
            httpUrl(
              metaImage.getAttribute(
                "content"
              )
            );

          if (
            metaUrl &&
            /redbubble\\.net/i.test(
              metaUrl
            )
          ) {
            imageUrl =
              metaUrl;
          }
        }
      }

      /*
       * Last-resort DOM/HTML recovery. Redbubble can serialize the CDN
       * artwork URL into page data even when the corresponding <img>
       * has not been mounted by the WebView yet.
       */
      if (!imageUrl) {
        var html =
          String(
            document.documentElement &&
            document.documentElement.innerHTML ||
            ""
          )
            .replace(/\\\\u002F/gi, "/")
            .replace(/\\\\\\//g, "/")
            .replace(/&amp;/gi, "&");

        var matches =
          html.match(
            /https?:\/\/[^"'<>\\s]+redbubble\\.net\/[^"'<>\\s]+/gi
          ) || [];

        for (
          var matchIndex = 0;
          matchIndex < matches.length;
          matchIndex += 1
        ) {
          var recovered =
            httpUrl(
              matches[matchIndex]
            );

          if (
            recovered &&
            /redbubble\\.net/i.test(
              recovered
            ) &&
            !/\\.svg(?:[?#]|$)/i.test(
              recovered
            ) &&
            !/(placeholder|transparent|spacer|blank)/i.test(
              recovered
            )
          ) {
            imageUrl =
              recovered;
            break;
          }
        }
      }

      return imageUrl;
    }

    function findDescription() {
      var description = "";

      var headings =
        Array.from(
          document.querySelectorAll(
            "h2, h3, h4"
          )
        );

      var artworkHeading =
        headings.find(function (node) {
          var text =
            clean(node.textContent);

          return (
            designTitle &&
            text
              .toLowerCase() ===
              designTitle.toLowerCase()
          );
        }) || null;

      if (artworkHeading) {
        var next =
          artworkHeading.nextElementSibling;

        while (next) {
          var candidateText =
            clean(next.textContent);

          if (
            candidateText &&
            candidateText.length > 40
          ) {
            description =
              candidateText;
            break;
          }

          next =
            next.nextElementSibling;
        }
      }

      if (!description) {
        var metaDescription =
          document.querySelector(
            'meta[property="og:description"]'
          ) ||
          document.querySelector(
            'meta[name="description"]'
          );

        if (metaDescription) {
          description =
            clean(
              metaDescription.getAttribute(
                "content"
              )
            );
        }
      }

      return description;
    }

    function findPrice() {
      var bodyText =
        clean(
          (
            document.body &&
            document.body.innerText
          ) ||
          (
            document.documentElement &&
            document.documentElement.innerText
          ) ||
          ""
        );

      var priceMatch =
        bodyText.match(
          /(?:US\\$|\\$)\\s*([0-9]+(?:\\.[0-9]{1,2})?)/
        );

      if (!priceMatch) {
        return null;
      }

      var parsedPrice =
        Number(priceMatch[1]);

      return (
        Number.isFinite(parsedPrice) &&
        parsedPrice > 0
      )
        ? parsedPrice
        : null;
    }

    var attempts = 0;
    var MAX_ATTEMPTS = 20;
    var WAIT_MS = 650;

    function collectAndSend() {
      attempts += 1;

      var imageUrl =
        findArtworkImage();

      var description =
        findDescription();

      var price =
        findPrice();

      /*
       * Redbubble lazy-renders artwork thumbnails at different
       * speeds. Keep checking until the real artwork image is
       * available instead of accepting a blank placeholder.
       */
      if (
        !imageUrl &&
        attempts < MAX_ATTEMPTS
      ) {
        window.scrollTo({
          top:
            Math.max(
              0,
              Math.max(
                (
                  document.body &&
                  (
                  document.body &&
                  document.body.scrollHeight
                ) || 0
                ) || 0,
                (
                  document.documentElement &&
                  document.documentElement.scrollHeight
                ) || 0
              ) * 0.35
            ),
          behavior: "smooth"
        });

        setTimeout(
          collectAndSend,
          WAIT_MS
        );

        return;
      }

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type:
            "redbubble_detail",
          productUrl:
            window.location.href,
          artworkId:
            artworkId || null,
          designTitle:
            designTitle || null,
          imageUrl:
            imageUrl || null,
          description:
            description || null,
          price:
            price,
          currency:
            "USD"
        })
      );
    }

    collectAndSend();
  } catch (error) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type:
          "redbubble_detail_error",
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



const FINE_ART_AMERICA_FULL_STORE_SCRIPT = `
(async function () {
  try {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function absolute(value, base) {
      try {
        var parsed = new URL(value || "", base || window.location.href);
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return "";
      }
    }

    function canonicalFeaturedUrl(value, base) {
      try {
        var parsed = new URL(value || "", base || window.location.href);
        if (!/(^|\.)fineartamerica\.com$/i.test(parsed.hostname)) return "";
        if (!/^\/featured\/[^/?#]+\.html$/i.test(parsed.pathname)) return "";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return "";
      }
    }

    function bestFromSrcset(value, base) {
      var parts = String(value || "").split(",").map(function (part) {
        var bits = clean(part).split(/\s+/);
        var url = absolute(bits[0], base);
        var width = 0;
        if (bits[1] && /w$/i.test(bits[1])) width = Number(bits[1].replace(/w$/i, "")) || 0;
        if (bits[1] && /x$/i.test(bits[1])) width = (Number(bits[1].replace(/x$/i, "")) || 0) * 1000;
        return { url: url, width: width };
      }).filter(function (item) { return /^https?:\/\//i.test(item.url); });
      parts.sort(function (a, b) { return b.width - a.width; });
      return parts[0] ? parts[0].url : "";
    }

    function scoreImage(url) {
      var lower = String(url || "").toLowerCase();
      if (!/^https?:\/\//i.test(lower)) return -10000;
      var score = 0;
      if (/fineartamerica\.com|pixels\.com/i.test(lower)) score += 1000;
      if (/images|artwork|featured|upload/i.test(lower)) score += 250;
      if (/\.jpe?g|\.png|\.webp/i.test(lower)) score += 100;
      if (/logo|icon|avatar|profile|sprite|placeholder|spacer|transparent|loading/i.test(lower)) score -= 2000;
      return score;
    }

    function imageFromNode(node, base) {
      if (!node || !node.querySelectorAll) return "";
      var candidates = [];
      Array.from(node.querySelectorAll("img")).forEach(function (img) {
        [
          img.currentSrc,
          img.src,
          img.getAttribute("src"),
          img.getAttribute("data-src"),
          img.getAttribute("data-lazy-src"),
          img.getAttribute("data-original"),
          img.getAttribute("data-image"),
          img.getAttribute("data-image-url"),
          img.getAttribute("data-cfsrc")
        ].forEach(function (value) {
          var url = absolute(value, base);
          if (url) candidates.push(url);
        });
        [img.getAttribute("srcset"), img.getAttribute("data-srcset")].forEach(function (value) {
          var url = bestFromSrcset(value, base);
          if (url) candidates.push(url);
        });
      });
      Array.from(node.querySelectorAll("source[srcset],source[data-srcset]")).forEach(function (source) {
        var url = bestFromSrcset(source.getAttribute("srcset") || source.getAttribute("data-srcset"), base);
        if (url) candidates.push(url);
      });
      var bgNodes = [node].concat(Array.from(node.querySelectorAll("[style*='background']")));
      bgNodes.forEach(function (el) {
        try {
          var style = window.getComputedStyle(el);
          var bg = String(style.backgroundImage || "");
          var match = bg.match(/url\(["']?([^"')]+)["']?\)/i);
          if (match && match[1]) candidates.push(absolute(match[1], base));
        } catch {}
      });
      var unique = Array.from(new Set(candidates.filter(Boolean)));
      unique.sort(function (a, b) { return scoreImage(b) - scoreImage(a); });
      return unique[0] && scoreImage(unique[0]) > 0 ? unique[0] : "";
    }

    function titleFromCard(card, ownerName) {
      var lines = String((card && card.innerText) || (card && card.textContent) || "")
        .split(/\n+/).map(clean).filter(Boolean);
      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i];
        if (line.toLowerCase() === ownerName.toLowerCase()) continue;
        if (/^\$\s*\d/.test(line)) continue;
        if (/^(products?|filters?|results?:|shop|home|artists?)$/i.test(line)) continue;
        if (/^(art prints?|canvas prints?|framed prints?|metal prints?|acrylic prints?|wood prints?|posters?|tapestries?)$/i.test(line)) continue;
        if (/^(add to cart|quick view|view product|shop now)$/i.test(line)) continue;
        return line.replace(/\s+(?:Print|Canvas Print|Framed Print|Art Print|Poster)$/i, "").trim();
      }
      return "Fine Art America Artwork";
    }

    function priceFromCard(card) {
      var text = clean(card && card.textContent);
      var match = text.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
      if (!match) return null;
      var value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    }

    function compactOwnerCard(startNode, ownerName) {
      var node = startNode;
      var fallback = null;
      for (var depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
        if (!node.querySelectorAll) continue;
        var text = clean(node.innerText || node.textContent);
        if (!text || text.length > 1200) continue;
        var ownerOk = text.toLowerCase().includes(ownerName.toLowerCase());
        var hasPrice = /\$\s*\d/.test(text);
        var hasImage = !!node.querySelector("img, picture, [style*='background']");
        if (ownerOk && hasPrice && hasImage) {
          fallback = node;
          if (text.length < 500) return node;
        }
      }
      return fallback;
    }

    var profileMatch = window.location.pathname.match(/^\/profiles\/([^/?#]+)/i);
    if (!profileMatch || !profileMatch[1]) {
      throw new Error("Fine Art America profile URL was not recognized.");
    }

    var profileSlug = decodeURIComponent(profileMatch[1]).replace(/\.html$/i, "").trim();
    var ownerName = profileSlug.split(/[-_\s]+/).filter(Boolean).map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");

    var products = new Map();
    var noGrowthRounds = 0;
    var stableHeightRounds = 0;
    var previousHeight = 0;
    var round = 0;
    var expectedTotal = 0;

    function harvest() {
      var bodyText = clean(document.body && document.body.innerText);
      var resultsMatch = bodyText.match(/Results:\s*([0-9,]+)/i);
      if (resultsMatch && resultsMatch[1]) {
        expectedTotal = Number(resultsMatch[1].replace(/,/g, "")) || expectedTotal;
      }

      var before = products.size;
      var anchors = Array.from(document.querySelectorAll("a[href*='/featured/']"));
      anchors.forEach(function (link) {
        var productUrl = canonicalFeaturedUrl(link.getAttribute("href") || link.href, window.location.href);
        if (!productUrl) return;
        var card = compactOwnerCard(link, ownerName);
        if (!card) return;
        var text = clean(card.innerText || card.textContent).toLowerCase();
        if (!text.includes(ownerName.toLowerCase()) || !/\$\s*\d/.test(text)) return;
        var imageUrl = imageFromNode(card, window.location.href);
        if (!imageUrl) return;
        var existing = products.get(productUrl);
        var next = {
          title: titleFromCard(card, ownerName),
          description: "",
          productUrl: productUrl,
          imageUrl: imageUrl,
          price: priceFromCard(card),
          currency: "USD"
        };
        if (!existing || (!existing.imageUrl && next.imageUrl)) products.set(productUrl, next);
      });

      // Fallback for FAA cards whose click target is stored in inline markup instead of href.
      Array.from(document.querySelectorAll("article,li,div")).forEach(function (card) {
        var text = clean(card.innerText || card.textContent);
        if (!text || text.length > 650) return;
        if (!text.toLowerCase().includes(ownerName.toLowerCase())) return;
        if (!/\$\s*\d/.test(text)) return;
        if (!card.querySelector("img,picture,[style*='background']")) return;
        var markup = String(card.outerHTML || "");
        var match = markup.match(/(?:https?:\/\/[^\"'<>\s]+)?\/featured\/[^\"'<>?\s]+\.html/i);
        if (!match || !match[0]) return;
        var productUrl = canonicalFeaturedUrl(match[0], window.location.href);
        if (!productUrl) return;
        var imageUrl = imageFromNode(card, window.location.href);
        if (!imageUrl) return;
        if (!products.has(productUrl)) {
          products.set(productUrl, {
            title: titleFromCard(card, ownerName),
            description: "",
            productUrl: productUrl,
            imageUrl: imageUrl,
            price: priceFromCard(card),
            currency: "USD"
          });
        }
      });

      var added = products.size - before;
      noGrowthRounds = added === 0 ? noGrowthRounds + 1 : 0;
      return added;
    }

    function clickMoreIfPresent() {
      var candidates = Array.from(document.querySelectorAll("button,a,[role='button']"));
      for (var i = 0; i < candidates.length; i += 1) {
        var label = clean(candidates[i].innerText || candidates[i].textContent).toLowerCase();
        if (/^(show more|load more|more results|view more)$/.test(label)) {
          try { candidates[i].click(); return true; } catch {}
        }
      }
      return false;
    }

    // Harvest the live, rendered FAA shop instead of fetched HTML. FAA injects
    // product cards and lazy thumbnails after page load, so static fetch parsing
    // misses listings and images. Repeated scrolling triggers every lazy batch.
    while (round < 160) {
      round += 1;
      harvest();

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "scan_progress",
        scannedCount: products.size,
        scanMode: "full_store"
      }));

      var doc = document.documentElement;
      var body = document.body;
      var height = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0);
      var viewportBottom = window.scrollY + window.innerHeight;
      var nearBottom = viewportBottom >= height - Math.max(300, window.innerHeight * 0.4);
      stableHeightRounds = height === previousHeight ? stableHeightRounds + 1 : 0;
      previousHeight = height;

      if (nearBottom) clickMoreIfPresent();

      if (noGrowthRounds >= 8 && stableHeightRounds >= 5 && nearBottom) break;

      var step = Math.max(500, Math.floor(window.innerHeight * 0.85));
      var target = Math.min(window.scrollY + step, Math.max(0, height - window.innerHeight));
      if (nearBottom) target = Math.max(0, height - window.innerHeight);
      window.scrollTo(0, target);
      await new Promise(function (resolve) { setTimeout(resolve, 650); });
    }

    // One final pass after the last lazy-load event settles.
    await new Promise(function (resolve) { setTimeout(resolve, 900); });
    harvest();

    var results = Array.from(products.values());
    if (!results.length) {
      throw new Error("Fine Art America shop loaded, but no owner-matched artwork cards with thumbnails were found.");
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "scan_results",
      products: results,
      pageUrl: window.location.href,
      pageTitle: ownerName + " Fine Art America Shop",
      totalLinks: results.length,
      totalImages: results.filter(function (item) { return !!item.imageUrl; }).length,
      scanMode: "full_store",
      expectedTotal: expectedTotal,
      marketplace: "fine_art_america"
    }));
  } catch (error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "scan_error",
      error: error && error.message ? error.message : String(error)
    }));
  }
  true;
})();
`;


function getRedbubblePreviewImageUrl(
  imageUrl: string,
  productUrl: string
) {
  const normalized = normalizeUrl(imageUrl);

  if (normalized && /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  // Keep the card render stable when a storefront thumbnail is
  // lazy-loaded or temporarily unavailable. The detail importer
  // will replace it with the validated Redbubble artwork image.
  return "";
}

function getRedbubbleArtworkId(value: string) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname || "";

    const shopMatch =
      path.match(/\/shop\/ap\/(\d+)/i);

    if (shopMatch?.[1]) {
      return shopMatch[1];
    }

    const itemMatch =
      path.match(
        /\/i\/[^/]+\/[^/]+\/(\d+)(?:[./\/]|$)/i
      );

    return itemMatch?.[1] || "";
  } catch {
    return "";
  }
}

export default function AIStoreScannerScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    storeUrl?: string;
  }>();

  const webViewRef =
    useRef<WebView>(null);

  // Redbubble detail pages are loaded in a separate hidden WebView so
  // importing never navigates the visible storefront away from the scan.
  const redbubbleDetailWebViewRef =
    useRef<WebView>(null);

  const redbubbleFullStoreWebViewRef =
    useRef<WebView>(null);

  const redbubbleFullStoreProductsRef =
    useRef<Map<string, ScannedProduct>>(new Map());

  const redbubbleFullStorePageRef = useRef(1);
  const redbubbleFullStoreEmptyPagesRef = useRef(0);
  const redbubbleFullStoreNoButtonRoundsRef = useRef(0);
  const redbubbleFullStoreNoGrowthRoundsRef = useRef(0);

  const pendingRedbubbleDetailRef =
    useRef<{
      targetUrl: string;
      expectedArtworkId: string;
      resolve: (value: Partial<ScannedProduct>) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
      reloadTimerId: ReturnType<typeof setTimeout>;
    } | null>(null);

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

  const scannerCacheKey =
    storeId ||
    `${storeType}:${String(params.storeUrl || storeName)}`;

  const cachedScannerSession =
    scannerSessionCache.get(scannerCacheKey);

  const [storeUrl, setStoreUrl] =
    useState(() =>
      cachedScannerSession?.storeUrl ||
      String(params.storeUrl || "")
    );

  const [browserUrl, setBrowserUrl] =
    useState(() =>
      cachedScannerSession?.browserUrl ||
      ""
    );

  const [redbubbleDetailUrl, setRedbubbleDetailUrl] =
    useState("");

  const [redbubbleDetailKey, setRedbubbleDetailKey] =
    useState(0);

  const [redbubbleFullStoreUrl, setRedbubbleFullStoreUrl] =
    useState("");

  const [redbubbleFullStoreKey, setRedbubbleFullStoreKey] =
    useState(0);

  const [products, setProducts] =
    useState<ScannedProduct[]>(() =>
      cachedScannerSession?.products || []
    );

  useEffect(() => {
    scannerSessionCache.set(scannerCacheKey, {
      storeUrl,
      browserUrl,
      products,
    });
  }, [
    scannerCacheKey,
    storeUrl,
    browserUrl,
    products,
  ]);

  const [pageLoading, setPageLoading] =
    useState(false);

  const pageLoadingTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const openingDifferentStore =
      !!browserUrl &&
      normalizeUrl(browserUrl) !== normalized;

    setStoreUrl(normalized);
    setBrowserUrl(normalized);

    // Reopening the same storefront must not destroy a successful scan.
    // Only clear results when the user actually changes to another URL.
    if (openingDifferentStore) {
      setProducts([]);
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

function getRedbubbleExploreUrl(value: string, page: number) {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/people\/([^/]+)/i);
    if (!match?.[1]) return "";
    return `https://www.redbubble.com/people/${match[1]}/explore?asc=u&page=${page}&sortOrder=recent`;
  } catch {
    return "";
  }
}

async function scanFineArtAmericaShop() {
  const currentUrl = storeUrl || browserUrl;

  if (!currentUrl) {
    Alert.alert(
      "Fine Art America URL Required",
      "Open the Fine Art America artist profile or shop before scanning."
    );
    return;
  }

  let normalizedProfileUrl = "";
  try {
    const parsed = new URL(currentUrl);
    const match = parsed.pathname.match(/^\/profiles\/([^/?#]+)/i);
    if (!match?.[1]) {
      throw new Error("Use a Fine Art America artist profile URL.");
    }
    normalizedProfileUrl = `${parsed.origin}/profiles/${match[1]}`;
  } catch (error: any) {
    Alert.alert(
      "Fine Art America URL Required",
      error?.message || "Use a Fine Art America artist profile URL."
    );
    return;
  }

  try {
    setProducts([]);
    setFullStoreScanning(true);
    setScanProgress("Restoring Fine Art America catalog import...");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(userError.message);
    }

    if (!user) {
      throw new Error("Please sign in before scanning Fine Art America.");
    }

    const response = await fetch(
      `${API_BASE}/stores/fine-art-america/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          storeId: storeId || undefined,
          storeUrl: normalizedProfileUrl,
          maxPages: 50,
          maxListings: 1000,
        }),
      }
    );

    const responseText = await response.text();
    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "ArtBoost received an invalid Fine Art America response."
      );
    }

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.details ||
          data?.error ||
          "Fine Art America could not be scanned."
      );
    }

    const returnedProducts = Array.isArray(data.products)
      ? data.products
      : [];

    const mapped: ScannedProduct[] = returnedProducts
      .map((item: any, index: number) => {
        const productUrl = normalizeUrl(
          item.product_url || item.productUrl,
          normalizedProfileUrl
        );
        const imageUrl = normalizeUrl(
          item.image_url || item.imageUrl,
          productUrl || normalizedProfileUrl
        );

        if (!productUrl) {
          return null;
        }

        return {
          id:
            String(item.id || "") ||
            makeProductId(productUrl) ||
            `faa-${index}`,
          title:
            cleanText(item.title) ||
            "Fine Art America Artwork",
          description: cleanText(item.description),
          productUrl,
          imageUrl,
          price:
            item.price === null || item.price === undefined
              ? null
              : Number(item.price),
          currency: cleanText(item.currency) || "USD",
          selected: true,
        } as ScannedProduct;
      })
      .filter(Boolean) as ScannedProduct[];

    setProducts(mapped);

    const thumbnailCount = mapped.filter(
      (item) => !!item.imageUrl
    ).length;

    Alert.alert(
      "Fine Art America Restored",
      [
        `${Number(data.discovered) || mapped.length} listings found.`,
        `${mapped.length} listings loaded into ArtBoost.`,
        `${thumbnailCount} thumbnails resolved.`,
        "",
        "This uses the dedicated Fine Art America importer that was working before the Universal Scanner changes.",
      ].join("\n")
    );
  } catch (error: any) {
    Alert.alert(
      "Fine Art America Scan Failed",
      error?.message ||
        "ArtBoost could not restore the Fine Art America catalog."
    );
  } finally {
    setFullStoreScanning(false);
    setScanProgress("");
  }
}

function scanEntireStore() {
  if (!browserUrl) {
    Alert.alert(
      "Open Store First",
      "Open the storefront before scanning the entire store."
    );
    return;
  }

  if (
    storeType === "fine_art_america" ||
    storeType === "fine-art-america" ||
    storeType === "fineartamerica" ||
    /fineartamerica\.com/i.test(browserUrl)
  ) {
    scanFineArtAmericaShop();
    return;
  }

  if (
    storeType === "redbubble" ||
    /redbubble\.com/i.test(browserUrl)
  ) {
    const firstPage =
      getRedbubbleExploreUrl(
        storeUrl || browserUrl,
        1
      );

    if (!firstPage) {
      Alert.alert(
        "Redbubble Profile Required",
        "ArtBoost could not determine the Redbubble username from this store URL."
      );
      return;
    }

    redbubbleFullStoreProductsRef.current.clear();
    redbubbleFullStoreNoGrowthRoundsRef.current = 0;
    redbubbleFullStoreNoButtonRoundsRef.current = 0;
    setFullStoreScanning(true);

    const currentExploreUrl =
      normalizeUrl(browserUrl);

    const targetExploreUrl =
      normalizeUrl(firstPage);

    if (
      currentExploreUrl &&
      targetExploreUrl &&
      currentExploreUrl ===
        targetExploreUrl
    ) {
      setScanProgress(
        "Starting Redbubble full-store scan..."
      );

      setTimeout(() => {
        webViewRef.current?.injectJavaScript(
          REDBUBBLE_FULL_STORE_VISIBLE_SCRIPT
        );
      }, 700);

      return;
    }

    setScanProgress(
      "Opening Redbubble Explore page..."
    );
    setStoreUrl(firstPage);
    setBrowserUrl(firstPage);
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
}

  async function enrichRedbubbleProductOnce(
    product: ScannedProduct
  ): Promise<ScannedProduct> {
    if (
      storeType !== "redbubble" ||
      !/redbubble\.com/i.test(
        product.productUrl
      )
    ) {
      return product;
    }

    const expectedArtworkId =
      getRedbubbleArtworkId(
        product.productUrl
      );

    if (!expectedArtworkId) {
      throw new Error(
        "Redbubble artwork ID could not be read from this product URL."
      );
    }

    const detail =
      await new Promise<
        Partial<ScannedProduct>
      >((resolve, reject) => {
        const reloadTimerId =
          setTimeout(() => {
            const pending =
              pendingRedbubbleDetailRef.current;

            if (
              pending &&
              pending.expectedArtworkId ===
                expectedArtworkId
            ) {
              /*
               * Some Redbubble detail pages stall on the first SPA
               * navigation. Force one WebView reload before failing.
               */
              redbubbleDetailWebViewRef.current?.reload();
            }
          }, 12000);

        const timeoutId =
          setTimeout(() => {
            const pending =
              pendingRedbubbleDetailRef.current;

            if (
              pending &&
              pending.expectedArtworkId ===
                expectedArtworkId
            ) {
              clearTimeout(
                pending.reloadTimerId
              );

              pendingRedbubbleDetailRef.current =
                null;
              setRedbubbleDetailUrl("");

              reject(
                new Error(
                  "Redbubble detail page timed out after retry."
                )
              );
            }
          }, 55000);

        pendingRedbubbleDetailRef.current = {
          targetUrl:
            product.productUrl,
          expectedArtworkId,
          resolve,
          reject,
          timeoutId,
          reloadTimerId,
        };

        // A fresh key guarantees a clean WebView instance for each product.
        setRedbubbleDetailKey((current) => current + 1);
        setRedbubbleDetailUrl(product.productUrl);
      });

    setRedbubbleDetailUrl("");

    return {
      ...product,
      title:
        cleanText(
          detail.title ||
            product.title
        ) ||
        product.title,
      imageUrl:
        String(
          detail.imageUrl ||
            product.imageUrl ||
            ""
        ),
      description:
        cleanText(
          detail.description ||
            product.description
        ),
      price:
        detail.price !== null &&
        detail.price !== undefined &&
        Number.isFinite(
          Number(detail.price)
        ) &&
        Number(detail.price) > 0
          ? Number(detail.price)
          : product.price,
      currency:
        cleanText(
          detail.currency ||
            product.currency
        ) || "USD",
    };
  }

  async function enrichRedbubbleProduct(
    product: ScannedProduct
  ): Promise<ScannedProduct> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await enrichRedbubbleProductOnce(product);
      } catch (error) {
        lastError = error;

        if (attempt < 2) {
          pendingRedbubbleDetailRef.current = null;
          setRedbubbleDetailUrl("");
          await new Promise((resolve) =>
            setTimeout(resolve, 1500)
          );
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to read Redbubble product details after retry.");
  }

  function handleScannerMessage(
    event: WebViewMessageEvent
  ) {
    try {
      const message: ScannerMessage =
        JSON.parse(
          event.nativeEvent.data
        );

      if (
        message.type ===
        "redbubble_detail" ||
        message.type ===
        "redbubble_detail_error"
      ) {
        const pending =
          pendingRedbubbleDetailRef.current;

        if (!pending) {
          return;
        }

        if (
          message.type ===
          "redbubble_detail_error"
        ) {
          clearTimeout(
            pending.timeoutId
          );
          clearTimeout(
            pending.reloadTimerId
          );

          pendingRedbubbleDetailRef.current =
            null;
          setRedbubbleDetailUrl("");

          pending.reject(
            new Error(
              message.error ||
                "Unable to read Redbubble product details."
            )
          );

          return;
        }

        const receivedArtworkId =
          cleanText(
            message.artworkId
          );

        if (
          !receivedArtworkId ||
          receivedArtworkId !==
            pending.expectedArtworkId
        ) {
          /*
           * A message from the previously rendered Redbubble page can
           * arrive after navigation to the next selected product begins.
           * Ignore that stale response and keep waiting for the artwork
           * ID currently being imported.
           */
          return;
        }

        const resolvedImageUrl =
          normalizeUrl(
            message.imageUrl
          );

        if (
          !resolvedImageUrl ||
          !/^https?:\/\//i.test(
            resolvedImageUrl
          ) ||
          !/redbubble\.net/i.test(
            resolvedImageUrl
          )
        ) {
          clearTimeout(
            pending.timeoutId
          );
          clearTimeout(
            pending.reloadTimerId
          );

          pendingRedbubbleDetailRef.current =
            null;
          setRedbubbleDetailUrl("");

          pending.reject(
            new Error(
              "Redbubble artwork image did not finish loading."
            )
          );

          return;
        }

        clearTimeout(
          pending.timeoutId
        );
        clearTimeout(
          pending.reloadTimerId
        );

        pendingRedbubbleDetailRef.current =
          null;
        setRedbubbleDetailUrl("");

        pending.resolve({
          title:
            cleanText(
              message.designTitle
            ) || undefined,
          imageUrl:
            resolvedImageUrl,
          description:
            cleanText(
              message.description
            ),
          price:
            message.price ?? null,
          currency:
            cleanText(
              message.currency
            ) || "USD",
        });

        return;
      }

      if (message.type === "redbubble_full_page_error") {
        setFullStoreScanning(false);
        setRedbubbleFullStoreUrl("");
        Alert.alert("Full Store Scan Failed", message.error || "Redbubble designs page could not be scanned.");
        return;
      }

      if (message.type === "redbubble_show_more_result") {
        if (!fullStoreScanning) {
          return;
        }

        if (!message.showMoreClicked) {
          redbubbleFullStoreNoButtonRoundsRef.current += 1;

          setScanProgress(
            `${redbubbleFullStoreProductsRef.current.size} unique designs found — waiting for Redbubble`
          );

          if (
            redbubbleFullStoreNoButtonRoundsRef.current >= 12
          ) {
            const all = Array.from(
              redbubbleFullStoreProductsRef.current.values()
            );

            setFullStoreScanning(false);
            setRedbubbleFullStoreUrl("");
            setScanProgress("");

            Alert.alert(
              "Full Store Scan Complete",
              `${all.length} unique Redbubble design${
                all.length === 1 ? "" : "s"
              } detected across the entire store.`
            );
            return;
          }

          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              REDBUBBLE_EXPLORE_PAGE_SCRIPT
            );
          }, 1600);

          return;
        }

        setScanProgress(
          `${redbubbleFullStoreProductsRef.current.size} unique designs found — loading more from Redbubble...`
        );

        // Keep the controller in React Native. If Show more appends in-place,
        // this collects the new DOM. If it navigates, onLoadEnd will inject
        // the collector into the new document instead.
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(
            REDBUBBLE_EXPLORE_PAGE_SCRIPT
          );
        }, 3600);

        return;
      }

      if (message.type === "redbubble_full_snapshot") {
        const discovered = Array.isArray(message.products)
          ? message.products
          : [];

        const map =
          redbubbleFullStoreProductsRef.current;

        const beforeCount = map.size;

        for (const item of discovered) {
          const productUrl = normalizeUrl(
            item.productUrl,
            message.pageUrl || browserUrl
          );

          const artworkId =
            getRedbubbleArtworkId(productUrl);

          if (!productUrl || !artworkId) {
            continue;
          }

          const existing =
            map.get(artworkId);

          const imageUrl =
            normalizeUrl(
              item.imageUrl,
              message.pageUrl || browserUrl
            );

          map.set(artworkId, {
            id:
              makeProductId(productUrl) ||
              artworkId,
            title:
              cleanText(item.title) ||
              existing?.title ||
              "Redbubble Artwork",
            description:
              cleanText(item.description) ||
              existing?.description ||
              "",
            productUrl,
            imageUrl:
              imageUrl ||
              existing?.imageUrl ||
              "",
            price:
              existing?.price ?? null,
            currency:
              cleanText(item.currency) ||
              existing?.currency ||
              "USD",
            selected: true,
          });
        }

        const all =
          Array.from(map.values());

        const importable =
          all.filter((product) => {
            const image =
              cleanText(product.imageUrl);

            return (
              /^https?:\/\//i.test(image) &&
              /redbubble\.net/i.test(image) &&
              !/\.svg(?:[?#]|$)/i.test(image) &&
              !/(placeholder|transparent|spacer|blank)/i.test(
                image
              )
            );
          });

        const pendingImageCount =
          all.length - importable.length;

        const added =
          map.size - beforeCount;

        console.log(
          "REDBUBBLE FULL SNAPSHOT",
          {
            pageUrl:
              message.pageUrl,
            snapshotProducts:
              discovered.length,
            documentArtworkIds:
              message.diagnosticDocumentArtworkCount,
            added,
            totalUnique:
              map.size,
            showMoreAvailable:
              message.showMoreAvailable,
          }
        );

        if (added > 0) {
          redbubbleFullStoreNoGrowthRoundsRef.current = 0;
          redbubbleFullStoreNoButtonRoundsRef.current = 0;
        } else {
          redbubbleFullStoreNoGrowthRoundsRef.current += 1;
        }

        setProducts(all);

        if (
          all.length === 0
        ) {
          setFullStoreScanning(false);
          setRedbubbleFullStoreUrl("");
          setScanProgress("");

          Alert.alert(
            "Full Store Scan Could Not Start",
            "Redbubble loaded the Explore page, but ArtBoost could not read any design links."
          );
          return;
        }

        setScanProgress(
          `${all.length} listings available • ${importable.length} with thumbnails • ${pendingImageCount} images pending${
            message.showMoreAvailable
              ? " — Show more found"
              : " — checking for more..."
          }`
        );

        if (message.showMoreAvailable) {
          if (
            redbubbleFullStoreNoGrowthRoundsRef.current >= 20
          ) {
            setFullStoreScanning(false);
            setRedbubbleFullStoreUrl("");
            setScanProgress("");

            Alert.alert(
              "Full Store Scan Stopped",
              `${all.length} Redbubble listings are available. ${importable.length} have verified thumbnails and ${pendingImageCount} are image-pending. Redbubble stopped adding new designs after repeated Show more attempts.`
            );
            return;
          }

          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              REDBUBBLE_CLICK_SHOW_MORE_SCRIPT
            );
          }, 450);

          return;
        }

        redbubbleFullStoreNoButtonRoundsRef.current += 1;

        // The Show more control can appear after the design batch renders.
        // Require several no-button observations before declaring the end.
        if (
          redbubbleFullStoreNoButtonRoundsRef.current < 12
        ) {
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              REDBUBBLE_EXPLORE_PAGE_SCRIPT
            );
          }, 1800);
          return;
        }

        setFullStoreScanning(false);
        setRedbubbleFullStoreUrl("");
        setScanProgress("");

        Alert.alert(
          "Full Store Scan Complete",
          `${all.length} Redbubble listing${
            all.length === 1 ? "" : "s"
          } available. ${importable.length} have verified thumbnails and ${pendingImageCount} are image-pending.`
        );

        return;
      }

        if (
  message.type ===
  "scan_progress"
) {
  setScanProgress(
    `${message.scannedCount || 0} unique products found — scanning entire store...`
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

        const fullStoreResult =
          message.scanMode === "full_store";

        const redbubbleResult =
          storeType === "redbubble" ||
          /redbubble\.com/i.test(
            productUrl ||
            browserUrl
          );

        if (
          !productUrl ||
          (!imageUrl && !fullStoreResult) ||
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

      setProducts(mapped);

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
            "Scroll through the store so more artwork loads, then scan again.",
            "",
            "Inspection details were also printed in the Metro terminal.",
          ].join("\n")
        );
      } else {
        Alert.alert(
          message.scanMode === "full_store"
            ? "Full Store Scan Complete"
            : "Scan Complete",
          message.scanMode === "full_store"
            ? `${mapped.length} unique design${
                mapped.length === 1 ? "" : "s"
              } detected across the store.`
            : `${mapped.length} product${
                mapped.length === 1 ? "" : "s"
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
setFullStoreScanning(false);
setScanProgress("");
    }
  }

  async function buildRedbubbleCsv() {
    if (products.length === 0) {
      Alert.alert(
        "Nothing to Export",
        "Scan the Redbubble store before building a CSV."
      );
      return;
    }

    try {
      const csv = buildCatalogCsv(
        products.map((product) => ({
          artworkId:
            getRedbubbleArtworkIdFromUrl(
              product.productUrl
            ),
          title: product.title,
          description: product.description,
          productUrl: product.productUrl,
          imageUrl: product.imageUrl || "",
          price: product.price,
          currency:
            product.currency || "USD",
          storeType,
          storeName,
          imageStatus:
            hasVerifiedCatalogImage(
              product.imageUrl
            )
              ? "verified"
              : "pending",
        }))
      );

      const safeStoreName =
        String(storeName || "redbubble")
          .replace(/[^a-z0-9_-]+/gi, "_")
          .replace(/^_+|_+$/g, "") ||
        "redbubble";

      const csvFile =
        new File(
          Paths.cache,
          `${safeStoreName}_artboost_catalog.csv`
        );

      csvFile.write(csv);

      const fileUri =
        csvFile.uri;

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "CSV Built",
          `ArtBoost created a CSV with ${products.length} listings at ${fileUri}`
        );
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle:
          "Save ArtBoost Catalog CSV",
        UTI: "public.comma-separated-values-text",
      });
    } catch (error: any) {
      Alert.alert(
        "CSV Build Failed",
        error?.message ||
          "ArtBoost could not build the catalog CSV."
      );
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

      let importedCount = 0;
      const failed: string[] = [];

      for (
        const product of
        selectedProducts
      ) {
        try {
          let productToImport =
            product;

          if (
            storeType === "redbubble"
          ) {
            /*
             * Prefer the validated detail-page artwork when Redbubble
             * finishes loading it, but do not fail an otherwise valid
             * scanned product just because the hidden detail WebView
             * times out or never replaces the storefront thumbnail.
             *
             * The scanner has already associated this image with the
             * selected Redbubble product. The backend import pipeline
             * can cache the usable source image after import.
             */
            const scannedImageUrl =
              normalizeUrl(
                product.imageUrl,
                product.productUrl
              );

            const hasUsableScannedImage =
              !!scannedImageUrl &&
              /^https?:\/\//i.test(
                scannedImageUrl
              );

            const scannedImageIsHtmlPage =
              (() => {
                if (
                  !hasUsableScannedImage
                ) {
                  return true;
                }

                try {
                  const parsed =
                    new URL(
                      scannedImageUrl
                    );

                  const hostname =
                    parsed.hostname
                      .replace(
                        /^www\./i,
                        ""
                      )
                      .toLowerCase();

                  const pathname =
                    parsed.pathname ||
                    "";

                  /*
                   * redbubble.com URLs are normally HTML storefront/product
                   * pages, not publishable image assets. Other HTTP(S) image
                   * hosts/CDNs captured by the visible scanner are allowed
                   * through and will still be validated/cached by the backend.
                   */
                  return (
                    hostname ===
                      "redbubble.com" ||
                    hostname.endsWith(
                      ".redbubble.com"
                    ) ||
                    /^\/people\//i.test(
                      pathname
                    ) ||
                    /^\/shop(?:\/|$)/i.test(
                      pathname
                    ) ||
                    /^\/i\//i.test(
                      pathname
                    )
                  );
                } catch {
                  return true;
                }
              })();

            const hasDirectScannedArtworkImage =
              hasUsableScannedImage &&
              !scannedImageIsHtmlPage;

            if (
              hasDirectScannedArtworkImage
            ) {
              /*
               * The visible scanner already captured the real Redbubble
               * artwork CDN image. Import it immediately instead of
               * reopening the product in the hidden detail WebView.
               *
               * This avoids Redbubble lazy-loading/time-out failures and
               * lets the backend validate/cache the same artwork URL.
               */
              productToImport = {
                ...product,
                imageUrl:
                  scannedImageUrl,
              };

              console.log(
                "[Universal Scanner] Using scanned artwork image directly.",
                {
                  productUrl:
                    product.productUrl,
                  imageUrl:
                    scannedImageUrl,
                }
              );
            } else {
              try {
                productToImport =
                  await enrichRedbubbleProduct(
                    product
                  );
              } catch (detailError) {
                if (
                  !hasUsableScannedImage
                ) {
                  throw detailError;
                }

                console.warn(
                  "[Universal Scanner] Redbubble detail enrichment failed; using scanned artwork image instead.",
                  {
                    productUrl:
                      product.productUrl,
                    imageUrl:
                      scannedImageUrl,
                    error:
                      detailError instanceof Error
                        ? detailError.message
                        : String(
                            detailError
                          ),
                  }
                );

                productToImport = {
                  ...product,
                  imageUrl:
                    scannedImageUrl,
                };
              }
            }

            setProducts((current) =>
              current.map((item) =>
                item.id === product.id
                  ? {
                      ...item,
                      title:
                        productToImport.title ||
                        item.title,
                      description:
                        productToImport.description ||
                        item.description,
                      imageUrl:
                        productToImport.imageUrl ||
                        item.imageUrl,
                      price:
                        productToImport.price ??
                        item.price,
                      currency:
                        productToImport.currency ||
                        item.currency,
                    }
                  : item
              )
            );
          }

          const response =
            await fetch(
              `${API_BASE}/catalog/import-product`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    userId:
                      user.id,
                    storeId:
                      storeId ||
                      null,
                    storeName,
                    storeType,
                    title:
                      productToImport.title,
                    description:
                      productToImport.description,
                    imageUrl:
                      productToImport.imageUrl,
                    productUrl:
                      productToImport.productUrl,
                    price:
                      productToImport.price,
                    currency:
                      productToImport.currency,
                    productType:
                      "Artwork",
                    tags: [],
                  }),
              }
            );

          const responseText =
            await response.text();

          let data: any;

          try {
            data =
              JSON.parse(
                responseText
              );
          } catch {
            throw new Error(
              `Backend returned HTTP ${response.status}.`
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

          importedCount += 1;

          setProducts((current) =>
            current.map((item) =>
              item.id === product.id
                ? {
                    ...item,
                    selected: false,
                  }
                : item
            )
          );
        } catch (
          error: any
        ) {
          failed.push(
            `${product.title}: ${
              error?.message ||
              "Import failed"
            }`
          );
        }
      }

      if (importedCount === 0) {
        throw new Error(
          failed[0] ||
            "No products were imported."
        );
      }

      Alert.alert(
        "Import Complete",
        failed.length
          ? [
              `${importedCount} product${
                importedCount === 1
                  ? ""
                  : "s"
              } imported successfully.`,
              `${failed.length} failed.`,
              "",
              `Failed product${
                failed.length === 1
                  ? ""
                  : "s"
              }:`,
              failed.join("\n\n"),
            ].join("\n")
          : `${importedCount} product${
              importedCount === 1
                ? ""
                : "s"
            } imported successfully.`,
        [
          {
            text: "Done",
            style: "cancel",
          },
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
              router.replace({
                pathname:
                  "/store-products" as any,
                params: {
                  storeId,
                  storeName,
                  storeType,
                  connected: "true",
                },
              })
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
              value={storeUrl}
              onChangeText={
                setStoreUrl
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
              onLoadStart={() => {
                setPageLoading(true);

                if (pageLoadingTimerRef.current) {
                  clearTimeout(
                    pageLoadingTimerRef.current
                  );
                }

                // Some Redbubble SPA/background requests keep React Native
                // WebView in a loading state even after the storefront is
                // visibly usable. Never leave "Loading storefront..." stuck.
                pageLoadingTimerRef.current =
                  setTimeout(() => {
                    setPageLoading(false);
                    pageLoadingTimerRef.current = null;
                  }, 7000);
              }}
              onLoadProgress={(event) => {
                const progress =
                  Number(
                    event.nativeEvent.progress || 0
                  );

                // The visible Redbubble shell/grid is usable before every
                // analytics/ad request finishes. Hide the loader once the
                // document is effectively rendered.
                if (progress >= 0.85) {
                  setPageLoading(false);

                  if (pageLoadingTimerRef.current) {
                    clearTimeout(
                      pageLoadingTimerRef.current
                    );
                    pageLoadingTimerRef.current =
                      null;
                  }
                }
              }}
              onLoadEnd={(event) => {
                setPageLoading(false);

                if (pageLoadingTimerRef.current) {
                  clearTimeout(
                    pageLoadingTimerRef.current
                  );
                  pageLoadingTimerRef.current =
                    null;
                }

                const loadedUrl =
                  event.nativeEvent.url || "";

                if (
                  fullStoreScanning &&
                  /redbubble\.com\/people\/[^/]+\/explore/i.test(
                    loadedUrl
                  )
                ) {
                  setTimeout(() => {
                    webViewRef.current?.injectJavaScript(
                      REDBUBBLE_FULL_STORE_VISIBLE_SCRIPT
                    );
                  }, 1800);
                }

                if (
                  fullStoreScanning &&
                  /fineartamerica\.com\/profiles\/[^/]+\/shop(?:[/?#]|$)/i.test(
                    loadedUrl
                  )
                ) {
                  setTimeout(() => {
                    webViewRef.current?.injectJavaScript(
                      FINE_ART_AMERICA_FULL_STORE_SCRIPT
                    );
                  }, 900);
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

                if (!state.loading) {
                  setPageLoading(false);

                  if (pageLoadingTimerRef.current) {
                    clearTimeout(
                      pageLoadingTimerRef.current
                    );
                    pageLoadingTimerRef.current =
                      null;
                  }
                }
              }}
              onMessage={
                handleScannerMessage
              }
              onError={(event) => {
                setPageLoading(false);

                if (pageLoadingTimerRef.current) {
                  clearTimeout(
                    pageLoadingTimerRef.current
                  );
                  pageLoadingTimerRef.current =
                    null;
                }

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

{storeType === "redbubble" && products.length > 0 ? (
  <Pressable
    style={[
      styles.csvButton,
      (scanning || fullStoreScanning || importing) &&
        styles.disabledButton,
    ]}
    onPress={buildRedbubbleCsv}
    disabled={
      scanning ||
      fullStoreScanning ||
      importing
    }
  >
    <Ionicons
      name="document-text-outline"
      size={21}
      color="#ffffff"
    />
    <Text style={styles.scanButtonText}>
      {`Build CSV (${products.length} Listings)`}
    </Text>
  </Pressable>
) : null}

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

        {redbubbleDetailUrl ? (
          <WebView
            key={`redbubble-detail-${redbubbleDetailKey}`}
            ref={redbubbleDetailWebViewRef}
            source={{ uri: redbubbleDetailUrl }}
            style={styles.hiddenDetailWebView}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onLoadEnd={(event) => {
              const pending =
                pendingRedbubbleDetailRef.current;
              const loadedUrl =
                event.nativeEvent.url || "";

              if (
                pending &&
                getRedbubbleArtworkId(loadedUrl) ===
                  pending.expectedArtworkId
              ) {
                setTimeout(() => {
                  redbubbleDetailWebViewRef.current?.injectJavaScript(
                    REDBUBBLE_DETAIL_SCRIPT
                  );
                }, 1200);
              }
            }}
            onMessage={handleScannerMessage}
            onError={() => {
              // Let the existing reload/timeout retry path handle transient
              // Redbubble failures without interrupting the visible scanner.
            }}
          />
        ) : null}

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
                  {getRedbubblePreviewImageUrl(
                    item.imageUrl,
                    item.productUrl
                  ) ? (
                    <Image
                      source={{
                        uri: getRedbubblePreviewImageUrl(
                          item.imageUrl,
                          item.productUrl
                        ),
                        headers: /redbubble\.net/i.test(
                          getRedbubblePreviewImageUrl(item.imageUrl, item.productUrl)
                        )
                          ? {
                              Referer: "https://www.redbubble.com/",
                              Accept: "image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
                            }
                          : undefined,
                      }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Ionicons
                        name="image-outline"
                        size={24}
                        color="#8b5cf6"
                      />
                      <Text style={styles.productImagePlaceholderText}>
                        Artwork loads on import
                      </Text>
                    </View>
                  )}

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

  hiddenDetailWebView: {
    position: "absolute",
    width: 390,
    height: 844,
    left: -5000,
    top: 0,
    opacity: 0.01,
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

  csvButton: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#8b5cf6",
    backgroundColor: "#21133f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    marginTop: 10,
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
    maxHeight: 310,
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
    width: 126,
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
    height: 94,
    borderRadius: 10,
    backgroundColor: "#292929",
  },

  productImagePlaceholder: {
    width: "100%",
    height: 94,
    borderRadius: 10,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: "#33205e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  productImagePlaceholderText: {
    color: "#9b8abf",
    fontSize: 8,
    lineHeight: 11,
    textAlign: "center",
    marginTop: 5,
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