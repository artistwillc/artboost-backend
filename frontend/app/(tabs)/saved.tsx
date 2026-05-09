import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
} from "react-native";

export default function SavedScreen() {
  const [savedPosts, setSavedPosts] = useState<any[]>([]);

  const loadSavedPosts = async () => {
    const saved = await AsyncStorage.getItem("artboost_saves");

    if (saved) {
      setSavedPosts(JSON.parse(saved));
    }
  };

  const deletePost = async (id: string) => {
    const updated = savedPosts.filter((item) => item.id !== id);

    setSavedPosts(updated);

    await AsyncStorage.setItem(
      "artboost_saves",
      JSON.stringify(updated)
    );

    Alert.alert("Deleted", "Saved result removed.");
  };

  useEffect(() => {
    loadSavedPosts();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Saved Campaigns</Text>

      {savedPosts.length === 0 ? (
        <Text style={styles.empty}>No saved campaigns yet.</Text>
      ) : (
        savedPosts.map((item) => (
          <View key={item.id} style={styles.card}>
            <Image source={{ uri: item.image }} style={styles.image} />

            <Text style={styles.date}>
              {item.createdAt}
            </Text>

            <Text style={styles.result}>
              {item.result}
            </Text>

            <Pressable
              style={styles.deleteButton}
              onPress={() => deletePost(item.id)}
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
    backgroundColor: "#101010",
    minHeight: "100%",
  },
  header: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 40,
    marginBottom: 20,
    textAlign: "center",
  },
  empty: {
    color: "#999",
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
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
    color: "#888",
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