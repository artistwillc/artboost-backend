import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ErrorCode,
  deepLinkToSubscriptions,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
  type Purchase,
} from "expo-iap";
import { supabase } from "@/lib/supabase";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

const PRODUCTS = [
  {
    tier: "starter",
    label: "Starter",
    sku: "com.artistwill.artboostai.starter.monthly",
  },
  {
    tier: "pro",
    label: "Pro",
    sku: "com.artistwill.artboostai.pro.monthly",
  },
  {
    tier: "business",
    label: "Business",
    sku: "com.artistwill.artboostai.business.monthly",
  },
] as const;

function normalizeTier(value?: string | null) {
  const tier = String(value || "free").trim().toLowerCase();
  if (tier === "starter" || tier === "pro" || tier === "business") return tier;
  return "free";
}

export default function AppleSubscriptionPanel({
  userId,
  currentTier,
  currentPlan,
  onEntitlementChanged,
}: {
  userId: string;
  currentTier?: string | null;
  currentPlan?: string | null;
  onEntitlementChanged?: () => void | Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [syncAttempted, setSyncAttempted] = useState(false);

  const authToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error("Your ArtBoost session expired. Please sign in again.");
    }
    return token;
  }, []);

  const verifyPurchase = useCallback(
    async (purchase: Purchase) => {
      if (!userId) {
        throw new Error("Please sign in before managing your subscription.");
      }

      const transactionId = String(purchase?.id || "").trim();
      if (!transactionId) {
        throw new Error("Apple did not return a verifiable transaction identifier.");
      }

      const token = await authToken();
      const response = await fetch(`${BACKEND_URL}/apple-iap/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transactionId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Apple subscription verification failed.");
      }

      return result;
    },
    [authToken, userId]
  );

  const syncExistingAppleSubscription = useCallback(async () => {
    if (!userId) return null;
    const token = await authToken();
    const response = await fetch(`${BACKEND_URL}/apple-iap/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: "{}",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error || "Unable to refresh your App Store subscription.");
    }
    return result;
  }, [authToken, userId]);

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      try {
        setWorking(true);
        const result = await verifyPurchase(purchase);
        await finishTransaction({ purchase, isConsumable: false });
        await onEntitlementChanged?.();
        Alert.alert(
          "Subscription Active",
          `ArtBoost ${result.tierLabel || "subscription"} is active.`
        );
      } catch (error: any) {
        Alert.alert(
          "Subscription Verification",
          error?.message ||
            "We could not verify this Apple purchase yet. It has not been finished and can be restored after the issue is resolved."
        );
      } finally {
        setWorking(false);
      }
    },
    onPurchaseError: (error) => {
      setWorking(false);
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert(
          "Purchase Error",
          error.message || "Apple could not complete the purchase."
        );
      }
    },
    onError: (error) => {
      console.log("Apple IAP error:", error);
    },
  });

  useEffect(() => {
    if (!connected) return;
    setCatalogError("");
    void fetchProducts({
      skus: PRODUCTS.map((item) => item.sku),
      type: "subs",
    }).catch((error: any) => {
      setCatalogError(
        error?.message || "App Store subscription prices are temporarily unavailable."
      );
    });
  }, [connected, fetchProducts]);

  useEffect(() => {
    if (!connected || !userId || syncAttempted) return;
    setSyncAttempted(true);
    void syncExistingAppleSubscription()
      .then(async (result) => {
        if (result?.changed) await onEntitlementChanged?.();
      })
      .catch((error) => {
        console.log("Apple subscription refresh skipped:", error);
      });
  }, [
    connected,
    onEntitlementChanged,
    syncAttempted,
    syncExistingAppleSubscription,
    userId,
  ]);

  const productBySku = useMemo(() => {
    const map = new Map<string, any>();
    for (const product of subscriptions as any[]) {
      const id = String(product?.id || product?.productId || "");
      if (id) map.set(id, product);
    }
    return map;
  }, [subscriptions]);

  const buy = async (sku: string) => {
    if (!userId) {
      Alert.alert("Login Required", "Please sign in before subscribing.");
      return;
    }
    if (!productBySku.has(sku)) {
      Alert.alert(
        "App Store Unavailable",
        "This subscription is not available from the App Store yet. Please try again shortly."
      );
      return;
    }

    try {
      setWorking(true);
      await requestPurchase({
        request: {
          apple: {
            sku,
            appAccountToken: userId,
          },
        },
        type: "subs",
      });
    } catch (error: any) {
      setWorking(false);
      if (error?.code !== ErrorCode.UserCancelled) {
        Alert.alert(
          "Purchase Error",
          error?.message || "Apple could not start the purchase."
        );
      }
    }
  };

  const restore = async () => {
    try {
      setWorking(true);
      const purchases = await getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
      });
      const candidates = (purchases || [])
        .filter((purchase: Purchase) =>
          PRODUCTS.some((item) => item.sku === purchase.productId)
        )
        .sort(
          (a: Purchase, b: Purchase) =>
            Number(b.transactionDate || 0) - Number(a.transactionDate || 0)
        );

      if (!candidates.length) {
        Alert.alert(
          "Restore Purchases",
          "No active ArtBoost App Store subscription was found for this Apple ID."
        );
        return;
      }

      let restored: any = null;
      let restoredPurchase: Purchase | null = null;
      for (const purchase of candidates) {
        try {
          restored = await verifyPurchase(purchase);
          restoredPurchase = purchase;
          break;
        } catch {
          // Continue through any other active ArtBoost subscription returned by StoreKit.
        }
      }

      if (!restored || !restoredPurchase) {
        throw new Error(
          "Apple returned an ArtBoost purchase, but it could not be verified for this ArtBoost account."
        );
      }

      await finishTransaction({ purchase: restoredPurchase, isConsumable: false });
      await onEntitlementChanged?.();
      Alert.alert(
        "Purchases Restored",
        `ArtBoost ${restored.tierLabel || "subscription"} access has been restored.`
      );
    } catch (error: any) {
      Alert.alert(
        "Restore Purchases",
        error?.message || "Unable to restore Apple purchases."
      );
    } finally {
      setWorking(false);
    }
  };

  const manage = async () => {
    try {
      await deepLinkToSubscriptions({});
    } catch {
      Alert.alert(
        "Subscriptions",
        "Open Settings > Apple Account > Subscriptions to manage your subscription."
      );
    }
  };

  const normalizedCurrentTier = normalizeTier(currentTier);
  const isAppleManagedCurrentPlan = String(currentPlan || "")
    .trim()
    .toLowerCase()
    .startsWith("apple_");

  return (
    <View style={styles.card}>
      <Text style={styles.title}>App Store Subscription</Text>
      <Text style={styles.copy}>
        Subscribe securely with your Apple ID. Your subscription works with the same
        ArtBoost account on supported platforms.
      </Text>

      {PRODUCTS.map((item) => {
        const product = productBySku.get(item.sku);
        const displayPrice = String(product?.displayPrice || "").trim();
        const isCurrent = normalizedCurrentTier === item.tier;
        const available = Boolean(product);

        return (
          <Pressable
            key={item.sku}
            style={[styles.plan, isCurrent && styles.planCurrent]}
            onPress={() =>
              isCurrent
                ? isAppleManagedCurrentPlan
                  ? manage()
                  : undefined
                : buy(item.sku)
            }
            disabled={
              working ||
              !connected ||
              (!available && !isCurrent) ||
              (isCurrent && !isAppleManagedCurrentPlan)
            }
          >
            <View style={styles.planTextWrap}>
              <Text style={styles.planName}>{item.label}</Text>
              <Text style={styles.price}>
                {displayPrice || (available ? "App Store price" : "Loading App Store price...")}
              </Text>
            </View>
            <Text style={styles.choose}>
              {isCurrent
                ? isAppleManagedCurrentPlan
                  ? "Manage"
                  : "Current"
                : available
                  ? "Choose"
                  : "Loading"}
            </Text>
          </Pressable>
        );
      })}

      {normalizedCurrentTier !== "free" && !isAppleManagedCurrentPlan ? (
        <Text style={styles.accountPlanNote}>
          Your current ArtBoost plan was purchased outside the App Store and remains
          active on this account. Manage that billing where you originally purchased it.
        </Text>
      ) : null}

      {catalogError ? <Text style={styles.errorText}>{catalogError}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={restore} disabled={working}>
          <Text style={styles.secondaryText}>Restore Purchases</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={manage} disabled={working}>
          <Text style={styles.secondaryText}>Manage with Apple</Text>
        </Pressable>
      </View>

      {working ? <ActivityIndicator style={styles.spinner} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "rgba(19,15,38,0.94)",
    borderWidth: 1,
    borderColor: "rgba(155,92,255,0.35)",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  copy: { color: "#c8c1dc", marginTop: 7, lineHeight: 19 },
  plan: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planCurrent: {
    borderWidth: 1,
    borderColor: "rgba(217,183,255,0.6)",
  },
  planTextWrap: { flexShrink: 1 },
  planName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  price: { color: "#c8c1dc", marginTop: 3 },
  choose: { color: "#d9b7ff", fontWeight: "800", marginLeft: 12 },
  actions: { marginTop: 14, gap: 10 },
  secondary: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#fff", fontWeight: "700" },
  accountPlanNote: { color: "#c8c1dc", marginTop: 12, lineHeight: 18 },
  errorText: { color: "#ffb4b4", marginTop: 10, lineHeight: 18 },
  spinner: { marginTop: 12 },
});
