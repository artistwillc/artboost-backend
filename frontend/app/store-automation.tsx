// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_V3142_FINAL_CLEANUP_ICONS
// ARTBOOST_WHITE_TEXT_AUDIT_V3141
/* eslint-disable react/no-unescaped-entities */
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import ArtBoostBrandIcon from "@/components/ArtBoostBrandIcon";
import { supabase } from "../lib/supabase";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

const API_BASE = "https://artboost-ai.onrender.com";

type Frequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "every_x_days"
  | "one_time";

type SelectionMode =
  | "never_posted_first"
  | "least_recently_posted"
  | "random";

type AutomationSource =
  | "all_products"
  | "favorites";

type PlatformOption = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  available: boolean;
};

type FacebookPage = {
  id: string;
  name: string;
};

type PinterestBoard = {
  id: string;
  name: string;
};

const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    id: "facebook",
    label: "Facebook",
    icon: "logo-facebook",
    available: true,
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    available: true,
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: "logo-pinterest",
    available: true,
  },
  {
    id: "x",
    label: "X",
    icon: "logo-twitter",
    available: true,
  },
  {
    id: "threads",
    label: "Threads",
    icon: "at-circle-outline",
    available: true,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: "logo-linkedin",
    available: true,
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "logo-tiktok",
    available: true,
  },
  {
    id: "universal",
    label: "Universal Social",
    icon: "git-network-outline",
    available: true,
  },

];

const FREQUENCY_OPTIONS: {
  id: Frequency;
  label: string;
  description: string;
}[] = [
  {
    id: "daily",
    label: "Every Day",
    description: "Post one different product each day.",
  },
  {
    id: "weekdays",
    label: "Weekdays",
    description: "Post Monday through Friday.",
  },
  {
    id: "weekly",
    label: "Weekly",
    description: "Post one product each week.",
  },
{
  id: "every_x_days",
  label: "Every X Days",
  description:
    "Post automatically every X number of days.",
},
  {
  id: "one_time",
  label: "One-Time Promotion",
  description:
    "Post this promotion one time on the selected date and time.",
},
];

const SELECTION_OPTIONS: {
  id: SelectionMode;
  label: string;
  description: string;
}[] = [
  {
    id: "never_posted_first",
    label: "Never Posted First",
    description:
      "Promote products that have never been posted before anything else.",
  },
  {
    id: "least_recently_posted",
    label: "Least Recently Posted",
    description:
      "Choose the product that has gone the longest without promotion.",
  },
  {
    id: "random",
    label: "Random",
    description:
      "Choose randomly from products outside the repeat-delay window.",
  },
];

function formatPlatformLabel(
  value?: string
) {
  const cleanValue = String(value || "")
    .trim()
    .toLowerCase();

  if (cleanValue === "shopify") {
    return "Shopify";
  }

  if (cleanValue === "etsy") {
    return "Etsy";
  }

  if (cleanValue === "ebay") {
    return "eBay";
  }

  if (cleanValue === "redbubble") {
    return "Redbubble";
  }

  if (
    cleanValue === "fine_art_america" ||
    cleanValue === "fineartamerica"
  ) {
    return "Fine Art America";
  }

  if (cleanValue === "artpal") {
    return "ArtPal";
  }

  if (cleanValue === "gumroad") {
    return "Gumroad";
  }

  if (!cleanValue) {
    return "Connected Store";
  }

  return cleanValue
    .split(/[_\-\s]+/)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatStoreName(
  storeName: string,
  platformLabel: string
) {
  if (
    storeName
      .toLowerCase()
      .includes("myshopify.com")
  ) {
    return platformLabel;
  }

  return storeName;
}

function validateTime(
  value: string
) {
  const match = value.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

function displayTime(
  value: string
) {
  if (!validateTime(value)) {
    return value || "09:00";
  }

  const [hourValue, minute] =
    value.split(":");

  const hour = Number(hourValue);

  const displayHour =
    hour === 0
      ? 12
      : hour > 12
        ? hour - 12
        : hour;

  const suffix =
    hour >= 12 ? "PM" : "AM";

  return `${displayHour}:${minute} ${suffix}`;
}

function startDateToDate(
  value: string
) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return new Date();
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0
  );
}

function postingTimeToDate(
  value: string
) {
  const date = new Date();

  const match = value.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (!match) {
    date.setHours(9, 0, 0, 0);
    return date;
  }

  date.setHours(
    Number(match[1]),
    Number(match[2]),
    0,
    0
  );

  return date;
}

function formatDateForStorage(
  date: Date
) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(
  value: string
) {
  return startDateToDate(
    value
  ).toLocaleDateString(
    undefined,
    {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );
}

// ARTBOOST_STORE_AUTOMATION_WARNING_CLEANUP_V3102
export default function StoreAutomationScreen() {
  const params = useLocalSearchParams<{
    automationId?: string;
    storeId?: string;
    storeName?: string;
    storeType?: string;
    productCount?: string;
  }>();

  // ARTBOOST_ANALYTICS_ISSUE_AUTOMATION_DEEPLINK_V3101C
  const requestedAutomationId = String(params.automationId || "").trim();

  const storeId = params.storeId || "";
  const storeName =
    params.storeName || "Connected Store";
  const storeType =
    params.storeType || "store";

  const productCount = useMemo(() => {
    const count = Number(
      params.productCount
    );

    return Number.isNaN(count)
      ? 0
      : count;
  }, [params.productCount]);

  const platformLabel =
    useMemo(
      () =>
        formatPlatformLabel(
          storeType
        ),
      [storeType]
    );

  const displayStoreName =
    useMemo(
      () =>
        formatStoreName(
          storeName,
          platformLabel
        ),
      [storeName, platformLabel]
    );

  const [enabled, setEnabled] =
    useState(false);

  const [frequency, setFrequency] =
    useState<Frequency>("daily");

  const [postingTime, setPostingTime] =
    useState("09:00");

  const [
    additionalPostingTimes,
    setAdditionalPostingTimes,
  ] = useState<string[]>([]);

  const [
    showAdditionalTimePicker,
    setShowAdditionalTimePicker,
  ] = useState(false);

  const [
    automationSource,
    setAutomationSource,
  ] = useState<AutomationSource>(
    "all_products"
  );

    const [startDate, setStartDate] =
  useState(
    new Date()
      .toISOString()
      .split("T")[0]
  );

  const [showDatePicker, setShowDatePicker] =
  useState(false);

const [showTimePicker, setShowTimePicker] =
  useState(false);

  const [timezone] = useState(
    "America/Chicago"
  );

  const [
    selectedPlatforms,
    setSelectedPlatforms,
    ] = useState<string[]>([
    "facebook",
    "instagram",
    "x",
  ]);

  const [
    selectionMode,
    setSelectionMode,
  ] = useState<SelectionMode>(
    "never_posted_first"
  );

  const [
  repeatDelayDays,
  setRepeatDelayDays,
] = useState("30");

const [
  postingIntervalDays,
  setPostingIntervalDays,
] = useState("2");

  const [saving, setSaving] =
    useState(false);

      const [loadingAutomation, setLoadingAutomation] =
    useState(true);

    const [automationId, setAutomationId] =
  useState("");

  const [postingNow, setPostingNow] =
  useState(false);

      const [previewProduct, setPreviewProduct] =
    useState<any>(null);

  const [loadingPreview, setLoadingPreview] =
    useState(false);

  const [previewError, setPreviewError] =
    useState("");

  const [facebookPages, setFacebookPages] =
    useState<FacebookPage[]>([]);

  const [
    selectedFacebookPageId,
    setSelectedFacebookPageId,
  ] = useState("");

  const [
    loadingFacebookPages,
    setLoadingFacebookPages,
  ] = useState(false);

  const [
    facebookPagesError,
    setFacebookPagesError,
  ] = useState("");

  const [pinterestBoards, setPinterestBoards] =
    useState<PinterestBoard[]>([]);

  const [
    selectedPinterestBoardId,
    setSelectedPinterestBoardId,
  ] = useState("");

  const [
    loadingPinterestBoards,
    setLoadingPinterestBoards,
  ] = useState(false);

  const [
    pinterestBoardsError,
    setPinterestBoardsError,
  ] = useState("");

  const [tiktokCreator, setTikTokCreator] =
    useState<any>(null);

  const [
    loadingTikTokCreator,
    setLoadingTikTokCreator,
  ] = useState(false);

  const [
    tiktokCreatorError,
    setTikTokCreatorError,
  ] = useState("");

  const [
    tiktokPrivacyLevel,
    setTikTokPrivacyLevel,
  ] = useState("");

  const [
    tiktokDisableComment,
    setTikTokDisableComment,
  ] = useState(false);

  const [
    tiktokAutoAddMusic,
    setTikTokAutoAddMusic,
  ] = useState(true);

  const [
    tiktokBrandOrganicToggle,
    setTikTokBrandOrganicToggle,
  ] = useState(true);

  const [
    tiktokBrandContentToggle,
    setTikTokBrandContentToggle,
  ] = useState(false);

  const [
    tiktokConsent,
    setTikTokConsent,
  ] = useState(false);

  useEffect(() => {
    let screenIsActive = true;

    async function loadAutomation() {
      if (!storeId && !requestedAutomationId) {
        setLoadingAutomation(false);
        return;
      }

      try {
        setLoadingAutomation(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error(
            userError.message
          );
        }

        if (!user) {
          throw new Error(
            "You must be signed in to load an automation."
          );
        }

        const automationEndpoint = requestedAutomationId
          ? `${API_BASE}/automations/${encodeURIComponent(requestedAutomationId)}?userId=${encodeURIComponent(user.id)}`
          : `${API_BASE}/automations/store/${encodeURIComponent(storeId)}?userId=${encodeURIComponent(user.id)}`;

        const response = await fetch(automationEndpoint);

        const responseText =
          await response.text();

        let data: any;

        try {
          data = JSON.parse(
            responseText
          );
        } catch {
          throw new Error(
            `Backend returned ${response.status}: ${responseText.slice(
              0,
              150
            )}`
          );
        }

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.details ||
              data.error ||
              "Unable to load the saved automation."
          );
        }

        const automation = requestedAutomationId
          ? data.automation || null
          : Array.isArray(data.automations) && data.automations.length > 0
            ? data.automations[0]
            : null;

        if (
          !automation ||
          !screenIsActive
        ) {
          return;
        }

        setAutomationId(
        String(automation.id)
        );

        setEnabled(
          Boolean(
            automation.enabled
          )
        );

        if (
           automation.frequency === "daily" ||
           automation.frequency === "weekdays" ||
           automation.frequency === "weekly" ||
           automation.frequency === "every_x_days" ||
           automation.frequency === "one_time"
         ) {
           setFrequency(
             automation.frequency
           );
          }

        const savedPostingTime =
          String(
            automation.posting_time ||
              automation.postingTime ||
              "09:00"
          );

        setPostingTime(
          savedPostingTime.slice(
            0,
            5
          )
        );

        const savedStartDate =
  automation.start_date ??
  automation.startDate;

if (savedStartDate) {
  setStartDate(
    String(savedStartDate).slice(
      0,
      10
    )
  );
}

        if (
          Array.isArray(
            automation.platforms
          )
        ) {
          setSelectedPlatforms(
            automation.platforms
          );
        }

        const savedFacebookPageId =
          automation.facebook_page_id ??
          automation.facebookPageId ??
          automation.page_id ??
          automation.pageId ??
          "";

        setSelectedFacebookPageId(
          String(savedFacebookPageId)
        );

        const savedPinterestBoardId =
          automation.board_id ??
          automation.pinterestBoardId ??
          automation.pinterest_board_id ??
          "";

        setSelectedPinterestBoardId(
          String(savedPinterestBoardId)
        );

        setTikTokPrivacyLevel(
          String(
            automation.tiktok_privacy_level ??
              automation.tiktokPrivacyLevel ??
              ""
          )
        );

        setTikTokDisableComment(
          Boolean(
            automation.tiktok_disable_comment ??
              automation.tiktokDisableComment ??
              false
          )
        );

        setTikTokAutoAddMusic(
          automation.tiktok_auto_add_music ??
            automation.tiktokAutoAddMusic ??
            true
        );

        setTikTokBrandOrganicToggle(
          automation.tiktok_brand_organic_toggle ??
            automation.tiktokBrandOrganicToggle ??
            true
        );

        setTikTokBrandContentToggle(
          Boolean(
            automation.tiktok_brand_content_toggle ??
              automation.tiktokBrandContentToggle ??
              false
          )
        );

        setTikTokConsent(
          Boolean(
            automation.tiktok_consent ??
              automation.tiktokConsent ??
              false
          )
        );

        const savedSelectionMode =
          String(
            automation.selection_mode ||
              automation.selectionMode ||
              "least_recently_posted"
          );

        const savedFavoritesSource =
          savedSelectionMode.startsWith(
            "favorites_"
          );

        const savedBaseSelectionMode =
          savedFavoritesSource
            ? savedSelectionMode.slice(
                "favorites_".length
              )
            : savedSelectionMode;

        setAutomationSource(
          savedFavoritesSource
            ? "favorites"
            : "all_products"
        );

        if (
          savedBaseSelectionMode ===
            "never_posted_first" ||
          savedBaseSelectionMode ===
            "least_recently_posted" ||
          savedBaseSelectionMode ===
            "random"
        ) {
          setSelectionMode(
            savedBaseSelectionMode
          );
        }

        const savedRepeatDelay =
          automation.repeat_delay_days ??
          automation.repeatDelayDays;

        if (
          savedRepeatDelay !==
            undefined &&
          savedRepeatDelay !== null
        ) {
          setRepeatDelayDays(
            String(
              savedRepeatDelay
            )
          );
        }

        const savedPostingInterval =
  automation.posting_interval_days ??
  automation.postingIntervalDays;

if (
  savedPostingInterval !== undefined &&
  savedPostingInterval !== null
) {
  setPostingIntervalDays(
    String(savedPostingInterval)
  );
}

      } catch (error: any) {
        console.log(
          "Store automation load failed:",
          error
        );

        if (screenIsActive) {
          Alert.alert(
            "Load Failed",
            error?.message ||
              "ArtBoost could not load the saved automation."
          );
        }
      } finally {
        if (screenIsActive) {
          setLoadingAutomation(
            false
          );
        }
      }
    }

    loadAutomation();

    return () => {
      screenIsActive = false;
    };
  }, [requestedAutomationId, storeId]);


  useEffect(() => {
    let screenIsActive = true;

    async function loadFacebookPages() {
      if (
        !selectedPlatforms.includes(
          "facebook"
        )
      ) {
        if (screenIsActive) {
          setFacebookPages([]);
          setFacebookPagesError("");
        }

        return;
      }

      try {
        setLoadingFacebookPages(true);
        setFacebookPagesError("");

        const response = await fetch(
          `${API_BASE}/facebook/pages`
        );

        const responseText =
          await response.text();

        let data: any;

        try {
          data = JSON.parse(
            responseText
          );
        } catch {
          throw new Error(
            `Backend returned ${response.status}: ${responseText.slice(
              0,
              150
            )}`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to load Facebook Pages."
          );
        }

        const pages: FacebookPage[] =
          Array.isArray(data.data)
            ? data.data
                .filter(
                  (page: any) =>
                    page?.id &&
                    page?.name
                )
                .map(
                  (page: any) => ({
                    id: String(
                      page.id
                    ),
                    name: String(
                      page.name
                    ),
                  })
                )
            : [];

        if (!screenIsActive) {
          return;
        }

        setFacebookPages(pages);

        setSelectedFacebookPageId(
          (current) => {
            if (
              current &&
              pages.some(
                (page) =>
                  page.id === current
              )
            ) {
              return current;
            }

            if (pages.length === 1) {
              return pages[0].id;
            }

            return "";
          }
        );
      } catch (error: any) {
        console.log(
          "Facebook Pages load failed:",
          error
        );

        if (screenIsActive) {
          setFacebookPages([]);
          setFacebookPagesError(
            error?.message ||
              "ArtBoost could not load your Facebook Pages."
          );
        }
      } finally {
        if (screenIsActive) {
          setLoadingFacebookPages(
            false
          );
        }
      }
    }

    loadFacebookPages();

    return () => {
      screenIsActive = false;
    };
  }, [selectedPlatforms]);

  useEffect(() => {
    let screenIsActive = true;

    async function loadPinterestBoards() {
      if (
        !selectedPlatforms.includes(
          "pinterest"
        )
      ) {
        if (screenIsActive) {
          setPinterestBoards([]);
          setPinterestBoardsError("");
        }

        return;
      }

      try {
        setLoadingPinterestBoards(true);
        setPinterestBoardsError("");

        const response = await fetch(
          `${API_BASE}/pinterest/boards`
        );

        const responseText =
          await response.text();

        let data: any;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Backend returned ${response.status}: ${responseText.slice(
              0,
              150
            )}`
          );
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.details ||
              "Unable to load Pinterest boards."
          );
        }

        const rawBoards =
          Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.data)
              ? data.data
              : [];

        const boards: PinterestBoard[] =
          rawBoards
            .filter(
              (board: any) =>
                board?.id &&
                board?.name
            )
            .map(
              (board: any) => ({
                id: String(board.id),
                name: String(board.name),
              })
            );

        if (!screenIsActive) {
          return;
        }

        setPinterestBoards(boards);

        setSelectedPinterestBoardId(
          (current) => {
            if (
              current &&
              boards.some(
                (board) =>
                  board.id === current
              )
            ) {
              return current;
            }

            return "";
          }
        );
      } catch (error: any) {
        console.log(
          "Pinterest boards load failed:",
          error
        );

        if (screenIsActive) {
          setPinterestBoards([]);
          setPinterestBoardsError(
            error?.message ||
              "ArtBoost could not load your Pinterest boards."
          );
        }
      } finally {
        if (screenIsActive) {
          setLoadingPinterestBoards(false);
        }
      }
    }

    loadPinterestBoards();

    return () => {
      screenIsActive = false;
    };
  }, [selectedPlatforms]);

  const effectiveSelectionMode =
    automationSource === "favorites"
      ? `favorites_${selectionMode}`
      : selectionMode;

    async function loadProductPreview() {
    if (!storeId) {
      return;
    }

    try {
      setLoadingPreview(true);
      setPreviewError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          userError.message
        );
      }

      if (!user) {
        throw new Error(
          "You must be signed in to preview a product."
        );
      }

      const parsedRepeatDelay =
        Number(repeatDelayDays);

      const response = await fetch(
        `${API_BASE}/automations/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            storeId,
            storeType,
            storeName,
            selectionMode:
              effectiveSelectionMode,
            repeatDelayDays:
            parsedRepeatDelay,
            postingIntervalDays:
        Number(postingIntervalDays) || 1,
        }),
        }
      );

      const responseText =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(
          responseText
        );
      } catch {
        throw new Error(
          `Backend returned ${response.status}: ${responseText.slice(
            0,
            150
          )}`
        );
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            "Unable to load the next product."
        );
      }

      setPreviewProduct(
        data.product || null
      );
    } catch (error: any) {
      console.log(
        "Product preview failed:",
        error
      );

      setPreviewProduct(null);

      setPreviewError(
        error?.message ||
          "ArtBoost could not preview the next product."
      );
    } finally {
      setLoadingPreview(false);
    }
  }

    const previewProductTitle =
    previewProduct?.title ||
    previewProduct?.name ||
    previewProduct?.product_title ||
    "Untitled Product";

  const previewProductPrice =
    previewProduct?.price ??
    previewProduct?.product_price ??
    previewProduct?.variants?.[0]
      ?.price ??
    null;

  const previewProductImage =
    previewProduct?.image_url ||
    previewProduct?.imageUrl ||
    previewProduct?.featured_image ||
    previewProduct?.image ||
    previewProduct?.images?.[0]?.src ||
    previewProduct?.images?.[0] ||
    null;

  const previewPostingStatus =
    previewProduct?.last_posted_at
      ? `Last posted ${new Date(
          previewProduct.last_posted_at
        ).toLocaleDateString()}`
      : "Never posted";

  const nextRunText = useMemo(() => {
    if (!enabled) {
      return "Enable automation to calculate the next run.";
    }

    const frequencyLabel =
  frequency === "daily"
    ? "Tomorrow"
    : frequency === "weekdays"
    ? "Next weekday"
    : frequency === "weekly"
    ? "Next week"
    : "Scheduled";

    return `${frequencyLabel} at ${displayTime(
      postingTime
    )}`;
  }, [
    enabled,
    frequency,
    postingTime,
  ]);

  const loadTikTokCreatorInfo = useCallback(async () => {
    try {
      setLoadingTikTokCreator(true);
      setTikTokCreatorError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message);
      }

      if (!user) {
        throw new Error(
          "You must be signed in to load TikTok settings."
        );
      }

      const response = await fetch(
        `${API_BASE}/tiktok/creator-info?userId=${encodeURIComponent(
          user.id
        )}`
      );

      const responseText =
        await response.text();

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Backend returned ${response.status}: ${responseText.slice(
            0,
            160
          )}`
        );
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            data?.details ||
            "Unable to load TikTok posting settings."
        );
      }

      const creator =
        data.creator || null;

      setTikTokCreator(creator);

      if (
        creator?.comment_disabled
      ) {
        setTikTokDisableComment(true);
      }

      const allowedPrivacy =
        Array.isArray(
          creator?.privacy_level_options
        )
          ? creator.privacy_level_options
          : [];

      if (
        tiktokPrivacyLevel &&
        !allowedPrivacy.includes(
          tiktokPrivacyLevel
        )
      ) {
        setTikTokPrivacyLevel("");
        setTikTokConsent(false);
      }
    } catch (error: any) {
      console.log(
        "TikTok creator info failed:",
        error
      );

      setTikTokCreator(null);
      setTikTokCreatorError(
        error?.message ||
          "Unable to load TikTok posting settings."
      );
    } finally {
      setLoadingTikTokCreator(false);
    }
  }, [
    tiktokPrivacyLevel,
  ]);

  function getTikTokPrivacyLabel(
    value: string
  ) {
    if (
      value === "PUBLIC_TO_EVERYONE"
    ) {
      return "Everyone";
    }

    if (
      value === "MUTUAL_FOLLOW_FRIENDS"
    ) {
      return "Friends";
    }

    if (
      value === "FOLLOWER_OF_CREATOR"
    ) {
      return "Followers";
    }

    if (
      value === "SELF_ONLY"
    ) {
      return "Only me";
    }

    return value;
  }

  useEffect(() => {
    if (
      selectedPlatforms.includes(
        "tiktok"
      )
    ) {
      loadTikTokCreatorInfo();
    } else {
      setTikTokCreatorError("");
    }
  }, [loadTikTokCreatorInfo, selectedPlatforms]);

  function togglePlatform(
    platform: PlatformOption
  ) {
    if (!platform.available) {
      Alert.alert(
        "Coming Soon",
        `${platform.label} automation will be added in a future update.`
      );

      return;
    }

    setSelectedPlatforms(
      (current) => {
        if (
          current.includes(
            platform.id
          )
        ) {
          return current.filter(
            (item) =>
              item !== platform.id
          );
        }

        return [
          ...current,
          platform.id,
        ];
      }
    );
  }

  function decreaseRepeatDelay() {
    const currentValue = Math.max(
      Number(repeatDelayDays) || 0,
      0
    );

    setRepeatDelayDays(
      String(
        Math.max(
          currentValue - 1,
          0
        )
      )
    );
  }

  function increaseRepeatDelay() {
    const currentValue = Math.max(
      Number(repeatDelayDays) || 0,
      0
    );

    setRepeatDelayDays(
      String(currentValue + 1)
    );
  }

  async function postNow() {
  if (!storeId) {
    Alert.alert(
      "Missing Store",
      "This screen was opened without a store connection ID."
    );
    return;
  }

  if (selectedPlatforms.length === 0) {
    Alert.alert(
      "Select Platforms",
      "Choose at least one social platform before posting."
    );
    return;
  }

  if (
    selectedPlatforms.includes("facebook") &&
    !selectedFacebookPageId
  ) {
    Alert.alert(
      "Select Facebook Page",
      "Choose which Facebook Page ArtBoost should post to."
    );
    return;
  }

  if (
    selectedPlatforms.includes("pinterest") &&
    !selectedPinterestBoardId
  ) {
    Alert.alert(
      "Select Pinterest Board",
      "Choose which Pinterest board should receive posts from this store."
    );
    return;
  }

  if (
    selectedPlatforms.includes("tiktok") &&
    !tiktokCreator
  ) {
    Alert.alert(
      "TikTok Settings Required",
      "Load the connected TikTok creator settings before posting."
    );
    return;
  }

  if (
    selectedPlatforms.includes("tiktok") &&
    !tiktokPrivacyLevel
  ) {
    Alert.alert(
      "Choose TikTok Privacy",
      "Select who can view TikTok posts from this automation."
    );
    return;
  }

  if (
    selectedPlatforms.includes("tiktok") &&
    !tiktokConsent
  ) {
    Alert.alert(
      "TikTok Confirmation Required",
      "Review and confirm the TikTok posting settings before continuing."
    );
    return;
  }

  if (!validateTime(postingTime)) {
    Alert.alert(
      "Invalid Posting Time",
      "Select a valid posting time."
    );
    return;
  }

  const parsedRepeatDelay =
    Number(repeatDelayDays);

  if (
    Number.isNaN(parsedRepeatDelay) ||
    parsedRepeatDelay < 0
  ) {
    Alert.alert(
      "Invalid Repeat Delay",
      "Repeat delay must be 0 or more days."
    );
    return;
  }

  const parsedPostingInterval =
    Number(postingIntervalDays);

  if (
    frequency === "every_x_days" &&
    (
      Number.isNaN(parsedPostingInterval) ||
      parsedPostingInterval < 1
    )
  ) {
    Alert.alert(
      "Invalid Posting Interval",
      "The posting interval must be at least 1 day."
    );
    return;
  }

  try {
    setPostingNow(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(
        userError.message
      );
    }

    if (!user) {
      throw new Error(
        "You must be signed in."
      );
    }

    /*
     * Save the current on-screen settings first.
     * This ensures Post Now uses the platforms,
     * Facebook Page, and product-selection settings
     * the user currently sees.
     */
    const saveResponse =
      await fetch(
        `${API_BASE}/automations`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            storeId,
            storeName,
            storeType,

            automationName:
              frequency === "one_time"
                ? "One-Time Store Promotion"
                : frequency ===
                    "every_x_days"
                  ? `Store Promotion Every ${
                      parsedPostingInterval || 1
                    } Days`
                  : "Store Product Rotation",

            enabled,
            frequency,

            postingTime:
              `${postingTime}:00`,

            startDate,
            timezone,

            platforms:
              selectedPlatforms,

            facebookPageId:
              selectedFacebookPageId ||
              null,

            pinterestBoardId:
              selectedPinterestBoardId ||
              null,

            tiktokPrivacyLevel:
              selectedPlatforms.includes("tiktok")
                ? tiktokPrivacyLevel
                : null,

            tiktokDisableComment:
              selectedPlatforms.includes("tiktok")
                ? tiktokDisableComment
                : false,

            tiktokAutoAddMusic:
              selectedPlatforms.includes("tiktok")
                ? tiktokAutoAddMusic
                : true,

            tiktokBrandOrganicToggle:
              selectedPlatforms.includes("tiktok")
                ? tiktokBrandOrganicToggle
                : true,

            tiktokBrandContentToggle:
              selectedPlatforms.includes("tiktok")
                ? tiktokBrandContentToggle
                : false,

            tiktokConsent:
              selectedPlatforms.includes("tiktok")
                ? tiktokConsent
                : false,

            selectionMode,

            repeatDelayDays:
              parsedRepeatDelay,

            postingIntervalDays:
              frequency ===
              "every_x_days"
                ? parsedPostingInterval
                : 1,
          }),
        }
      );

    const saveResponseText =
      await saveResponse.text();

    let saveData: any;

    try {
      saveData =
        JSON.parse(
          saveResponseText
        );
    } catch {
      throw new Error(
        `Backend returned ${saveResponse.status}: ${saveResponseText.slice(
          0,
          160
        )}`
      );
    }

    if (
      !saveResponse.ok ||
      !saveData.success
    ) {
      throw new Error(
        saveData.details ||
          saveData.error ||
          "ArtBoost could not save the current automation settings."
      );
    }

    const savedAutomationId =
      String(
        saveData.automation?.id ||
          automationId ||
          ""
      );

    if (!savedAutomationId) {
      throw new Error(
        "The saved automation did not return a valid ID."
      );
    }

    setAutomationId(
      savedAutomationId
    );

    /*
     * Run the newly saved automation.
     */
    const runResponse =
      await fetch(
        `${API_BASE}/automations/${encodeURIComponent(
          savedAutomationId
        )}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
          }),
        }
      );

    const runResponseText =
      await runResponse.text();

    let runData: any;

    try {
      runData =
        JSON.parse(
          runResponseText
        );
    } catch {
      throw new Error(
        `Backend returned ${runResponse.status}: ${runResponseText.slice(
          0,
          160
        )}`
      );
    }

    const platformResults =
      Array.isArray(
        runData?.publishResult
          ?.results
      )
        ? runData.publishResult.results
        : [];

    const successfulResults =
      platformResults.filter(
        (result: any) =>
          result?.success
      );

    const failedResults =
      platformResults.filter(
        (result: any) =>
          !result?.success
      );

    const publishedPlatforms =
      successfulResults.map(
        (result: any) =>
          formatPlatformLabel(
            result?.platform
          )
      );

    const failedPlatforms =
      failedResults.map(
        (result: any) => ({
          platform:
            formatPlatformLabel(
              result?.platform
            ),
          error:
            String(
              result?.error ||
                "Publishing failed."
            ),
        })
      );

    /*
     * A multi-platform run can return success=false when only one
     * platform fails. Do not turn that into a total-failure popup
     * when other platforms actually published.
     */
    if (
      successfulResults.length > 0 &&
      failedResults.length > 0
    ) {
      const successLine =
        `Posted successfully to: ${publishedPlatforms.join(
          ", "
        )}.`;

      const failureLines =
        failedPlatforms
          .map(
            (item: any) =>
              `${item.platform}: ${item.error}`
          )
          .join("\n");

      Alert.alert(
        "Partial Success",
        `${successLine}\n\nNeeds attention:\n${failureLines}`
      );

      await loadProductPreview();
      return;
    }

    if (
      successfulResults.length > 0 &&
      failedResults.length === 0
    ) {
      const successMessage =
        publishedPlatforms.length > 0
          ? `Your product was posted successfully to ${publishedPlatforms.join(
              ", "
            )}.`
          : "Your product has been posted successfully.";

      Alert.alert(
        "All Successful",
        successMessage
      );

      await loadProductPreview();
      return;
    }

    /*
     * If the backend returned no per-platform results, preserve the
     * transport/backend error. If every platform failed, show the
     * platform-specific failures instead of a generic message.
     */
    const platformErrors =
      failedPlatforms
        .map(
          (item: any) =>
            `${item.platform}: ${item.error}`
        )
        .join("\n");

    if (
      !runResponse.ok ||
      !runData.success ||
      failedResults.length > 0
    ) {
      throw new Error(
        platformErrors ||
          runData.details ||
          runData.error ||
          "Unable to run automation."
      );
    }

    Alert.alert(
      "All Successful",
      "Your product has been posted successfully."
    );

    await loadProductPreview();
  } catch (error: any) {
    console.log(
      "Manual automation failed:",
      error
    );

    Alert.alert(
      "Post Failed",
      error?.message ||
        "Unable to post this product."
    );
  } finally {
    setPostingNow(false);
  }
}

async function toggleAutomationStatus() {
  if (!automationId) {
    return;
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(
        userError.message
      );
    }

    if (!user) {
      throw new Error(
        "You must be signed in."
      );
    }

    const endpoint = enabled
      ? "disable"
      : "resume";

    const method = enabled
      ? "PATCH"
      : "POST";

    const response = await fetch(
      `${API_BASE}/automations/${automationId}/${endpoint}`,
      {
        method,
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      }
    );

    const responseText =
  await response.text();

let data: any;

try {
  data = JSON.parse(
    responseText
  );
} catch {
  throw new Error(
    `Backend returned ${response.status}: ${responseText.slice(
      0,
      150
    )}`
  );
}

if (
  !response.ok ||
  !data.success
) {
  throw new Error(
    data.details ||
      data.error ||
      "Unable to update automation."
  );
}

const newEnabledStatus =
  Boolean(
    data.automation?.enabled
  );

setEnabled(
  newEnabledStatus
);

Alert.alert(
  "Success",
  newEnabledStatus
    ? "Promotion has been resumed."
    : "Promotion has been paused."
);
  } catch (error: any) {
    Alert.alert(
      "Update Failed",
      error?.message ||
        "Unable to update automation."
    );
  }
}

  async function saveAutomation() {
  if (!storeId) {
    Alert.alert(
      "Missing Store",
      "This screen was opened without a store connection ID."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.length === 0
  ) {
    Alert.alert(
      "Select Platforms",
      "Choose at least one social platform before enabling automation."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.includes(
      "facebook"
    ) &&
    !selectedFacebookPageId
  ) {
    Alert.alert(
      "Select Facebook Page",
      "Choose which Facebook Page ArtBoost should use before saving the automation."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.includes(
      "pinterest"
    ) &&
    !selectedPinterestBoardId
  ) {
    Alert.alert(
      "Select Pinterest Board",
      "Choose which Pinterest board should receive posts from this store before saving the automation."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.includes("tiktok") &&
    !tiktokCreator
  ) {
    Alert.alert(
      "TikTok Settings Required",
      "Load the connected TikTok creator settings before enabling TikTok automation."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.includes("tiktok") &&
    !tiktokPrivacyLevel
  ) {
    Alert.alert(
      "Choose TikTok Privacy",
      "Select who can view TikTok posts from this automation."
    );

    return;
  }

  if (
    enabled &&
    selectedPlatforms.includes("tiktok") &&
    !tiktokConsent
  ) {
    Alert.alert(
      "TikTok Confirmation Required",
      "Review and confirm the TikTok posting settings before enabling this automation."
    );

    return;
  }

  if (!validateTime(postingTime)) {
    Alert.alert(
      "Invalid Posting Time",
      "Enter the posting time in 24-hour format, such as 09:00 or 18:30."
    );

    return;
  }

  const normalizedAdditionalTimes = [
    ...new Set(
      additionalPostingTimes
        .map((value) =>
          String(value).slice(0, 5)
        )
        .filter(Boolean)
    ),
  ]
    .filter(
      (value) =>
        value !== postingTime
    )
    .sort();

  if (
    normalizedAdditionalTimes.some(
      (value) => !validateTime(value)
    )
  ) {
    Alert.alert(
      "Invalid Additional Time",
      "Every additional posting time must be a valid time."
    );

    return;
  }

  if (
    normalizedAdditionalTimes.length > 0 &&
    frequency !== "daily"
  ) {
    Alert.alert(
      "Daily Frequency Required",
      "Multiple posting times are available with Every Day frequency."
    );

    return;
  }

  const allPostingTimes = [
    postingTime,
    ...normalizedAdditionalTimes,
  ].sort();

  const parsedPostingInterval =
  Number(postingIntervalDays);

if (
  frequency === "every_x_days" &&
  (
    Number.isNaN(parsedPostingInterval) ||
    parsedPostingInterval < 1
  )
) {
  Alert.alert(
    "Invalid Posting Interval",
    "The posting interval must be at least 1 day."
  );

  return;
}

  const parsedRepeatDelay =
    Number(repeatDelayDays);

  if (
    Number.isNaN(parsedRepeatDelay) ||
    parsedRepeatDelay < 0
  ) {
    Alert.alert(
      "Invalid Repeat Delay",
      "Repeat delay must be zero or more days."
    );

    return;
  }

  try {
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(userError.message);
    }

    if (!user) {
      throw new Error(
        "You must be signed in to save an automation."
      );
    }

    const useMultiDailyEndpoint =
      frequency === "daily" &&
      allPostingTimes.length > 1;

    const automationPayload = {
      userId: user.id,
      storeId,
      storeName,
      storeType,
      automationName:
        frequency === "one_time"
          ? "One-Time Store Promotion"
          : frequency === "every_x_days"
            ? `Store Promotion Every ${parsedPostingInterval} Days`
            : automationSource ===
                "favorites"
              ? "Favorite Product Rotation"
              : "Store Product Rotation",
      enabled,
      frequency,
      postingTime: `${postingTime}:00`,
      postingTimes: allPostingTimes,
      startDate,
      timezone,
      platforms: selectedPlatforms,
      facebookPageId:
        selectedFacebookPageId ||
        null,
      pinterestBoardId:
        selectedPinterestBoardId ||
        null,
      tiktokPrivacyLevel:
        selectedPlatforms.includes("tiktok")
          ? tiktokPrivacyLevel
          : null,
      tiktokDisableComment:
        selectedPlatforms.includes("tiktok")
          ? tiktokDisableComment
          : false,
      tiktokAutoAddMusic:
        selectedPlatforms.includes("tiktok")
          ? tiktokAutoAddMusic
          : true,
      tiktokBrandOrganicToggle:
        selectedPlatforms.includes("tiktok")
          ? tiktokBrandOrganicToggle
          : true,
      tiktokBrandContentToggle:
        selectedPlatforms.includes("tiktok")
          ? tiktokBrandContentToggle
          : false,
      tiktokConsent:
        selectedPlatforms.includes("tiktok")
          ? tiktokConsent
          : false,
      selectionMode:
        effectiveSelectionMode,
      repeatDelayDays:
        parsedRepeatDelay,
      postingIntervalDays:
        frequency === "every_x_days"
          ? parsedPostingInterval
          : 1,
      replaceAutomationId:
        useMultiDailyEndpoint &&
        automationId
          ? automationId
          : null,
    };

    const response = await fetch(
      useMultiDailyEndpoint
        ? `${API_BASE}/automations/multi-daily`
        : `${API_BASE}/automations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          automationPayload
        ),
      }
    );

    const responseText = await response.text();

let data: any;

try {
  data = JSON.parse(responseText);
} catch {
  throw new Error(
    `Backend returned ${response.status}: ${responseText.slice(0, 150)}`
  );
}

    if (!response.ok || !data.success) {
      throw new Error(
        data.details ||
          data.error ||
          "ArtBoost could not save the automation."
      );
    }

    Alert.alert(
      "Automation Saved",
      enabled
        ? `${
            automationSource === "favorites"
              ? "Favorites"
              : platformLabel
          } automation saved${
            allPostingTimes.length > 1
              ? ` with ${allPostingTimes.length} daily posting times`
              : ""
          }.`
        : `${platformLabel} automation was saved in the off position.`,
      [
        {
          text: "OK",
          onPress: () =>
            router.replace({
              pathname:
                "/store-dashboard" as any,
              params: {
                storeId,
                storeName,
                storeType,
                productCount:
                  String(productCount),
                connected: "true",
              },
            }),
        },
      ]
    );
  } catch (error: any) {
    console.log(
      "Store automation save failed:",
      error
    );

    Alert.alert(
      "Save Failed",
      error?.message ||
        "ArtBoost could not save the store automation."
    );
  } finally {
    setSaving(false);
  }
}

  return (
    <SafeAreaView
      style={styles.screen}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View style={styles.header}>
          <Pressable
  style={styles.backButton}
  onPress={() => {
    /*
     * Use a deterministic destination instead of depending on
     * router history. This keeps the Automation back button
     * working even when the screen was opened via replace(),
     * deep link, or a tab transition.
     */
    router.replace({
      pathname:
        "/store-dashboard" as any,
      params: {
        storeId,
        storeName,
        storeType,
        productCount:
          String(productCount),
        connected: "true",
      },
    });
  }}
>
            <Ionicons
              name="arrow-back"
              size={24}
              color="#ffffff"
            />
          </Pressable>

          <View
            style={
              styles.headerTextWrap
            }
          >
            <Text
              style={styles.eyebrow}
            >
              STORE MARKETING
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              Automation
            </Text>
          </View>

          <View
            style={
              styles.headerIcon
            }
          >
            <Ionicons
              name="flash"
              size={22}
              color="#c4b5fd"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View
            style={styles.storeCard}
          >
            <View
              style={
                styles.storeIconWrap
              }
            >
              <ArtBoostBrandIcon
                name={platformLabel}
                size={50}
              />
            </View>

            <View
              style={
                styles.storeInfo
              }
            >
              <Text
                style={
                  styles.platformText
                }
              >
                {platformLabel}
              </Text>

              <Text
                style={
                  styles.storeNameText
                }
                numberOfLines={2}
              >
                {displayStoreName}
              </Text>

              <Text
                style={
                  styles.productCountText
                }
              >
                {productCount}{" "}
                {productCount === 1
                  ? "product"
                  : "products"}{" "}
                available
              </Text>
            </View>
          </View>

          <View
            style={styles.sectionCard}
          >
            <View
              style={
                styles.sectionHeaderRow
              }
            >
              <View
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="flash-outline"
                  size={22}
                  color="#a78bfa"
                />
              </View>

              <View
                style={
                  styles.sectionHeading
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Store Automation
                </Text>

                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Promote a different
                  product automatically.
                </Text>
              </View>

              <Switch
  value={enabled}
  onValueChange={(value) => {
    if (automationId) {
      Alert.alert(
        "Use Pause or Resume",
        "Use the Pause Promotion or Resume Promotion button below to change an existing promotion."
      );

      return;
    }

    setEnabled(value);
  }}
  trackColor={{
    false: "#353535",
    true: "#6547b5",
  }}
  thumbColor={
    enabled
      ? "#ffffff"
      : "#b1b1b1"
  }
/>
            </View>

            <View
              style={
                styles.statusBanner
              }
            >
              <View
                style={[
                  styles.statusDot,
                  enabled
                    ? styles.statusDotActive
                    : styles.statusDotInactive,
                ]}
              />

              <Text
                style={[
                  styles.statusBannerText,
                  enabled
                    ? styles.statusBannerTextActive
                    : styles.statusBannerTextInactive,
                ]}
              >
                {enabled
                  ? "Automation is enabled"
                  : "Automation is currently off"}
              </Text>
            </View>
          </View>

          <View
            style={styles.sectionCard}
          >
            <Text
              style={styles.sectionTitle}
            >
              Posting Schedule
            </Text>

            <Text
              style={
                styles.sectionDescription
              }
            >
              Choose how often and when
              ArtBoost should create a
              product promotion.
            </Text>

            <Text
              style={styles.fieldLabel}
            >
              Frequency
            </Text>

            <View
              style={
                styles.optionStack
              }
            >
              {FREQUENCY_OPTIONS.map(
                (option) => {
                  const selected =
                    frequency ===
                    option.id;

                  return (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.radioCard,
                        selected &&
                          styles.radioCardSelected,
                      ]}
                      onPress={() =>
                        setFrequency(
                          option.id
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

                      <View
                        style={
                          styles.radioTextWrap
                        }
                      >
                        <Text
                          style={[
                            styles.radioTitle,
                            selected &&
                              styles.radioTitleSelected,
                          ]}
                        >
                          {option.label}
                        </Text>

                        <Text
                          style={
                            styles.radioDescription
                          }
                        >
                          {
                            option.description
                          }
                        </Text>
                      </View>
                    </Pressable>
                  );
                }
              )}
            </View>

            <Text style={styles.fieldLabel}>
  Start Date
</Text>

<Pressable
  style={styles.inputRow}
  onPress={() => setShowDatePicker(true)}
>
  <View style={styles.inputIcon}>
    <Ionicons
      name="calendar-outline"
      size={21}
      color="#a78bfa"
    />
  </View>

  <Text style={styles.pickerValue}>
    {formatDateForDisplay(startDate)}
  </Text>

  <Ionicons
    name="chevron-down"
    size={18}
    color="#9b94b7"
  />
</Pressable>

{showDatePicker ? (
  <DateTimePicker
    value={startDateToDate(startDate)}
    mode="date"
    display={
      Platform.OS === "ios"
        ? "spinner"
        : "default"
    }
    minimumDate={new Date()}
    onChange={(event, selectedDate) => {
      setShowDatePicker(false);

      if (
        event.type === "dismissed" ||
        !selectedDate
      ) {
        return;
      }

      setStartDate(
        formatDateForStorage(
          selectedDate
        )
      );
    }}
  />
) : null}

<Text style={styles.fieldLabel}>
  Posting Time
</Text>

<Pressable
  style={styles.inputRow}
  onPress={() => setShowTimePicker(true)}
>
  <View style={styles.inputIcon}>
    <Ionicons
      name="time-outline"
      size={21}
      color="#a78bfa"
    />
  </View>

  <Text style={styles.pickerValue}>
    {displayTime(postingTime)}
  </Text>

  <Ionicons
    name="chevron-down"
    size={18}
    color="#9b94b7"
  />
</Pressable>

{showTimePicker ? (
  <DateTimePicker
    value={postingTimeToDate(
      postingTime
    )}
    mode="time"
    display={
      Platform.OS === "ios"
        ? "spinner"
        : "default"
    }
    is24Hour={false}
    onChange={(event, selectedTime) => {
      setShowTimePicker(false);

      if (
        event.type === "dismissed" ||
        !selectedTime
      ) {
        return;
      }

      const hour = String(
        selectedTime.getHours()
      ).padStart(2, "0");

      const minute = String(
        selectedTime.getMinutes()
      ).padStart(2, "0");

      setPostingTime(
        `${hour}:${minute}`
      );
    }}
  />
) : null}

<Text style={styles.fieldHelp}>
  Select the first posting date and an AM/PM posting time.
</Text>

{frequency === "daily" ? (
  <>
    <Text style={styles.fieldLabel}>
      Additional Daily Times
    </Text>

    <View style={styles.multiTimeWrap}>
      {additionalPostingTimes.map(
        (time) => (
          <View
            key={time}
            style={styles.timeChip}
          >
            <Text style={styles.timeChipText}>
              {displayTime(time)}
            </Text>
            <Pressable
              onPress={() =>
                setAdditionalPostingTimes(
                  (current) =>
                    current.filter(
                      (item) =>
                        item !== time
                    )
                )
              }
            >
              <Ionicons
                name="close-circle"
                size={18}
                color="#c4b5fd"
              />
            </Pressable>
          </View>
        )
      )}

      <Pressable
        style={styles.addTimeButton}
        onPress={() =>
          setShowAdditionalTimePicker(
            true
          )
        }
      >
        <Ionicons
          name="add"
          size={18}
          color="#ffffff"
        />
        <Text
          style={styles.addTimeButtonText}
        >
          Add Time
        </Text>
      </Pressable>
    </View>

    {showAdditionalTimePicker ? (
      <DateTimePicker
        value={postingTimeToDate(
          postingTime
        )}
        mode="time"
        display={
          Platform.OS === "ios"
            ? "spinner"
            : "default"
        }
        is24Hour={false}
        onChange={(
          event,
          selectedTime
        ) => {
          setShowAdditionalTimePicker(
            false
          );

          if (
            event.type ===
              "dismissed" ||
            !selectedTime
          ) {
            return;
          }

          const hour = String(
            selectedTime.getHours()
          ).padStart(2, "0");
          const minute = String(
            selectedTime.getMinutes()
          ).padStart(2, "0");
          const nextTime =
            `${hour}:${minute}`;

          if (
            nextTime === postingTime
          ) {
            return;
          }

          setAdditionalPostingTimes(
            (current) =>
              [
                ...new Set([
                  ...current,
                  nextTime,
                ]),
              ].sort()
          );
        }}
      />
    ) : null}

    <Text style={styles.fieldHelp}>
      Add up to 7 more times. ArtBoost
      creates a separate scheduler slot for
      each time while preserving the same
      product-selection and repeat-delay
      rules.
    </Text>
  </>
) : null}

{frequency === "every_x_days" ? (
  <>
    <Text style={styles.fieldLabel}>
      Post Every
    </Text>

    <View style={styles.counterRow}>
      <Pressable
        style={styles.counterButton}
        onPress={() => {
          const currentValue =
            Math.max(
              Number(
                postingIntervalDays
              ) || 1,
              1
            );

          setPostingIntervalDays(
            String(
              Math.max(
                currentValue - 1,
                1
              )
            )
          );
        }}
      >
        <Ionicons
          name="remove"
          size={23}
          color="#ffffff"
        />
      </Pressable>

      <View
        style={
          styles.counterInputWrap
        }
      >
        <TextInput
          value={
            postingIntervalDays
          }
          onChangeText={(value) =>
            setPostingIntervalDays(
              value.replace(
                /\D/g,
                ""
              )
            )
          }
          keyboardType="number-pad"
          maxLength={3}
          style={
            styles.counterInput
          }
        />

        <Text
          style={
            styles.counterSuffix
          }
        >
          days
        </Text>
      </View>

      <Pressable
        style={styles.counterButton}
        onPress={() => {
          const currentValue =
            Math.max(
              Number(
                postingIntervalDays
              ) || 1,
              1
            );

          setPostingIntervalDays(
            String(
              currentValue + 1
            )
          );
        }}
      >
        <Ionicons
          name="add"
          size={23}
          color="#ffffff"
        />
      </Pressable>
    </View>

    <Text style={styles.fieldHelp}>
      ArtBoost will publish one product at this interval.
    </Text>
  </>
) : null}

            <Text
              style={styles.fieldLabel}
            >
              Timezone
            </Text>

            <View
              style={
                styles.readOnlyRow
              }
            >
              <Ionicons
                name="globe-outline"
                size={21}
                color="#a78bfa"
              />

              <Text
                style={
                  styles.readOnlyText
                }
              >
                {timezone}
              </Text>

              <View
                style={styles.autoPill}
              >
                <Text
                  style={
                    styles.autoPillText
                  }
                >
                  DEFAULT
                </Text>
              </View>
            </View>
          </View>

          <View
            style={styles.sectionCard}
          >
            <Text
              style={styles.sectionTitle}
            >
              Social Platforms
            </Text>

            <Text
              style={
                styles.sectionDescription
              }
            >
              ArtBoost will prepare and
              publish platform-specific
              content for each selected
              account.
            </Text>

            <View
              style={
                styles.platformGrid
              }
            >
              {PLATFORM_OPTIONS.map(
                (platform) => {
                  const selected =
                    selectedPlatforms.includes(
                      platform.id
                    );

                  return (
                    <Pressable
                      key={platform.id}
                      style={[
                        styles.platformCard,
                        selected &&
                          styles.platformCardSelected,
                        !platform.available &&
                          styles.platformCardDisabled,
                      ]}
                      onPress={() =>
                        togglePlatform(
                          platform
                        )
                      }
                    >
                      <View
                        style={[
                          styles.platformIconWrap,
                          selected &&
                            styles.platformIconWrapSelected,
                        ]}
                      >
                        <ArtBoostBrandIcon
                          name={platform.label}
                          size={32}
                        />
                      </View>

                      <Text
                        style={[
                          styles.platformLabel,
                          selected &&
                            styles.platformLabelSelected,
                          !platform.available &&
                            styles.platformLabelDisabled,
                        ]}
                      >
                        {platform.label}
                      </Text>

                      {platform.available ? (
                        <View
                          style={[
                            styles.checkbox,
                            selected &&
                              styles.checkboxSelected,
                          ]}
                        >
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={15}
                              color="#ffffff"
                            />
                          ) : null}
                        </View>
                      ) : (
                        <Text
                          style={
                            styles.soonText
                          }
                        >
                          SOON
                        </Text>
                      )}
                    </Pressable>
                  );
                }
              )}
            </View>
          </View>

          {selectedPlatforms.includes(
            "tiktok"
          ) ? (
            <View
              style={styles.sectionCard}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 12,
                }}
              >
                <View
                  style={{ flex: 1 }}
                >
                  <Text
                    style={styles.sectionTitle}
                  >
                    TikTok Posting Settings
                  </Text>

                  <Text
                    style={
                      styles.sectionDescription
                    }
                  >
                    Review the connected creator,
                    privacy, interaction, music,
                    and commercial-content settings
                    that this automation will use.
                  </Text>
                </View>

                <Pressable
                  onPress={
                    loadTikTokCreatorInfo
                  }
                  disabled={
                    loadingTikTokCreator
                  }
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      "#211a38",
                  }}
                >
                  <Ionicons
                    name="refresh"
                    size={20}
                    color="#ffffff"
                  />
                </Pressable>
              </View>

              {loadingTikTokCreator ? (
                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Loading TikTok settings...
                </Text>
              ) : tiktokCreatorError ? (
                <Text
                  style={{
                    color: "#fca5a5",
                    marginTop: 12,
                    lineHeight: 20,
                  }}
                >
                  {tiktokCreatorError}
                </Text>
              ) : tiktokCreator ? (
                <>
                  <Text
                    style={{
                      color: "#ffffff",
                      fontWeight: "800",
                      fontSize: 16,
                      marginTop: 16,
                    }}
                  >
                    @
                    {tiktokCreator.creator_username ||
                      "TikTok creator"}
                  </Text>

                  {tiktokCreator.creator_nickname ? (
                    <Text
                      style={
                        styles.sectionDescription
                      }
                    >
                      {
                        tiktokCreator.creator_nickname
                      }
                    </Text>
                  ) : null}

                  <Text
                    style={{
                      color: "#ffffff",
                      fontWeight: "700",
                      marginTop: 18,
                      marginBottom: 10,
                    }}
                  >
                    Who can view these posts?
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {(
                      tiktokCreator.privacy_level_options ||
                      []
                    ).map(
                      (
                        privacy: string
                      ) => {
                        const selected =
                          tiktokPrivacyLevel ===
                          privacy;

                        return (
                          <Pressable
                            key={privacy}
                            onPress={() => {
                              setTikTokPrivacyLevel(
                                privacy
                              );
                              setTikTokConsent(
                                false
                              );
                            }}
                            style={{
                              paddingHorizontal: 13,
                              paddingVertical: 10,
                              borderRadius: 999,
                              backgroundColor:
                                selected
                                  ? "#7c3aed"
                                  : "#211a38",
                              borderWidth: 1,
                              borderColor:
                                selected
                                  ? "#9b5cff"
                                  : "#3f3f46",
                            }}
                          >
                            <Text
                              style={{
                                color: "#ffffff",
                                fontWeight: "700",
                              }}
                            >
                              {
                                getTikTokPrivacyLabel(
                                  privacy
                                )
                              }
                            </Text>
                          </Pressable>
                        );
                      }
                    )}
                  </View>

                  <Text
                    style={{
                      color: "#fbbf24",
                      fontSize: 12,
                      lineHeight: 18,
                      marginTop: 10,
                    }}
                  >
                    During TikTok's unaudited
                    testing period, use Only me
                    for Direct Post testing.
                  </Text>

                  {[
                    {
                      title:
                        "Allow comments",
                      description:
                        "Allow comments when the connected TikTok creator permits them.",
                      value:
                        !tiktokDisableComment,
                      disabled: Boolean(
                        tiktokCreator.comment_disabled
                      ),
                      onChange:
                        (value: boolean) => {
                          setTikTokDisableComment(
                            !value
                          );
                          setTikTokConsent(
                            false
                          );
                        },
                    },
                    {
                      title:
                        "Auto-add music",
                      description:
                        "Allow TikTok to add recommended music to photo posts.",
                      value:
                        tiktokAutoAddMusic,
                      disabled: false,
                      onChange:
                        (value: boolean) => {
                          setTikTokAutoAddMusic(
                            value
                          );
                          setTikTokConsent(
                            false
                          );
                        },
                    },
                    {
                      title:
                        "Promoting my own business",
                      description:
                        "Use for posts promoting the creator's own artwork, products, shop, or business.",
                      value:
                        tiktokBrandOrganicToggle,
                      disabled: false,
                      onChange:
                        (value: boolean) => {
                          setTikTokBrandOrganicToggle(
                            value
                          );
                          setTikTokConsent(
                            false
                          );
                        },
                    },
                    {
                      title:
                        "Paid partnership",
                      description:
                        "Enable only when promoting a third-party business as branded content.",
                      value:
                        tiktokBrandContentToggle,
                      disabled: false,
                      onChange:
                        (value: boolean) => {
                          setTikTokBrandContentToggle(
                            value
                          );
                          setTikTokConsent(
                            false
                          );
                        },
                    },
                  ].map((setting) => (
                    <View
                      key={setting.title}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                        gap: 12,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor:
                          "#3b3158",
                      }}
                    >
                      <View
                        style={{ flex: 1 }}
                      >
                        <Text
                          style={{
                            color: "#ffffff",
                            fontWeight: "700",
                          }}
                        >
                          {setting.title}
                        </Text>
                        <Text
                          style={{
                            color: "#ffffff",
                            fontSize: 12,
                            lineHeight: 18,
                            marginTop: 3,
                          }}
                        >
                          {
                            setting.description
                          }
                        </Text>
                      </View>

                      <Switch
                        value={
                          setting.value
                        }
                        disabled={
                          setting.disabled
                        }
                        onValueChange={
                          setting.onChange
                        }
                      />
                    </View>
                  ))}

                  <Pressable
                    onPress={() =>
                      setTikTokConsent(
                        (current) =>
                          !current
                      )
                    }
                    style={{
                      flexDirection: "row",
                      alignItems:
                        "flex-start",
                      gap: 10,
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor:
                        tiktokConsent
                          ? "#9b5cff"
                          : "#3f3f46",
                      backgroundColor:
                        "rgba(21, 17, 38, 0.94)",
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        alignItems: "center",
                        justifyContent:
                          "center",
                        backgroundColor:
                          tiktokConsent
                            ? "#9b5cff"
                            : "transparent",
                        borderWidth: 1,
                        borderColor:
                          tiktokConsent
                            ? "#9b5cff"
                            : "#71717a",
                        marginTop: 1,
                      }}
                    >
                      {tiktokConsent ? (
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color="#ffffff"
                        />
                      ) : null}
                    </View>

                    <Text
                      style={{
                        flex: 1,
                        color: "#ffffff",
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      I reviewed the TikTok
                      creator account, privacy,
                      interaction, music, and
                      commercial-content
                      settings and authorize this
                      automation to use these
                      saved choices for its
                      scheduled posts.
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}

          {selectedPlatforms.includes(
            "facebook"
          ) ? (
            <View
              style={styles.sectionCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Facebook Page
              </Text>

              <Text
                style={
                  styles.sectionDescription
                }
              >
                Choose the Page that should
                receive automated product
                posts.
              </Text>

              {loadingFacebookPages ? (
                <View
                  style={
                    styles.facebookPageState
                  }
                >
                  <Ionicons
                    name="hourglass-outline"
                    size={21}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.facebookPageStateText
                    }
                  >
                    Loading Facebook Pages...
                  </Text>
                </View>
              ) : facebookPagesError ? (
                <View
                  style={
                    styles.facebookPageError
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={21}
                    color="#fca5a5"
                  />

                  <Text
                    style={
                      styles.facebookPageErrorText
                    }
                  >
                    {facebookPagesError}
                  </Text>
                </View>
              ) : facebookPages.length >
                0 ? (
                <View
                  style={
                    styles.optionStack
                  }
                >
                  {facebookPages.map(
                    (page) => {
                      const selected =
                        selectedFacebookPageId ===
                        page.id;

                      return (
                        <Pressable
                          key={page.id}
                          style={[
                            styles.facebookPageCard,
                            selected &&
                              styles.facebookPageCardSelected,
                          ]}
                          onPress={() =>
                            setSelectedFacebookPageId(
                              page.id
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

                          <View
                            style={
                              styles.facebookPageIcon
                            }
                          >
                            <Ionicons
                              name="logo-facebook"
                              size={22}
                              color={
                                selected
                                  ? "#ffffff"
                                  : "#a78bfa"
                              }
                            />
                          </View>

                          <Text
                            style={[
                              styles.facebookPageName,
                              selected &&
                                styles.facebookPageNameSelected,
                            ]}
                            numberOfLines={2}
                          >
                            {page.name}
                          </Text>
                        </Pressable>
                      );
                    }
                  )}
                </View>
              ) : (
                <View
                  style={
                    styles.facebookPageError
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={21}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.facebookPageStateText
                    }
                  >
                    No Facebook Pages were
                    found for the connected
                    account.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {selectedPlatforms.includes(
            "pinterest"
          ) ? (
            <View
              style={styles.sectionCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Pinterest Board
              </Text>

              <Text
                style={
                  styles.sectionDescription
                }
              >
                Choose the board that should
                receive posts from this store.
                This choice is saved separately
                for each store automation.
              </Text>

              {loadingPinterestBoards ? (
                <View
                  style={
                    styles.facebookPageState
                  }
                >
                  <Ionicons
                    name="hourglass-outline"
                    size={21}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.facebookPageStateText
                    }
                  >
                    Loading Pinterest boards...
                  </Text>
                </View>
              ) : pinterestBoardsError ? (
                <View
                  style={
                    styles.facebookPageError
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={21}
                    color="#fca5a5"
                  />

                  <Text
                    style={
                      styles.facebookPageErrorText
                    }
                  >
                    {pinterestBoardsError}
                  </Text>
                </View>
              ) : pinterestBoards.length > 0 ? (
                <View
                  style={styles.optionStack}
                >
                  {pinterestBoards.map(
                    (board) => {
                      const selected =
                        selectedPinterestBoardId ===
                        board.id;

                      return (
                        <Pressable
                          key={board.id}
                          style={[
                            styles.facebookPageCard,
                            selected &&
                              styles.facebookPageCardSelected,
                          ]}
                          onPress={() =>
                            setSelectedPinterestBoardId(
                              board.id
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

                          <View
                            style={
                              styles.facebookPageIcon
                            }
                          >
                            <Ionicons
                              name="logo-pinterest"
                              size={22}
                              color={
                                selected
                                  ? "#ffffff"
                                  : "#a78bfa"
                              }
                            />
                          </View>

                          <Text
                            style={[
                              styles.facebookPageName,
                              selected &&
                                styles.facebookPageNameSelected,
                            ]}
                            numberOfLines={2}
                          >
                            {board.name}
                          </Text>
                        </Pressable>
                      );
                    }
                  )}
                </View>
              ) : (
                <View
                  style={
                    styles.facebookPageError
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={21}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.facebookPageStateText
                    }
                  >
                    No Pinterest boards were found.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          <View
            style={styles.sectionCard}
          >
            <Text
              style={styles.sectionTitle}
            >
              Product Selection
            </Text>

            <Text
              style={
                styles.sectionDescription
              }
            >
              Control how ArtBoost chooses
              the next product from your
              store.
            </Text>

            <Text
              style={styles.fieldLabel}
            >
              Product Source
            </Text>

            <View
              style={styles.optionStack}
            >
              {[
                {
                  id: "all_products",
                  label: "All Store Products",
                  description:
                    "Choose from every eligible product in this connected store.",
                },
                {
                  id: "favorites",
                  label: "Favorites Only",
                  description:
                    "Choose only products you marked as Favorites.",
                },
              ].map((option) => {
                const selected =
                  automationSource ===
                  option.id;

                return (
                  <Pressable
                    key={option.id}
                    style={[
                      styles.radioCard,
                      selected &&
                        styles.radioCardSelected,
                    ]}
                    onPress={() =>
                      setAutomationSource(
                        option.id as
                          AutomationSource
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

                    <View
                      style={
                        styles.radioTextWrap
                      }
                    >
                      <Text
                        style={[
                          styles.radioTitle,
                          selected &&
                            styles.radioTitleSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={
                          styles.radioDescription
                        }
                      >
                        {option.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={styles.fieldLabel}
            >
              Selection Order
            </Text>

            <View
              style={
                styles.optionStack
              }
            >
              {SELECTION_OPTIONS.map(
                (option) => {
                  const selected =
                    selectionMode ===
                    option.id;

                  return (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.radioCard,
                        selected &&
                          styles.radioCardSelected,
                      ]}
                      onPress={() =>
                        setSelectionMode(
                          option.id
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

                      <View
                        style={
                          styles.radioTextWrap
                        }
                      >
                        <Text
                          style={[
                            styles.radioTitle,
                            selected &&
                              styles.radioTitleSelected,
                          ]}
                        >
                          {option.label}
                        </Text>

                        <Text
                          style={
                            styles.radioDescription
                          }
                        >
                          {
                            option.description
                          }
                        </Text>
                      </View>
                    </Pressable>
                  );
                }
              )}
            </View>

            <Text
              style={styles.fieldLabel}
            >
              Repeat Delay
            </Text>

            <View
              style={
                styles.counterRow
              }
            >
              <Pressable
                style={
                  styles.counterButton
                }
                onPress={
                  decreaseRepeatDelay
                }
              >
                <Ionicons
                  name="remove"
                  size={23}
                  color="#ffffff"
                />
              </Pressable>

              <View
                style={
                  styles.counterInputWrap
                }
              >
                <TextInput
                  value={
                    repeatDelayDays
                  }
                  onChangeText={(
                    value
                  ) =>
                    setRepeatDelayDays(
                      value.replace(
                        /\D/g,
                        ""
                      )
                    )
                  }
                  keyboardType="number-pad"
                  maxLength={4}
                  style={
                    styles.counterInput
                  }
                />

                <Text
                  style={
                    styles.counterSuffix
                  }
                >
                  days
                </Text>
              </View>

              <Pressable
                style={
                  styles.counterButton
                }
                onPress={
                  increaseRepeatDelay
                }
              >
                <Ionicons
                  name="add"
                  size={23}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            <Text
              style={styles.fieldHelp}
            >
              A product will not be reused
              until this many days have
              passed.
            </Text>
          </View>

          <View
            style={styles.previewCard}
          >
            <View
              style={
                styles.previewHeader
              }
            >
              <View
                style={
                  styles.previewIconWrap
                }
              >
                <Ionicons
                  name="sparkles"
                  size={23}
                  color="#c4b5fd"
                />
              </View>

              <View
                style={
                  styles.previewHeading
                }
              >
                <Text
                  style={
                    styles.previewTitle
                  }
                >
                  Automation Preview
                </Text>

                <Text
                  style={
                    styles.previewSubtitle
                  }
                >
                  Your next store promotion
                </Text>
              </View>
            </View>

            <View
              style={
                styles.previewDivider
              }
            />

            <View
              style={
                styles.previewRow
              }
            >
              <Text
                style={
                  styles.previewLabel
                }
              >
                Store
              </Text>

              <Text
                style={
                  styles.previewValue
                }
                numberOfLines={1}
              >
                {displayStoreName}
              </Text>
            </View>

                        <View
              style={
                styles.productPreviewBox
              }
            >
              <View
                style={
                  styles.productPreviewHeader
                }
              >
                <Text
                  style={
                    styles.previewLabel
                  }
                >
                  Next Product
                </Text>

                <Pressable
                  onPress={
                    loadProductPreview
                  }
                  disabled={
                    loadingPreview
                  }
                  style={
                    styles.refreshPreviewButton
                  }
                >
                  <Ionicons
                    name="refresh"
                    size={16}
                    color="#c4b5fd"
                  />

                  <Text
                    style={
                      styles.refreshPreviewText
                    }
                  >
                    {loadingPreview
                      ? "Loading"
                      : "Refresh"}
                  </Text>
                </Pressable>
              </View>

              {loadingPreview ? (
                <View
                  style={
                    styles.previewProductState
                  }
                >
                  <Ionicons
                    name="hourglass-outline"
                    size={22}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.previewProductStateText
                    }
                  >
                    Finding the next eligible product...
                  </Text>
                </View>
              ) : previewError ? (
                <View
                  style={
                    styles.previewProductState
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={22}
                    color="#fca5a5"
                  />

                  <Text
                    style={
                      styles.previewErrorText
                    }
                  >
                    {previewError}
                  </Text>
                </View>
                            ) : previewProduct ? (
                <View
                  style={
                    styles.previewProductRow
                  }
                >
                  {previewProductImage ? (
                    <Image
                      source={{
                        uri: previewProductImage,
                      }}
                      style={
                        styles.previewProductImage
                      }
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={
                        styles.previewImagePlaceholder
                      }
                    >
                      <Ionicons
                        name="image-outline"
                        size={26}
                        color="#9b5cff"
                      />
                    </View>
                  )}

                  <View
                    style={
                      styles.previewProductInfo
                    }
                  >
                    <Text
                      style={
                        styles.previewProductTitle
                      }
                      numberOfLines={3}
                    >
                      {previewProductTitle}
                    </Text>

                    {previewProductPrice !==
                    null ? (
                      <Text
                        style={
                          styles.previewProductPrice
                        }
                      >
                        $
                        {Number(
                          previewProductPrice
                        ).toFixed(2)}
                      </Text>
                    ) : null}

                    <View
                      style={
                        styles.previewProductMetaRow
                      }
                    >
                      <Ionicons
                        name={
                          previewProduct?.last_posted_at
                            ? "time-outline"
                            : "sparkles-outline"
                        }
                        size={15}
                        color="#a78bfa"
                      />

                      <Text
                        style={
                          styles.previewProductMeta
                        }
                      >
                        {previewPostingStatus}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={
                    styles.previewProductState
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={22}
                    color="#a78bfa"
                  />

                  <Text
                    style={
                      styles.previewProductStateText
                    }
                  >
                    No eligible product is currently available.
                  </Text>
                </View>
              )}
            </View>

            <View
              style={
                styles.previewRow
              }
            >
              <Text
                style={
                  styles.previewLabel
                }
              >
                Next Run
              </Text>

              <Text
                style={[
                  styles.previewValue,
                  enabled &&
                    styles.previewValueActive,
                ]}
              >
                {nextRunText}
              </Text>
            </View>

            <View
              style={
                styles.previewRow
              }
            >
              <Text
                style={
                  styles.previewLabel
                }
              >
                Platforms
              </Text>

              <Text
                style={
                  styles.previewValue
                }
              >
                {selectedPlatforms.length}
                {" selected"}
              </Text>
            </View>

            <View
              style={
                styles.previewNotice
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={19}
                color="#a78bfa"
              />

              <Text
                style={
                  styles.previewNoticeText
                }
              >
                ArtBoost will select a
                different eligible product,
                generate unique content for
                each platform, and add it to
                the campaign scheduler.
              </Text>
            </View>
          </View>

          <Pressable
  style={[
    styles.saveButton,
    postingNow &&
      styles.saveButtonDisabled,
  ]}
  onPress={postNow}
  disabled={
    postingNow ||
    !automationId
  }
>
  <Ionicons
    name="send"
    size={22}
    color="#ffffff"
  />

  <Text
    style={styles.saveButtonText}
  >
    {postingNow
      ? "Posting..."
      : "Post Now"}
  </Text>
</Pressable>

<View style={{ height: 14 }} />

<Pressable
  style={styles.saveButton}
  onPress={
    toggleAutomationStatus
  }
  disabled={!automationId}
>
  <Ionicons
    name={
      enabled
        ? "pause"
        : "play"
    }
    size={22}
    color="#ffffff"
  />

  <Text
    style={styles.saveButtonText}
  >
    {enabled
      ? "Pause Promotion"
      : "Resume Promotion"}
  </Text>
</Pressable>

<View style={{ height: 14 }} />

          <Pressable
            style={[
              styles.saveButton,
              saving &&
                styles.saveButtonDisabled,
            ]}
                        onPress={saveAutomation}
            disabled={
              saving ||
              loadingAutomation
            }
          >
            <Ionicons
              name={
                saving
                  ? "hourglass-outline"
                  : "save-outline"
              }
              size={22}
              color="#ffffff"
            />

            <Text
              style={
                styles.saveButtonText
              }
            >
                            {loadingAutomation
                ? "Loading..."
                : saving
                  ? "Saving..."
                  : "Save Automation"}
            </Text>
          </Pressable>

          <Text
            style={styles.footerText}
          >
            You can change or disable this
            automation at any time.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  screen: {
    flex: 1,
    backgroundColor: "rgba(7, 6, 17, 0.90)",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#141126",
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
  },

  eyebrow: {
    color: "#9b5cff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 3,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#21183a",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 50,
  },

  storeCard: {
    borderRadius: 22,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#302641",
    padding: 17,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  storeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: "#21183a",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  storeInfo: {
    flex: 1,
    paddingLeft: 14,
  },

  platformText: {
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  storeNameText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    marginTop: 3,
  },

  productCountText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  sectionCard: {
    borderRadius: 22,
    backgroundColor: "rgba(16, 13, 32, 0.92)",
    borderWidth: 1,
    borderColor: "#3f2e68",
    padding: 17,
    marginBottom: 16,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  sectionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeading: {
    flex: 1,
    paddingHorizontal: 12,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  sectionDescription: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  statusBanner: {
    minHeight: 42,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginRight: 9,
  },

  statusDotActive: {
    backgroundColor: "#4ade80",
  },

  statusDotInactive: {
    backgroundColor: "#9b94b7",
  },

  statusBannerText: {
    fontSize: 12,
    fontWeight: "900",
  },

  statusBannerTextActive: {
    color: "#86efac",
  },

  statusBannerTextInactive: {
    color: "#ffffff",
  },

  fieldLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 20,
    marginBottom: 10,
  },

  fieldHelp: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },

  optionStack: {
    gap: 10,
  },

  radioCard: {
    minHeight: 73,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  radioCardSelected: {
    backgroundColor: "#241b3b",
    borderColor: "#6649a8",
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: "#686868",
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: "#a78bfa",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: "#a78bfa",
  },

  radioTextWrap: {
    flex: 1,
    paddingLeft: 12,
  },

  radioTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  radioTitleSelected: {
    color: "#ffffff",
  },

  radioDescription: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  inputRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  inputIcon: {
    width: 35,
    alignItems: "flex-start",
  },

  textInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  inputHint: {
    color: "#a78bfa",
    fontSize: 12,
    fontWeight: "900",
  },

  pickerValue: {
  flex: 1,
  color: "#ffffff",
  fontSize: 15,
  fontWeight: "900",
},

  readOnlyRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  readOnlyText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },

  autoPill: {
    borderRadius: 99,
    backgroundColor: "#21183a",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  autoPillText: {
    color: "#c4b5fd",
    fontSize: 9,
    fontWeight: "900",
  },

  platformGrid: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  platformCard: {
    width: "48%",
    minHeight: 70,
    borderRadius: 17,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  platformCardSelected: {
    backgroundColor: "#241b3b",
    borderColor: "#6649a8",
  },

  platformCardDisabled: {
    opacity: 0.55,
  },

  platformIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#3f2e68",
    alignItems: "center",
    justifyContent: "center",
  },

  platformIconWrapSelected: {
    backgroundColor: "#9b5cff",
  },

  platformLabel: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 9,
  },

  platformLabelSelected: {
    color: "#ffffff",
  },

  platformLabelDisabled: {
    color: "#ffffff",
  },

  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#5f5f5f",
    alignItems: "center",
    justifyContent: "center",
  },

  checkboxSelected: {
    backgroundColor: "#9b5cff",
    borderColor: "#9b5cff",
  },

  soonText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },

  facebookPageState: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  facebookPageStateText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
  },

  facebookPageError: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#4a3030",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  facebookPageErrorText: {
    flex: 1,
    color: "#fca5a5",
    fontSize: 12,
    lineHeight: 18,
  },

  facebookPageCard: {
    minHeight: 62,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  facebookPageCardSelected: {
    backgroundColor: "#241b3b",
    borderColor: "#6649a8",
  },

  facebookPageIcon: {
    width: 38,
    height: 38,
    marginLeft: 11,
    marginRight: 10,
    borderRadius: 13,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },

  facebookPageName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  facebookPageNameSelected: {
    color: "#ffffff",
  },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  counterButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#21183a",
    borderWidth: 1,
    borderColor: "#4c3979",
    alignItems: "center",
    justifyContent: "center",
  },

  counterInputWrap: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(21, 17, 38, 0.94)",
    borderWidth: 1,
    borderColor: "#3b3158",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  counterInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  counterSuffix: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  previewCard: {
    borderRadius: 22,
    backgroundColor: "rgba(29, 23, 48, 0.92)",
    borderWidth: 1,
    borderColor: "#3c2d63",
    padding: 17,
    marginBottom: 18,
  },

  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  previewIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#21183a",
    alignItems: "center",
    justifyContent: "center",
  },

  previewHeading: {
    flex: 1,
    paddingLeft: 12,
  },

  previewTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  previewSubtitle: {
    color: "#ffffff",
    fontSize: 11,
    marginTop: 3,
  },

  previewDivider: {
    height: 1,
    backgroundColor: "#3c3150",
    marginVertical: 15,
  },

  previewRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  previewLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  previewValue: {
    flex: 1,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },

  previewValueActive: {
    color: "#c4b5fd",
  },

    productPreviewBox: {
    borderRadius: 16,
    backgroundColor: "#241b3b",
    borderWidth: 1,
    borderColor: "#4c3979",
    padding: 14,
    marginBottom: 8,
  },

  productPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",
    marginBottom: 12,
  },

  refreshPreviewButton: {
    minHeight: 32,
    borderRadius: 11,
    backgroundColor: "#21183a",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  refreshPreviewText: {
    color: "#c4b5fd",
    fontSize: 10,
    fontWeight: "900",
  },

  previewProductRow: {
  flexDirection: "row",
  alignItems: "flex-start",
},

previewProductImage: {
  width: 78,
  height: 78,
  borderRadius: 12,
  backgroundColor: "#1a1a1a",
  marginRight: 12,
},

previewImagePlaceholder: {
  width: 78,
  height: 78,
  borderRadius: 12,
  backgroundColor: "#21183a",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
},

previewProductInfo: {
  flex: 1,
},

  previewProductTitle: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
  },

  previewProductPrice: {
    color: "#c4b5fd",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 7,
  },

  previewProductMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
  },

  previewProductMeta: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },

  previewProductState: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  previewProductStateText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
  },

  previewErrorText: {
    flex: 1,
    color: "#fca5a5",
    fontSize: 11,
    lineHeight: 17,
  },

  previewNotice: {
    borderRadius: 15,
    backgroundColor: "#21183a",
    padding: 13,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  previewNoticeText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 17,
  },

  saveButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#9b5cff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  saveButtonDisabled: {
    opacity: 0.65,
  },

  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  footerText: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 12,
  },

  multiTimeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  timeChip: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#2b2145",
    borderWidth: 1,
    borderColor: "#4c3979",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  timeChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  addTimeButton: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#7c3aed",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addTimeButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
});