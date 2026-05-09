import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import React, { useMemo, useState } from "react";
import {
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  View,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const BACKEND_URL = "https://artboost-ai.onrender.com";

const SECTION_HEADERS = [
  "ARTWORK TITLE",
  "SHORT DESCRIPTION",
  "LONG DESCRIPTION",
  "REDBUBBLE TAGS",
  "GENERAL HASHTAGS",
  "SUGGESTED AUDIENCE",
  "BEST PLATFORMS",
  "INSTAGRAM POST",
  "FACEBOOK POST",
  "PINTEREST PIN",
  "TIKTOK CAPTION",
  "X POST",
  "THREADS POST",
  "TUMBLR POST",
  "LEMON8 POST",
  "REDDIT POST",
  "TRUTH SOCIAL POST",
];

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [productLink, setProductLink] = useState("");

  const sections = useMemo(() => {
    if (!result) return [];

    const escaped = SECTION_HEADERS.map((h) =>
      h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );

    const regex = new RegExp(`(${escaped.join("|")}):`, "g");

    const matches = [...result.matchAll(regex)];

    if (matches.length === 0) {
      return [{ title: "Generated Content", content: result.trim() }];
    }

    return matches.map((match, index) => {
      const title = match[1];

      const start =
        (match.index || 0) + match[0].length;

      const end =
        index + 1 < matches.length
          ? matches[index + 1].index || result.length
          : result.length;

      return {
        title,
        content: result.slice(start, end).trim(),
      };
    });
  }, [result]);

  const pickImage = async () => {
    const picked =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
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

    formData.append(
      "productLink",
      productLink
    );

    try {
      const response = await fetch(
        `${BACKEND_URL}/generate`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setResult(
          data.details ||
            data.error ||
            "Generation failed."
        );
        return;
      }

      setResult(
        data.result || "No result returned."
      );
    } catch {
      setResult(
        "Error connecting to ArtBoost backend."
      );
    } finally {
      setLoading(false);
    }
  };

  const saveResult = async () => {
    if (!result || !image) return;

    const newSave = {
      id: Date.now().toString(),
      image,
      result,
      productLink,
      createdAt: new Date().toLocaleString(),
    };

    const existing =
      await AsyncStorage.getItem(
        "artboost_saves"
      );

    const saves = existing
      ? JSON.parse(existing)
      : [];

    await AsyncStorage.setItem(
      "artboost_saves",
      JSON.stringify([newSave, ...saves])
    );

    Alert.alert(
      "Saved",
      "Saved to ArtBoost history!"
    );
  };

  const copyText = async (
    text: string,
    label = "Content"
  ) => {
    await Clipboard.setStringAsync(text);

    Alert.alert(
      "Copied",
      `${label} copied to clipboard.`
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
    >
      <Text style={styles.logo}>
        ArtBoost AI
      </Text>

      <Text style={styles.subtitle}>
        Upload artwork and generate
        platform-specific marketing
        campaigns.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Paste product/shop link (Etsy, Redbubble, Shopify, etc.)"
        placeholderTextColor="#777"
        value={productLink}
        onChangeText={setProductLink}
      />

      <Pressable
        style={styles.button}
        onPress={pickImage}
      >
        <Text style={styles.buttonText}>
          Upload Artwork
        </Text>
      </Pressable>

      {image && (
        <Image
          source={{ uri: image }}
          style={styles.preview}
        />
      )}

      {image && (
        <Pressable
          style={styles.generateButton}
          onPress={generateContent}
        >
          <Text style={styles.buttonText}>
            Generate Platform Cards
          </Text>
        </Pressable>
      )}

      {loading && (
        <ActivityIndicator
          size="large"
          style={{ marginTop: 24 }}
        />
      )}

      {sections.length > 0 && (
        <>
          <View style={styles.masterActions}>
            <Pressable
              style={styles.copyButton}
              onPress={() =>
                copyText(
                  result,
                  "Full campaign"
                )
              }
            >
              <Text style={styles.buttonText}>
                Copy Full Campaign
              </Text>
            </Pressable>

            <Pressable
              style={styles.saveButton}
              onPress={saveResult}
            >
              <Text style={styles.buttonText}>
                Save Campaign
              </Text>
            </Pressable>
          </View>

          {sections.map((section) => (
            <View
              key={section.title}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>
                {section.title}
              </Text>

              <Text style={styles.cardText}>
                {section.content}
              </Text>

              <Pressable
                style={styles.smallCopyButton}
                onPress={() =>
                  copyText(
                    section.content,
                    section.title
                  )
                }
              >
                <Text
                  style={styles.smallButtonText}
                >
                  Copy {section.title}
                </Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
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
    marginBottom: 24,
  },

  input: {
    width: "100%",
    backgroundColor: "#1b1b1b",
    color: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    fontSize: 15,
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

  preview: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    marginTop: 24,
    resizeMode: "contain",
    backgroundColor: "#222",
  },

  masterActions: {
    width: "100%",
    marginTop: 22,
  },

  copyButton: {
    backgroundColor: "#f59e0b",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },

  saveButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 12,
  },

  card: {
    marginTop: 18,
    backgroundColor: "#1b1b1b",
    padding: 18,
    borderRadius: 16,
    width: "100%",
  },

  cardTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 10,
  },

  cardText: {
    color: "#e6e6e6",
    fontSize: 15,
    lineHeight: 22,
  },

  smallCopyButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 14,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },

  smallButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});