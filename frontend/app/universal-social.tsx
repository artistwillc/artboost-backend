import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../lib/supabase";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type Provider = {
  id: string;
  name: string;
  aliases: string[];
  authMode: string;
  automationPlatform: string;
  requiresUserId: boolean;
};

export default function UniversalSocialScreen() {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    providers,
    setProviders,
  ] = useState<Provider[]>([]);

  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    connected,
    setConnected,
  ] = useState<
    Record<string, boolean>
  >({});

  const normalized =
    query.trim().toLowerCase();

  const matches =
    useMemo(() => {
      if (!normalized) {
        return providers;
      }

      return providers.filter(
        (provider) =>
          provider.name
            .toLowerCase()
            .includes(normalized) ||
          provider.id.includes(
            normalized
          ) ||
          provider.aliases?.some(
            (alias) =>
              alias.includes(
                normalized
              )
          )
      );
    }, [
      normalized,
      providers,
    ]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const {
          data,
        } =
          await supabase.auth.getSession();

        const id =
          data.session?.user?.id ||
          "";

        if (!active) return;

        setUserId(id);

        const response =
          await fetch(
            `${API_BASE}/social-connect/providers`
          );

        const dataJson =
          await response.json();

        if (
          !response.ok ||
          !dataJson?.success
        ) {
          throw new Error(
            dataJson?.error ||
            "Unable to load social platforms."
          );
        }

        const list =
          Array.isArray(
            dataJson.providers
          )
            ? dataJson.providers
            : [];

        if (active) {
          setProviders(list);
        }

        await refreshStatuses(
          list,
          id,
          active
        );
      } catch (error: any) {
        Alert.alert(
          "Unable to Load",
          error?.message ||
            "ArtBoost could not load social platforms."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  async function refreshStatuses(
    list = providers,
    id = userId,
    active = true
  ) {
    const entries =
      await Promise.all(
        list.map(
          async (provider) => {
            try {
              const response =
                await fetch(
                  `${API_BASE}/social-connect/status/${encodeURIComponent(
                    provider.id
                  )}?userId=${encodeURIComponent(
                    id
                  )}`
                );

              const data =
                await response.json();

              if (
                data?.delegated &&
                data?.statusPath
              ) {
                const separator =
                  data.statusPath.includes(
                    "?"
                  )
                    ? "&"
                    : "?";

                const nativeUrl =
                  data.requiresUserId &&
                  id
                    ? `${API_BASE}${data.statusPath}${separator}userId=${encodeURIComponent(
                        id
                      )}`
                    : `${API_BASE}${data.statusPath}`;

                const nativeResponse =
                  await fetch(nativeUrl);

                const nativeData =
                  await nativeResponse.json();

                return [
                  provider.id,
                  Boolean(
                    nativeData?.connected
                  ),
                ] as const;
              }

              return [
                provider.id,
                Boolean(
                  data?.connected
                ),
              ] as const;
            } catch {
              return [
                provider.id,
                false,
              ] as const;
            }
          }
        )
      );

    if (active) {
      setConnected(
        Object.fromEntries(
          entries
        )
      );
    }
  }

  async function connect(
    provider: Provider
  ) {
    if (
      provider.requiresUserId &&
      !userId
    ) {
      Alert.alert(
        "Login Required",
        `Please log in to ArtBoost before connecting ${provider.name}.`
      );
      return;
    }

    try {
      await Linking.openURL(
        `${API_BASE}/social-connect/auth/${encodeURIComponent(
          provider.id
        )}?userId=${encodeURIComponent(
          userId
        )}`
      );
    } catch (error: any) {
      Alert.alert(
        "Unable to Connect",
        error?.message ||
          `${provider.name} authorization could not be opened.`
      );
    }
  }

  async function refresh() {
    setLoading(true);

    try {
      await refreshStatuses(
        providers,
        userId,
        true
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <View
        style={styles.header}
      >
        <Pressable
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#ffffff"
          />
        </Pressable>

        <View
          style={styles.headerText}
        >
          <Text
            style={styles.eyebrow}
          >
            UNIVERSAL SOCIAL
          </Text>

          <Text
            style={styles.title}
          >
            Connect Social Platform
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={styles.hero}
        >
          <View
            style={styles.heroIcon}
          >
            <Ionicons
              name="share-social-outline"
              size={28}
              color="#ffffff"
            />
          </View>

          <View
            style={styles.heroText}
          >
            <Text
              style={styles.heroTitle}
            >
              Type it. Log in. Connected.
            </Text>

            <Text
              style={styles.heroBody}
            >
              ArtBoost uses one connector experience for every supported social platform. New providers appear here automatically when added to the server registry.
            </Text>
          </View>
        </View>

        <View
          style={styles.searchWrap}
        >
          <Ionicons
            name="search"
            size={20}
            color="#8b8b8b"
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Type a social platform..."
            placeholderTextColor="#686868"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {query ? (
            <Pressable
              onPress={() =>
                setQuery("")
              }
            >
              <Ionicons
                name="close-circle"
                size={21}
                color="#777777"
              />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={styles.refresh}
          onPress={refresh}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color="#ffffff"
            />
          ) : (
            <Ionicons
              name="refresh-outline"
              size={18}
              color="#ffffff"
            />
          )}

          <Text
            style={styles.refreshText}
          >
            Refresh Connection Status
          </Text>
        </Pressable>

        <Text
          style={styles.sectionTitle}
        >
          {normalized
            ? "Matches"
            : "Available Platforms"}
        </Text>

        {matches.map(
          (provider) => {
            const isConnected =
              Boolean(
                connected[
                  provider.id
                ]
              );

            return (
              <View
                key={provider.id}
                style={styles.card}
              >
                <View
                  style={styles.platformIcon}
                >
                  <Ionicons
                    name="share-social-outline"
                    size={25}
                    color="#ffffff"
                  />
                </View>

                <View
                  style={styles.platformInfo}
                >
                  <Text
                    style={styles.platformName}
                  >
                    {provider.name}
                  </Text>

                  <Text
                    style={[
                      styles.status,
                      isConnected &&
                        styles.connected,
                    ]}
                  >
                    {isConnected
                      ? "Connected"
                      : "Not connected"}
                  </Text>

                  <Text
                    style={styles.description}
                  >
                    Sign in once. ArtBoost can then use this platform in supported store automations.
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.connectButton,
                    isConnected &&
                      styles.reconnectButton,
                  ]}
                  onPress={() =>
                    connect(provider)
                  }
                >
                  <Text
                    style={styles.connectText}
                  >
                    {isConnected
                      ? "Reconnect"
                      : "Connect"}
                  </Text>
                </Pressable>
              </View>
            );
          }
        )}

        {!loading &&
        normalized &&
        matches.length === 0 ? (
          <View
            style={styles.unsupported}
          >
            <Ionicons
              name="information-circle-outline"
              size={27}
              color="#c4b5fd"
            />

            <Text
              style={styles.unsupportedTitle}
            >
              {query.trim()} is not registered yet
            </Text>

            <Text
              style={styles.unsupportedBody}
            >
              The Universal Social Connector is already installed. This platform only needs a provider definition on the ArtBoost server; the customer flow stays the same and the app does not need another connector screen.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "#0b0b0b",
    },
    header: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      borderBottomWidth: 1,
      borderBottomColor: "#202020",
    },
    backButton: {
      width: 43,
      height: 43,
      borderRadius: 15,
      backgroundColor: "#191919",
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: {
      flex: 1,
      paddingLeft: 13,
    },
    eyebrow: {
      color: "#8b5cf6",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    title: {
      color: "#ffffff",
      fontSize: 21,
      fontWeight: "900",
      marginTop: 3,
    },
    content: {
      padding: 18,
      paddingBottom: 60,
    },
    hero: {
      flexDirection: "row",
      padding: 16,
      borderRadius: 20,
      backgroundColor: "#181324",
      borderWidth: 1,
      borderColor: "#4b3973",
      marginBottom: 15,
    },
    heroIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#8b5cf6",
    },
    heroText: {
      flex: 1,
      paddingLeft: 13,
    },
    heroTitle: {
      color: "#ffffff",
      fontSize: 17,
      fontWeight: "900",
    },
    heroBody: {
      color: "#b5acbf",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    searchWrap: {
      minHeight: 55,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#393939",
      backgroundColor: "#161616",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
    },
    searchInput: {
      flex: 1,
      color: "#ffffff",
      fontSize: 14,
      paddingHorizontal: 10,
    },
    refresh: {
      minHeight: 46,
      marginTop: 10,
      borderRadius: 13,
      backgroundColor: "#2d6cdf",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    refreshText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "900",
    },
    sectionTitle: {
      color: "#ffffff",
      fontSize: 17,
      fontWeight: "900",
      marginTop: 22,
      marginBottom: 11,
    },
    card: {
      minHeight: 116,
      borderRadius: 19,
      backgroundColor: "#181818",
      borderWidth: 1,
      borderColor: "#303030",
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 11,
    },
    platformIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      backgroundColor: "#302248",
      borderWidth: 1,
      borderColor: "#5d438b",
      alignItems: "center",
      justifyContent: "center",
    },
    platformInfo: {
      flex: 1,
      paddingHorizontal: 12,
    },
    platformName: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "900",
    },
    status: {
      color: "#8e8e8e",
      fontSize: 10,
      fontWeight: "800",
      marginTop: 3,
    },
    connected: {
      color: "#34d399",
    },
    description: {
      color: "#9b9b9b",
      fontSize: 11,
      lineHeight: 16,
      marginTop: 6,
    },
    connectButton: {
      minWidth: 82,
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: "#12a86b",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    reconnectButton: {
      backgroundColor: "#2d6cdf",
    },
    connectText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "900",
    },
    unsupported: {
      borderRadius: 18,
      backgroundColor: "#17131f",
      borderWidth: 1,
      borderColor: "#493664",
      padding: 18,
      alignItems: "center",
      marginTop: 5,
    },
    unsupportedTitle: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "900",
      marginTop: 10,
      textAlign: "center",
    },
    unsupportedBody: {
      color: "#a79cad",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
      textAlign: "center",
    },
  });
