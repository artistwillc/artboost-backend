import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type SelectableOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

type RecommendationCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  onPress: () => void;
};

const ARTWORK_TYPES = [
  "Automotive",
  "Fishing",
  "Wildlife",
  "Hunting",
  "Outdoor",
  "Fantasy",
  "Horror",
  "Humor",
  "First Responders",
  "Medical",
  "Sports",
  "Apparel",
  "Stickers",
  "Custom Artwork",
];

const BRAND_TRAITS = [
  "Bold",
  "Professional",
  "Authentic",
  "Creative",
  "Rugged",
  "Blue Collar",
  "Premium",
  "Funny",
  "Inspirational",
  "Family Friendly",
  "Modern",
  "Vintage",
  "Casual",
  "Energetic",
];

const AUDIENCE_OPTIONS = [
  "Car Enthusiasts",
  "Truck Enthusiasts",
  "Hunters",
  "Anglers",
  "Outdoor Enthusiasts",
  "First Responders",
  "Healthcare Workers",
  "Collectors",
  "Gift Buyers",
  "Small Businesses",
  "Print-on-Demand Shoppers",
  "Custom Art Buyers",
];

const MARKETING_GOALS = [
  "Increase Brand Awareness",
  "Drive Product Sales",
  "Grow Social Media",
  "Promote New Artwork",
  "Build a Loyal Audience",
  "Market My Full Catalog",
];

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

function toggleSelection(
  currentValues: string[],
  value: string
) {
  if (currentValues.includes(value)) {
    return currentValues.filter(
      currentValue => currentValue !== value
    );
  }

  return [...currentValues, value];
}

function createReadableList(values: string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values
    .slice(0, -1)
    .join(", ")}, and ${values[values.length - 1]}`;
}

function createHashtag(value: string) {
  return `#${value.replace(
    /[^a-zA-Z0-9]/g,
    ""
  )}`;
}

export default function BrandScreen() {
  const [brandName, setBrandName] =
    useState("");

  const [brandVoice, setBrandVoice] =
    useState("");

  const [targetAudience, setTargetAudience] =
    useState("");

  const [defaultCTA, setDefaultCTA] =
    useState("");

  const [
    defaultHashtags,
    setDefaultHashtags,
  ] = useState("");

  const [avoidWords, setAvoidWords] =
    useState("");

  const [
    recommendedPlatforms,
    setRecommendedPlatforms,
  ] = useState("");

  const [
    recommendedSchedule,
    setRecommendedSchedule,
  ] = useState("");

  const [
    recommendedAutomation,
    setRecommendedAutomation,
  ] = useState("");

  const [
    recommendedCampaigns,
    setRecommendedCampaigns,
  ] = useState("");

  const [wizardVisible, setWizardVisible] =
    useState(false);

  const [previewVisible, setPreviewVisible] =
    useState(false);

  const [isGenerating, setIsGenerating] =
    useState(false);

  const [examplePost, setExamplePost] =
    useState("");

  const [selectedRecommendation, setSelectedRecommendation] =
    useState<{
      title: string;
      value: string;
      icon: keyof typeof Ionicons.glyphMap;
    } | null>(null);

  const [wizardStep, setWizardStep] =
    useState(1);

  const [artistName, setArtistName] =
    useState("");

  const [
    selectedArtworkTypes,
    setSelectedArtworkTypes,
  ] = useState<string[]>([]);

  const [
    selectedBrandTraits,
    setSelectedBrandTraits,
  ] = useState<string[]>([]);

  const [
    selectedAudiences,
    setSelectedAudiences,
  ] = useState<string[]>([]);

  const [
    selectedMarketingGoal,
    setSelectedMarketingGoal,
  ] = useState("");

  const [additionalDetails, setAdditionalDetails] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const hasMarketingProfile = useMemo(() => {
    return Boolean(
      brandName.trim() ||
        brandVoice.trim() ||
        targetAudience.trim() ||
        defaultCTA.trim() ||
        defaultHashtags.trim()
    );
  }, [
    brandName,
    brandVoice,
    targetAudience,
    defaultCTA,
    defaultHashtags,
  ]);

  const profileCompletion = useMemo(() => {
    const values = [
      brandName,
      brandVoice,
      targetAudience,
      defaultCTA,
      defaultHashtags,
      avoidWords,
    ];

    const completed = values.filter(value =>
      value.trim()
    ).length;

    return Math.round(
      (completed / values.length) * 100
    );
  }, [
    brandName,
    brandVoice,
    targetAudience,
    defaultCTA,
    defaultHashtags,
    avoidWords,
  ]);

  const marketingScore = useMemo(() => {
    const strategiesReady = [
      recommendedPlatforms,
      recommendedSchedule,
      recommendedAutomation,
      recommendedCampaigns,
    ].filter(value => value.trim()).length;

    /*
     * Readiness is intentionally split between a complete profile (80%)
     * and usable strategy recommendations (20%). A filled-in form alone
     * should not report a perfect consultant score.
     */
    return Math.min(
      100,
      Math.round(
        profileCompletion * 0.8 +
          (strategiesReady / 4) * 20
      )
    );
  }, [
    profileCompletion,
    recommendedPlatforms,
    recommendedSchedule,
    recommendedAutomation,
    recommendedCampaigns,
  ]);

  const openRecommendation = (
    title: string,
    value: string,
    icon: keyof typeof Ionicons.glyphMap
  ) => {
    setSelectedRecommendation({ title, value, icon });
  };

  const loadBrand = async () => {
    try {
      const saved = await AsyncStorage.getItem(
        "artboost_brand_profile"
      );

      if (!saved) {
        return;
      }

      const profile = JSON.parse(saved);

      setBrandName(profile.brandName || "");
      setBrandVoice(profile.brandVoice || "");
      setTargetAudience(
        profile.targetAudience || ""
      );
      setDefaultCTA(profile.defaultCTA || "");
      setDefaultHashtags(
        profile.defaultHashtags || ""
      );
      setAvoidWords(profile.avoidWords || "");

      setRecommendedPlatforms(
        profile.recommendedPlatforms || ""
      );

      setRecommendedSchedule(
        profile.recommendedSchedule || ""
      );

      setRecommendedAutomation(
        profile.recommendedAutomation || ""
      );

      setRecommendedCampaigns(
        profile.recommendedCampaigns || ""
      );

      setExamplePost(
        profile.examplePost || ""
      );
    } catch (error) {
      console.log(
        "Unable to load marketing profile:",
        error
      );

      Alert.alert(
        "Unable to Load Profile",
        "ArtBoost could not load your saved marketing profile."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const saveBrand = async () => {
    if (!hasMarketingProfile) {
      Alert.alert(
        "Generate Your Profile First",
        "Create or enter your marketing profile before saving."
      );
      return;
    }

    try {
      const profile = {
        brandName: brandName.trim(),
        brandVoice: brandVoice.trim(),
        targetAudience:
          targetAudience.trim(),
        defaultCTA: defaultCTA.trim(),
        defaultHashtags:
          defaultHashtags.trim(),
        avoidWords: avoidWords.trim(),
        recommendedPlatforms:
          recommendedPlatforms.trim(),
        recommendedSchedule:
          recommendedSchedule.trim(),
        recommendedAutomation:
          recommendedAutomation.trim(),
        recommendedCampaigns:
          recommendedCampaigns.trim(),
        examplePost:
          examplePost.trim(),
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        "artboost_brand_profile",
        JSON.stringify(profile)
      );

      Alert.alert(
        "Marketing Profile Saved",
        "Your ArtBoost AI Marketing Consultant profile has been saved. ArtBoost can now use it to create more consistent marketing content."
      );
    } catch (error) {
      console.log(
        "Unable to save marketing profile:",
        error
      );

      Alert.alert(
        "Unable to Save",
        "ArtBoost could not save your marketing profile."
      );
    }
  };

  const clearBrand = async () => {
    Alert.alert(
      "Clear Marketing Profile?",
      "This will remove your saved brand voice, target audience, hashtags, CTA, and AI recommendations.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(
                "artboost_brand_profile"
              );

              setBrandName("");
              setBrandVoice("");
              setTargetAudience("");
              setDefaultCTA("");
              setDefaultHashtags("");
              setAvoidWords("");
              setRecommendedPlatforms("");
              setRecommendedSchedule("");
              setRecommendedAutomation("");
              setRecommendedCampaigns("");
              setExamplePost("");

              Alert.alert(
                "Profile Cleared",
                "Your marketing profile has been cleared."
              );
            } catch (error) {
              console.log(
                "Unable to clear profile:",
                error
              );

              Alert.alert(
                "Unable to Clear",
                "ArtBoost could not clear your marketing profile."
              );
            }
          },
        },
      ]
    );
  };

  const resetWizard = () => {
    setWizardStep(1);
    setArtistName(brandName);
    setSelectedArtworkTypes([]);
    setSelectedBrandTraits([]);
    setSelectedAudiences([]);
    setSelectedMarketingGoal("");
    setAdditionalDetails("");
  };

  const openWizard = () => {
    resetWizard();
    setWizardVisible(true);
  };

  const closeWizard = () => {
    setWizardVisible(false);
    setWizardStep(1);
  };

  const goToNextStep = () => {
    if (
      wizardStep === 1 &&
      !artistName.trim()
    ) {
      Alert.alert(
        "Name Required",
        "Enter your artist, brand, or business name."
      );
      return;
    }

    if (
      wizardStep === 2 &&
      selectedArtworkTypes.length === 0
    ) {
      Alert.alert(
        "Choose Artwork Types",
        "Select at least one type of artwork."
      );
      return;
    }

    if (
      wizardStep === 3 &&
      selectedBrandTraits.length === 0
    ) {
      Alert.alert(
        "Choose Your Style",
        "Select at least one word that describes your brand."
      );
      return;
    }

    if (
      wizardStep === 4 &&
      selectedAudiences.length === 0
    ) {
      Alert.alert(
        "Choose Your Audience",
        "Select at least one audience."
      );
      return;
    }

    if (
      wizardStep === 5 &&
      !selectedMarketingGoal
    ) {
      Alert.alert(
        "Choose a Goal",
        "Select your main marketing goal."
      );
      return;
    }

    if (wizardStep < 6) {
      setWizardStep(current => current + 1);
    }
  };

  const goToPreviousStep = () => {
    if (wizardStep > 1) {
      setWizardStep(current => current - 1);
    }
  };

  const generateFallbackMarketingProfile = (showAlert = true) => {
    const artworkDescription =
      createReadableList(selectedArtworkTypes);

    const traitDescription =
      createReadableList(selectedBrandTraits);

    const audienceDescription =
      createReadableList(selectedAudiences);

    const primaryArtwork =
      selectedArtworkTypes[0] || "artwork";

    const generatedBrandVoice =
      `${traitDescription}. Use confident, natural, conversational marketing language that highlights the creativity, quality, and personality behind the artwork. Keep the content engaging and easy to understand without sounding overly corporate, repetitive, or exaggerated.` +
      (additionalDetails.trim()
        ? ` Additional brand direction: ${additionalDetails.trim()}`
        : "");

    const generatedAudience =
      `${audienceDescription}. Focus on people who appreciate ${artworkDescription.toLowerCase()}, original designs, artist-created products, and unique gifts.`;

    let generatedCTA =
      "Explore this design and see the available products here:";

    if (
      selectedMarketingGoal ===
      "Increase Brand Awareness"
    ) {
      generatedCTA =
        "Follow along and discover more original artwork from this collection.";
    } else if (
      selectedMarketingGoal ===
      "Drive Product Sales"
    ) {
      generatedCTA =
        "Shop this original design and see all available products here:";
    } else if (
      selectedMarketingGoal ===
      "Grow Social Media"
    ) {
      generatedCTA =
        "Follow for more original artwork, new releases, and behind-the-scenes updates.";
    } else if (
      selectedMarketingGoal ===
      "Promote New Artwork"
    ) {
      generatedCTA =
        "Check out this new release and explore the full design here:";
    } else if (
      selectedMarketingGoal ===
      "Build a Loyal Audience"
    ) {
      generatedCTA =
        "Join the community and follow for more original artwork and upcoming releases.";
    } else if (
      selectedMarketingGoal ===
      "Market My Full Catalog"
    ) {
      generatedCTA =
        "Explore the full collection and find your favorite design here:";
    }

    const generatedHashtags = Array.from(
      new Set([
        createHashtag(artistName),
        "#OriginalArtwork",
        "#ArtistMade",
        "#ArtMarketing",
        ...selectedArtworkTypes
          .slice(0, 4)
          .map(createHashtag),
        ...selectedBrandTraits
          .slice(0, 2)
          .map(createHashtag),
      ])
    ).join(" ");

    let platforms =
      "Instagram, Facebook, and Pinterest";

    if (
      selectedArtworkTypes.some(type =>
        [
          "Fishing",
          "Wildlife",
          "Hunting",
          "Outdoor",
          "Apparel",
          "Stickers",
        ].includes(type)
      )
    ) {
      platforms =
        "Pinterest for long-term discovery, Facebook for interest-based communities, and Instagram for visual promotion";
    }

    if (
      selectedArtworkTypes.some(type =>
        [
          "Automotive",
          "Sports",
          "Horror",
          "Fantasy",
        ].includes(type)
      )
    ) {
      platforms =
        "Instagram for visual content, Facebook for enthusiast communities, and Pinterest for searchable evergreen traffic";
    }

    let schedule =
      "Post 1 time per day on your primary platforms and maintain a consistent weekly schedule.";

    if (
      selectedMarketingGoal ===
        "Drive Product Sales" ||
      selectedMarketingGoal ===
        "Market My Full Catalog"
    ) {
      schedule =
        "Post 1–2 times per day using a balanced rotation of products. Avoid repeating the same artwork too frequently.";
    }

    if (
      selectedMarketingGoal ===
      "Grow Social Media"
    ) {
      schedule =
        "Post daily and combine product promotions with artwork stories, behind-the-scenes content, and new-release announcements.";
    }

    let automation =
      "Use Least Recently Posted to rotate artwork evenly across your catalog.";

    if (
      selectedMarketingGoal ===
      "Promote New Artwork"
    ) {
      automation =
        "Use Never Posted First so new artwork receives priority before older designs repeat.";
    }

    if (
      selectedArtworkTypes.length <= 2
    ) {
      automation =
        "Create separate automations for each major artwork category and use Least Recently Posted for balanced promotion.";
    }

    const campaigns = [
      `${primaryArtwork} Collection Spotlight`,
      "New Artwork Release",
      "Artist Favorites",
      "Gift Ideas and Featured Designs",
    ].join(", ");

    setBrandName(artistName.trim());
    setBrandVoice(generatedBrandVoice);
    setTargetAudience(generatedAudience);
    setDefaultCTA(generatedCTA);
    setDefaultHashtags(
      generatedHashtags
    );

    setAvoidWords(
      'Avoid exaggerated or misleading claims such as "guaranteed," "best ever," "must-have," or "viral." Avoid copyrighted names unless they are part of an approved product description. Do not describe print-on-demand products as handmade or hand-painted.'
    );

    setRecommendedPlatforms(platforms);
    setRecommendedSchedule(schedule);
    setRecommendedAutomation(automation);
    setRecommendedCampaigns(campaigns);

    setWizardVisible(false);
    setWizardStep(1);

    setExamplePost(
      `${artistName.trim()} creates ${artworkDescription.toLowerCase()} for ${audienceDescription.toLowerCase()}. ${generatedCTA} ${generatedHashtags}`.trim()
    );

    if (showAlert) {
      Alert.alert(
        "Marketing Profile Generated",
        "ArtBoost created your marketing profile. Review each section, make any changes you want, and then save it."
      );
    }
  };

  const generateMarketingProfile = async () => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      const accessToken =
        sessionData?.session?.access_token || "";

      if (sessionError || !accessToken) {
        throw new Error(
          "Please sign in again before generating your marketing profile."
        );
      }

      const response = await fetch(
        `${BACKEND_URL}/marketing-consultant/profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            artistName: artistName.trim(),
            artworkTypes: selectedArtworkTypes,
            brandTraits: selectedBrandTraits,
            audiences: selectedAudiences,
            marketingGoal: selectedMarketingGoal,
            additionalDetails: additionalDetails.trim(),
          }),
        }
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            "ArtBoost could not generate the marketing profile."
        );
      }

      const profile =
        payload?.profile || {};

      setBrandName(
        String(profile.brandName || artistName).trim()
      );
      setBrandVoice(
        String(profile.brandVoice || "").trim()
      );
      setTargetAudience(
        String(profile.targetAudience || "").trim()
      );
      setDefaultCTA(
        String(profile.defaultCTA || "").trim()
      );

      const hashtags =
        Array.isArray(profile.defaultHashtags)
          ? profile.defaultHashtags.join(" ")
          : String(profile.defaultHashtags || "");

      setDefaultHashtags(
        hashtags.trim()
      );
      setAvoidWords(
        String(profile.avoidWords || "").trim()
      );
      setRecommendedPlatforms(
        String(profile.recommendedPlatforms || "").trim()
      );
      setRecommendedSchedule(
        String(profile.recommendedSchedule || "").trim()
      );
      setRecommendedAutomation(
        String(profile.recommendedAutomation || "").trim()
      );
      setRecommendedCampaigns(
        String(profile.recommendedCampaigns || "").trim()
      );
      setExamplePost(
        String(profile.examplePost || "").trim()
      );

      setWizardVisible(false);
      setWizardStep(1);

      Alert.alert(
        "AI Marketing Profile Generated",
        "ArtBoost AI built your profile using your answers plus your connected ArtBoost stores and social platforms. Review it, then save."
      );
    } catch (error: any) {
      console.log(
        "AI marketing profile generation failed:",
        error
      );

      /*
       * Keep the consultant usable if the AI service is temporarily
       * unavailable. The existing built-in generator is a launch-safe
       * fallback rather than leaving the user stuck.
       */
      generateFallbackMarketingProfile(false);

      Alert.alert(
        "Used Built-In Strategy",
        "The live AI consultant was temporarily unavailable, so ArtBoost created a profile using its built-in marketing strategy. You can review and save it normally."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    loadBrand();
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Ionicons
            name="sparkles"
            size={36}
            color="#a78bfa"
          />

          <Text style={styles.loadingTitle}>
            Loading Marketing Profile
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.replace({
              pathname: "/(tabs)",
              params: {
                openMore: "true",
              },
            })
          }
        >
          <Ionicons
            name="chevron-back"
            size={25}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerBarTitle}>
            AI Marketing Consultant
          </Text>

          <Text style={styles.headerBarSubtitle}>
            Build your ArtBoost marketing strategy
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="sparkles"
            size={23}
            color="#ffffff"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="bulb"
              size={29}
              color="#ffffff"
            />
          </View>

          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>
              ArtBoost AI Marketing Consultant
            </Text>

            <Text style={styles.heroDescription}>
              Tell ArtBoost about your artwork and
              audience. Your AI Marketing Consultant
              will build a custom marketing profile,
              brand voice, hashtags, CTA, platform
              strategy, posting schedule, and automation
              recommendations.
            </Text>
          </View>
        </View>

        <View style={styles.snapshotCard}>
          <View style={styles.snapshotHeader}>
            <View>
              <Text style={styles.snapshotEyebrow}>BUSINESS SNAPSHOT</Text>
              <Text style={styles.snapshotTitle}>Marketing readiness</Text>
            </View>

            <View style={styles.marketingScoreCircle}>
              <Text style={styles.marketingScoreValue}>{marketingScore}</Text>
              <Text style={styles.marketingScoreLabel}>SCORE</Text>
            </View>
          </View>

          <View style={styles.snapshotMetrics}>
            <View style={styles.snapshotMetric}>
              <Text style={styles.snapshotMetricValue}>{profileCompletion}%</Text>
              <Text style={styles.snapshotMetricLabel}>Profile complete</Text>
            </View>

            <View style={styles.snapshotDivider} />

            <View style={styles.snapshotMetric}>
              <Text style={styles.snapshotMetricValue}>
                {[recommendedPlatforms, recommendedSchedule, recommendedAutomation, recommendedCampaigns].filter(Boolean).length}/4
              </Text>
              <Text style={styles.snapshotMetricLabel}>Strategies ready</Text>
            </View>

            <View style={styles.snapshotDivider} />

            <View style={styles.snapshotMetric}>
              <Text style={styles.snapshotMetricValue}>
                {hasMarketingProfile ? "Ready" : "Start"}
              </Text>
              <Text style={styles.snapshotMetricLabel}>Consultant status</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${profileCompletion}%` },
              ]}
            />
          </View>
        </View>

        <Pressable
          style={styles.generateButton}
          onPress={openWizard}
        >
          <View style={styles.generateButtonIcon}>
            <Ionicons
              name="sparkles"
              size={24}
              color="#ffffff"
            />
          </View>

          <View style={styles.generateButtonTextWrap}>
            <Text style={styles.generateButtonTitle}>
              {hasMarketingProfile
                ? "Regenerate with AI"
                : "Generate My Marketing Profile"}
            </Text>

            <Text
              style={
                styles.generateButtonDescription
              }
            >
              Answer a few simple questions and let
              ArtBoost build your strategy.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Your Marketing Profile
          </Text>

          <Text style={styles.sectionDescription}>
            Review and edit any AI-generated
            recommendation before saving.
          </Text>
        </View>

        <View style={styles.card}>
          <Field
            label="Artist / Business Name"
            value={brandName}
            onChangeText={setBrandName}
            placeholder="ArtistWill, Will’s Custom Airbrushing, etc."
          />

          <Field
            label="Brand Voice"
            value={brandVoice}
            onChangeText={setBrandVoice}
            placeholder="How should ArtBoost describe and promote your artwork?"
            multiline
          />

          <Field
            label="Target Audience"
            value={targetAudience}
            onChangeText={setTargetAudience}
            placeholder="Who is most likely to enjoy or purchase your artwork?"
            multiline
          />

          <Field
            label="Default Call to Action"
            value={defaultCTA}
            onChangeText={setDefaultCTA}
            placeholder="Explore this design here:"
            multiline
          />

          <Field
            label="Default Hashtags"
            value={defaultHashtags}
            onChangeText={setDefaultHashtags}
            placeholder="#OriginalArtwork #ArtistMade"
            multiline
          />

          <Field
            label="Words and Phrases to Avoid"
            value={avoidWords}
            onChangeText={setAvoidWords}
            placeholder="Add claims, terms, or styles ArtBoost should avoid."
            multiline
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            AI Recommendations
          </Text>

          <Text style={styles.sectionDescription}>
            These recommendations help guide your
            campaigns and automations.
          </Text>
        </View>

        <View style={styles.recommendationList}>
          <RecommendationCard
            icon="share-social-outline"
            title="Recommended Platforms"
            value={
              recommendedPlatforms ||
              "Generate your marketing profile to receive platform recommendations."
            }
            onPress={() =>
              openRecommendation(
                "Recommended Platforms",
                recommendedPlatforms ||
                  "Generate your marketing profile to receive platform recommendations.",
                "share-social-outline"
              )
            }
          />

          <RecommendationCard
            icon="calendar-outline"
            title="Recommended Posting Schedule"
            value={
              recommendedSchedule ||
              "Generate your marketing profile to receive a posting recommendation."
            }
            onPress={() =>
              openRecommendation(
                "Recommended Posting Schedule",
                recommendedSchedule ||
                  "Generate your marketing profile to receive a posting recommendation.",
                "calendar-outline"
              )
            }
          />

          <RecommendationCard
            icon="repeat-outline"
            title="Recommended Automation"
            value={
              recommendedAutomation ||
              "Generate your marketing profile to receive an automation strategy."
            }
            onPress={() =>
              openRecommendation(
                "Recommended Automation",
                recommendedAutomation ||
                  "Generate your marketing profile to receive an automation strategy.",
                "repeat-outline"
              )
            }
          />

          <RecommendationCard
            icon="megaphone-outline"
            title="Campaign Ideas"
            value={
              recommendedCampaigns ||
              "Generate your marketing profile to receive campaign ideas."
            }
            onPress={() =>
              openRecommendation(
                "Campaign Ideas",
                recommendedCampaigns ||
                  "Generate your marketing profile to receive campaign ideas.",
                "megaphone-outline"
              )
            }
          />
        </View>

        <Pressable
          style={[
            styles.previewButton,
            !hasMarketingProfile &&
              styles.disabledButton,
          ]}
          disabled={!hasMarketingProfile}
          onPress={() =>
            setPreviewVisible(true)
          }
        >
          <Ionicons
            name="eye-outline"
            size={21}
            color="#ffffff"
          />

          <Text style={styles.previewButtonText}>
            Preview Example Post
          </Text>
        </Pressable>

        <Pressable
          style={styles.saveButton}
          onPress={saveBrand}
        >
          <Ionicons
            name="save-outline"
            size={21}
            color="#ffffff"
          />

          <Text style={styles.buttonText}>
            Save Marketing Profile
          </Text>
        </Pressable>

        <Pressable
          style={styles.clearButton}
          onPress={clearBrand}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color="#fca5a5"
          />

          <Text style={styles.clearButtonText}>
            Clear Marketing Profile
          </Text>
        </Pressable>

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={23}
            color="#a78bfa"
          />

          <Text style={styles.infoText}>
            ArtBoost AI builds recommendations from your
            profile answers and your connected stores and
            social platforms. Your approved profile is
            saved on this device for ArtBoost content
            tools that read the existing
            artboost_brand_profile storage record.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={wizardVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeWizard}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable
              style={styles.modalCloseButton}
              onPress={closeWizard}
            >
              <Ionicons
                name="close"
                size={25}
                color="#ffffff"
              />
            </Pressable>

            <View style={styles.modalHeaderText}>
              <Text style={styles.modalHeaderTitle}>
                Build My Marketing Profile
              </Text>

              <Text
                style={styles.modalHeaderSubtitle}
              >
                Step {wizardStep} of 6
              </Text>
            </View>
          </View>

          <View style={styles.wizardProgressTrack}>
            <View
              style={[
                styles.wizardProgressFill,
                {
                  width: `${
                    (wizardStep / 6) * 100
                  }%`,
                },
              ]}
            />
          </View>

          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={
              styles.modalContent
            }
            keyboardShouldPersistTaps="handled"
          >
            {wizardStep === 1 ? (
              <View>
                <WizardHeading
                  icon="person-outline"
                  title="About You"
                  description="Start with the name customers should recognize."
                />

                <Text style={styles.wizardLabel}>
                  Artist, Brand, or Business Name
                </Text>

                <TextInput
                  style={styles.wizardInput}
                  value={artistName}
                  onChangeText={setArtistName}
                  placeholder="Enter your name"
                  placeholderTextColor="#73737a"
                />
              </View>
            ) : null}

            {wizardStep === 2 ? (
              <View>
                <WizardHeading
                  icon="color-palette-outline"
                  title="Your Artwork"
                  description="Select every category that describes what you create."
                />

                <View style={styles.optionsWrap}>
                  {ARTWORK_TYPES.map(option => (
                    <SelectableOption
                      key={option}
                      label={option}
                      selected={selectedArtworkTypes.includes(
                        option
                      )}
                      onPress={() =>
                        setSelectedArtworkTypes(
                          current =>
                            toggleSelection(
                              current,
                              option
                            )
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {wizardStep === 3 ? (
              <View>
                <WizardHeading
                  icon="chatbubble-ellipses-outline"
                  title="Your Brand Style"
                  description="Choose the words that best describe how your marketing should sound."
                />

                <View style={styles.optionsWrap}>
                  {BRAND_TRAITS.map(option => (
                    <SelectableOption
                      key={option}
                      label={option}
                      selected={selectedBrandTraits.includes(
                        option
                      )}
                      onPress={() =>
                        setSelectedBrandTraits(
                          current =>
                            toggleSelection(
                              current,
                              option
                            )
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {wizardStep === 4 ? (
              <View>
                <WizardHeading
                  icon="people-outline"
                  title="Your Audience"
                  description="Select the people most likely to enjoy or purchase your artwork."
                />

                <View style={styles.optionsWrap}>
                  {AUDIENCE_OPTIONS.map(option => (
                    <SelectableOption
                      key={option}
                      label={option}
                      selected={selectedAudiences.includes(
                        option
                      )}
                      onPress={() =>
                        setSelectedAudiences(
                          current =>
                            toggleSelection(
                              current,
                              option
                            )
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {wizardStep === 5 ? (
              <View>
                <WizardHeading
                  icon="flag-outline"
                  title="Your Main Goal"
                  description="Choose the result you want ArtBoost to prioritize."
                />

                <View style={styles.goalList}>
                  {MARKETING_GOALS.map(option => {
                    const selected =
                      selectedMarketingGoal ===
                      option;

                    return (
                      <Pressable
                        key={option}
                        style={[
                          styles.goalOption,
                          selected &&
                            styles.goalOptionSelected,
                        ]}
                        onPress={() =>
                          setSelectedMarketingGoal(
                            option
                          )
                        }
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            selected &&
                              styles.radioOuterSelected,
                          ]}
                        >
                          {selected ? (
                            <View
                              style={
                                styles.radioInner
                              }
                            />
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.goalOptionText,
                            selected &&
                              styles.goalOptionTextSelected,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {wizardStep === 6 ? (
              <View>
                <WizardHeading
                  icon="create-outline"
                  title="Anything Else?"
                  description="Add optional details that make your artwork or brand different."
                />

                <Text style={styles.wizardLabel}>
                  Additional Brand Information
                </Text>

                <TextInput
                  style={[
                    styles.wizardInput,
                    styles.wizardTextArea,
                  ]}
                  value={additionalDetails}
                  onChangeText={
                    setAdditionalDetails
                  }
                  multiline
                  textAlignVertical="top"
                  placeholder="Example: My artwork is created for blue-collar workers and outdoor enthusiasts. I want the marketing to feel authentic and not overly sales-focused."
                  placeholderTextColor="#73737a"
                />

                <View style={styles.readyCard}>
                  <Ionicons
                    name="sparkles"
                    size={26}
                    color="#d8b4fe"
                  />

                  <View style={styles.readyTextWrap}>
                    <Text style={styles.readyTitle}>
                      Ready to Generate
                    </Text>

                    <Text
                      style={styles.readyDescription}
                    >
                      ArtBoost will create your brand
                      voice, audience, CTA, hashtags,
                      platform strategy, posting
                      schedule, automation recommendation,
                      and campaign ideas.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.modalFooter}>
            {wizardStep > 1 ? (
              <Pressable
                style={styles.previousButton}
                onPress={goToPreviousStep}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color="#ffffff"
                />

                <Text
                  style={styles.previousButtonText}
                >
                  Back
                </Text>
              </Pressable>
            ) : (
              <View />
            )}

            {wizardStep < 6 ? (
              <Pressable
                style={styles.nextButton}
                onPress={goToNextStep}
              >
                <Text style={styles.nextButtonText}>
                  Continue
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#ffffff"
                />
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.nextButton,
                  isGenerating &&
                    styles.disabledButton,
                ]}
                onPress={
                  generateMarketingProfile
                }
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />
                ) : (
                  <Ionicons
                    name="sparkles"
                    size={19}
                    color="#ffffff"
                  />
                )}

                <Text style={styles.nextButtonText}>
                  {isGenerating
                    ? "Building Strategy..."
                    : "Generate Profile"}
                </Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(selectedRecommendation)}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedRecommendation(null)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.recommendationModal}>
            <View style={styles.recommendationModalHeader}>
              <View style={styles.recommendationModalIcon}>
                <Ionicons
                  name={selectedRecommendation?.icon || "sparkles-outline"}
                  size={25}
                  color="#ffffff"
                />
              </View>

              <View style={styles.recommendationModalTitleWrap}>
                <Text style={styles.recommendationModalEyebrow}>AI RECOMMENDATION</Text>
                <Text style={styles.recommendationModalTitle}>
                  {selectedRecommendation?.title}
                </Text>
              </View>

              <Pressable
                style={styles.previewCloseButton}
                onPress={() => setSelectedRecommendation(null)}
              >
                <Ionicons name="close" size={23} color="#ffffff" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.recommendationModalText}>
                {selectedRecommendation?.value}
              </Text>

              <View style={styles.actionPlanCard}>
                <Text style={styles.actionPlanTitle}>How to use this</Text>
                <Text style={styles.actionPlanText}>
                  Apply this recommendation when creating campaigns, choosing automation settings, and planning your weekly marketing. Update your profile whenever your audience, catalog, or goals change.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewVisible}
        animationType="fade"
        transparent
        onRequestClose={() =>
          setPreviewVisible(false)
        }
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewModal}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.previewTitle}>
                  Example Marketing Post
                </Text>

                <Text
                  style={styles.previewSubtitle}
                >
                  Generated from your profile
                </Text>
              </View>

              <Pressable
                style={styles.previewCloseButton}
                onPress={() =>
                  setPreviewVisible(false)
                }
              >
                <Ionicons
                  name="close"
                  size={23}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.previewScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.previewPostTitle}>
                Discover Original Artwork from{" "}
                {brandName || "Your Brand"}
              </Text>

              <Text style={styles.previewPostBody}>
                {examplePost ||
                  `Explore an original design created for ${
                    targetAudience ||
                    "art lovers and collectors"
                  }. This post uses your saved brand voice to keep ArtBoost campaigns consistent, recognizable, and aligned with your audience.`}
              </Text>

              <Text style={styles.previewCTA}>
                {defaultCTA ||
                  "Explore this design here:"}
              </Text>

              <Text style={styles.previewHashtags}>
                {defaultHashtags ||
                  "#OriginalArtwork #ArtistMade"}
              </Text>

              <View style={styles.previewVoiceCard}>
                <Text
                  style={styles.previewVoiceLabel}
                >
                  Brand Voice Being Used
                </Text>

                <Text
                  style={styles.previewVoiceText}
                >
                  {brandVoice ||
                    "Your saved brand voice will appear here."}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        style={[
          styles.input,
          multiline && styles.textarea,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#77777e"
        multiline={multiline}
        textAlignVertical={
          multiline ? "top" : "center"
        }
      />
    </View>
  );
}

function SelectableOption({
  label,
  selected,
  onPress,
}: SelectableOptionProps) {
  return (
    <Pressable
      style={[
        styles.selectableOption,
        selected &&
          styles.selectableOptionSelected,
      ]}
      onPress={onPress}
    >
      {selected ? (
        <Ionicons
          name="checkmark-circle"
          size={17}
          color="#ffffff"
        />
      ) : null}

      <Text
        style={[
          styles.selectableOptionText,
          selected &&
            styles.selectableOptionTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function WizardHeading({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.wizardHeading}>
      <View style={styles.wizardHeadingIcon}>
        <Ionicons
          name={icon}
          size={25}
          color="#ffffff"
        />
      </View>

      <Text style={styles.wizardTitle}>
        {title}
      </Text>

      <Text style={styles.wizardDescription}>
        {description}
      </Text>
    </View>
  );
}

function RecommendationCard({
  icon,
  title,
  value,
  onPress,
}: RecommendationCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.recommendationCard,
        pressed && styles.recommendationCardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View style={styles.recommendationIcon}>
        <Ionicons
          name={icon}
          size={22}
          color="#d8b4fe"
        />
      </View>

      <View style={styles.recommendationTextWrap}>
        <Text style={styles.recommendationTitle}>
          {title}
        </Text>

        <Text style={styles.recommendationValue} numberOfLines={2}>
          {value}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color="#8b5cf6"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0c0d",
  },

  headerBar: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#111112",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#202024",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerBarTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },

  headerBarSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 2,
  },

  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollView: {
    flex: 1,
  },

  container: {
    padding: 18,
    paddingBottom: 55,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 13,
  },

  heroCard: {
    backgroundColor: "#18131f",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#3a2750",
    flexDirection: "row",
    alignItems: "flex-start",
  },

  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  heroTextWrap: {
    flex: 1,
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },

  heroDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },

  snapshotCard: {
    backgroundColor: "#171719",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#343038",
    padding: 18,
    marginBottom: 16,
  },

  snapshotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  snapshotEyebrow: {
    color: "#a78bfa",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  snapshotTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 5,
  },

  marketingScoreCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#2c1f47",
    borderWidth: 1,
    borderColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  marketingScoreValue: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
  },

  marketingScoreLabel: {
    color: "#c4b5fd",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
  },

  snapshotMetrics: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 16,
  },

  snapshotMetric: {
    flex: 1,
    alignItems: "center",
  },

  snapshotMetricValue: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  snapshotMetricLabel: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },

  snapshotDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#343438",
  },

  completionCard: {
    backgroundColor: "#171719",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    marginTop: 14,
  },

  completionTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  completionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  completionSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 3,
  },

  scoreCircle: {
    marginLeft: "auto",
    width: 50,
    height: 50,
    borderRadius: 99,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
  },

  scoreText: {
    color: "#d8b4fe",
    fontSize: 13,
    fontWeight: "900",
  },

  progressTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: "#303034",
    overflow: "hidden",
    marginTop: 14,
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#8b5cf6",
  },

  generateButton: {
    backgroundColor: "#7c3aed",
    borderRadius: 18,
    padding: 15,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  generateButtonIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  generateButtonTextWrap: {
    flex: 1,
    paddingRight: 8,
  },

  generateButtonTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  generateButtonDescription: {
    color: "#e4d8f4",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  sectionHeader: {
    marginTop: 27,
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  sectionDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  card: {
    backgroundColor: "#171719",
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2b2b2f",
  },

  field: {
    marginBottom: 17,
  },

  label: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },

  input: {
    minHeight: 50,
    backgroundColor: "#252529",
    color: "#ffffff",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#343439",
  },

  textarea: {
    minHeight: 105,
    lineHeight: 19,
  },

  recommendationList: {
    gap: 10,
  },

  recommendationCard: {
    backgroundColor: "#171719",
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    flexDirection: "row",
    alignItems: "flex-start",
  },

  recommendationIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  recommendationTextWrap: {
    flex: 1,
  },

  recommendationTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  recommendationValue: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  previewButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: "#30263b",
    borderWidth: 1,
    borderColor: "#5a3b76",
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  disabledButton: {
    opacity: 0.45,
  },

  previewButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  saveButton: {
    minHeight: 54,
    backgroundColor: "#8b5cf6",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  clearButton: {
    minHeight: 51,
    backgroundColor: "#291c20",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#513037",
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  clearButtonText: {
    color: "#fca5a5",
    fontSize: 14,
    fontWeight: "900",
  },

  infoCard: {
    backgroundColor: "#151218",
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: "#33263d",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 17,
  },

  infoText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 10,
    lineHeight: 16,
    marginLeft: 10,
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: "#0c0c0d",
  },

  modalHeader: {
    minHeight: 76,
    paddingHorizontal: 17,
    paddingVertical: 12,
    backgroundColor: "#111112",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
  },

  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#202024",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalHeaderTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  modalHeaderSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 2,
  },

  wizardProgressTrack: {
    height: 5,
    backgroundColor: "#29292d",
  },

  wizardProgressFill: {
    height: "100%",
    backgroundColor: "#8b5cf6",
  },

  modalScrollView: {
    flex: 1,
  },

  modalContent: {
    padding: 20,
    paddingBottom: 35,
  },

  wizardHeading: {
    alignItems: "center",
    marginBottom: 25,
  },

  wizardHeadingIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  wizardTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },

  wizardDescription: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 330,
  },

  wizardLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 9,
  },

  wizardInput: {
    minHeight: 54,
    backgroundColor: "#19191c",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#333338",
    color: "#ffffff",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  wizardTextArea: {
    minHeight: 150,
    lineHeight: 21,
  },

  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  selectableOption: {
    backgroundColor: "#1b1b1e",
    borderRadius: 99,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#343439",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  selectableOptionSelected: {
    backgroundColor: "#7c3aed",
    borderColor: "#7c3aed",
  },

  selectableOptionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  selectableOptionTextSelected: {
    color: "#ffffff",
  },

  goalList: {
    gap: 9,
  },

  goalOption: {
    minHeight: 56,
    backgroundColor: "#19191c",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#333338",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
  },

  goalOptionSelected: {
    backgroundColor: "#21182a",
    borderColor: "#8b5cf6",
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: "#55555c",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  radioOuterSelected: {
    borderColor: "#a78bfa",
  },

  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 99,
    backgroundColor: "#a78bfa",
  },

  goalOptionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },

  goalOptionTextSelected: {
    color: "#ffffff",
  },

  readyCard: {
    backgroundColor: "#19151e",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#49305f",
    padding: 16,
    marginTop: 17,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  readyTextWrap: {
    flex: 1,
    marginLeft: 12,
  },

  readyTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  readyDescription: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  modalFooter: {
    minHeight: 78,
    paddingHorizontal: 17,
    paddingVertical: 12,
    backgroundColor: "#111112",
    borderTopWidth: 1,
    borderTopColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  previousButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#252529",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  previousButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },

  nextButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },

  nextButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  recommendationCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },

  recommendationModal: {
    width: "88%",
    maxHeight: "72%",
    backgroundColor: "#171719",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#49336f",
    padding: 18,
  },

  recommendationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  recommendationModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },

  recommendationModalTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },

  recommendationModalEyebrow: {
    color: "#a78bfa",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  recommendationModalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },

  recommendationModalText: {
    color: "#dddddf",
    fontSize: 14,
    lineHeight: 22,
  },

  actionPlanCard: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#201a2e",
    borderWidth: 1,
    borderColor: "#3f3159",
    padding: 15,
  },

  actionPlanTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  actionPlanText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  previewModal: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: "#161618",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3d2b4c",
    overflow: "hidden",
  },

  previewHeader: {
    padding: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#2b2b2f",
    flexDirection: "row",
    alignItems: "center",
  },

  previewTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  previewSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 2,
  },

  previewCloseButton: {
    marginLeft: "auto",
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#28282c",
    alignItems: "center",
    justifyContent: "center",
  },

  previewScroll: {
    padding: 18,
  },

  previewPostTitle: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
  },

  previewPostBody: {
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 21,
    marginTop: 13,
  },

  previewCTA: {
    color: "#d8b4fe",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    marginTop: 16,
  },

  previewHashtags: {
    color: "#a78bfa",
    fontSize: 12,
    lineHeight: 20,
    marginTop: 14,
  },

  previewVoiceCard: {
    backgroundColor: "#211a28",
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: "#3e2b4b",
    marginTop: 18,
    marginBottom: 35,
  },

  previewVoiceLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  previewVoiceText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
});