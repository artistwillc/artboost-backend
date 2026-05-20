import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  type: "success" | "warning" | "error" | "info";
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

  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [activeFilter, setActiveFilter] =
    useState("all");

  useEffect(() => {

    loadNotifications();

    autoReadNotifications();

  }, []);

  async function autoReadNotifications() {

    try {

      await fetch(
        `${BACKEND_URL}/notifications/read-all/all`,
        {
          method: "PATCH",
        }
      );

    } catch (error) {

      console.log(
        "Auto read failed:",
        error
      );

    }

  }

  async function loadNotifications() {

    try {

      setLoading(true);

      const response =
        await fetch(
          `${BACKEND_URL}/notifications/all`
        );

      const data =
        await response.json();

      if (data.notifications) {

        const markedRead =
          data.notifications.map(
            (item: NotificationItem) => ({
              ...item,
              unread: false,
            })
          );

        setNotifications(
          markedRead
        );

      }

    } catch (err) {

      console.log(
        "Notification load failed",
        err
      );

    } finally {

      setLoading(false);

    }

  }

  async function markAllRead() {

    try {

      await fetch(
        `${BACKEND_URL}/notifications/read-all/all`,
        {
          method: "PATCH",
        }
      );

      setNotifications(
        items =>
          items.map(
            item => ({
              ...item,
              unread: false,
            })
          )
      );

    } catch (err) {

      console.log(err);

    }

  }

  const unreadCount =
    notifications.filter(
      item => item.unread
    ).length;

  const filteredNotifications =
    useMemo(() => {

      if (
        activeFilter === "all"
      ) {

        return notifications;

      }

      if (
        activeFilter === "unread"
      ) {

        return notifications.filter(
          item => item.unread
        );

      }

      return notifications.filter(
        item =>
          item.type ===
          activeFilter
      );

    }, [
      notifications,
      activeFilter,
    ]);

  function getBadgeStyle(
    type: string
  ) {

    if (
      type === "success"
    ) {

      return styles.successBadge;

    }

    if (
      type === "warning"
    ) {

      return styles.warningBadge;

    }

    if (
      type === "error"
    ) {

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

      <View
        style={
          styles.headerRow
        }
      >

        <Text
          style={styles.title}
        >
          Notifications
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >

          Platform updates,
          campaigns,
          publishing alerts
          and status.

        </Text>

      </View>

      <View
        style={
          styles.summaryBox
        }
      >

        <Text
          style={
            styles.summaryValue
          }
        >

          {unreadCount}

        </Text>

        <Text
          style={
            styles.summaryLabel
          }
        >

          Unread Notifications

        </Text>

      </View>

      <Pressable
        style={
          styles.markReadButton
        }
        onPress={
          markAllRead
        }
      >

        <Text
          style={
            styles.markReadText
          }
        >

          Mark All As Read

        </Text>

      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={
          styles.filterScroll
        }
      >

        {FILTERS.map(
          filter => (

          <Pressable
            key={
              filter.value
            }
            style={[
              styles.filterButton,

              activeFilter ===
              filter.value &&

              styles
              .filterButtonActive,
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

              styles
              .filterTextActive,

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
      filteredNotifications.length === 0 && (

        <View
          style={
            styles.emptyBox
          }
        >

          <Text
            style={
              styles.emptyTitle
            }
          >

            No notifications

          </Text>

          <Text
            style={
              styles.emptyText
            }
          >

            New campaign alerts
            and platform updates
            will appear here
            automatically.

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
            style={
              styles.cardTopRow
            }
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
                  styles
                  .typeBadgeText
                }
              >

                {item.type}

              </Text>

            </View>

            {item.unread && (

              <View
                style={
                  styles.unreadDot
                }
              />

            )}

          </View>

          <Text
            style={
              styles.cardTitle
            }
          >

            {item.title}

          </Text>

          <Text
            style={
              styles.cardMessage
            }
          >

            {item.message}

          </Text>

          <Text
            style={
              styles.cardTime
            }
          >

            {item.created_at
              ? new Date(
                  item.created_at
                ).toLocaleString()
              : ""}

          </Text>

        </View>

      ))}

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

markReadButton: {
backgroundColor: "#8b5cf6",
padding: 14,
borderRadius: 14,
marginBottom: 16,
},

markReadText: {
color: "#fff",
fontWeight: "900",
textAlign: "center",
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
justifyContent: "space-between",
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