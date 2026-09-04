// ARTBOOST_VISUAL_PARITY_V3153
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useMemo,
  useState,
} from "react";
import {
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

import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://artboost-ai.onrender.com";

type RedbubbleImportMode =
  | "store"
  | "collection"
  | "artwork";

export default function CatalogImportUrlsScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
  }>();

  const storeId = params.storeId || "";

  const storeName =
    params.storeName || "Connected Store";

  const storeType =
    params.storeType || "store";

  const [urlText, setUrlText] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [redbubbleImportMode, setRedbubbleImportMode] =
    useState<RedbubbleImportMode>("store");

  const cleanStoreType = String(storeType)
    .trim()
    .toLowerCase();

  const isRedbubble =
    cleanStoreType === "redbubble";

  const platformLabel = useMemo(() => {
    const cleanType = String(storeType)
      .trim()
      .toLowerCase();

    if (cleanType === "redbubble") {
      return "Redbubble";
    }

    if (cleanType === "shopify") {
      return "Shopify";
    }

    if (cleanType === "etsy") {
      return "Etsy";
    }

    if (cleanType === "ebay") {
      return "eBay";
    }

    if (
      cleanType === "fine_art_america" ||
      cleanType === "fine-art-america" ||
      cleanType === "fineartamerica"
    ) {
      return "Fine Art America";
    }

    if (cleanType === "artpal") {
      return "ArtPal";
    }

    if (cleanType === "gumroad") {
      return "Gumroad";
    }

    if (!cleanType) {
      return "Store";
    }

    return cleanType
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(" ");
  }, [storeType]);

  const parsedUrls = useMemo(() => {
    return urlText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }, [urlText]);

  const validUrls = useMemo(() => {
    return parsedUrls.filter((value) => {
      try {
        const parsed = new URL(value);

        return (
          parsed.protocol === "http:" ||
          parsed.protocol === "https:"
        );
      } catch {
        return false;
      }
    });
  }, [parsedUrls]);

  const invalidUrls = useMemo(() => {
    return parsedUrls.filter(
      (value) => !validUrls.includes(value)
    );
  }, [parsedUrls, validUrls]);


  const redbubbleModeCopy = useMemo(() => {
    if (redbubbleImportMode === "collection") {
      return {
        title: "Redbubble Collection",
        description:
          "Paste the link for 1 Redbubble collection. ArtBoost will use it to find the artwork in that collection.",
        example:
          "https://www.redbubble.com/people/artistwill/shop?collections=4505410",
        placeholder:
          "Paste 1 Redbubble collection link here...",
        buttonLabel: "Import Collection",
      };
    }

    if (redbubbleImportMode === "artwork") {
      return {
        title: "Redbubble Artwork",
        description:
          "Paste 1 or more Redbubble artwork links. Each artwork page can represent many available products.",
        example:
          "https://www.redbubble.com/shop/ap/182131349",
        placeholder:
          "Paste Redbubble artwork links here...\n\nhttps://www.redbubble.com/shop/ap/182131349",
        buttonLabel:
          validUrls.length === 1
            ? "Import Artwork"
            : `Import ${validUrls.length || ""} Artworks`,
      };
    }

    return {
      title: "Entire Redbubble Store",
      description:
        "Paste your main Redbubble shop link. ArtBoost will use it to locate the artwork available in your store.",
      example:
        "https://www.redbubble.com/people/artistwill/shop",
      placeholder:
        "Paste 1 Redbubble store link here...",
      buttonLabel: "Import Store",
    };
  }, [redbubbleImportMode, validUrls.length]);
  function clearUrls() {
    if (!urlText.trim()) {
      return;
    }

    Alert.alert(
      "Clear Product URLs?",
      "This will remove every URL currently entered.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => setUrlText(""),
        },
      ]
    );
  }

  async function pollBackgroundImportJob({
    jobId,
    userId,
  }: {
    jobId: string;
    userId: string;
  }) {
    const startedAt = Date.now();
    const timeoutMs =
      20 * 60 * 1000;

    while (
      Date.now() - startedAt <
      timeoutMs
    ) {
      const response =
        await fetch(
          `${BACKEND_URL}/stores/import-jobs/${encodeURIComponent(
            jobId
          )}?userId=${encodeURIComponent(
            userId
          )}`
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
          "ArtBoost received an invalid import-progress response."
        );
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            "Unable to load import progress."
        );
      }

      const job =
        data.job || {};

      const status =
        String(
          job.status || ""
        ).toLowerCase();

      if (
        status ===
        "completed"
      ) {
        return job;
      }

      if (
        status === "failed"
      ) {
        throw new Error(
          job.last_error ||
            "The catalog import failed."
        );
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1500
          )
      );
    }

    throw new Error(
      "The catalog import is still running. Please check the store again shortly."
    );
  }

  async function importProducts() {
    if (parsedUrls.length === 0) {
      Alert.alert(
        "Product URLs Required",
        "Paste at least 1 product URL before importing."
      );

      return;
    }

    if (invalidUrls.length > 0) {
      Alert.alert(
        "Invalid Product URLs",
        `${invalidUrls.length} ${
          invalidUrls.length === 1
            ? "entry is"
            : "entries are"
        } not a valid web URL. Correct or remove ${
          invalidUrls.length === 1
            ? "it"
            : "them"
        } before importing.`
      );

      return;
    }

    if (
      isRedbubble &&
      redbubbleImportMode !== "artwork" &&
      validUrls.length > 1
    ) {
      Alert.alert(
        "Use 1 Redbubble Link",
        redbubbleImportMode === "store"
          ? "Paste only 1 Redbubble store link."
          : "Paste only 1 Redbubble collection link."
      );

      return;
    }

    if (validUrls.length > 25) {
      Alert.alert(
        "Too Many Product URLs",
        "You may import a maximum of 25 product URLs at one time."
      );

      return;
    }

    try {
      setSubmitting(true);

      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        throw new Error(
          "Please log in before importing products."
        );
      }

      const response =
        redbubbleImportMode === "store" &&
        storeId
          ? await fetch(
              `${BACKEND_URL}/stores/${encodeURIComponent(
                storeId
              )}/sync-background`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    userId,
                  }),
              }
            )
          : await fetch(
        `${BACKEND_URL}/catalog/import-urls`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId,
            storeId,
            storeName,
            storeType,
            urls: validUrls,
            ...(isRedbubble
              ? {
                  redbubbleImportMode,
                }
              : {}),
          }),
        }
      )

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
            "The product import failed."
        );
      }

      let importedCount =
        Number(
          data.importedCount ??
            data.createdCount ??
            data.imported ??
            data.totalImported ??
            validUrls.length
        ) ||
        validUrls.length;

      if (
        redbubbleImportMode ===
          "store" &&
        data.job?.id
      ) {
        const completedJob =
          await pollBackgroundImportJob({
            jobId:
              String(
                data.job.id
              ),
            userId,
          });

        importedCount =
          Number(
            completedJob.imported_count
          ) || 0;
      }

      const failedCount =
        Number(data.failedCount) || 0;

      const failureDetails = Array.isArray(
        data.failed
      )
        ? data.failed
            .slice(0, 3)
            .map(
              (item: any) =>
                `• ${
                  item.error ||
                  "Unknown import error"
                }`
            )
            .join("\n")
        : "";

      let resultMessage =
        `${importedCount} ${
          importedCount === 1
            ? "product was"
            : "products were"
        } imported successfully.`;

      if (failedCount > 0) {
        resultMessage += `\n\n${failedCount} ${
          failedCount === 1
            ? "product failed"
            : "products failed"
        } to import.`;

        if (failureDetails) {
          resultMessage +=
            `\n\n${failureDetails}`;
        }
      }

      Alert.alert(
        importedCount > 0
          ? "Import Complete"
          : "Import Unsuccessful",
        resultMessage,
        [
          ...(importedCount > 0
            ? [
                {
                  text: "View Products",
                  onPress: () => {
                    setUrlText("");

                    router.replace({
                      pathname:
                        "/products" as any,
                      params: {
                        storeName,
                        storeType,
                      },
                    });
                  },
                },
              ]
            : []),
          {
            text:
              importedCount > 0
                ? "Import More"
                : "OK",
            onPress: () => {
              if (importedCount > 0) {
                setUrlText("");
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.log(
        "Catalog URL import failed:",
        error
      );

      Alert.alert(
        "Import Failed",
        error?.message ||
          "ArtBoost could not import the products."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
            onPress={() =>
              router.replace({
                pathname:
                  "/catalog-importer" as any,
                params: {
                  storeId,
                  storeName,
                  storeType,
                },
              })
            }
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="#ffffff"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              PRODUCT URL IMPORT
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              Import Products
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
                {platformLabel}
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
                Paste product links to add them to
                this ArtBoost catalog.
              </Text>
            </View>
          </View>

          {isRedbubble ? (
            <View style={styles.modeCard}>
              <Text style={styles.modeTitle}>
                What would you like to import?
              </Text>

              <View style={styles.modeButtonRow}>
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
                    redbubbleImportMode ===
                    option.value;

                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.modeButton,
                        selected &&
                          styles.modeButtonSelected,
                      ]}
                      onPress={() => {
                        setRedbubbleImportMode(
                          option.value
                        );
                        setUrlText("");
                      }}
                      disabled={submitting}
                    >
                      <Ionicons
                        name={option.icon}
                        size={20}
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
            </View>
          ) : null}

          <View style={styles.instructionsCard}>
            <View
              style={styles.instructionsTitleRow}
            >
              <Ionicons
                name="information-circle-outline"
                size={22}
                color="#c4b5fd"
              />

              <Text
                style={styles.instructionsTitle}
              >
                How to import
              </Text>
            </View>

            <Text
              style={styles.instructionsText}
            >
              {isRedbubble
                ? redbubbleModeCopy.description
                : "Paste 1 product URL per line. You may also separate URLs with commas."}
            </Text>

            {!isRedbubble ? (
              <Text
                style={styles.instructionsText}
              >
                Use direct product listing links, not
                your main storefront URL.
              </Text>
            ) : null}

            <Text style={styles.exampleLabel}>
              Example
            </Text>

            <Text style={styles.exampleText}>
              {isRedbubble
                ? redbubbleModeCopy.example
                : "https://www.redbubble.com/i/t-shirt/example-product/123456"}
            </Text>
          </View>

          <View style={styles.inputHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>
                {isRedbubble
                  ? redbubbleModeCopy.title
                  : "Product URLs"}
              </Text>

              <Text
                style={styles.sectionSubtitle}
              >
                {validUrls.length} valid •{" "}
                {invalidUrls.length} invalid
              </Text>
            </View>

            <Pressable
              style={styles.clearButton}
              onPress={clearUrls}
              disabled={!urlText.trim()}
            >
              <Text
                style={[
                  styles.clearButtonText,
                  !urlText.trim() &&
                    styles.clearButtonTextDisabled,
                ]}
              >
                Clear
              </Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.urlInput}
            value={urlText}
            onChangeText={setUrlText}
            placeholder={
              isRedbubble
                ? redbubbleModeCopy.placeholder
                : "Paste product URLs here...\n\nhttps://www.redbubble.com/i/...\nhttps://www.redbubble.com/i/..."
            }
            placeholderTextColor="#666666"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            textAlignVertical="top"
            editable={!submitting}
          />

          {invalidUrls.length > 0 ? (
            <View style={styles.warningCard}>
              <Ionicons
                name="warning-outline"
                size={22}
                color="#fbbf24"
              />

              <View
                style={styles.warningTextWrap}
              >
                <Text
                  style={styles.warningTitle}
                >
                  Invalid entries found
                </Text>

                <Text
                  style={styles.warningText}
                >
                  Correct or remove the invalid
                  entries before importing.
                </Text>
              </View>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.importButton,
              (submitting ||
                validUrls.length === 0 ||
                invalidUrls.length > 0) &&
                styles.importButtonDisabled,
            ]}
            onPress={importProducts}
            disabled={
              submitting ||
              validUrls.length === 0 ||
              invalidUrls.length > 0
            }
          >
            <Ionicons
              name="download-outline"
              size={21}
              color="#ffffff"
            />

            <Text
              style={styles.importButtonText}
            >
              {submitting
                ? "Importing..."
                : isRedbubble
                  ? redbubbleModeCopy.buttonLabel
                  : `Import ${
                      validUrls.length || ""
                    } ${
                      validUrls.length === 1
                        ? "Product"
                        : "Products"
                    }`}
            </Text>
          </Pressable>

          <View style={styles.noticeCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={23}
              color="#86efac"
            />

            <Text style={styles.noticeText}>
              {isRedbubble
                ? "ArtBoost will only process the Redbubble link you provide. You remain in control of what is imported."
                : "ArtBoost will only import the product links you provide. It will not crawl your entire marketplace storefront."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    marginBottom: 16,
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
    textTransform: "uppercase",
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

  modeCard: {
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#343434",
    padding: 16,
    marginBottom: 16,
  },

  modeTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 12,
  },

  modeButtonRow: {
    flexDirection: "row",
    gap: 8,
  },

  modeButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
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
    marginBottom: 22,
  },

  instructionsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    marginTop: 9,
  },

  exampleLabel: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
  },

  exampleText: {
    color: "#c4b5fd",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  inputHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  clearButton: {
    minWidth: 60,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  clearButtonText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "900",
  },

  clearButtonTextDisabled: {
    color: "#ffffff",
  },

  urlInput: {
    minHeight: 230,
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#343434",
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 20,
    padding: 16,
  },

  warningCard: {
    borderRadius: 16,
    backgroundColor: "#2b2416",
    borderWidth: 1,
    borderColor: "#5c4a1f",
    padding: 14,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  warningTextWrap: {
    flex: 1,
  },

  warningTitle: {
    color: "#fde68a",
    fontSize: 13,
    fontWeight: "900",
  },

  warningText: {
    color: "#d6c27d",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },

  importButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  importButtonDisabled: {
    backgroundColor: "#40345d",
    opacity: 0.7,
  },

  importButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  noticeCard: {
    borderRadius: 17,
    backgroundColor: "#14281e",
    borderWidth: 1,
    borderColor: "#28533d",
    padding: 15,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  noticeText: {
    flex: 1,
    color: "#9ed3b3",
    fontSize: 11,
    lineHeight: 17,
  },
});