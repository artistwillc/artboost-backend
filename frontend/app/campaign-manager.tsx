import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

const BACKEND_URL = "https://artboost-ai.onrender.com";

export default function CampaignManagerScreen() {
  // ARTBOOST_PAID_TIER_ACCESS_V1
  const hasPaidPublishingAccess = (tierValue?: string | null) =>
    ["pro", "business"].includes(
      String(tierValue || "").trim().toLowerCase()
    );

  const productParams = useLocalSearchParams<{
    productId?: string;
    productTitle?: string;
    productDescription?: string;
    productImageUrl?: string;
    productLink?: string;
    productStoreId?: string;
    productStoreName?: string;
    productStoreType?: string;

    // ARTBOOST_VIDEO_MEDIA_INTEGRITY_V1_1
    videoUrl?: string;
    campaignMediaType?: string;
    campaignSource?: string;
    videoJobId?: string;
  }>();

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
  // ARTBOOST_VIDEO_MEDIA_STATE_V1_1
  const [videoUrl, setVideoUrl] = useState("");
  const [campaignMediaType, setCampaignMediaType] =
    useState<"image" | "video">("image");
  const [productLink, setProductLink] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [cta, setCta] = useState("");

  const normalizeImageUrl = (value: unknown) => {
    const trimmed = String(value || "").trim();

    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }

    return trimmed;
  };

  useEffect(() => {
    const incomingTitle = String(
      productParams.productTitle || ""
    ).trim();
    const incomingDescription = String(
      productParams.productDescription || ""
    ).trim();
    const incomingImage = normalizeImageUrl(
      productParams.productImageUrl
    );
    const incomingLink = String(
      productParams.productLink || ""
    ).trim();

    // ARTBOOST_VIDEO_INCOMING_MEDIA_V1_1
    const incomingVideo = String(productParams.videoUrl || "").trim();
    const incomingMediaType =
      String(productParams.campaignMediaType || "")
        .trim()
        .toLowerCase() === "video" &&
      /^https:\/\//i.test(incomingVideo)
        ? "video"
        : "image";

    // Route product data is authoritative when Campaign Manager is opened
    // from a selected artwork. Do not allow a previously saved campaign to
    // replace the current artwork image/link.
    if (incomingTitle) {
      setTitle(incomingTitle);
    }

    if (incomingDescription) {
      setDescription(incomingDescription);
    }

    if (incomingImage) {
      setImageUrl(incomingImage);
      setPreviewImage(incomingImage);
    }

    // ARTBOOST_VIDEO_INCOMING_MEDIA_V1_1
    if (incomingVideo) {
      setVideoUrl(incomingVideo);
    } else {
      setVideoUrl("");
    }
    setCampaignMediaType(incomingMediaType);

    if (incomingLink) {
      setProductLink(incomingLink);
    }
  }, [
    productParams.productTitle,
    productParams.productDescription,
    productParams.productImageUrl,
    productParams.productLink,
  ]);

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
  const [referralInput, setReferralInput] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookConnectedAt, setFacebookConnectedAt] =
  useState("");
  const [selectedPlatform, setSelectedPlatform] =
useState<"Pinterest" | "Facebook" | "Instagram" | "X" | "Threads" | "LinkedIn" | "TikTok">(
"Pinterest"
);
  // ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3
  type MultiPublishPlatform =
    | "Pinterest"
    | "Facebook"
    | "Instagram"
    | "X"
    | "Threads"
    | "LinkedIn"
    | "TikTok";

  const ALL_PUBLISH_PLATFORMS: MultiPublishPlatform[] = [
    "Pinterest",
    "Facebook",
    "Instagram",
    "X",
    "Threads",
    "LinkedIn",
    "TikTok",
  ];

  const [selectedPlatforms, setSelectedPlatforms] =
    useState<MultiPublishPlatform[]>([]);

  const togglePublishPlatform = (platform: MultiPublishPlatform) => {
    // Last tapped platform remains active for its settings/hashtags.
    setSelectedPlatform(platform as any);

    setSelectedPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    );
  };

  const selectAllPublishPlatforms = () => {
    setSelectedPlatforms([...ALL_PUBLISH_PLATFORMS]);
  };

  const clearPublishPlatforms = () => {
    setSelectedPlatforms([]);
  };


  const [tiktokCreator, setTikTokCreator] =
    useState<any>(null);
  const [loadingTikTokCreator, setLoadingTikTokCreator] =
    useState(false);
  const [tiktokPrivacy, setTikTokPrivacy] =
    useState("");
  const [tiktokDisableComment, setTikTokDisableComment] =
    useState(false);
  const [tiktokAutoAddMusic, setTikTokAutoAddMusic] =
    useState(true);
  const [tiktokOwnBusiness, setTikTokOwnBusiness] =
    useState(true);
  const [tiktokPaidPartnership, setTikTokPaidPartnership] =
    useState(false);
  const [tiktokConsent, setTikTokConsent] =
    useState(false);

  const cleanUrl = (value: string) => {
    const trimmed = String(value || "").trim();

    if (!trimmed) {
      return "";
    }

    const urlMatch = trimmed.match(
      /(?:https?:\/\/|www\.)[^\s)]+/i
    );

    const extracted = urlMatch ? urlMatch[0] : trimmed;

    if (/^www\./i.test(extracted)) {
      return `https://${extracted}`;
    }

    return extracted;
  };

  const removeLinks = (value: string) => {
    return String(value || "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/www\.\S+/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const loadTikTokCreatorInfo = async () => {
    try {
      if (!session?.user?.id) {
        return;
      }

      setLoadingTikTokCreator(true);

      const response = await fetch(
        `${BACKEND_URL}/tiktok/creator-info?userId=${encodeURIComponent(
          session.user.id
        )}`
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Unable to load TikTok posting settings."
        );
      }

      setTikTokCreator(data.creator || null);
      setTikTokPrivacy("");
      setTikTokConsent(false);
      setTikTokDisableComment(
        Boolean(data.creator?.comment_disabled)
      );
    } catch (err: any) {
      console.log("TikTok creator info failed:", err);

      Alert.alert(
        "TikTok Settings Error",
        err?.message ||
          "Unable to load TikTok posting settings."
      );
    } finally {
      setLoadingTikTokCreator(false);
    }
  };

  useEffect(() => {
    if (
      selectedPlatform === "TikTok" &&
      session?.user?.id
    ) {
      loadTikTokCreatorInfo();
    }
  }, [
    selectedPlatform,
    session?.user?.id,
  ]);

  const getTikTokPrivacyLabel = (value: string) => {
    if (value === "PUBLIC_TO_EVERYONE") {
      return "Everyone";
    }

    if (value === "MUTUAL_FOLLOW_FRIENDS") {
      return "Friends";
    }

    if (value === "FOLLOWER_OF_CREATOR") {
      return "Followers";
    }

    if (value === "SELF_ONLY") {
      return "Only me";
    }

    return value;
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
  console.log("Profile load error:", error);
  return;
}

    console.log("PROFILE DATA:", data);
    setProfile(data);
  };

  const getPublishAtIso = () => {
    if (!scheduledDate) return "";
    return scheduledDate.toISOString();
  };

  const getReadableDate = () => {
  if (!scheduledDate) {
    return "Not Selected";
  }

  return scheduledDate.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
};

const getReadableTime = () => {
  if (!scheduledDate) {
    return "Not Selected";
  }

  return scheduledDate.toLocaleTimeString(
    undefined,
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  );
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

      if (!response.ok) {
  Alert.alert(
    "Checkout Error",
    data.error || "Unable to start Stripe checkout."
  );
  return;
}

if (data.usedFreeMonth) {
  Alert.alert(
    "Free Month Activated",
    "Your referral reward was used to activate ArtBoost AI Pro for 30 days."
  );

  await loadProfile(session.user.id);
  return;
}

if (!data.url) {
  Alert.alert(
    "Checkout Error",
    "No Stripe checkout URL was returned."
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
    const saved =
      (await AsyncStorage.getItem("artboost_current_campaign")) ||
      (await AsyncStorage.getItem("generatedCampaign")) ||
      (await AsyncStorage.getItem("currentCampaign"));

    const incomingTitle = String(
      productParams.productTitle || ""
    ).trim();
    const incomingDescription = String(
      productParams.productDescription || ""
    ).trim();
    const incomingImage = normalizeImageUrl(
      productParams.productImageUrl
    );
    const incomingLink = cleanUrl(
      String(productParams.productLink || "")
    );

    if (!saved) {
      console.log("No saved campaign found.");

      if (incomingTitle) setTitle(incomingTitle);
      if (incomingDescription) setDescription(incomingDescription);
      if (incomingImage) {
        setPreviewImage(incomingImage);
        setImageUrl(incomingImage);
      }
      if (incomingLink) setProductLink(incomingLink);

      return;
    }

    const campaign = JSON.parse(saved);

    const platform =
      campaign.platform ||
      campaign.selectedPlatform ||
      selectedPlatform ||
      "Pinterest";

    setSelectedPlatform(platform);

    const savedTitle =
      campaign.title ||
      campaign.instagramTitle ||
      campaign.facebookTitle ||
      campaign.pinterestTitle ||
      campaign.xTitle ||
      campaign.threadsTitle ||
      campaign.linkedinTitle ||
      campaign.tiktokTitle ||
      "";

    const savedDescription =
      campaign.description ||
      campaign.pinterestDescription ||
      campaign.instagramDescription ||
      campaign.facebookDescription ||
      campaign.xDescription ||
      campaign.threadsDescription ||
      campaign.linkedinDescription ||
      campaign.tiktokDescription ||
      campaign.result ||
      "";

    let finalDescription =
      incomingDescription ||
      savedDescription;

    let finalHashtags =
      campaign.hashtags ||
      campaign.instagramHashtags ||
      "";

    let finalCta =
      campaign.cta ||
      campaign.instagramCta ||
      "";

    if (platform === "Instagram") {
      finalDescription = finalDescription
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/www\.\S+/gi, "")
        .replace(/Shop here:?/gi, "")
        .replace(/Shop now:?/gi, "")
        .replace(/Grab yours now:?/gi, "")
        .replace(/Grab yours here:?/gi, "")
        .replace(/Check it out here:?/gi, "")
        .replace(/Visit our store:?/gi, "")
        .replace(/Visit:?/gi, "")
        .trim();

      finalCta = finalCta
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/www\.\S+/gi, "")
        .replace(/visit\s*/gi, "")
        .replace(/click the link in bio/gi, "Tap the link in bio")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    finalHashtags = finalHashtags.replace(/\s+#/g, "\n#");

    const savedPreviewImage = normalizeImageUrl(
      campaign.previewImage ||
      campaign.publicImageUrl ||
      campaign.imageUrl ||
      campaign.image ||
      ""
    );

    const savedPublishImage = normalizeImageUrl(
      campaign.publicImageUrl ||
      campaign.imageUrl ||
      campaign.image ||
      campaign.previewImage ||
      ""
    );

    const finalPreviewImage =
      incomingImage ||
      savedPreviewImage;

    const finalPublishImage =
      incomingImage ||
      savedPublishImage ||
      finalPreviewImage;

    const finalProductLink =
      incomingLink ||
      cleanUrl(campaign.productLink || "");

    // IMPORTANT:
    // When a product was explicitly passed into Campaign Manager, its
    // title/image/link win over stale AsyncStorage campaign values.
    setTitle(incomingTitle || savedTitle);
    setDescription(finalDescription);
    setHashtags(finalHashtags);
    setCta(finalCta);
    setProductLink(finalProductLink);
    setPreviewImage(finalPreviewImage);
    setImageUrl(finalPublishImage);

    console.log("Campaign artwork resolved:", {
      productId: productParams.productId || null,
      incomingImage: incomingImage || null,
      savedPreviewImage: savedPreviewImage || null,
      savedPublishImage: savedPublishImage || null,
      finalPreviewImage: finalPreviewImage || null,
      finalPublishImage: finalPublishImage || null,
    });
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

      if (selectedPlatform?.toLowerCase() === "pinterest" && !selectedBoard) {
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
  hashtags,
  cta,
  imageUrl,
  productLink,
  boardId: selectedPlatform === "Pinterest" ? selectedBoard : null,
  pageId: selectedPlatform === "Facebook" ? selectedFacebookPage : null,
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
  // ARTBOOST_VIDEO_CAMPAIGN_HELPERS_V1_1
  const isVideoCampaign =
    campaignMediaType === "video" && /^https:\/\//i.test(videoUrl);

  const videoUnsupportedAlert = (platform: string) => {
    Alert.alert(
      "Video Publishing Adapter Required",
      `${platform} requires its own video-upload workflow. ArtBoost will not silently replace this Video Studio MP4 with the product image.`
    );
  };
  // ARTBOOST_HASHTAG_INTELLIGENCE_CLIENT_V1
  const getSmartHashtags = async (platform: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/hashtag-intelligence/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          title,
          description,
          imageUrl,
          storeType: String(productParams.productStoreType || ""),
          storeName: String(productParams.productStoreName || ""),
          existingHashtags: hashtags,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.hashtagText) return hashtags;
      return String(data.hashtagText).trim() || hashtags;
    } catch (error) {
      console.log("Hashtag intelligence fallback:", error);
      return hashtags;
    }
  };

  // ARTBOOST_HASHTAG_VISIBLE_HYDRATION_V1_1
  // Keep the editable Hashtags field synchronized with the actual product/design
  // and currently selected publishing platform. Publish-time smart-tag generation
  // remains in place as a second integrity check.
  useEffect(() => {
    let active = true;

    const productTitle = String(title || "").trim();

    if (!productTitle) {
      return () => {
        active = false;
      };
    }

    const refreshVisibleHashtags = async () => {
      const platformForTags =
        String(selectedPlatform || "TikTok").trim() ||
        "TikTok";

      const smart = await getSmartHashtags(
        platformForTags
      );

      if (!active || !smart) return;

      setHashtags((current) => {
        const next = String(smart || "").trim();
        return next && next !== current.trim()
          ? next
          : current;
      });
    };

    // Small debounce lets routed Video Studio product context and generated
    // campaign copy settle before replacing generic starter hashtags.
    const timer = setTimeout(
      refreshVisibleHashtags,
      250
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    title,
    description,
    imageUrl,
    selectedPlatform,
    productParams.productId,
    productParams.productStoreType,
    productParams.productStoreName,
  ]);






  const scheduleEverywhere = async () => {
  try {
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert("Paid Plan Required", "Schedule Everywhere requires a Pro or Business plan.");
      return;
    }

    if (!title || !description) {
      Alert.alert("Missing Content", "Generate or enter campaign content first.");
      return;
    }

    if (!imageUrl) {
      Alert.alert("Missing Image URL", "A public image URL is required for scheduled publishing.");
      return;
    }

    if (!scheduledDate) {
      Alert.alert("Missing Schedule Time", "Choose a date and time first.");
      return;
    }

    if (!selectedFacebookPage) {
      Alert.alert("Missing Facebook Page", "Please select a Facebook Page first.");
      return;
    }

    const platforms = ["Facebook", "Instagram", "X", "Threads", "LinkedIn"];

    if (selectedBoard) {
      platforms.unshift("Pinterest");
    }

    const finalProductLink = cleanUrl(productLink);

    const campaignGroupId =
  Date.now().toString() +
  "-" +
  Math.random().toString(36).substring(2, 8);

    const scheduledPlatforms: string[] = [];
const failedPlatforms: string[] = [];

for (const platform of platforms) {
  try {
    // ARTBOOST_SCHEDULE_SMART_TAGS_V1
    const smartHashtags = await getSmartHashtags(platform);
    const response = await fetch(`${BACKEND_URL}/schedule-campaign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: session?.user?.id || null,
        title,
        description,
        hashtags,
        cta,
        imageUrl,
        productLink: finalProductLink,
        boardId: platform === "Pinterest" ? selectedBoard : null,
        pageId: platform === "Facebook" ? selectedFacebookPage : null,
        publishAt: getPublishAtIso(),
        platform,
        campaignGroupId,
        repeatType: repostPreset || "one_time",
        nextRunAt:
          repostPreset && scheduledDate
            ? scheduledDate.toISOString()
            : null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      failedPlatforms.push(platform);
      console.log(`${platform} schedule failed:`, data);
      continue;
    }

    scheduledPlatforms.push(platform);
  } catch (err) {
    failedPlatforms.push(platform);
    console.log(`${platform} schedule error:`, err);
  }
}

    await loadScheduledCampaigns();
    setScheduledDate(null);

    Alert.alert(
  "Schedule Everywhere Complete",
  `Scheduled: ${scheduledPlatforms.join(", ") || "None"}${
    failedPlatforms.length
      ? `\n\nSkipped/Failed: ${failedPlatforms.join(", ")}`
      : ""
  }`
);
  } catch (err: any) {
    console.log(err);
    Alert.alert(
      "Schedule Everywhere Error",
      err.message || "Failed to schedule campaign everywhere."
    );
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
        `${BACKEND_URL}/facebook/test`
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
      // ARTBOOST_SMART_TAGS_PINTEREST_V1
      const smartHashtags = await getSmartHashtags("Pinterest");
      // ARTBOOST_PINTEREST_VIDEO_GUARD_V1_1
      if (isVideoCampaign) {
        videoUnsupportedAlert("Pinterest");
        return;
      }
      if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
        Alert.alert("Paid Plan Required", "Pinterest publishing requires a Pro or Business plan.");
        return;
      }

      if (selectedPlatform?.toLowerCase() === "pinterest" && !selectedBoard) {
  Alert.alert("Missing Board", "Please select a Pinterest board.");
  return;
}

      if (!imageUrl) {
        Alert.alert("Missing Image URL", "This platform requires a public image URL.");
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
  console.log("Pinterest publish error:", data);

  const errorMessage =
  data?.details?.message ||
  data?.details ||
  data?.error?.details ||
  data?.error?.message ||
  data?.error ||
  JSON.stringify(data, null, 2);

  Alert.alert(
    "Pinterest Publish Failed",
    typeof errorMessage === "string"
      ? errorMessage
      : JSON.stringify(errorMessage, null, 2)
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
      // ARTBOOST_SMART_TAGS_FACEBOOK_V1
      const smartHashtags = await getSmartHashtags("Facebook");
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "Facebook publishing requires a Pro or Business plan."
      );
      return;
    }

    if (!imageUrl && !isVideoCampaign) {
      Alert.alert(
        "Missing Media",
        "Facebook requires an artwork image or Video Studio video."
      );
      return;
    }

    if (!selectedFacebookPage) {
      Alert.alert(
        "Missing Facebook Page",
        "Please select a Facebook Page first."
      );
      return;
    }

    const finalProductLink = cleanUrl(productLink);

    if (
      finalProductLink &&
      !finalProductLink.startsWith("http")
    ) {
      Alert.alert(
        "Invalid Product Link",
        "The product link must start with https:// or http://."
      );
      return;
    }

    const facebookMessage = [
      removeLinks(title),
      removeLinks(description),
      removeLinks(cta),
      removeLinks(smartHashtags),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    setPublishing(true);

    const response = await fetch(isVideoCampaign ? `${BACKEND_URL}/facebook/video-post` : `${BACKEND_URL}/facebook/post`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: facebookMessage,
          imageUrl,
          videoUrl: isVideoCampaign ? videoUrl : null,
          mediaType: isVideoCampaign ? "video" : "image",
          userId: session?.user?.id || null,
          pageId: selectedFacebookPage,
          productLink: finalProductLink,
        }),
      }
    );

    const data = await response.json();

    console.log("Facebook post response:", data);

    if (!response.ok || data.error) {
      Alert.alert(
        "Facebook Error",
        data.error?.message ||
          data.error ||
          "Facebook post failed."
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

const createInstagramPost = async () => {
  try {
      // ARTBOOST_SMART_TAGS_INSTAGRAM_V1
      const smartHashtags = await getSmartHashtags("Instagram");
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "Instagram publishing requires a Pro or Business plan."
      );
      return;
    }

    if (!imageUrl && !isVideoCampaign) {
      Alert.alert(
        "Missing Media",
        "Instagram requires an artwork image or Video Studio video."
      );
      return;
    }

    setPublishing(true);

    const response = await fetch(isVideoCampaign ? `${BACKEND_URL}/instagram/video-post` : `${BACKEND_URL}/instagram/post`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `${title}

${description}

${cta}

${smartHashtags}`,
          imageUrl,
          videoUrl: isVideoCampaign ? videoUrl : null,
          mediaType: isVideoCampaign ? "video" : "image",
          userId: session?.user?.id || null,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message ||
        data.error ||
        "Instagram publish failed"
      );
    }

    Alert.alert(
      "Instagram Published",
      "Your artwork was successfully posted to Instagram."
    );
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "Instagram Publish Failed",
      err.message || "Failed to publish Instagram post."
    );
    } finally {
    setPublishing(false);
  }
};

const createXPost = async () => {
  try {
      // ARTBOOST_SMART_TAGS_X_V1
      const smartHashtags = await getSmartHashtags("X");
      // ARTBOOST_X_VIDEO_GUARD_V1_1
      if (isVideoCampaign) {
        videoUnsupportedAlert("X");
        return;
      }
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "X publishing requires a Pro or Business plan."
      );
      return;
    }

    if (!imageUrl) {
      Alert.alert(
        "Missing Image URL",
        "X requires a public image URL."
      );
      return;
    }

    const finalProductLink = cleanUrl(productLink);

    if (
      finalProductLink &&
      !finalProductLink.startsWith("http")
    ) {
      Alert.alert(
        "Invalid Product Link",
        "The product link must start with https:// or http://."
      );
      return;
    }

    const cleanDescription = removeLinks(description);

    const safeDescription =
      cleanDescription.length > 80
        ? `${cleanDescription
            .substring(0, 77)
            .replace(/\s+\S*$/, "")}...`
        : cleanDescription;

    const shortTags = removeLinks(smartHashtags)
      .split(/\s+/)
      .filter((tag) => tag.startsWith("#"))
      .slice(0, 3)
      .join(" ");

    // The backend receives productLink separately and adds it once.
    const message = [
      removeLinks(title),
      safeDescription,
      shortTags,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    setPublishing(true);

    const response = await fetch(`${BACKEND_URL}/x/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        imageUrl,
        productLink: finalProductLink,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        data.error?.message ||
          data.error ||
          "X publish failed"
      );
    }

    Alert.alert(
      "X Published",
      "Your artwork was successfully posted to X."
    );
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "X Publish Failed",
      err.message || "Failed to publish to X."
    );
  } finally {
    setPublishing(false);
  }
};

const createThreadsPost = async () => {
  try {
      // ARTBOOST_SMART_TAGS_THREADS_V1
      const smartHashtags = await getSmartHashtags("Threads");
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "Threads publishing requires a Pro or Business plan."
      );
      return;
    }

    const finalProductLink = cleanUrl(productLink);

    if (
      finalProductLink &&
      !finalProductLink.startsWith("http")
    ) {
      Alert.alert(
        "Invalid Product Link",
        "The product link must start with https:// or http://."
      );
      return;
    }

    const message = [
      removeLinks(title),
      removeLinks(description),
      removeLinks(cta),
      removeLinks(smartHashtags),
      finalProductLink,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!message) {
      Alert.alert(
        "Missing Content",
        "Enter campaign content before publishing to Threads."
      );
      return;
    }

    setPublishing(true);

    const response = await fetch(isVideoCampaign ? `${BACKEND_URL}/threads/video-post` : `${BACKEND_URL}/threads/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: session?.user?.id || null,
        message,
        text: message,
        imageUrl: imageUrl || null,
        productLink: finalProductLink || null,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        data.error?.message ||
          data.error ||
          "Threads publish failed"
      );
    }

    Alert.alert(
      "Threads Published",
      "Your artwork was successfully posted to Threads."
    );
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "Threads Publish Failed",
      err.message || "Failed to publish to Threads."
    );
  } finally {
    setPublishing(false);
  }
};

const createLinkedInPost = async () => {
  try {
      // ARTBOOST_SMART_TAGS_LINKEDIN_V1
      const smartHashtags = await getSmartHashtags("LinkedIn");
      // ARTBOOST_LINKEDIN_VIDEO_GUARD_V1_1
      if (isVideoCampaign) {
        videoUnsupportedAlert("LinkedIn");
        return;
      }
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "LinkedIn publishing requires a Pro or Business plan."
      );
      return;
    }

    if (!session?.user?.id) {
      Alert.alert(
        "Login Required",
        "Please log in before publishing to LinkedIn."
      );
      return;
    }

    const finalProductLink = cleanUrl(productLink);

    if (
      finalProductLink &&
      !finalProductLink.startsWith("http")
    ) {
      Alert.alert(
        "Invalid Product Link",
        "The product link must start with https:// or http://."
      );
      return;
    }

    const linkedInTitle = removeLinks(title);
    const linkedInDescription = [
      removeLinks(description),
      removeLinks(cta),
      removeLinks(smartHashtags),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!linkedInTitle && !linkedInDescription) {
      Alert.alert(
        "Missing Content",
        "Enter campaign content before publishing to LinkedIn."
      );
      return;
    }

    setPublishing(true);

    const response = await fetch(`${BACKEND_URL}/linkedin/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: session.user.id,
        title: linkedInTitle || linkedInDescription,
        description: linkedInDescription,
        imageUrl: imageUrl || null,
        productLink: finalProductLink || null,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        data.error?.message ||
          data.error ||
          "LinkedIn publish failed"
      );
    }

    Alert.alert(
      "LinkedIn Published",
      "Your artwork was successfully posted to LinkedIn."
    );
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "LinkedIn Publish Failed",
      err.message || "Failed to publish to LinkedIn."
    );
  } finally {
    setPublishing(false);
  }
};


const createTikTokPost = async () => {
  try {
      // ARTBOOST_SMART_TAGS_TIKTOK_V1
      const smartHashtags = await getSmartHashtags("TikTok");
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert(
        "Paid Plan Required",
        "TikTok publishing requires a Pro or Business plan."
      );
      return;
    }

    if (!session?.user?.id) {
      Alert.alert(
        "Login Required",
        "Please log in before publishing to TikTok."
      );
      return;
    }

    if (!imageUrl && !isVideoCampaign) {
      Alert.alert(
        "Missing Media",
        "TikTok requires an artwork image or Video Studio video."
      );
      return;
    }

    if (!tiktokCreator) {
      Alert.alert(
        "TikTok Settings Required",
        "Refresh TikTok posting settings before publishing."
      );
      return;
    }

    if (!tiktokPrivacy) {
      Alert.alert(
        "Choose Privacy",
        "Select who can view this TikTok post."
      );
      return;
    }

    if (!tiktokConsent) {
      Alert.alert(
        "Confirmation Required",
        "Confirm the TikTok post settings before publishing."
      );
      return;
    }

    const finalTikTokProductLink =
      cleanUrl(productLink);

    const caption = [
      removeLinks(title),
      removeLinks(description),
      removeLinks(cta),
      finalTikTokProductLink
        ? `Shop / view artwork: ${finalTikTokProductLink}`
        : "",
      removeLinks(smartHashtags),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    setPublishing(true);

    const response = await fetch(
      isVideoCampaign ? `${BACKEND_URL}/tiktok/video-post` : `${BACKEND_URL}/tiktok/photo-post`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: session.user.id,
          title: removeLinks(title),
          description: caption,
          imageUrl,
          videoUrl: isVideoCampaign ? videoUrl : null,
          mediaType: isVideoCampaign ? "video" : "image",
          productLink:
            cleanUrl(productLink) || null,
          privacyLevel: tiktokPrivacy,
          disableComment:
            tiktokDisableComment,
          autoAddMusic:
            tiktokAutoAddMusic,
          brandOrganicToggle:
            tiktokOwnBusiness,
          brandContentToggle:
            tiktokPaidPartnership,
          consent: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        data.error?.message ||
          data.error ||
          "TikTok photo publish failed"
      );
    }

    Alert.alert(
      "TikTok Submitted",
      "TikTok accepted the photo post. Processing can take a few minutes before it appears on your profile."
    );

    setTikTokConsent(false);
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "TikTok Publish Failed",
      err.message || "Failed to publish to TikTok."
    );
  } finally {
    setPublishing(false);
  }
};


// ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3
const publishSelectedVideoPlatforms = async () => {
  if (!isVideoCampaign) {
    return false;
  }

  if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
    Alert.alert(
      "Paid Plan Required",
      "Multi-platform video publishing requires a Pro or Business plan."
    );
    return true;
  }

  if (!session?.user?.id) {
    Alert.alert("Login Required", "Please log in before publishing.");
    return true;
  }

  if (!videoUrl) {
    Alert.alert(
      "Missing Video",
      "This Video Studio campaign does not have a video URL."
    );
    return true;
  }

  if (selectedPlatforms.length === 0) {
    Alert.alert(
      "Choose Platforms",
      "Select at least one platform before publishing."
    );
    return true;
  }

  if (
    selectedPlatforms.includes("Facebook") &&
    !selectedFacebookPage
  ) {
    Alert.alert(
      "Missing Facebook Page",
      "Choose the Facebook Page before publishing."
    );
    return true;
  }

  if (selectedPlatforms.includes("TikTok")) {
    if (!tiktokCreator) {
      Alert.alert(
        "TikTok Settings Required",
        "Refresh TikTok posting settings before publishing."
      );
      return true;
    }

    if (!tiktokPrivacy) {
      Alert.alert(
        "Choose Privacy",
        "Select who can view this TikTok post."
      );
      return true;
    }

    if (!tiktokConsent) {
      Alert.alert(
        "Confirmation Required",
        "Confirm the TikTok posting settings before publishing."
      );
      return true;
    }
  }

  const unsupportedForVideo = selectedPlatforms.filter((platform) =>
    ["Pinterest", "X", "LinkedIn"].includes(platform)
  );

  const videoPlatforms = selectedPlatforms.filter((platform) =>
    ["Facebook", "Instagram", "Threads", "TikTok"].includes(platform)
  );

  if (videoPlatforms.length === 0) {
    Alert.alert(
      "No Supported Video Destinations",
      "For Video Studio campaigns, select Facebook, Instagram, Threads, or TikTok. Pinterest, X, and LinkedIn video adapters are not enabled yet."
    );
    return true;
  }

  const finalProductLink = cleanUrl(productLink);
  const baseCaption = [
    removeLinks(title),
    removeLinks(description),
    removeLinks(cta),
    removeLinks(hashtags),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const results: Array<{
    platform: string;
    success: boolean;
    message?: string;
  }> = [];

  setPublishing(true);

  try {
    for (const platform of videoPlatforms) {
      try {
        let endpoint = "";

        let payload: any = {
          userId: session.user.id,
          title: removeLinks(title),
          description: baseCaption,
          videoUrl,
          mediaType: "video",
          productLink: finalProductLink || null,
        };

        if (platform === "Facebook") {
          endpoint = `${BACKEND_URL}/facebook/video-post`;
          payload = {
            ...payload,
            pageId: selectedFacebookPage,
          };
        } else if (platform === "Instagram") {
          endpoint = `${BACKEND_URL}/instagram/video-post`;
        } else if (platform === "Threads") {
          endpoint = `${BACKEND_URL}/threads/video-post`;
        } else if (platform === "TikTok") {
          endpoint = `${BACKEND_URL}/tiktok/video-post`;
          payload = {
            ...payload,
            privacyLevel: tiktokPrivacy,
            disableComment: tiktokDisableComment,
            autoAddMusic: tiktokAutoAddMusic,
            brandOrganicToggle: tiktokOwnBusiness,
            brandContentToggle: tiktokPaidPartnership,
            consent: true,
          };
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        let data: any = {};

        try {
          data = await response.json();
        } catch {
          data = {};
        }

        if (!response.ok || data?.error) {
          const message =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            `${platform} publish failed with HTTP ${response.status}.`;

          results.push({
            platform,
            success: false,
            message: String(message),
          });

          continue;
        }

        results.push({
          platform,
          success: true,
        });
      } catch (error: any) {
        results.push({
          platform,
          success: false,
          message:
            error?.message ||
            "Publishing failed.",
        });
      }
    }
  } finally {
    setPublishing(false);
  }

  const successful = results
    .filter((item) => item.success)
    .map((item) => item.platform);

  const failed = results.filter(
    (item) => !item.success
  );

  const lines: string[] = [];

  if (successful.length) {
    lines.push(
      `Published/submitted: ${successful.join(", ")}`
    );
  }

  if (failed.length) {
    lines.push(
      `Failed: ${failed
        .map(
          (item) =>
            `${item.platform} (${item.message || "unknown error"})`
        )
        .join("; ")}`
    );
  }

  if (unsupportedForVideo.length) {
    lines.push(
      `Not attempted: ${unsupportedForVideo.join(
        ", "
      )} — video publishing adapter not enabled yet.`
    );
  }

  Alert.alert(
    failed.length
      ? "Multi-Platform Publish Results"
      : "Publishing Submitted",
    lines.join("\n\n") ||
      "Publishing finished."
  );

  if (successful.includes("TikTok")) {
    setTikTokConsent(false);
  }

  return true;
};

const postEverywhere = async () => {
  try {
    // ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3
    if (isVideoCampaign) {
      await publishSelectedVideoPlatforms();
      return;
    }

      // ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3 Old Video Studio post-everywhere guard replaced by multi-platform publisher.
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert("Paid Plan Required", "Post Everywhere requires a Pro or Business plan.");
      return;
    }

    if (!title || !description || !imageUrl) {
      Alert.alert("Missing Content", "Title, description, and image URL are required.");
      return;
    }

    if (!selectedBoard) {
      Alert.alert("Missing Pinterest Board", "Please select a Pinterest board first.");
      return;
    }

    if (!selectedFacebookPage) {
      Alert.alert("Missing Facebook Page", "Please select a Facebook Page first.");
      return;
    }

    setPublishing(true);

    const finalProductLink = cleanUrl(productLink);

    const aiResponse = await fetch(`${BACKEND_URL}/generate-platform-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        description,
        hashtags,
        cta,
        productLink: finalProductLink,
        // ARTBOOST_POST_EVERYWHERE_HASHTAG_CONTEXT_V1
        imageUrl,
        storeType: String(productParams.productStoreType || ""),
        storeName: String(productParams.productStoreName || ""),
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok || !aiData.content) {
      throw new Error(
        aiData.error || "Failed to generate platform-specific content."
      );
    }

    const platformContent = aiData.content;

    const pinterestTitle =
      platformContent.pinterest?.title || title;

    const pinterestDescription =
      platformContent.pinterest?.description || description;

    const facebookMessage = removeLinks(
      platformContent.facebook?.message ||
        `${title}\n\n${description}\n\n${cta}\n\n${hashtags}`
    );

    const instagramMessage =
      platformContent.instagram?.message ||
      `${title}\n\n${description}\n\n${cta}\n\n${hashtags}`;

    const xMessage = removeLinks(
      platformContent.x?.message ||
        `${title}\n\n${description}\n\n${hashtags}`
    );

    const threadsMessage =
      platformContent.threads?.message ||
      [
        removeLinks(title),
        removeLinks(description),
        removeLinks(cta),
        removeLinks(hashtags),
        finalProductLink,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

    const linkedInTitle =
      platformContent.linkedin?.title || removeLinks(title);

    const linkedInDescription =
      platformContent.linkedin?.description ||
      [
        removeLinks(description),
        removeLinks(cta),
        removeLinks(hashtags),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

    await fetch(`${BACKEND_URL}/pinterest/create-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId: selectedBoard,
        title: pinterestTitle,
        description: pinterestDescription,
        link: finalProductLink,
        imageUrl,
      }),
    });

    await fetch(isVideoCampaign ? `${BACKEND_URL}/facebook/video-post` : `${BACKEND_URL}/facebook/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: facebookMessage,
        imageUrl,
        pageId: selectedFacebookPage,
        productLink: finalProductLink,
      }),
    });

    await fetch(isVideoCampaign ? `${BACKEND_URL}/instagram/video-post` : `${BACKEND_URL}/instagram/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: instagramMessage,
        imageUrl,
      }),
    });

    await fetch(`${BACKEND_URL}/x/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: xMessage,
        imageUrl,
        productLink: finalProductLink,
      }),
    });

    await fetch(isVideoCampaign ? `${BACKEND_URL}/threads/video-post` : `${BACKEND_URL}/threads/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session?.user?.id || null,
        message: threadsMessage,
        text: threadsMessage,
        imageUrl: imageUrl || null,
        productLink: finalProductLink || null,
      }),
    });

    await fetch(`${BACKEND_URL}/linkedin/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session?.user?.id || null,
        title: linkedInTitle || linkedInDescription,
        description: linkedInDescription,
        imageUrl: imageUrl || null,
        productLink: finalProductLink || null,
      }),
    });

    Alert.alert(
      "Post Everywhere Complete",
      "Your campaign was sent to Pinterest, Facebook, Instagram, X, Threads, and LinkedIn with platform-specific content."
    );
  } catch (err: any) {
    console.log("Post Everywhere failed:", err);

    Alert.alert(
      "Post Everywhere Failed",
      err.message || "One or more platforms failed to publish."
    );
  } finally {
    setPublishing(false);
  }
};

const generateVariations = async () => {
    try {
      if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
        Alert.alert("Paid Plan Required", "AI variations are a Pro feature.");
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
          platform: selectedPlatform,
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
    if (!hasPaidPublishingAccess(profile?.subscription_tier)) {
      Alert.alert("Paid Plan Required", `${feature} requires a Pro or Business plan.`);
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

  const copyReferralCode = async () => {
  if (!profile?.referral_code) {
    Alert.alert("No Referral Code", "Your referral code is not available yet.");
    return;
  }

  await Clipboard.setStringAsync(profile.referral_code);
  Alert.alert("Copied", "Referral code copied to clipboard.");
};

const applyReferralCode = async () => {
  try {
    if (!session?.user?.id) {
      Alert.alert("Login Required", "Please log in before using a referral code.");
      return;
    }

    if (!referralInput.trim()) {
      Alert.alert("Missing Code", "Enter a referral code first.");
      return;
    }

    setApplyingReferral(true);

    const response = await fetch(`${BACKEND_URL}/apply-referral`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: session.user.id,
        referralCode: referralInput.trim().toUpperCase(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      Alert.alert("Referral Error", data.error || "Unable to apply referral code.");
      return;
    }

    setReferralInput("");
    await loadProfile(session.user.id);

    Alert.alert("Referral Applied", "Referral code applied successfully.");
  } catch (err: any) {
    Alert.alert("Referral Error", err.message || "Failed to apply referral code.");
  } finally {
    setApplyingReferral(false);
  }
};

useFocusEffect(
  useCallback(() => {
    loadCurrentCampaign();
  }, [])
);

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
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={23} color="#ffffff" />
        </Pressable>

        <View style={styles.titleCopy}>
          <Text style={styles.header}>Campaign Manager</Text>
          <Text style={styles.subheader}>
            Create, schedule, and publish your artwork.
          </Text>
        </View>
      </View>

      {previewImage || imageUrl ? (
        <View style={styles.artworkCard}>
          <Image
            source={{ uri: previewImage || imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
            onError={(event) => {
              const failedUri = previewImage || imageUrl;

              console.log(
                "Campaign artwork preview failed:",
                failedUri,
                event.nativeEvent?.error
              );

              // If previewImage and imageUrl are different, retry the
              // publishing image instead of leaving a blank artwork card.
              if (
                previewImage &&
                imageUrl &&
                previewImage !== imageUrl
              ) {
                setPreviewImage(imageUrl);
              }
            }}
          />
          <View style={styles.artworkMeta}>
            <Text style={styles.artworkLabel}>Selected artwork</Text>
            <Text style={styles.artworkTitle} numberOfLines={2}>
              {title || "Untitled campaign"}
            </Text>
            {productLink ? (
              <Pressable
                style={styles.linkButton}
                onPress={() => Linking.openURL(cleanUrl(productLink))}
              >
                <Ionicons name="open-outline" size={16} color="#ffffff" />
                <Text style={styles.linkButtonText}>View product</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Publish to</Text>
        <Text style={styles.sectionHint}>
          Select one or more platforms for this campaign.
        </Text>


          {/* ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3 */}
          <View style={styles.multiSelectActions}>
            <Pressable
              style={styles.multiSelectAction}
              onPress={selectAllPublishPlatforms}
            >
              <Text style={styles.multiSelectActionText}>Select All</Text>
            </Pressable>

            <Pressable
              style={styles.multiSelectAction}
              onPress={clearPublishPlatforms}
            >
              <Text style={styles.multiSelectActionText}>Clear All</Text>
            </Pressable>

            <Text style={styles.multiSelectCount}>
              {selectedPlatforms.length} selected
            </Text>
          </View>
<View style={styles.platformGrid}>
          {(["Pinterest", "Facebook", "Instagram", "X", "Threads", "LinkedIn", "TikTok"] as const).map(
            (platform) => (
              <Pressable
                key={platform}
                style={[
                  styles.platformButton,
                  selectedPlatforms.includes(platform as MultiPublishPlatform) && styles.platformButtonActive,
                ]}
                onPress={() => togglePublishPlatform(platform as MultiPublishPlatform)}
              >
                <Ionicons
                  name={
                    platform === "Pinterest"
                      ? "logo-pinterest"
                      : platform === "Facebook"
                      ? "logo-facebook"
                      : platform === "Instagram"
                      ? "logo-instagram"
                      : platform === "Threads"
                      ? "at-circle-outline"
                      : platform === "LinkedIn"
                      ? "logo-linkedin"
                      : platform === "TikTok"
                      ? "logo-tiktok"
                      : "logo-twitter"
                  }
                  size={18}
                  color={selectedPlatforms.includes(platform as MultiPublishPlatform) ? "#ffffff" : "#b7b7b7"}
                />
                <Text
                  style={[
                    styles.platformButtonText,
                    selectedPlatforms.includes(platform as MultiPublishPlatform) && styles.platformButtonTextActive,
                  ]}
                >
                  {platform}
                </Text>
              </Pressable>
            )
          )}
        </View>
      </View>

      {(selectedPlatforms.includes("Pinterest" as MultiPublishPlatform) || selectedPlatform === "Pinterest") && (
        <View style={styles.card}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionRowText}>
              <Text style={styles.sectionHeader}>Pinterest board</Text>
              <Text style={styles.sectionHint}>Choose where this pin will publish.</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={loadBoards}>
              <Ionicons name="refresh" size={18} color="#ffffff" />
            </Pressable>
          </View>

          {loadingBoards ? (
            <Text style={styles.loading}>Loading boards...</Text>
          ) : boards.length > 0 ? (
            <View style={styles.optionWrap}>
              {boards.map((board: any) => (
                <Pressable
                  key={board.id}
                  style={[
                    styles.optionPill,
                    selectedBoard === board.id && styles.optionPillActive,
                  ]}
                  onPress={() => setSelectedBoard(board.id)}
                >
                  <Text style={styles.optionPillText}>{board.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.boardError}>
              {boardError || "No boards loaded. Refresh or reconnect Pinterest."}
            </Text>
          )}
        </View>
      )}

      {(selectedPlatforms.includes("Facebook" as MultiPublishPlatform) || selectedPlatform === "Facebook") && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Facebook page</Text>
          <Text style={styles.sectionHint}>
            Select the Page that should publish this campaign.
          </Text>
          {facebookPages.length > 0 ? (
            <View style={styles.optionWrap}>
              {facebookPages.map((page: any) => (
                <Pressable
                  key={page.id}
                  style={[
                    styles.optionPill,
                    selectedFacebookPage === page.id && styles.optionPillActive,
                  ]}
                  onPress={() => setSelectedFacebookPage(page.id)}
                >
                  <Text style={styles.optionPillText}>{page.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.boardError}>
              No Facebook Pages loaded. Refresh or reconnect Facebook.
            </Text>
          )}
        </View>
      )}

      {(selectedPlatforms.includes("TikTok" as MultiPublishPlatform) || selectedPlatform === "TikTok") && (
        <View style={styles.card}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionRowText}>
              <Text style={styles.sectionHeader}>
                TikTok posting settings
              </Text>
              <Text style={styles.sectionHint}>
                Review the creator account, privacy, interactions, music, and commercial-content disclosure before sending anything to TikTok.
              </Text>
            </View>

            <Pressable
              style={styles.iconButton}
              onPress={loadTikTokCreatorInfo}
              disabled={loadingTikTokCreator}
            >
              <Ionicons
                name="refresh"
                size={18}
                color="#ffffff"
              />
            </Pressable>
          </View>

          {loadingTikTokCreator ? (
            <Text style={styles.loading}>
              Loading TikTok settings...
            </Text>
          ) : tiktokCreator ? (
            <>
              <Text style={styles.tiktokAccountName}>
                @{tiktokCreator.creator_username ||
                  "TikTok creator"}
              </Text>

              {tiktokCreator.creator_nickname ? (
                <Text style={styles.sectionHint}>
                  {tiktokCreator.creator_nickname}
                </Text>
              ) : null}

              <Text style={styles.label}>
                Who can view this post?
              </Text>

              <View style={styles.optionWrap}>
                {(
                  tiktokCreator.privacy_level_options ||
                  []
                ).map((privacy: string) => (
                  <Pressable
                    key={privacy}
                    style={[
                      styles.optionPill,
                      tiktokPrivacy === privacy &&
                        styles.optionPillActive,
                    ]}
                    onPress={() => {
                      setTikTokPrivacy(privacy);
                      setTikTokConsent(false);
                    }}
                  >
                    <Text style={styles.optionPillText}>
                      {getTikTokPrivacyLabel(privacy)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.tiktokSandboxNote}>
                During TikTok's unaudited testing period, choose "Only me" for Direct Post testing.
              </Text>

              <View style={styles.tiktokSettingRow}>
                <View style={styles.tiktokSettingCopy}>
                  <Text style={styles.tiktokSettingTitle}>
                    Allow comments
                  </Text>
                  <Text style={styles.sectionHint}>
                    TikTok reports whether comments are available for this creator.
                  </Text>
                </View>

                <Switch
                  value={!tiktokDisableComment}
                  disabled={
                    Boolean(
                      tiktokCreator.comment_disabled
                    )
                  }
                  onValueChange={(value) => {
                    setTikTokDisableComment(!value);
                    setTikTokConsent(false);
                  }}
                />
              </View>

              <View style={styles.tiktokSettingRow}>
                <View style={styles.tiktokSettingCopy}>
                  <Text style={styles.tiktokSettingTitle}>
                    Auto-add music
                  </Text>
                  <Text style={styles.sectionHint}>
                    Let TikTok add recommended music to the photo post.
                  </Text>
                </View>

                <Switch
                  value={tiktokAutoAddMusic}
                  onValueChange={(value) => {
                    setTikTokAutoAddMusic(value);
                    setTikTokConsent(false);
                  }}
                />
              </View>

              <Text style={styles.label}>
                Commercial content disclosure
              </Text>

              <View style={styles.tiktokSettingRow}>
                <View style={styles.tiktokSettingCopy}>
                  <Text style={styles.tiktokSettingTitle}>
                    Promoting my own business
                  </Text>
                  <Text style={styles.sectionHint}>
                    Use this when the post promotes the creator's own artwork, products, shop, or business.
                  </Text>
                </View>

                <Switch
                  value={tiktokOwnBusiness}
                  onValueChange={(value) => {
                    setTikTokOwnBusiness(value);
                    setTikTokConsent(false);
                  }}
                />
              </View>

              <View style={styles.tiktokSettingRow}>
                <View style={styles.tiktokSettingCopy}>
                  <Text style={styles.tiktokSettingTitle}>
                    Paid partnership
                  </Text>
                  <Text style={styles.sectionHint}>
                    Enable only when promoting a third-party business as branded content.
                  </Text>
                </View>

                <Switch
                  value={tiktokPaidPartnership}
                  onValueChange={(value) => {
                    setTikTokPaidPartnership(value);
                    setTikTokConsent(false);
                  }}
                />
              </View>

              <Pressable
                style={styles.tiktokConsentRow}
                onPress={() =>
                  setTikTokConsent(
                    current => !current
                  )
                }
              >
                <View
                  style={[
                    styles.tiktokConsentBox,
                    tiktokConsent &&
                      styles.tiktokConsentBoxActive,
                  ]}
                >
                  {tiktokConsent ? (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color="#ffffff"
                    />
                  ) : null}
                </View>

                <Text style={styles.tiktokConsentText}>
                  I reviewed the artwork, editable caption, privacy setting, interaction settings, music setting, and commercial-content disclosure. Send this post to TikTok.
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.boardError}>
              TikTok posting settings are unavailable. Refresh or reconnect TikTok.
            </Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Campaign content</Text>

        <Text style={styles.label}>{selectedPlatform} title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Campaign title"
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>{selectedPlatform} description</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Campaign description"
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Call to action</Text>
        <TextInput
          style={[styles.input, styles.compactTextarea]}
          multiline
          value={cta}
          onChangeText={setCta}
          placeholder="Add a clear call to action"
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Hashtags</Text>
        <TextInput
          style={[styles.input, styles.compactTextarea]}
          multiline
          value={hashtags}
          onChangeText={setHashtags}
          placeholder="#art #artist #shopsmall"
          placeholderTextColor="#777"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Quick actions</Text>
        <View style={styles.actionGrid}>
          <Pressable style={styles.actionButton} onPress={postEverywhere}>
            <Ionicons name="send" size={19} color="#ffffff" />
            <Text style={styles.actionButtonTitle}>Post everywhere</Text>
            <Text style={styles.actionButtonText}>Publish on all connected platforms.</Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={generateVariations}>
            <Ionicons name="sparkles" size={19} color="#ffffff" />
            <Text style={styles.actionButtonTitle}>
              {loadingVariations ? "Generating..." : "AI variations"}
            </Text>
            <Text style={styles.actionButtonText}>Create alternate campaign copy.</Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={saveScheduledCampaign}>
            <Ionicons name="calendar" size={19} color="#ffffff" />
            <Text style={styles.actionButtonTitle}>Schedule platform</Text>
            <Text style={styles.actionButtonText}>Schedule the selected platform.</Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={scheduleEverywhere}>
            <Ionicons name="albums" size={19} color="#ffffff" />
            <Text style={styles.actionButtonTitle}>Schedule all</Text>
            <Text style={styles.actionButtonText}>Schedule every available platform.</Text>
          </Pressable>
        </View>
      </View>

      {variations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>AI variations</Text>
          {variations.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.variationCard}>
              <Text style={styles.variationStyle}>{item.style}</Text>
              <Text style={styles.variationTitle}>{item.title}</Text>
              <Text style={styles.variationDescription}>{item.description}</Text>
              <View style={styles.inlineActions}>
                <Pressable
                  style={styles.secondaryAction}
                  onPress={() => copyVariation(item.title, item.description)}
                >
                  <Text style={styles.secondaryActionText}>Copy</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryAction}
                  onPress={() => useVariation(item.title, item.description)}
                >
                  <Text style={styles.primaryActionText}>Use version</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Schedule</Text>
        <View style={styles.scheduleSummary}>
          <View style={styles.scheduleValue}>
            <Text style={styles.scheduleTitle}>Date</Text>
            <Text style={styles.scheduleText}>{getReadableDate()}</Text>
          </View>
          <View style={styles.scheduleValue}>
            <Text style={styles.scheduleTitle}>Time</Text>
            <Text style={styles.scheduleText}>{getReadableTime()}</Text>
          </View>
        </View>

        <View style={styles.scheduleButtons}>
          <Pressable
            style={styles.scheduleButton}
            onPress={() => {
              setShowTimePicker(false);
              setShowDatePicker(!showDatePicker);
            }}
          >
            <Ionicons name="calendar-outline" size={17} color="#ffffff" />
            <Text style={styles.scheduleButtonText}>Select date</Text>
          </Pressable>
          <Pressable
            style={styles.scheduleButton}
            onPress={() => {
              setShowDatePicker(false);
              setShowTimePicker(!showTimePicker);
            }}
          >
            <Ionicons name="time-outline" size={17} color="#ffffff" />
            <Text style={styles.scheduleButtonText}>Select time</Text>
          </Pressable>
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
            <Pressable style={styles.donePickerButton} onPress={() => setShowDatePicker(false)}>
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
            <Pressable style={styles.donePickerButton} onPress={() => setShowTimePicker(false)}>
              <Text style={styles.donePickerText}>Done</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>Repeat</Text>
        <View style={styles.presetRow}>
          <Pressable
            style={[styles.presetButton, repostPreset === null && styles.presetButtonActive]}
            onPress={() => setRepostPreset(null)}
          >
            <Text style={styles.presetButtonText}>One time</Text>
          </Pressable>
          <Pressable
            style={[styles.presetButton, repostPreset === "daily" && styles.presetButtonActive]}
            onPress={() => applyRepostPreset("daily")}
          >
            <Text style={styles.presetButtonText}>Daily</Text>
          </Pressable>
          <Pressable
            style={[styles.presetButton, repostPreset === "3days" && styles.presetButtonActive]}
            onPress={() => applyRepostPreset("3days")}
          >
            <Text style={styles.presetButtonText}>Every 3 days</Text>
          </Pressable>
          <Pressable
            style={[styles.presetButton, repostPreset === "weekly" && styles.presetButtonActive]}
            onPress={() => applyRepostPreset("weekly")}
          >
            <Text style={styles.presetButtonText}>Weekly</Text>
          </Pressable>
          <Pressable
            style={[styles.presetButton, repostPreset === "monthly" && styles.presetButtonActive]}
            onPress={() => applyRepostPreset("monthly")}
          >
            <Text style={styles.presetButtonText}>Monthly</Text>
          </Pressable>
        </View>
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
  disabled={publishing}
  style={[
  styles.publishButton,
  selectedPlatform === "Facebook"
    ? styles.facebookButton
    : styles.pinterestButton,
]}
  onPress={() => {

  if (selectedPlatform === "Facebook") {

  createFacebookPost();

}

else if (selectedPlatform === "Instagram") {

  createInstagramPost();

}

else if (selectedPlatform === "X") {

  createXPost();

}

else if (selectedPlatform === "Threads") {

  createThreadsPost();

}

else if (selectedPlatform === "LinkedIn") {

  createLinkedInPost();

}

else if (selectedPlatform === "TikTok") {

  createTikTokPost();

}

else {

  createPinterestPin();

}

}}
>
        <Text style={styles.publishText}>
          {publishing
  ? "Publishing..."
  : `Publish to ${selectedPlatform}`}
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

  titleCopy: {
    flex: 1,
  },

  artworkCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b2b2b",
    overflow: "hidden",
    marginBottom: 14,
  },

  heroImage: {
    width: "100%",
    height: 220,
    backgroundColor: "#242424",
  },

  artworkMeta: {
    padding: 14,
  },

  artworkLabel: {
    color: "#9a9a9a",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 5,
  },

  artworkTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },

  linkButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#2f6fe4",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 12,
  },

  linkButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  sectionHint: {
    color: "#a7a7a7",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 12,
  },

  platformGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  platformButton: {
    width: "48%",
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#292929",
    borderWidth: 1,
    borderColor: "#343434",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  platformButtonActive: {
    backgroundColor: "#7c3aed",
    borderColor: "#9b6cff",
  },

  platformButtonText: {
    color: "#b7b7b7",
    fontSize: 13,
    fontWeight: "800",
  },

  platformButtonTextActive: {
    color: "#ffffff",
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionRowText: {
    flex: 1,
    paddingRight: 12,
  },

  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#2b2b2b",
    alignItems: "center",
    justifyContent: "center",
  },

  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  optionPill: {
    backgroundColor: "#292929",
    borderWidth: 1,
    borderColor: "#3a3a3a",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  optionPillActive: {
    backgroundColor: "#7c3aed",
    borderColor: "#9b6cff",
  },

  optionPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  compactTextarea: {
    minHeight: 82,
    textAlignVertical: "top",
  },

  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },

  actionButton: {
    width: "48%",
    minHeight: 118,
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "#343434",
    borderRadius: 14,
    padding: 13,
  },

  actionButtonTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 11,
  },

  actionButtonText: {
    color: "#a8a8a8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },

  inlineActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },

  secondaryAction: {
    flex: 1,
    backgroundColor: "#303030",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },

  secondaryActionText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },

  primaryAction: {
    flex: 1,
    backgroundColor: "#7c3aed",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },

  primaryActionText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12,
  },

  scheduleSummary: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },

  scheduleValue: {
    flex: 1,
    backgroundColor: "#282828",
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 6,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  header: {
    flex: 1,
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
  },

  subheader: {
    color: "#aaa",
    marginLeft: 52,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 21,
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

  scheduleTitle: {
  color: "#9ca3af",
  fontSize: 13,
  fontWeight: "700",
  marginTop: 12,
  marginBottom: 4,
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

  campaignImagePreview: {
  width: "100%",
  height: 220,
  borderRadius: 12,
  marginBottom: 12,
  backgroundColor: "#202020",
},

readyText: {
  color: "#9be88f",
  fontSize: 13,
  fontWeight: "700",
  marginBottom: 8,
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
  tiktokAccountName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 10,
  },

  tiktokSandboxNote: {
    color: "#f6c453",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    marginBottom: 4,
  },

  tiktokSettingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2b2b2b",
  },

  tiktokSettingCopy: {
    flex: 1,
  },

  tiktokSettingTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },

  tiktokConsentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },

  tiktokConsentBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#777777",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },

  tiktokConsentBoxActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },

  tiktokConsentText: {
    flex: 1,
    color: "#d0d0d0",
    fontSize: 11,
    lineHeight: 17,
  },
  // ARTBOOST_VIDEO_MULTI_PLATFORM_PUBLISH_V1_3
  multiSelectActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  multiSelectAction: {
    borderWidth: 1,
    borderColor: "#3a3c47",
    backgroundColor: "#202127",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  multiSelectActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  multiSelectCount: {
    color: "#a7a9b4",
    fontSize: 12,
    marginLeft: "auto",
  }
});
