import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const BACKEND_URL = "https://artboost-ai.onrender.com";

export default function ProScreen() {
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productLink, setProductLink] = useState("");
  const [previewImage, setPreviewImage] = useState("");

  const [publishing, setPublishing] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [variations, setVariations] = useState<any[]>([]);
  const [loadingVariations, setLoadingVariations] = useState(false);

  const cleanUrl = (value: string) => {
    const trimmed = value.trim();
    const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : trimmed;
  };

  const loadCurrentCampaign = async () => {
    try {
      const saved = await AsyncStorage.getItem("artboost_current_campaign");
      if (!saved) return;

      const campaign = JSON.parse(saved);

      setTitle(campaign.pinterestTitle || campaign.title || "");
      setDescription(campaign.pinterestDescription || campaign.result || "");
      setProductLink(cleanUrl(campaign.productLink || ""));
      setPreviewImage(campaign.image || "");
      setImageUrl(campaign.imageUrl || "");
    } catch (err) {
      console.log("Failed loading campaign:", err);
    }
  };

  const loadBoards = async () => {
    try {
      setLoadingBoards(true);

      const response = await fetch(`${BACKEND_URL}/pinterest/boards`);
      const data = await response.json();

      if (data.items) {
        setBoards(data.items);

        const redbubbleBoard = data.items.find(
          (b: any) => b.name === "Redbubble"
        );

        if (redbubbleBoard) {
          setSelectedBoard(redbubbleBoard.id);
        }
      }
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", "Failed to load Pinterest boards.");
    } finally {
      setLoadingBoards(false);
    }
  };

  const createPinterestPin = async () => {
    try {
      if (!selectedBoard) {
        Alert.alert("Missing Board", "Please select a Pinterest board.");
        return;
      }

      if (!imageUrl) {
        Alert.alert(
          "Missing Image URL",
          "Pinterest requires a public image URL."
        );
        return;
      }

      const finalProductLink = cleanUrl(productLink);

      if (finalProductLink && !finalProductLink.startsWith("http")) {
        Alert.alert(
          "Invalid Product Link",
          "The product link must start with https:// or http://."
        );
        return;
      }

      setPublishing(true);

      const response = await fetch(`${BACKEND_URL}/pinterest/create-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boardId: selectedBoard,
          title,
          description,
          link: finalProductLink,
          imageUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log(data);
        Alert.alert("Pinterest Error", JSON.stringify(data, null, 2));
        return;
      }

      Alert.alert(
        "Pinterest Pin Published",
        "Your artwork was successfully posted to Pinterest."
      );
    } catch (err: any) {
      console.log(err);

      Alert.alert(
        "Publish Failed",
        err.message || "Failed to publish Pinterest pin."
      );
    } finally {
      setPublishing(false);
    }
  };

  const generateVariations = async () => {
    try {
      setLoadingVariations(true);

      const baseTitle = title || "Artwork Campaign";
      const baseDescription =
        description ||
        "A bold artwork campaign designed for creator marketing.";

      const variationData = [
        {
          title: `${baseTitle} — Bold Sales`,
          description: `${baseDescription}\n\nA strong, direct version designed to grab attention and push shoppers toward the product link.`,
        },
        {
          title: `${baseTitle} — Premium Art Style`,
          description: `${baseDescription}\n\nA polished, collector-style version written for buyers who appreciate unique artwork and standout visual design.`,
        },
        {
          title: `${baseTitle} — Viral Hook`,
          description: `Stop scrolling — this design brings serious visual energy.\n\n${baseDescription}`,
        },
        {
          title: `${baseTitle} — SEO Focused`,
          description: `${baseDescription}\n\nOptimized for search visibility, niche buyers, art lovers, and product discovery.`,
        },
        {
          title: `${baseTitle} — Short & Punchy`,
          description: `Bold artwork. Strong style. Instant attention.\n\n${baseDescription}`,
        },
      ];

      setVariations(variationData);

      Alert.alert(
        "Variations Generated",
        "Five Pro content variations were created."
      );
    } catch (err) {
      console.log(err);

      Alert.alert("Variation Error", "Failed to generate variations.");
    } finally {
      setLoadingVariations(false);
    }
  };

  const copyVariation = async (variationTitle: string, variationText: string) => {
    await Clipboard.setStringAsync(`${variationTitle}\n\n${variationText}`);

    Alert.alert("Copied", "Variation copied to clipboard.");
  };

  const simulateProFeature = (feature: string) => {
    Alert.alert(
      feature,
      `${feature} automation workflow will be activated as platform APIs are connected.`
    );
  };

  useEffect(() => {
    loadBoards();
    loadCurrentCampaign();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>ArtBoost Pro</Text>

      <Text style={styles.subheader}>Automation Control Center</Text>

      <View style={styles.heroBox}>
        <Text style={styles.heroTitle}>Creator Automation</Text>

        <Text style={styles.heroText}>
          Generate campaigns, auto-publish content, schedule posts, and
          streamline your creator workflow.
        </Text>
      </View>

      <View style={styles.automationGrid}>
        <Pressable
          style={styles.automationCard}
          onPress={() => simulateProFeature("Post Everywhere")}
        >
          <Text style={styles.automationTitle}>Post Everywhere</Text>

          <Text style={styles.automationText}>
            Publish campaigns to multiple connected platforms.
          </Text>
        </Pressable>

        <Pressable
          style={styles.automationCard}
          onPress={() => simulateProFeature("Schedule Campaign")}
        >
          <Text style={styles.automationTitle}>Schedule Campaign</Text>

          <Text style={styles.automationText}>
            Queue campaigns for future automated posting.
          </Text>
        </Pressable>

        <Pressable style={styles.automationCard} onPress={generateVariations}>
          <Text style={styles.automationTitle}>Generate Variations</Text>

          <Text style={styles.automationText}>
            Create multiple title and caption versions instantly.
          </Text>
        </Pressable>

        <Pressable
          style={styles.automationCard}
          onPress={() => simulateProFeature("Queue Posts")}
        >
          <Text style={styles.automationTitle}>Queue Posts</Text>

          <Text style={styles.automationText}>
            Batch process and manage creator campaigns.
          </Text>
        </Pressable>
      </View>

      {variations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>AI Variations</Text>

          {variations.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.variationCard}>
              <Text style={styles.variationTitle}>{item.title}</Text>

              <Text style={styles.variationDescription}>
                {item.description}
              </Text>

              <Pressable
                style={styles.copyButton}
                onPress={() => copyVariation(item.title, item.description)}
              >
                <Text style={styles.copyButtonText}>Copy Variation</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.preview} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Pinterest Publishing</Text>

        <Text style={styles.label}>Pinterest Board</Text>

        {loadingBoards ? (
          <Text style={styles.loading}>Loading boards...</Text>
        ) : (
          boards.map((board: any) => (
            <Pressable
              key={board.id}
              style={[
                styles.boardButton,
                selectedBoard === board.id && styles.boardSelected,
              ]}
              onPress={() => setSelectedBoard(board.id)}
            >
              <Text style={styles.boardText}>{board.name}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pinterest Title</Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Pinterest Description</Text>

        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.label}>Public Image URL</Text>

        <TextInput
          style={styles.input}
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://..."
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Product Link</Text>

        <TextInput
          style={styles.input}
          value={productLink}
          onChangeText={setProductLink}
          placeholder="https://your-product-link.com"
          placeholderTextColor="#777"
        />
      </View>

      <Pressable style={styles.publishButton} onPress={createPinterestPin}>
        <Text style={styles.publishText}>
          {publishing
            ? "Publishing..."
            : loadingVariations
            ? "Generating..."
            : "Post To Pinterest"}
        </Text>
      </Pressable>
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
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 40,
  },

  subheader: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
    fontSize: 15,
  },

  heroBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#8b5cf6",
    marginBottom: 20,
  },

  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },

  heroText: {
    color: "#d0d0d0",
    lineHeight: 24,
    fontSize: 15,
  },

  automationGrid: {
    marginBottom: 20,
  },

  automationCard: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },

  automationTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },

  automationText: {
    color: "#aaa",
    lineHeight: 22,
    fontSize: 14,
  },

  variationCard: {
    backgroundColor: "#2b2b2b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },

  variationTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },

  variationDescription: {
    color: "#d0d0d0",
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 14,
  },

  copyButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  copyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },

  preview: {
    width: "100%",
    height: 260,
    borderRadius: 18,
    resizeMode: "contain",
    backgroundColor: "#1a1a1a",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },

  sectionHeader: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 18,
  },

  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 10,
  },

  input: {
    backgroundColor: "#2b2b2b",
    color: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },

  textarea: {
    minHeight: 120,
    textAlignVertical: "top",
  },

  boardButton: {
    backgroundColor: "#2b2b2b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },

  boardSelected: {
    backgroundColor: "#bd081c",
  },

  boardText: {
    color: "#fff",
    fontWeight: "700",
  },

  loading: {
    color: "#aaa",
  },

  publishButton: {
    backgroundColor: "#bd081c",
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
    marginBottom: 40,
  },

  publishText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});