import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BACKEND_URL = "https://artboost-ai.onrender.com";

const platforms = [
  {
    name: "Pinterest",
    description:
      "Auto-publish pins and artwork campaigns.",
    premium: true,
  },

  {
    name: "Facebook",
    description:
      "Post artwork directly to Facebook Pages.",
    premium: true,
  },

  {
    name: "Instagram",
    description:
      "Instagram Business publishing and captions.",
    premium: true,
  },

  {
    name: "TikTok",
    description:
      "Generate viral captions and future auto-posting.",
    premium: true,
  },

  {
    name: "X",
    description:
      "Fast text and artwork posting.",
    premium: true,
  },

  {
    name: "Threads",
    description:
      "Meta Threads creator publishing.",
    premium: true,
  },

  {
    name: "Tumblr",
    description:
      "Art blogging and niche communities.",
    premium: false,
  },

  {
    name: "Reddit",
    description:
      "Subreddit campaign publishing.",
    premium: false,
  },

  {
    name: "Lemon8",
    description:
      "Lifestyle creator growth platform.",
    premium: false,
  },

  {
    name: "Truth Social",
    description:
      "Alternative social publishing.",
    premium: false,
  },
];

export default function ConnectionsScreen() {
  const [connections, setConnections] =
    useState<any>({});

  const [loadingPinterest, setLoadingPinterest] =
    useState(false);

  const loadConnections = async () => {
    const saved =
      await AsyncStorage.getItem(
        "artboost_connections"
      );

    if (saved) {
      setConnections(JSON.parse(saved));
    }

    await checkPinterestStatus();
  };

  const saveConnections = async (
    updated: any
  ) => {
    setConnections(updated);

    await AsyncStorage.setItem(
      "artboost_connections",
      JSON.stringify(updated)
    );
  };

  const checkPinterestStatus =
    async () => {
      try {
        setLoadingPinterest(true);

        const response =
          await fetch(
            `${BACKEND_URL}/pinterest/status`
          );

        const data =
          await response.json();

        const saved =
          await AsyncStorage.getItem(
            "artboost_connections"
          );

        const current = saved
          ? JSON.parse(saved)
          : {};

        const updated = {
          ...current,
          Pinterest: Boolean(
            data.connected
          ),
        };

        await saveConnections(
          updated
        );
      } catch (error) {
        console.log(
          "Pinterest status check failed:",
          error
        );
      } finally {
        setLoadingPinterest(false);
      }
    };

  const connectPinterest =
    async () => {
      await Linking.openURL(
        `${BACKEND_URL}/auth/pinterest`
      );

      Alert.alert(
        "Pinterest Login Opened",
        "After connecting Pinterest, return to ArtBoost and tap Refresh Pinterest Status."
      );
    };

  const connectFacebook =
    async () => {
      Alert.alert(
        "Facebook Integration",
        "Facebook OAuth integration will be connected next through the Meta Developer platform."
      );

      const updated = {
        ...connections,
        Facebook: true,
      };

      await saveConnections(
        updated
      );
    };

  const toggleConnection =
    async (platform: string) => {
      if (
        platform === "Pinterest"
      ) {
        if (
          connections.Pinterest
        ) {
          Alert.alert(
            "Pinterest Connected",
            "Pinterest is connected through the ArtBoost backend."
          );
        } else {
          await connectPinterest();
        }

        return;
      }

      if (
        platform === "Facebook"
      ) {
        await connectFacebook();
        return;
      }

      const updated = {
        ...connections,
        [platform]:
          !connections[
            platform
          ],
      };

      await saveConnections(
        updated
      );

      Alert.alert(
        updated[platform]
          ? `${platform} Connected`
          : `${platform} Disconnected`,
        updated[platform]
          ? `Your ${platform} account is now connected.`
          : `Your ${platform} account was disconnected.`
      );
    };

  useEffect(() => {
    loadConnections();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={
        styles.container
      }
    >
      <Text style={styles.header}>
        Connections
      </Text>

      <Text
        style={styles.subheader}
      >
        Connect creator platforms
        for automated publishing
        and Pro workflow tools.
      </Text>

      <View style={styles.proBox}>
        <Text
          style={styles.proTitle}
        >
          ArtBoost Pro
        </Text>

        <Text
          style={styles.proText}
        >
          Connect platforms once,
          then generate and publish
          campaigns automatically.
        </Text>
      </View>

      <Pressable
        style={styles.refreshButton}
        onPress={
          checkPinterestStatus
        }
      >
        <Text
          style={styles.buttonText}
        >
          {loadingPinterest
            ? "Checking Pinterest..."
            : "Refresh Pinterest Status"}
        </Text>
      </Pressable>

      {platforms.map(
        (platform) => {
          const connected =
            connections[
              platform.name
            ];

          return (
            <View
              key={platform.name}
              style={styles.card}
            >
              <View
                style={styles.row}
              >
                <View
                  style={
                    styles.platformInfo
                  }
                >
                  <View
                    style={
                      styles.titleRow
                    }
                  >
                    <Text
                      style={
                        styles.name
                      }
                    >
                      {
                        platform.name
                      }
                    </Text>

                    {platform.premium && (
                      <View
                        style={
                          styles.proBadge
                        }
                      >
                        <Text
                          style={
                            styles.proBadgeText
                          }
                        >
                          PRO
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text
                    style={
                      styles.description
                    }
                  >
                    {
                      platform.description
                    }
                  </Text>

                  <Text
                    style={[
                      styles.status,
                      connected
                        ? styles.connectedText
                        : styles.disconnectedText,
                    ]}
                  >
                    {connected
                      ? "Connected"
                      : "Not Connected"}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.button,
                    connected
                      ? styles.disconnect
                      : styles.connect,
                  ]}
                  onPress={() =>
                    toggleConnection(
                      platform.name
                    )
                  }
                >
                  <Text
                    style={
                      styles.buttonText
                    }
                  >
                    {platform.name ===
                      "Pinterest" &&
                    connected
                      ? "Connected"
                      : connected
                      ? "Disconnect"
                      : "Connect"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }
      )}
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
      fontSize: 32,
      fontWeight: "800",
      marginTop: 40,
      textAlign: "center",
    },

    subheader: {
      color: "#aaa",
      fontSize: 15,
      textAlign: "center",
      marginTop: 10,
      marginBottom: 24,
      lineHeight: 22,
    },

    proBox: {
      backgroundColor:
        "#1b1b1b",
      borderRadius: 18,
      padding: 18,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: "#8b5cf6",
    },

    proTitle: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "900",
      marginBottom: 8,
    },

    proText: {
      color: "#cfcfcf",
      lineHeight: 22,
      fontSize: 14,
    },

    refreshButton: {
      backgroundColor:
        "#2d6cdf",
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 22,
    },

    card: {
      backgroundColor:
        "#1b1b1b",
      borderRadius: 18,
      padding: 18,
      marginBottom: 16,
    },

    row: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
    },

    platformInfo: {
      flex: 1,
      paddingRight: 12,
    },

    titleRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    name: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "800",
    },

    description: {
      color: "#aaa",
      marginTop: 8,
      lineHeight: 20,
      fontSize: 13,
    },

    status: {
      marginTop: 10,
      fontSize: 14,
      fontWeight: "700",
    },

    connectedText: {
      color: "#12a86b",
    },

    disconnectedText: {
      color: "#999",
    },

    button: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
    },

    connect: {
      backgroundColor:
        "#12a86b",
    },

    disconnect: {
      backgroundColor:
        "#444",
    },

    buttonText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
    },

    proBadge: {
      backgroundColor:
        "#8b5cf6",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginLeft: 10,
    },

    proBadgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "900",
    },
  });