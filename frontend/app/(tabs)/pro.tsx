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

  const [publishDate, setPublishDate] = useState("");
  const [scheduledCampaigns, setScheduledCampaigns] = useState<any[]>([]);

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

  const loadScheduledCampaigns = async () => {
    const saved = await AsyncStorage.getItem("artboost_scheduled_campaigns");
    if (saved) {
      setScheduledCampaigns(JSON.parse(saved));
    }
  };

  const saveScheduledCampaign = async () => {
    if (!title || !description) {
      Alert.alert("Missing Content", "Generate or enter campaign content first.");
      return;
    }

    if (!publishDate) {
      Alert.alert("Missing Schedule Time", "Enter a date/time or schedule note.");
      return;
    }

    const newSchedule = {
      id: Date.now().toString(),
      title,
      description,
      imageUrl,
      productLink,
      boardId: selectedBoard,
      publishDate,
      platform: "Pinterest",
      createdAt: new Date().toLocaleString(),
    };

    const updated = [newSchedule, ...scheduledCampaigns];

    setScheduledCampaigns(updated);

    await AsyncStorage.setItem(
      "artboost_scheduled_campaigns",
      JSON.stringify(updated)
    );

    setPublishDate("");

    Alert.alert("Scheduled", "Campaign added to your Pro posting queue.");
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
        Alert.alert("Missing Image URL", "Pinterest requires a public image URL.");
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

      const response = await fetch(`${BACKEND_URL}/generate-variations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          title,
          description,
          platform: "Pinterest",
          productLink,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log(data);
        Alert.alert(
          "Variation Error",
          data.error || "Failed to generate AI variations."
        );
        return;
      }

      if (!data.variations || !Array.isArray(data.variations)) {
        Alert.alert("Variation Error", "Invalid AI response.");
        return;
      }

      setVariations(data.variations);

      Alert.alert(
        "AI Variations Ready",
        "Fresh AI campaign variations generated successfully."
      );
    } catch (err: any) {
      console.log(err);
      Alert.alert(
        "Variation Error",
        err.message || "Failed to generate AI variations."
      );
    } finally {
      setLoadingVariations(false);
    }
  };

  const copyVariation = async (variationTitle: string, variationText: string) => {
    await Clipboard.setStringAsync(`${variationTitle}\n\n${variationText}`);
    Alert.alert("Copied", "Variation copied to clipboard.");
  };

  const useVariation = (variationTitle: string, variationText: string) => {
    setTitle(variationTitle);
    setDescription(variationText);
    Alert.alert("Loaded", "Variation loaded into the publishing fields.");
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
    loadScheduledCampaigns();
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

        <Pressable style={styles.automationCard} onPress={saveScheduledCampaign}>
          <Text style={styles.automationTitle}>Schedule Campaign</Text>
          <Text style={styles.automationText}>
            Queue this campaign for future automated posting.
          </Text>
        </Pressable>

        <Pressable style={styles.automationCard} onPress={generateVariations}>
          <Text style={styles.automationTitle}>Generate Variations</Text>
          <Text style={styles.automationText}>
            {loadingVariations
              ? "Generating AI variations..."
              : "Create multiple title and caption versions instantly."}
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
              <Text style={styles.variationStyle}>{item.style}</Text>
              <Text style={styles.variationTitle}>{item.title}</Text>
              <Text style={styles.variationDescription}>{item.description}</Text>

              <Pressable
                style={styles.copyButton}
                onPress={() => copyVariation(item.title, item.description)}
              >
                <Text style={styles.copyButtonText}>Copy Variation</Text>
              </Pressable>

              <Pressable
                style={styles.useButton}
                onPress={() => useVariation(item.title, item.description)}
              >
                <Text style={styles.copyButtonText}>Use This Version</Text>
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

        <TextInput style={styles.input} value={title} onChangeText={setTitle} />

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

        <Text style={styles.label}>Schedule Time / Note</Text>

        <TextInput
          style={styles.input}
          value={publishDate}
          onChangeText={setPublishDate}
          placeholder="Example: Friday 7 PM"
          placeholderTextColor="#777"
        />
      </View>

      {scheduledCampaigns.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Scheduled Queue</Text>

          {scheduledCampaigns.map((item) => (
            <View key={item.id} style={styles.queueCard}>
              <Text style={styles.queueTitle}>{item.title}</Text>
              <Text style={styles.queueText}>{item.platform}</Text>
              <Text style={styles.queueText}>Scheduled: {item.publishDate}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.publishButton} onPress={createPinterestPin}>
        <Text style={styles.publishText}>
          {publishing ? "Publishing..." : "Post To Pinterest"}
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

  variationStyle: {
    color: "#8b5cf6",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
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
    marginBottom: 10,
  },

  useButton: {
    backgroundColor: "#2d6cdf",
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

  queueCard: {
    backgroundColor: "#2b2b2b",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  queueTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 6,
  },

  queueText: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 20,
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