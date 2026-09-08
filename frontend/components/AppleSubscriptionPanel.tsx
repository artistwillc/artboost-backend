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
    standardPrice: "$19.99",
  },
  {
    tier: "pro",
    label: "Pro",
    sku: "com.artistwill.artboostai.pro.monthly",
    standardPrice: "$39.99",
  },
  {
    tier: "business",
    label: "Business",
    sku: "com.artistwill.artboostai.business.monthly",
    standardPrice: "$79.99",
  },
] as const;

type Tier = (typeof PRODUCTS)[number]["tier"];

function normalizeTier(value?: string | null): Tier | "free" {
  const tier = String(value || "free").trim().toLowerCase();
  if (tier === "starter" || tier === "pro" || tier === "business") return tier;
  return "free";
}

function normalizedPlan(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isInternallyManagedPlan(value?: string | null) {
  const plan = normalizedPlan(value);
  return [
    "internal_business",
    "complimentary_business",
    "tester_business",
  ].includes(plan);
}

export default function AppleSubscriptionPanel({
  userId,
  currentTier,
  currentPlan,
  onEntitlementChanged,
  onManageExternalSubscription,
}: {
  userId: string;
  currentTier?: string | null;
  currentPlan?: string | null;
  onEntitlementChanged?: () => void | Promise<void>;
  onManageExternalSubscription?: () => void | Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempted, setCatalogAttempted] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [expandedTier, setExpandedTier] = useState<Tier | null>(null);

  const normalizedCurrentTier = normalizeTier(currentTier);
  const plan = normalizedPlan(currentPlan);
  const isAppleManagedCurrentPlan = plan.startsWith("apple_");
  const isInternalCurrentPlan = isInternallyManagedPlan(plan);
  const hasPaidAccountPlan = normalizedCurrentTier !== "free";

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

  const refreshCatalog = useCallback(async () => {
    if (!connected) return;
    setCatalogError("");
    try {
      await fetchProducts({
        skus: PRODUCTS.map((item) => item.sku),
        type: "subs",
      });
    } catch (error: any) {
      setCatalogError(
        error?.message || "Live App Store pricing is temporarily unavailable."
      );
    } finally {
      setCatalogAttempted(true);
    }
  }, [connected, fetchProducts]);

  useEffect(() => {
    if (!connected) return;
    void refreshCatalog();
  }, [connected, refreshCatalog]);

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
      const id = String(
        product?.id || product?.productId || product?.productIdentifier || ""
      ).trim();
      if (id) map.set(id, product);
    }
    return map;
  }, [subscriptions]);

  useEffect(() => {
    if (!catalogAttempted || productBySku.size > 0 || catalogError) return;
    setCatalogError(
      "Live App Store pricing has not been returned yet. Standard U.S. monthly prices are shown below."
    );
  }, [catalogAttempted, catalogError, productBySku]);

  const buy = async (sku: string) => {
    if (!userId) {
      Alert.alert("Login Required", "Please sign in before subscribing.");
      return;
    }
    if (!productBySku.has(sku)) {
      Alert.alert(
        "App Store Unavailable",
        "Apple has not returned this subscription product yet. The displayed standard price is informational until the App Store catalog becomes available."
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

  const manageApple = async () => {
    try {
      await deepLinkToSubscriptions({});
    } catch {
      Alert.alert(
        "Subscriptions",
        "Open Settings > Apple Account > Subscriptions to manage your subscription."
      );
    }
  };

  const manageCurrentSubscription = async () => {
    if (isInternalCurrentPlan) {
      Alert.alert(
        "ArtBoost Managed Plan",
        "This account's current subscription is managed directly by ArtBoost and does not have an Apple or Stripe billing record to change."
      );
      return;
    }
    if (isAppleManagedCurrentPlan || !hasPaidAccountPlan) {
      await manageApple();
      return;
    }
    if (onManageExternalSubscription) {
      await onManageExternalSubscription();
      return;
    }
    Alert.alert(
      "Manage Subscription",
      "Manage this subscription with the billing provider where it was originally purchased."
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>App Store Subscription</Text>
      <Text style={styles.copy}>
        Tap any tier to view its details. Apple-localized pricing is used when available;
        the standard U.S. monthly price remains visible while the App Store catalog loads.
      </Text>

      {PRODUCTS.map((item) => {
        const product = productBySku.get(item.sku);
        const liveDisplayPrice = String(product?.displayPrice || "").trim();
        const displayPrice = liveDisplayPrice || item.standardPrice;
        const isCurrent = normalizedCurrentTier === item.tier;
        const isExpanded = expandedTier === item.tier;
        const available = Boolean(product);

        return (
          <View key={item.sku} style={[styles.plan, isCurrent && styles.planCurrent]}>
            <Pressable
              style={styles.planHeader}
              onPress={() => setExpandedTier(isExpanded ? null : item.tier)}
              disabled={working}
            >
              <View style={styles.planTextWrap}>
                <Text style={styles.planName}>{item.label}</Text>
                <Text style={styles.price}>{displayPrice} / month</Text>
              </View>
              <Text style={[styles.choose, isCurrent && styles.currentText]}>
                {isCurrent ? "Current" : isExpanded ? "Close" : "Details"}
              </Text>
            </Pressable>

            {isExpanded ? (
              <View style={styles.details}>
                <Text style={styles.detailTitle}>{item.label} plan</Text>
                <Text style={styles.detailText}>Monthly subscription: {displayPrice}</Text>
                <Text style={styles.detailText}>
                  Billing cadence: monthly until changed or canceled.
                </Text>
                <Text style={styles.detailText}>
                  {liveDisplayPrice
                    ? "Price shown above was returned by the Apple App Store for this device."
                    : "Standard U.S. price shown. Apple-localized pricing will replace it when StoreKit returns the catalog."}
                </Text>
                {isCurrent ? (
                  <Text style={styles.currentDetail}>This is your current ArtBoost plan.</Text>
                ) : null}

                {hasPaidAccountPlan ? (
                  <Pressable
                    style={styles.manageButton}
                    onPress={manageCurrentSubscription}
                    disabled={working}
                  >
                    <Text style={styles.manageButtonText}>Manage Subscription</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.manageButton, !available && styles.manageButtonDisabled]}
                    onPress={() => buy(item.sku)}
                    disabled={working || !connected || !available}
                  >
                    <Text style={styles.manageButtonText}>
                      {available ? `Subscribe to ${item.label}` : "App Store Product Unavailable"}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      {catalogError ? <Text style={styles.catalogNote}>{catalogError}</Text> : null}

      {!connected ? (
        <Text style={styles.catalogNote}>
          Connecting to the App Store. Standard U.S. prices remain visible.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={restore} disabled={working}>
          <Text style={styles.secondaryText}>Restore Purchases</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={manageCurrentSubscription}
          disabled={working}
        >
          <Text style={styles.secondaryText}>Manage Subscription</Text>
        </Pressable>
        <Pressable
          style={styles.refreshButton}
          onPress={refreshCatalog}
          disabled={working || !connected}
        >
          <Text style={styles.refreshButtonText}>Refresh App Store Prices</Text>
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
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  planCurrent: {
    borderWidth: 1,
    borderColor: "rgba(217,183,255,0.75)",
  },
  planHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planTextWrap: { flexShrink: 1 },
  planName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  price: { color: "#c8c1dc", marginTop: 3 },
  choose: { color: "#d9b7ff", fontWeight: "800", marginLeft: 12 },
  currentText: { color: "#e2b6ff" },
  details: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
  },
  detailTitle: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 7 },
  detailText: { color: "#c8c1dc", lineHeight: 18, marginTop: 3 },
  currentDetail: { color: "#e2b6ff", fontWeight: "800", marginTop: 9 },
  manageButton: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: "#6c5cff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 13,
    paddingHorizontal: 12,
  },
  manageButtonDisabled: { opacity: 0.5 },
  manageButtonText: { color: "#fff", fontWeight: "800", textAlign: "center" },
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
  refreshButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonText: { color: "#bba6ea", fontWeight: "700", fontSize: 12 },
  catalogNote: { color: "#c8c1dc", marginTop: 10, lineHeight: 18, fontSize: 12 },
  spinner: { marginTop: 12 },
});
