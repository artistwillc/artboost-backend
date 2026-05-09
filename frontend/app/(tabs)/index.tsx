import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const BACKEND_URL = "http://192.168.1.64:3000";

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!picked.canceled) {
      setImage(picked.assets[0].uri);
      setResult("");
    }
  };

  const generateContent = async () => {
    if (!image) return;

    setLoading(true);
    setResult("");

    const formData = new FormData();

    formData.append("image", {
      uri: image,
      name: "artwork.jpg",
      type: "image/jpeg",
    } as any);

    formData.append("platform", "Instagram, Pinterest, Facebook, TikTok, X, Threads, Tumblr, Lemon8, Reddit, Truth Social");

    try {
      const response = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data.result || data.error || "No result returned.");
    } catch (error: any) {
      setResult("Error connecting to ArtBoost backend. Check backend URL and server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>ArtBoost AI</Text>
      <Text style={styles.subtitle}>
        Upload your artwork and generate a title, description, and hashtags.
      </Text>

      <Pressable style={styles.button} onPress={pickImage}>
        <Text style={styles.buttonText}>Upload Artwork</Text>
      </Pressable>

      {image && <Image source={{ uri: image }} style={styles.preview} />}

      {image && (
        <Pressable style={styles.generateButton} onPress={generateContent}>
          <Text style={styles.buttonText}>Generate Post Package</Text>
        </Pressable>
      )}

      {loading && <ActivityIndicator size="large" style={{ marginTop: 20 }} />}

      {result ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Generated Content</Text>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#101010",
    minHeight: "100%",
    alignItems: "center",
  },
  logo: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 40,
  },
  subtitle: {
    fontSize: 16,
    color: "#cfcfcf",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 28,
  },
  button: {
    backgroundColor: "#1f8cff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  generateButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  preview: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    marginTop: 24,
    resizeMode: "contain",
    backgroundColor: "#222",
  },
  resultBox: {
    marginTop: 24,
    backgroundColor: "#1b1b1b",
    padding: 18,
    borderRadius: 16,
    width: "100%",
  },
  resultTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  resultText: {
    color: "#e6e6e6",
    fontSize: 15,
    lineHeight: 22,
  },
});