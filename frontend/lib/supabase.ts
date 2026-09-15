import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// ARTBOOST_SUPABASE_SSR_SAFE_STORAGE_V1_20260915
const memoryStore = new Map<string, string>();

const serverStorage = {
  getItem: async (key: string): Promise<string | null> =>
    memoryStore.has(key) ? memoryStore.get(key)! : null,
  setItem: async (key: string, value: string): Promise<void> => {
    memoryStore.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    memoryStore.delete(key);
  },
};

const browserStorage = {
  getItem: async (key: string): Promise<string | null> =>
    globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    globalThis.localStorage?.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    globalThis.localStorage?.removeItem(key);
  },
};

const authStorage =
  Platform.OS !== "web"
    ? AsyncStorage
    : typeof window === "undefined"
      ? serverStorage
      : browserStorage;

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const supabasePublishableKey =
  (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    "").trim();

console.log("SUPABASE URL =", supabaseUrl);
console.log("SUPABASE KEY EXISTS =", !!supabasePublishableKey);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 0,
    },
  },
});
