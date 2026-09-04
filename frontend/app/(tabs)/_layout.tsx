// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_IOS_CONNECT_DETERMINISTIC_V3109
// ARTBOOST_IOS_AI_CONSULTANT_DETERMINISTIC_V3108
import { Ionicons } from "@expo/vector-icons";
import {
  Tabs,
  router,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,

  Platform,
} from "react-native";

import { supabase } from "@/lib/supabase";

function formatTierLabel(value?: string | null) {
  const normalized = String(value || "starter")
    .trim()
    .toLowerCase();

  if (normalized === "business") {
    return "Business";
  }

  if (
    normalized === "pro" ||
    normalized === "professional"
  ) {
    return "Pro";
  }

  if (normalized === "free") {
    return "Starter";
  }

  return (
    normalized.charAt(0).toUpperCase() +
    normalized.slice(1)
  );
}

function CustomTabBar({
  state,
  navigation,
}: any) {
  const [moreOpen, setMoreOpen] =
    useState(false);

    const params = useLocalSearchParams<{
  openMore?: string;
}>();

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [, setTierLabel] =
    useState("Starter");

  const loadUnreadCount =
    useCallback(async () => {
      try {
        const response = await fetch(
          `https://artboost-ai.onrender.com/notifications/all?refresh=${Date.now()}`,
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
              "Unable to load notifications."
          );
        }

        const count =
          Array.isArray(data.notifications)
            ? data.notifications.filter(
                (item: any) =>
                  item.unread === true
              ).length
            : 0;

        setUnreadCount(count);
      } catch (error) {
        console.log(
          "Unread count failed:",
          error
        );
      }
    }, []);

  const loadTier = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTierLabel("Starter");
        return;
      }

      const { data, error } =
        await supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", user.id)
          .single();

      if (error) {
        console.log(
          "Tier load failed:",
          error.message
        );
        return;
      }

      setTierLabel(
        formatTierLabel(
          data?.subscription_tier
        )
      );
    } catch (error) {
      console.log(
        "Tier label load failed:",
        error
      );
    }
  }, []);

  useEffect(() => {
    loadTier();

    const { data } =
      supabase.auth.onAuthStateChange(() => {
        loadTier();
      });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [loadTier]);

  useEffect(() => {
    loadUnreadCount();
  }, [
    loadUnreadCount,
    state.index,
  ]);

  useEffect(() => {
  if (params.openMore === "true") {
    setMoreOpen(true);

    router.setParams({
      openMore: undefined,
    });
  }
}, [params.openMore]);

  useEffect(() => {
    if (moreOpen) {
      loadUnreadCount();
      loadTier();
    }
  }, [
    moreOpen,
    loadUnreadCount,
    loadTier,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadUnreadCount();
    }, 10000);

    const subscription =
      AppState.addEventListener(
        "change",
        nextState => {
          if (nextState === "active") {
            loadUnreadCount();
          }
        }
      );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadUnreadCount]);

  const mainTabs = useMemo(
    () => [
      {
        name: "index",
        title: "Home",
        testId: "artboost-tab-home",
        icon: "home",
      },
      {
        name: "products",
        title: "Library",
        testId: "artboost-tab-library",
        icon: "images",
      },
      {
        name: "connections",
        title: "Connect",
        testId: "artboost-tab-connect",
        icon: "link",
      },
      {
        name: "consultant",
        title: "AI",
        testId: "artboost-tab-ai",
        icon: "sparkles",
      },
    ],
    []
  );

  const moreItems = [
    {
  title: "Customer Service",
  icon: "chatbubbles",
  route: "/customer-service",
},
{
  title: "Help & FAQ",
  testId: "artboost-more-help-faq",
  icon: "help-circle",
  route: "/faq",
},
    {
      title: "Campaign Manager",
      testId: "artboost-more-campaign-manager",
      icon: "megaphone",
      route: "/campaign-manager",
    },
    {
      title: "Schedule",
      icon: "calendar",
      route: "/schedule",
    },
    {
      title: "Analytics",
      testId: "artboost-more-analytics",
      icon: "bar-chart",
      route: "/analytics",
    },
    {
      title: "Saved Campaigns",
      icon: "bookmark",
      route: "/saved",
    },
    {
  title: "AI Marketing Consultant",
  icon: "sparkles",
  route: "/brand",
},
    {
      title: "Campaign History",
      icon: "time",
      route: "/history",
    },
    {
      title: "Notifications",
      icon: "notifications",
      route: "/notifications",
    },
    {
      title: "Platform Status",
      icon: "radio",
      route: "/(tabs)/connections",
      params: {
        section: "social",
      },
    },
    {
      title: "Creator Tools",
      icon: "compass",
      route: "/explore",
    },
    {
      title: "Subscription",
      icon: "card",
      route: "/(tabs)/pro",
    },
  ];

  function goToTab(name: string) {
    if (name === "connect-main") {
      router.replace("/(tabs)/connect-main" as any);
      return;
    }

    const route = state.routes.find((item: any) => item.name === name);
    if (!route) return;
    navigation.navigate(route.name);
  }

  // IOS_MORE_NATIVE_ACTIVATION_V261
  function openMoreMenu() {
    setMoreOpen(true);
  }

  function isActive(name: string) {
    const currentRoute =
      state.routes[state.index];

    return currentRoute?.name === name;
  }

  return (
    <>
      <View style={styles.tabBar}>
        {mainTabs.map((tab) => {
          const active = isActive(tab.name);

          return (
            <Pressable
              key={tab.name}
              style={styles.tabItem}
              onPress={() =>
                goToTab(tab.name)
              }
              accessible
              accessibilityRole="button"
              accessibilityLabel={`ArtBoost ${tab.title} tab`}
              accessibilityState={{ selected: active }}
              testID={tab.testId}
              nativeID={tab.testId}
              collapsable={false}
              onAccessibilityTap={() => goToTab(tab.name)}

          pressRetentionOffset={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons
                name={tab.icon as any}
                size={22}
                color={
                  active
                    ? "#a78bfa"
                    : "#b9b0cc"
                }
              />

              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  active &&
                    styles.tabTextActive,
                ]}
              >
                {tab.title}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={styles.tabItem}
          onPress={openMoreMenu}
          onAccessibilityTap={openMoreMenu}
          accessible
          accessibilityRole="button"
          accessibilityLabel="ArtBoost More tab"
          accessibilityState={{ expanded: moreOpen, selected: moreOpen }}
          testID="artboost-tab-more"
          nativeID="artboost-tab-more"
          collapsable={false}

          hitSlop={{ top: 8, bottom: 12, left: 8, right: 8 }}
          pressRetentionOffset={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View
            style={styles.moreIconWrap}
          >
            <Ionicons
              name="menu"
              size={24}
              color="#b9b0cc"
            />

            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text
                  style={styles.badgeText}
                >
                  {unreadCount > 9
                    ? "9+"
                    : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.tabText}>
            More
          </Text>
        </Pressable>
      </View>
        {/* IOS_SINGLE_TARGET_NAV_V272_R2: V2.7.0 duplicate iOS responders removed; original controls are authoritative. */}


      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setMoreOpen(false)
        }
      >
        <TouchableWithoutFeedback
          onPress={() =>
            setMoreOpen(false)
          }


                      accessible={false}>
          <View
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback

                      accessible={false}>
              <View
                style={styles.moreMenu}
              >
                <View
                  style={styles.handle}
                />

                <Text
                  style={styles.moreTitle}

                  testID="artboost-more-menu"
                  nativeID="artboost-more-menu"
                  accessibilityLabel="ArtBoost More Tools menu"
                  accessible
                >
                  More Tools
                </Text>

                <Text
                  style={
                    styles.moreSubtitle
                  }
                >
                  Manage campaigns, analytics,
                  brand tools, and settings.
                </Text>

                <ScrollView
                  style={styles.moreScroll}
                  contentContainerStyle={
                    styles.moreScrollContent
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                  bounces
                >
                  {moreItems.map((item) => (
                    <Pressable
                      key={item.title}
                      style={styles.moreItem}






                      onPress={() => {
                        setMoreOpen(false);

                        if (item.params) {
                          router.push({
                            pathname:
                              item.route as any,
                            params: item.params,
                          });
                        } else {
                          router.push(
                            item.route as any
                          );
                        }

                        setTimeout(() => {
                          loadUnreadCount();
                          loadTier();
                        }, 800);
                      }}







                      accessible={true}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      testID={item.testId}
                      nativeID={item.testId}
                      collapsable={false}>
                      <View
                        style={
                          styles.moreIconBox
                        }
                      >
                        <Ionicons
                          name={
                            item.icon as any
                          }
                          size={21}
                          color="#ffffff"
                        />
                      </View>

                      <View
                        style={
                          styles.moreItemTextWrap
                        }
                      >
                        <Text
                          style={
                            styles.moreItemText
                          }
                        >
                          {item.title}
                        </Text>

                        {item.title ===
                          "Notifications" &&
                        unreadCount > 0 ? (
                          <View
                            style={
                              styles.inlineBadge
                            }
                          >
                            <Text
                              style={
                                styles.badgeText
                              }
                            >
                              {unreadCount > 9
                                ? "9+"
                                : unreadCount}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#9b94b7"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function FinalIosTabBar({ state, navigation }: any) {
  const tabs = [
    { name: "index", title: "Home", icon: "home", testID: "artboost-tab-home" },
    { name: "products", title: "Library", icon: "images", testID: "artboost-tab-library" },
    { name: "connections", title: "Connect", icon: "link", testID: "artboost-tab-connect" },
    { name: "consultant", title: "AI", icon: "sparkles", testID: "artboost-tab-ai" },
    { name: "more", title: "More", icon: "menu", testID: "artboost-tab-more" },
  ];

  const current = state.routes[state.index]?.name;

  // ARTBOOST_IOS_MORE_DETERMINISTIC_V3104
  const activateIosTab = (name: string) => {
    if (name === "consultant") {
      router.replace("/(tabs)/consultant" as any);
      return;
    }

    if (name === "products") {
      router.replace("/(tabs)/products" as any);
      return;
    }

    if (name === "more") {
      router.replace("/(tabs)/more" as any);
      return;
    }

    if (name === "connections") {
      router.replace("/(tabs)/connections" as any);
      return;
    }

    navigation.navigate(name);
  };

  return (
    <View
      style={styles.finalIosTabBar}
      testID="artboost-ios-tabbar"
      nativeID="artboost-ios-tabbar"
      accessible={false}
    >
      {tabs.map((tab) => {
        const active = current === tab.name;

        return (
          <Pressable
            key={tab.name}
            testID={tab.testID}
            nativeID={tab.testID}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={"ArtBoost " + tab.title + " tab"}
            accessibilityState={{ selected: active }}
            style={[
              styles.finalIosTabItem,
              tab.name === "connections"
                ? styles.connectTouchPriority
                : null,
            ]}
            pointerEvents="auto"
            collapsable={false}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            pressRetentionOffset={{ top: 12, bottom: 12, left: 10, right: 10 }}
            onAccessibilityTap={() => activateIosTab(tab.name)}
            onPress={() => activateIosTab(tab.name)}

            focusable={true}
          >
            <Ionicons
              name={tab.icon as any}
              size={22}
              color={active ? "#c4b5fd" : "#c7bfd8"}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.finalIosTabText,
                active && styles.finalIosTabTextActive,
              ]}
            >
              {tab.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  // IOS_NATIVE_ROUTE_OWNERSHIP_FINAL_V290
  // IOS_UNIFORM_CUSTOM_TAB_FINAL_V291
  // iOS uses one uniform custom Pressable implementation for all five primary tabs.
  const ios = Platform.OS === "ios";
  return (
    <Tabs tabBar={ios ? (props) => <FinalIosTabBar {...props} /> : (props) => <CustomTabBar {...props} />} screenOptions={{ headerShown:false }}>
      <Tabs.Screen name="index" options={{ title:"Home" }} />
      <Tabs.Screen name="products" options={{ title:"Library" }} />
      <Tabs.Screen name="connect-tab" options={{ href:null }} />
      <Tabs.Screen name="consultant" options={{ title:"AI" }} />
      <Tabs.Screen name="more-tab" options={{ href:null }} />
      <Tabs.Screen name="brand" options={{ href: null }} />
      <Tabs.Screen name="connect-main" options={{ href:null }} />
      <Tabs.Screen name="connections" options={{ title:"Connect" }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ title:"More" }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="pro" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="store-dashboard" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  finalIosTabBar: {
    height: 82,
    paddingBottom: 18,
    paddingTop: 6,
    flexDirection: "row",
    backgroundColor: "rgba(23, 17, 38, 0.97)",
    borderTopWidth: 1,
    borderTopColor: "#7c3aed",
    position: "relative",
    zIndex: 1000,
    elevation: 24,
  },
  finalIosTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
    minWidth: 0,
    zIndex: 1001,
  },
  finalIosTabText: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
  },
  finalIosTabTextActive: { color: "#c4b5fd" },
  tabBar: {
    height: 74,
    backgroundColor: "rgba(13, 9, 24, 0.97)",
    borderTopWidth: 1,
    borderTopColor: "#7c3aed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: 8,
    paddingTop: 8,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
  },

  tabText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    maxWidth: 64,
    textAlign: "center",
  },

  tabTextActive: {
    color: "#9b5cff",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor:
      "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },

  moreMenu: {
    backgroundColor: "#0f0c1d",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: "#3f2e68",
    maxHeight: "88%",
  },

  handle: {
    width: 48,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#49366f",
    alignSelf: "center",
    marginBottom: 18,
  },

  moreScroll: {
    flexGrow: 0,
  },

  moreScrollContent: {
    paddingBottom: 10,
  },

  moreTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },

  moreSubtitle: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },

  moreItem: {
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#49366f",
  },

  moreIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#9b5cff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  moreItemTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  moreItemText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },

  moreIconWrap: {
    position: "relative",
  },

  badge: {
    position: "absolute",
    top: -8,
    right: -12,
    backgroundColor: "#ef4444",
    minWidth: 18,
    height: 18,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  inlineBadge: {
    backgroundColor: "#ef4444",
    minWidth: 20,
    height: 20,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },

  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  // IOS_CONNECT_TOUCH_PRIORITY_V341
  connectTouchPriority: {
    position: "relative",
    zIndex: 10000,
    elevation: 10000,
  },
});