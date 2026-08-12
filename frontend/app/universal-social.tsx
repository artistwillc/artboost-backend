import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

type UniversalConnection = {
  id: string;
  platformId: string;
  connected: boolean;
  displayName: string;
  profileUrl: string;
  publishEndpoint: string;
  method: string;
  authType: string;
  authHeader: string;
  hasCredential: boolean;
};

const METHODS = [
  "POST",
  "PUT",
  "PATCH",
] as const;

const AUTH_TYPES = [
  {
    id: "none",
    label: "None",
  },
  {
    id: "bearer",
    label: "Bearer Token",
  },
  {
    id: "api_key",
    label: "API Key",
  },
] as const;

export default function UniversalSocialScreen() {
  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    connections,
    setConnections,
  ] = useState<
    UniversalConnection[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [
    profileUrl,
    setProfileUrl,
  ] = useState("");

  const [
    publishEndpoint,
    setPublishEndpoint,
  ] = useState("");

  const [
    method,
    setMethod,
  ] = useState("POST");

  const [
    authType,
    setAuthType,
  ] = useState("none");

  const [
    credential,
    setCredential,
  ] = useState("");

  const [
    authHeader,
    setAuthHeader,
  ] = useState("X-API-Key");

  const [
    payloadTemplate,
    setPayloadTemplate,
  ] = useState("");

  const loadConnections =
    useCallback(
      async (
        resolvedUserId?: string
      ) => {
        const id =
          resolvedUserId ||
          userId;

        if (!id) {
          return;
        }

        try {
          setLoading(true);

          const response =
            await fetch(
              `${API_BASE}/universal-social/connections?userId=${encodeURIComponent(
                id
              )}`
            );

          const text =
            await response.text();

          let data: any = {};

          try {
            data =
              text
                ? JSON.parse(
                    text
                  )
                : {};
          } catch {}

          if (
            !response.ok ||
            !data?.success
          ) {
            throw new Error(
              data?.error ||
                "Unable to load Universal Social connections."
            );
          }

          setConnections(
            Array.isArray(
              data.connections
            )
              ? data.connections
              : []
          );
        } catch (error: any) {
          Alert.alert(
            "Unable to Load",
            error?.message ||
              "Universal Social connections could not be loaded."
          );
        } finally {
          setLoading(false);
        }
      },
      [userId]
    );

  useEffect(() => {
    let active = true;

    async function initialize() {
      const {
        data,
        error,
      } =
        await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (
        error ||
        !data.user
      ) {
        setLoading(false);

        Alert.alert(
          "Login Required",
          "Please log in before adding a Universal Social publishing destination."
        );

        return;
      }

      const id =
        data.user.id;

      setUserId(id);

      await loadConnections(
        id
      );
    }

    initialize();

    return () => {
      active = false;
    };
  }, [loadConnections]);

  async function saveConnection() {
    if (
      !displayName.trim() ||
      !profileUrl.trim() ||
      !publishEndpoint.trim()
    ) {
      Alert.alert(
        "Missing Information",
        "Enter the platform name, profile URL, and publishing API/webhook URL."
      );

      return;
    }

    if (
      authType !== "none" &&
      !credential.trim()
    ) {
      Alert.alert(
        "Credential Required",
        "Enter the token or API key required by this publishing endpoint."
      );

      return;
    }

    try {
      setSaving(true);

      const response =
        await fetch(
          `${API_BASE}/universal-social/connect`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                userId,
                displayName:
                  displayName.trim(),
                profileUrl:
                  profileUrl.trim(),
                publishEndpoint:
                  publishEndpoint.trim(),
                method,
                authType,
                credential:
                  credential.trim(),
                authHeader:
                  authHeader.trim() ||
                  "X-API-Key",
                payloadTemplate:
                  payloadTemplate.trim() ||
                  null,
              }),
          }
        );

      const text =
        await response.text();

      let data: any = {};

      try {
        data =
          text
            ? JSON.parse(text)
            : {};
      } catch {}

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            "Unable to connect this publishing destination."
        );
      }

      setDisplayName("");
      setProfileUrl("");
      setPublishEndpoint("");
      setMethod("POST");
      setAuthType("none");
      setCredential("");
      setAuthHeader(
        "X-API-Key"
      );
      setPayloadTemplate("");

      await loadConnections();

      Alert.alert(
        "Connected",
        "This destination is now available to Store Automation through Universal Social."
      );
    } catch (error: any) {
      Alert.alert(
        "Connection Failed",
        error?.message ||
          "ArtBoost could not save this publishing destination."
      );
    } finally {
      setSaving(false);
    }
  }

  async function validateConnection(
    connection:
      UniversalConnection
  ) {
    try {
      const response =
        await fetch(
          `${API_BASE}/universal-social/${encodeURIComponent(
            connection.id
          )}/test`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                userId,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            "Validation failed."
        );
      }

      Alert.alert(
        "Configuration Ready",
        data.message ||
          "The publishing destination is configured."
      );
    } catch (error: any) {
      Alert.alert(
        "Validation Failed",
        error?.message ||
          "This publishing destination could not be validated."
      );
    }
  }

  async function removeConnection(
    connection:
      UniversalConnection
  ) {
    Alert.alert(
      "Remove Connection?",
      `Remove ${connection.displayName} from Universal Social?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style:
            "destructive",
          onPress:
            async () => {
              try {
                const response =
                  await fetch(
                    `${API_BASE}/universal-social/${encodeURIComponent(
                      connection.id
                    )}`,
                    {
                      method:
                        "DELETE",
                      headers: {
                        "Content-Type":
                          "application/json",
                      },
                      body:
                        JSON.stringify({
                          userId,
                        }),
                    }
                  );

                const data =
                  await response.json();

                if (
                  !response.ok ||
                  !data?.success
                ) {
                  throw new Error(
                    data?.error ||
                      "Unable to remove connection."
                  );
                }

                await loadConnections();
              } catch (
                error: any
              ) {
                Alert.alert(
                  "Unable to Remove",
                  error?.message ||
                    "The connection could not be removed."
                );
              }
            },
        },
      ]
    );
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
          style={
            styles.headerText
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            UNIVERSAL SOCIAL
          </Text>

          <Text
            style={styles.title}
          >
            Add Publishing Destination
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS ===
          "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={styles.infoCard}
          >
            <Ionicons
              name="git-network-outline"
              size={28}
              color="#c4b5fd"
            />

            <View
              style={
                styles.infoTextWrap
              }
            >
              <Text
                style={
                  styles.infoTitle
                }
              >
                One automation bridge
              </Text>

              <Text
                style={
                  styles.infoText
                }
              >
                Connect any social destination that provides an HTTPS publishing API or webhook. Store Automation can then send the selected listing, image, caption, hashtags, CTA, and product link through this destination automatically.
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Connected Destinations
          </Text>

          {loading ? (
            <View
              style={
                styles.loadingCard
              }
            >
              <ActivityIndicator
                size="small"
                color="#a78bfa"
              />

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading...
              </Text>
            </View>
          ) : connections.length ===
            0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                No Universal Social destinations yet
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Add an HTTPS API or webhook below. It will become available to your store automations.
              </Text>
            </View>
          ) : (
            connections.map(
              (
                connection
              ) => (
                <View
                  key={
                    connection.id
                  }
                  style={
                    styles.connectionCard
                  }
                >
                  <View
                    style={
                      styles.connectionTop
                    }
                  >
                    <View
                      style={
                        styles.connectionIcon
                      }
                    >
                      <Ionicons
                        name="share-social-outline"
                        size={23}
                        color="#ffffff"
                      />
                    </View>

                    <View
                      style={
                        styles.connectionInfo
                      }
                    >
                      <Text
                        style={
                          styles.connectionName
                        }
                      >
                        {
                          connection.displayName
                        }
                      </Text>

                      <Text
                        style={
                          styles.connectionUrl
                        }
                        numberOfLines={
                          1
                        }
                      >
                        {
                          connection.profileUrl
                        }
                      </Text>

                      <Text
                        style={
                          styles.connectionStatus
                        }
                      >
                        Connected • {
                          connection.method
                        }
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.connectionActions
                    }
                  >
                    <Pressable
                      style={
                        styles.secondaryButton
                      }
                      onPress={() =>
                        validateConnection(
                          connection
                        )
                      }
                    >
                      <Text
                        style={
                          styles.secondaryButtonText
                        }
                      >
                        Validate
                      </Text>
                    </Pressable>

                    <Pressable
                      style={
                        styles.removeButton
                      }
                      onPress={() =>
                        removeConnection(
                          connection
                        )
                      }
                    >
                      <Text
                        style={
                          styles.removeButtonText
                        }
                      >
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )
            )
          )}

          <Text
            style={
              styles.sectionTitle
            }
          >
            Add Destination
          </Text>

          <View
            style={styles.formCard}
          >
            <Field
              label="Platform / Destination Name"
              value={displayName}
              onChangeText={
                setDisplayName
              }
              placeholder="Bluesky, Mastodon, Make, Zapier..."
            />

            <Field
              label="Social Profile URL"
              value={profileUrl}
              onChangeText={
                setProfileUrl
              }
              placeholder="https://..."
              autoCapitalize="none"
            />

            <Field
              label="Publishing API / Webhook URL"
              value={
                publishEndpoint
              }
              onChangeText={
                setPublishEndpoint
              }
              placeholder="https://..."
              autoCapitalize="none"
            />

            <Text
              style={
                styles.fieldLabel
              }
            >
              HTTP Method
            </Text>

            <View
              style={styles.choiceRow}
            >
              {METHODS.map(
                (value) => (
                  <Choice
                    key={value}
                    label={value}
                    selected={
                      method ===
                      value
                    }
                    onPress={() =>
                      setMethod(
                        value
                      )
                    }
                  />
                )
              )}
            </View>

            <Text
              style={
                styles.fieldLabel
              }
            >
              Authentication
            </Text>

            <View
              style={
                styles.choiceWrap
              }
            >
              {AUTH_TYPES.map(
                (value) => (
                  <Choice
                    key={
                      value.id
                    }
                    label={
                      value.label
                    }
                    selected={
                      authType ===
                      value.id
                    }
                    onPress={() =>
                      setAuthType(
                        value.id
                      )
                    }
                  />
                )
              )}
            </View>

            {authType !==
            "none" ? (
              <Field
                label={
                  authType ===
                  "bearer"
                    ? "Bearer Token"
                    : "API Key"
                }
                value={
                  credential
                }
                onChangeText={
                  setCredential
                }
                placeholder="Credential"
                autoCapitalize="none"
                secureTextEntry
              />
            ) : null}

            {authType ===
            "api_key" ? (
              <Field
                label="API Key Header"
                value={
                  authHeader
                }
                onChangeText={
                  setAuthHeader
                }
                placeholder="X-API-Key"
                autoCapitalize="none"
              />
            ) : null}

            <Text
              style={
                styles.fieldLabel
              }
            >
              Advanced JSON Payload Template (optional)
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
              ]}
              value={
                payloadTemplate
              }
              onChangeText={
                setPayloadTemplate
              }
              multiline
              placeholder={
                '{"text":"{{text}}","image":"{{imageUrl}}","url":"{{productLink}}"}'
              }
              placeholderTextColor="#666666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text
              style={
                styles.templateHelp
              }
            >
              Available variables: {"{{text}}"}, {"{{title}}"}, {"{{description}}"}, {"{{hashtags}}"}, {"{{cta}}"}, {"{{productLink}}"}, {"{{imageUrl}}"}, {"{{profileUrl}}"}, {"{{platformName}}"}.
            </Text>

            <Pressable
              style={[
                styles.saveButton,
                saving &&
                  styles.disabledButton,
              ]}
              onPress={
                saveConnection
              }
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name="add-circle-outline"
                  size={21}
                  color="#ffffff"
                />
              )}

              <Text
                style={
                  styles.saveButtonText
                }
              >
                {saving
                  ? "Connecting..."
                  : "Connect Destination"}
              </Text>
            </Pressable>
          </View>

          <View
            style={
              styles.launchNote
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color="#86efac"
            />

            <Text
              style={
                styles.launchNoteText
              }
            >
              ArtBoost validates HTTPS endpoints and blocks private-network destinations. Credentials are stored in the existing social connection credential field and are never returned to the mobile app.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...props
}: any) {
  return (
    <View
      style={
        styles.fieldWrap
      }
    >
      <Text
        style={
          styles.fieldLabel
        }
      >
        {label}
      </Text>

      <TextInput
        style={styles.input}
        placeholderTextColor="#666666"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.choice,
        selected &&
          styles.choiceSelected,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.choiceText,
          selected &&
            styles.choiceTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#0b0b0b",
    },

    header: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      borderBottomWidth: 1,
      borderBottomColor:
        "#1f1f1f",
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor:
        "#171717",
      alignItems: "center",
      justifyContent:
        "center",
    },

    headerText: {
      paddingLeft: 13,
      flex: 1,
    },

    eyebrow: {
      color: "#8b5cf6",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
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

    infoCard: {
      flexDirection: "row",
      borderRadius: 20,
      backgroundColor:
        "#181324",
      borderWidth: 1,
      borderColor:
        "#4b3973",
      padding: 16,
      marginBottom: 24,
    },

    infoTextWrap: {
      flex: 1,
      paddingLeft: 13,
    },

    infoTitle: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 16,
    },

    infoText: {
      color: "#b9afc7",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    sectionTitle: {
      color: "#ffffff",
      fontSize: 17,
      fontWeight: "900",
      marginBottom: 11,
      marginTop: 8,
    },

    loadingCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 18,
      backgroundColor:
        "#171717",
      padding: 17,
      marginBottom: 22,
    },

    loadingText: {
      color: "#aaaaaa",
      paddingLeft: 10,
    },

    emptyCard: {
      borderRadius: 18,
      backgroundColor:
        "#171717",
      borderWidth: 1,
      borderColor:
        "#292929",
      padding: 17,
      marginBottom: 22,
    },

    emptyTitle: {
      color: "#ffffff",
      fontWeight: "900",
    },

    emptyText: {
      color: "#999999",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    connectionCard: {
      borderRadius: 19,
      backgroundColor:
        "#171717",
      borderWidth: 1,
      borderColor:
        "#302641",
      padding: 15,
      marginBottom: 12,
    },

    connectionTop: {
      flexDirection: "row",
      alignItems: "center",
    },

    connectionIcon: {
      width: 46,
      height: 46,
      borderRadius: 15,
      backgroundColor:
        "#6d4ab4",
      alignItems: "center",
      justifyContent:
        "center",
    },

    connectionInfo: {
      flex: 1,
      paddingLeft: 12,
    },

    connectionName: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 15,
    },

    connectionUrl: {
      color: "#9d8bb9",
      fontSize: 11,
      marginTop: 3,
    },

    connectionStatus: {
      color: "#86efac",
      fontSize: 11,
      fontWeight: "800",
      marginTop: 5,
    },

    connectionActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 13,
    },

    secondaryButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: 12,
      backgroundColor:
        "#2b2145",
      alignItems: "center",
      justifyContent:
        "center",
    },

    secondaryButtonText: {
      color: "#c4b5fd",
      fontWeight: "900",
    },

    removeButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#63333b",
      alignItems: "center",
      justifyContent:
        "center",
    },

    removeButtonText: {
      color: "#fca5a5",
      fontWeight: "900",
    },

    formCard: {
      borderRadius: 20,
      backgroundColor:
        "#151515",
      borderWidth: 1,
      borderColor:
        "#292929",
      padding: 16,
    },

    fieldWrap: {
      marginBottom: 14,
    },

    fieldLabel: {
      color: "#d9d9d9",
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 7,
    },

    input: {
      minHeight: 48,
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        "#343434",
      backgroundColor:
        "#0f0f0f",
      color: "#ffffff",
      paddingHorizontal: 13,
      fontSize: 13,
    },

    multilineInput: {
      minHeight: 115,
      textAlignVertical:
        "top",
      paddingTop: 12,
    },

    choiceRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 15,
    },

    choiceWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 15,
    },

    choice: {
      minHeight: 38,
      paddingHorizontal: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#333333",
      alignItems: "center",
      justifyContent:
        "center",
    },

    choiceSelected: {
      backgroundColor:
        "#6d4ab4",
      borderColor:
        "#8b5cf6",
    },

    choiceText: {
      color: "#9a9a9a",
      fontWeight: "800",
      fontSize: 12,
    },

    choiceTextSelected: {
      color: "#ffffff",
    },

    templateHelp: {
      color: "#777777",
      fontSize: 10,
      lineHeight: 15,
      marginTop: 7,
      marginBottom: 15,
    },

    saveButton: {
      minHeight: 52,
      borderRadius: 15,
      backgroundColor:
        "#8b5cf6",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 8,
    },

    saveButtonText: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 14,
    },

    disabledButton: {
      opacity: 0.55,
    },

    launchNote: {
      flexDirection: "row",
      borderRadius: 16,
      backgroundColor:
        "#101a13",
      borderWidth: 1,
      borderColor:
        "#254a30",
      padding: 14,
      marginTop: 18,
    },

    launchNoteText: {
      flex: 1,
      paddingLeft: 10,
      color: "#a7c9af",
      fontSize: 11,
      lineHeight: 17,
    },
  });
