import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

  const loadConnections = async () => {
    const saved = await AsyncStorage.getItem(
      "artboost_connections"
    );

    if (saved) {
      setConnections(JSON.parse(saved));
    }
  };

  const toggleConnection = async (
    platform: string
  ) => {
    const updated = {
      ...connections,
      [platform]: !connections[platform],
    };

    setConnections(updated);

    await AsyncStorage.setItem(
      "artboost_connections",
      JSON.stringify(updated)
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
      contentContainerStyle={styles.container}
    >
      <Text style={styles.header}>
        Social Connections
      </Text>

      <Text style={styles.subheader}>
        Connect social platforms for
        automated posting.
      </Text>

      {platforms.map((platform) => {
        const connected =
          connections[platform];

        return (
          <View
            key={platform}
            style={styles.card}
          >
            <View style={styles.row}>
              <View>
                <Text style={styles.name}>
                  {platform}
                </Text>

                <Text style={styles.status}>
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
                    platform
                  )
                }
              >
                <Text
                  style={styles.buttonText}
                >
                  {connected
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
    marginBottom: 30,
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

  name: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  status: {
    color: "#999",
    marginTop: 6,
    fontSize: 14,
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
    backgroundColor: "#ff4444",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});