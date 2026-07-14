import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL = "https://artboost-ai.onrender.com";

type ConnectionSection = "social" | "stores";

type PlatformItem = {
  name: string;
  description: string;
  premium: boolean;
  available: boolean;
  connectionType?: string;
};

const socialPlatforms: PlatformItem[] = [
  {
    name: "Pinterest",
    description: "Publish pins, artwork, and product campaigns.",
    premium: true,
    available: true,
  },
  {
    name: "Facebook",
    description: "Post product and artwork campaigns to Facebook Pages.",
    premium: true,
    available: true,
  },
  {
    name: "Instagram",
    description: "Publish images and captions to Instagram Business.",
    premium: true,
    available: true,
  },
  {
    name: "X",
    description: "Publish product links, artwork, images, and short posts.",
    premium: true,
    available: true,
  },
];

const storePlatforms: PlatformItem[] = [
  {
    name: "Shopify",
    description: "Import products and automate store marketing.",
    premium: true,
    available: true,
    connectionType: "Live Sync",
  },
  {
    name: "Etsy",
    description: "Import Etsy shop listings and product information.",
    premium: true,
    available: true,
    connectionType: "Live Sync",
  },
  {
    name: "eBay",
    description: "Import active eBay listings and marketplace products.",
    premium: true,
    available: false,
    connectionType: "Live Sync",
  },
  {
    name: "Redbubble",
    description: "Import products from a Redbubble storefront.",
    premium: true,
    available: false,
    connectionType: "Catalog Import",
  },
  {
    name: "ArtPal",
    description: "Import artwork listings from an ArtPal gallery.",
    premium: true,
    available: false,
    connectionType: "Catalog Import",
  },
  {
    name: "Fine Art America",
    description: "Import artwork and products from Fine Art America.",
    premium: true,
    available: false,
    connectionType: "Catalog Import",
  },
  {
    name: "Custom Store",
    description:
      "Add another store using a catalog feed, CSV file, store URL, or manual products.",
    premium: true,
    available: false,
    connectionType: "Custom Import",
  },
];

export default function ConnectionsScreen() {
  const { section } = useLocalSearchParams<{
  section?: string;
}>();
  const [activeSection, setActiveSection] =
    useState<ConnectionSection>("social");

  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [shopifyStore, setShopifyStore] = useState("");
  const [shopifyDetails, setShopifyDetails] = useState<{
  id: string;
  storeType: string;
  storeName: string;
  productCount: number;
} | null>(null);

  const visiblePlatforms = useMemo(() => {
    return activeSection === "social" ? socialPlatforms : storePlatforms;
  }, [activeSection]);

  const saveConnections = async (
    updated: Record<string, boolean>
  ) => {
    setConnections(updated);

    await AsyncStorage.setItem(
      "artboost_connections",
      JSON.stringify(updated)
    );
  };

  const getStoredConnections = async () => {
    const saved = await AsyncStorage.getItem(
      "artboost_connections"
    );

    return saved ? JSON.parse(saved) : {};
  };

  const updateStoredConnection = async (
  platform: string,
  connected: boolean
) => {
  setConnections(
    (current) => {
      const updated = {
        ...current,
        [platform]: connected,
      };

      AsyncStorage.setItem(
        "artboost_connections",
        JSON.stringify(updated)
      ).catch((error) => {
        console.log(
          "Connection storage failed:",
          error
        );
      });

      return updated;
    }
  );
};

  const checkPinterestStatus = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/pinterest/status`
      );

      const responseText =
  await response.text();

console.log(
  "Resume response:",
  response.status,
  responseText
);

let data: any;

try {
  data = JSON.parse(
    responseText
  );
} catch {
  throw new Error(
    `Backend returned ${response.status}: ${responseText.slice(
      0,
      200
    )}`
  );
}

      await updateStoredConnection(
        "Pinterest",
        Boolean(data.connected)
      );
    } catch (error) {
      console.log(
        "Pinterest status check failed:",
        error
      );
    }
  };

  const checkFacebookStatus = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/facebook/test`
      );

      const data = await response.json();

      await updateStoredConnection(
        "Facebook",
        Boolean(data.connected)
      );
    } catch (error) {
      console.log(
        "Facebook status check failed:",
        error
      );
    }
  };

  const checkInstagramStatus = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/instagram/status`
      );

      const data = await response.json();

      await updateStoredConnection(
        "Instagram",
        Boolean(data.connected)
      );
    } catch (error) {
      console.log(
        "Instagram status check failed:",
        error
      );
    }
  };

  const checkXStatus = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/x/status`
      );

      const data = await response.json();

      await updateStoredConnection(
        "X",
        Boolean(data.connected)
      );
    } catch (error) {
      console.log("X status check failed:", error);
    }
  };

  const checkShopifyStatus = async () => {
    try {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        await updateStoredConnection(
          "Shopify",
          false
        );

        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/shopify/status?userId=${encodeURIComponent(
          userId
        )}`
      );

      const data = await response.json();

      await updateStoredConnection(
        "Shopify",
        Boolean(data.connected)
      );

      if (data.shopDomain) {
        setShopifyStore(
          String(data.shopDomain).replace(
            /\.myshopify\.com$/i,
            ""
          )
        );
      }

const storesResponse = await fetch(
  `${BACKEND_URL}/stores?userId=${encodeURIComponent(
    userId
  )}`
);

const storesData =
  await storesResponse.json();

if (
  storesResponse.ok &&
  storesData.success
) {
  const shopifyConnection = (
    storesData.stores || []
  ).find(
    (store: any) =>
      String(
        store.storeType || ""
      ).toLowerCase() === "shopify"
  );

  if (shopifyConnection) {
    setShopifyDetails({
      id: String(
        shopifyConnection.id
      ),
      storeType: String(
        shopifyConnection.storeType
      ),
      storeName: String(
        shopifyConnection.storeName
      ),
      productCount:
        Number(
          shopifyConnection.productCount
        ) || 0,
    });
  } else {
    setShopifyDetails(null);
  }
}

    } catch (error) {
      console.log(
        "Shopify status check failed:",
        error
      );
    }
  };

  const checkEtsyStatus = async () => {
  try {
    const { data: sessionData } =
      await supabase.auth.getSession();

    const userId =
      sessionData.session?.user?.id;

       if (!userId) {
        await updateStoredConnection(
        "Etsy",
        false
      );

      return;
    }

    const response = await fetch(
      `${BACKEND_URL}/etsy/status?userId=${encodeURIComponent(
        userId
      )}`
    );

    const responseText =
      await response.text();

      let data: any;

    try {
      data = JSON.parse(
        responseText
      );
    } catch {
      throw new Error(
        `Backend returned ${response.status}: ${responseText.slice(
          0,
          200
        )}`
      );
    }

    Alert.alert(
  "Etsy Status Test",
  `HTTP ${response.status}\n\n${responseText.slice(
    0,
    500
  )}`
);

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Unable to check Etsy status."
      );
    }

    await updateStoredConnection(
  "Etsy",
  Boolean(data.connected)
);

  } catch (error) {
    console.log(
      "Etsy status check failed:",
      error
    );

    await updateStoredConnection(
      "Etsy",
      false
    );
  }
};

  const refreshAllStatuses = async () => {
    try {
      setLoadingStatus(true);

      await checkPinterestStatus();
      await checkFacebookStatus();
      await checkInstagramStatus();
      await checkXStatus();
      await checkShopifyStatus();
      await checkEtsyStatus();
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadConnections = async () => {
    const current =
      await getStoredConnections();

    setConnections(current);

    await refreshAllStatuses();
  };

  const connectPinterest = async () => {
    await Linking.openURL(
      `${BACKEND_URL}/auth/pinterest`
    );

    Alert.alert(
      "Pinterest Login Opened",
      "Complete the Pinterest authorization, return to ArtBoost, and refresh the connection status."
    );
  };

  const connectFacebook = async () => {
    await Linking.openURL(
      `${BACKEND_URL}/auth/facebook`
    );

    Alert.alert(
      "Facebook Login Opened",
      "Complete the Facebook authorization, return to ArtBoost, and refresh the connection status."
    );
  };

  const connectShopify = async () => {
    try {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id;

      if (!userId) {
        Alert.alert(
          "Login Required",
          "Please log in before connecting Shopify."
        );

        return;
      }

      const cleanStore = shopifyStore
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/\.myshopify\.com$/i, "");

      if (!cleanStore) {
        Alert.alert(
          "Store Required",
          "Enter your Shopify store name before connecting."
        );

        return;
      }

      await Linking.openURL(
        `${BACKEND_URL}/auth/shopify?userId=${encodeURIComponent(
          userId
        )}&shop=${encodeURIComponent(cleanStore)}`
      );

      Alert.alert(
        "Shopify Login Opened",
        "Complete the Shopify authorization, return to ArtBoost, and refresh the connection status."
      );
    } catch (error: any) {
      Alert.alert(
        "Shopify Connection Failed",
        error?.message ||
          "Unable to open Shopify."
      );
    }
  };

  const openShopifyDashboard = () => {
  if (!shopifyDetails) {
    Alert.alert(
      "Store Information Unavailable",
      "Refresh the connection status and try again."
    );

    return;
  }

  router.push({
    pathname: "/store-dashboard" as any,
    params: {
      storeId: shopifyDetails.id,
      storeName:
        shopifyDetails.storeName,
      storeType:
        shopifyDetails.storeType,
      productCount: String(
        shopifyDetails.productCount
      ),
      connected: "true",
    },
  });
};

const connectEtsy = async () => {
  try {
    const { data: sessionData } =
      await supabase.auth.getSession();

    const userId =
      sessionData.session?.user?.id;

    if (!userId) {
      Alert.alert(
        "Login Required",
        "Please log in before connecting Etsy."
      );

      return;
    }

    const etsyUrl =
      `${BACKEND_URL}/auth/etsy?userId=${encodeURIComponent(
        userId
      )}`;

    await Linking.openURL(
      etsyUrl
    );
  } catch (error: any) {
    Alert.alert(
      "Etsy Connection Failed",
      error?.message ||
        "Unable to open Etsy."
    );
  }
};
       
  const connectPlatform = async (
    platform: string
  ) => {
    if (platform === "Pinterest") {
      await connectPinterest();
      return;
    }

    if (platform === "Facebook") {
      await connectFacebook();
      return;
    }

    if (platform === "Shopify") {
      await connectShopify();
      return;
    }

    if (platform === "Etsy") {
  await connectEtsy();
  return;
}

    if (
      platform === "Instagram" ||
      platform === "X"
    ) {
      Alert.alert(
        `${platform} Connection`,
        `${platform} is currently configured through the ArtBoost server. Account-level OAuth will be added in a later update.`
      );

      return;
    }

    Alert.alert(
      `${platform} Coming Soon`,
      `${platform} integration has been added to the ArtBoost roadmap but is not available yet.`
    );
  };

  const disconnectPlatform = async (
    platform: string
  ) => {
    try {
      const { data: sessionData } =
        await supabase.auth.getSession();

      const userId =
        sessionData.session?.user?.id || null;

      const response = await fetch(
        `${BACKEND_URL}/disconnect-platform`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platform,
            userId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            `Failed to disconnect ${platform}.`
        );
      }

      await updateStoredConnection(
        platform,
        false
      );

      await refreshAllStatuses();

      Alert.alert(
        `${platform} Disconnected`,
        `${platform} was disconnected successfully.`
      );
    } catch (error: any) {
      console.log(
        `${platform} disconnect failed:`,
        error
      );

      Alert.alert(
        "Disconnect Failed",
        error?.message ||
          `Failed to disconnect ${platform}.`
      );
    }
  };

  const confirmDisconnect = (
    platform: string
  ) => {
    Alert.alert(
      `Disconnect ${platform}?`,
      `You will need to reconnect ${platform} before using it again.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () =>
            disconnectPlatform(platform),
        },
      ]
    );
  };

  useEffect(() => {
  if (section === "stores") {
    setActiveSection("stores");
  }

  if (section === "social") {
    setActiveSection("social");
  }
}, [section]);

  useEffect(() => {
    loadConnections();
  }, []);

  const renderPlatformCard = (
    platform: PlatformItem
  ) => {
    const connected =
      Boolean(connections[platform.name]);

    return (
      <View
        key={platform.name}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={styles.platformInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>
                {platform.name}
              </Text>

              {platform.premium ? (
                <View style={styles.proBadge}>
                  <Text
                    style={styles.proBadgeText}
                  >
                    PRO
                  </Text>
                </View>
              ) : null}
            </View>

            {platform.connectionType ? (
              <Text style={styles.connectionType}>
                {platform.connectionType}
              </Text>
            ) : null}

            <Text style={styles.description}>
              {platform.description}
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
                : platform.available
                ? "Not Connected"
                : "Coming Soon"}
            </Text>
          </View>

          <View style={styles.buttonColumn}>
            {connected &&
platform.name === "Shopify" ? (
  <Pressable
    style={[
      styles.button,
      styles.manageStoreButton,
    ]}
    onPress={
      openShopifyDashboard
    }
  >
    <Text style={styles.buttonText}>
      Manage Store
    </Text>
  </Pressable>
) : null}
            <Pressable
              style={[
                styles.button,
                !platform.available
                  ? styles.comingSoonButton
                  : connected
                  ? styles.reconnectButton
                  : styles.connectButton,
              ]}
              disabled={!platform.available}
              onPress={() =>
                connectPlatform(platform.name)
              }
            >
              <Text style={styles.buttonText}>
                {!platform.available
                  ? "Coming Soon"
                  : connected
                  ? "Reconnect"
                  : "Connect"}
              </Text>
            </Pressable>

            {connected ? (
              <Pressable
                style={[
                  styles.button,
                  styles.disconnectButton,
                ]}
                onPress={() =>
                  confirmDisconnect(
                    platform.name
                  )
                }
              >
                <Text style={styles.buttonText}>
                  Disconnect
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>
        Connections
      </Text>

      <Text style={styles.subheader}>
        Connect social platforms for publishing
        and stores for product imports and
        automated marketing.
      </Text>

      <View style={styles.segmentedControl}>
        <Pressable
          style={[
            styles.segmentButton,
            activeSection === "social" &&
              styles.segmentButtonActive,
          ]}
          onPress={() =>
            setActiveSection("social")
          }
        >
          <Text
            style={[
              styles.segmentText,
              activeSection === "social" &&
                styles.segmentTextActive,
            ]}
          >
            Social Platforms
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.segmentButton,
            activeSection === "stores" &&
              styles.segmentButtonActive,
          ]}
          onPress={() =>
            setActiveSection("stores")
          }
        >
          <Text
            style={[
              styles.segmentText,
              activeSection === "stores" &&
                styles.segmentTextActive,
            ]}
          >
            Stores
          </Text>
        </Pressable>
      </View>

      <View style={styles.proBox}>
        <Text style={styles.proTitle}>
          {activeSection === "social"
            ? "Social Publishing"
            : "Store Connections"}
        </Text>

        <Text style={styles.proText}>
          {activeSection === "social"
            ? "Connect publishing destinations for generated and scheduled campaigns."
            : "Connect product sources so ArtBoost can import, organize, and promote listings."}
        </Text>
      </View>

      <Pressable
        style={styles.refreshButton}
        onPress={refreshAllStatuses}
        disabled={loadingStatus}
      >
        {loadingStatus ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />
            <Text style={styles.buttonText}>
              Checking Connections...
            </Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>
            Refresh Connection Status
          </Text>
        )}
      </Pressable>

      {activeSection === "stores" ? (
        <View style={styles.shopifyEntryCard}>
          <Text style={styles.name}>
            Shopify Store
          </Text>

          <Text style={styles.description}>
            Enter the store prefix or full
            myshopify.com address.
          </Text>

          <TextInput
            style={styles.input}
            value={shopifyStore}
            onChangeText={setShopifyStore}
            placeholder="artistwill"
            placeholderTextColor="#777"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.inputHint}>
            Example: artistwill or
            artistwill.myshopify.com
          </Text>
        </View>
      ) : null}

      {visiblePlatforms.map(
        renderPlatformCard
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#101010",
    minHeight: "100%",
  },

  header: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 40,
    textAlign: "center",
  },

  subheader: {
    color: "#aaaaaa",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 22,
  },

  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#303030",
  },

  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  segmentButtonActive: {
    backgroundColor: "#8b5cf6",
  },

  segmentText: {
    color: "#8e8e8e",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },

  segmentTextActive: {
    color: "#ffffff",
  },

  proBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#8b5cf6",
  },

  proTitle: {
    color: "#ffffff",
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
    backgroundColor: "#2d6cdf",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  shopifyEntryCard: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#343434",
  },

  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#282828",
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

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  name: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },

  connectionType: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 7,
  },

  description: {
    color: "#aaaaaa",
    marginTop: 8,
    lineHeight: 20,
    fontSize: 13,
  },

  input: {
    backgroundColor: "#2b2b2b",
    color: "#ffffff",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#3b3b3b",
  },

  inputHint: {
    color: "#777777",
    fontSize: 11,
    marginTop: 8,
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
    color: "#999999",
  },

  buttonColumn: {
    width: 112,
  },

  button: {
    minHeight: 43,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  connectButton: {
    backgroundColor: "#12a86b",
  },

  manageStoreButton: {
  backgroundColor: "#8b5cf6",
},

  reconnectButton: {
    backgroundColor: "#2d6cdf",
  },

  disconnectButton: {
    backgroundColor: "#a62828",
  },

  comingSoonButton: {
    backgroundColor: "#3a3a3a",
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  proBadge: {
    backgroundColor: "#8b5cf6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 10,
  },

  proBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
});