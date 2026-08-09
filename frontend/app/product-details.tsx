import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function normalize(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function platformLabel(value: string) {
  const clean = normalize(value);
  if (clean === "redbubble") return "Redbubble";
  if (clean === "shopify") return "Shopify";
  if (clean === "etsy") return "Etsy";
  if (clean === "gumroad") return "Gumroad";
  if (clean === "ebay") return "eBay";
  return clean || "Store";
}

export default function ProductDetailsScreen() {
  const params = useLocalSearchParams<{
    productId?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    productUrl?: string;
    price?: string;
    currency?: string;
    storeId?: string;
    storeName?: string;
    storeType?: string;
    automationEnabled?: string;
    timesPosted?: string;
  }>();

  const productId = String(
    params.productId || ""
  );
  const title = String(
    params.title || "Untitled Product"
  );
  const description = String(
    params.description || ""
  );
  const imageUrl = String(
    params.imageUrl || ""
  );
  const productUrl = String(
    params.productUrl || ""
  );
  const price = String(params.price || "");
  const currency = String(
    params.currency || "USD"
  );
  const storeId = String(
    params.storeId || ""
  );
  const storeName = String(
    params.storeName || "Connected Store"
  );
  const storeType = String(
    params.storeType || "store"
  );

  const displayPlatform = useMemo(
    () => platformLabel(storeType),
    [storeType]
  );

  function goBackToStoreProducts() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: "/store-products" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    });
  }

  function openCampaignManager() {
    router.push({
      pathname: "/campaign-manager" as any,
      params: {
        productId,
        productTitle: title,
        productDescription: description,
        productImageUrl: imageUrl,
        productLink: productUrl,
        productStoreId: storeId,
        productStoreName: storeName,
        productStoreType: storeType,
      },
    });
  }

  function openAutomation() {
    router.push({
      pathname: "/store-automation" as any,
      params: {
        storeId,
        storeName,
        storeType,
      },
    });
  }

  async function openListing() {
    if (!productUrl) {
      Alert.alert(
        "Listing Link Missing",
        "This product does not have an original listing link."
      );
      return;
    }

    const supported =
      await Linking.canOpenURL(productUrl);

    if (!supported) {
      Alert.alert(
        "Unable to Open Listing",
        "This product link could not be opened."
      );
      return;
    }

    await Linking.openURL(productUrl);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={goBackToStoreProducts}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>
            PRODUCT DETAILS
          </Text>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={false}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.heroImage,
              styles.imagePlaceholder,
            ]}
          >
            <Ionicons
              name="image-outline"
              size={52}
              color="#777777"
            />
          </View>
        )}

        <View style={styles.productCard}>
          <Text style={styles.platformText}>
            {displayPlatform.toUpperCase()}
          </Text>

          <Text style={styles.productTitle}>
            {title}
          </Text>

          {description ? (
            <Text style={styles.description}>
              {description}
            </Text>
          ) : null}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Store
            </Text>
            <Text style={styles.detailValue}>
              {storeName}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Price
            </Text>
            <Text style={styles.detailValue}>
              {price
                ? `${currency} ${Number(
                    price
                  ).toFixed(2)}`
                : "Not imported"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Original listing
            </Text>
            <Text
              style={styles.linkValue}
              numberOfLines={1}
            >
              {productUrl || "Not available"}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={openCampaignManager}
        >
          <Ionicons
            name="sparkles"
            size={21}
            color="#ffffff"
          />
          <Text style={styles.primaryButtonText}>
            Generate Marketing Post
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={openAutomation}
        >
          <Ionicons
            name="calendar-outline"
            size={21}
            color="#c4b5fd"
          />
          <Text
            style={styles.secondaryButtonText}
          >
            Add to Store Automation
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={openListing}
        >
          <Ionicons
            name="open-outline"
            size={21}
            color="#c4b5fd"
          />
          <Text
            style={styles.secondaryButtonText}
          >
            Open on {displayPlatform}
          </Text>
        </Pressable>

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color="#c4b5fd"
          />
          <Text style={styles.infoText}>
            Facebook and Pinterest can use the
            original product link in the call to
            action. Instagram posts should use
            “Tap the link in bio to shop.”
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: 15,
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
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  heroImage: {
    width: "100%",
    height: 330,
    borderRadius: 22,
    backgroundColor: "#222222",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  productCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 17,
    marginTop: 17,
    marginBottom: 17,
  },
  platformText: {
    color: "#a78bfa",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  productTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29,
    marginTop: 7,
  },
  description: {
    color: "#aaaaaa",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 7,
  },
  detailRow: {
    minHeight: 45,
    borderTopWidth: 1,
    borderTopColor: "#2d2d2d",
    marginTop: 11,
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
  },
  linkValue: {
    flex: 1,
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  secondaryButtonText: {
    color: "#c4b5fd",
    fontSize: 14,
    fontWeight: "900",
  },
  infoCard: {
    borderRadius: 18,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 15,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: "#aaa0ba",
    fontSize: 11,
    lineHeight: 17,
  },
});