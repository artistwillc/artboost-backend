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
  "Pinterest",
  "Facebook",
  "Instagram",
  "TikTok",
  "X",
  "Threads",
  "Tumblr",
  "Reddit",
  "Lemon8",
  "Truth Social",
];

export default function ConnectionsScreen() {
  const [connections, setConnections] = useState<any>({});
  const [loadingPinterest, setLoadingPinterest] = useState(false);

  const loadConnections = async () => {
    const saved = await AsyncStorage.getItem("artboost_connections");

    if (saved) {
      setConnections(JSON.parse(saved));
    }

    await checkPinterestStatus();
  };

  const saveConnections = async (updated: any) => {
    setConnections(updated);

    await AsyncStorage.setItem(
      "artboost_connections",
      JSON.stringify(updated)
    );
  };

  const checkPinterestStatus = async () => {
    try {
      setLoadingPinterest(true);

      const response = await fetch(`${BACKEND_URL}/pinterest/status`);
      const data = await response.json();

      const saved = await AsyncStorage.getItem("artboost_connections");
      const current = saved ? JSON.parse(saved) : {};

      const updated = {
        ...current,
        Pinterest: Boolean(data.connected),
      };

      await saveConnections(updated);
    } catch (error) {
      console.log("Pinterest status check failed:", error);
    } finally {
      setLoadingPinterest(false);
    }
  };

  const connectPinterest = async () => {
    await Linking.openURL(`${BACKEND_URL}/auth/pinterest`);

    Alert.alert(
      "Pinterest Login Opened",
      "After connecting Pinterest, return to ArtBoost and tap Refresh Pinterest Status."
    );
  };

  const toggleConnection = async (platform: string) => {
    if (platform === "Pinterest") {
      if (connections.Pinterest) {
        Alert.alert(
          "Pinterest Connected",
          "Pinterest is currently connected through the ArtBoost backend."
        );
      } else {
        await connectPinterest();
      }

      return;
    }

    const updated = {
      ...connections,
      [platform]: !connections[platform],
    };

    await saveConnections(updated);

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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Social Connections</Text>

      <Text style={styles.subheader}>
        Connect social platforms for automated posting.
      </Text>

      <Pressable style={styles.refreshButton} onPress={checkPinterestStatus}>
        <Text style={styles.buttonText}>
          {loadingPinterest ? "Checking Pinterest..." : "Refresh Pinterest Status"}
        </Text>
      </Pressable>

      {platforms.map((platform) => {
        const connected = connections[platform];

        return (
          <View key={platform} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.platformInfo}>
                <Text style={styles.name}>{platform}</Text>

                <Text
                  style={[
                    styles.status,
                    connected ? styles.connectedText : styles.disconnectedText,
                  ]}
                >
                  {connected ? "Connected" : "Not Connected"}
                </Text>
              </View>

              <Pressable
                style={[
                  styles.button,
                  connected ? styles.disconnect : styles.connect,
                ]}
                onPress={() => toggleConnection(platform)}
              >
                <Text style={styles.buttonText}>
                  {platform === "Pinterest" && connected
                    ? "Connected"
                    : connected
                    ? "Disconnect"
                    : "Connect"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
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
    textAlign: "center",
  },

  subheader: {
    color: "#aaa",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },

  refreshButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 22,
  },

  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  platformInfo: {
    flex: 1,
    paddingRight: 12,
  },

  name: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  status: {
    marginTop: 6,
    fontSize: 14,
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
    backgroundColor: "#12a86b",
  },

  disconnect: {
    backgroundColor: "#444",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});