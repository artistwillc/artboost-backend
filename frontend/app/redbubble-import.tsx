// ARTBOOST_VISUAL_PARITY_V3153
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type ImportMode =
  | "store"
  | "collection"
  | "artwork";

type ImportProgressStep = {
  percent: number;
  label: string;
};

type RedbubbleArtworkRecord = {
  productUrl: string;
  title: string;
  imageUrl: string;
};

type ExtractedMetadata = {
  pageType: ImportMode;
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  browserUrl: string;
  artistUsername: string;
  artworkId: string;
  collectionId: string;
  artworkLinks: string[];
  artworkRecords: RedbubbleArtworkRecord[];
  scanFinal: boolean;
  reportedDesignCount: number;
};

const IMPORT_PROGRESS_STEPS: ImportProgressStep[] = [
  {
    percent: 20,
    label: "Finding artwork...",
  },
  {
    percent: 40,
    label: "Finding collections...",
  },
  {
    percent: 60,
    label: "Analyzing Redbubble listings...",
  },
  {
    percent: 80,
    label: "Building your artwork library...",
  },
];

const EMPTY_METADATA: ExtractedMetadata = {
  pageType: "artwork",
  title: "",
  description: "",
  imageUrl: "",
  pageUrl: "",
  browserUrl: "",
  artistUsername: "",
  artworkId: "",
  collectionId: "",
  artworkLinks: [],
  artworkRecords: [],
  scanFinal: false,
  reportedDesignCount: 0,
};


const REDBUBBLE_SYNC_BATCH_SIZE = 50;
const REDBUBBLE_FAILED_RETRY_BATCH_SIZE = 20;
const REDBUBBLE_MAX_EXPLORE_PAGES = 500;
const REDBUBBLE_BATCH_MAX_ATTEMPTS = 3;

function sleepMs(
  milliseconds: number
) {
  return new Promise<void>((resolve) => {
    setTimeout(
      resolve,
      Math.max(
        0,
        Math.floor(milliseconds)
      )
    );
  });
}

function extractRedbubbleArtworkId(
  value: string
) {
  try {
    const parsed = new URL(
      String(value || "").trim()
    );

    const path =
      parsed.pathname || "";

    const shopMatch =
      path.match(/\/shop\/ap\/(\d+)/i);

    if (shopMatch?.[1]) {
      return shopMatch[1];
    }

    const itemMatch =
      path.match(
        /\/i\/[^/]+\/[^/]+\/(\d+)(?:[./]|\/|$)/i
      );

    return itemMatch?.[1] || "";
  } catch {
    return "";
  }
}

function getRedbubbleArtistUsername(
  value: string
) {
  try {
    const parsed = new URL(
      String(value || "").trim()
    );

    const match =
      parsed.pathname.match(
        /\/people\/([^/]+)/i
      );

    return match?.[1]
      ? decodeURIComponent(match[1])
      : "";
  } catch {
    return "";
  }
}

function buildRedbubbleExplorePageUrl(
  artistUsername: string,
  page: number
) {
  const cleanArtist =
    String(artistUsername || "").trim();

  const safePage =
    Math.max(
      1,
      Math.floor(Number(page) || 1)
    );

  const url =
    new URL(
      `https://www.redbubble.com/people/${encodeURIComponent(
        cleanArtist
      )}/explore`
    );

  url.searchParams.set("asc", "u");
  url.searchParams.set(
    "page",
    String(safePage)
  );
  url.searchParams.set(
    "sortOrder",
    "recent"
  );
  url.searchParams.set(
    "_artboost_refresh",
    String(Date.now())
  );

  return url.toString();
}

function buildRedbubbleShopPageUrl(
  artistUsername: string,
  page: number
) {
  const cleanArtist =
    String(artistUsername || "").trim();

  const safePage =
    Math.max(
      1,
      Math.floor(Number(page) || 1)
    );

  const url =
    new URL(
      `https://www.redbubble.com/people/${encodeURIComponent(
        cleanArtist
      )}/shop`
    );

  url.searchParams.set("asc", "u");
  url.searchParams.set(
    "page",
    String(safePage)
  );
  url.searchParams.set(
    "sortOrder",
    "recent"
  );
  url.searchParams.set(
    "_artboost_refresh",
    String(Date.now())
  );

  return url.toString();
}

function getRedbubbleExplorePageNumber(
  value: string
) {
  try {
    const parsed =
      new URL(value);

    const page =
      Number(
        parsed.searchParams.get("page")
      );

    return Number.isFinite(page) &&
      page >= 1
      ? Math.floor(page)
      : 1;
  } catch {
    return 1;
  }
}

function chunkRedbubbleArtworkLinks(
  values: string[],
  size = REDBUBBLE_SYNC_BATCH_SIZE
) {
  const chunkSize =
    Math.max(
      1,
      Math.floor(Number(size) || 1)
    );

  const chunks: string[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += chunkSize
  ) {
    chunks.push(
      values.slice(
        index,
        index + chunkSize
      )
    );
  }

  return chunks;
}

const EXTRACTION_SCRIPT = `
(function () {
  function readMeta(key) {
    var element =
      document.querySelector('meta[property="' + key + '"]') ||
      document.querySelector('meta[name="' + key + '"]');

    return element && element.content
      ? element.content.trim()
      : "";
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function detectPageType(url) {
    try {
      var parsed = new URL(url);

      if (/\\/shop\\/ap\\/\\d+/i.test(parsed.pathname)) {
        return "artwork";
      }

      if (
        /\\/people\\/[^/]+\\/shop\\/?$/i.test(parsed.pathname) &&
        parsed.searchParams.get("collections")
      ) {
        return "collection";
      }

      return "store";
    } catch {
      return "artwork";
    }
  }

  function getArtistUsername(url) {
    try {
      var parsed = new URL(url);
      var queryName =
        parsed.searchParams.get("artistUserName");

      if (queryName) {
        return queryName;
      }

      var match =
        parsed.pathname.match(/\\/people\\/([^/]+)/i);

      return match && match[1]
        ? decodeURIComponent(match[1])
        : "";
    } catch {
      return "";
    }
  }

  function getArtworkId(url) {
    var value =
      String(url || "");

    var match =
      value.match(
        /\\/shop\\/ap\\/(\\d+)/i
      ) ||
      value.match(
        /\\/i\\/[^/]+\\/[^/]+\\/(\\d+)/i
      );

    return match && match[1]
      ? match[1]
      : "";
  }

  function getCollectionId(url) {
    try {
      return (
        new URL(url).searchParams.get(
          "collections"
        ) || ""
      );
    } catch {
      return "";
    }
  }

  function getReportedDesignCount() {
    try {
      var bodyText =
        document.body
          ? String(
              document.body.innerText || ""
            )
          : "";

      var match =
        bodyText.match(
          /\b(\d{1,5})\s+designs\b/i
        );

      if (!match || !match[1]) {
        return 0;
      }

      var value =
        Number(match[1]);

      return Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
    } catch {
      return 0;
    }
  }

  function extract(isFinalPass) {
    var currentUrl =
      readMeta("og:url") ||
      window.location.href;

    function normalizeCandidateUrl(value) {
      try {
        var cleaned =
          String(value || "")
            .replace(/\\\\u002f/gi, "/")
            .replace(/\\\\\\//g, "/")
            .replace(/&amp;/gi, "&")
            .trim();

        if (!cleaned) {
          return "";
        }

        var absoluteUrl =
          new URL(
            cleaned,
            window.location.origin
          );

        var path =
          absoluteUrl.pathname || "";

        if (
          /\\/shop\\/ap\\/\\d+/i.test(path) ||
          /\\/i\\/[^/]+\\/[^/]+\\/\\d+/i.test(path)
        ) {
          absoluteUrl.hash = "";
          return absoluteUrl.toString();
        }

        return "";
      } catch {
        return "";
      }
    }

    function cleanArtworkTitle(value) {
      var text =
        String(value || "")
          .replace(/\s+/g, " ")
          .trim();

      if (!text) {
        return "";
      }

      var previewMatch =
        text.match(
          /^Item preview,\s*(.*?)\s+designed and sold by\b/i
        );

      if (
        previewMatch &&
        previewMatch[1]
      ) {
        return previewMatch[1].trim();
      }

      return text;
    }

    function findArtworkImage(link) {
      var node = link;

      for (
        var depth = 0;
        depth < 5 && node;
        depth += 1
      ) {
        try {
          var image =
            node.querySelector &&
            node.querySelector(
              'img[alt*="Item preview"], img[src*="redbubble.net/image."], img[src*="redbubble.net/image"]'
            );

          if (image) {
            return image;
          }
        } catch {
          // Continue walking up the card.
        }

        node =
          node.parentElement || null;
      }

      return null;
    }

    function buildArtworkRecord(
      link,
      productUrl
    ) {
      var image =
        findArtworkImage(link);

      var imageAlt =
        image
          ? image.getAttribute("alt") || ""
          : "";

      var imageUrl =
        image
          ? image.currentSrc ||
            image.getAttribute("src") ||
            image.getAttribute("data-src") ||
            ""
          : "";

      var title =
        cleanArtworkTitle(
          imageAlt ||
            link.getAttribute("aria-label") ||
            link.textContent ||
            ""
        );

      return {
        productUrl:
          productUrl || "",
        title:
          title || "",
        imageUrl:
          String(imageUrl || "").trim(),
      };
    }

    var artworkRecords = [];

    var anchorCandidates =
      Array.from(
        document.querySelectorAll(
          'a[href*="/shop/ap/"], a[href*="/i/"]'
        )
      ).map(function (link) {
        var productUrl =
          normalizeCandidateUrl(
            link.getAttribute("href")
          );

        if (productUrl) {
          artworkRecords.push(
            buildArtworkRecord(
              link,
              productUrl
            )
          );
        }

        return productUrl;
      });

    var attributeCandidates = [];

    Array.from(
      document.querySelectorAll(
        "[href], [data-href], [data-url], [data-product-url]"
      )
    ).forEach(function (element) {
      [
        "href",
        "data-href",
        "data-url",
        "data-product-url",
      ].forEach(function (attributeName) {
        var value =
          element.getAttribute(
            attributeName
          );

        var normalized =
          normalizeCandidateUrl(
            value
          );

        if (normalized) {
          attributeCandidates.push(
            normalized
          );
        }
      });
    });

    var htmlCandidates = [];

    try {
      var html =
        document.documentElement
          ? document.documentElement.innerHTML
          : "";

      var normalizedHtml =
        String(html || "")
          .replace(/\\\\u002f/gi, "/")
          .replace(/\\\\\\//g, "/")
          .replace(/&amp;/gi, "&");

      var shopMatches =
        normalizedHtml.match(
          /(?:https?:\\/\\/www\\.redbubble\\.com)?\\/shop\\/ap\\/\\d+(?:\\?[^"'<>\\s]*)?/gi
        ) || [];

      var itemMatches =
        normalizedHtml.match(
          /(?:https?:\\/\\/www\\.redbubble\\.com)?\\/i\\/[^"'<>\\s]+\\/[^"'<>\\s]+\\/\\d+(?:\\.[A-Za-z0-9]+)?(?:\\?[^"'<>\\s]*)?/gi
        ) || [];

      shopMatches
        .concat(itemMatches)
        .forEach(function (value) {
          var normalized =
            normalizeCandidateUrl(
              value
            );

          if (normalized) {
            htmlCandidates.push(
              normalized
            );
          }
        });
    } catch {
      // Preserve the proven anchor/attribute path even if embedded markup changes.
    }

    var artworkLinks = unique(
      anchorCandidates
        .concat(attributeCandidates)
        .concat(htmlCandidates)
    );

    console.log(
      "ARTBOOST REDBUBBLE DISCOVERY SOURCES",
      {
        anchors:
          unique(anchorCandidates).length,
        attributes:
          unique(attributeCandidates).length,
        embeddedHtml:
          unique(htmlCandidates).length,
        combinedUnique:
          artworkLinks.length,
        finalPass:
          Boolean(isFinalPass),
      }
    );

    var payload = {
      type: "REDBUBBLE_METADATA",
      data: {
        pageType: detectPageType(currentUrl),
        title:
          readMeta("og:title") ||
          readMeta("twitter:title") ||
          document.title ||
          "",
        description:
          readMeta("og:description") ||
          readMeta("description") ||
          readMeta("twitter:description") ||
          "",
        imageUrl:
          readMeta("og:image") ||
          readMeta("twitter:image") ||
          readMeta("twitter:image:src") ||
          "",
        pageUrl: currentUrl,
        browserUrl:
          window.location.href,
        artistUsername:
          getArtistUsername(currentUrl),
        artworkId:
          getArtworkId(currentUrl),
        collectionId:
          getCollectionId(currentUrl),
        artworkLinks: artworkLinks,
        artworkRecords:
          artworkRecords.filter(
            function (record) {
              return Boolean(
                record &&
                record.productUrl
              );
            }
          ),
        scanFinal:
          Boolean(isFinalPass),
        reportedDesignCount:
          getReportedDesignCount(),
      },
    };

    window.ReactNativeWebView.postMessage(
      JSON.stringify(payload)
    );

    return artworkLinks.length;
  }

  var scanStartedAt =
    Date.now();

  var lastArtworkCount = -1;
  var stableArtworkSamples = 0;

  function adaptiveExtractPass() {
    var count =
      extract(false);

    if (
      count === lastArtworkCount
    ) {
      stableArtworkSamples += 1;
    } else {
      lastArtworkCount = count;
      stableArtworkSamples = 0;
    }

    var elapsed =
      Date.now() - scanStartedAt;

    var populatedAndStable =
      count > 0 &&
      elapsed >= 6000 &&
      stableArtworkSamples >= 2;

    var emptyAndStable =
      count === 0 &&
      elapsed >= 12000 &&
      stableArtworkSamples >= 4;

    var maxWaitReached =
      elapsed >= 18000;

    if (
      populatedAndStable ||
      emptyAndStable ||
      maxWaitReached
    ) {
      extract(true);
      return;
    }

    setTimeout(
      adaptiveExtractPass,
      1500
    );
  }

  setTimeout(
    adaptiveExtractPass,
    1200
  );

  true;
})();
`;

function isValidRedbubbleUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      (hostname === "redbubble.com" ||
        hostname.endsWith(".redbubble.com")) &&
      ["http:", "https:"].includes(
        parsed.protocol
      )
    );
  } catch {
    return false;
  }
}

function detectSubmittedMode(
  value: string
): ImportMode {
  try {
    const parsed = new URL(value);

    if (
      /\/shop\/ap\/\d+/i.test(
        parsed.pathname
      )
    ) {
      return "artwork";
    }

    if (
      parsed.searchParams.get("collections")
    ) {
      return "collection";
    }

    return "store";
  } catch {
    return "artwork";
  }
}

export default function RedbubbleImportScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    initialUrl?: string;
    refreshMode?: string;
  }>();

  const storeName =
    params.storeName || "Redbubble Store";

  const refreshMode =
    params.refreshMode === "true";

  const refreshStartedRef =
    useRef(false);

  const refreshImportingRef =
    useRef(false);

  const refreshCrawlRef =
    useRef<{
      active: boolean;
      artistUsername: string;
      phase:
        | "explore"
        | "shop"
        | "verify";
      currentPage: number;
      explorePopulatedPages: number;
      targetDesignCount: number;
      pagesScanned: number;
      pageStartUniqueCount: number;
      processedPages: Set<number>;
      artworkLinksById: Map<
        string,
        string
      >;
      artworkRecordsById: Map<
        string,
        RedbubbleArtworkRecord
      >;
      baseMetadata:
        | ExtractedMetadata
        | null;
    }>({
      active: false,
      artistUsername: "",
      phase: "explore",
      currentPage: 1,
      explorePopulatedPages: 0,
      targetDesignCount: 0,
      pagesScanned: 0,
      pageStartUniqueCount: 0,
      processedPages:
        new Set<number>(),
      artworkLinksById:
        new Map<string, string>(),
      artworkRecordsById:
        new Map<
          string,
          RedbubbleArtworkRecord
        >(),
      baseMetadata: null,
    });

  const webViewRef = useRef<WebView>(null);
  const progressTimerRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const [mode, setMode] =
    useState<ImportMode>("store");

  const [url, setUrl] = useState(
  typeof params.initialUrl === "string"
    ? params.initialUrl
    : ""
);
  const [activeUrl, setActiveUrl] =
    useState("");

  const [loading, setLoading] =
    useState(false);

    const [savingProducts, setSavingProducts] =
  useState(false);

  const [metadata, setMetadata] =
    useState<ExtractedMetadata | null>(null);

  const [progressPercent, setProgressPercent] =
    useState(0);

  const [progressLabel, setProgressLabel] =
    useState("Preparing import...");

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
  if (
    typeof params.initialUrl === "string" &&
    params.initialUrl.trim()
  ) {
    setUrl(params.initialUrl);
  }
}, [params.initialUrl]);


  useEffect(() => {
    if (
      !refreshMode ||
      refreshStartedRef.current
    ) {
      return;
    }

    refreshStartedRef.current = true;
    let active = true;

    async function startSavedRefresh() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            "Please sign in before refreshing Redbubble."
          );
        }

        let savedUrl =
          typeof params.initialUrl === "string"
            ? params.initialUrl.trim()
            : "";

        if (!savedUrl) {
          if (!params.storeId) {
            throw new Error(
              "ArtBoost could not identify the saved Redbubble connection."
            );
          }

          const response = await fetch(
            `${BACKEND_URL}/api/v2/store-connections/${encodeURIComponent(
              String(params.storeId)
            )}?userId=${encodeURIComponent(
              user.id
            )}&_=${Date.now()}`,
            {
              headers: {
                "Cache-Control": "no-cache",
              },
            }
          );

          const responseText =
            await response.text();

          let data: any = {};

          try {
            data =
              responseText
                ? JSON.parse(responseText)
                : {};
          } catch {
            throw new Error(
              `Saved Redbubble lookup returned HTTP ${response.status}.`
            );
          }

          if (
            !response.ok ||
            !data?.success
          ) {
            throw new Error(
              data?.details ||
                data?.error ||
                "Unable to load the saved Redbubble connection."
            );
          }

          savedUrl =
            String(
              data?.connection?.storeUrl ||
              ""
            ).trim();
        }

        if (
          !savedUrl ||
          !isValidRedbubbleUrl(savedUrl)
        ) {
          throw new Error(
            "The saved Redbubble storefront URL is missing or invalid."
          );
        }

        if (!active) {
          return;
        }

        const artistUsername =
          getRedbubbleArtistUsername(
            savedUrl
          );

        if (!artistUsername) {
          throw new Error(
            "ArtBoost could not determine the Redbubble artist username from the saved store URL."
          );
        }

        refreshCrawlRef.current = {
          active: true,
          artistUsername,
          phase: "explore",
          currentPage: 1,
          explorePopulatedPages: 0,
          targetDesignCount: 0,
          pagesScanned: 0,
          pageStartUniqueCount: 0,
          processedPages:
            new Set<number>(),
          artworkLinksById:
            new Map<string, string>(),
          artworkRecordsById:
            new Map<
              string,
              RedbubbleArtworkRecord
            >(),
          baseMetadata: null,
        };

        setMode("store");
        setUrl(savedUrl);
        setMetadata(null);
        setLoading(true);
        setProgressPercent(5);
        setProgressLabel(
          "Scanning Redbubble page 1..."
        );

        setActiveUrl(
          buildRedbubbleExplorePageUrl(
            artistUsername,
            1
          )
        );
      } catch (error: any) {
        if (active) {
          stopProgressTimer();
          setLoading(false);
          Alert.alert(
            "Redbubble Refresh Failed",
            error?.message ||
              "ArtBoost could not refresh the saved Redbubble store."
          );
        }
      }
    }

    startSavedRefresh();

    return () => {
      active = false;
    };
  }, [
    refreshMode,
    params.initialUrl,
    params.storeId,
  ]);

  const modeContent = useMemo(() => {
    if (mode === "collection") {
      return {
        title: "Import a Collection",
        description:
          "Paste the Redbubble collection link that contains the artwork you want ArtBoost to market.",
        placeholder:
          "https://www.redbubble.com/people/artistwill/shop?collections=4505410",
        button: "Import Collection",
      };
    }

    if (mode === "artwork") {
      return {
        title: "Import Artwork",
        description:
          "Paste a Redbubble artwork page. ArtBoost will read its title, description, image, and listing link.",
        placeholder:
          "https://www.redbubble.com/shop/ap/182131349",
        button: "Import Artwork",
      };
    }

    return {
      title: "Import Your Store",
      description:
        "Paste your Redbubble shop link. ArtBoost will automatically import the artwork available in your store.",
      placeholder:
        "https://www.redbubble.com/people/artistwill/shop",
      button: "Import Store",
    };
  }, [mode]);

  function stopProgressTimer() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function beginProgress() {
    stopProgressTimer();

    let stepIndex = 0;

    setProgressPercent(
      IMPORT_PROGRESS_STEPS[0].percent
    );
    setProgressLabel(
      IMPORT_PROGRESS_STEPS[0].label
    );

    progressTimerRef.current = setInterval(
      () => {
        stepIndex += 1;

        if (
          stepIndex >=
          IMPORT_PROGRESS_STEPS.length
        ) {
          stopProgressTimer();
          return;
        }

        setProgressPercent(
          IMPORT_PROGRESS_STEPS[stepIndex]
            .percent
        );
        setProgressLabel(
          IMPORT_PROGRESS_STEPS[stepIndex]
            .label
        );
      },
      1400
    );
  }

  function startScan() {
    const cleanUrl = url.trim();

    if (!isValidRedbubbleUrl(cleanUrl)) {
      Alert.alert(
        "Invalid Redbubble Link",
        "Paste a valid Redbubble store, collection, or artwork link."
      );
      return;
    }

    const detectedMode =
      detectSubmittedMode(cleanUrl);

    if (detectedMode !== mode) {
      setMode(detectedMode);
    }

    setMetadata(null);
    setLoading(true);
    setProgressPercent(0);
    setProgressLabel("Preparing import...");
    beginProgress();
    setActiveUrl(cleanUrl);
  }

  function handleWebViewMessage(event: any) {
    try {
      const message = JSON.parse(
        event.nativeEvent.data
      );

      if (
        message?.type !==
        "REDBUBBLE_METADATA"
      ) {
        return;
      }

      const nextMetadata: ExtractedMetadata = {
        ...EMPTY_METADATA,
        ...message.data,
        artworkLinks: Array.isArray(
          message.data?.artworkLinks
        )
          ? message.data.artworkLinks
          : [],
        artworkRecords: Array.isArray(
          message.data?.artworkRecords
        )
          ? message.data.artworkRecords
          : [],
      };

      if (
        refreshMode &&
        nextMetadata.pageType !== "artwork"
      ) {
        void handleRefreshCrawlPage(
          nextMetadata
        );
        return;
      }

      stopProgressTimer();
      setProgressPercent(100);
      setProgressLabel("Import preview ready.");
      setMetadata(nextMetadata);
      setLoading(false);
    } catch (error) {
      console.log(
        "Redbubble WebView message error:",
        error
      );
    }
  }

  async function handleRefreshCrawlPage(
    nextMetadata: ExtractedMetadata
  ) {
    const crawl =
      refreshCrawlRef.current;

    if (
      nextMetadata.reportedDesignCount >
      crawl.targetDesignCount
    ) {
      crawl.targetDesignCount =
        nextMetadata.reportedDesignCount;
    }

    if (
      !refreshMode ||
      !crawl.active ||
      refreshImportingRef.current
    ) {
      return;
    }

    const browserUrl =
      String(
        nextMetadata.browserUrl ||
          nextMetadata.pageUrl ||
          ""
      );

    const messagePage =
      getRedbubbleExplorePageNumber(
        browserUrl
      );

    if (
      messagePage !==
      crawl.currentPage
    ) {
      return;
    }

    if (
      crawl.processedPages.has(
        messagePage
      )
    ) {
      return;
    }

    if (!crawl.baseMetadata) {
      crawl.baseMetadata = {
        ...nextMetadata,
      };
    }

    const beforePagePassCount =
      crawl.artworkLinksById.size;

    for (
      const record of
      nextMetadata.artworkRecords
    ) {
      const productUrl =
        String(
          record?.productUrl || ""
        ).trim();

      const artworkId =
        extractRedbubbleArtworkId(
          productUrl
        );

      if (!artworkId) {
        continue;
      }

      const existingRecord =
        crawl.artworkRecordsById.get(
          artworkId
        );

      crawl.artworkRecordsById.set(
        artworkId,
        {
          productUrl:
            productUrl ||
            existingRecord?.productUrl ||
            "",
          title:
            String(
              record?.title ||
                existingRecord?.title ||
                ""
            ).trim(),
          imageUrl:
            String(
              record?.imageUrl ||
                existingRecord?.imageUrl ||
                ""
            ).trim(),
        }
      );
    }

    for (
      const rawLink of
      nextMetadata.artworkLinks
    ) {
      const cleanLink =
        String(rawLink || "").trim();

      const artworkId =
        extractRedbubbleArtworkId(
          cleanLink
        );

      if (!artworkId) {
        continue;
      }

      if (
        !crawl.artworkLinksById.has(
          artworkId
        )
      ) {
        crawl.artworkLinksById.set(
          artworkId,
          cleanLink
        );
      }

      if (
        !crawl.artworkRecordsById.has(
          artworkId
        )
      ) {
        crawl.artworkRecordsById.set(
          artworkId,
          {
            productUrl: cleanLink,
            title: "",
            imageUrl: "",
          }
        );
      }
    }

    const allArtworkLinks =
      Array.from(
        crawl.artworkLinksById.values()
      );

    const linksAddedThisPass =
      allArtworkLinks.length -
      beforePagePassCount;

    console.log(
      "ARTBOOST REDBUBBLE PAGE PASS",
      {
        phase: crawl.phase,
        page: messagePage,
        finalPass:
          Boolean(
            nextMetadata.scanFinal
          ),
        linksOnPass:
          nextMetadata.artworkLinks.length,
        linksAddedThisPass,
        uniqueArtworkCount:
          allArtworkLinks.length,
      }
    );

    if (!nextMetadata.scanFinal) {
      setProgressLabel(
        `${allArtworkLinks.length} unique designs found. Finishing Redbubble page ${messagePage}...`
      );
      return;
    }

    crawl.processedPages.add(
      messagePage
    );
    crawl.pagesScanned += 1;

    const newArtworkCount =
      allArtworkLinks.length -
      crawl.pageStartUniqueCount;

    const previewMetadata: ExtractedMetadata = {
      ...(crawl.baseMetadata ||
        nextMetadata),
      artworkLinks:
        allArtworkLinks,
      artworkRecords:
        Array.from(
          crawl.artworkRecordsById.values()
        ),
      browserUrl,
      reportedDesignCount:
        Math.max(
          crawl.targetDesignCount,
          nextMetadata.reportedDesignCount || 0
        ),
    };

    setMetadata(previewMetadata);

    console.log(
      "ARTBOOST REDBUBBLE SCAN MANIFEST",
      {
        phase: crawl.phase,
        page: messagePage,
        reportedDesignCount:
          crawl.targetDesignCount,
        artworkIds:
          nextMetadata.artworkLinks
            .map(
              extractRedbubbleArtworkId
            )
            .filter(Boolean),
        linksOnFinalPass:
          nextMetadata.artworkLinks.length,
        uniqueStoreTotal:
          allArtworkLinks.length,
      }
    );

    console.log(
      "ARTBOOST REDBUBBLE FULL STORE CRAWL",
      {
        phase: crawl.phase,
        page: messagePage,
        linksOnPage:
          nextMetadata.artworkLinks.length,
        newArtworkCount,
        uniqueArtworkCount:
          allArtworkLinks.length,
      }
    );

    if (
      crawl.phase === "verify"
    ) {
      if (
        messagePage <
          crawl.explorePopulatedPages
      ) {
        const nextVerifyPage =
          messagePage + 1;

        crawl.currentPage =
          nextVerifyPage;
        crawl.pageStartUniqueCount =
          allArtworkLinks.length;

        setProgressLabel(
          `${allArtworkLinks.length} of ${Math.max(
            crawl.targetDesignCount,
            allArtworkLinks.length
          )} reported designs found. Verifying Explore page ${nextVerifyPage}...`
        );

        setActiveUrl(
          buildRedbubbleExplorePageUrl(
            crawl.artistUsername,
            nextVerifyPage
          )
        );
        return;
      }

      crawl.active = false;

      console.log(
        "ARTBOOST REDBUBBLE RECONCILIATION",
        {
          stage:
            "verification-complete",
          reportedDesignCount:
            crawl.targetDesignCount,
          discoveredUnique:
            allArtworkLinks.length,
          shortfall:
            Math.max(
              0,
              crawl.targetDesignCount -
                allArtworkLinks.length
            ),
        }
      );

      setProgressPercent(82);
      setProgressLabel(
        crawl.targetDesignCount >
          allArtworkLinks.length
          ? `${allArtworkLinks.length} public listings found from ${crawl.targetDesignCount} reported designs. Syncing verified listings...`
          : `${allArtworkLinks.length} designs verified. Syncing product details and thumbnails...`
      );

      await refreshStoreFromArtworkLinks(
        previewMetadata
      );
      return;
    }

    if (
      newArtworkCount === 0
    ) {
      if (
        crawl.phase === "explore"
      ) {
        crawl.explorePopulatedPages =
          Math.max(
            1,
            messagePage - 1
          );

        crawl.phase = "shop";
        crawl.currentPage = 1;
        crawl.pageStartUniqueCount =
          allArtworkLinks.length;
        crawl.processedPages.clear();

        setProgressPercent(70);
        setProgressLabel(
          `${allArtworkLinks.length} unique designs found. Reconciling against Redbubble Shop page 1...`
        );

        console.log(
          "ARTBOOST REDBUBBLE RECONCILIATION",
          {
            stage:
              "explore-complete",
            exploreUnique:
              allArtworkLinks.length,
            explorePopulatedPages:
              crawl.explorePopulatedPages,
          }
        );

        setActiveUrl(
          buildRedbubbleShopPageUrl(
            crawl.artistUsername,
            1
          )
        );
        return;
      }

      if (
        crawl.phase === "shop" &&
        messagePage <=
          crawl.explorePopulatedPages
      ) {
        const nextShopPage =
          messagePage + 1;

        crawl.currentPage =
          nextShopPage;
        crawl.pageStartUniqueCount =
          allArtworkLinks.length;

        setProgressLabel(
          `${allArtworkLinks.length} unique designs found. Reconciling Redbubble Shop page ${nextShopPage}...`
        );

        setActiveUrl(
          buildRedbubbleShopPageUrl(
            crawl.artistUsername,
            nextShopPage
          )
        );
        return;
      }

      crawl.active = false;

      if (
        allArtworkLinks.length === 0
      ) {
        stopProgressTimer();
        setLoading(false);

        Alert.alert(
          "Redbubble Refresh Failed",
          "ArtBoost scanned both Redbubble Explore and Shop surfaces but did not find any artwork listings."
        );
        return;
      }

      console.log(
        "ARTBOOST REDBUBBLE RECONCILIATION",
        {
          stage:
            "shop-complete",
          reconciledUnique:
            allArtworkLinks.length,
          reportedDesignCount:
            crawl.targetDesignCount,
          shopPagesScanned:
            messagePage,
        }
      );

      if (
        crawl.targetDesignCount >
          allArtworkLinks.length
      ) {
        crawl.phase = "verify";
        crawl.currentPage = 1;
        crawl.pageStartUniqueCount =
          allArtworkLinks.length;
        crawl.processedPages.clear();

        setProgressPercent(78);
        setProgressLabel(
          `${allArtworkLinks.length} of ${crawl.targetDesignCount} reported designs found. Running final verification sweep...`
        );

        console.log(
          "ARTBOOST REDBUBBLE RECONCILIATION",
          {
            stage:
              "verification-start",
            reportedDesignCount:
              crawl.targetDesignCount,
            discoveredUnique:
              allArtworkLinks.length,
            shortfall:
              crawl.targetDesignCount -
              allArtworkLinks.length,
          }
        );

        setActiveUrl(
          buildRedbubbleExplorePageUrl(
            crawl.artistUsername,
            1
          )
        );
        return;
      }

      setProgressPercent(82);
      setProgressLabel(
        `${allArtworkLinks.length} reconciled designs found. Syncing product details and thumbnails...`
      );

      await refreshStoreFromArtworkLinks(
        previewMetadata
      );
      return;
    }

    if (
      messagePage >=
      REDBUBBLE_MAX_EXPLORE_PAGES
    ) {
      crawl.active = false;

      stopProgressTimer();
      setLoading(false);

      Alert.alert(
        "Redbubble Refresh Stopped",
        `ArtBoost reached its ${REDBUBBLE_MAX_EXPLORE_PAGES}-page ${crawl.phase} safety limit after finding ${allArtworkLinks.length} unique designs.`
      );
      return;
    }

    const nextPage =
      messagePage + 1;

    crawl.currentPage =
      nextPage;

    crawl.pageStartUniqueCount =
      allArtworkLinks.length;

    setProgressPercent(
      Math.min(
        80,
        10 +
          Math.min(
            crawl.pagesScanned,
            7
          ) *
            10
      )
    );
    setProgressLabel(
      crawl.phase === "shop"
        ? `${allArtworkLinks.length} unique designs found. Reconciling Redbubble Shop page ${nextPage}...`
        : `${allArtworkLinks.length} unique designs found. Scanning Redbubble Explore page ${nextPage}...`
    );

    setActiveUrl(
      crawl.phase === "shop"
        ? buildRedbubbleShopPageUrl(
            crawl.artistUsername,
            nextPage
          )
        : buildRedbubbleExplorePageUrl(
            crawl.artistUsername,
            nextPage
          )
    );
  }

  async function refreshStoreFromArtworkLinks(
    nextMetadata: ExtractedMetadata
  ) {
    if (
      refreshImportingRef.current ||
      nextMetadata.pageType === "artwork"
    ) {
      return;
    }

    refreshImportingRef.current = true;

    try {
      setSavingProducts(true);
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          "Please sign in before refreshing Redbubble."
        );
      }

      const artworkLinksById =
        new Map<string, string>();

      for (
        const value of
        nextMetadata.artworkLinks
      ) {
        const cleanValue =
          String(value || "").trim();

        const artworkId =
          extractRedbubbleArtworkId(
            cleanValue
          );

        if (
          !cleanValue ||
          !artworkId
        ) {
          continue;
        }

        if (
          !artworkLinksById.has(
            artworkId
          )
        ) {
          artworkLinksById.set(
            artworkId,
            cleanValue
          );
        }
      }

      const artworkRecordsById =
        new Map<
          string,
          RedbubbleArtworkRecord
        >();

      for (
        const record of
        nextMetadata.artworkRecords
      ) {
        const productUrl =
          String(
            record?.productUrl || ""
          ).trim();

        const artworkId =
          extractRedbubbleArtworkId(
            productUrl
          );

        if (!artworkId) {
          continue;
        }

        artworkRecordsById.set(
          artworkId,
          {
            productUrl,
            title:
              String(
                record?.title || ""
              ).trim(),
            imageUrl:
              String(
                record?.imageUrl || ""
              ).trim(),
          }
        );
      }

      const artworkLinks =
        Array.from(
          artworkLinksById.values()
        );

      const productsForSync =
        artworkLinks.map(
          (
            productUrl,
            index
          ) => {
            const artworkId =
              extractRedbubbleArtworkId(
                productUrl
              );

            const discovered =
              artworkRecordsById.get(
                artworkId
              );

            return {
              title:
                discovered?.title ||
                `Redbubble Artwork ${
                  index + 1
                }`,
              description: "",
              imageUrl:
                discovered?.imageUrl || "",
              productUrl,
              price: null,
              currency: "USD",
              productType:
                "Artwork",
              tags: [],
            };
          }
        );

      if (artworkLinks.length === 0) {
        throw new Error(
          "The Redbubble importer did not find artwork links after reconciling the refreshed Explore and Shop surfaces."
        );
      }

      const chunks =
        Array.from(
          {
            length:
              Math.ceil(
                productsForSync.length /
                REDBUBBLE_SYNC_BATCH_SIZE
              ),
          },
          (
            _,
            chunkIndex
          ) =>
            productsForSync.slice(
              chunkIndex *
                REDBUBBLE_SYNC_BATCH_SIZE,
              (chunkIndex + 1) *
                REDBUBBLE_SYNC_BATCH_SIZE
            )
        );

      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const failedListings: any[] = [];

      for (
        let chunkIndex = 0;
        chunkIndex < chunks.length;
        chunkIndex += 1
      ) {
        const chunk =
          chunks[chunkIndex];

        const firstListingNumber =
          chunkIndex *
            REDBUBBLE_SYNC_BATCH_SIZE +
          1;

        const lastListingNumber =
          Math.min(
            artworkLinks.length,
            firstListingNumber +
              chunk.length -
              1
          );

        setProgressPercent(
          Math.min(
            99,
            82 +
              Math.round(
                ((chunkIndex + 1) /
                  chunks.length) *
                  17
              )
          )
        );

        setProgressLabel(
          `Syncing Redbubble listings ${firstListingNumber}-${lastListingNumber} of ${artworkLinks.length}...`
        );

        let data: any = null;
        let lastBatchError = "";

        for (
          let attempt = 1;
          attempt <=
          REDBUBBLE_BATCH_MAX_ATTEMPTS;
          attempt += 1
        ) {
          try {
            const response =
              await fetch(
                `${BACKEND_URL}/catalog/import-products-batch`,
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
                        params.storeId ||
                        null,
                      storeName:
                        nextMetadata.artistUsername ||
                        storeName,
                      storeType:
                        "redbubble",
                      products:
                        chunk,
                    }),
                }
              );

            const responseText =
              await response.text();

            let parsed: any = {};

            try {
              parsed =
                responseText
                  ? JSON.parse(
                      responseText
                    )
                  : {};
            } catch {
              throw new Error(
                `HTTP ${response.status}`
              );
            }

            if (
              !response.ok ||
              !parsed?.success
            ) {
              throw new Error(
                parsed?.details ||
                  parsed?.error ||
                  `HTTP ${response.status}`
              );
            }

            data = parsed;
            lastBatchError = "";
            break;
          } catch (error: any) {
            lastBatchError =
              error?.message ||
              String(error);

            if (
              attempt <
              REDBUBBLE_BATCH_MAX_ATTEMPTS
            ) {
              setProgressLabel(
                `Retrying Redbubble listings ${firstListingNumber}-${lastListingNumber} (${attempt + 1}/${REDBUBBLE_BATCH_MAX_ATTEMPTS})...`
              );

              await sleepMs(
                1500 *
                  2 **
                    (attempt - 1)
              );
            }
          }
        }

        if (!data?.success) {
          throw new Error(
            `Redbubble sync batch ${chunkIndex + 1} of ${chunks.length} failed after ${REDBUBBLE_BATCH_MAX_ATTEMPTS} attempts: ${lastBatchError || "unknown error"}`
          );
        }

        const imported =
          Array.isArray(data.imported)
            ? data.imported
            : [];

        createdCount +=
          imported.filter(
            (item: any) =>
              item?.action ===
              "created"
          ).length;

        updatedCount +=
          imported.filter(
            (item: any) =>
              item?.action ===
              "updated"
          ).length;

        failedCount +=
          Number(data.failedCount) ||
          0;

        if (
          Array.isArray(data.failed)
        ) {
          failedListings.push(
            ...data.failed
          );
        }
      }

      if (
        failedListings.length > 0
      ) {
        const failedProductsByUrl =
          new Map<
            string,
            any
          >();

        for (
          const failure of
          failedListings
        ) {
          const productUrl =
            String(
              failure?.productUrl ||
                ""
            ).trim();

          const product =
            productsForSync.find(
              (item) =>
                item.productUrl ===
                productUrl
            );

          if (
            productUrl &&
            product
          ) {
            failedProductsByUrl.set(
              productUrl,
              product
            );
          }
        }

        const retryProducts =
          Array.from(
            failedProductsByUrl.values()
          );

        if (
          retryProducts.length > 0
        ) {
          setProgressLabel(
            `Retrying ${retryProducts.length} individual Redbubble listing${retryProducts.length === 1 ? "" : "s"}...`
          );

          const retryFailures: any[] =
            [];

          for (
            let index = 0;
            index <
            retryProducts.length;
            index +=
              REDBUBBLE_FAILED_RETRY_BATCH_SIZE
          ) {
            const retryChunk =
              retryProducts.slice(
                index,
                index +
                  REDBUBBLE_FAILED_RETRY_BATCH_SIZE
              );

            try {
              const retryResponse =
                await fetch(
                  `${BACKEND_URL}/catalog/import-products-batch`,
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
                          params.storeId ||
                          null,
                        storeName:
                          nextMetadata.artistUsername ||
                          storeName,
                        storeType:
                          "redbubble",
                        products:
                          retryChunk,
                      }),
                  }
                );

              const retryText =
                await retryResponse.text();

              const retryData =
                retryText
                  ? JSON.parse(
                      retryText
                    )
                  : {};

              if (
                retryResponse.ok &&
                retryData?.success
              ) {
                const retriedImported =
                  Array.isArray(
                    retryData.imported
                  )
                    ? retryData.imported
                    : [];

                const retriedCreated =
                  retriedImported.filter(
                    (item: any) =>
                      item?.action ===
                      "created"
                  ).length;

                const retriedUpdated =
                  retriedImported.filter(
                    (item: any) =>
                      item?.action ===
                      "updated"
                  ).length;

                createdCount +=
                  retriedCreated;
                updatedCount +=
                  retriedUpdated;
                failedCount =
                  Math.max(
                    0,
                    failedCount -
                      retriedImported.length
                  );

                if (
                  Array.isArray(
                    retryData.failed
                  )
                ) {
                  retryFailures.push(
                    ...retryData.failed
                  );
                }
              } else {
                retryFailures.push(
                  ...retryChunk.map(
                    (product) => ({
                      productUrl:
                        product.productUrl,
                      error:
                        retryData?.error ||
                        "Retry failed.",
                    })
                  )
                );
              }
            } catch (error: any) {
              retryFailures.push(
                ...retryChunk.map(
                  (product) => ({
                    productUrl:
                      product.productUrl,
                    error:
                      error?.message ||
                      String(error),
                  })
                )
              );
            }
          }

          failedListings.length = 0;
          failedListings.push(
            ...retryFailures
          );
          failedCount =
            retryFailures.length;
        }
      }

      stopProgressTimer();
      setProgressPercent(100);
      setProgressLabel(
        "Redbubble sync complete."
      );
      setLoading(false);

      const reportedDesignCount =
        Math.max(
          Number(
            nextMetadata.reportedDesignCount
          ) || 0,
          artworkLinks.length
        );

      const discoveryShortfall =
        Math.max(
          0,
          reportedDesignCount -
            artworkLinks.length
        );

      Alert.alert(
        discoveryShortfall > 0
          ? "Redbubble Refresh Needs Review"
          : failedCount
          ? "Redbubble Refresh Completed with Issues"
          : "Redbubble Refresh Complete",
        [
          discoveryShortfall > 0
            ? `Redbubble reports ${reportedDesignCount} designs. ArtBoost found ${artworkLinks.length} public listing URLs after Explore, Shop, and verification sweeps.`
            : `${artworkLinks.length} unique Redbubble designs verified across the Explore and Shop surfaces.`,
          discoveryShortfall > 0
            ? `${discoveryShortfall} design${discoveryShortfall === 1 ? "" : "s"} were not exposed as public listing URLs during this scan.`
            : "",
          `${createdCount} new listings added.`,
          `${updatedCount} existing listings refreshed.`,
          failedCount
            ? `${failedCount} listings could not be refreshed.`
            : "All discovered public listings were synchronized with product details and thumbnails.",
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
                  storeId:
                    params.storeId || "",
                  storeName:
                    nextMetadata.artistUsername ||
                    storeName,
                  storeType:
                    "redbubble",
                  connected:
                    "true",
                },
              }),
          },
          {
            text: "Done",
          },
        ]
      );

      if (
        failedListings.length > 0
      ) {
        console.log(
          "ARTBOOST REDBUBBLE SYNC FAILURES",
          failedListings
        );
      }
    } catch (error: any) {
      stopProgressTimer();
      setLoading(false);

      Alert.alert(
        "Redbubble Refresh Failed",
        error?.message ||
          "ArtBoost could not refresh the saved Redbubble store."
      );
    } finally {
      refreshImportingRef.current = false;
      setSavingProducts(false);
    }
  }

  async function saveProductsToCatalog() {
  if (!metadata) {
    Alert.alert(
      "Nothing to Import",
      "Scan the Redbubble page first."
    );
    return;
  }

  if (
    metadata.pageType !== "artwork"
  ) {
    if (
      metadata.artworkLinks.length ===
      0
    ) {
      Alert.alert(
        "No Store Products Found",
        "ArtBoost did not find any Redbubble artwork listings to import."
      );
      return;
    }

    await refreshStoreFromArtworkLinks(
      metadata
    );
    return;
  }

  if (!metadata.title.trim()) {
    Alert.alert(
      "Missing Artwork Title",
      "Redbubble did not provide a title for this artwork."
    );
    return;
  }

  if (!metadata.pageUrl.trim()) {
    Alert.alert(
      "Missing Artwork Link",
      "Redbubble did not provide the artwork page URL."
    );
    return;
  }

  try {
    setSavingProducts(true);

    const { data: sessionData } =
      await supabase.auth.getSession();

    const userId =
      sessionData.session?.user?.id;

    if (!userId) {
      throw new Error(
        "Please log in before importing products."
      );
    }

    const artistName =
      metadata.artistUsername ||
      params.storeName ||
      "Redbubble Store";

    const response = await fetch(
      `${BACKEND_URL}/catalog/import-product`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          storeId: params.storeId || null,
          storeName: artistName,
          storeType: "redbubble",
          title: metadata.title.trim(),
          description:
            metadata.description.trim() || null,
          imageUrl:
            metadata.imageUrl.trim() || null,
          productUrl: metadata.pageUrl.trim(),
          price: null,
          currency: "USD",
          productType: "Artwork",
          tags: [],
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
        `Backend returned ${response.status}: ${responseText.slice(
          0,
          200
        )}`
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
          data.details ||
          "ArtBoost could not save the Redbubble artwork."
      );
    }

    Alert.alert(
      data.action === "updated"
        ? "Artwork Updated"
        : "Artwork Imported",
      data.action === "updated"
        ? "This Redbubble artwork was already in ArtBoost and has been updated."
        : "The Redbubble artwork was added to your ArtBoost catalog.",
      [
        {
          text: "View Products",
          onPress: () =>
            router.replace({
              pathname: "/products" as any,
              params: {
                storeName: artistName,
                storeType: "redbubble",
              },
            }),
        },
        {
          text: "Done",
        },
      ]
    );
  } catch (error: any) {
    console.log(
      "Redbubble artwork import failed:",
      error
    );

    Alert.alert(
      "Import Failed",
      error?.message ||
        "ArtBoost could not save the Redbubble artwork."
    );
  } finally {
    setSavingProducts(false);
  }
}

  function resetScan() {
    stopProgressTimer();
    setActiveUrl("");
    setMetadata(null);
    setLoading(false);
    setProgressPercent(0);
    setProgressLabel("Preparing import...");
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: "Import Artwork",
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
            onPress={() => {
              if (params.storeId) {
                router.replace({
                  pathname:
                    "/store-dashboard" as any,
                  params: {
                    storeId: params.storeId,
                    storeName:
                      params.storeName ||
                      "Redbubble Store",
                    storeType:
                      params.storeType ||
                      "redbubble",
                    connected: "true",
                  },
                });
                return;
              }

              router.replace({
                pathname:
                  "/(tabs)/connections" as any,
                params: {
                  section: "stores",
                },
              });
            }}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="#ffffff"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              REDBUBBLE IMPORT
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              Import Artwork
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
          <View style={styles.storeCard}>
            <View style={styles.storeIconWrap}>
              <Ionicons
                name="storefront-outline"
                size={29}
                color="#c4b5fd"
              />
            </View>

            <View style={styles.storeInfo}>
              <Text style={styles.platformText}>
                REDBUBBLE
              </Text>

              <Text
                style={styles.storeNameText}
                numberOfLines={2}
              >
                {storeName}
              </Text>

              <Text
                style={styles.storeDescription}
              >
                Import artwork and let ArtBoost
                prepare it for social marketing.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            What would you like to import?
          </Text>

          <View style={styles.modeRow}>
            {(
              [
                {
                  value: "store",
                  label: "Store",
                  icon: "storefront-outline",
                },
                {
                  value: "collection",
                  label: "Collection",
                  icon: "albums-outline",
                },
                {
                  value: "artwork",
                  label: "Artwork",
                  icon: "image-outline",
                },
              ] as const
            ).map((option) => {
              const selected =
                mode === option.value;

              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.modeButton,
                    selected &&
                      styles.modeButtonSelected,
                  ]}
                  onPress={() => {
                    setMode(option.value);
                    setUrl("");
                    resetScan();
                  }}
                  disabled={loading}
                >
                  <Ionicons
                    name={option.icon}
                    size={21}
                    color={
                      selected
                        ? "#ffffff"
                        : "#9b8fb5"
                    }
                  />

                  <Text
                    style={[
                      styles.modeButtonText,
                      selected &&
                        styles.modeButtonTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>
              {modeContent.title}
            </Text>

            <Text
              style={styles.instructionsText}
            >
              {modeContent.description}
            </Text>
          </View>

          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder={
              modeContent.placeholder
            }
            placeholderTextColor="#626262"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!loading}
          />

          <Pressable
            style={[
              styles.scanButton,
              (!url.trim() || loading) &&
                styles.scanButtonDisabled,
            ]}
            onPress={startScan}
            disabled={!url.trim() || loading}
          >
            {loading ? (
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

            <Text style={styles.scanButtonText}>
              {loading
                ? "Importing from Redbubble..."
                : modeContent.button}
            </Text>
          </Pressable>

          {loading || progressPercent > 0 ? (
            <View style={styles.progressCard}>
              <View style={styles.progressTopRow}>
                <View style={styles.progressTextWrap}>
                  <Text style={styles.progressTitle}>
                    {progressPercent === 100
                      ? refreshMode
                        ? "Redbubble Sync Complete"
                        : "Import Preview Ready"
                      : refreshMode
                      ? "Refreshing Redbubble Store"
                      : "Importing Artwork"}
                  </Text>

                  <Text style={styles.progressLabel}>
                    {progressLabel}
                  </Text>
                </View>

                <Text style={styles.progressPercent}>
                  {progressPercent}%
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPercent}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {activeUrl ? (
            <View
              style={styles.hiddenBrowserContainer}
              pointerEvents="none"
            >
              <WebView
                ref={webViewRef}
                source={{ uri: activeUrl }}
                style={styles.webView}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                injectedJavaScript={
                  EXTRACTION_SCRIPT
                }
                onMessage={
                  handleWebViewMessage
                }
                onLoadEnd={() => {
                  webViewRef.current?.injectJavaScript(
                    EXTRACTION_SCRIPT
                  );
                }}
                onHttpError={(event) => {
                  setLoading(false);

                  Alert.alert(
                    "Redbubble Page Error",
                    `Redbubble returned HTTP ${event.nativeEvent.statusCode}.`
                  );
                }}
                onError={(event) => {
                  setLoading(false);

                  Alert.alert(
                    "Unable to Open Redbubble",
                    event.nativeEvent.description ||
                      "The Redbubble page could not be loaded."
                  );
                }}
              />
            </View>
          ) : null}

          {metadata ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewEyebrow}>
                IMPORT PREVIEW
              </Text>

              {metadata.imageUrl ? (
                <ArtBoostRemoteImage uri={metadata.imageUrl} style={styles.previewImage} contentFit="cover" alt={metadata.title || "Redbubble listing"} />
              ) : null}

              <Text style={styles.previewTitle}>
                {metadata.title ||
                  "Redbubble page found"}
              </Text>

              {metadata.description ? (
                <Text
                  style={styles.previewDescription}
                  numberOfLines={5}
                >
                  {metadata.description}
                </Text>
              ) : null}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Type
                </Text>

                <Text style={styles.detailValue}>
                  {metadata.pageType}
                </Text>
              </View>

              {metadata.artistUsername ? (
                <View style={styles.detailRow}>
                  <Text
                    style={styles.detailLabel}
                  >
                    Artist
                  </Text>

                  <Text
                    style={styles.detailValue}
                  >
                    {metadata.artistUsername}
                  </Text>
                </View>
              ) : null}

              {metadata.artworkId ? (
                <View style={styles.detailRow}>
                  <Text
                    style={styles.detailLabel}
                  >
                    Artwork ID
                  </Text>

                  <Text
                    style={styles.detailValue}
                  >
                    {metadata.artworkId}
                  </Text>
                </View>
              ) : null}

              {metadata.artworkLinks.length >
              0 ? (
                <View style={styles.detailRow}>
                  <Text
                    style={styles.detailLabel}
                  >
                    Artwork links found
                  </Text>

                  <Text
                    style={styles.detailValue}
                  >
                    {
                      metadata.artworkLinks
                        .length
                    }
                  </Text>
                </View>
              ) : null}

              <View style={styles.readyCard}>
                <Text
                  style={[
                    styles.previewEyebrow,
                    styles.readyEyebrow,
                  ]}
                >
                  {metadata.pageType === "artwork"
                    ? "READY TO IMPORT"
                    : "STORE SCAN READY"}
                </Text>

                <Text
                  style={[
                    styles.previewDescription,
                    styles.readyDescription,
                  ]}
                >
                  {metadata.pageType === "artwork"
                    ? "This Redbubble artwork is ready to add to ArtBoost."
                    : `${metadata.artworkLinks.length} artwork link${
                        metadata.artworkLinks.length === 1
                          ? ""
                          : "s"
                      } found on the refreshed Redbubble page.`}
                </Text>
              </View>

<Pressable
  style={[
    styles.saveCatalogButton,
    savingProducts &&
      styles.saveCatalogButtonDisabled,
  ]}
  onPress={saveProductsToCatalog}
  disabled={savingProducts}
>
  {savingProducts ? (
    <ActivityIndicator
      size="small"
      color="#ffffff"
    />
  ) : (
    <Ionicons
      name="download-outline"
      size={21}
      color="#ffffff"
    />
  )}

  <Text style={styles.saveCatalogButtonText}>
  {savingProducts
    ? metadata.pageType === "artwork"
      ? "Saving Artwork..."
      : "Importing Store..."
    : metadata.pageType === "artwork"
    ? "Add Artwork to ArtBoost"
    : `Import ${metadata.artworkLinks.length} Products`}
</Text>
</Pressable>

</View>
) : null}
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
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
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

  storeCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 17,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  storeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  storeInfo: {
    flex: 1,
    paddingLeft: 14,
  },

  platformText: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  storeNameText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },

  storeDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },

  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },

  modeButton: {
    flex: 1,
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  modeButtonSelected: {
    backgroundColor: "#6d28d9",
    borderColor: "#a78bfa",
  },

  modeButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  modeButtonTextSelected: {
    color: "#ffffff",
  },

  instructionsCard: {
    borderRadius: 18,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginBottom: 14,
  },

  instructionsTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  instructionsText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  urlInput: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#343434",
    color: "#ffffff",
    fontSize: 13,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },

  scanButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  scanButtonDisabled: {
    backgroundColor: "#40345d",
    opacity: 0.7,
  },

  scanButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  progressCard: {
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginTop: 16,
  },

  progressTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  progressTextWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },

  progressTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  progressLabel: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    flexShrink: 1,
    width: "100%",
  },

  progressPercent: {
    color: "#c4b5fd",
    fontSize: 18,
    fontWeight: "900",
    flexShrink: 0,
    minWidth: 42,
    textAlign: "right",
  },

  progressTrack: {
    height: 10,
    borderRadius: 99,
    backgroundColor: "#2b2145",
    overflow: "hidden",
    marginTop: 14,
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#8b5cf6",
  },

  hiddenBrowserContainer: {
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: "hidden",
  },

  browserCard: {
    height: 430,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#343434",
    marginTop: 18,
  },

  browserHeader: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#171717",
    borderBottomWidth: 1,
    borderBottomColor: "#303030",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  browserTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  browserUrl: {
    color: "#ffffff",
    fontSize: 10,
    marginTop: 4,
    maxWidth: 240,
  },

  closeBrowserButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#2b2b2b",
    alignItems: "center",
    justifyContent: "center",
  },

  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  previewCard: {
    borderRadius: 20,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#356249",
    padding: 16,
    marginTop: 18,
  },

  previewEyebrow: {
    color: "#86efac",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 15,
    backgroundColor: "#222222",
  },

  previewTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
    marginTop: 14,
  },

  previewDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 9,
  },

  detailRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: "#49366f",
    marginTop: 12,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },

  detailLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },

  detailValue: {
    flex: 1,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
    textTransform: "capitalize",
  },

  readyCard: {
    borderRadius: 15,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 14,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    overflow: "hidden",
  },

  readyEyebrow: {
    width: 104,
    flexShrink: 0,
    marginBottom: 0,
  },

  readyDescription: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginTop: 0,
  },

  readyText: {
    flex: 1,
    color: "#9ed3b3",
    fontSize: 11,
    lineHeight: 17,
  },

  saveCatalogButton: {
  minHeight: 54,
  borderRadius: 17,
  backgroundColor: "#8b5cf6",
  marginTop: 16,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
},

saveCatalogButtonDisabled: {
  opacity: 0.65,
},

saveCatalogButtonText: {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: "900",
},
});