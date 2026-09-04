// ARTBOOST_VISUAL_PARITY_V3153
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React, { useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type ImportOptionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
};

function ImportOption({
  icon,
  title,
  description,
  onPress,
  disabled = false,
}: ImportOptionProps) {
  return (
    <Pressable
      style={[
        styles.optionCard,
        disabled && styles.optionCardDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View
        style={[
          styles.optionIcon,
          disabled && styles.optionIconDisabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={25}
          color={
            disabled
              ? "#666666"
              : "#c4b5fd"
          }
        />
      </View>

      <View style={styles.optionTextWrap}>
        <Text
          style={[
            styles.optionTitle,
            disabled && styles.disabledText,
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.optionDescription,
            disabled && styles.disabledText,
          ]}
        >
          {description}
        </Text>
      </View>

      {disabled ? (
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>
            Soon
          </Text>
        </View>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={21}
          color="#666666"
        />
      )}
    </Pressable>
  );
}

export default function CatalogImporterScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
  }>();

  const storeId =
    params.storeId || "";

  const storeName =
    params.storeName ||
    "Connected Store";

  const storeType =
    params.storeType || "store";

  const [importingStore, setImportingStore] =
    useState(false);

  const normalizedStoreType = String(storeType)
    .trim()
    .toLowerCase();

  const isEtsy =
    normalizedStoreType === "etsy";

  const supportsFullStoreImport =
    normalizedStoreType ===
      "fine_art_america" ||
    normalizedStoreType ===
      "fine-art-america" ||
    normalizedStoreType ===
      "fineartamerica";

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

  function openEtsyProducts() {
    router.replace({
      pathname: "/store-products" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    });
  }

  async function importEntireStore() {
    try {
      setImportingStore(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "Please sign in before importing a store."
        );
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
            storeId,
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
          "ArtBoost received an invalid response while importing the store."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ||
            data.error ||
            "Fine Art America could not be imported."
        );
      }

      Alert.alert(
        "Store Import Complete",
        [
          `${Number(data.discovered) || 0} listings found.`,
          `${Number(data.imported) || 0} new listings imported.`,
          `${Number(data.updated) || 0} existing listings refreshed.`,
          `${Number(data.skipped) || 0} listings skipped.`,
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
      console.log(
        "Fine Art America import failed:",
        error
      );

      Alert.alert(
        "Import Failed",
        error?.message ||
          "ArtBoost could not import this Fine Art America store."
      );
    } finally {
      setImportingStore(false);
    }
  }

  function openProductUrls() {
    router.push({
      pathname:
        "/catalog-import-urls" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    });
  }

  function openSingleProductImport() {
  router.push({
    pathname:
      "/product-import-wizard" as any,
    params: {
      storeId,
      storeName,
      storeType,
    },
  });
}

  function showCsvComingSoon() {
    Alert.alert(
      "CSV Catalog Import",
      "CSV catalog importing will be connected in the next step."
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.replace({
              pathname:
                "/store-dashboard" as any,
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
            size={24}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>
            UNIVERSAL IMPORT
          </Text>

          <Text
            style={styles.headerTitle}
            numberOfLines={1}
          >
            Catalog Importer
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.storeCard}>
          <View style={styles.storeIconWrap}>
            <Ionicons
              name="storefront-outline"
              size={30}
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
              Import products into this store
              catalog for ArtBoost campaigns and
              automations.
            </Text>
          </View>
        </View>

        {isEtsy ? (
          <>
            <View style={styles.etsyApiCard}>
              <View style={styles.etsyApiIcon}>
                <Ionicons
                  name="cloud-done-outline"
                  size={28}
                  color="#ffffff"
                />
              </View>

              <View style={styles.etsyApiTextWrap}>
                <Text style={styles.etsyApiTitle}>
                  Etsy API Sync
                </Text>

                <Text style={styles.etsyApiText}>
                  Etsy listings are imported through your connected Etsy account. Use Sync Listings from the Etsy Store Dashboard instead of the Universal Scanner.
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.etsyProductsButton}
              onPress={openEtsyProducts}
            >
              <Ionicons
                name="cube-outline"
                size={21}
                color="#ffffff"
              />
              <Text style={styles.etsyProductsButtonText}>
                View Etsy Products
              </Text>
            </Pressable>
          </>
        ) : null}

        {!isEtsy ? (
          <>
            <View style={styles.marketplaceCard}>
          <Text style={styles.marketplaceTitle}>
            Compatible Marketplaces
          </Text>

          <Text style={styles.marketplaceText}>
            Redbubble • Fine Art America •
            ArtPal • Society6 • Gumroad • eBay •
            Custom Stores
          </Text>

          <Text style={styles.marketplaceSoon}>
            More marketplaces coming soon
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Choose Import Method
        </Text>

        {supportsFullStoreImport ? (
          <Pressable
            style={[
              styles.fullStoreImportCard,
              importingStore &&
                styles.optionCardDisabled,
            ]}
            onPress={importEntireStore}
            disabled={importingStore}
          >
            <View style={styles.fullStoreIcon}>
              {importingStore ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="cloud-download-outline"
                  size={28}
                  color="#ffffff"
                />
              )}
            </View>

            <View
              style={styles.optionTextWrap}
            >
              <Text
                style={styles.fullStoreTitle}
              >
                {importingStore
                  ? "Scanning Store..."
                  : "Import Entire Store"}
              </Text>

              <Text
                style={
                  styles.fullStoreDescription
                }
              >
                Find your Fine Art America
                artwork listings, import them
                into ArtBoost, and make them
                available for scheduled
                promotions.
              </Text>
            </View>

            {!importingStore ? (
              <Ionicons
                name="chevron-forward"
                size={21}
                color="#ffffff"
              />
            ) : null}
          </Pressable>
        ) : null}

        <ImportOption
          icon="link-outline"
          title="Product URLs"
          description="Paste product links and import them into your ArtBoost catalog."
          onPress={openProductUrls}
        />

        <ImportOption
          icon="document-text-outline"
          title="CSV Catalog"
          description="Upload a spreadsheet containing product titles, URLs, images, prices, and descriptions."
          onPress={showCsvComingSoon}
        />

        <ImportOption
          icon="create-outline"
          title="Single Product Import"
          description="Add one product using its title, description, image, price, and product link."
          onPress={openSingleProductImport}
        />

        <Text style={styles.sectionTitle}>
          Future Import Tools
        </Text>

        <ImportOption
          icon="sparkles-outline"
          title="AI Website Scanner"
          description="Scan a store website and identify products automatically."
          onPress={() => {}}
          disabled
        />

        <ImportOption
          icon="extension-puzzle-outline"
          title="Browser Extension"
          description="Import marketplace products directly while browsing."
          onPress={() => {}}
          disabled
        />

        <ImportOption
          icon="layers-outline"
          title="Bulk Marketplace Importer"
          description="Move large catalogs from supported marketplaces into ArtBoost."
          onPress={() => {}}
          disabled
        />

        <ImportOption
          icon="code-slash-outline"
          title="Catalog Feed Import"
          description="Import products from JSON, XML, RSS, or another structured catalog feed."
          onPress={() => {}}
          disabled
        />

          </>
        ) : null}

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={24}
            color="#c4b5fd"
          />

          <Text style={styles.infoText}>
            Imported products will be available
            in Products, Grow My Business, and
            scheduled store promotions.
          </Text>
        </View>
      </ScrollView>
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

  etsyApiCard: {
    borderRadius: 20,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#4c3979",
    padding: 17,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  etsyApiIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  etsyApiTextWrap: {
    flex: 1,
    paddingLeft: 14,
  },

  etsyApiTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  etsyApiText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  etsyProductsButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 18,
  },

  etsyProductsButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  marketplaceCard: {
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 16,
    marginBottom: 24,
  },

  marketplaceTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  marketplaceText: {
    color: "#a78bfa",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "700",
  },

  marketplaceSoon: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 8,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
    marginTop: 4,
  },

  fullStoreImportCard: {
    minHeight: 108,
    borderRadius: 19,
    backgroundColor: "#8b5cf6",
    borderWidth: 1,
    borderColor: "#a78bfa",
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  fullStoreIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor:
      "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  fullStoreTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  fullStoreDescription: {
    color: "#ede9fe",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  optionCard: {
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 14,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  optionCardDisabled: {
    opacity: 0.66,
  },

  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  optionIconDisabled: {
    backgroundColor: "#242424",
  },

  optionTextWrap: {
    flex: 1,
    paddingHorizontal: 13,
  },

  optionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  optionDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  disabledText: {
    color: "#ffffff",
  },

  soonPill: {
    borderRadius: 99,
    backgroundColor: "#292929",
    paddingVertical: 5,
    paddingHorizontal: 9,
  },

  soonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  infoCard: {
    borderRadius: 18,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },

  infoText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
  },
});