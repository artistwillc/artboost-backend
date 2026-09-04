// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_PRODUCT_FAVORITES_V3162
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import { readApiJson } from "../../lib/apiJson";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://artboost-ai.onrender.com";

type FavoriteProduct = {
  id: string;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  product_url?: string | null;
  price?: number | null;
  currency?: string | null;
  store_connection_id?: string | null;
  store_name?: string | null;
  store_type?: string | null;
};

export default function SavedScreen() {
  const [savedPosts, setSavedPosts] =
    useState<any[]>([]);
  const [favorites, setFavorites] =
    useState<FavoriteProduct[]>([]);
  const [loadingFavorites, setLoadingFavorites] =
    useState(true);

  const loadSavedPosts =
    useCallback(async () => {
      const saved =
        await AsyncStorage.getItem(
          "artboost_saves"
        );

      if (saved) {
        try {
          setSavedPosts(JSON.parse(saved));
        } catch {
          setSavedPosts([]);
        }
      } else {
        setSavedPosts([]);
      }
    }, []);

  const loadFavorites =
    useCallback(async () => {
      try {
        setLoadingFavorites(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          setFavorites([]);
          return;
        }

        const response = await fetch(
          `${API_BASE}/products/favorites?userId=${encodeURIComponent(
            user.id
          )}&limit=500`
        );

        const data = await readApiJson(response, "Favorites");

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.details ||
              data?.error ||
              "Unable to load Favorites."
          );
        }

        setFavorites(
          Array.isArray(data.products)
            ? data.products
            : []
        );
      } catch (error: any) {
        console.log(
          "Favorites load failed:",
          error
        );

        Alert.alert(
          "Favorites Unavailable",
          error?.message ||
            "ArtBoost could not load Favorites."
        );
      } finally {
        setLoadingFavorites(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedPosts();
      loadFavorites();
    }, [loadFavorites, loadSavedPosts])
  );

  const deletePost = async (id: string) => {
    const updated = savedPosts.filter(
      (item) => item.id !== id
    );

    setSavedPosts(updated);

    await AsyncStorage.setItem(
      "artboost_saves",
      JSON.stringify(updated)
    );

    Alert.alert(
      "Deleted",
      "Saved result removed."
    );
  };

  async function removeFavorite(
    product: FavoriteProduct
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "Please sign in to manage Favorites."
        );
      }

      const response = await fetch(
        `${API_BASE}/products/${encodeURIComponent(
          product.id
        )}/favorite?userId=${encodeURIComponent(
          user.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            favorite: false,
          }),
        }
      );

      const data = await readApiJson(response, "Favorites");

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.details ||
            data?.error ||
            "Unable to remove Favorite."
        );
      }

      setFavorites((current) =>
        current.filter(
          (item) => item.id !== product.id
        )
      );
    } catch (error: any) {
      Alert.alert(
        "Favorites Update Failed",
        error?.message ||
          "ArtBoost could not remove this Favorite."
      );
    }
  }

  function openFavorite(
    product: FavoriteProduct
  ) {
    router.push({
      pathname: "/product-details" as any,
      params: {
        productId: product.id,
        title:
          product.title || "Untitled Product",
        description:
          product.description || "",
        imageUrl:
          product.image_url || "",
        productUrl:
          product.product_url || "",
        price:
          product.price === null ||
          product.price === undefined
            ? ""
            : String(product.price),
        currency:
          product.currency || "USD",
        storeId:
          product.store_connection_id || "",
        storeName:
          product.store_name ||
          "Connected Store",
        storeType:
          product.store_type || "store",
      },
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
    >
      <Text style={styles.header}>
        Saved & Favorites
      </Text>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>
          Product Favorites
        </Text>
        <Text style={styles.countPill}>
          {favorites.length}
        </Text>
      </View>

      {loadingFavorites ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator
            color="#a78bfa"
          />
          <Text style={styles.loadingText}>
            Loading Favorites...
          </Text>
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.empty}>
            No favorite products yet.
          </Text>
          <Text style={styles.emptyHelp}>
            Open any product and tap Add to
            Favorites. Favorites can be used as
            the source for recurring store
            automations.
          </Text>
        </View>
      ) : (
        favorites.map((product) => (
          <View
            key={product.id}
            style={styles.favoriteCard}
          >
            {product.image_url ? (
              <Image
                source={{
                  uri: product.image_url,
                }}
                style={styles.favoriteImage}
              />
            ) : null}

            <View style={styles.favoriteBody}>
              <Text
                style={styles.favoriteTitle}
                numberOfLines={2}
              >
                {product.title ||
                  "Untitled Product"}
              </Text>

              <Text
                style={styles.favoriteStore}
                numberOfLines={1}
              >
                {product.store_name ||
                  product.store_type ||
                  "Connected Store"}
              </Text>

              <View
                style={styles.favoriteActions}
              >
                <Pressable
                  style={styles.openButton}
                  onPress={() =>
                    openFavorite(product)
                  }
                >
                  <Text
                    style={styles.openButtonText}
                  >
                    Open
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.removeButton}
                  onPress={() =>
                    removeFavorite(product)
                  }
                >
                  <Text
                    style={styles.removeButtonText}
                  >
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}

      <View style={styles.divider} />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>
          Saved Campaigns
        </Text>
        <Text style={styles.countPill}>
          {savedPosts.length}
        </Text>
      </View>

      {savedPosts.length === 0 ? (
        <Text style={styles.empty}>
          No saved campaigns yet.
        </Text>
      ) : (
        savedPosts.map((item) => (
          <View
            key={item.id}
            style={styles.card}
          >
            <Image
              source={{ uri: item.image }}
              style={styles.image}
            />

            <Text style={styles.date}>
              {item.createdAt}
            </Text>

            <Text style={styles.result}>
              {item.result}
            </Text>

            <Pressable
              style={styles.deleteButton}
              onPress={() =>
                deletePost(item.id)
              }
            >
              <Text style={styles.deleteText}>
                Delete
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor:
      "rgba(7, 6, 17, 0.92)",
    minHeight: "100%",
  },
  header: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 40,
    marginBottom: 24,
    textAlign: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeader: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },
  countPill: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: "#5b21b6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  emptyCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    marginBottom: 20,
  },
  empty: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 15,
  },
  emptyHelp: {
    color: "#aaa0ba",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  loadingCard: {
    minHeight: 90,
    borderRadius: 18,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  favoriteCard: {
    flexDirection: "row",
    backgroundColor: "#171717",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#302641",
    padding: 12,
    marginBottom: 12,
  },
  favoriteImage: {
    width: 88,
    height: 88,
    borderRadius: 13,
    backgroundColor: "#242424",
  },
  favoriteBody: {
    flex: 1,
    paddingLeft: 12,
  },
  favoriteTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
  favoriteStore: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  favoriteActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  openButton: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#5b21b6",
  },
  openButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 11,
  },
  removeButton: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
  },
  removeButtonText: {
    color: "#c4b5fd",
    fontWeight: "900",
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: "#302641",
    marginVertical: 22,
  },
  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  image: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    resizeMode: "cover",
  },
  date: {
    color: "#ffffff",
    marginTop: 12,
    marginBottom: 10,
    fontSize: 13,
  },
  result: {
    color: "#fff",
    lineHeight: 22,
    fontSize: 15,
  },
  deleteButton: {
    backgroundColor: "#ff4444",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
    alignItems: "center",
  },
  deleteText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
