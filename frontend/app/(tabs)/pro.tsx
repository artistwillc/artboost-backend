import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
 
import { supabase } from "@/lib/supabase";
 
const BACKEND_URL = "https://artboost-ai.onrender.com";
 
export default function ProScreen() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
 
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [boardError, setBoardError] = useState("");
 
  const [title, setTitle] = useState("");
  const [facebookPages, setFacebookPages] = useState<any[]>([]);
  const [selectedFacebookPage, setSelectedFacebookPage] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productLink, setProductLink] = useState("");
  const [previewImage, setPreviewImage] = useState("");
 
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [repostPreset, setRepostPreset] = useState<
        "daily" | "3days" | "weekly" | "monthly" | null
        >(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
 
  const [scheduledCampaigns, setScheduledCampaigns] = useState<any[]>([]);
  const [queueFilter, setQueueFilter] = useState<
  | "all"
  | "active"
  | "paused"
  | "saved"
  | "ended"
  | "published"
  | "failed"
>("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [variations, setVariations] = useState<any[]>([]);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [openingBilling, setOpeningBilling] = useState(false);
  const [syncingSubscription, setSyncingSubscription] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookConnectedAt, setFacebookConnectedAt] =
  useState("");
  const [selectedPlatform, setSelectedPlatform] =
useState<"Pinterest" | "Facebook">(
"Pinterest"
);
  const cleanUrl = (value: string) => {
    const trimmed = value.trim();
    const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
    return urlMatch ? urlMatch[0] : trimmed;
  };
 
  const syncSubscription = async (userId: string, email: string) => {
    try {
      setSyncingSubscription(true);
 
      const response = await fetch(`${BACKEND_URL}/sync-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          email,
        }),
      });
 
      const data = await response.json();


      if (!response.ok) {
        console.log("Subscription sync error:", data);
        return null;
      }
 
      return data;
    } catch (err) {
      console.log("Subscription sync failed:", err);
      return null;
    } finally {
      setSyncingSubscription(false);
    }
  };
 
  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
 
    setSession(data.session);
 
    if (data.session?.user?.id) {
      if (data.session.user.email) {
        await syncSubscription(data.session.user.id, data.session.user.email);
      }
 
      await loadProfile(data.session.user.id);
    } else {
      setProfile(null);
    }
  };
 
  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
 
    if (error) {
      console.log("Profile load error:", error.message);
      return;
    }
 
    setProfile(data);
  };
 
  const getPublishAtIso = () => {
    if (!scheduledDate) return "";
    return scheduledDate.toISOString();
  };
 
  const getReadableSchedule = () => {
    if (!scheduledDate) return "No schedule selected";
    return scheduledDate.toLocaleString();
  };
const applyRepostPreset = (
  preset: "daily" | "3days" | "weekly" | "monthly"
) => {
  const nextDate = new Date();
 
  if (preset === "daily") {
    nextDate.setDate(nextDate.getDate() + 1);
  }
 
  if (preset === "3days") {
    nextDate.setDate(nextDate.getDate() + 3);
  }
 
  if (preset === "weekly") {
    nextDate.setDate(nextDate.getDate() + 7);
  }
 
  if (preset === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
 
  setRepostPreset(preset);
  setScheduledDate(nextDate);
};
  const getStatusStyle = (status: string) => {
    if (status === "published") return styles.statusPublished;
    if (status === "failed") return styles.statusFailed;
    if (status === "publishing") return styles.statusPublishing;
    if (status === "ended") return styles.statusFailed;
    if (status === "saved") return styles.statusSaved;
    return styles.statusScheduled;
  };
   const filteredCampaigns = scheduledCampaigns
  .filter((item) => {
    const matchesSearch =
      !queueSearch ||
      item.title?.toLowerCase().includes(queueSearch.toLowerCase()) ||
      item.platform?.toLowerCase().includes(queueSearch.toLowerCase());
 
    if (!matchesSearch) return false;
 
    if (queueFilter === "all") return true;
 
    if (
      queueFilter === "active" ||
      queueFilter === "paused" ||
      queueFilter === "saved" ||
      queueFilter === "ended"
    ) {
      return item.campaignStatus === queueFilter;
    }
 
    return item.status === queueFilter;
  })
  .sort((a, b) => {
    const aTime = new Date(a.publishAt || a.publishDate || 0).getTime();
    const bTime = new Date(b.publishAt || b.publishDate || 0).getTime();
 
    return aTime - bTime;
  });
   
  const startStripeCheckout = async (plan: "monthly" | "yearly") => {
    try {
      if (!session?.user?.email) {
        Alert.alert(
          "Login Required",
          "Please log in or create an account before upgrading to Pro."
        );
        return;
      }
 
      setCheckingOut(true);
 
      const response = await fetch(`${BACKEND_URL}/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          userEmail: session.user.email,
          userId: session.user.id,
        }),
      });
 
      const data = await response.json();
 
      if (!response.ok || !data.url) {
        Alert.alert(
          "Checkout Error",
          data.error || "Unable to start Stripe checkout."
        );
        return;
      }
 
      await Linking.openURL(data.url);
    } catch (err: any) {
      console.log(err);
      Alert.alert("Checkout Error", err.message || "Failed to open checkout.");
    } finally {
      setCheckingOut(false);
    }
  };
 
  const openBillingPortal = async () => {
  try {
    if (!session?.user?.email || !session?.user?.id) {
      Alert.alert(
        "Login Required",
        "Please log in before managing your subscription."
      );
      return;
    }

    setOpeningBilling(true);

    if (!profile?.stripe_customer_id) {
      await syncSubscription(session.user.id, session.user.email);
      await loadProfile(session.user.id);
    }

    const response = await fetch(`${BACKEND_URL}/create-billing-portal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId: profile?.stripe_customer_id || null,
        email: session.user.email,
        userId: session.user.id,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      Alert.alert(
        "Billing Portal Error",
        data.error || "Unable to open billing portal."
      );
      return;
    }

    await Linking.openURL(data.url);
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "Billing Portal Error",
      err.message || "Failed to open billing portal."
    );
  } finally {
    setOpeningBilling(false);
  }
};
 
  const loadCurrentCampaign = async () => {
    try {
      const saved = await AsyncStorage.getItem("artboost_current_campaign");
      if (!saved) return;
 
      const campaign = JSON.parse(saved);
 
      setTitle(campaign.pinterestTitle || campaign.title || "");
      setDescription(campaign.pinterestDescription || campaign.result || "");
      setProductLink(cleanUrl(campaign.productLink || ""));
      setPreviewImage(campaign.image || "");
      setImageUrl(campaign.imageUrl || "");
    } catch (err) {
      console.log("Failed loading campaign:", err);
    }
  };
 
  const loadScheduledCampaigns = async () => {
    try {
      setLoadingQueue(true);
 
      const userId = session?.user?.id;
      const url = userId
        ? `${BACKEND_URL}/scheduled-campaigns?userId=${userId}`
        : `${BACKEND_URL}/scheduled-campaigns`;
 
      const response = await fetch(url);
      const data = await response.json();
 
      if (data.campaigns) {
        setScheduledCampaigns(data.campaigns);
      }
    } catch (err) {
      console.log("Failed loading scheduled campaigns:", err);
    } finally {
      setLoadingQueue(false);
    }
  };
 
  const saveScheduledCampaign = async () => {
    try {
      if (!profile?.is_pro) {
        Alert.alert("Pro Required", "Scheduling is a Pro feature.");
        return;
      }
 
      if (!title || !description) {
        Alert.alert("Missing Content", "Generate or enter campaign content first.");
        return;
      }
 
      if (!imageUrl) {
        Alert.alert(
          "Missing Image URL",
          "A public image URL is required for scheduled publishing."
        );
        return;
      }
 
      if (selectedPlatform === "Pinterest" && !selectedBoard) {
  Alert.alert("Missing Board", "Please select a Pinterest board.");
  return;
}
 
      if (!scheduledDate) {
        Alert.alert("Missing Schedule Time", "Choose a date and time first.");
        return;
      }
 
      const response = await fetch(`${BACKEND_URL}/schedule-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  userId: session?.user?.id || null,
  title,
  description,
  imageUrl,
  productLink,
  boardId: selectedPlatform === "Pinterest" ? selectedBoard : null,
  publishAt: getPublishAtIso(),
  platform: selectedPlatform,
 
  repeatType: repostPreset || "one_time",
 
  nextRunAt:
    repostPreset && scheduledDate
      ? scheduledDate.toISOString()
      : null,
}),
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        Alert.alert("Scheduling Error", data.error || "Failed to schedule campaign.");
        return;
      }
 
      await loadScheduledCampaigns();
      setScheduledDate(null);
 
      Alert.alert("Scheduled", "Campaign added to backend automation queue.");
    } catch (err: any) {
      console.log(err);
      Alert.alert("Scheduling Error", err.message || "Failed to schedule campaign.");
    }
  };
 
  const deleteScheduledCampaign = async (id: string) => {
    try {
      const userId = session?.user?.id;
      const url = userId
        ? `${BACKEND_URL}/scheduled-campaigns/${id}?userId=${userId}`
        : `${BACKEND_URL}/scheduled-campaigns/${id}`;
 
      const response = await fetch(url, {
        method: "DELETE",
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        Alert.alert("Delete Error", data.error || "Failed to delete campaign.");
        return;
      }
 
      setScheduledCampaigns(data.campaigns || []);
      Alert.alert("Deleted", "Scheduled campaign removed.");
    } catch (err: any) {
      console.log(err);
      Alert.alert("Delete Error", err.message || "Failed to delete campaign.");
    }
  };
 
  const updateCampaignLifecycle = async (
    id: string,
    campaignStatus: "active" | "paused" | "ended" | "saved"
  ) => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/scheduled-campaigns/${id}/lifecycle`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session?.user?.id || null,
            campaignStatus,
          }),
        }
      );
 
      const data = await response.json();
 
      if (!response.ok) {
        Alert.alert(
          "Lifecycle Error",
          data.error || "Failed to update campaign."
        );
        return;
      }
 
      await loadScheduledCampaigns();
 
      Alert.alert("Campaign Updated", `Campaign marked as ${campaignStatus}.`);
    } catch (err: any) {
      console.log(err);
 
      Alert.alert(
        "Lifecycle Error",
        err.message || "Failed to update campaign."
      );
    }
  };
 
  const postScheduledNow = async (item: any) => {
    try {
      setTitle(item.title || "");
      setDescription(item.description || "");
      setImageUrl(item.imageUrl || "");
      setProductLink(cleanUrl(item.productLink || ""));
 
      if (item.boardId) {
        setSelectedBoard(item.boardId);
      }
 
      Alert.alert(
        "Loaded",
        "Campaign loaded into publishing fields. Tap Post To Pinterest to publish now."
      );
    } catch (err) {
      console.log(err);
      Alert.alert("Queue Error", "Failed to load scheduled campaign.");
    }
  };

const loadFacebookStatus = async () => {

  try {

    const response =
      await fetch(
        `${BACKEND_URL}/facebook/status`
      );

    const data =
      await response.json();

    setFacebookConnected(
      data.connected || false
    );

    setFacebookConnectedAt(
      data.connectedAt || ""
    );

  }

  catch (err) {

    console.log(
      "Facebook status failed:",
      err
    );

  }

};
 
const loadFacebookPages = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/facebook/pages`);
    const data = await response.json();
console.log("Facebook Pages Response:", data);

    if (!response.ok || !data.data) {
      console.log("Facebook pages failed:", data);
      setFacebookPages([]);
      return;
    }

    setFacebookPages(data.data);

    if (data.data.length > 0 && !selectedFacebookPage) {
      setSelectedFacebookPage(data.data[0].id);
    }
  } catch (err) {
    console.log("Facebook pages load failed:", err);
    setFacebookPages([]);
  }
};

  const loadBoards = async () => {
    try {
      setLoadingBoards(true);
      setBoardError("");
 
      const response = await fetch(`${BACKEND_URL}/pinterest/boards`);
      const data = await response.json();
 
      if (!response.ok) {
        setBoards([]);
        setBoardError(data.error || "Pinterest boards could not be loaded.");
        return;
      }
 
      if (data.items && Array.isArray(data.items)) {
        setBoards(data.items);
 
        const redbubbleBoard = data.items.find((b: any) => b.name === "Redbubble");
 
        if (redbubbleBoard) {
          setSelectedBoard(redbubbleBoard.id);
        } else if (data.items.length > 0) {
          setSelectedBoard(data.items[0].id);
        }
      } else {
        setBoards([]);
        setBoardError("No Pinterest boards were returned.");
      }
    } catch (err: any) {
      console.log(err);
      setBoardError("Failed to load Pinterest boards. Refresh or reconnect Pinterest.");
    } finally {
      setLoadingBoards(false);
    }
  };
 
  const createPinterestPin = async () => {
    try {
      if (!profile?.is_pro) {
        Alert.alert("Pro Required", "Pinterest publishing is a Pro feature.");
        return;
      }
 
      if (!selectedBoard) {
        Alert.alert("Missing Board", "Please select a Pinterest board.");
        return;
      }
 
      if (!imageUrl) {
        Alert.alert("Missing Image URL", "Pinterest requires a public image URL.");
        return;
      }
 
      const finalProductLink = cleanUrl(productLink);
 
      if (finalProductLink && !finalProductLink.startsWith("http")) {
        Alert.alert(
          "Invalid Product Link",
          "The product link must start with https:// or http://."
        );
        return;
      }
 
      setPublishing(true);
 
      const response = await fetch(`${BACKEND_URL}/pinterest/create-pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boardId: selectedBoard,
          title,
          description,
          link: finalProductLink,
          imageUrl,
        }),
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        console.log(data);
        Alert.alert(
          "Pinterest Approval Pending",
          "Pinterest posting is ready, but your Pinterest Developer app is still pending production approval.\n\nUntil Pinterest approves Standard Access, live pin creation is blocked. Your campaign is saved and ready to post once approval is complete."
        );
        return;
      }
 
      Alert.alert(
        "Pinterest Pin Published",
        "Your artwork was successfully posted to Pinterest."
      );
 
      await loadScheduledCampaigns();
    } catch (err: any) {
      console.log(err);
      Alert.alert("Publish Failed", err.message || "Failed to publish Pinterest pin.");
    } finally {
      setPublishing(false);
    }
  };

const createFacebookPost = async () => {
  try {
    if (!profile?.is_pro) {
      Alert.alert("Pro Required", "Facebook publishing is a Pro feature.");
      return;
    }

    if (!imageUrl) {
      Alert.alert("Missing Image URL", "Facebook requires a public image URL.");
      return;
    }

    setPublishing(true);

    const response = await fetch(`${BACKEND_URL}/facebook/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
  message: `${title}\n\n${description}\n\n${productLink}`,
  imageUrl,
  pageId: "106367482441971",
}),
    });

    const data = await response.json();

console.log("Facebook post response:", data);

if (!response.ok || data.error) {
  Alert.alert(
    "Facebook Error",
    data.error?.message || data.error || "Facebook post failed."
  );
  return;
}

    Alert.alert(
      "Facebook Published",
      "Your artwork was successfully posted to Facebook."
    );
  } catch (err: any) {
    console.log(err);
    Alert.alert(
      "Facebook Publish Failed",
      err.message || "Failed to publish Facebook post."
    );
  } finally {
    setPublishing(false);
  }
};
 
  const generateVariations = async () => {
    try {
      if (!profile?.is_pro) {
        Alert.alert("Pro Required", "AI variations are a Pro feature.");
        return;
      }
 
      setLoadingVariations(true);
 
      const response = await fetch(`${BACKEND_URL}/generate-variations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          platform: "Pinterest",
          productLink,
        }),
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        console.log(data);
        Alert.alert("Variation Error", data.error || "Failed to generate AI variations.");
        return;
      }
 
      if (!data.variations || !Array.isArray(data.variations)) {
        Alert.alert("Variation Error", "Invalid AI response.");
        return;
      }
 
      setVariations(data.variations);
 
      Alert.alert(
        "AI Variations Ready",
        "Fresh AI campaign variations generated successfully."
      );
    } catch (err: any) {
      console.log(err);
      Alert.alert("Variation Error", err.message || "Failed to generate AI variations.");
    } finally {
      setLoadingVariations(false);
    }
  };
 
  const copyVariation = async (variationTitle: string, variationText: string) => {
    await Clipboard.setStringAsync(`${variationTitle}\n\n${variationText}`);
    Alert.alert("Copied", "Variation copied to clipboard.");
  };
 
  const useVariation = (variationTitle: string, variationText: string) => {
    setTitle(variationTitle);
    setDescription(variationText);
    Alert.alert("Loaded", "Variation loaded into the publishing fields.");
  };
 
  const simulateProFeature = (feature: string) => {
    if (!profile?.is_pro) {
      Alert.alert("Pro Required", `${feature} is a Pro feature.`);
      return;
    }
 
    Alert.alert(
      feature,
      `${feature} automation workflow will be activated as platform APIs are connected.`
    );
  };
 
  const handleDateChange = (event: any, selected: Date | undefined) => {
    setShowDatePicker(false);
 
    if (!selected) return;
 
    const current = scheduledDate || new Date();
    const updated = new Date(current);
 
    updated.setFullYear(selected.getFullYear());
    updated.setMonth(selected.getMonth());
    updated.setDate(selected.getDate());
 
    setScheduledDate(updated);
  };
 
  const handleTimeChange = (event: any, selected: Date | undefined) => {
    setShowTimePicker(false);
 
    if (!selected) return;
 
    const current = scheduledDate || new Date();
    const updated = new Date(current);
 
    updated.setHours(selected.getHours());
    updated.setMinutes(selected.getMinutes());
    updated.setSeconds(0);
    updated.setMilliseconds(0);
 
    setScheduledDate(updated);
  };
 
  useEffect(() => {

  loadSession();

  loadBoards();

  loadFacebookStatus();

  loadFacebookPages();

  loadCurrentCampaign();
 
    const authSubscription = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
 
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });
 
    return () => {
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);
 
  useEffect(() => {
    loadScheduledCampaigns();
 
    const interval = setInterval(() => {
      loadScheduledCampaigns();
 
      if (session?.user?.id) {
        loadProfile(session.user.id);
      }
    }, 30000);
 
    return () => clearInterval(interval);
  }, [session?.user?.id]);
 
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>ArtBoost Pro</Text>
 
      <Text style={styles.subheader}>Automation Control Center</Text>
 
      <View style={styles.heroBox}>
        <Text style={styles.heroTitle}>Creator Automation</Text>
 
        <Text style={styles.heroText}>
          Generate campaigns, auto-publish content, schedule posts, and
          streamline your creator workflow.
        </Text>
      </View>
 
      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Account Status</Text>
 
        <Text style={styles.heroText}>
          {session?.user?.email
            ? `Signed in as ${session.user.email}`
            : "You are not signed in. Log in on the main screen before upgrading."}
        </Text>
 
        <View style={profile?.is_pro ? styles.proActiveBadge : styles.freeBadge}>
          <Text style={styles.badgeText}>
            {profile?.is_pro ? "PRO ACTIVE" : "FREE ACCOUNT"}
          </Text>
        </View>
 
        <Pressable

  style={styles.smallRefreshButton}

  onPress={() => {

  loadSession();

  loadFacebookStatus();

  loadFacebookPages();

}}

>

  <Text style={styles.smallRefreshText}>

    {syncingSubscription

      ? "Syncing Subscription..."

      : "Refresh Connections"}

  </Text>

</Pressable>
 
        {profile?.is_pro && (
          <Pressable
            style={styles.billingButton}
            onPress={openBillingPortal}
            disabled={openingBilling}
          >
            <Text style={styles.billingButtonText}>
              {openingBilling ? "Opening Billing..." : "Manage Subscription"}
            </Text>
          </Pressable>
        )}
      </View>
 
      {!profile?.is_pro && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Upgrade to ArtBoost AI Pro</Text>
 
          <Text style={styles.heroText}>
            Unlock premium automation tools, advanced AI variations, scheduling,
            and multi-platform creator workflows.
          </Text>
 
          <Pressable
            style={styles.upgradeButton}
            disabled={checkingOut}
            onPress={() => startStripeCheckout("monthly")}
          >
            <Text style={styles.publishText}>
              {checkingOut ? "Opening Checkout..." : "Start Pro Monthly - $14.99/mo"}
            </Text>
          </Pressable>
 
          <Pressable
            style={styles.yearlyButton}
            disabled={checkingOut}
            onPress={() => startStripeCheckout("yearly")}
          >
            <Text style={styles.publishText}>
              {checkingOut ? "Opening Checkout..." : "Start Pro Yearly - $149/yr"}
            </Text>
          </Pressable>
        </View>
      )}

<View style={styles.card}>

<Text style={styles.sectionHeader}>
Social Connections
</Text>

<View style={styles.queueCard}>

<Text style={styles.queueTitle}>
Pinterest
</Text>

<Text style={styles.queueText}>
🟢 Connected
</Text>

</View>

<View style={styles.queueCard}>

<Text style={styles.queueTitle}>
Facebook
</Text>

<Text style={styles.queueText}>

{facebookConnected
? "🟢 Connected"
: "⚪ Not Connected"}

</Text>

{facebookConnectedAt ? (

<Text style={styles.queueText}>

Connected:

{" "}

{new Date(
facebookConnectedAt
).toLocaleString()}

</Text>

) : null}

<Text style={styles.label}>Choose Facebook Page</Text>

{facebookPages.length > 0 ? (
  facebookPages.map((page: any) => (
    <Pressable
      key={page.id}
      style={[
        styles.boardButton,
        selectedFacebookPage === page.id && styles.boardSelected,
      ]}
      onPress={() => setSelectedFacebookPage(page.id)}
    >
      <Text style={styles.boardText}>{page.name}</Text>
    </Pressable>
  ))
) : (
  <Text style={styles.boardError}>
    No Facebook Pages loaded. Refresh connections or reconnect Facebook.
  </Text>
)}

</View>

</View>

<View style={styles.card}>

<Text style={styles.sectionHeader}>
Choose Platform
</Text>

<Pressable

style={[

styles.boardButton,

selectedPlatform ===
"Pinterest"

&& styles.boardSelected,

]}

onPress={() =>

setSelectedPlatform(

"Pinterest"

)}

>

<Text style={styles.boardText}>
Pinterest
</Text>

</Pressable>

<Pressable

style={[

styles.boardButton,

selectedPlatform ===
"Facebook"

&& styles.boardSelected,

]}

onPress={() =>

setSelectedPlatform(

"Facebook"

)}

>

<Text style={styles.boardText}>
Facebook
</Text>

</Pressable>

</View>
 
      <View style={styles.automationGrid}>
        <Pressable
          style={styles.automationCard}
          onPress={() => simulateProFeature("Post Everywhere")}
        >
          <Text style={styles.automationTitle}>Post Everywhere</Text>
          <Text style={styles.automationText}>
            Publish campaigns to multiple connected platforms.
          </Text>
        </Pressable>
 
        <Pressable style={styles.automationCard} onPress={saveScheduledCampaign}>
          <Text style={styles.automationTitle}>Schedule Campaign</Text>
          <Text style={styles.automationText}>
            Queue this campaign for backend automated publishing.
          </Text>
        </Pressable>
 
        <Pressable style={styles.automationCard} onPress={generateVariations}>
          <Text style={styles.automationTitle}>Generate Variations</Text>
          <Text style={styles.automationText}>
            {loadingVariations
              ? "Generating AI variations..."
              : "Create multiple title and caption versions instantly."}
          </Text>
        </Pressable>
 
        <Pressable style={styles.automationCard} onPress={loadScheduledCampaigns}>
          <Text style={styles.automationTitle}>Refresh Queue</Text>
          <Text style={styles.automationText}>
            {loadingQueue
              ? "Refreshing scheduled campaign status..."
              : "Check published, failed, and scheduled campaign status."}
          </Text>
        </Pressable>
      </View>
 
      {variations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>AI Variations</Text>
 
          {variations.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.variationCard}>
              <Text style={styles.variationStyle}>{item.style}</Text>
              <Text style={styles.variationTitle}>{item.title}</Text>
              <Text style={styles.variationDescription}>{item.description}</Text>
 
              <Pressable
                style={styles.copyButton}
                onPress={() => copyVariation(item.title, item.description)}
              >
                <Text style={styles.copyButtonText}>Copy Variation</Text>
              </Pressable>
 
              <Pressable
                style={styles.useButton}
                onPress={() => useVariation(item.title, item.description)}
              >
                <Text style={styles.copyButtonText}>Use This Version</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
 
      {previewImage ? (
        <Image source={{ uri: previewImage }} style={styles.preview} />
      ) : null}
 
      {selectedPlatform === "Pinterest" && (
  <View style={styles.card}>
    <Text style={styles.sectionHeader}>
      Pinterest Publishing
    </Text>

    <View style={styles.boardHeaderRow}>
      <Text style={styles.label}>
        Pinterest Board
      </Text>

      <Pressable
        style={styles.smallRefreshButton}
        onPress={loadBoards}
      >
        <Text style={styles.smallRefreshText}>
          Refresh Boards
        </Text>
      </Pressable>
    </View>

    {loadingBoards ? (
      <Text style={styles.loading}>
        Loading boards...
      </Text>
    ) : boards.length > 0 ? (
      boards.map((board: any) => (
        <Pressable
          key={board.id}
          style={[
            styles.boardButton,
            selectedBoard === board.id &&
              styles.boardSelected,
          ]}
          onPress={() =>
            setSelectedBoard(board.id)
          }
        >
          <Text style={styles.boardText}>
            {board.name}
          </Text>
        </Pressable>
      ))
    ) : (
      <Text style={styles.boardError}>
        {boardError ||
          "No boards loaded. Refresh boards or reconnect Pinterest."}
      </Text>
    )}
  </View>
)}

{selectedPlatform === "Facebook" && (
  <View style={styles.card}>
    <Text style={styles.sectionHeader}>
      Facebook Publishing
    </Text>

    <Text style={styles.heroText}>
      Your connected Facebook Pages will be used
      for direct publishing.
    </Text>

    <View style={styles.queueCard}>
      <Text style={styles.queueTitle}>
        Facebook Status
      </Text>

      <Text style={styles.queueText}>
        {facebookConnected
          ? "🟢 Connected"
          : "⚪ Not Connected"}
      </Text>

      {facebookConnectedAt ? (
        <Text style={styles.queueText}>
          Connected:{" "}
          {new Date(
            facebookConnectedAt
          ).toLocaleString()}
        </Text>
      ) : null}
    </View>
  </View>
)}
 
      <View style={styles.card}>
        <Text style={styles.label}>
{selectedPlatform} Title
</Text>
 
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
 
        <Text style={styles.label}>
{selectedPlatform} Description
</Text>
 
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={description}
          onChangeText={setDescription}
        />
 
        <Text style={styles.label}>Public Image URL</Text>
 
        <TextInput
          style={styles.input}
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://..."
          placeholderTextColor="#777"
        />
 
        <Text style={styles.label}>Product Link</Text>
 
        <TextInput
          style={styles.input}
          value={productLink}
          onChangeText={setProductLink}
          placeholder="https://your-product-link.com"
          placeholderTextColor="#777"
        />
 
        <Text style={styles.label}>Schedule Date/Time</Text>
 
        <View style={styles.scheduleBox}>
          <Text style={styles.scheduleText}>{getReadableSchedule()}</Text>
 
          <View style={styles.scheduleButtons}>
            <Pressable
              style={styles.scheduleButton}
              onPress={() => {
                setShowTimePicker(false);
                setShowDatePicker(!showDatePicker);
              }}
            >
              <Text style={styles.scheduleButtonText}>Choose Date</Text>
            </Pressable>
 
            <Pressable
              style={styles.scheduleButton}
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(!showTimePicker);
              }}
            >
              <Text style={styles.scheduleButtonText}>Choose Time</Text>
            </Pressable>
          </View>
        </View>
 
        {showDatePicker && (
          <View style={styles.pickerBox}>
            <DateTimePicker
              value={scheduledDate || new Date()}
              mode="date"
              display="spinner"
              themeVariant="dark"
              onChange={handleDateChange}
            />
 
            <Pressable
              style={styles.donePickerButton}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.donePickerText}>Done</Text>
            </Pressable>
          </View>
        )}
 
        {showTimePicker && (
          <View style={styles.pickerBox}>
            <DateTimePicker
              value={scheduledDate || new Date()}
              mode="time"
              display="spinner"
              themeVariant="dark"
              onChange={handleTimeChange}
            />
 
            <Pressable
              style={styles.donePickerButton}
              onPress={() => setShowTimePicker(false)}
            >
              <Text style={styles.donePickerText}>Done</Text>
            </Pressable>
          </View>
        )}
<View style={styles.presetRow}>
  <Pressable
    style={[
      styles.presetButton,
      repostPreset === "daily" && styles.presetButtonActive,
    ]}
    onPress={() => applyRepostPreset("daily")}
  >
    <Text style={styles.presetButtonText}>Daily</Text>
  </Pressable>
 
  <Pressable
    style={[
      styles.presetButton,
      repostPreset === "3days" && styles.presetButtonActive,
    ]}
    onPress={() => applyRepostPreset("3days")}
  >
    <Text style={styles.presetButtonText}>Every 3 Days</Text>
  </Pressable>
 
  <Pressable
    style={[
      styles.presetButton,
      repostPreset === "weekly" && styles.presetButtonActive,
    ]}
    onPress={() => applyRepostPreset("weekly")}
  >
    <Text style={styles.presetButtonText}>Weekly</Text>
  </Pressable>
 
  <Pressable
    style={[
      styles.presetButton,
      repostPreset === "monthly" && styles.presetButtonActive,
    ]}
    onPress={() => applyRepostPreset("monthly")}
  >
    <Text style={styles.presetButtonText}>Monthly</Text>
  </Pressable>
</View>
        <Text style={styles.helperText}>
          ArtBoost will convert your selected date and time into backend
          automation format automatically.
        </Text>
      </View>
 
      {scheduledCampaigns.length > 0 && (
        <View style={styles.card}>
          <View style={styles.queueHeaderRow}>
            <Text style={styles.sectionHeader}>
{selectedPlatform} Publishing
</Text>
 
            <Pressable
              style={styles.smallRefreshButton}
              onPress={loadScheduledCampaigns}
            >
 
              <Text style={styles.smallRefreshText}>Refresh</Text>
            </Pressable>
          </View>
<TextInput
  style={styles.input}
  placeholder="Search campaigns..."
  placeholderTextColor="#777"
  value={queueSearch}
  onChangeText={setQueueSearch}
/>
 
<View style={styles.analyticsRow}>
  <View style={styles.analyticsCard}>
    <Text style={styles.analyticsNumber}>{scheduledCampaigns.length}</Text>
    <Text style={styles.analyticsLabel}>Total</Text>
  </View>
 
  <View style={styles.analyticsCard}>
    <Text style={styles.analyticsNumber}>
      {scheduledCampaigns.filter((x) => x.campaignStatus === "active").length}
    </Text>
    <Text style={styles.analyticsLabel}>Active</Text>
  </View>
 
  <View style={styles.analyticsCard}>
    <Text style={styles.analyticsNumber}>
      {scheduledCampaigns.filter((x) => x.campaignStatus === "paused").length}
    </Text>
    <Text style={styles.analyticsLabel}>Paused</Text>
  </View>
 
  <View style={styles.analyticsCard}>
    <Text style={styles.analyticsNumber}>
      {scheduledCampaigns.filter((x) => x.campaignStatus === "saved").length}
    </Text>
    <Text style={styles.analyticsLabel}>Saved</Text>
  </View>
 
  <View style={styles.analyticsCard}>
    <Text style={styles.analyticsNumber}>
      {scheduledCampaigns.filter((x) => x.status === "published").length}
    </Text>
    <Text style={styles.analyticsLabel}>Posted</Text>
  </View>
</View>
 
<View style={styles.filterRow}>
  {["all", "active", "paused", "saved", "ended", "published", "failed"].map(
    (filter) => (
      <Pressable
        key={filter}
        style={[
          styles.filterButton,
          queueFilter === filter && styles.filterButtonActive,
        ]}
        onPress={() => setQueueFilter(filter as any)}
      >
        <Text style={styles.filterButtonText}>
          {filter.toUpperCase()} (
          {filter === "all"
            ? scheduledCampaigns.length
            : filteredCampaigns.filter((item) => {
                if (
                  filter === "active" ||
                  filter === "paused" ||
                  filter === "saved" ||
                  filter === "ended"
                ) {
                  return item.campaignStatus === filter;
                }
 
                return item.status === filter;
              }).length}
          )
        </Text>
      </Pressable>
    )
  )}
</View>
  {filteredCampaigns.length === 0 ? (
  <View style={styles.emptyStateBox}>
    <Text style={styles.emptyStateText}>
      No {queueFilter} campaigns.
    </Text>
  </View>
) : (
    filteredCampaigns.map((item) => (
            <View key={item.id} style={styles.queueCard}>
              <View style={styles.statusRow}>
                <Text style={styles.queueTitle}>{item.title}</Text>
 
                <View style={styles.statusBadgeContainer}>
                  {item.status !== item.campaignStatus && (
  <Text
    style={[
      styles.statusBadge,
      getStatusStyle(item.status)
    ]}
  >
    {item.status || "scheduled"}
  </Text>
)}
 
<Text
  style={[
    styles.lifecycleBadge,
 
    item.campaignStatus === "active" &&
      styles.lifecycleActive,
 
    item.campaignStatus === "paused" &&
      styles.lifecyclePaused,
 
    item.campaignStatus === "saved" &&
      styles.lifecycleSaved,
 
    item.campaignStatus === "ended" &&
      styles.lifecycleEnded,
  ]}
>
  {(item.campaignStatus || "active").toUpperCase()}
</Text>
                </View>
              </View>
 
              <Text style={styles.queueText}>{item.platform}</Text>
 
              <Text style={styles.queueText}>
  Scheduled:{" "}
  {new Date(
    item.publishAt || item.publishDate
  ).toLocaleString()}
</Text>
              <Text style={styles.queueText}>
               Repeat:{" "}
               {(item.repeatType || "one_time")
               .replace("3days", "Every 3 Days")
               .replace("_", " ")
               .toUpperCase()}
               </Text>
              <View style={styles.metricsRow}>
  <View style={styles.metricBox}>
    <Text style={styles.metricNumber}>
      {item.views || 0}
    </Text>
 
    <Text style={styles.metricLabel}>
      Views
    </Text>
  </View>
 
  <View style={styles.metricBox}>
    <Text style={styles.metricNumber}>
      {item.clicks || 0}
    </Text>
 
    <Text style={styles.metricLabel}>
      Clicks
    </Text>
  </View>
 
  <View style={styles.metricBox}>
    <Text style={styles.metricNumber}>
      {item.posts || 0}
    </Text>
 
    <Text style={styles.metricLabel}>
      Posts
    </Text>
  </View>
</View>
 
{item.publishedAt ? (
  <Text style={styles.queueText}>
    Last Published:{" "}
    {new Date(item.publishedAt).toLocaleString()}
  </Text>
) : null}
 
              {item.error ? (
                <Text style={styles.errorText}>Error: {item.error}</Text>
              ) : null}
<View style={styles.queueButtons}>
  <Pressable
    style={styles.queuePostButton}
    onPress={() => postScheduledNow(item)}
  >
    <Text style={styles.queueButtonText}>Load</Text>
  </Pressable>
 
  {item.campaignStatus === "active" && (
    <>
      <Pressable
        style={styles.queuePauseButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "paused")
        }
      >
        <Text style={styles.queueButtonText}>Pause</Text>
      </Pressable>
 
      <Pressable
        style={styles.queueEndButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "ended")
        }
      >
        <Text style={styles.queueButtonText}>End</Text>
      </Pressable>
 
      <Pressable
        style={styles.queueSaveButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "saved")
        }
      >
        <Text style={styles.queueButtonText}>Save</Text>
      </Pressable>
    </>
  )}
 
  {item.campaignStatus === "paused" && (
    <>
      <Pressable
        style={styles.queueReactivateButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "active")
        }
      >
        <Text style={styles.queueButtonText}>Resume</Text>
      </Pressable>
 
      <Pressable
        style={styles.queueEndButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "ended")
        }
      >
        <Text style={styles.queueButtonText}>End</Text>
      </Pressable>
 
      <Pressable
        style={styles.queueSaveButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "saved")
        }
      >
        <Text style={styles.queueButtonText}>Save</Text>
      </Pressable>
    </>
  )}
 
  {item.campaignStatus === "saved" && (
    <>
      <Pressable
        style={styles.queueReactivateButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "active")
        }
      >
        <Text style={styles.queueButtonText}>
          Reactivate
        </Text>
      </Pressable>
 
      <Pressable
        style={styles.queueEndButton}
        onPress={() =>
          updateCampaignLifecycle(item.id, "ended")
        }
      >
        <Text style={styles.queueButtonText}>End</Text>
      </Pressable>
    </>
  )}
 
  {item.campaignStatus === "ended" && (
    <Pressable
      style={styles.queueReactivateButton}
      onPress={() =>
        updateCampaignLifecycle(item.id, "active")
      }
    >
      <Text style={styles.queueButtonText}>
        Reactivate
      </Text>
    </Pressable>
  )}
 
  <Pressable
    style={styles.queueDeleteButton}
    onPress={() =>
      deleteScheduledCampaign(item.id)
    }
  >
    <Text style={styles.queueButtonText}>Delete</Text>
  </Pressable>
</View>
            </View>
          ))
)}
        </View>
      )}
 
      <Pressable
  style={[
  styles.publishButton,
  selectedPlatform === "Facebook"
    ? styles.facebookButton
    : styles.pinterestButton,
]}
  onPress={() => {

  if (

    selectedPlatform ===
    "Facebook"

  ) {

    createFacebookPost();

  }

  else {

    createPinterestPin();

  }

}}
>
        <Text style={styles.publishText}>
          {publishing
  ? "Publishing..."
  : `Post To ${selectedPlatform}`}
        </Text>
      </Pressable>
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
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 40,
  },
 
  subheader: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
    fontSize: 15,
  },
 
  heroBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#8b5cf6",
    marginBottom: 20,
  },
 
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 10,
  },
 
  heroText: {
    color: "#d0d0d0",
    lineHeight: 24,
    fontSize: 15,
  },
 
  proActiveBadge: {
    backgroundColor: "#12a86b",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 14,
  },
 
  freeBadge: {
    backgroundColor: "#555",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 14,
  },
 
  badgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
 
  billingButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
 
  billingButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
 
  upgradeButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 18,
  },
 
  yearlyButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 12,
  },
 
  automationGrid: {
    marginBottom: 20,
  },
 
  automationCard: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
 
  automationTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
 
  automationText: {
    color: "#aaa",
    lineHeight: 22,
    fontSize: 14,
  },
 
  variationCard: {
    backgroundColor: "#2b2b2b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
 
  variationStyle: {
    color: "#8b5cf6",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
 
  variationTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
 
  variationDescription: {
    color: "#d0d0d0",
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 14,
  },
 
  copyButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
 
  useButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
 
  copyButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
 
  preview: {
    width: "100%",
    height: 260,
    borderRadius: 18,
    resizeMode: "contain",
    backgroundColor: "#1a1a1a",
    marginBottom: 20,
  },
 
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
 
  sectionHeader: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 18,
  },
 
  boardHeaderRow: {
    marginBottom: 10,
  },
 
  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 10,
  },
 
  input: {
    backgroundColor: "#2b2b2b",
    color: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },
 
  textarea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
 
  helperText: {
    color: "#777",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
 
  boardButton: {
    backgroundColor: "#2b2b2b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
 
  boardSelected: {
    backgroundColor: "#bd081c",
  },
 
  boardText: {
    color: "#fff",
    fontWeight: "700",
  },
 
  boardError: {
    color: "#ff6b6b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
 
  loading: {
    color: "#aaa",
  },
 
  scheduleBox: {
    backgroundColor: "#2b2b2b",
    borderRadius: 14,
    padding: 14,
  },
 
  scheduleText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 14,
  },
 
  scheduleButtons: {
    flexDirection: "row",
  },
 
  scheduleButton: {
    flex: 1,
    backgroundColor: "#2d6cdf",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 8,
  },
 
  scheduleButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
 
  pickerBox: {
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
 
  donePickerButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
 
  donePickerText: {
    color: "#fff",
    fontWeight: "900",
  },
 
  queueHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
 
  smallRefreshButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 18,
  },
 
  smallRefreshText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
 
  queueCard: {
    backgroundColor: "#2b2b2b",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
 
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
 
  statusBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
 
  lifecycleBadge: {
  color: "#fff",
  fontSize: 11,
  fontWeight: "900",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 8,
  marginLeft: 6,
  overflow: "hidden",
},
 
lifecycleActive: {
  backgroundColor: "#12a86b",
},
 
lifecyclePaused: {
  backgroundColor: "#555",
},
 
lifecycleSaved: {
  backgroundColor: "#8b5cf6",
},
 
lifecycleEnded: {
  backgroundColor: "#a62828",
},
 
  queueTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 6,
    flex: 1,
    paddingRight: 8,
  },
 
  statusBadge: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    textTransform: "uppercase",
  },
 
  statusScheduled: {
    backgroundColor: "#8b5cf6",
  },
 
  statusPublishing: {
    backgroundColor: "#f59e0b",
  },
 
  statusPublished: {
    backgroundColor: "#12a86b",
  },
 
  statusFailed: {
    backgroundColor: "#a62828",
  },
 
  statusSaved: {
    backgroundColor: "#444",
  },
 
  queueText: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 20,
  },
 
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
 
  queueButtons: {
  flexDirection: "row",
  flexWrap: "wrap",
  marginTop: 12,
  gap: 6,
},
 
  queuePostButton: {
    flexGrow: 1,
    backgroundColor: "#2d6cdf",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 6,
    marginBottom: 6,
  },
queuePauseButton: {
  flexGrow: 1,
  backgroundColor: "#444",
  paddingVertical: 12,
  borderRadius: 12,
  alignItems: "center",
  marginRight: 6,
  marginBottom: 6,
},
 
  queueEndButton: {
    flexGrow: 1,
    backgroundColor: "#f59e0b",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 8,
    marginBottom: 8,
  },
 
  queueSaveButton: {
    flexGrow: 1,
    backgroundColor: "#8b5cf6",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 8,
    marginBottom: 8,
  },
 
  queueReactivateButton: {
    flexGrow: 1,
    backgroundColor: "#12a86b",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 8,
    marginBottom: 8,
  },
 
  queueDeleteButton: {
    flexGrow: 1,
    backgroundColor: "#a62828",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
 
  queueButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
 
  publishButton: {
  paddingVertical: 18,
  borderRadius: 18,
  alignItems: "center",
  marginBottom: 40,
},

pinterestButton: {
  backgroundColor: "#bd081c",
},

facebookButton: {
  backgroundColor: "#1877f2",
},
 
  publishText: {
  color: "#fff",
  fontSize: 18,
  fontWeight: "800",
  textAlign: "center",
},
presetRow: {
  flexDirection: "row",
  flexWrap: "wrap",
  marginTop: 14,
  marginBottom: 6,
},
 
presetButton: {
  backgroundColor: "#2b2b2b",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 12,
  marginRight: 8,
  marginBottom: 8,
},
 
presetButtonActive: {
  backgroundColor: "#8b5cf6",
},
 
presetButtonText: {
  color: "#fff",
  fontWeight: "800",
  fontSize: 12,
},
 
filterRow: {
  flexDirection: "row",
  flexWrap: "wrap",
  marginBottom: 14,
},
 
filterButton: {
  backgroundColor: "#2b2b2b",
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 10,
  marginRight: 8,
  marginBottom: 8,
},
 
filterButtonActive: {
  backgroundColor: "#8b5cf6",
},
 
filterButtonText: {
  color: "#fff",
  fontSize: 11,
  fontWeight: "800",
},
 
emptyStateBox: {
  backgroundColor: "#2b2b2b",
  borderRadius: 14,
  padding: 20,
  alignItems: "center",
  marginBottom: 10,
},
 
emptyStateText: {
  color: "#aaa",
  fontSize: 14,
  fontWeight: "700",
},
analyticsRow: {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  marginBottom: 14,
},
 
analyticsCard: {
  backgroundColor: "#2b2b2b",
  borderRadius: 10,
  paddingVertical: 8,
  paddingHorizontal: 8,
  minWidth: 52,
  alignItems: "center",
  marginBottom: 8,
},
 
analyticsNumber: {
  color: "#8b5cf6",
  fontSize: 15,
  fontWeight: "900",
},
 
analyticsLabel: {
  color: "#aaa",
  fontSize: 11,
  fontWeight: "700",
},
metricsRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 12,
  marginBottom: 10,
},
 
metricBox: {
  backgroundColor: "#222",
  borderRadius: 10,
  paddingVertical: 8,
  paddingHorizontal: 12,
  alignItems: "center",
  minWidth: 70,
},
 
metricNumber: {
  color: "#8b5cf6",
  fontSize: 16,
  fontWeight: "900",
},
 
metricLabel: {
  color: "#888",
  fontSize: 11,
  marginTop: 2,
},
});
