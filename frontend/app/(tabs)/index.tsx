import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

const BACKEND_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://artboost-ai.onrender.com";

const PLATFORMS = ["Pinterest", "Instagram", "Facebook", "TikTok", "X", "Threads"];

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

      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (error) {
        Alert.alert("Signup Error", error.message);
        return;
      }

      Alert.alert(
        "Account Created",
        "Check your email if Supabase requires confirmation, then log in."
      );
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

      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (error) {
        Alert.alert("Login Error", error.message);
        return;
      }

      Alert.alert("Logged In", "Welcome back to ArtBoost AI.");
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
      pinterestDescription: description,
      createdAt: new Date().toLocaleString(),
    };
  };

  const pickImage = async () => {
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
    if (!profile?.is_pro) {
      Alert.alert("Pro Required", "Posting directly to platforms is a Pro feature.");
      return;
    }

    if (!result || !hostedImageUrl) {
      Alert.alert("Missing Campaign", "Generate content before posting.");
      return;
    }

    if (selectedPlatform === "Facebook") {

  createFacebookPost();

  return;

}

    if (!selectedBoard) {
      Alert.alert("Missing Board", "Select a Pinterest board before posting.");
      return;
    }

    const campaign = buildCurrentCampaign();
    const finalProductLink = productLink.trim();

    if (finalProductLink && !finalProductLink.startsWith("http")) {
      Alert.alert(
        "Invalid Product Link",
        "The product link must start with https:// or http://."
      );
      return;
    }

    try {
      setPostingNow(true);

      await AsyncStorage.setItem(
        "artboost_current_campaign",
        JSON.stringify(campaign)
      );

      const response = await fetch(`${BACKEND_URL}/pinterest/create-pin`, {
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
      });

      const data = await response.json();

      if (!response.ok) {
        console.log("Pinterest post error:", data);

        Alert.alert(
          "Pinterest Approval Pending",
          "Pinterest posting is ready, but your Pinterest Developer app is still pending production approval.\n\nUntil Pinterest approves Standard Access, live pin creation is blocked. Your campaign is saved and ready to post once approval is complete."
        );

        return;
      }

      Alert.alert(
        "Posted Successfully",
        "Your campaign was posted to Pinterest."
      );
    } catch (error: any) {
      console.log("Post now error:", error);

      Alert.alert(
        "Post Failed",
        error?.message || "Unable to post right now. Try again shortly."
      );
    } finally {
      setPostingNow(false);
    }
  };

  const scheduleRepost = async () => {
    if (!profile?.is_pro) {
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

      setResult(generatedText);
      setHostedImageUrl(imageUrlFromBackend);

      await storeCurrentCampaign(generatedText, imageUrlFromBackend);
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>ArtBoost AI</Text>

      <Text style={styles.subtitle}>
        Upload artwork, choose a platform, and generate focused marketing content.
      </Text>

      <View style={styles.authBox}>
        {session?.user ? (
          <>
            <Text style={styles.authTitle}>Signed In</Text>
            <Text style={styles.authText}>{session.user.email}</Text>

            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>
                {profile?.is_pro ? "PRO ACTIVE" : "FREE ACCOUNT"}
              </Text>
            </View>

            <Pressable style={styles.signOutButton} onPress={signOut}>
              <Text style={styles.buttonText}>Sign Out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.authTitle}>Account Login</Text>

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

            <Pressable style={styles.loginButton} onPress={signIn} disabled={authLoading}>
              <Text style={styles.buttonText}>
                {authLoading ? "Working..." : "Log In"}
              </Text>
            </Pressable>

            <Pressable style={styles.signupButton} onPress={signUp} disabled={authLoading}>
              <Text style={styles.buttonText}>Create Account</Text>
            </Pressable>
          </>
        )}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Paste product/shop link"
        placeholderTextColor="#777"
        value={productLink}
        onChangeText={setProductLink}
      />

      <View style={styles.platformContainer}>
        <Text style={styles.platformLabel}>Choose Platform</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%" }}>
          {PLATFORMS.map((platform) => (
            <Pressable
              key={platform}
              style={[
                styles.platformButton,
                selectedPlatform === platform && styles.platformButtonActive,
              ]}
              onPress={() => setSelectedPlatform(platform)}
            >
              <Text style={styles.platformButtonText}>{platform}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.platformContainer}>
        <Text style={styles.platformLabel}>Choose Style</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%" }}>
          {STYLE_PRESETS.map((style) => (
            <Pressable
              key={style}
              style={[
                styles.platformButton,
                selectedStyle === style && styles.platformButtonActive,
              ]}
              onPress={() => setSelectedStyle(style)}
            >
              <Text style={styles.platformButtonText}>{style}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Pressable style={styles.button} onPress={pickImage}>
        <Text style={styles.buttonText}>Upload Artwork</Text>
      </Pressable>

      {image && <Image source={{ uri: image }} style={styles.preview} />}

      {image && (
        <Pressable style={styles.generateButton} onPress={generateContent}>
          <Text style={styles.buttonText}>Generate {selectedPlatform} Content</Text>
        </Pressable>
      )}

      {loading && <ActivityIndicator size="large" style={{ marginTop: 24 }} />}

      {hostedImageUrl ? (
        <View style={styles.imageUrlBox}>
          <Text style={styles.imageUrlTitle}>Public Image URL Ready</Text>
          <Text style={styles.imageUrlText}>{hostedImageUrl}</Text>
        </View>
      ) : null}

      {selectedPlatform === "Pinterest" && sections.length > 0 && (
        <View style={styles.boardBox}>
          <View style={styles.boardHeaderRow}>
            <Text style={styles.platformLabel}>Pinterest Board</Text>

            <Pressable style={styles.refreshBoardsButton} onPress={loadBoards}>
              <Text style={styles.smallButtonText}>
                {loadingBoards ? "Loading..." : "Refresh Boards"}
              </Text>
            </Pressable>
          </View>

          {boards.length > 0 ? (
            boards.map((board: any) => (
              <Pressable
                key={board.id}
                style={[
                  styles.boardButton,
                  selectedBoard === board.id && styles.boardButtonActive,
                ]}
                onPress={() => setSelectedBoard(board.id)}
              >
                <Text style={styles.boardText}>{board.name}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.boardHelpText}>
              No boards loaded. Refresh boards or reconnect Pinterest.
            </Text>
          )}
        </View>
      )}

      {sections.length > 0 && (
        <>
          <View style={styles.masterActions}>
            <Pressable style={styles.postNowButton} onPress={postNow} disabled={postingNow}>
              <Text style={styles.buttonText}>
                {postingNow ? "Posting..." : "POST NOW"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.scheduleButton}
              onPress={() => setShowScheduleOptions(!showScheduleOptions)}
            >
              <Text style={styles.buttonText}>Schedule Repost</Text>
            </Pressable>

            {showScheduleOptions && (
              <View style={styles.schedulePanel}>
                <Text style={styles.scheduleTitle}>Repeat Options</Text>

                {REPEAT_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.repeatOption,
                      repeatType === option.value && styles.repeatOptionActive,
                    ]}
                    onPress={() => setRepeatType(option.value)}
                  >
                    <Text style={styles.repeatOptionText}>{option.label}</Text>
                  </Pressable>
                ))}

                <Text style={styles.scheduleLabel}>Start repost in how many days?</Text>

                <TextInput
                  style={styles.scheduleInput}
                  value={scheduleDaysOut}
                  onChangeText={setScheduleDaysOut}
                  keyboardType="numeric"
                  placeholder="Example: 1, 7, 14, 30"
                  placeholderTextColor="#777"
                />

                <Pressable
                  style={styles.confirmScheduleButton}
                  onPress={scheduleRepost}
                  disabled={scheduling}
                >
                  <Text style={styles.buttonText}>
                    {scheduling ? "Scheduling..." : "Confirm Schedule Repost"}
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={styles.copyButton}
              onPress={() => copyText(result, `${selectedPlatform} content`)}
            >
              <Text style={styles.buttonText}>Copy {selectedPlatform} Content</Text>
            </Pressable>

            <Pressable style={styles.saveButton} onPress={saveResult}>
              <Text style={styles.buttonText}>Save Campaign</Text>
            </Pressable>

            <Pressable style={styles.postButton} onPress={sendToProTools}>
              <Text style={styles.buttonText}>Advanced Pro Tools</Text>
            </Pressable>
          </View>

          {sections.map((section, index) => (
            <View key={`${section.title}-${index}`} style={styles.card}>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <Text style={styles.cardText}>{section.content}</Text>

              <Pressable
                style={styles.smallCopyButton}
                onPress={() => copyText(section.content, section.title)}
              >
                <Text style={styles.smallButtonText}>Copy {section.title}</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#101010",
    minHeight: "100%",
    alignItems: "center",
  },

  logo: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 40,
  },

  subtitle: {
    fontSize: 16,
    color: "#cfcfcf",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },

  authBox: {
    width: "100%",
    backgroundColor: "#1b1b1b",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },

  authTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },

  authText: {
    color: "#cfcfcf",
    fontSize: 14,
    marginBottom: 12,
  },

  proBadge: {
    backgroundColor: "#2b2b2b",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  proBadgeText: {
    color: "#fff",
    fontWeight: "900",
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

  signOutButton: {
    backgroundColor: "#a62828",
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
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

  platformContainer: {
    width: "100%",
    marginBottom: 20,
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

  button: {
    backgroundColor: "#1f8cff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },

  generateButton: {
    backgroundColor: "#12a86b",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 18,
  },

  preview: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    marginTop: 24,
    resizeMode: "contain",
    backgroundColor: "#222",
  },

  imageUrlBox: {
    width: "100%",
    marginTop: 18,
    backgroundColor: "#142012",
    borderRadius: 14,
    padding: 14,
  },

  imageUrlTitle: {
    color: "#12a86b",
    fontWeight: "800",
    marginBottom: 6,
  },

  imageUrlText: {
    color: "#d1ffd6",
    fontSize: 12,
    lineHeight: 18,
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

  copyButton: {
    backgroundColor: "#f59e0b",
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

  postButton: {
    backgroundColor: "#2563eb",
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
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },

  smallButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});