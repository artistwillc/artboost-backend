import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

const stripePublishableKey =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <StripeProvider publishableKey={stripePublishableKey}>
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
            contentStyle: {
              backgroundColor: "#101010",
            },
          }}
        >
          <Stack.Screen name="(tabs)" />

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

          <Stack.Screen name="analytics" />

          <Stack.Screen name="history" />

          <Stack.Screen name="notifications" />

          <Stack.Screen name="explore" />
        </Stack>

        <StatusBar style="light" />
      </ThemeProvider>
    </StripeProvider>
  );
}