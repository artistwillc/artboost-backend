const LIVE_ACCOUNT_TERMS =
  /\b(?:how many|count|total|currently|do i have|have i|my next|next run|scheduled to run|which platforms will|connected|connection status|need attention|expired|fail|fails|failed|failure|failures|error|errors|skipped|published|posts have i|active automations?|upcoming campaigns?)\b/;

const HELP_TERMS =
  /\b(?:what is|what does|what can|what are|which tools|how does|how do i|how can i|explain|help|used for|use it|available|include|included|features|work|works|set up|setup)\b/;

export const ARTBOOST_FEATURE_CATALOG = [
  {
    id: "campaign_manager",
    names: ["campaign manager", "marketing campaign", "campaigns"],
    action: "open_campaign_manager",
    answer:
      "Campaign Manager lets you create marketing campaigns for artwork and products, choose where they publish, post immediately or schedule them for later, and manage publishing status from one place.",
    steps: [
      "Open Campaign Manager.",
      "Choose or enter the artwork or product content.",
      "Select the social platforms and required destinations.",
      "Post now or choose a future publishing schedule.",
    ],
    followUps: [
      "How many scheduled campaigns do I currently have?",
      "What campaign is scheduled to run next?",
      "Do any of my campaigns have errors?",
    ],
  },
  {
    id: "analytics",
    names: ["analytics", "analytics dashboard", "performance dashboard"],
    action: "open_analytics",
    answer:
      "ArtBoost Analytics is designed to show publishing and marketing performance in one place, including published post totals, scheduled campaign activity, automation status, platform performance, top-performing content, campaign health, upcoming posts, engagement, clicks, conversions, and AI-generated insights when data is available.",
    steps: [
      "Open Analytics to review the dashboard.",
      "Compare platform and campaign performance.",
      "Review automation health and upcoming publishing activity.",
    ],
    followUps: [
      "How many posts have I published?",
      "How many successful automation runs have I had?",
      "Do any of my automations have errors?",
    ],
  },
  {
    id: "automatic_posting",
    names: [
      "automatic posting",
      "auto posting",
      "automated posting",
      "scheduled posting",
      "store automation",
      "posting automation",
    ],
    action: "open_connections",
    answer:
      "Automatic posting uses a connected store, imported products, and connected social platforms. You configure a store automation, choose platforms and required destinations such as a Facebook Page or Pinterest board, select a schedule and product-selection rules, and ArtBoost publishes an eligible product when the automation runs.",
    steps: [
      "Connect a store and import its products.",
      "Connect the social platforms you want to use.",
      "Create or open the store automation.",
      "Choose platforms, destinations, schedule, time zone, and product selection.",
      "Enable the automation and confirm that a next run time appears.",
    ],
    followUps: [
      "How many active automations do I have?",
      "When are my automations scheduled to run next?",
      "Which platforms will each automation post to?",
    ],
  },
  {
    id: "creator_tools",
    names: ["creator tools", "creator tool", "art tools", "business tools"],
    action: "open_creator_tools",
    answer:
      "ArtBoost Creator Tools include the AI Title Generator, AI Description Generator, AI Hashtag Generator, AI CTA Generator, Art Pricing Calculator, POD Profit Calculator, Collection Builder, AI Store Critique, Trending Artwork Ideas, Holiday Marketing Calendar, Opportunity Scanner, and AI Business Coach.",
    steps: [
      "Open Creator Tools and choose the tool you need.",
      "Enter the artwork, product, store, pricing, or business details requested.",
      "Review the result, then copy, save, or apply it where available.",
    ],
    followUps: [
      "How do I use the AI Hashtag Generator?",
      "Can you explain the POD Profit Calculator?",
      "What can the AI Business Coach help me with?",
    ],
  },
  {
    id: "title_generator",
    names: ["ai title generator", "title generator"],
    action: "open_creator_tools",
    answer:
      "The AI Title Generator creates marketable artwork or product titles from the subject, style, theme, audience, and product context you provide.",
    steps: [
      "Open Creator Tools and select AI Title Generator.",
      "Describe the artwork, product, style, and audience.",
      "Generate titles, then choose or edit the strongest option.",
    ],
    followUps: [
      "How do I use the AI Description Generator?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "description_generator",
    names: ["ai description generator", "description generator"],
    action: "open_creator_tools",
    answer:
      "The AI Description Generator turns artwork or product details into a polished marketing description. Include the subject, style, audience, product type, and important selling points.",
    steps: [
      "Open Creator Tools and select AI Description Generator.",
      "Enter the artwork and product details.",
      "Generate, review, and edit the description before publishing.",
    ],
    followUps: [
      "How do I use the AI Hashtag Generator?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "hashtag_generator",
    names: ["ai hashtag generator", "hashtag generator"],
    action: "open_creator_tools",
    answer:
      "The AI Hashtag Generator creates relevant social hashtags from your artwork, niche, audience, and platform. Specific input produces a stronger mix of broad, niche, and product-focused hashtags.",
    steps: [
      "Open Creator Tools and select AI Hashtag Generator.",
      "Describe the artwork, niche, audience, and platform.",
      "Generate hashtags and remove any that do not accurately match the post.",
    ],
    followUps: [
      "What does the AI CTA Generator do?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "cta_generator",
    names: ["ai cta generator", "cta generator", "call to action generator"],
    action: "open_creator_tools",
    answer:
      "The AI CTA Generator creates calls to action for social posts and product marketing, such as prompting customers to view, shop, save, follow, or learn more.",
    steps: [
      "Open Creator Tools and select AI CTA Generator.",
      "Enter the product, platform, and desired customer action.",
      "Use the generated CTA that fits the post naturally.",
    ],
    followUps: [
      "How do I use the AI Hashtag Generator?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "art_pricing_calculator",
    names: ["art pricing calculator", "pricing calculator"],
    action: "open_creator_tools",
    answer:
      "The Art Pricing Calculator estimates a selling price from costs, labor, time, markup, and profit goals. Compare the result with your market and product format before publishing the final price.",
    steps: [
      "Enter materials, labor, time, fees, and desired profit.",
      "Review the suggested price.",
      "Adjust it for your market and customer expectations.",
    ],
    followUps: [
      "Can you explain the POD Profit Calculator?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "pod_profit_calculator",
    names: ["pod profit calculator", "print on demand profit calculator"],
    action: "open_creator_tools",
    answer:
      "The POD Profit Calculator estimates profit after base product cost, marketplace or payment fees, shipping costs you absorb, and the selling price.",
    steps: [
      "Enter the base cost, selling price, fees, and absorbed shipping cost.",
      "Review the estimated profit and margin.",
      "Adjust the price before publishing the product.",
    ],
    followUps: [
      "How does the Art Pricing Calculator work?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "collection_builder",
    names: ["collection builder"],
    action: "open_creator_tools",
    answer:
      "Collection Builder helps organize related artwork into a cohesive collection using a shared theme, audience, style, or product strategy.",
    steps: [],
    followUps: [
      "What can AI Store Critique help with?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "store_critique",
    names: ["ai store critique", "store critique"],
    action: "open_creator_tools",
    answer:
      "AI Store Critique reviews the store information you provide and recommends improvements to presentation, product positioning, titles, descriptions, branding, and marketing.",
    steps: [],
    followUps: [
      "What does Opportunity Scanner do?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "trending_artwork_ideas",
    names: ["trending artwork ideas", "artwork ideas"],
    action: "open_creator_tools",
    answer:
      "Trending Artwork Ideas generates timely concepts based on themes, audiences, seasons, and market opportunities. Use the ideas as direction while keeping the final artwork original to your brand.",
    steps: [],
    followUps: [
      "What does the Holiday Marketing Calendar do?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "holiday_marketing_calendar",
    names: ["holiday marketing calendar", "marketing calendar"],
    action: "open_creator_tools",
    answer:
      "The Holiday Marketing Calendar helps plan artwork, promotions, and publishing around holidays and seasonal buying periods so you can prepare before each event.",
    steps: [],
    followUps: [
      "What does Opportunity Scanner do?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "opportunity_scanner",
    names: ["opportunity scanner"],
    action: "open_creator_tools",
    answer:
      "Opportunity Scanner helps identify possible marketing, seasonal, product, and audience opportunities from the information available in ArtBoost.",
    steps: [],
    followUps: [
      "What can the AI Business Coach help me with?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "business_coach",
    names: ["ai business coach", "business coach"],
    action: "open_creator_tools",
    answer:
      "The AI Business Coach provides practical guidance for product strategy, pricing, marketing priorities, store improvement, and next-step planning based on the details you provide.",
    steps: [],
    followUps: [
      "What can AI Store Critique help with?",
      "What Creator Tools are available to me?",
    ],
  },
  {
    id: "connections",
    names: ["connections", "connect social platform", "connect store", "social connections"],
    action: "open_connections",
    answer:
      "Connections is where you add, reconnect, review, and remove store and social-platform connections used by ArtBoost.",
    steps: [
      "Open Connections.",
      "Choose Social Platforms or Stores.",
      "Select the provider and complete authorization or import.",
      "Refresh the status after returning to ArtBoost.",
    ],
    followUps: [
      "What social platforms do I currently have connected?",
      "How many stores do I currently have connected?",
    ],
  },
  {
    id: "library",
    names: ["library", "product library", "artwork library"],
    action: "open_library",
    answer:
      "The ArtBoost Library contains imported products and artwork from connected stores. It supports reviewing the catalog and selecting content for campaigns and automations.",
    steps: [],
    followUps: [
      "How many products do I currently have in ArtBoost?",
      "Which stores have products imported?",
    ],
  },
  {
    id: "subscription",
    names: ["subscription", "pro plan", "billing plan"],
    action: "open_subscription",
    answer:
      "Subscription shows your current ArtBoost plan and billing status. The current paid Pro access includes direct social posting, scheduled reposting, and the Pro features available throughout ArtBoost.",
    steps: [],
    followUps: [
      "What ArtBoost subscription plan am I currently on?",
      "What features are included in my plan?",
    ],
  },
  {
    id: "marketing_consultant",
    names: ["ai marketing consultant", "marketing consultant", "marketing profile"],
    action: "open_marketing_consultant",
    answer:
      "AI Marketing Consultant uses your marketing profile to recommend platforms, posting schedules, automations, campaign ideas, and practical marketing actions for your art business.",
    steps: [
      "Open AI Marketing Consultant.",
      "Create or update the marketing profile.",
      "Review each recommendation and its reasoning.",
      "Apply the recommendations that fit your business.",
    ],
    followUps: [
      "What is a marketing profile?",
      "How should I use the platform recommendations?",
    ],
  },
  {
    id: "customer_service",
    names: ["customer service", "ai support", "support assistant"],
    action: "open_help_faq",
    answer:
      "ArtBoost AI Support answers questions about using ArtBoost, explains features, reads supported live account data, and provides troubleshooting guidance. Third-party order, shipping, refund, tax, and fulfillment issues must be handled by the applicable store or provider.",
    steps: [],
    followUps: [
      "What can you help me with?",
      "Where can I find the FAQ?",
    ],
  },
  {
    id: "faq",
    names: ["faq", "help and faq", "help & faq"],
    action: "open_help_faq",
    answer:
      "Help & FAQ contains built-in instructions and answers for common ArtBoost setup, connection, campaign, automation, subscription, and troubleshooting questions.",
    steps: [],
    followUps: [
      "What can ArtBoost AI Support help me with?",
      "How does automatic posting work?",
    ],
  },
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function isFeatureHelpQuestion(question) {
  const q = normalize(question);
  if (!q || LIVE_ACCOUNT_TERMS.test(q)) return false;
  return HELP_TERMS.test(q);
}

export function findArtBoostFeature(question) {
  const q = normalize(question);
  if (!q) return null;

  const matches = ARTBOOST_FEATURE_CATALOG
    .map((feature) => {
      const matchedNames = feature.names.filter((name) => q.includes(name));
      const longest = matchedNames.reduce(
        (max, name) => Math.max(max, name.length),
        0
      );
      return { feature, score: longest };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return matches[0]?.feature || null;
}
