import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import ArtBoostStripeProvider from "@/components/ArtBoostStripeProvider";
import ArtistProfileGate from "@/components/ArtistProfileGate"; // ARTBOOST_ARTIST_PROFILE_GATE_MOUNT_V1_20260916
import { useColorScheme } from "@/hooks/use-color-scheme";
import { installAuthenticatedBackendFetch } from "@/lib/authenticatedBackendFetch";

installAuthenticatedBackendFetch();

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#070611" }} edges={["top"]}>
        <ArtBoostStripeProvider>
          <ArtistProfileGate />
      <ThemeProvider
        value={
          colorScheme === "dark"
            ? DarkTheme
            : DefaultTheme
        }
      >
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            contentStyle: {
              backgroundColor: "#101010",
            },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="artist-profile-onboarding" options={{ gestureEnabled: false }} />

          <Stack.Screen name="catalog-importer" />

          <Stack.Screen name="catalog-import-urls" />

          <Stack.Screen
            name="modal"
            options={{
              presentation: "modal",
              headerShown: false,
            }}
          />

          <Stack.Screen name="product-import-wizard" />

          <Stack.Screen name="campaign-manager" />

          <Stack.Screen name="customer-service" />

          <Stack.Screen name="faq" />
          {/* ARTBOOST_FINAL_LAUNCH_FIX_V1_20260909: Analytics route hidden until post-launch. */}
<Stack.Screen name="store-products" />
          <Stack.Screen name="store-automation" />
          <Stack.Screen name="product-post" />
          <Stack.Screen name="video-studio" />
          <Stack.Screen name="store-collections" />
          <Stack.Screen name="store-seo" />
          <Stack.Screen name="store-inventory" />



        </Stack>

        <StatusBar style="light" />
      </ThemeProvider>
        </ArtBoostStripeProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
