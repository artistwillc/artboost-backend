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

export default function ProductImportWizardScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
    productUrl?: string;
  }>();

  const storeId = params.storeId || "";
  const storeName =
    params.storeName || "Connected Store";
  const storeType =
    params.storeType || "store";

  const [productUrl, setProductUrl] =
    useState(params.productUrl || "");

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [productType, setProductType] =
    useState("");

  const [tags, setTags] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

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

  function validateProductUrl() {
    if (!productUrl.trim()) {
      return true;
    }

    try {
      const parsed = new URL(
        productUrl.trim()
      );

      return (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:"
      );
    } catch {
      return false;
    }
  }

  function validateImageUrl() {
    if (!imageUrl.trim()) {
      return true;
    }

    try {
      const parsed = new URL(
        imageUrl.trim()
      );

      return (
        parsed.protocol === "http:" ||
        parsed.protocol === "https:"
      );
    } catch {
      return false;
    }
  }

  async function saveProduct() {
    if (!title.trim()) {
      Alert.alert(
        "Title Required",
        "Enter a product title before saving."
      );

      return;
    }

    if (!productUrl.trim()) {
      Alert.alert(
        "Product Link Required",
        "Enter the product listing URL before saving."
      );

      return;
    }

    if (!validateProductUrl()) {
      Alert.alert(
        "Invalid Product Link",
        "Enter a valid http or https product URL."
      );

      return;
    }

    if (!validateImageUrl()) {
      Alert.alert(
        "Invalid Image URL",
        "Enter a valid http or https image URL."
      );

      return;
    }

    const numericPrice =
      price.trim() === ""
        ? null
        : Number(
            price.replace(
              /[^0-9.-]/g,
              ""
            )
          );

    if (
      numericPrice !== null &&
      !Number.isFinite(numericPrice)
    ) {
      Alert.alert(
        "Invalid Price",
        "Enter a valid product price."
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

      const response = await fetch(
        `${BACKEND_URL}/catalog/import-product`,
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
            title: title.trim(),
            description:
              description.trim() || null,
            imageUrl:
              imageUrl.trim() || null,
            productUrl:
              productUrl.trim(),
            price: numericPrice,
            currency: "USD",
            productType:
              productType.trim() || null,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
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
            "Unable to save the product."
        );
      }

      Alert.alert(
        "Product Imported",
        "The product was added to your ArtBoost catalog successfully.",
        [
          {
            text: "View Products",
            onPress: () =>
              router.replace({
                pathname:
                  "/products" as any,
                params: {
                  storeName,
                  storeType,
                },
              }),
          },
          {
            text: "Add Another",
            onPress: () => {
              setProductUrl("");
              setTitle("");
              setDescription("");
              setImageUrl("");
              setPrice("");
              setProductType("");
              setTags("");
            },
          },
        ]
      );
    } catch (error: any) {
      console.log(
        "Single product import failed:",
        error
      );

      Alert.alert(
        "Import Failed",
        error?.message ||
          "ArtBoost could not save this product."
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
            onPress={() => router.back()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="#ffffff"
            />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              PRODUCT IMPORT WIZARD
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              Add Product
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

              <Text style={styles.storeNameText}>
                {storeName}
              </Text>

              <Text
                style={styles.storeDescription}
              >
                Add one marketplace product to this
                ArtBoost catalog.
              </Text>
            </View>
          </View>

          <View style={styles.noticeCard}>
            <Ionicons
              name="information-circle-outline"
              size={23}
              color="#c4b5fd"
            />

            <Text style={styles.noticeText}>
              Restricted marketplaces such as
              Redbubble may not allow ArtBoost to
              read listing details automatically.
              Enter the product information below.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>
            Product Details
          </Text>

          <Text style={styles.label}>
            Product URL *
          </Text>

          <TextInput
            style={styles.input}
            value={productUrl}
            onChangeText={setProductUrl}
            placeholder="https://www.redbubble.com/i/..."
            placeholderTextColor="#666666"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />

          <Text style={styles.label}>
            Product Title *
          </Text>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter product title"
            placeholderTextColor="#666666"
            editable={!submitting}
          />

          <Text style={styles.label}>
            Description
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.largeInput,
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Enter product description"
            placeholderTextColor="#666666"
            multiline
            textAlignVertical="top"
            editable={!submitting}
          />

          <Text style={styles.label}>
            Image URL
          </Text>

          <TextInput
            style={styles.input}
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://example.com/product-image.jpg"
            placeholderTextColor="#666666"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />

          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <Text style={styles.label}>
                Price
              </Text>

              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="29.99"
                placeholderTextColor="#666666"
                keyboardType="decimal-pad"
                editable={!submitting}
              />
            </View>

            <View style={styles.column}>
              <Text style={styles.label}>
                Product Type
              </Text>

              <TextInput
                style={styles.input}
                value={productType}
                onChangeText={setProductType}
                placeholder="T-Shirt"
                placeholderTextColor="#666666"
                editable={!submitting}
              />
            </View>
          </View>

          <Text style={styles.label}>
            Tags
          </Text>

          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="fishing, outdoors, bass"
            placeholderTextColor="#666666"
            editable={!submitting}
          />

          <Text style={styles.helperText}>
            Separate tags with commas.
          </Text>

          <Pressable
            style={[
              styles.saveButton,
              submitting &&
                styles.saveButtonDisabled,
            ]}
            onPress={saveProduct}
            disabled={submitting}
          >
            <Ionicons
              name="download-outline"
              size={21}
              color="#ffffff"
            />

            <Text style={styles.saveButtonText}>
              {submitting
                ? "Saving Product..."
                : "Import Product"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    color: "#999999",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  noticeCard: {
    borderRadius: 18,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },

  noticeText: {
    flex: 1,
    color: "#aaa0ba",
    fontSize: 12,
    lineHeight: 18,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
  },

  label: {
    color: "#d6d6d6",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 13,
  },

  input: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#343434",
    color: "#ffffff",
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  largeInput: {
    minHeight: 120,
  },

  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
  },

  column: {
    flex: 1,
  },

  helperText: {
    color: "#777777",
    fontSize: 11,
    marginTop: 7,
  },

  saveButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#8b5cf6",
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  saveButtonDisabled: {
    opacity: 0.65,
  },

  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});