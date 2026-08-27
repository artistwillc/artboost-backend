/* eslint-disable react/no-unescaped-entities */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
 
import { supabase } from "@/lib/supabase";
import AIConsultantAvatar from "@/components/AIConsultantAvatar";
 
const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";
 
const PLATFORMS = [
  "Pinterest",
  "Instagram",
  "Facebook",
  "X",
  "Threads",
  "LinkedIn",
  "TikTok",
];
 
const STYLE_PRESETS = [
  "Bold Sales",
  "Luxury Art Dealer",
  "Streetwear Hype",
  "Pinterest SEO",
  "Funny Viral",
  "Minimal Professional",
];
 
const SECTION_HEADERS = ["TITLE", "DESCRIPTION", "HASHTAGS", "CTA"];
 
const REPEAT_OPTIONS = [
  { label: "One Time", value: "one_time" },
  { label: "Weekly", value: "weekly" },
  { label: "Every 2 Weeks", value: "biweekly" },
  { label: "Monthly", value: "monthly" },
];
 
export default function HomeScreen() {
 
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
 
  const [image, setImage] = useState<string | null>(null);
  const [hostedImageUrl, setHostedImageUrl] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
 
  const [productLink, setProductLink] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("Pinterest");
  const [selectedStyle, setSelectedStyle] = useState("Bold Sales");
 
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [postingNow, setPostingNow] = useState(false);
 
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [repeatType, setRepeatType] = useState("one_time");
  const [scheduleDaysOut, setScheduleDaysOut] = useState("1");
  const [scheduling, setScheduling] = useState(false);

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

  const [homeMode, setHomeMode] = useState<
    "home" | "upload"
  >("home");

  const [homeAnalytics, setHomeAnalytics] = useState<any>(null);
  const [homeAnalyticsLoading, setHomeAnalyticsLoading] = useState(false);

  const loadHomeAnalytics = async () => {
    try {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (!activeSession?.access_token) return;
      setHomeAnalyticsLoading(true);
      const response = await fetch(`${BACKEND_URL}/analytics`, {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });
      const data = await response.json();
      if (response.ok) setHomeAnalytics(data);
    } catch (error) {
      console.log("Home overview analytics unavailable:", error);
    } finally {
      setHomeAnalyticsLoading(false);
    }
  };
 
  useEffect(() => {
    loadSession();
    loadBoards();
 
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
 
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });
 
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);
 
  useEffect(() => {
    if (session?.user?.id) loadHomeAnalytics();
  }, [session?.user?.id]);

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

      const responseText =
        await response.text();

      let data: any = {};

      try {
        data = responseText
          ? JSON.parse(responseText)
          : {};
      } catch {
        throw new Error(
          `TikTok settings returned HTTP ${response.status} with an invalid response.`
        );
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Unable to load TikTok posting settings."
        );
      }

      const creator =
        data.creator || null;

      setTikTokCreator(creator);
      setTikTokPrivacy("");
      setTikTokConsent(false);
      setTikTokDisableComment(
        Boolean(creator?.comment_disabled)
      );
    } catch (error: any) {
      console.log(
        "TikTok creator info failed:",
        error
      );

      setTikTokCreator(null);

      Alert.alert(
        "TikTok Settings Error",
        error?.message ||
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

  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
 
    setSession(data.session);
 
    if (data.session?.user?.id) {
      await loadProfile(data.session.user.id);
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
 
  const signUp = async () => {
  if (!authEmail || !authPassword) {
    Alert.alert("Missing Info", "Enter an email and password.");
    return;
  }
 
  try {
    setAuthLoading(true);
 
    const result = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
    });
 
    console.log("SIGNUP RESULT:", JSON.stringify(result, null, 2));
 
    if (result.error) {
      Alert.alert("Signup Error", result.error.message);
      return;
    }
 
    Alert.alert(
      "Account Created",
      "Account created. If email confirmation is required, check your email before logging in."
    );
  } catch (err: any) {
    console.log("SIGNUP EXCEPTION:", err);
    Alert.alert("Signup Exception", err?.message || JSON.stringify(err));
  } finally {
    setAuthLoading(false);
  }
};
 
  const signIn = async () => {
  if (!authEmail || !authPassword) {
    Alert.alert("Missing Info", "Enter your email and password.");
    return;
  }
 
  try {
    setAuthLoading(true);
 
    const result = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
 
    console.log("LOGIN RESULT:", JSON.stringify(result, null, 2));
 
    if (result.error) {
      Alert.alert("Login Error", result.error.message);
      return;
    }
 
    Alert.alert("Logged In", "Welcome back to ArtBoost AI.");
  } catch (err: any) {
    console.log("LOGIN EXCEPTION:", err);
    Alert.alert("Login Error", err?.message || JSON.stringify(err));
  } finally {
    setAuthLoading(false);
  }
};
 
  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };
 
  const parseSections = (text: string) => {
    if (!text) return [];
 
    const escaped = SECTION_HEADERS.map((h) =>
      h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
 
    const regex = new RegExp(`(${escaped.join("|")}):`, "g");
    const matches = [...text.matchAll(regex)];
 
    if (matches.length === 0) {
      return [
        {
          title: `${selectedPlatform} Content`,
          content: text.trim(),
        },
      ];
    }
 
    return matches.map((match, index) => {
      const title = match[1];
      const start = (match.index || 0) + match[0].length;
 
      const end =
        index + 1 < matches.length
          ? matches[index + 1].index || text.length
          : text.length;
 
      return {
        title,
        content: text.slice(start, end).trim(),
      };
    });
  };
 
  const sections = useMemo(() => {
    return parseSections(result);
  }, [result]);
 
  const getSectionContent = (sectionTitle: string, sectionList: any[]) => {
    const found = sectionList.find((section) => section.title === sectionTitle);
    return found?.content || "";
  };
 
  const buildCurrentCampaign = (
    generatedText = result,
    imageUrlFromBackend = hostedImageUrl
  ) => {
    const parsed = parseSections(generatedText);
 
    const title =
      getSectionContent("TITLE", parsed) || `${selectedPlatform} Campaign`;
 
    const description =
  getSectionContent("DESCRIPTION", parsed) || generatedText;
 
const hashtags =
  getSectionContent("HASHTAGS", parsed);
 
const cta =
  getSectionContent("CTA", parsed);
 
return {
      id: Date.now().toString(),
      image,
      imageUrl: imageUrlFromBackend,
      result: generatedText,
      productLink,
      platform: selectedPlatform,
      style: selectedStyle,
      title,
      pinterestTitle: title,
      description,
pinterestDescription: description,
hashtags,
cta,
      createdAt: new Date().toLocaleString(),
    };
  };
 
  const pickImage = async () => {
    try {
      if (Platform.OS === "android") {
        const picked = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          copyToCacheDirectory: true,
          multiple: false,
        });

        if (!picked.canceled && picked.assets?.length) {
          setImage(picked.assets[0].uri);
          setHostedImageUrl("");
          setResult("");
          setShowScheduleOptions(false);
        }

        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (!picked.canceled) {
        setImage(picked.assets[0].uri);
        setHostedImageUrl("");
        setResult("");
        setShowScheduleOptions(false);
      }
    } catch (error: any) {
      console.log("Artwork picker error:", error);

      Alert.alert(
        "Unable to Select Artwork",
        error?.message || "ArtBoost could not open the artwork picker."
      );
    }
  };
 
  const storeCurrentCampaign = async (
    generatedText: string,
    imageUrlFromBackend: string
  ) => {
    const currentCampaign = buildCurrentCampaign(
      generatedText,
      imageUrlFromBackend
    );
 
    await AsyncStorage.setItem(
      "artboost_current_campaign",
      JSON.stringify(currentCampaign)
    );
  };
 
  const loadBoards = async () => {
    try {
      setLoadingBoards(true);
 
      const response = await fetch(`${BACKEND_URL}/pinterest/boards`);
      const data = await response.json();
 
      if (!response.ok) {
        setBoards([]);
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
      }
    } catch (error) {
      console.log("Board load error:", error);
    } finally {
      setLoadingBoards(false);
    }
  };
 
  const sendToProTools = async () => {
    if (!result || !image) {
      Alert.alert("Missing Campaign", "Generate content before sending to Pro tools.");
      return;
    }
 
    const currentCampaign = buildCurrentCampaign();
 
    await AsyncStorage.setItem(
      "artboost_current_campaign",
      JSON.stringify(currentCampaign)
    );
 
    Alert.alert(
      "Campaign Ready",
      "Your generated campaign is ready in the Pro tab for posting or scheduling."
    );
  };
 
const createFacebookPost = async () => {
  Alert.alert(
    "Facebook Connected",
    "Facebook workflow is active. Direct Facebook Page publishing is the next backend step."
  );
};
 
  const postNow = async () => {
    if (String(profile?.subscription_tier).toLowerCase() !== "pro") {
      Alert.alert(
        "Pro Required",
        "Posting directly to platforms is a Pro feature."
      );
      return;
    }

    if (!result || !hostedImageUrl) {
      Alert.alert(
        "Missing Campaign",
        "Generate content before posting."
      );
      return;
    }

    const campaign = buildCurrentCampaign();
    const rawProductLink = productLink.trim();
    const finalProductLink = rawProductLink
      ? /^https?:\/\//i.test(rawProductLink)
        ? rawProductLink
        : `https://${rawProductLink}`
      : "";

    try {
      setPostingNow(true);

      await AsyncStorage.setItem(
        "artboost_current_campaign",
        JSON.stringify(campaign)
      );

      if (selectedPlatform === "Instagram") {
        const instagramCta = finalProductLink
          ? `Shop this design: ${finalProductLink}`
          : campaign.cta;

        const message = [
          campaign.title,
          campaign.description,
          instagramCta,
          campaign.hashtags,
        ]
          .filter(Boolean)
          .join("\n\n");

        const response = await fetch(
          `${BACKEND_URL}/instagram/post`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: session?.user?.id || null,
              message,
              imageUrl: hostedImageUrl,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok || data?.error) {
          console.log("Instagram post error:", data);

          Alert.alert(
            "Instagram Post Failed",
            data?.error?.message ||
              data?.error ||
              "Instagram could not publish this post."
          );
          return;
        }

        Alert.alert(
          "Instagram Published",
          "Your artwork was successfully posted to Instagram."
        );
        return;
      }

      if (selectedPlatform === "Threads") {
        const response = await fetch(
          `${BACKEND_URL}/threads/post`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: session?.user?.id || null,
              title: campaign.title,
              description: campaign.description,
              hashtags: campaign.hashtags,
              cta: campaign.cta,
              productLink: finalProductLink || null,
              imageUrl: hostedImageUrl,
            }),
          }
        );

        const responseText =
          await response.text();

        let data: any = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          console.log(
            "Threads non-JSON response:",
            response.status,
            responseText.slice(0, 300)
          );

          Alert.alert(
            "Threads Post Failed",
            `ArtBoost received an invalid response from the Threads publishing endpoint (HTTP ${response.status}).`
          );
          return;
        }

        if (!response.ok || data?.error) {
          console.log(
            "Threads post error:",
            data
          );

          Alert.alert(
            "Threads Post Failed",
            data?.error?.message ||
              data?.error ||
              "Threads could not publish this post."
          );
          return;
        }

        Alert.alert(
          "Threads Published",
          "Your artwork was successfully posted to Threads."
        );
        return;
      }

      if (selectedPlatform === "LinkedIn") {
        const linkedInTitle =
          String(campaign.title || "")
            .replace(/https?:\/\/\S+/gi, "")
            .replace(/www\.\S+/gi, "")
            .trim();

        const linkedInDescription = [
          campaign.description,
          campaign.cta,
          campaign.hashtags,
        ]
          .filter(Boolean)
          .join("\n\n")
          .replace(/https?:\/\/\S+/gi, "")
          .replace(/www\.\S+/gi, "")
          .trim();

        const response = await fetch(
          `${BACKEND_URL}/linkedin/post`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: session?.user?.id || null,
              title:
                linkedInTitle ||
                linkedInDescription,
              description:
                linkedInDescription,
              imageUrl:
                hostedImageUrl || null,
              productLink:
                finalProductLink || null,
            }),
          }
        );

        const responseText =
          await response.text();

        let data: any = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          console.log(
            "LinkedIn non-JSON response:",
            response.status,
            responseText.slice(0, 300)
          );

          Alert.alert(
            "LinkedIn Post Failed",
            `ArtBoost received an invalid response from the LinkedIn publishing endpoint (HTTP ${response.status}).`
          );
          return;
        }

        if (!response.ok || data?.error) {
          console.log(
            "LinkedIn post error:",
            data
          );

          Alert.alert(
            "LinkedIn Post Failed",
            data?.error?.message ||
              data?.error ||
              "LinkedIn could not publish this post."
          );
          return;
        }

        Alert.alert(
          "LinkedIn Published",
          "Your artwork was successfully posted to LinkedIn."
        );
        return;
      }

      if (selectedPlatform === "TikTok") {
        if (!session?.user?.id) {
          Alert.alert(
            "Login Required",
            "Please log in before publishing to TikTok."
          );
          return;
        }

        if (!tiktokCreator) {
          Alert.alert(
            "TikTok Settings Required",
            "Load TikTok posting settings before publishing."
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

        const removeLinks = (value: string) =>
          String(value || "")
            .replace(/https?:\/\/\S+/gi, "")
            .replace(/www\.\S+/gi, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        const caption = [
          removeLinks(campaign.title),
          removeLinks(campaign.description),
          removeLinks(campaign.cta),
          removeLinks(campaign.hashtags),
        ]
          .filter(Boolean)
          .join("\n\n")
          .trim();

        const response = await fetch(
          `${BACKEND_URL}/tiktok/photo-post`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: session.user.id,
              title:
                removeLinks(campaign.title),
              description: caption,
              imageUrl: hostedImageUrl,
              productLink:
                finalProductLink || null,
              privacyLevel:
                tiktokPrivacy,
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

        const responseText =
          await response.text();

        let data: any = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          console.log(
            "TikTok non-JSON response:",
            response.status,
            responseText.slice(0, 300)
          );

          Alert.alert(
            "TikTok Publish Failed",
            `ArtBoost received an invalid response from the TikTok publishing endpoint (HTTP ${response.status}).`
          );
          return;
        }

        if (!response.ok || data?.error) {
          console.log(
            "TikTok post error:",
            data
          );

          Alert.alert(
            "TikTok Publish Failed",
            data?.error?.message ||
              data?.error ||
              "TikTok could not publish this photo."
          );
          return;
        }

        setTikTokConsent(false);

        Alert.alert(
          "TikTok Submitted",
          data?.message ||
            "TikTok accepted the photo post. Processing can take a few minutes before it appears."
        );
        return;
      }

      if (selectedPlatform === "Facebook") {
        Alert.alert(
          "Facebook Posting",
          "Use Campaign Manager to choose the Facebook Page before posting."
        );
        return;
      }

      if (selectedPlatform === "X") {
        const messageWithoutLink = [
          campaign.title,
          campaign.description,
          campaign.hashtags,
        ]
          .filter(Boolean)
          .join("\n\n");

        const response = await fetch(`${BACKEND_URL}/x/post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session?.user?.id || null,
            message: messageWithoutLink,
            imageUrl: hostedImageUrl,
            productLink: finalProductLink || null,
          }),
        });

        const responseText =
          await response.text();

        let data: any = {};

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {};
        } catch {
          console.log(
            "X non-JSON response:",
            response.status,
            responseText.slice(0, 300)
          );

          Alert.alert(
            "X Post Failed",
            `ArtBoost received an invalid response from the X publishing endpoint (HTTP ${response.status}).`
          );
          return;
        }

        if (!response.ok || data?.error) {
          console.log("X post error:", data);

          Alert.alert(
            "X Post Failed",
            data?.details ||
              data?.error?.message ||
              data?.error ||
              "X could not publish this post."
          );
          return;
        }

        Alert.alert(
          "X Published",
          "Your artwork was successfully posted to X."
        );
        return;
      }

      if (selectedPlatform === "Pinterest") {
        if (!selectedBoard) {
          Alert.alert(
            "Missing Board",
            "Select a Pinterest board before posting."
          );
          return;
        }

        const response = await fetch(
          `${BACKEND_URL}/pinterest/create-pin`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              boardId: selectedBoard,
              title: campaign.pinterestTitle,
              description: campaign.pinterestDescription,
              link: finalProductLink,
              imageUrl: hostedImageUrl,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.log("Pinterest post error:", data);

          Alert.alert(
            "Pinterest Approval Pending",
            "Pinterest posting is ready, but your Pinterest Developer app is still pending production approval.\n\nUntil Pinterest approves Standard Access, live pin creation is blocked."
          );
          return;
        }

        Alert.alert(
          "Pinterest Published",
          "Your campaign was posted to Pinterest."
        );
      }
    } catch (error: any) {
      console.log("Post now error:", error);

      Alert.alert(
        "Post Failed",
        error?.message ||
          "Unable to post right now. Try again shortly."
      );
    } finally {
      setPostingNow(false);
    }
  };

  const scheduleRepost = async () => {
    if (String(profile?.subscription_tier).toLowerCase() !== "pro") {
      Alert.alert("Pro Required", "Scheduled reposting is a Pro feature.");
      return;
    }
 
    if (!result || !hostedImageUrl) {
      Alert.alert("Missing Campaign", "Generate content before scheduling.");
      return;
    }
 
    if (selectedPlatform === "Pinterest" && !selectedBoard) {
      Alert.alert("Missing Board", "Select a Pinterest board before scheduling.");
      return;
    }
 
    const daysOut = Number(scheduleDaysOut);
 
    if (!Number.isFinite(daysOut) || daysOut < 1) {
      Alert.alert("Invalid Schedule", "Enter a number of days from now, such as 1, 7, or 30.");
      return;
    }
 
    const campaign = buildCurrentCampaign();
    const publishAtDate = new Date();
    publishAtDate.setDate(publishAtDate.getDate() + daysOut);
 
    try {
      setScheduling(true);
 
      await AsyncStorage.setItem(
        "artboost_current_campaign",
        JSON.stringify(campaign)
      );
 
      const response = await fetch(`${BACKEND_URL}/schedule-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: session?.user?.id || null,
          title: campaign.pinterestTitle,
          description: campaign.pinterestDescription,
          imageUrl: hostedImageUrl,
          productLink,
          boardId: selectedBoard || null,
          publishAt: publishAtDate.toISOString(),
          platform: selectedPlatform,
          repeatType,
          nextRunAt: publishAtDate.toISOString(),
        }),
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        Alert.alert("Schedule Error", data.error || "Failed to schedule repost.");
        return;
      }
 
      Alert.alert(
        "Repost Scheduled",
        `Your campaign was scheduled ${daysOut} day(s) from now with repeat type: ${
          REPEAT_OPTIONS.find((option) => option.value === repeatType)?.label ||
          "One Time"
        }.`
      );
 
      setShowScheduleOptions(false);
    } catch (error: any) {
      console.log("Schedule repost error:", error);
 
      Alert.alert(
        "Schedule Error",
        error?.message || "Unable to schedule repost right now."
      );
    } finally {
      setScheduling(false);
    }
  };
 
  const generateContent = async () => {
    if (!session?.user) {
      Alert.alert("Login Required", "Create an account or log in before generating.");
      return;
    }
 
    if (!image) return;
 
    setLoading(true);
    setResult("");
    setHostedImageUrl("");
    setShowScheduleOptions(false);
 
    const formData = new FormData();
 
    formData.append("image", {
      uri: image,
      name: "artwork.jpg",
      type: "image/jpeg",
    } as any);
 
    formData.append("productLink", productLink);
    formData.append("platform", selectedPlatform);
    formData.append("stylePreset", selectedStyle);
 
    try {
      const response = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        body: formData,
      });
 
      const data = await response.json();
 
      if (!response.ok) {
        setResult(data.details || data.error || "Generation failed.");
        return;
      }
 
      const generatedText = data.result || "No result returned.";
      const imageUrlFromBackend = data.imageUrl || "";
      const rawProductLink = productLink.trim();
      const normalizedProductLink = rawProductLink
        ? /^https?:\/\//i.test(rawProductLink)
          ? rawProductLink
          : `https://${rawProductLink}`
        : "";

      const shouldUseDirectProductCta =
        ["Instagram", "Facebook", "X"].includes(selectedPlatform) &&
        Boolean(normalizedProductLink);

      const finalGeneratedText = shouldUseDirectProductCta
        ? generatedText.replace(
            /CTA:\s*[\s\S]*?(?=(?:TITLE|DESCRIPTION|HASHTAGS):|$)/i,
            `CTA: Shop this design: ${normalizedProductLink}\n`
          )
        : generatedText;
 
      setResult(finalGeneratedText);
      setHostedImageUrl(imageUrlFromBackend);
 
      await storeCurrentCampaign(finalGeneratedText, imageUrlFromBackend);
    } catch (error: any) {
      console.log("Generate error:", error);
 
      setResult(
        error?.message ||
          "Failed to connect to backend. Check Render server and API URL."
      );
    } finally {
      setLoading(false);
    }
  };
 
  const saveResult = async () => {
    if (!result || !image) return;
 
    const newSave = buildCurrentCampaign();
 
    const existing = await AsyncStorage.getItem("artboost_saves");
    const saves = existing ? JSON.parse(existing) : [];
 
    await AsyncStorage.setItem("artboost_saves", JSON.stringify([newSave, ...saves]));
 
    await AsyncStorage.setItem("artboost_current_campaign", JSON.stringify(newSave));
 
    Alert.alert("Saved", "Campaign saved successfully.");
  };
 
  const copyText = async (text: string, label = "Content") => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied to clipboard.`);
  };
 
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {homeMode === "home" ? (
        <>
          <View style={styles.cosmicHero}>
            <Text style={styles.eyebrow}>ARTBOOST AI</Text>
            <Text style={styles.logo}>
              {profile?.full_name || profile?.display_name
                ? `Welcome, ${String(profile.full_name || profile.display_name).split(" ")[0]}`
                : "Welcome back"}
            </Text>
            <Text style={styles.subtitle}>Your AI marketing assistant is working for you.</Text>

            <View style={styles.consultantCard}>
              <AIConsultantAvatar
                size={82}
                label="Ask what to market next"
                onPress={() => router.push("/(tabs)/consultant" as any)}
              />
            </View>
          </View>

          {session?.user ? (
            <>
              <View style={styles.overviewHeader}>
                <Text style={styles.sectionHeading}>Today’s Overview</Text>
                <Pressable onPress={loadHomeAnalytics}><Text style={styles.refreshText}>{homeAnalyticsLoading ? "Refreshing…" : "Refresh"}</Text></Pressable>
              </View>
              <View style={styles.overviewGrid}>
                <Pressable style={styles.overviewCard} onPress={() => router.push("/analytics" as any)}>
                  <Text style={styles.overviewValue}>{homeAnalytics?.postsPublished ?? "—"}</Text>
                  <Text style={styles.overviewLabel}>Posts Published</Text>
                </Pressable>
                <Pressable style={styles.overviewCard} onPress={() => router.push("/schedule" as any)}>
                  <Text style={styles.overviewValue}>{homeAnalytics?.activeAutomations ?? "—"}</Text>
                  <Text style={styles.overviewLabel}>Active Automations</Text>
                </Pressable>
              </View>
              <Pressable style={styles.insightCard} onPress={() => router.push("/analytics" as any)}>
                <Text style={styles.insightKicker}>AI MARKETING SIGNAL</Text>
                <Text style={styles.insightTitle}>{homeAnalytics?.topArtwork?.title || "Build performance history"}</Text>
                <Text style={styles.insightText}>{homeAnalytics?.insight || "Keep publishing and ArtBoost will surface your strongest product and platform signals here."}</Text>
              </Pressable>
              <View style={styles.quickRow}>
                <Pressable style={styles.quickButton} onPress={() => setHomeMode("upload")}><Text style={styles.quickButtonText}>＋ Create Post</Text></Pressable>
                <Pressable style={styles.quickButtonSecondary} onPress={() => router.push("/video-studio" as any)}><Text style={styles.quickButtonText}>▶ Create Video</Text></Pressable>
              </View>
            </>
          ) : null}

          {session?.user ? (
            <View style={styles.accountStrip}>
              <View style={styles.accountInfo}>
                <Text style={styles.accountLabel}>
                  SIGNED IN
                </Text>

                <Text
                  style={styles.accountEmail}
                  numberOfLines={1}
                >
                  {session.user.email}
                </Text>
              </View>

              <View style={styles.accountBadge}>
                <Text
                  style={styles.accountBadgeText}
                >
                  {/* ARTBOOST_BUSINESS_BADGE_V1 */}
                  {String(profile?.subscription_tier || "free").toLowerCase() === "business"
                    ? "BUSINESS"
                    : String(profile?.subscription_tier || "free").toLowerCase() === "pro"
                    ? "PRO"
                    : "FREE"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.authBox}>
              <Text style={styles.authTitle}>
                Sign in to continue
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#777"
                value={authEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setAuthEmail}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#777"
                value={authPassword}
                secureTextEntry
                onChangeText={setAuthPassword}
              />

              <Pressable
                style={styles.loginButton}
                onPress={signIn}
                disabled={authLoading}
              >
                <Text style={styles.buttonText}>
                  {authLoading
                    ? "Working..."
                    : "Log In"}
                </Text>
              </Pressable>

              <Pressable
                style={styles.signupButton}
                onPress={signUp}
                disabled={authLoading}
              >
                <Text style={styles.buttonText}>
                  Create Account
                </Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionHeading}>
            What would you like to do today?
          </Text>

          <Pressable
            style={styles.actionCard}
            onPress={() =>
              setHomeMode("upload")
            }
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>
                +
              </Text>
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>
                Upload Artwork
              </Text>

              <Text style={styles.actionDescription}>
                Upload a new piece, generate
                content, and post or schedule it.
              </Text>
            </View>

            <Text style={styles.actionArrow}>
              ›
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() =>
              router.push(
                "/connect-store" as any
              )
            }
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>
                ↗
              </Text>
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>
                Import Artwork
              </Text>

              <Text style={styles.actionDescription}>
                Import from a store, website,
                collection, or artwork link.
              </Text>
            </View>

            <Text style={styles.actionArrow}>
              ›
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() =>
              router.push(
                "/campaign-manager" as any
              )
            }
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>
                ✦
              </Text>
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>
                Create Marketing Campaign
              </Text>

              <Text style={styles.actionDescription}>
                Promote artwork, a collection,
                a store, or your entire business.
              </Text>
            </View>

            <Text style={styles.actionArrow}>
              ›
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionCard}
            onPress={() =>
              router.push(
                "/schedule" as any
              )
            }
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>
                ✓
              </Text>
            </View>

            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>
                Manage Campaigns
              </Text>

              <Text style={styles.actionDescription}>
                Review, pause, edit, and manage
                scheduled marketing.
              </Text>
            </View>

            <Text style={styles.actionArrow}>
              ›
            </Text>
          </Pressable>

          {session?.user ? (
            <Pressable
              style={styles.signOutLink}
              onPress={signOut}
            >
              <Text style={styles.signOutLinkText}>
                Sign Out
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.workflowHeader}>
            <Pressable
              style={styles.workflowBackButton}
              onPress={() =>
                setHomeMode("home")
              }
            >
              <Text
                style={styles.workflowBackText}
              >
                ‹
              </Text>
            </Pressable>

            <View style={styles.workflowHeaderText}>
              <Text style={styles.eyebrow}>
                SINGLE ARTWORK
              </Text>

              <Text style={styles.workflowTitle}>
                Create Content
              </Text>
            </View>
          </View>

          <Text style={styles.workflowIntro}>
            Upload your artwork, generate
            platform-ready content, then post now
            or schedule a campaign.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Optional product or shop link"
            placeholderTextColor="#777"
            value={productLink}
            onChangeText={setProductLink}
          />

          <Pressable
            style={styles.uploadCard}
            onPress={pickImage}
          >
            <Text style={styles.uploadTitle}>
              {image
                ? "Choose a Different Image"
                : "Upload Artwork"}
            </Text>

            <Text style={styles.uploadDescription}>
              Select a photo of finished artwork
              or work in progress.
            </Text>
          </Pressable>

          {image ? (
            <Image
              source={{ uri: image }}
              style={styles.preview}
            />
          ) : null}

          {image ? (
            <>
              <View
                style={styles.platformContainer}
              >
                <Text
                  style={styles.platformLabel}
                >
                  Where should ArtBoost market it?
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  style={{ width: "100%" }}
                >
                  {PLATFORMS.map(
                    (platform) => (
                      <Pressable
                        key={platform}
                        style={[
                          styles.platformButton,
                          selectedPlatform ===
                            platform &&
                            styles.platformButtonActive,
                        ]}
                        onPress={() =>
                          setSelectedPlatform(
                            platform
                          )
                        }
                      >
                        <Text
                          style={
                            styles.platformButtonText
                          }
                        >
                          {platform}
                        </Text>
                      </Pressable>
                    )
                  )}
                </ScrollView>
              </View>

              <View
                style={styles.platformContainer}
              >
                <Text
                  style={styles.platformLabel}
                >
                  Marketing style
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  style={{ width: "100%" }}
                >
                  {STYLE_PRESETS.map(
                    (style) => (
                      <Pressable
                        key={style}
                        style={[
                          styles.platformButton,
                          selectedStyle === style &&
                            styles.platformButtonActive,
                        ]}
                        onPress={() =>
                          setSelectedStyle(style)
                        }
                      >
                        <Text
                          style={
                            styles.platformButtonText
                          }
                        >
                          {style}
                        </Text>
                      </Pressable>
                    )
                  )}
                </ScrollView>
              </View>

              <Pressable
                style={styles.generateButton}
                onPress={generateContent}
              >
                <Text style={styles.buttonText}>
                  Generate {selectedPlatform} Content
                </Text>
              </Pressable>
            </>
          ) : null}

          {loading ? (
            <ActivityIndicator
              size="large"
              style={{ marginTop: 24 }}
            />
          ) : null}

          {selectedPlatform === "Pinterest" &&
          sections.length > 0 ? (
            <View style={styles.boardBox}>
              <View
                style={styles.boardHeaderRow}
              >
                <Text
                  style={styles.platformLabel}
                >
                  Pinterest Board
                </Text>

                <Pressable
                  style={
                    styles.refreshBoardsButton
                  }
                  onPress={loadBoards}
                >
                  <Text
                    style={styles.smallButtonText}
                  >
                    {loadingBoards
                      ? "Loading..."
                      : "Refresh Boards"}
                  </Text>
                </Pressable>
              </View>

              {boards.length > 0 ? (
                boards.map((board: any) => (
                  <Pressable
                    key={board.id}
                    style={[
                      styles.boardButton,
                      selectedBoard ===
                        board.id &&
                        styles.boardButtonActive,
                    ]}
                    onPress={() =>
                      setSelectedBoard(board.id)
                    }
                  >
                    <Text
                      style={styles.boardText}
                    >
                      {board.name}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text
                  style={styles.boardHelpText}
                >
                  No boards loaded. Refresh boards
                  or reconnect Pinterest.
                </Text>
              )}
            </View>
          ) : null}

          {selectedPlatform === "TikTok" &&
          sections.length > 0 ? (
            <View style={styles.boardBox}>
              <View style={styles.boardHeaderRow}>
                <Text style={styles.platformLabel}>
                  TikTok Posting Settings
                </Text>

                <Pressable
                  style={styles.refreshBoardsButton}
                  onPress={loadTikTokCreatorInfo}
                  disabled={loadingTikTokCreator}
                >
                  <Text style={styles.smallButtonText}>
                    {loadingTikTokCreator
                      ? "Loading..."
                      : "Refresh"}
                  </Text>
                </Pressable>
              </View>

              {tiktokCreator ? (
                <>
                  <Text style={styles.boardHelpText}>
                    @
                    {tiktokCreator.creator_username ||
                      "TikTok creator"}
                  </Text>

                  <Text
                    style={[
                      styles.platformLabel,
                      { marginTop: 12 },
                    ]}
                  >
                    Who can view this post?
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    {(
                      tiktokCreator.privacy_level_options ||
                      []
                    ).map((privacy: string) => (
                      <Pressable
                        key={privacy}
                        style={[
                          styles.repeatOption,
                          tiktokPrivacy === privacy &&
                            styles.repeatOptionActive,
                        ]}
                        onPress={() => {
                          setTikTokPrivacy(privacy);
                          setTikTokConsent(false);
                        }}
                      >
                        <Text
                          style={styles.repeatOptionText}
                        >
                          {getTikTokPrivacyLabel(
                            privacy
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text
                    style={[
                      styles.boardHelpText,
                      { marginTop: 8 },
                    ]}
                  >
                    During TikTok's unaudited testing period, use "Only me" for Direct Post testing.
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      marginTop: 14,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        paddingRight: 12,
                      }}
                    >
                      <Text
                        style={
                          styles.platformLabel
                        }
                      >
                        Allow comments
                      </Text>
                    </View>

                    <Switch
                      value={!tiktokDisableComment}
                      disabled={Boolean(
                        tiktokCreator.comment_disabled
                      )}
                      onValueChange={(value) => {
                        setTikTokDisableComment(
                          !value
                        );
                        setTikTokConsent(false);
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      marginTop: 12,
                    }}
                  >
                    <Text
                      style={
                        styles.platformLabel
                      }
                    >
                      Auto-add music
                    </Text>

                    <Switch
                      value={tiktokAutoAddMusic}
                      onValueChange={(value) => {
                        setTikTokAutoAddMusic(
                          value
                        );
                        setTikTokConsent(false);
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      marginTop: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        paddingRight: 12,
                      }}
                    >
                      <Text
                        style={
                          styles.platformLabel
                        }
                      >
                        Promoting my own business
                      </Text>
                    </View>

                    <Switch
                      value={tiktokOwnBusiness}
                      onValueChange={(value) => {
                        setTikTokOwnBusiness(
                          value
                        );
                        setTikTokConsent(false);
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      marginTop: 12,
                    }}
                  >
                    <Text
                      style={
                        styles.platformLabel
                      }
                    >
                      Paid partnership
                    </Text>

                    <Switch
                      value={tiktokPaidPartnership}
                      onValueChange={(value) => {
                        setTikTokPaidPartnership(
                          value
                        );
                        setTikTokConsent(false);
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      marginTop: 16,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "#333",
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        paddingRight: 12,
                      }}
                    >
                      <Text
                        style={
                          styles.platformLabel
                        }
                      >
                        Confirm TikTok settings
                      </Text>

                      <Text
                        style={
                          styles.boardHelpText
                        }
                      >
                        Review these settings before each Direct Post.
                      </Text>
                    </View>

                    <Switch
                      value={tiktokConsent}
                      onValueChange={
                        setTikTokConsent
                      }
                    />
                  </View>
                </>
              ) : (
                <Text
                  style={styles.boardHelpText}
                >
                  {loadingTikTokCreator
                    ? "Loading TikTok posting settings..."
                    : "TikTok settings are unavailable. Tap Refresh or reconnect TikTok."}
                </Text>
              )}
            </View>
          ) : null}

          {sections.length > 0 ? (
            <>
              <View style={styles.masterActions}>
                <Pressable
                  style={styles.postNowButton}
                  onPress={postNow}
                  disabled={postingNow}
                >
                  <Text style={styles.buttonText}>
                    {postingNow
                      ? "Posting..."
                      : "Post Now"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.scheduleButton}
                  onPress={() =>
                    setShowScheduleOptions(
                      !showScheduleOptions
                    )
                  }
                >
                  <Text style={styles.buttonText}>
                    Create Campaign
                  </Text>
                </Pressable>

                {showScheduleOptions ? (
                  <View
                    style={styles.schedulePanel}
                  >
                    <Text
                      style={
                        styles.scheduleTitle
                      }
                    >
                      Campaign Schedule
                    </Text>

                    {REPEAT_OPTIONS.map(
                      (option) => (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.repeatOption,
                            repeatType ===
                              option.value &&
                              styles.repeatOptionActive,
                          ]}
                          onPress={() =>
                            setRepeatType(
                              option.value
                            )
                          }
                        >
                          <Text
                            style={
                              styles.repeatOptionText
                            }
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      )
                    )}

                    <Text
                      style={
                        styles.scheduleLabel
                      }
                    >
                      Start in how many days?
                    </Text>

                    <TextInput
                      style={
                        styles.scheduleInput
                      }
                      value={scheduleDaysOut}
                      onChangeText={
                        setScheduleDaysOut
                      }
                      keyboardType="numeric"
                      placeholder="Example: 1, 7, 14, 30"
                      placeholderTextColor="#777"
                    />

                    <Pressable
                      style={
                        styles.confirmScheduleButton
                      }
                      onPress={scheduleRepost}
                      disabled={scheduling}
                    >
                      <Text
                        style={
                          styles.buttonText
                        }
                      >
                        {scheduling
                          ? "Scheduling..."
                          : "Schedule Campaign"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <Pressable
                  style={styles.saveButton}
                  onPress={saveResult}
                >
                  <Text style={styles.buttonText}>
                    Save Campaign
                  </Text>
                </Pressable>
              </View>

              {sections.map(
                (section, index) => (
                  <View
                    key={`${section.title}-${index}`}
                    style={styles.card}
                  >
                    <Text
                      style={styles.cardTitle}
                    >
                      {section.title}
                    </Text>

                    <Text
                      style={styles.cardText}
                    >
                      {section.content}
                    </Text>

                    <Pressable
                      style={
                        styles.smallCopyButton
                      }
                      onPress={() =>
                        copyText(
                          section.content,
                          section.title
                        )
                      }
                    >
                      <Text
                        style={
                          styles.smallButtonText
                        }
                      >
                        Copy {section.title}
                      </Text>
                    </Pressable>
                  </View>
                )
              )}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
 
const styles = StyleSheet.create({
  cosmicHero: { width: "100%", backgroundColor: "#100d22", borderWidth: 1, borderColor: "#342b66", borderRadius: 24, padding: 20, overflow: "hidden", marginBottom: 14, shadowColor: "#8b5cf6", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 5 } },
  consultantCard: { marginTop: 18, backgroundColor: "#0b0a16cc", borderWidth: 1, borderColor: "#443877", borderRadius: 18, padding: 14 },
  overviewHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  refreshText: { color: "#a99aff", fontWeight: "800", fontSize: 12 },
  overviewGrid: { width: "100%", flexDirection: "row", gap: 10, marginBottom: 12 },
  overviewCard: { flex: 1, backgroundColor: "#151326", borderWidth: 1, borderColor: "#2d2850", borderRadius: 16, padding: 15 },
  overviewValue: { color: "#fff", fontSize: 26, fontWeight: "900" },
  overviewLabel: { color: "#aaa9bb", fontSize: 11, fontWeight: "700", marginTop: 4 },
  insightCard: { width: "100%", backgroundColor: "#19122b", borderWidth: 1, borderColor: "#4a3376", borderRadius: 18, padding: 16, marginBottom: 12 },
  insightKicker: { color: "#c4b5fd", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  insightTitle: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 6 },
  insightText: { color: "#c6c2d8", fontSize: 12, lineHeight: 18, marginTop: 5 },
  quickRow: { width: "100%", flexDirection: "row", gap: 10, marginBottom: 8 },
  quickButton: { flex: 1, backgroundColor: "#7c4dff", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  quickButtonSecondary: { flex: 1, backgroundColor: "#251b46", borderWidth: 1, borderColor: "#58428f", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  quickButtonText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  container: {
    padding: 24,
    paddingBottom: 60,
    backgroundColor: "#101010",
    minHeight: "100%",
  },

  eyebrow: {
    color: "#8b5cf6",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: 26,
  },

  logo: {
    fontSize: 31,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 8,
    lineHeight: 38,
  },

  subtitle: {
    fontSize: 15,
    color: "#b8b8b8",
    marginTop: 8,
    lineHeight: 21,
  },

  promiseCard: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: "#1d1730",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  promiseText: {
    color: "#d8ccf4",
    fontSize: 12,
    fontWeight: "900",
  },

  accountStrip: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  accountInfo: {
    flex: 1,
  },

  accountLabel: {
    color: "#8b5cf6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  accountEmail: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },

  accountBadge: {
    borderRadius: 99,
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  accountBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  sectionHeading: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 26,
    marginBottom: 12,
  },

  actionCard: {
    minHeight: 96,
    borderRadius: 19,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#2b2145",
    alignItems: "center",
    justifyContent: "center",
  },

  actionIconText: {
    color: "#c4b5fd",
    fontSize: 25,
    fontWeight: "900",
  },

  actionTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },

  actionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  actionDescription: {
    color: "#919191",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  actionArrow: {
    color: "#6f6f6f",
    fontSize: 27,
  },

  signOutLink: {
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },

  signOutLinkText: {
    color: "#d45a5a",
    fontSize: 13,
    fontWeight: "900",
  },

  authBox: {
    width: "100%",
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#333",
  },

  authTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },

  loginButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 6,
  },

  signupButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 12,
  },

  workflowHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
  },

  workflowBackButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#1b1b1b",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
  },

  workflowBackText: {
    color: "#ffffff",
    fontSize: 32,
    lineHeight: 34,
  },

  workflowHeaderText: {
    flex: 1,
    paddingLeft: 14,
  },

  workflowTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3,
  },

  workflowIntro: {
    color: "#aaaaaa",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 18,
    marginBottom: 16,
  },

  input: {
    width: "100%",
    backgroundColor: "#1b1b1b",
    color: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    fontSize: 15,
  },

  uploadCard: {
    width: "100%",
    borderRadius: 18,
    backgroundColor: "#2d6cdf",
    padding: 18,
    alignItems: "center",
  },

  uploadTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  uploadDescription: {
    color: "#dbeafe",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },

  preview: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    marginTop: 20,
    resizeMode: "contain",
    backgroundColor: "#222",
  },

  platformContainer: {
    width: "100%",
    marginTop: 20,
  },

  platformLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },

  platformButton: {
    backgroundColor: "#222",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginRight: 10,
  },

  platformButtonActive: {
    backgroundColor: "#8b5cf6",
  },

  platformButtonText: {
    color: "#fff",
    fontWeight: "700",
  },

  generateButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 20,
  },

  boardBox: {
    width: "100%",
    backgroundColor: "#1b1b1b",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },

  boardHeaderRow: {
    width: "100%",
    marginBottom: 10,
  },

  refreshBoardsButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },

  boardButton: {
    backgroundColor: "#2b2b2b",
    padding: 13,
    borderRadius: 10,
    marginBottom: 8,
  },

  boardButtonActive: {
    backgroundColor: "#bd081c",
  },

  boardText: {
    color: "#fff",
    fontWeight: "700",
  },

  boardHelpText: {
    color: "#aaa",
    lineHeight: 20,
  },

  masterActions: {
    width: "100%",
    marginTop: 22,
  },

  postNowButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },

  scheduleButton: {
    backgroundColor: "#0f766e",
    paddingVertical: 15,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },

  schedulePanel: {
    backgroundColor: "#1b1b1b",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },

  scheduleTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 12,
  },

  repeatOption: {
    backgroundColor: "#2b2b2b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },

  repeatOptionActive: {
    backgroundColor: "#0f766e",
  },

  repeatOptionText: {
    color: "#fff",
    fontWeight: "800",
  },

  scheduleLabel: {
    color: "#fff",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 8,
  },

  scheduleInput: {
    backgroundColor: "#2b2b2b",
    color: "#fff",
    padding: 13,
    borderRadius: 10,
    marginBottom: 12,
  },

  confirmScheduleButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },

  saveButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 12,
  },

  card: {
    marginTop: 18,
    backgroundColor: "#1b1b1b",
    padding: 18,
    borderRadius: 16,
    width: "100%",
  },

  cardTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 10,
  },

  cardText: {
    color: "#e6e6e6",
    fontSize: 15,
    lineHeight: 22,
  },

  smallCopyButton: {
    backgroundColor: "#2d6cdf",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 14,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },

  smallButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});