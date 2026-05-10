import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";

const BACKEND_URL =
  "https://artboost-ai.onrender.com";

export default function ProScreen() {
  const [boards, setBoards] =
    useState<any[]>([]);

  const [selectedBoard, setSelectedBoard] =
    useState("");

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  const [productLink, setProductLink] =
    useState("");

  const [previewImage, setPreviewImage] =
    useState("");

  const [loadingBoards, setLoadingBoards] =
    useState(false);

  const [publishing, setPublishing] =
    useState(false);

  const loadCurrentCampaign =
    async () => {
      try {
        const saved =
          await AsyncStorage.getItem(
            "artboost_current_campaign"
          );

        if (!saved) return;

        const campaign =
          JSON.parse(saved);

        setTitle(
          campaign.pinterestTitle ||
            campaign.title ||
            ""
        );

        setDescription(
          campaign.pinterestDescription ||
            ""
        );

        setProductLink(
          campaign.productLink || ""
        );

        setPreviewImage(
          campaign.image || ""
        );

        if (campaign.imageUrl) {
          setImageUrl(
            campaign.imageUrl
          );
        }
      } catch (err) {
        console.log(
          "Failed loading campaign:",
          err
        );
      }
    };

  const loadBoards = async () => {
    try {
      setLoadingBoards(true);

      const response =
        await fetch(
          `${BACKEND_URL}/pinterest/boards`
        );

      const data =
        await response.json();

      if (data.items) {
        setBoards(data.items);

        const redbubbleBoard =
          data.items.find(
            (b: any) =>
              b.name ===
              "Redbubble"
          );

        if (redbubbleBoard) {
          setSelectedBoard(
            redbubbleBoard.id
          );
        }
      }
    } catch (err: any) {
      console.log(err);

      Alert.alert(
        "Error",
        "Failed to load Pinterest boards."
      );
    } finally {
      setLoadingBoards(false);
    }
  };

  const createPinterestPin =
    async () => {
      try {
        if (!selectedBoard) {
          Alert.alert(
            "Missing Board",
            "Please select a Pinterest board."
          );

          return;
        }

        if (!imageUrl) {
          Alert.alert(
            "Missing Image URL",
            "Pinterest requires a public image URL."
          );

          return;
        }

        setPublishing(true);

        const response =
          await fetch(
            `${BACKEND_URL}/pinterest/create-pin`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                boardId:
                  selectedBoard,
                title,
                description,
                link: productLink,
                imageUrl,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          console.log(data);

          Alert.alert(
            "Pinterest Error",
            JSON.stringify(
              data,
              null,
              2
            )
          );

          return;
        }

        Alert.alert(
          "Pinterest Pin Published",
          "Your artwork was successfully posted to Pinterest."
        );

        console.log(
          "Pinterest Pin Created:",
          data
        );
      } catch (err: any) {
        console.log(err);

        Alert.alert(
          "Publish Failed",
          err.message ||
            "Failed to publish Pinterest pin."
        );
      } finally {
        setPublishing(false);
      }
    };

  useEffect(() => {
    loadBoards();
    loadCurrentCampaign();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={
        styles.container
      }
    >
      <Text style={styles.header}>
        ArtBoost Pro
      </Text>

      <Text
        style={styles.subheader}
      >
        AI → Generate → Publish
      </Text>

      {previewImage ? (
        <Image
          source={{
            uri: previewImage,
          }}
          style={styles.preview}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>
          Pinterest Board
        </Text>

        {loadingBoards ? (
          <Text
            style={styles.loading}
          >
            Loading boards...
          </Text>
        ) : (
          boards.map(
            (board: any) => (
              <Pressable
                key={board.id}
                style={[
                  styles.boardButton,
                  selectedBoard ===
                    board.id &&
                    styles.boardSelected,
                ]}
                onPress={() =>
                  setSelectedBoard(
                    board.id
                  )
                }
              >
                <Text
                  style={
                    styles.boardText
                  }
                >
                  {board.name}
                </Text>
              </Pressable>
            )
          )
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          Pinterest Title
        </Text>

        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>
          Pinterest Description
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.textarea,
          ]}
          multiline
          value={description}
          onChangeText={
            setDescription
          }
        />

        <Text style={styles.label}>
          Public Image URL
        </Text>

        <TextInput
          style={styles.input}
          value={imageUrl}
          onChangeText={
            setImageUrl
          }
          placeholder="https://..."
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>
          Product Link
        </Text>

        <TextInput
          style={styles.input}
          value={productLink}
          onChangeText={
            setProductLink
          }
        />
      </View>

      <Pressable
        style={styles.publishButton}
        onPress={
          createPinterestPin
        }
      >
        <Text
          style={
            styles.publishText
          }
        >
          {publishing
            ? "Publishing..."
            : "Post To Pinterest"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor:
        "#101010",
      minHeight: "100%",
    },

    header: {
      color: "#fff",
      fontSize: 34,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 40,
    },

    subheader: {
      color: "#aaa",
      textAlign: "center",
      marginTop: 10,
      marginBottom: 30,
      fontSize: 15,
    },

    preview: {
      width: "100%",
      height: 260,
      borderRadius: 18,
      resizeMode: "contain",
      backgroundColor:
        "#1a1a1a",
      marginBottom: 20,
    },

    card: {
      backgroundColor:
        "#1a1a1a",
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
    },

    label: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 10,
      marginTop: 10,
    },

    input: {
      backgroundColor:
        "#2b2b2b",
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
      backgroundColor:
        "#2b2b2b",
      padding: 14,
      borderRadius: 12,
      marginBottom: 10,
    },

    boardSelected: {
      backgroundColor:
        "#bd081c",
    },

    boardText: {
      color: "#fff",
      fontWeight: "700",
    },

    loading: {
      color: "#aaa",
    },

    publishButton: {
      backgroundColor:
        "#bd081c",
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