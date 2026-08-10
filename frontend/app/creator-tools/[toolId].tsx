import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  CREATOR_TOOLS,
  isCreatorToolId,
  type CreatorToolDefinition,
} from "@/lib/creatorTools";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboost-ai.onrender.com";

type FormValues = Record<string, string>;

type SelectedArtwork = {
  uri: string;
  name: string;
  type: string;
};

type ResultMetric = {
  label: string;
  value: string;
  emphasis?: "positive" | "warning" | "neutral";
};

type ToolResult = {
  title: string;
  body?: string;
  items?: string[];
  metrics?: ResultMetric[];
};

function numberFromInput(value: string) {
  const parsed = Number(
    String(value || "").replace(/[$,%\s]/g, "")
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number) {
  return `${
    Number.isFinite(value)
      ? value.toFixed(1)
      : "0.0"
  }%`;
}

function buildInitialValues(
  tool: CreatorToolDefinition
) {
  return Object.fromEntries(
    tool.fields.map((field) => [
      field.key,
      "",
    ])
  );
}

type FocusedAIField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  helperText?: string;
};

function getFocusedAIFields(
  toolId: string
): FocusedAIField[] {
  if (toolId === "ai-title") {
    return [
      {
        key: "context",
        label: "Optional Context",
        placeholder:
          "Example: T-shirt design, wall art, fishing audience, premium style",
        multiline: true,
      },
    ];
  }

  if (
    toolId ===
    "ai-description"
  ) {
    return [
      {
        key: "context",
        label: "Optional Context",
        placeholder:
          "Example: Product type, target customer, marketplace, or details the image cannot show",
        multiline: true,
      },
    ];
  }

  if (
    toolId ===
    "ai-hashtag"
  ) {
    return [
      {
        key: "platform",
        label: "Platform",
        placeholder:
          "Instagram, Facebook, Pinterest, X, Threads, LinkedIn, or TikTok",
        required: true,
      },
    ];
  }

  if (toolId === "ai-cta") {
    return [
      {
        key: "platform",
        label: "Platform",
        placeholder:
          "Instagram, Facebook, Pinterest, X, Threads, LinkedIn, or TikTok",
        required: true,
      },
      {
        key: "goal",
        label: "Campaign Goal",
        placeholder:
          "Example: Shop now, view the artwork, follow, save, learn more",
        required: true,
      },
    ];
  }

  return [];
}

export default function CreatorToolScreen() {
  const params =
    useLocalSearchParams<{
      toolId?: string;
    }>();

  const rawToolId = String(
    params.toolId || ""
  );

  const tool = useMemo(
    () =>
      isCreatorToolId(rawToolId)
        ? CREATOR_TOOLS[rawToolId]
        : null,
    [rawToolId]
  );

  const [values, setValues] =
    useState<FormValues>(() =>
      tool
        ? buildInitialValues(tool)
        : {}
    );

  const [loading, setLoading] =
    useState(false);

  const [result, setResult] =
    useState<ToolResult | null>(null);

  const [artwork, setArtwork] =
    useState<SelectedArtwork | null>(null);

  const isAIWritingTool =
    tool?.kind === "ai";

  const focusedAIFields =
    isAIWritingTool && tool
      ? getFocusedAIFields(tool.id)
      : [];

  /**
   * Reliable Creator Tools navigation.
   *
   * Normal case:
   *   Return to the previous screen.
   *
   * Fallback:
   *   If the screen was opened from a deep link,
   *   refresh, or lost navigation stack, return
   *   directly to the Creator Tools tab.
   */
  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(
      "/(tabs)/explore" as any
    );
  }

  async function pickArtwork() {
    try {
      if (Platform.OS === "android") {
        const picked =
          await DocumentPicker.getDocumentAsync({
            type: "image/*",
            copyToCacheDirectory: true,
            multiple: false,
          });

        if (
          !picked.canceled &&
          picked.assets?.length
        ) {
          const asset =
            picked.assets[0];

          setArtwork({
            uri: asset.uri,
            name:
              asset.name ||
              "creator-tool-artwork.jpg",
            type:
              asset.mimeType ||
              "image/jpeg",
          });

          setResult(null);
        }

        return;
      }

      const picked =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes:
            ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });

      if (
        !picked.canceled &&
        picked.assets?.length
      ) {
        const asset =
          picked.assets[0];

        setArtwork({
          uri: asset.uri,
          name:
            asset.fileName ||
            "creator-tool-artwork.jpg",
          type:
            asset.mimeType ||
            "image/jpeg",
        });

        setResult(null);
      }
    } catch (error: any) {
      console.log(
        "Creator Tool artwork picker error:",
        error
      );

      Alert.alert(
        "Unable to Select Artwork",
        error?.message ||
          "ArtBoost could not open the artwork picker."
      );
    }
  }

  function removeArtwork() {
    setArtwork(null);
    setResult(null);
  }

  function fieldIsRequired(
    field:
      | CreatorToolDefinition["fields"][number]
      | FocusedAIField
  ) {
    return Boolean(
      field.required
    );
  }

  function updateValue(
    key: string,
    value: string
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function validateRequiredFields() {
    if (!tool) {
      return false;
    }

    if (isAIWritingTool) {
      if (!artwork) {
        Alert.alert(
          "Artwork Required",
          "Upload artwork before generating."
        );

        return false;
      }

      const missingField =
        focusedAIFields.find(
          (field) =>
            field.required &&
            !String(
              values[field.key] || ""
            ).trim()
        );

      if (missingField) {
        Alert.alert(
          "Missing Information",
          `Enter ${missingField.label.toLowerCase()} before continuing.`
        );

        return false;
      }

      return true;
    }

    const missingField =
      tool.fields.find(
        (field) =>
          field.required &&
          !String(
            values[field.key] || ""
          ).trim()
      );

    if (missingField) {
      Alert.alert(
        "Missing Information",
        `Enter ${missingField.label.toLowerCase()} before continuing.`
      );

      return false;
    }

    return true;
  }

  function calculateArtPrice() {
    const materials =
      numberFromInput(
        values.materials
      );

    const laborHours =
      numberFromInput(
        values.laborHours
      );

    const hourlyRate =
      numberFromInput(
        values.hourlyRate
      );

    const overhead =
      numberFromInput(
        values.overhead
      );

    const shippingCost =
      numberFromInput(
        values.shippingCost
      );

    const feeRate =
      numberFromInput(
        values.feePercent
      ) / 100;

    const targetMargin =
      numberFromInput(
        values.profitPercent
      ) / 100;

    const laborCost =
      laborHours * hourlyRate;

    const directCost =
      materials +
      laborCost +
      overhead +
      shippingCost;

    const breakEvenDenominator =
      Math.max(
        1 - feeRate,
        0.01
      );

    const breakEvenPrice =
      directCost /
      breakEvenDenominator;

    const recommendedDenominator =
      Math.max(
        1 -
          feeRate -
          targetMargin,
        0.01
      );

    const recommendedPrice =
      directCost /
      recommendedDenominator;

    const estimatedFees =
      recommendedPrice *
      feeRate;

    const estimatedProfit =
      recommendedPrice -
      estimatedFees -
      directCost;

    const actualMargin =
      recommendedPrice
        ? (estimatedProfit /
            recommendedPrice) *
          100
        : 0;

    setResult({
      title:
        "Recommended Art Price",
      body:
        "This estimate includes your costs, marketplace fees, and desired profit margin. Review local market conditions before publishing the final price.",
      metrics: [
        {
          label: "Direct Cost",
          value:
            money(directCost),
          emphasis: "neutral",
        },
        {
          label:
            "Break-Even Price",
          value:
            money(
              breakEvenPrice
            ),
          emphasis: "warning",
        },
        {
          label:
            "Recommended Price",
          value:
            money(
              recommendedPrice
            ),
          emphasis: "positive",
        },
        {
          label:
            "Estimated Fees",
          value:
            money(
              estimatedFees
            ),
          emphasis: "neutral",
        },
        {
          label:
            "Estimated Profit",
          value:
            money(
              estimatedProfit
            ),
          emphasis: "positive",
        },
        {
          label:
            "Profit Margin",
          value:
            percent(actualMargin),
          emphasis: "positive",
        },
      ],
    });
  }

  function calculatePodProfit() {
    const retailPrice =
      numberFromInput(
        values.retailPrice
      );

    const productionCost =
      numberFromInput(
        values.productionCost
      );

    const shippingCharged =
      numberFromInput(
        values.shippingCharged
      );

    const shippingCost =
      numberFromInput(
        values.shippingCost
      );

    const marketplaceFeeRate =
      numberFromInput(
        values.marketplaceFeePercent
      ) / 100;

    const paymentFeeRate =
      numberFromInput(
        values.paymentFeePercent
      ) / 100;

    const fixedFee =
      numberFromInput(
        values.fixedFee
      );

    const advertisingCost =
      numberFromInput(
        values.advertisingCost
      );

    const grossRevenue =
      retailPrice +
      shippingCharged;

    const marketplaceFee =
      grossRevenue *
      marketplaceFeeRate;

    const paymentFee =
      grossRevenue *
        paymentFeeRate +
      fixedFee;

    const totalExpenses =
      productionCost +
      shippingCost +
      marketplaceFee +
      paymentFee +
      advertisingCost;

    const netProfit =
      grossRevenue -
      totalExpenses;

    const profitMargin =
      grossRevenue
        ? (netProfit /
            grossRevenue) *
          100
        : 0;

    const variableFeeRate =
      marketplaceFeeRate +
      paymentFeeRate;

    const fixedCosts =
      productionCost +
      shippingCost +
      fixedFee +
      advertisingCost;

    const breakEvenRevenue =
      fixedCosts /
      Math.max(
        1 -
          variableFeeRate,
        0.01
      );

    const breakEvenRetailPrice =
      Math.max(
        breakEvenRevenue -
          shippingCharged,
        0
      );

    setResult({
      title:
        "POD Profit Estimate",
      body:
        "This estimate shows the profit for one sale using the costs and fee percentages you entered.",
      metrics: [
        {
          label:
            "Gross Revenue",
          value:
            money(
              grossRevenue
            ),
          emphasis: "neutral",
        },
        {
          label:
            "Total Expenses",
          value:
            money(
              totalExpenses
            ),
          emphasis: "warning",
        },
        {
          label:
            "Net Profit",
          value:
            money(netProfit),
          emphasis:
            netProfit >= 0
              ? "positive"
              : "warning",
        },
        {
          label:
            "Profit Margin",
          value:
            percent(
              profitMargin
            ),
          emphasis:
            netProfit >= 0
              ? "positive"
              : "warning",
        },
        {
          label:
            "Break-Even Retail Price",
          value:
            money(
              breakEvenRetailPrice
            ),
          emphasis: "neutral",
        },
        {
          label:
            "Marketplace Fee",
          value:
            money(
              marketplaceFee
            ),
          emphasis: "neutral",
        },
      ],
    });
  }

  async function generateWithAI() {
    if (!tool) {
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const formData =
        new FormData();

      formData.append(
        "toolId",
        tool.id
      );

      formData.append(
        "inputs",
        JSON.stringify(values)
      );

      if (artwork) {
        formData.append(
          "image",
          {
            uri: artwork.uri,
            name: artwork.name,
            type: artwork.type,
          } as any
        );
      }

      const response =
        await fetch(
          `${BACKEND_URL}/creator-tools/generate`,
          {
            method: "POST",
            body: formData,
          }
        );

      const responseText =
        await response.text();

      let data: any = {};

      try {
        data = responseText
          ? JSON.parse(
              responseText
            )
          : {};
      } catch {
        throw new Error(
          `ArtBoost received an invalid AI response (HTTP ${response.status}).`
        );
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.details ||
            data.error ||
            "The Creator Tool could not generate a result."
        );
      }

      const normalizedItems =
        Array.isArray(
          data.result?.items
        )
          ? data.result.items
              .map(
                (
                  item: unknown
                ) =>
                  String(item)
              )
              .filter(Boolean)
          : [];

      setResult({
        title: String(
          data.result?.title ||
            tool.title
        ),
        body:
          data.result?.body
            ? String(
                data.result.body
              )
            : undefined,
        items:
          normalizedItems,
      });
    } catch (
      error: any
    ) {
      Alert.alert(
        "Generation Failed",
        error?.message ||
          "ArtBoost could not generate a result right now."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runTool() {
    if (
      !tool ||
      !validateRequiredFields()
    ) {
      return;
    }

    if (
      tool.id === "pricing"
    ) {
      calculateArtPrice();
      return;
    }

    if (
      tool.id ===
      "pod-profit"
    ) {
      calculatePodProfit();
      return;
    }

    await generateWithAI();
  }

  function resultAsText() {
    if (!result) {
      return "";
    }

    if (isAIWritingTool) {
      return (result.items || [])
        .filter(Boolean)
        .join("\n\n");
    }

    return [
      result.title,
      result.body,
      ...(result.items || []),
      ...(
        result.metrics || []
      ).map(
        (metric) =>
          `${metric.label}: ${metric.value}`
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function copyResult() {
    if (!result) {
      return;
    }

    await Clipboard.setStringAsync(
      resultAsText()
    );

    Alert.alert(
      "Copied",
      "The result was copied to your clipboard."
    );
  }

  async function saveResult() {
    if (
      !tool ||
      !result
    ) {
      return;
    }

    try {
      const storageKey =
        "artboost_creator_tool_results";

      const existing =
        await AsyncStorage.getItem(
          storageKey
        );

      const saved =
        existing
          ? JSON.parse(
              existing
            )
          : [];

      const next = [
        {
          id: `${Date.now()}`,
          toolId: tool.id,
          toolTitle:
            tool.title,
          inputs: values,
          result,
          createdAt:
            new Date().toISOString(),
        },
        ...(
          Array.isArray(saved)
            ? saved
            : []
        ),
      ].slice(0, 100);

      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify(next)
      );

      Alert.alert(
        "Result Saved",
        "This Creator Tool result was saved on this device."
      );
    } catch (error) {
      console.log(
        "Creator Tool result save failed:",
        error
      );

      Alert.alert(
        "Unable to Save",
        "ArtBoost could not save this result."
      );
    }
  }

  function clearTool() {
    if (!tool) {
      return;
    }

    setValues(
      buildInitialValues(tool)
    );

    setArtwork(null);
    setResult(null);
  }

  if (!tool) {
    return (
      <View
        style={
          styles.invalidScreen
        }
      >
        <Ionicons
          name="alert-circle-outline"
          size={44}
          color="#c4b5fd"
        />

        <Text
          style={
            styles.invalidTitle
          }
        >
          Creator Tool Not Found
        </Text>

        <Pressable
          style={
            styles.primaryButton
          }
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Return to Creator Tools"
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Return to Creator Tools
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View
          style={styles.header}
        >
          <Pressable
            style={
              styles.backButton
            }
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Go back to Creator Tools"
            hitSlop={10}
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color="#ffffff"
            />
          </Pressable>

          <View
            style={
              styles.headerTextWrap
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              CREATOR TOOL
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
              {tool.shortTitle}
            </Text>
          </View>

          <View
            style={
              styles.tierBadge
            }
          >
            <Text
              style={
                styles.tierBadgeText
              }
            >
              {tool.tier}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          <View
            style={
              styles.heroCard
            }
          >
            <View
              style={
                styles.heroIcon
              }
            >
              <Ionicons
                name={tool.icon}
                size={27}
                color="#ffffff"
              />
            </View>

            <View
              style={
                styles.heroTextWrap
              }
            >
              <Text
                style={
                  styles.heroTitle
                }
              >
                {tool.title}
              </Text>

              <Text
                style={
                  styles.heroDescription
                }
              >
                {tool.description}
              </Text>
            </View>
          </View>

          <View
            style={
              styles.formCard
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Enter Your Details
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              {isAIWritingTool
                ? tool.id === "ai-title"
                  ? "Upload artwork, add optional context if needed, then generate titles."
                  : tool.id === "ai-description"
                    ? "Upload artwork, add optional context if needed, then generate descriptions."
                    : tool.id === "ai-hashtag"
                      ? "Upload artwork, choose the platform, then generate hashtags."
                      : "Upload artwork, choose the platform and campaign goal, then generate calls to action."
                : `Complete the fields below, then tap ${tool.actionLabel}.`}
            </Text>

            {isAIWritingTool ? (
              <View
                style={
                  styles.artworkSection
                }
              >
                <Text
                  style={
                    styles.artworkSectionTitle
                  }
                >
                  Artwork Image
                </Text>

                <Text
                  style={
                    styles.artworkSectionHelp
                  }
                >
                  Required. ArtBoost will analyze the visible subject, colors, style, mood, and text in the artwork.
                </Text>

                {!artwork ? (
                  <Pressable
                    style={
                      styles.uploadArtworkCard
                    }
                    onPress={
                      pickArtwork
                    }
                  >
                    <View
                      style={
                        styles.uploadArtworkIcon
                      }
                    >
                      <Ionicons
                        name="image-outline"
                        size={26}
                        color="#c4b5fd"
                      />
                    </View>

                    <Text
                      style={
                        styles.uploadArtworkTitle
                      }
                    >
                      Upload Artwork
                    </Text>

                    <Text
                      style={
                        styles.uploadArtworkText
                      }
                    >
                      Choose an image from your device.
                    </Text>
                  </Pressable>
                ) : (
                  <View
                    style={
                      styles.selectedArtworkCard
                    }
                  >
                    <Image
                      source={{
                        uri: artwork.uri,
                      }}
                      style={
                        styles.artworkPreview
                      }
                      resizeMode="contain"
                    />

                    <View
                      style={
                        styles.artworkActions
                      }
                    >
                      <Pressable
                        style={
                          styles.changeArtworkButton
                        }
                        onPress={
                          pickArtwork
                        }
                      >
                        <Ionicons
                          name="images-outline"
                          size={18}
                          color="#ffffff"
                        />

                        <Text
                          style={
                            styles.changeArtworkText
                          }
                        >
                          Change Artwork
                        </Text>
                      </Pressable>

                      <Pressable
                        style={
                          styles.removeArtworkButton
                        }
                        onPress={
                          removeArtwork
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#fca5a5"
                        />

                        <Text
                          style={
                            styles.removeArtworkText
                          }
                        >
                          Remove Artwork
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

            {(isAIWritingTool
              ? focusedAIFields
              : tool.fields
            ).map((field) => (
              <View
                key={field.key}
                style={
                  styles.fieldWrap
                }
              >
                <Text
                  style={
                    styles.fieldLabel
                  }
                >
                  {field.label}
                  {fieldIsRequired(field)
                    ? " *"
                    : ""}
                </Text>

                <TextInput
                  value={
                    values[
                      field.key
                    ] || ""
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateValue(
                      field.key,
                      value
                    )
                  }
                  placeholder={
                    field.placeholder
                  }
                  placeholderTextColor="#6f6f6f"
                  style={[
                    styles.input,
                    field.multiline &&
                      styles.multilineInput,
                  ]}
                  multiline={
                    Boolean(
                      field.multiline
                    )
                  }
                  textAlignVertical={
                    field.multiline
                      ? "top"
                      : "center"
                  }
                  keyboardType={
                    "keyboardType" in
                    field
                      ? field.keyboardType ||
                        "default"
                      : "default"
                  }
                  autoCapitalize="sentences"
                />

                {"helperText" in
                  field &&
                field.helperText ? (
                  <Text
                    style={
                      styles.helperText
                    }
                  >
                    {
                      field.helperText
                    }
                  </Text>
                ) : null}
              </View>
            ))}

            <Pressable
              style={[
                styles.primaryButton,
                loading &&
                  styles.disabledButton,
              ]}
              onPress={runTool}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                />
              ) : (
                <Ionicons
                  name={
                    tool.kind ===
                    "ai"
                      ? "sparkles"
                      : "calculator-outline"
                  }
                  size={20}
                  color="#ffffff"
                />
              )}

              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {loading
                  ? "Working..."
                  : tool.actionLabel}
              </Text>
            </Pressable>
          </View>

          {result ? (
            <View
              style={
                styles.resultCard
              }
            >
              {!isAIWritingTool ? (
                <>
                  <View
                    style={
                      styles.resultHeader
                    }
                  >
                    <View
                      style={
                        styles.resultHeaderIcon
                      }
                    >
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color="#86efac"
                      />
                    </View>

                    <View
                      style={
                        styles.resultHeaderTextWrap
                      }
                    >
                      <Text
                        style={
                          styles.resultEyebrow
                        }
                      >
                        RESULT
                      </Text>

                      <Text
                        style={
                          styles.resultTitle
                        }
                      >
                        {result.title}
                      </Text>
                    </View>
                  </View>

                  {result.body ? (
                    <Text
                      style={
                        styles.resultBody
                      }
                    >
                      {result.body}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {result.items?.map(
                (
                  item,
                  index
                ) => (
                  <View
                    key={`${item}-${index}`}
                    style={
                      styles.resultItem
                    }
                  >
                    {!isAIWritingTool ? (
                      <View
                        style={
                          styles.resultNumber
                        }
                      >
                        <Text
                          style={
                            styles.resultNumberText
                          }
                        >
                          {index + 1}
                        </Text>
                      </View>
                    ) : null}

                    <Text
                      selectable
                      style={[
                        styles.resultItemText,
                        isAIWritingTool && {
                          paddingLeft: 0,
                        },
                      ]}
                    >
                      {item}
                    </Text>
                  </View>
                )
              )}

              {result.metrics ? (
                <View
                  style={
                    styles.metricsGrid
                  }
                >
                  {result.metrics.map(
                    (
                      metric
                    ) => (
                      <View
                        key={
                          metric.label
                        }
                        style={
                          styles.metricCard
                        }
                      >
                        <Text
                          style={
                            styles.metricLabel
                          }
                        >
                          {
                            metric.label
                          }
                        </Text>

                        <Text
                          style={[
                            styles.metricValue,
                            metric.emphasis ===
                              "positive" &&
                              styles.metricPositive,
                            metric.emphasis ===
                              "warning" &&
                              styles.metricWarning,
                          ]}
                        >
                          {
                            metric.value
                          }
                        </Text>
                      </View>
                    )
                  )}
                </View>
              ) : null}

              <View
                style={
                  styles.resultActions
                }
              >
                <Pressable
                  style={
                    styles.secondaryButton
                  }
                  onPress={
                    copyResult
                  }
                >
                  <Ionicons
                    name="copy-outline"
                    size={18}
                    color="#ffffff"
                  />

                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Copy
                  </Text>
                </Pressable>

                <Pressable
                  style={
                    styles.secondaryButton
                  }
                  onPress={
                    saveResult
                  }
                >
                  <Ionicons
                    name="bookmark-outline"
                    size={18}
                    color="#ffffff"
                  />

                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            style={
              styles.clearButton
            }
            onPress={
              clearTool
            }
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color="#fca5a5"
            />

            <Text
              style={
                styles.clearButtonText
              }
            >
              Clear Tool
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#101010",
    },

    invalidScreen: {
      flex: 1,
      backgroundColor:
        "#101010",
      alignItems: "center",
      justifyContent:
        "center",
      padding: 28,
    },

    invalidTitle: {
      color: "#ffffff",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 14,
      marginBottom: 22,
    },

    header: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor:
        "#242424",
      flexDirection: "row",
      alignItems: "center",
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor:
        "#1b1b1b",
      borderWidth: 1,
      borderColor:
        "#303030",
      alignItems: "center",
      justifyContent:
        "center",
    },

    headerTextWrap: {
      flex: 1,
      paddingLeft: 14,
    },

    eyebrow: {
      color: "#8b5cf6",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    headerTitle: {
      color: "#ffffff",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 3,
    },

    tierBadge: {
      backgroundColor:
        "#3a2a61",
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    tierBadgeText: {
      color: "#e9ddff",
      fontSize: 9,
      fontWeight: "900",
      textTransform:
        "uppercase",
    },

    content: {
      padding: 20,
      paddingBottom: 56,
    },

    heroCard: {
      borderRadius: 20,
      backgroundColor:
        "#1d1730",
      borderWidth: 1,
      borderColor:
        "#4c3979",
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },

    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor:
        "#8b5cf6",
      alignItems: "center",
      justifyContent:
        "center",
    },

    heroTextWrap: {
      flex: 1,
      paddingLeft: 13,
    },

    heroTitle: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "900",
    },

    heroDescription: {
      color: "#b9afc8",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },

    formCard: {
      backgroundColor:
        "#1b1b1b",
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        "#303030",
      padding: 16,
    },

    sectionTitle: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#8f8f8f",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
      marginBottom: 17,
    },

    artworkSection: {
      marginBottom: 18,
    },

    artworkSectionTitle: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "900",
    },

    artworkSectionHelp: {
      color: "#8f8f8f",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 5,
      marginBottom: 11,
    },

    uploadArtworkCard: {
      minHeight: 138,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: "#5b45a0",
      backgroundColor: "#211b30",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
    },

    uploadArtworkIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      backgroundColor: "#33264f",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },

    uploadArtworkTitle: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "900",
    },

    uploadArtworkText: {
      color: "#9f98aa",
      fontSize: 11,
      marginTop: 5,
      textAlign: "center",
    },

    selectedArtworkCard: {
      borderRadius: 17,
      borderWidth: 1,
      borderColor: "#3f3560",
      backgroundColor: "#16131e",
      padding: 10,
      overflow: "hidden",
    },

    artworkPreview: {
      width: "100%",
      height: 260,
      borderRadius: 13,
      backgroundColor: "#0d0d0d",
    },

    artworkActions: {
      flexDirection: "row",
      gap: 9,
      marginTop: 10,
    },

    changeArtworkButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 13,
      backgroundColor: "#6d4bd1",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 10,
    },

    changeArtworkText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "900",
    },

    removeArtworkButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 13,
      backgroundColor: "#32191c",
      borderWidth: 1,
      borderColor: "#633238",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 10,
    },

    removeArtworkText: {
      color: "#fca5a5",
      fontSize: 12,
      fontWeight: "900",
    },

    fieldWrap: {
      marginBottom: 15,
    },

    fieldLabel: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 7,
    },

    input: {
      minHeight: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#3a3a3a",
      backgroundColor:
        "#292929",
      color: "#ffffff",
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 13,
    },

    multilineInput: {
      minHeight: 110,
    },

    helperText: {
      color: "#777777",
      fontSize: 10,
      marginTop: 5,
    },

    primaryButton: {
      minHeight: 52,
      borderRadius: 15,
      backgroundColor:
        "#8b5cf6",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 9,
      paddingHorizontal: 18,
    },

    primaryButtonText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "900",
    },

    disabledButton: {
      opacity: 0.65,
    },

    resultCard: {
      backgroundColor:
        "#171717",
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        "#315841",
      padding: 16,
      marginTop: 16,
    },

    resultHeader: {
      flexDirection: "row",
      alignItems: "center",
    },

    resultHeaderIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        "#163424",
      alignItems: "center",
      justifyContent:
        "center",
    },

    resultHeaderTextWrap: {
      flex: 1,
      paddingLeft: 11,
    },

    resultEyebrow: {
      color: "#86efac",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    resultTitle: {
      color: "#ffffff",
      fontSize: 17,
      fontWeight: "900",
      marginTop: 3,
    },

    resultBody: {
      color: "#b7c8bd",
      fontSize: 12,
      lineHeight: 19,
      marginTop: 13,
    },

    resultItem: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      backgroundColor:
        "#222222",
      borderRadius: 14,
      padding: 12,
      marginTop: 10,
    },

    resultNumber: {
      width: 25,
      height: 25,
      borderRadius: 9,
      backgroundColor:
        "#3a2a61",
      alignItems: "center",
      justifyContent:
        "center",
    },

    resultNumberText: {
      color: "#ffffff",
      fontSize: 11,
      fontWeight: "900",
    },

    resultItemText: {
      flex: 1,
      color: "#ffffff",
      fontSize: 13,
      lineHeight: 20,
      paddingLeft: 10,
    },

    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 13,
    },

    metricCard: {
      width: "48%",
      minHeight: 82,
      borderRadius: 15,
      backgroundColor:
        "#222222",
      borderWidth: 1,
      borderColor:
        "#303030",
      padding: 12,
      justifyContent:
        "center",
    },

    metricLabel: {
      color: "#8f8f8f",
      fontSize: 10,
      fontWeight: "700",
    },

    metricValue: {
      color: "#ffffff",
      fontSize: 20,
      fontWeight: "900",
      marginTop: 5,
    },

    metricPositive: {
      color: "#86efac",
    },

    metricWarning: {
      color: "#fca5a5",
    },

    resultActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 15,
    },

    secondaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 13,
      backgroundColor:
        "#2d6cdf",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
    },

    secondaryButtonText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "800",
    },

    clearButton: {
      minHeight: 49,
      borderRadius: 14,
      backgroundColor:
        "#2b1719",
      borderWidth: 1,
      borderColor:
        "#5d2a30",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 8,
      marginTop: 16,
    },

    clearButtonText: {
      color: "#fca5a5",
      fontSize: 13,
      fontWeight: "900",
    },
  });
