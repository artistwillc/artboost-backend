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
} from "react-native";

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

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Success", value: "success" },
  { label: "Warnings", value: "warning" },
  { label: "Errors", value: "error" },
];

export default function NotificationsScreen() {
  const [
    notifications,
    setNotifications,
  ] = useState<NotificationItem[]>([]);

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
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);

      const response = await fetch(
        `${BACKEND_URL}/notifications/all?refresh=${Date.now()}`,
        {
          headers: {
            "Cache-Control": "no-cache",
          },
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
        `${BACKEND_URL}/notifications/read-all/all`,
        {
          method: "PATCH",
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
      backgroundColor: "#101010",
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
      color: "#aaa",
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
      color: "#aaa",
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
      color: "#aaa",
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
      color: "#aaa",
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
      color: "#777",
      marginTop: 8,
    },
  });