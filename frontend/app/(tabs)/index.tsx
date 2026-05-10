import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
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

const PLATFORMS = [
  "Pinterest",
  "Instagram",
  "Facebook",
  "TikTok",
  "X",
  "Threads",
];

const STYLE_PRESETS = [
  "Bold Sales",
  "Luxury Art Dealer",
  "Streetwear Hype",
  "Pinterest SEO",
  "Funny Viral",
  "Minimal Professional",
];

const SECTION_HEADERS = [
  "TITLE",
  "DESCRIPTION",
  "HASHTAGS",
  "CTA",
];

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [hostedImageUrl, setHostedImageUrl] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [productLink, setProductLink] = useState("");

  const [selectedPlatform, setSelectedPlatform] =
    useState("Pinterest");

  const [selectedStyle, setSelectedStyle] =
    useState("Bold Sales");

  const [connections, setConnections] =
    useState<any>({});

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    const saved = await AsyncStorage.getItem(
      "artboost_connections"
    );

    if (saved) {
      setConnections(JSON.parse(saved));
    }
  };

  const parseSections = (text: string) => {
    if (!text) return [];

    const escaped = SECTION_HEADERS.map((h) =>
      h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );

    const regex = new RegExp(
      `(${escaped.join("|")}):`,
      "g"
    );

    const matches = [...text.matchAll(regex)];

    if (matches.length === 0) {
      return [
        {
          title: `${selectedPlatform} Content`,
          content: text.trim(),
        },
      ];
    }

    return matches.map((match, index) => {
      const title = match[1];

      const start =
        (match.index || 0) + match[0].length;

      const end =
        index + 1 < matches.length
          ? matches[index + 1].index || text.length
          : text.length;

      return {
        title,
        content: text.slice(start, end).trim(),
      };
    });
  };

  const sections = useMemo(() => {
    return parseSections(result);
  }, [result]);

  const getSectionContent = (
    sectionTitle: string,
    sectionList: any[]
  ) => {
    const found = sectionList.find(
      (section) => section.title === sectionTitle
    );

    return found?.content || "";
  };

  const pickImage = async () => {
    const picked =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

    if (!picked.canceled) {
      setImage(picked.assets[0].uri);
      setHostedImageUrl("");
      setResult("");
    }
  };

  const storeCurrentCampaign = async (
    generatedText: string,
    imageUrlFromBackend: string
  ) => {
    const parsed = parseSections(generatedText);

    const title =
      getSectionContent("TITLE", parsed) ||
      `${selectedPlatform} Campaign`;

    const description =
      getSectionContent("DESCRIPTION", parsed) ||
      generatedText;

    const currentCampaign = {
      id: Date.now().toString(),
      image,
      imageUrl: imageUrlFromBackend,
      result: generatedText,
      productLink,
      platform: selectedPlatform,
      style: selectedStyle,
      title,
      pinterestTitle: title,
      pinterestDescription: description,
      createdAt: new Date().toLocaleString(),
    };

    await AsyncStorage.setItem(
      "artboost_current_campaign",
      JSON.stringify(currentCampaign)
    );
  };

  const generateContent = async () => {
    if (!image) return;

    setLoading(true);
    setResult("");
    setHostedImageUrl("");

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

    formData.append(
      "platform",
      selectedPlatform
    );

    formData.append(
      "stylePreset",
      selectedStyle
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

      const generatedText =
        data.result || "No result returned.";

      const imageUrlFromBackend =
        data.imageUrl || "";

      setResult(generatedText);

      setHostedImageUrl(imageUrlFromBackend);

      await storeCurrentCampaign(
        generatedText,
        imageUrlFromBackend
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

    const parsed = parseSections(result);

    const title =
      getSectionContent("TITLE", parsed) ||
      `${selectedPlatform} Campaign`;

    const description =
      getSectionContent("DESCRIPTION", parsed) ||
      result;

    const newSave = {
      id: Date.now().toString(),
      image,
      imageUrl: hostedImageUrl,
      result,
      productLink,
      platform: selectedPlatform,
      style: selectedStyle,
      title,
      pinterestTitle: title,
      pinterestDescription: description,
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

    await AsyncStorage.setItem(
      "artboost_current_campaign",
      JSON.stringify(newSave)
    );

    Alert.alert(
      "Saved",
      "Campaign saved successfully."
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
        Upload artwork, choose a platform,
        and generate focused marketing
        content.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Paste product/shop link"
        placeholderTextColor="#777"
        value={productLink}
        onChangeText={setProductLink}
      />

      <View style={styles.platformContainer}>
        <Text style={styles.platformLabel}>
          Choose Platform
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={{ width: "100%" }}
        >
          {PLATFORMS.map((platform) => (
            <Pressable
              key={platform}
              style={[
                styles.platformButton,
                selectedPlatform ===
                  platform &&
                  styles.platformButtonActive,
              ]}
              onPress={() =>
                setSelectedPlatform(platform)
              }
            >
              <Text
                style={
                  styles.platformButtonText
                }
              >
                {platform}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.platformContainer}>
        <Text style={styles.platformLabel}>
          Choose Style
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={{ width: "100%" }}
        >
          {STYLE_PRESETS.map((style) => (
            <Pressable
              key={style}
              style={[
                styles.platformButton,
                selectedStyle === style &&
                  styles.platformButtonActive,
              ]}
              onPress={() =>
                setSelectedStyle(style)
              }
            >
              <Text
                style={
                  styles.platformButtonText
                }
              >
                {style}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

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
            Generate {selectedPlatform} Content
          </Text>
        </Pressable>
      )}

      {loading && (
        <ActivityIndicator
          size="large"
          style={{ marginTop: 24 }}
        />
      )}

      {hostedImageUrl ? (
        <View style={styles.imageUrlBox}>
          <Text style={styles.imageUrlTitle}>
            Public Image URL Ready
          </Text>

          <Text style={styles.imageUrlText}>
            {hostedImageUrl}
          </Text>
        </View>
      ) : null}

      {sections.length > 0 && (
        <>
          <View style={styles.masterActions}>
            <Pressable
              style={styles.copyButton}
              onPress={() =>
                copyText(
                  result,
                  `${selectedPlatform} content`
                )
              }
            >
              <Text style={styles.buttonText}>
                Copy {selectedPlatform} Content
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

          {sections.map(
            (section, index) => (
              <View
                key={`${section.title}-${index}`}
                style={styles.card}
              >
                <Text
                  style={styles.cardTitle}
                >
                  {section.title}
                </Text>

                <Text
                  style={styles.cardText}
                >
                  {section.content}
                </Text>

                <Pressable
                  style={
                    styles.smallCopyButton
                  }
                  onPress={() =>
                    copyText(
                      section.content,
                      section.title
                    )
                  }
                >
                  <Text
                    style={
                      styles.smallButtonText
                    }
                  >
                    Copy {section.title}
                  </Text>
                </Pressable>
              </View>
            )
          )}
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

  platformContainer: {
    width: "100%",
    marginBottom: 20,
  },

  platformLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },

  platformButton: {
    backgroundColor: "#222",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginRight: 10,
  },

  platformButtonActive: {
    backgroundColor: "#8b5cf6",
  },

  platformButtonText: {
    color: "#fff",
    fontWeight: "700",
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

  imageUrlBox: {
    width: "100%",
    marginTop: 18,
    backgroundColor: "#142012",
    borderRadius: 14,
    padding: 14,
  },

  imageUrlTitle: {
    color: "#12a86b",
    fontWeight: "800",
    marginBottom: 6,
  },

  imageUrlText: {
    color: "#d1ffd6",
    fontSize: 12,
    lineHeight: 18,
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