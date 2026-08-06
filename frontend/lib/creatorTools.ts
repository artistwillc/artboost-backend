import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type CreatorToolId =
  | "ai-title"
  | "ai-description"
  | "ai-hashtag"
  | "ai-cta"
  | "pricing"
  | "pod-profit";

export type ToolTier = "Starter" | "Pro" | "Business";
export type ToolKind = "ai" | "calculator";
export type FieldKeyboard = "default" | "numeric" | "decimal-pad";

export type CreatorToolField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: FieldKeyboard;
  required?: boolean;
  helperText?: string;
};

export type CreatorToolDefinition = {
  id: CreatorToolId;
  title: string;
  shortTitle: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  tier: ToolTier;
  kind: ToolKind;
  actionLabel: string;
  fields: CreatorToolField[];
};

export const CREATOR_TOOLS: Record<CreatorToolId, CreatorToolDefinition> = {
  "ai-title": {
    id: "ai-title",
    title: "AI Title Generator",
    shortTitle: "Title Generator",
    description:
      "Generate strong, searchable title ideas for artwork, product listings, and campaigns.",
    icon: "text-outline",
    tier: "Starter",
    kind: "ai",
    actionLabel: "Generate Titles",
    fields: [
      {
        key: "artworkDescription",
        label: "Artwork or Product Description",
        placeholder:
          "Example: A detailed scuba skull design with a dive flag, coral reef, shark, and the phrase Breathe Deep, Live Free.",
        multiline: true,
        required: true,
      },
      {
        key: "marketplace",
        label: "Marketplace or Use",
        placeholder: "Example: Redbubble, Shopify, Instagram, wall art",
      },
      {
        key: "tone",
        label: "Style or Tone",
        placeholder: "Example: Bold, premium, adventurous",
      },
      {
        key: "keywords",
        label: "Important Keywords",
        placeholder: "Example: scuba, dive life, ocean, skull",
      },
    ],
  },
  "ai-description": {
    id: "ai-description",
    title: "AI Description Generator",
    shortTitle: "Description Generator",
    description:
      "Create polished, SEO-friendly descriptions that explain the artwork and help customers understand its value.",
    icon: "document-text-outline",
    tier: "Starter",
    kind: "ai",
    actionLabel: "Generate Description",
    fields: [
      {
        key: "title",
        label: "Artwork or Product Title",
        placeholder: "Example: Dive Life Skull — Breathe Deep, Live Free",
        required: true,
      },
      {
        key: "artworkDescription",
        label: "What the Artwork Shows",
        placeholder:
          "Describe the main subject, visual details, colors, audience, and meaning.",
        multiline: true,
        required: true,
      },
      {
        key: "marketplace",
        label: "Marketplace",
        placeholder: "Example: Fine Art America, Shopify, Redbubble",
      },
      {
        key: "tone",
        label: "Brand Voice",
        placeholder: "Example: Professional, rugged, energetic",
      },
    ],
  },
  "ai-hashtag": {
    id: "ai-hashtag",
    title: "AI Hashtag Generator",
    shortTitle: "Hashtag Generator",
    description:
      "Build a relevant hashtag group for a specific platform, artwork, and audience.",
    icon: "pricetag-outline",
    tier: "Starter",
    kind: "ai",
    actionLabel: "Generate Hashtags",
    fields: [
      {
        key: "subject",
        label: "Artwork Subject",
        placeholder: "Example: Scuba diving skull artwork",
        required: true,
      },
      {
        key: "platform",
        label: "Platform",
        placeholder: "Example: Instagram, Pinterest, Facebook, X",
        required: true,
      },
      {
        key: "audience",
        label: "Target Audience",
        placeholder: "Example: Divers, ocean lovers, gift buyers",
      },
      {
        key: "keywords",
        label: "Keywords to Include",
        placeholder: "Example: DiveLife, ScubaDiving, OceanAdventure",
      },
    ],
  },
  "ai-cta": {
    id: "ai-cta",
    title: "AI CTA Generator",
    shortTitle: "CTA Generator",
    description:
      "Create platform-appropriate calls to action for clicks, sales, follows, saves, and engagement.",
    icon: "megaphone-outline",
    tier: "Pro",
    kind: "ai",
    actionLabel: "Generate CTAs",
    fields: [
      {
        key: "goal",
        label: "Campaign Goal",
        placeholder: "Example: Drive sales, gain followers, promote a new release",
        required: true,
      },
      {
        key: "platform",
        label: "Platform",
        placeholder: "Example: Instagram, Pinterest, Facebook, X",
        required: true,
      },
      {
        key: "product",
        label: "Product or Artwork",
        placeholder: "Example: Dive Life Skull apparel and wall art",
      },
      {
        key: "destination",
        label: "Where the CTA Sends Users",
        placeholder: "Example: Product link, link in bio, full collection",
      },
    ],
  },
  pricing: {
    id: "pricing",
    title: "Art Pricing Calculator",
    shortTitle: "Art Pricing",
    description:
      "Estimate break-even and recommended selling prices using materials, labor, overhead, fees, and desired profit.",
    icon: "calculator-outline",
    tier: "Starter",
    kind: "calculator",
    actionLabel: "Calculate Price",
    fields: [
      {
        key: "materials",
        label: "Materials Cost",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
        required: true,
      },
      {
        key: "laborHours",
        label: "Labor Hours",
        placeholder: "0",
        keyboardType: "decimal-pad",
        required: true,
      },
      {
        key: "hourlyRate",
        label: "Hourly Rate",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
        required: true,
      },
      {
        key: "overhead",
        label: "Overhead / Other Costs",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
      },
      {
        key: "shippingCost",
        label: "Shipping Cost You Pay",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
      },
      {
        key: "feePercent",
        label: "Marketplace + Payment Fees (%)",
        placeholder: "10",
        keyboardType: "decimal-pad",
      },
      {
        key: "profitPercent",
        label: "Desired Profit Margin (%)",
        placeholder: "30",
        keyboardType: "decimal-pad",
      },
    ],
  },
  "pod-profit": {
    id: "pod-profit",
    title: "POD Profit Calculator",
    shortTitle: "POD Profit",
    description:
      "Calculate profit, margin, total expenses, and break-even price for a print-on-demand product.",
    icon: "cash-outline",
    tier: "Pro",
    kind: "calculator",
    actionLabel: "Calculate Profit",
    fields: [
      {
        key: "retailPrice",
        label: "Retail Price",
        placeholder: "29.99",
        keyboardType: "decimal-pad",
        required: true,
      },
      {
        key: "productionCost",
        label: "Production Cost",
        placeholder: "12.50",
        keyboardType: "decimal-pad",
        required: true,
      },
      {
        key: "shippingCharged",
        label: "Shipping Charged to Customer",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
      },
      {
        key: "shippingCost",
        label: "Shipping Cost You Pay",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
      },
      {
        key: "marketplaceFeePercent",
        label: "Marketplace Fee (%)",
        placeholder: "0",
        keyboardType: "decimal-pad",
      },
      {
        key: "paymentFeePercent",
        label: "Payment Processing Fee (%)",
        placeholder: "2.9",
        keyboardType: "decimal-pad",
      },
      {
        key: "fixedFee",
        label: "Fixed Transaction Fee",
        placeholder: "0.30",
        keyboardType: "decimal-pad",
      },
      {
        key: "advertisingCost",
        label: "Advertising Cost per Sale",
        placeholder: "0.00",
        keyboardType: "decimal-pad",
      },
    ],
  },
};

export function isCreatorToolId(value: string): value is CreatorToolId {
  return Object.prototype.hasOwnProperty.call(CREATOR_TOOLS, value);
}
