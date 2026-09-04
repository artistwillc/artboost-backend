// ARTBOOST_NOTIFICATION_SETTINGS_V3154
// ARTBOOST_VISUAL_PARITY_V3153
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
} from "react-native";
import { supabase } from "../../lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type NotificationItem = {
  id: string;
  type:
    | "success"
    | "warning"
    | "error"
    | "info";
  title: string;
  message: string;
  unread: boolean;
  created_at?: string;
};


type NotificationPreferenceKey =
  | "post_published" | "post_failed" | "post_needs_attention"
  | "upcoming_scheduled_post" | "video_ready" | "video_failed"
  | "automation_completed" | "automation_failed" | "automation_paused"
  | "store_sync_completed" | "store_sync_failed" | "new_listings_found"
  | "account_connection_issue" | "usage_credit_warning" | "credits_exhausted"
  | "subscription_billing" | "security_alerts" | "ai_consultant_alerts";

type NotificationPreferences = {
  master_enabled: boolean;
} & Record<NotificationPreferenceKey, boolean>;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  master_enabled: true,
  post_published: true, post_failed: true, post_needs_attention: true,
  upcoming_scheduled_post: true, video_ready: true, video_failed: true,
  automation_completed: true, automation_failed: true, automation_paused: true,
  store_sync_completed: true, store_sync_failed: true, new_listings_found: true,
  account_connection_issue: true, usage_credit_warning: true, credits_exhausted: true,
  subscription_billing: true, security_alerts: true, ai_consultant_alerts: true,
};

const NOTIFICATION_PREFERENCE_GROUPS: Array<{title:string; items:Array<{key:NotificationPreferenceKey; label:string}>}> = [
  { title: "Publishing", items: [
    {key:"post_published",label:"Post Published"}, {key:"post_failed",label:"Post Failed"},
    {key:"post_needs_attention",label:"Post Needs Attention"}, {key:"upcoming_scheduled_post",label:"Upcoming Scheduled Post"},
  ]},
  { title: "Video Studio", items: [{key:"video_ready",label:"Video Ready"},{key:"video_failed",label:"Video Failed"}]},
  { title: "Automations", items: [
    {key:"automation_completed",label:"Automation Completed"},{key:"automation_failed",label:"Automation Failed"},
    {key:"automation_paused",label:"Automation Paused"},
  ]},
  { title: "Stores & Connections", items: [
    {key:"store_sync_completed",label:"Store Sync Completed"},{key:"store_sync_failed",label:"Store Sync Failed"},
    {key:"new_listings_found",label:"New Listings Found"},{key:"account_connection_issue",label:"Account Connection Issue"},
  ]},
  { title: "Usage & Account", items: [
    {key:"usage_credit_warning",label:"Usage / Credit Warning"},{key:"credits_exhausted",label:"Credits Exhausted"},
    {key:"subscription_billing",label:"Subscription / Billing"},{key:"security_alerts",label:"Security Alerts"},
    {key:"ai_consultant_alerts",label:"AI Consultant Alerts"},
  ]},
];

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Success", value: "success" },
  { label: "Warnings", value: "warning" },
  { label: "Errors", value: "error" },
];

async function getNotificationAuthHeaders(
  extra: Record<string, string> = {}
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sign in to manage notifications.");
  }

  return {
    ...extra,
    Authorization: `Bearer ${session.access_token}`,
  };
}

export default function NotificationsScreen() {
  const [
    notifications,
    setNotifications,
  ] = useState<NotificationItem[]>([]);


  const [userId, setUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [savingPreferences, setSavingPreferences] = useState(false);


  const [loading, setLoading] =
    useState(true);

  const [
    activeFilter,
    setActiveFilter,
  ] = useState("all");

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(null);

  const [
    clearingAll,
    setClearingAll,
  ] = useState(false);

  const [
    markingAllRead,
    setMarkingAllRead,
  ] = useState(false);

  useEffect(() => {
    initializeNotifications();
  }, []);

  async function initializeNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      Alert.alert("Sign In Required", "Sign in to view and manage your notifications.");
      return;
    }
    setUserId(user.id);
    const saved = user.user_metadata?.notification_preferences || {};
    setPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...saved,
      security_alerts: true,
    });
    await loadNotifications(user.id);
  }

  async function savePreferences(next: NotificationPreferences) {
    const previous = preferences;
    const normalizedNext = {
      ...next,
      security_alerts: true,
    };
    setPreferences(normalizedNext);
    try {
      setSavingPreferences(true);
      const { error } = await supabase.auth.updateUser({
        data: { notification_preferences: normalizedNext },
      });
      if (error) throw error;
    } catch (err: any) {
      setPreferences(previous);
      Alert.alert("Settings Not Saved", err?.message || "Unable to save notification preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  function setMasterEnabled(enabled: boolean) {
    savePreferences({ ...preferences, master_enabled: enabled });
  }

  function setPreference(key: NotificationPreferenceKey, enabled: boolean) {
    savePreferences({ ...preferences, [key]: enabled });
  }

  async function loadNotifications(scopedUserId: string = userId || "") {
    try {
      setLoading(true);

      const response = await fetch(
        `${BACKEND_URL}/notifications/${encodeURIComponent(scopedUserId)}?refresh=${Date.now()}`,
        {
          headers: await getNotificationAuthHeaders({
            "Cache-Control": "no-cache",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load notifications."
        );
      }

      setNotifications(
        Array.isArray(data.notifications)
          ? data.notifications
          : []
      );
    } catch (err: any) {
      console.log(
        "Notification load failed",
        err
      );

      Alert.alert(
        "Notifications Unavailable",
        err?.message ||
          "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      setMarkingAllRead(true);

      const response = await fetch(
        `${BACKEND_URL}/notifications/read-all/${encodeURIComponent(userId || "")}`,
        {
          method: "PATCH",
          headers: await getNotificationAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to mark notifications as read."
        );
      }

      setNotifications(items =>
        items.map(item => ({
          ...item,
          unread: false,
        }))
      );
    } catch (err: any) {
      Alert.alert(
        "Unable to Mark Read",
        err?.message ||
          "Please try again."
      );
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function deleteNotification(
    id: string
  ) {
    try {
      setDeletingId(id);

      const response = await fetch(
        `${BACKEND_URL}/notifications/${id}`,
        {
          method: "DELETE",
          headers: await getNotificationAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to delete notification."
        );
      }

      setNotifications(items =>
        items.filter(
          item => item.id !== id
        )
      );
    } catch (err: any) {
      Alert.alert(
        "Delete Failed",
        err?.message ||
          "Unable to delete this notification."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDeleteNotification(
    item: NotificationItem
  ) {
    Alert.alert(
      "Delete Notification?",
      `Delete "${item.title}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteNotification(item.id),
        },
      ]
    );
  }

  async function clearAllNotifications() {
    try {
      setClearingAll(true);

      const response = await fetch(
        `${BACKEND_URL}/notifications/clear-all`,
        {
          method: "DELETE",
          headers: await getNotificationAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to clear notifications."
        );
      }

      setNotifications([]);
      setActiveFilter("all");
    } catch (err: any) {
      Alert.alert(
        "Clear All Failed",
        err?.message ||
          "Unable to clear notifications."
      );
    } finally {
      setClearingAll(false);
    }
  }

  function confirmClearAll() {
    if (notifications.length === 0) {
      return;
    }

    Alert.alert(
      "Clear All Notifications?",
      "This permanently deletes every notification.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear All",
          style: "destructive",
          onPress:
            clearAllNotifications,
        },
      ]
    );
  }

  const unreadCount =
    notifications.filter(
      item => item.unread
    ).length;

  const filteredNotifications =
    useMemo(() => {
      if (activeFilter === "all") {
        return notifications;
      }

      if (activeFilter === "unread") {
        return notifications.filter(
          item => item.unread
        );
      }

      return notifications.filter(
        item =>
          item.type === activeFilter
      );
    }, [
      notifications,
      activeFilter,
    ]);

  function getBadgeStyle(
    type: string
  ) {
    if (type === "success") {
      return styles.successBadge;
    }

    if (type === "warning") {
      return styles.warningBadge;
    }

    if (type === "error") {
      return styles.errorBadge;
    }

    return styles.infoBadge;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={
        styles.container
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          Notifications
        </Text>

        <Text style={styles.subtitle}>
          Platform updates, campaigns,
          publishing alerts and status.
        </Text>
      </View>


      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingsTitle}>Notification Settings</Text>
            <Text style={styles.settingsSubtitle}>Choose which ArtBoost alerts you want to receive.</Text>
          </View>
          <Switch
            value={preferences.master_enabled}
            onValueChange={setMasterEnabled}
            disabled={savingPreferences}
            trackColor={{ false: "#3b3158", true: "#8b5cf6" }}
          />
        </View>
        <Text style={styles.masterHint}>
          {preferences.master_enabled
            ? "Notifications are enabled. Your individual choices are active."
            : "Notifications are paused. Your individual choices are preserved. Security-critical alerts remain active."}
        </Text>

        {NOTIFICATION_PREFERENCE_GROUPS.map(group => (
          <View key={group.title} style={styles.preferenceGroup}>
            <Text style={styles.preferenceGroupTitle}>{group.title}</Text>
            {group.items.map(item => (
              <View key={item.key} style={styles.preferenceRow}>
                <Text style={[styles.preferenceLabel, !preferences.master_enabled && styles.preferenceLabelDisabled]}>
                  {item.label}
                </Text>
                <Switch
                  value={item.key === "security_alerts" ? true : preferences[item.key]}
                  onValueChange={(value) => setPreference(item.key, value)}
                  disabled={
                    savingPreferences ||
                    item.key === "security_alerts" ||
                    !preferences.master_enabled
                  }
                  trackColor={{ false: "#3b3158", true: "#8b5cf6" }}
                />
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryValue}>
          {unreadCount}
        </Text>

        <Text style={styles.summaryLabel}>
          Unread Notifications
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[
            styles.actionButton,
            styles.markReadButton,
            (markingAllRead ||
              unreadCount === 0) &&
              styles.disabledButton,
          ]}
          onPress={markAllRead}
          disabled={
            markingAllRead ||
            unreadCount === 0
          }
        >
          <Text
            style={
              styles.actionButtonText
            }
          >
            {markingAllRead
              ? "Updating..."
              : "Mark All Read"}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.actionButton,
            styles.clearAllButton,
            (notifications.length === 0 ||
              clearingAll) &&
              styles.disabledButton,
          ]}
          onPress={confirmClearAll}
          disabled={
            notifications.length === 0 ||
            clearingAll
          }
        >
          <Text
            style={
              styles.actionButtonText
            }
          >
            {clearingAll
              ? "Clearing..."
              : "Clear All"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          false
        }
        style={styles.filterScroll}
      >
        {FILTERS.map(filter => (
          <Pressable
            key={filter.value}
            style={[
              styles.filterButton,
              activeFilter ===
                filter.value &&
                styles.filterButtonActive,
            ]}
            onPress={() =>
              setActiveFilter(
                filter.value
              )
            }
          >
            <Text
              style={[
                styles.filterText,
                activeFilter ===
                  filter.value &&
                  styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading && (
        <ActivityIndicator
          size="large"
          color="#8b5cf6"
        />
      )}

      {!loading &&
        filteredNotifications.length ===
          0 && (
          <View style={styles.emptyBox}>
            <Text
              style={styles.emptyTitle}
            >
              No notifications
            </Text>

            <Text
              style={styles.emptyText}
            >
              New campaign alerts and
              platform updates will appear
              here automatically.
            </Text>
          </View>
        )}

      {filteredNotifications.map(
        item => (
          <View
            key={item.id}
            style={styles.card}
          >
            <View
              style={styles.cardTopRow}
            >
              <View
                style={[
                  styles.typeBadge,
                  getBadgeStyle(
                    item.type
                  ),
                ]}
              >
                <Text
                  style={
                    styles.typeBadgeText
                  }
                >
                  {item.type}
                </Text>
              </View>

              <View
                style={
                  styles.cardTopActions
                }
              >
                {item.unread && (
                  <View
                    style={
                      styles.unreadDot
                    }
                  />
                )}

                <Pressable
                  style={[
                    styles.deleteButton,
                    deletingId ===
                      item.id &&
                      styles.disabledButton,
                  ]}
                  onPress={() =>
                    confirmDeleteNotification(
                      item
                    )
                  }
                  disabled={
                    deletingId ===
                    item.id
                  }
                >
                  <Text
                    style={
                      styles.deleteText
                    }
                  >
                    {deletingId ===
                    item.id
                      ? "Deleting..."
                      : "Delete"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Text
              style={styles.cardTitle}
            >
              {item.title}
            </Text>

            <Text
              style={styles.cardMessage}
            >
              {item.message}
            </Text>

            <Text
              style={styles.cardTime}
            >
              {item.created_at
                ? new Date(
                    item.created_at
                  ).toLocaleString()
                : ""}
            </Text>
          </View>
        )
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "rgba(7, 6, 17, 0.92)",
    },

    container: {
      padding: 20,
      paddingBottom: 120,
    },

    headerRow: {
      marginTop: 28,
      marginBottom: 18,
    },

    title: {
      color: "#fff",
      fontSize: 30,
      fontWeight: "900",
    },

    subtitle: {
      color: "#ffffff",
      marginTop: 6,
    },

    summaryBox: {
      backgroundColor: "#1b1b1b",
      padding: 18,
      borderRadius: 18,
      marginBottom: 14,
    },

    summaryValue: {
      fontSize: 34,
      fontWeight: "900",
      color: "#fff",
    },

    summaryLabel: {
      color: "#ffffff",
    },

    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },

    actionButton: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderRadius: 14,
      alignItems: "center",
    },

    markReadButton: {
      backgroundColor: "#8b5cf6",
    },

    clearAllButton: {
      backgroundColor: "#b91c1c",
    },

    actionButtonText: {
      color: "#fff",
      fontWeight: "900",
      textAlign: "center",
    },

    disabledButton: {
      opacity: 0.5,
    },

    filterScroll: {
      marginBottom: 18,
    },

    filterButton: {
      backgroundColor: "#222",
      padding: 12,
      borderRadius: 999,
      marginRight: 8,
    },

    filterButtonActive: {
      backgroundColor: "#8b5cf6",
    },

    filterText: {
      color: "#ffffff",
    },

    filterTextActive: {
      color: "#fff",
    },

    emptyBox: {
      backgroundColor: "#1b1b1b",
      padding: 20,
      borderRadius: 18,
    },

    emptyTitle: {
      color: "#fff",
      fontWeight: "900",
      fontSize: 18,
    },

    emptyText: {
      color: "#ffffff",
      marginTop: 8,
    },

    card: {
      backgroundColor: "#1b1b1b",
      padding: 16,
      borderRadius: 18,
      marginBottom: 12,
    },

    cardTopRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
    },

    cardTopActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    typeBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    successBadge: {
      backgroundColor: "#12a86b",
    },

    warningBadge: {
      backgroundColor: "#f59e0b",
    },

    errorBadge: {
      backgroundColor: "#b91c1c",
    },

    infoBadge: {
      backgroundColor: "#2563eb",
    },

    typeBadgeText: {
      color: "#fff",
      fontWeight: "900",
      fontSize: 11,
    },

    unreadDot: {
      width: 10,
      height: 10,
      borderRadius: 99,
      backgroundColor: "#8b5cf6",
    },

    deleteButton: {
      backgroundColor: "#2b2b2b",
      borderWidth: 1,
      borderColor: "#5b2525",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },

    deleteText: {
      color: "#ff7b7b",
      fontWeight: "900",
      fontSize: 12,
    },

    cardTitle: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "900",
      marginTop: 10,
    },

    cardMessage: {
      color: "#ddd",
      marginTop: 8,
    },

    cardTime: {
      color: "#ffffff",
      marginTop: 8,
    },

    settingsCard: {
      backgroundColor: "rgba(18, 16, 36, 0.94)",
      borderWidth: 1, borderColor: "#4b2d78", borderRadius: 20,
      padding: 16, marginBottom: 16,
    },
    settingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    settingTextWrap: { flex: 1 },
    settingsTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
    settingsSubtitle: { color: "#d8d2ff", fontSize: 12, lineHeight: 18, marginTop: 4 },
    masterHint: { color: "#c4b5fd", fontSize: 11, lineHeight: 17, marginTop: 10, marginBottom: 8 },
    preferenceGroup: { borderTopWidth: 1, borderTopColor: "#342d5c", marginTop: 12, paddingTop: 12 },
    preferenceGroupTitle: { color: "#a99aff", fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginBottom: 4 },
    preferenceRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    preferenceLabel: { color: "#fff", fontSize: 13, fontWeight: "700", flex: 1, paddingRight: 12 },
    preferenceLabelDisabled: { opacity: 0.5 },
  });