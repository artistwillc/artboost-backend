import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";

const API_BASE =
  "https://artboost-ai.onrender.com";

type Automation = {
  id: string;
  user_id?: string;
  store_id?: string;
  store_name?: string;
  store_type?: string;
  automation_name?: string;
  enabled?: boolean;
  frequency?: string;
  posting_time?: string;
  timezone?: string;
  platforms?: string[];
  selection_mode?: string;
  repeat_delay_days?: number;
  next_run_at?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

function formatPlatformName(
  value?: string
) {
  const cleanValue = String(
    value || ""
  )
    .trim()
    .toLowerCase();

  if (cleanValue === "shopify") {
    return "Shopify";
  }

  if (cleanValue === "etsy") {
    return "Etsy";
  }

  if (cleanValue === "ebay") {
    return "eBay";
  }

  if (cleanValue === "redbubble") {
    return "Redbubble";
  }

  if (
    cleanValue ===
      "fine_art_america" ||
    cleanValue ===
      "fine-art-america" ||
    cleanValue ===
      "fineartamerica"
  ) {
    return "Fine Art America";
  }

  if (cleanValue === "artpal") {
    return "ArtPal";
  }

  if (cleanValue === "gumroad") {
    return "Gumroad";
  }

  if (!cleanValue) {
    return "Store";
  }

  return cleanValue
    .split(/[_\-\s]+/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatFrequency(
  value?: string
) {
  const frequency = String(
    value || ""
  ).toLowerCase();

  if (frequency === "daily") {
    return "Every Day";
  }

  if (frequency === "weekdays") {
    return "Weekdays";
  }

  if (frequency === "weekly") {
    return "Weekly";
  }

  if (frequency === "once") {
    return "One Time";
  }

  return frequency
    ? formatPlatformName(frequency)
    : "Not Set";
}

function formatPostingTime(
  value?: string
) {
  const rawValue = String(
    value || ""
  );

  const match = rawValue.match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) {
    return "Not Set";
  }

  const hour = Number(match[1]);
  const minute = match[2];

  if (
    Number.isNaN(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return rawValue;
  }

  const displayHour =
    hour === 0
      ? 12
      : hour > 12
        ? hour - 12
        : hour;

  const suffix =
    hour >= 12 ? "PM" : "AM";

  return `${displayHour}:${minute} ${suffix}`;
}

function formatDateTime(
  value?: string | null
) {
  if (!value) {
    return "Not calculated yet";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Not available";
  }

  return date.toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function formatPlatforms(
  platforms?: string[]
) {
  if (
    !Array.isArray(platforms) ||
    platforms.length === 0
  ) {
    return "No platforms selected";
  }

  return platforms
    .map(formatPlatformName)
    .join(" • ");
}

export default function ScheduleScreen() {
  const params =
    useLocalSearchParams<{
      storeId?: string;
      storeName?: string;
      storeType?: string;
    }>();

  const storeId = String(
    params.storeId || ""
  );

  const routeStoreName = String(
    params.storeName ||
      "Connected Store"
  );

  const storeType = String(
    params.storeType || "store"
  );

  const platformLabel =
    useMemo(
      () =>
        formatPlatformName(
          storeType
        ),
      [storeType]
    );

  const displayStoreName =
    useMemo(() => {
      if (
        routeStoreName
          .toLowerCase()
          .includes(
            "myshopify.com"
          )
      ) {
        return platformLabel;
      }

      return routeStoreName;
    }, [
      routeStoreName,
      platformLabel,
    ]);

  const [
    automations,
    setAutomations,
  ] = useState<Automation[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [
    runningAutomationId,
    setRunningAutomationId,
  ] = useState("");

  const [
    disablingAutomationId,
    setDisablingAutomationId,
  ] = useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

    const [deleteMode, setDeleteMode] =
  useState(false);

const [
  selectedAutomationIds,
  setSelectedAutomationIds,
] = useState<string[]>([]);

function toggleSelected(
  automationId: string
) {
  setSelectedAutomationIds(
    (currentIds) => {
      if (
        currentIds.includes(
          automationId
        )
      ) {
        return currentIds.filter(
          (id) =>
            id !== automationId
        );
      }

      return [
        ...currentIds,
        automationId,
      ];
    }
  );
}

  const loadAutomations =
    useCallback(
      async (
        showRefreshIndicator = false
      ) => {
        try {
          if (
            showRefreshIndicator
          ) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setErrorMessage("");

          const {
            data: { user },
            error: userError,
          } =
            await supabase.auth.getUser();

          if (userError) {
            throw new Error(
              userError.message
            );
          }

          if (!user) {
            throw new Error(
              "You must be signed in to view scheduled posts."
            );
          }

          const response =
            await fetch(
              `${API_BASE}/automations?userId=${encodeURIComponent(
                user.id
              )}`
            );

          const responseText =
            await response.text();

          let data: any;

          try {
            data =
              JSON.parse(
                responseText
              );
          } catch {
            throw new Error(
              `Backend returned ${response.status}: ${responseText.slice(
                0,
                160
              )}`
            );
          }

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.details ||
                data.error ||
                "Unable to load scheduled posts."
            );
          }

          const loadedAutomations =
            Array.isArray(
              data.automations
            )
              ? data.automations
              : [];

          const filteredAutomations =
            storeId
              ? loadedAutomations.filter(
                  (
                    automation: Automation
                  ) =>
                    String(
                      automation.store_id ||
                        ""
                    ) === storeId
                )
              : loadedAutomations;

          setAutomations(
            filteredAutomations
          );
        } catch (error: any) {
          console.log(
            "Scheduled posts load failed:",
            error
          );

          setAutomations([]);

          setErrorMessage(
            error?.message ||
              "ArtBoost could not load scheduled posts."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [storeId]
    );

  useFocusEffect(
    useCallback(() => {
      loadAutomations();
    }, [loadAutomations])
  );

  function openAutomation(
    automation: Automation
  ) {
    router.push({
      pathname:
        "/store-automation" as any,
      params: {
        storeId:
          automation.store_id ||
          storeId,
        storeName:
          automation.store_name ||
          routeStoreName,
        storeType:
          automation.store_type ||
          storeType,
      },
    });
  }

  async function runAutomationNow(
    automation: Automation
  ) {
    if (!automation.id) {
      Alert.alert(
        "Missing Automation",
        "This automation does not have a valid ID."
      );

      return;
    }

    try {
      setRunningAutomationId(
        automation.id
      );

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          userError.message
        );
      }

      if (!user) {
        throw new Error(
          "You must be signed in."
        );
      }

      const response =
        await fetch(
          `${API_BASE}/automations/${encodeURIComponent(
            automation.id
          )}/run`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
            }),
          }
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
            160
          )}`
        );
      }

      // ARTBOOST_LAUNCH_FIXES_V1_20260821_PARTIAL_SUCCESS
      const runSucceeded =
        response.ok &&
        (data.success || data.partialSuccess);

      if (!runSucceeded) {
        throw new Error(
          data.details ||
            data.error ||
            "Unable to run automation."
        );
      }

      if (data.partialSuccess) {
        const publishResult = data.publishResult || {};
        const results = Array.isArray(publishResult.results)
          ? publishResult.results
          : [];
        const failedPlatforms = results
          .filter((item: any) => !item?.success)
          .map((item: any) => String(item?.platform || "platform"))
          .filter(Boolean);
        const successfulCount = Number(publishResult.successful) ||
          results.filter((item: any) => item?.success).length;
        const totalCount = Number(publishResult.total) || results.length;

        Alert.alert(
          "Posted with a Warning",
          failedPlatforms.length > 0
            ? `ArtBoost posted to ${successfulCount} of ${totalCount || successfulCount + failedPlatforms.length} platforms. Failed: ${failedPlatforms.join(", ")}.`
            : "ArtBoost posted successfully to at least one platform, but another selected platform did not complete."
        );
      } else {
        Alert.alert(
          "Post Successful",
          "ArtBoost posted the next eligible product."
        );
      }

      await loadAutomations(
        true
      );
    } catch (error: any) {
      console.log(
        "Scheduled automation run failed:",
        error
      );

      Alert.alert(
        "Post Failed",
        error?.message ||
          "ArtBoost could not run this automation."
      );
    } finally {
      setRunningAutomationId(
        ""
      );
    }
  }

  async function disableAutomation(
    automation: Automation
  ) {
    if (!automation.id) {
      return;
    }

    try {
      setDisablingAutomationId(
        automation.id
      );

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          userError.message
        );
      }

      if (!user) {
        throw new Error(
          "You must be signed in."
        );
      }

      const response =
        await fetch(
          `${API_BASE}/automations/${encodeURIComponent(
            automation.id
          )}/disable`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              reason:
                "Disabled from Scheduled Posts screen.",
            }),
          }
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
            160
          )}`
        );
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            "Unable to disable automation."
        );
      }

      Alert.alert(
        "Automation Disabled",
        "This automation will no longer post automatically."
      );

      await loadAutomations(
        true
      );
    } catch (error: any) {
      console.log(
        "Automation disable failed:",
        error
      );

      Alert.alert(
        "Disable Failed",
        error?.message ||
          "ArtBoost could not disable this automation."
      );
    } finally {
      setDisablingAutomationId(
        ""
      );
    }
  }

  function confirmDeleteSelected() {
  Alert.alert(
    "Delete Scheduled Posts?",
    `Delete ${selectedAutomationIds.length} scheduled post(s)?`,
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteSelectedAutomations(),
      },
    ]
  );
}

async function deleteAllAutomations() {
  try {
    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError) {
      throw new Error(
        userError.message
      );
    }

    if (!user) {
      throw new Error(
        "You must be signed in."
      );
    }

    const response =
      await fetch(
        `${API_BASE}/automations/bulk-delete`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            automationIds: [],
            deleteAll: true,
            storeId,
          }),
        }
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
          160
        )}`
      );
    }

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.details ||
          data.error ||
          "Unable to delete scheduled posts."
      );
    }

    setDeleteMode(false);
    setSelectedAutomationIds([]);

    await loadAutomations(true);

    Alert.alert(
      "Deleted",
      `${data.deletedCount || 0} scheduled post(s) deleted.`
    );
  } catch (error: any) {
    Alert.alert(
      "Delete Failed",
      error?.message ||
        "Unable to delete scheduled posts."
    );
  }
}

async function deleteSelectedAutomations() {
  try {
    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const response =
      await fetch(
        `${API_BASE}/automations/bulk-delete`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            automationIds:
              selectedAutomationIds,
            deleteAll: false,
            storeId,
          }),
        }
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
      160
    )}`
  );
}

if (
  !response.ok ||
  !data.success
) {
  throw new Error(
    data.details ||
      data.error ||
      "Unable to delete scheduled posts."
  );
}

    setDeleteMode(false);

    setSelectedAutomationIds(
      []
    );

    await loadAutomations(
      true
    );

    Alert.alert(
      "Success",
      "Scheduled post(s) deleted."
    );
  } catch (error: any) {
    Alert.alert(
      "Delete Failed",
      error?.message ||
        "Unable to delete scheduled posts."
    );
  }
}

    function confirmDisable(
    automation: Automation
  ) {
    Alert.alert(
      "Disable Automation?",
      "Scheduled posting will stop until you enable this automation again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disable",
          style: "destructive",
          onPress: () =>
            disableAutomation(
              automation
            ),
        },
      ]
    );
  }

    return (
    <SafeAreaView
  style={styles.screen}
  edges={["top"]}
>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
  router.replace({
    pathname:
      "/store-dashboard" as any,
    params: {
      storeId,
      storeName:
        routeStoreName,
      storeType,
    },
  })
}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
  <Text style={styles.eyebrow}>
    STORE MARKETING
  </Text>

  <Text style={styles.headerTitle}>
    Scheduled Posts
  </Text>
</View>

<Pressable
  style={styles.refreshButton}
  onPress={() => {
  if (!deleteMode) {
    setDeleteMode(true);
    return;
  }

  if (
    selectedAutomationIds.length ===
    0
  ) {
    setDeleteMode(false);
    return;
  }

  confirmDeleteSelected();
}}
>
  <Ionicons
    name="trash-outline"
    size={22}
    color="#fca5a5"
  />
</Pressable>

<Pressable
  style={styles.refreshButton}
  onPress={() =>
    loadAutomations(true)
  }
  disabled={refreshing}
>
  <Ionicons
    name="refresh"
    size={22}
    color="#c4b5fd"
  />
</Pressable>
          
      </View>

      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() =>
              loadAutomations(true)
            }
            tintColor="#a78bfa"
          />
        }
      >
        <View style={styles.storeCard}>
          <View style={styles.storeIconWrap}>
            <Ionicons
              name="storefront-outline"
              size={31}
              color="#c4b5fd"
            />
          </View>

          <View style={styles.storeInfo}>
            <Text style={styles.platformText}>
              {platformLabel}
            </Text>

            <Text
              style={styles.storeNameText}
              numberOfLines={2}
            >
              {displayStoreName}
            </Text>

            <Text style={styles.storeDescription}>
              Review and manage scheduled store promotions.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator
              size="large"
              color="#a78bfa"
            />

            <Text style={styles.stateTitle}>
              Loading Scheduled Posts
            </Text>

            <Text style={styles.stateText}>
              ArtBoost is retrieving your store automations.
            </Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color="#fca5a5"
            />

            <Text style={styles.errorTitle}>
              Unable to Load
            </Text>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>

            <Pressable
              style={styles.retryButton}
              onPress={() =>
                loadAutomations()
              }
            >
              <Ionicons
                name="refresh"
                size={19}
                color="#ffffff"
              />

              <Text style={styles.retryButtonText}>
                Try Again
              </Text>
            </Pressable>
          </View>
        ) : automations.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons
                name="calendar-outline"
                size={40}
                color="#a78bfa"
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Scheduled Posts
            </Text>

            <Text style={styles.emptyText}>
              Create and save a store automation to begin scheduling product promotions.
            </Text>

            <Pressable
              style={styles.createButton}
              onPress={() =>
                router.push({
                  pathname:
                    "/store-automation" as any,
                  params: {
                    storeId,
                    storeName:
                      routeStoreName,
                    storeType,
                  },
                })
              }
            >
              <Ionicons
                name="add-circle-outline"
                size={21}
                color="#ffffff"
              />

              <Text style={styles.createButtonText}>
                Create Automation
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>
                  {automations.length}
                </Text>

                <Text style={styles.summaryLabel}>
                  Automations
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryNumber}>
                  {
                    automations.filter(
                      (item) =>
                        Boolean(
                          item.enabled
                        )
                    ).length
                  }
                </Text>

                <Text style={styles.summaryLabel}>
                  Active
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>
              Store Automations
            </Text>

            {deleteMode && (
  <View style={styles.deleteActionsRow}>
    <Pressable
      style={styles.deleteAllButton}
      onPress={() => {
        Alert.alert(
          "Delete All Scheduled Posts?",
          `This will permanently delete all ${automations.length} scheduled post(s) shown for this store.`,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Delete All",
              style: "destructive",
              onPress: () =>
                deleteAllAutomations(),
            },
          ]
        );
      }}
    >
      <Ionicons
        name="trash"
        size={19}
        color="#ffffff"
      />

      <Text style={styles.deleteAllButtonText}>
        Delete All
      </Text>
    </Pressable>

    <Pressable
      style={styles.cancelDeleteButton}
      onPress={() => {
        setDeleteMode(false);
        setSelectedAutomationIds([]);
      }}
    >
      <Text style={styles.cancelDeleteButtonText}>
        Cancel
      </Text>
    </Pressable>
  </View>
)}

            {automations.map(
              (automation) => {
                const isRunning =
                  runningAutomationId ===
                  automation.id;

                const isDisabling =
                  disablingAutomationId ===
                  automation.id;

                const automationStoreName =
                  automation.store_name ||
                  routeStoreName;

                const automationStoreType =
                  automation.store_type ||
                  storeType;

                const automationPlatformLabel =
                  formatPlatformName(
                    automationStoreType
                  );

                const automationDisplayStoreName =
                  automationStoreName
                    .toLowerCase()
                    .includes(
                      "myshopify.com"
                    )
                    ? automationPlatformLabel
                    : automationStoreName;

                return (
                  <View
                    key={automation.id}
                    style={styles.automationCard}
                  >
                    {deleteMode && (
  <Pressable
    onPress={() =>
      toggleSelected(
        automation.id
      )
    }
    style={{
      alignSelf: "flex-end",
      marginBottom: 10,
    }}
  >
    <Ionicons
      name={
        selectedAutomationIds.includes(
          automation.id
        )
          ? "checkbox"
          : "square-outline"
      }
      size={28}
      color="#f87171"
    />
  </Pressable>
)}
                    <View
                      style={
                        styles.automationHeader
                      }
                    >
                      <View
                        style={[
                          styles.automationIconWrap,
                          automation.enabled
                            ? styles.automationIconActive
                            : styles.automationIconInactive,
                        ]}
                      >
                        <Ionicons
                          name="flash"
                          size={23}
                          color={
                            automation.enabled
                              ? "#ffffff"
                              : "#777777"
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.automationHeading
                        }
                      >
                        <Text
                          style={
                            styles.automationName
                          }
                          numberOfLines={1}
                        >
                          {automation.automation_name ||
                            "Store Automation"}
                        </Text>

                        <Text
                          style={
                            styles.automationStore
                          }
                          numberOfLines={1}
                        >
                          {
                            automationDisplayStoreName
                          }
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusPill,
                          automation.enabled
                            ? styles.statusPillActive
                            : styles.statusPillInactive,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            automation.enabled
                              ? styles.statusDotActive
                              : styles.statusDotInactive,
                          ]}
                        />

                        <Text
                          style={[
                            styles.statusText,
                            automation.enabled
                              ? styles.statusTextActive
                              : styles.statusTextInactive,
                          ]}
                        >
                          {automation.enabled
                            ? "Active"
                            : "Paused"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.automationDivider
                      }
                    />

                    <View style={styles.detailRow}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="repeat-outline"
                          size={19}
                          color="#a78bfa"
                        />
                      </View>

                      <View style={styles.detailTextWrap}>
                        <Text style={styles.detailLabel}>
                          Frequency
                        </Text>

                        <Text style={styles.detailValue}>
                          {formatFrequency(
                            automation.frequency
                          )}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="time-outline"
                          size={19}
                          color="#a78bfa"
                        />
                      </View>

                      <View style={styles.detailTextWrap}>
                        <Text style={styles.detailLabel}>
                          Posting Time
                        </Text>

                        <Text style={styles.detailValue}>
                          {formatPostingTime(
                            automation.posting_time
                          )}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="calendar-outline"
                          size={19}
                          color="#a78bfa"
                        />
                      </View>

                      <View style={styles.detailTextWrap}>
                        <Text style={styles.detailLabel}>
                          Next Run
                        </Text>

                        <Text style={styles.detailValue}>
                          {formatDateTime(
                            automation.next_run_at
                          )}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIcon}>
                        <Ionicons
                          name="share-social-outline"
                          size={19}
                          color="#a78bfa"
                        />
                      </View>

                      <View style={styles.detailTextWrap}>
                        <Text style={styles.detailLabel}>
                          Platforms
                        </Text>

                        <Text
                          style={styles.detailValue}
                          numberOfLines={2}
                        >
                          {formatPlatforms(
                            automation.platforms
                          )}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.actionButtonsRow
                      }
                    >
                      <Pressable
                        style={
                          styles.secondaryActionButton
                        }
                        onPress={() =>
                          openAutomation(
                            automation
                          )
                        }
                      >
                        <Ionicons
                          name="create-outline"
                          size={19}
                          color="#c4b5fd"
                        />

                        <Text
                          style={
                            styles.secondaryActionText
                          }
                        >
                          Open
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.runButton,
                          isRunning &&
                            styles.disabledButton,
                        ]}
                        onPress={() =>
                          runAutomationNow(
                            automation
                          )
                        }
                        disabled={
                          isRunning ||
                          isDisabling
                        }
                      >
                        {isRunning ? (
                          <ActivityIndicator
                            size="small"
                            color="#ffffff"
                          />
                        ) : (
                          <Ionicons
                            name="send"
                            size={18}
                            color="#ffffff"
                          />
                        )}

                        <Text
                          style={
                            styles.runButtonText
                          }
                        >
                          {isRunning
                            ? "Posting"
                            : "Run Now"}
                        </Text>
                      </Pressable>
                    </View>

                    {automation.enabled ? (
                      <Pressable
                        style={[
                          styles.disableButton,
                          isDisabling &&
                            styles.disabledButton,
                        ]}
                        onPress={() =>
                          confirmDisable(
                            automation
                          )
                        }
                        disabled={
                          isRunning ||
                          isDisabling
                        }
                      >
                        {isDisabling ? (
                          <ActivityIndicator
                            size="small"
                            color="#fca5a5"
                          />
                        ) : (
                          <Ionicons
                            name="pause-circle-outline"
                            size={19}
                            color="#fca5a5"
                          />
                        )}

                        <Text
                          style={
                            styles.disableButtonText
                          }
                        >
                          {isDisabling
                            ? "Disabling..."
                            : "Disable Automation"}
                        </Text>
                      </Pressable>
                    ) : (
                      <View
                        style={
                          styles.pausedNotice
                        }
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={19}
                          color="#a78bfa"
                        />

                        <Text
                          style={
                            styles.pausedNoticeText
                          }
                        >
                          Open this automation to enable scheduled posting again.
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b0b0b",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1d1d1d",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },

  eyebrow: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 3,
  },

  refreshButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    borderRadius: 15,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  storeCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 17,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  storeIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  storeInfo: {
    flex: 1,
    paddingLeft: 14,
  },

  platformText: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  storeNameText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    marginTop: 3,
  },

  storeDescription: {
    color: "#858585",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },

  stateCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 28,
    alignItems: "center",
  },

  stateTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 18,
  },

  stateText: {
    color: "#8b8b8b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },

  errorCard: {
    borderRadius: 22,
    backgroundColor: "#211717",
    borderWidth: 1,
    borderColor: "#553030",
    padding: 24,
    alignItems: "center",
  },

  errorTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 14,
  },

  errorText: {
    color: "#fca5a5",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },

  retryButton: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  emptyCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    padding: 26,
    alignItems: "center",
  },

  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 18,
  },

  emptyText: {
    color: "#8b8b8b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },

  createButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  createButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },

  summaryCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 19,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryNumber: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "900",
  },

  summaryLabel: {
    color: "#8b8b8b",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
  },

  automationCard: {
    borderRadius: 22,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 17,
    marginBottom: 16,
  },

  automationHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  automationIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  automationIconActive: {
    backgroundColor: "#8b5cf6",
  },

  automationIconInactive: {
    backgroundColor: "#292929",
  },

  automationHeading: {
    flex: 1,
    paddingHorizontal: 12,
  },

  automationName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  automationStore: {
    color: "#9d93aa",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  statusPill: {
    minHeight: 30,
    borderRadius: 99,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusPillActive: {
    backgroundColor: "#153425",
  },

  statusPillInactive: {
    backgroundColor: "#2b2b2b",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },

  statusDotActive: {
    backgroundColor: "#4ade80",
  },

  statusDotInactive: {
    backgroundColor: "#777777",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "900",
  },

  statusTextActive: {
    color: "#86efac",
  },

  statusTextInactive: {
    color: "#aaaaaa",
  },

  automationDivider: {
    height: 1,
    backgroundColor: "#2b2b2b",
    marginVertical: 16,
  },

  detailRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
  },

  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  detailTextWrap: {
    flex: 1,
    paddingLeft: 12,
  },

  detailLabel: {
    color: "#7f7f7f",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  detailValue: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },

  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  secondaryActionButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  secondaryActionText: {
    color: "#c4b5fd",
    fontSize: 13,
    fontWeight: "900",
  },

  runButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  runButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  disableButton: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 15,
    backgroundColor: "#2a1c1f",
    borderWidth: 1,
    borderColor: "#56343a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  disableButtonText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "900",
  },

  pausedNotice: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 15,
    backgroundColor: "#211b2f",
    borderWidth: 1,
    borderColor: "#3c2d63",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  pausedNoticeText: {
    flex: 1,
    color: "#b9afc7",
    fontSize: 11,
    lineHeight: 16,
  },

  deleteActionsRow: {
  flexDirection: "row",
  gap: 10,
  marginBottom: 16,
},

deleteAllButton: {
  flex: 1,
  minHeight: 48,
  borderRadius: 15,
  backgroundColor: "#b91c1c",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
},

deleteAllButtonText: {
  color: "#ffffff",
  fontSize: 13,
  fontWeight: "900",
},

cancelDeleteButton: {
  minWidth: 100,
  minHeight: 48,
  borderRadius: 15,
  backgroundColor: "#292929",
  borderWidth: 1,
  borderColor: "#444444",
  alignItems: "center",
  justifyContent: "center",
},

cancelDeleteButtonText: {
  color: "#ffffff",
  fontSize: 13,
  fontWeight: "900",
},

  disabledButton: {
    opacity: 0.6,
  },
});