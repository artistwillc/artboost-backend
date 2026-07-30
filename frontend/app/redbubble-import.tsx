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
  Image,
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
  "https://artboost-ai.onrender.com";

type ImportMode =
  | "store"
  | "collection"
  | "artwork";

type ImportProgressStep = {
  percent: number;
  label: string;
};

type ExtractedMetadata = {
  pageType: ImportMode;
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  artistUsername: string;
  artworkId: string;
  collectionId: string;
  artworkLinks: string[];
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
  artistUsername: "",
  artworkId: "",
  collectionId: "",
  artworkLinks: [],
};

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
    var match =
      String(url || "").match(/\\/shop\\/ap\\/(\\d+)/i);

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

  function extract() {
    var currentUrl =
      readMeta("og:url") ||
      window.location.href;

    var artworkLinks = unique(
      Array.from(
        document.querySelectorAll(
          'a[href*="/shop/ap/"]'
        )
      ).map(function (link) {
        try {
          return new URL(
            link.getAttribute("href"),
            window.location.origin
          ).toString();
        } catch {
          return "";
        }
      })
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
        artistUsername:
          getArtistUsername(currentUrl),
        artworkId:
          getArtworkId(currentUrl),
        collectionId:
          getCollectionId(currentUrl),
        artworkLinks: artworkLinks,
      },
    };

    window.ReactNativeWebView.postMessage(
      JSON.stringify(payload)
    );
  }

  setTimeout(extract, 1200);
  setTimeout(extract, 3000);
  setTimeout(extract, 6000);

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
}>();

  const storeName =
    params.storeName || "Redbubble Store";

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
      };

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

  async function saveProductsToCatalog() {
  if (!metadata) {
    Alert.alert(
      "Nothing to Import",
      "Scan the Redbubble page first."
    );
    return;
  }

  if (metadata.pageType !== "artwork") {
    Alert.alert(
      "Single Artwork First",
      "Store and collection importing will be added after single artwork importing is confirmed working."
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
                <View>
                  <Text style={styles.progressTitle}>
                    {progressPercent === 100
                      ? "Import Preview Ready"
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
                <Image
                  source={{
                    uri: metadata.imageUrl,
                  }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
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
    ...
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
    ? "Saving Artwork..."
    : metadata.pageType === "artwork"
    ? "Add Artwork to ArtBoost"
    : "Store Import Coming Next"}
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
    backgroundColor: "#0b0b0b",
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
    color: "#999999",
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
    color: "#9b8fb5",
    fontSize: 11,
    fontWeight: "900",
  },

  modeButtonTextSelected: {
    color: "#ffffff",
  },

  instructionsCard: {
    borderRadius: 18,
    backgroundColor: "#1d1730",
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
    color: "#aaa0ba",
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

  progressTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  progressLabel: {
    color: "#aaa0ba",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  progressPercent: {
    color: "#c4b5fd",
    fontSize: 18,
    fontWeight: "900",
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
    color: "#777777",
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
    color: "#aaaaaa",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 9,
  },

  detailRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: "#2d2d2d",
    marginTop: 12,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },

  detailLabel: {
    color: "#777777",
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