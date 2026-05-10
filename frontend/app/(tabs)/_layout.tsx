import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#101010",
          borderTopColor: "#222",
        },
        tabBarActiveTintColor: "#12a86b",
        tabBarInactiveTintColor: "#777",
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Create",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="color-palette"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="bookmark"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="calendar"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="connections"
        options={{
          title: "Connections",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="link"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}