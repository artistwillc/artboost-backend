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

    const products = [];
    const seen = {};

    /*
     * ArtPal artwork cards use:
     * <a class="iCg" href="?i=37279-174">
     */
    const artPalCards = Array.from(
      document.querySelectorAll("a.iCg[href]")
    );

    artPalCards.forEach(function (card) {
      const rawHref =
        card.getAttribute("href") || "";

      const productUrl =
        absoluteUrl(rawHref);

      if (
        !productUrl ||
        !rawHref.includes("?i=") ||
        seen[productUrl]
      ) {
        return;
      }

      const image =
        card.querySelector("img");

      if (!image) {
        return;
      }

      /*
       * ArtPal uses data-original for artwork that
       * has not yet been lazy-loaded.
       */
      const rawImageUrl =
        image.getAttribute("data-original") ||
        image.currentSrc ||
        image.getAttribute("src") ||
        "";

      const imageUrl =
        absoluteUrl(rawImageUrl);

      if (
        !imageUrl ||
        imageUrl.includes("/img/c.gif")
      ) {
        return;
      }

      const titleElement =
        card.querySelector("strong");

      const title =
        cleanText(
          titleElement?.textContent ||
          image.getAttribute("alt") ||
          "ArtPal Artwork"
        );

      seen[productUrl] = true;

      products.push({
        title,
        description: "",
        productUrl,
        imageUrl,
        price: null,
        currency: "USD"
      });
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

const FULL_STORE_SCAN_SCRIPT = `
(function () {
  try {
    var MAX_STEPS = 60;
    var WAIT_MS = 850;
    var stableRounds = 0;
    var previousHeight = 0;
    var currentStep = 0;

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

    function collectProducts() {
      var products = [];
      var seen = {};

      var cards = Array.from(
        document.querySelectorAll("a.iCg[href]")
      );

      cards.forEach(function (card) {
        var rawHref =
          card.getAttribute("href") || "";

        if (!rawHref.includes("?i=")) {
          return;
        }

        var productUrl =
          absoluteUrl(rawHref);

        if (
          !productUrl ||
          seen[productUrl]
        ) {
          return;
        }

        var image =
          card.querySelector("img");

        if (!image) {
          return;
        }

        var rawImageUrl =
          image.getAttribute("data-original") ||
          image.currentSrc ||
          image.getAttribute("src") ||
          "";

        var imageUrl =
          absoluteUrl(rawImageUrl);

        if (
          !imageUrl ||
          imageUrl.includes("/img/c.gif")
        ) {
          return;
        }

        var titleElement =
          card.querySelector("strong");

        var title =
          cleanText(
            titleElement &&
              titleElement.textContent
          ) ||
          cleanText(
            image.getAttribute("alt")
          ) ||
          "ArtPal Artwork";

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

    function sendProgress() {
      var products =
        collectProducts();

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "scan_progress",
          scannedCount: products.length,
          scrollStep: currentStep,
          maxScrollSteps: MAX_STEPS
        })
      );
    }

    function finishScan() {
      window.scrollTo(
        0,
        document.body.scrollHeight
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
              ).length
          })
        );
      }, 500);
    }

    function scrollAndScan() {
      currentStep += 1;

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
        var newHeight =
          Math.max(
            document.body.scrollHeight,
            document.documentElement
              .scrollHeight
          );

        if (
          newHeight <=
          previousHeight + 10
        ) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }

        previousHeight =
          newHeight;

        if (
          stableRounds >= 3 ||
          currentStep >= MAX_STEPS
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

export default function ArtPalStoreScannerScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    storeUrl?: string;
  }>();

  const webViewRef =
    useRef<WebView>(null);

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
    useState(() => {
      const incoming =
        String(params.storeUrl || "")
          .trim();

      if (
        /artpal\.com\/artistwill/i.test(
          incoming
        )
      ) {
        return "https://www.ArtPal.com/artists.html?id=37279";
      }

      return (
        incoming ||
        "https://www.ArtPal.com/artists.html?id=37279"
      );
    });

  const [browserUrl, setBrowserUrl] =
    useState("");

  useEffect(() => {
    const normalized =
      normalizeUrl(storeUrl);

    if (
      normalized &&
      !browserUrl
    ) {
      setBrowserUrl(
        normalized
      );
    }
  }, []);

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
            "ArtBoost stopped the scan after 75 seconds. Any products already detected can still be imported."
          );
        }

        return false;
      }
    );
  }, 75000);
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
  "scan_progress"
) {
  setScanProgress(
    `${message.scannedCount || 0} products found — scanning store section ${
      message.scrollStep || 0
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
setFullStoreScanning(false);
setScanProgress("");
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
              onLoadStart={() =>
                setPageLoading(true)
              }
              onLoadEnd={() =>
                setPageLoading(false)
              }
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
                  <Image
                    source={{
                      uri:
                        item.imageUrl,
                    }}
                    style={
                      styles.productImage
                    }
                    resizeMode="cover"
                  />

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