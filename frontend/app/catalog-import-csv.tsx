import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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

import { supabase } from "@/lib/supabase";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

export default function CatalogCsvImportScreen() {
  const params = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    storeType?: string;
  }>();

  const storeId = String(params.storeId || "");
  const storeName = String(
    params.storeName || "Connected Store"
  );
  const storeType = String(
    params.storeType || "custom_store"
  );

  const [fileName, setFileName] = useState("");
  const [fileUri, setFileUri] = useState("");
  const [importing, setImporting] = useState(false);

  async function chooseCsv() {
    const result =
      await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
          "text/plain",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      Alert.alert(
        "CSV Not Selected",
        "ArtBoost could not access that file."
      );
      return;
    }

    setFileUri(asset.uri);
    setFileName(asset.name || "catalog.csv");
  }

  async function importCsv() {
    if (!fileUri) {
      Alert.alert(
        "Choose CSV",
        "Select a catalog CSV file first."
      );
      return;
    }

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
          "Please sign in before importing a CSV."
        );
      }

      const form = new FormData();
      form.append("userId", user.id);
      form.append("storeId", storeId);
      form.append("storeName", storeName);
      form.append("storeType", storeType);
      form.append(
        "file",
        {
          uri: fileUri,
          name: fileName || "catalog.csv",
          type: "text/csv",
        } as any
      );

      const response = await fetch(
        `${API_BASE}/catalog/import-csv`,
        {
          method: "POST",
          body: form,
        }
      );

      const text = await response.text();
      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Backend returned HTTP ${response.status}.`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.details ||
            data.error ||
            "CSV import failed."
        );
      }

      Alert.alert(
        "CSV Import Complete",
        [
          `${Number(data.totalRows) || 0} rows read.`,
          `${Number(data.imported) || 0} new products imported.`,
          `${Number(data.updated) || 0} existing products updated.`,
          `${Number(data.pendingImages) || 0} image-pending listings saved.`,
          `${Number(data.skipped) || 0} rows skipped.`,
        ].join("\n"),
        [
          { text: "Done", style: "cancel" },
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
        "CSV Import Failed",
        error?.message ||
          "ArtBoost could not import this CSV."
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
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

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>
            STORE IMPORT
          </Text>
          <Text style={styles.title}>
            CSV Catalog
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Ionicons
            name="document-text-outline"
            size={34}
            color="#a78bfa"
          />

          <Text style={styles.cardTitle}>
            Import Catalog CSV
          </Text>

          <Text style={styles.body}>
            Import listings into {storeName}.
            Existing products are updated instead
            of duplicated when ArtBoost can match
            the same artwork ID or product URL.
          </Text>

          <Pressable
            style={styles.chooseButton}
            onPress={chooseCsv}
            disabled={importing}
          >
            <Ionicons
              name="folder-open-outline"
              size={20}
              color="#ffffff"
            />
            <Text style={styles.buttonText}>
              {fileName
                ? "Choose Different CSV"
                : "Choose CSV File"}
            </Text>
          </Pressable>

          {fileName ? (
            <View style={styles.fileRow}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color="#22c55e"
              />
              <Text
                style={styles.fileName}
                numberOfLines={2}
              >
                {fileName}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.importButton,
              (!fileUri || importing) &&
                styles.disabled,
            ]}
            disabled={!fileUri || importing}
            onPress={importCsv}
          >
            {importing ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color="#ffffff"
              />
            )}
            <Text style={styles.buttonText}>
              {importing
                ? "Importing..."
                : "Import CSV"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            ArtBoost CSV Columns
          </Text>
          <Text style={styles.infoText}>
            artwork_id, title, description,
            product_url, image_url, price,
            currency, store_type, store_name,
            image_status
          </Text>
          <Text style={styles.infoText}>
            image_status can be verified or
            pending. Pending listings stay in the
            catalog but should not be selected by
            automation until they have a usable
            image.
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
  headerText: {
    paddingLeft: 14,
  },
  eyebrow: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 3,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  card: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 18,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
  },
  body: {
    color: "#9f9f9f",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  chooseButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  importButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  disabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  fileRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fileName: {
    flex: 1,
    color: "#d4d4d4",
    fontSize: 12,
  },
  infoCard: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
  },
  infoTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  infoText: {
    color: "#aaa0bf",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
