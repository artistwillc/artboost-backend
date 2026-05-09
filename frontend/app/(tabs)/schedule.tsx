import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function ScheduleScreen() {
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  const loadData = async () => {
    const saved = await AsyncStorage.getItem("artboost_saves");
    const scheduled = await AsyncStorage.getItem("artboost_schedules");

    setSavedPosts(saved ? JSON.parse(saved) : []);
    setSchedules(scheduled ? JSON.parse(scheduled) : []);
  };

  const requestPermissions = async () => {
    const permission = await Notifications.requestPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Notifications Disabled",
        "Turn on notifications to receive repost reminders."
      );
      return false;
    }

    return true;
  };

  const scheduleTestReminder = async (post: any) => {
    const hasPermission = await requestPermissions();

    if (!hasPermission) return;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "ArtBoost Repost Reminder",
        body: "Time to repost one of your saved campaigns.",
        data: { postId: post.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60,
        repeats: false,
      },
    });

    const newSchedule = {
      id: Date.now().toString(),
      postId: post.id,
      image: post.image,
      createdAt: new Date().toLocaleString(),
      frequency: "Test reminder — 60 seconds",
      notificationId,
    };

    const updated = [newSchedule, ...schedules];

    setSchedules(updated);
    await AsyncStorage.setItem("artboost_schedules", JSON.stringify(updated));

    Alert.alert(
      "Scheduled",
      "Test repost reminder scheduled for 60 seconds from now."
    );
  };

  const deleteSchedule = async (id: string, notificationId: string) => {
    await Notifications.cancelScheduledNotificationAsync(notificationId);

    const updated = schedules.filter((item) => item.id !== id);

    setSchedules(updated);
    await AsyncStorage.setItem("artboost_schedules", JSON.stringify(updated));

    Alert.alert("Deleted", "Schedule removed.");
  };

  useEffect(() => {
    loadData();
    requestPermissions();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Repost Scheduler</Text>

      <Text style={styles.subheader}>
        Schedule reminders to repost saved campaigns.
      </Text>

      <Text style={styles.sectionTitle}>Saved Campaigns</Text>

      {savedPosts.length === 0 ? (
        <Text style={styles.empty}>
          No saved campaigns yet. Generate and save a campaign first.
        </Text>
      ) : (
        savedPosts.map((post) => (
          <View key={post.id} style={styles.card}>
            <Image source={{ uri: post.image }} style={styles.image} />

            <Text style={styles.date}>{post.createdAt}</Text>

            <Pressable
              style={styles.scheduleButton}
              onPress={() => scheduleTestReminder(post)}
            >
              <Text style={styles.buttonText}>Schedule Test Reminder</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Scheduled Reminders</Text>

      {schedules.length === 0 ? (
        <Text style={styles.empty}>No scheduled repost reminders yet.</Text>
      ) : (
        schedules.map((item) => (
          <View key={item.id} style={styles.scheduleCard}>
            <Image source={{ uri: item.image }} style={styles.smallImage} />

            <View style={styles.scheduleInfo}>
              <Text style={styles.scheduleText}>{item.frequency}</Text>
              <Text style={styles.date}>{item.createdAt}</Text>

              <Pressable
                style={styles.deleteButton}
                onPress={() => deleteSchedule(item.id, item.notificationId)}
              >
                <Text style={styles.buttonText}>Delete Schedule</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
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
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 14,
  },
  empty: {
    color: "#999",
    fontSize: 15,
    textAlign: "center",
    marginVertical: 20,
  },
  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  image: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    resizeMode: "cover",
    backgroundColor: "#222",
  },
  smallImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: "#222",
  },
  date: {
    color: "#888",
    marginTop: 10,
    marginBottom: 10,
    fontSize: 13,
  },
  scheduleButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  deleteButton: {
    backgroundColor: "#ff4444",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  scheduleCard: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});