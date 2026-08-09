import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

type FAQCategory =
  | "Getting Started"
  | "Home"
  | "Library"
  | "Connect"
  | "Posting"
  | "Scheduling"
  | "Automations"
  | "Campaigns"
  | "Analytics"
  | "Customer Service"
  | "Account"
  | "Troubleshooting";

type FAQItem = {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
  steps?: string[];
  keywords?: string[];
};

const categories: Array<FAQCategory | "All"> = [
  "All",
  "Getting Started",
  "Home",
  "Library",
  "Connect",
  "Posting",
  "Scheduling",
  "Automations",
  "Campaigns",
  "Analytics",
  "Customer Service",
  "Account",
  "Troubleshooting",
];

const faqItems: FAQItem[] = [
  {
    id: "getting-started-1",
    category: "Getting Started",
    question: "What is ArtBoost AI?",
    answer:
      "ArtBoost AI is a marketing and content-management app designed to help artists, creators, and small businesses promote their products. It can organize products, generate social-media content, schedule posts, manage campaigns, and connect supported stores and social platforms.",
    keywords: [
      "what is artboost",
      "about",
      "app",
      "marketing",
      "artists",
    ],
  },
  {
    id: "getting-started-2",
    category: "Getting Started",
    question: "How do I begin using ArtBoost AI?",
    answer:
      "Start by connecting a store or adding products to your Library. Next, connect the social platforms where you want to publish. Once those connections are ready, select a product, generate content, and either post it immediately or schedule it.",
    steps: [
      "Open the Connect tab.",
      "Connect a supported store or import a product.",
      "Connect at least one supported social platform.",
      "Open the Library tab and select a product.",
      "Generate the post content.",
      "Choose Post Now, Schedule, or create an automation.",
    ],
    keywords: [
      "start",
      "begin",
      "setup",
      "first steps",
      "getting started",
    ],
  },
  {
    id: "getting-started-3",
    category: "Getting Started",
    question: "What should I connect first?",
    answer:
      "Connect your product source first, such as Shopify or Redbubble, and then connect the social platforms where you want ArtBoost to publish. This gives ArtBoost both the product information and a destination for the generated content.",
    steps: [
      "Open Connect.",
      "Select Stores.",
      "Connect or import your store.",
      "Return to Connect.",
      "Select Social Platforms.",
      "Connect the platforms you want to use.",
    ],
    keywords: [
      "connect first",
      "store",
      "social platform",
      "setup",
    ],
  },
  {
    id: "home-1",
    category: "Home",
    question: "What is shown on the Home tab?",
    answer:
      "The Home tab gives you a quick overview of your ArtBoost account. Depending on the current app version, it may show shortcuts, recent activity, account information, campaign tools, product totals, or connection status.",
    keywords: [
      "home tab",
      "dashboard",
      "overview",
      "main screen",
    ],
  },
  {
    id: "home-2",
    category: "Home",
    question: "How do I use the shortcuts on Home?",
    answer:
      "Tap a shortcut card to open the related ArtBoost tool. Home shortcuts are intended to help you quickly reach common actions such as adding a product, creating a post, reviewing campaigns, or connecting an account.",
    steps: [
      "Open the Home tab.",
      "Locate the shortcut for the task you want.",
      "Tap the shortcut card.",
      "Complete the requested information on the next screen.",
    ],
    keywords: [
      "home shortcut",
      "quick action",
      "card",
      "button",
    ],
  },
  {
    id: "library-1",
    category: "Library",
    question: "What is the Library tab?",
    answer:
      "The Library stores the products and artwork available for use in ArtBoost campaigns. Products may come from a connected store, a Redbubble import, a Shopify sync, a product link, or a manual upload.",
    keywords: [
      "library",
      "products",
      "artwork",
      "catalog",
    ],
  },
  {
    id: "library-2",
    category: "Library",
    question: "How do I view products from a specific store?",
    answer:
      "Open the Library and select the store or product source you want to review. ArtBoost may organize products by Shopify, Redbubble, manual uploads, or another connected source.",
    steps: [
      "Open the Library tab.",
      "Select the store or source section.",
      "Review the products shown for that source.",
      "Tap a product to view its details or create content.",
    ],
    keywords: [
      "store products",
      "shopify products",
      "redbubble products",
      "filter",
    ],
  },
  {
    id: "library-3",
    category: "Library",
    question: "How do I add a product manually?",
    answer:
      "Use the manual product or artwork upload option when a store connection is unavailable or when the product is still a work in progress.",
    steps: [
      "Open the Library or product-import tool.",
      "Choose the manual upload option.",
      "Add the product image.",
      "Enter the title, description, link, and other requested details.",
      "Save the product.",
    ],
    keywords: [
      "manual product",
      "upload",
      "work in progress",
      "add product",
    ],
  },
  {
    id: "library-4",
    category: "Library",
    question: "Why is a product missing from my Library?",
    answer:
      "A missing product may not have been imported yet, the store may need to be refreshed, the product may be outside the current sync limit, or the connection may have expired.",
    steps: [
      "Open Connect and verify the store still shows as connected.",
      "Open the store-management screen.",
      "Refresh or sync the store.",
      "Return to the Library.",
      "Check the correct store or source section.",
    ],
    keywords: [
      "missing product",
      "not showing",
      "sync product",
      "refresh",
    ],
  },
  {
    id: "connect-1",
    category: "Connect",
    question: "What is the Connect tab?",
    answer:
      "The Connect tab is where you link ArtBoost to supported stores and social platforms. Store connections provide product information, while social connections allow ArtBoost to publish or schedule promotional content.",
    keywords: [
      "connect tab",
      "connections",
      "stores",
      "social media",
    ],
  },
  {
    id: "connect-2",
    category: "Connect",
    question: "How do I connect Shopify?",
    answer:
      "Use the Shopify connection option and enter the requested store information. ArtBoost will open the Shopify authorization process. After approval, return to ArtBoost and confirm that Shopify shows as connected.",
    steps: [
      "Open Connect.",
      "Select Stores.",
      "Choose Shopify.",
      "Enter the requested Shopify store address.",
      "Complete the Shopify authorization steps.",
      "Return to ArtBoost.",
      "Verify Shopify shows as connected.",
    ],
    keywords: [
      "shopify",
      "connect shopify",
      "store address",
      "authorization",
    ],
  },
  {
    id: "connect-3",
    category: "Connect",
    question: "How do I connect or import Redbubble products?",
    answer:
      "For a full Redbubble store scan, use your Redbubble Explore link, not the normal Shop/Store link. The Explore URL looks like https://www.redbubble.com/people/USERNAME/explore. ArtBoost's Universal Scanner uses that page to discover the designs Redbubble exposes publicly. For one product, use that product's direct Redbubble listing URL.",
    steps: [
      "Open your Redbubble profile in a browser.",
      "Open the Explore page for your shop.",
      "Copy the URL that contains /people/USERNAME/explore.",
      "In ArtBoost, open Connect > Stores > Redbubble and launch the Universal Scanner.",
      "Paste the Explore URL and choose Scan Entire Store.",
      "Wait for the full design scan and thumbnail-loading process to finish before importing.",
      "Import the selected designs, then review them in your Redbubble products.",
    ],
    keywords: [
      "redbubble",
      "redbubble explore",
      "explore link",
      "explore url",
      "shop link",
      "store link",
      "import store",
      "universal scanner",
      "scan entire store",
      "single listing",
    ],
  },
  {
    id: "connect-redbubble-2",
    category: "Connect",
    question: "Which Redbubble link should I use for a full-store scan?",
    answer:
      "Use the Redbubble Explore URL for bulk/full-store scanning. Do not use the standard /shop store URL for the full-store scanner. A typical Explore link is https://www.redbubble.com/people/USERNAME/explore.",
    steps: [
      "Open your Redbubble profile.",
      "Go to your Explore page.",
      "Confirm the address contains /people/USERNAME/explore.",
      "Copy that Explore URL into ArtBoost's Universal Scanner.",
      "Run Scan Entire Store.",
    ],
    keywords: [
      "which redbubble link",
      "redbubble url",
      "explore url",
      "explore link",
      "shop url",
      "shop link",
      "store url",
      "store link",
      "full store",
      "bulk import",
    ],
  },
  {
    id: "connect-redbubble-3",
    category: "Troubleshooting",
    question: "Why are some Redbubble designs or thumbnails missing?",
    answer:
      "Let the Universal Scanner finish both design discovery and thumbnail loading before importing. ArtBoost scans the designs Redbubble exposes through the public Explore page, so a design that is not exposed there may not appear in a bulk scan. You can add a missing design later with Single Product Import, Product URLs, or CSV import.",
    steps: [
      "Use the Redbubble Explore URL, not the normal Shop/Store URL.",
      "Run Scan Entire Store.",
      "Wait until the scanner finishes loading artwork thumbnails.",
      "Import the detected designs only after thumbnail loading finishes.",
      "If a specific design is still missing, add it with its direct listing URL or another supported import method.",
    ],
    keywords: [
      "redbubble missing design",
      "redbubble missing product",
      "redbubble thumbnail",
      "thumbnail missing",
      "image missing",
      "not all designs",
      "single product import",
      "product urls",
      "csv",
    ],
  },
  {
    id: "connect-4",
    category: "Connect",
    question: "How do I connect a social platform?",
    answer:
      "Select the social platform in the Connect tab and complete its authorization process. The platform may ask you to sign in, approve permissions, select a page, or confirm a professional account.",
    steps: [
      "Open Connect.",
      "Select Social Platforms.",
      "Choose the platform.",
      "Sign in when prompted.",
      "Approve the requested permissions.",
      "Select the correct page, business account, or board when required.",
      "Return to ArtBoost and verify the connection.",
    ],
    keywords: [
      "facebook",
      "instagram",
      "pinterest",
      "social connection",
      "connect platform",
    ],
  },
  {
    id: "connect-5",
    category: "Connect",
    question: "What does Manage Store do?",
    answer:
      "Manage Store opens the connected store's ArtBoost management screen. Depending on the store, you may be able to review imported products, refresh the connection, sync products, reconnect, or disconnect the store.",
    keywords: [
      "manage store",
      "refresh store",
      "reconnect",
      "disconnect",
    ],
  },
  {
    id: "connect-6",
    category: "Connect",
    question: "Why does my account still show as disconnected?",
    answer:
      "The authorization may not have completed, ArtBoost may not have received the final connection information, or the connection may have expired.",
    steps: [
      "Confirm the authorization process completed successfully.",
      "Return to ArtBoost.",
      "Refresh the Connect screen.",
      "Close and reopen the app if needed.",
      "Try reconnecting the account.",
      "Contact ArtBoost support if the connection still does not appear.",
    ],
    keywords: [
      "disconnected",
      "connection failed",
      "not connected",
      "oauth",
    ],
  },
  {
    id: "posting-1",
    category: "Posting",
    question: "How do I create a social-media post?",
    answer:
      "Select a product or artwork, choose a supported platform, and let ArtBoost generate the title, description, hashtags, and call to action. Review the content before posting or scheduling it.",
    steps: [
      "Open the Library.",
      "Select a product.",
      "Choose the create-post option.",
      "Select the social platform.",
      "Review the image and product link.",
      "Generate the post content.",
      "Edit the content if needed.",
      "Choose Post Now or Schedule.",
    ],
    keywords: [
      "create post",
      "social media post",
      "generate content",
      "caption",
    ],
  },
  {
    id: "posting-2",
    category: "Posting",
    question: "What does Post Now do?",
    answer:
      "Post Now attempts to immediately publish the current content to the selected connected platform. The platform must be connected, and the post must meet that platform's requirements.",
    steps: [
      "Create or open the post.",
      "Confirm the correct platform is selected.",
      "Review the title, description, image, hashtags, and call to action.",
      "Tap Post Now.",
      "Wait for the success or error message.",
      "Verify the post on the social platform.",
    ],
    keywords: [
      "post now",
      "publish now",
      "immediate post",
    ],
  },
  {
    id: "posting-3",
    category: "Posting",
    question: "Why is the product link not shown on Instagram?",
    answer:
      "Instagram captions do not normally provide clickable product links in the same way as Facebook or Pinterest. ArtBoost may use a call to action such as 'Tap the link in bio' instead.",
    keywords: [
      "instagram link",
      "link in bio",
      "clickable link",
    ],
  },
  {
    id: "posting-4",
    category: "Posting",
    question: "Can I edit AI-generated content?",
    answer:
      "Yes. Review and edit the generated title, description, hashtags, and call to action before posting or scheduling. The AI-generated content is intended to be a starting point.",
    keywords: [
      "edit caption",
      "edit ai content",
      "change description",
      "hashtags",
    ],
  },
  {
    id: "posting-5",
    category: "Posting",
    question: "Why did a post fail?",
    answer:
      "A post may fail because the platform connection expired, a required image or page was missing, the selected platform rejected the content, or the platform's API was unavailable.",
    steps: [
      "Read the error message shown by ArtBoost.",
      "Verify the platform still shows as connected.",
      "Confirm the post includes all required information.",
      "Confirm the correct page, account, or board is selected.",
      "Try the post again.",
      "Reconnect the platform if the failure continues.",
    ],
    keywords: [
      "post failed",
      "publish error",
      "not posted",
      "error",
    ],
  },
  {
    id: "scheduling-1",
    category: "Scheduling",
    question: "How do I schedule a post?",
    answer:
      "Create the post, select a future date and time, choose the platform, and save the scheduled post. ArtBoost will attempt to publish it at the selected time.",
    steps: [
      "Create or open a post.",
      "Choose Schedule instead of Post Now.",
      "Select the platform.",
      "Choose the date.",
      "Choose the time.",
      "Review the post content.",
      "Save the scheduled post.",
    ],
    keywords: [
      "schedule post",
      "future post",
      "date and time",
    ],
  },
  {
    id: "scheduling-2",
    category: "Scheduling",
    question: "Where can I view scheduled posts?",
    answer:
      "Open the Schedule tool from More Tools. Scheduled posts should be listed with their platform, content, date, time, and current status.",
    steps: [
      "Tap More.",
      "Select Schedule.",
      "Review the scheduled-post list.",
      "Tap a scheduled post for additional details when available.",
    ],
    keywords: [
      "scheduled posts",
      "schedule list",
      "view schedule",
    ],
  },
  {
    id: "scheduling-3",
    category: "Scheduling",
    question: "What time zone does ArtBoost use?",
    answer:
      "ArtBoost should use the time zone saved for the account or automation. Always confirm the displayed date and time before saving a scheduled post.",
    keywords: [
      "time zone",
      "schedule time",
      "central time",
    ],
  },
  {
    id: "scheduling-4",
    category: "Scheduling",
    question: "Why did my scheduled post not publish?",
    answer:
      "The social connection may have expired, the platform may have rejected the content, the scheduler may not have had the required account information, or the platform may have been temporarily unavailable.",
    steps: [
      "Open Schedule or Campaign History.",
      "Review the post status and error details.",
      "Verify the platform connection.",
      "Confirm the selected account, page, or board is still available.",
      "Correct the issue.",
      "Reschedule or publish the post manually.",
    ],
    keywords: [
      "scheduled post failed",
      "did not publish",
      "scheduler error",
    ],
  },
  {
    id: "automations-1",
    category: "Automations",
    question: "What is an ArtBoost automation?",
    answer:
      "An automation repeatedly selects eligible products and creates posts based on the schedule, platforms, product-selection method, and repeat rules chosen by the user.",
    keywords: [
      "automation",
      "automatic posts",
      "recurring posts",
    ],
  },
  {
    id: "automations-2",
    category: "Automations",
    question: "How do I create an automation?",
    answer:
      "Choose the products or store source, select the platforms, set the posting schedule, choose how products should be selected, and save the automation.",
    steps: [
      "Open the automation tool.",
      "Select a store, collection, or product source.",
      "Choose one or more connected platforms.",
      "Select daily, weekly, monthly, weekdays, or one-time scheduling.",
      "Choose the posting time.",
      "Choose the product-selection method.",
      "Set the repeat-delay rule if available.",
      "Save the automation.",
    ],
    keywords: [
      "create automation",
      "automatic posting",
      "daily posting",
      "weekly posting",
    ],
  },
  {
    id: "automations-3",
    category: "Automations",
    question: "What do the product-selection options mean?",
    answer:
      "Random selects an eligible product randomly. Never Posted First prioritizes products that have not been posted. Least Recently Posted prioritizes products that have gone the longest without being promoted.",
    steps: [
      "Use Random when variety is the main priority.",
      "Use Never Posted First when launching or promoting a new catalog.",
      "Use Least Recently Posted when you want balanced rotation across existing products.",
    ],
    keywords: [
      "random",
      "never posted first",
      "least recently posted",
      "selection mode",
    ],
  },
  {
    id: "automations-4",
    category: "Automations",
    question: "What does repeat delay mean?",
    answer:
      "Repeat delay controls how many days must pass before the same product becomes eligible to be selected again by the automation.",
    keywords: [
      "repeat delay",
      "repeat product",
      "30 days",
    ],
  },
  {
    id: "automations-5",
    category: "Automations",
    question: "What does Run Now do?",
    answer:
      "Run Now manually starts the saved automation immediately. It is useful for testing the automation without waiting for the next scheduled time.",
    steps: [
      "Save the automation.",
      "Open the saved automation.",
      "Tap Run Now.",
      "Review the result.",
      "Verify the post on each selected platform.",
    ],
    keywords: [
      "run now",
      "test automation",
      "manual automation",
    ],
  },
  {
    id: "campaigns-1",
    category: "Campaigns",
    question: "What is Campaign Manager?",
    answer:
      "Campaign Manager helps organize a coordinated promotion using selected products, generated content, platforms, campaign dates, and campaign goals.",
    keywords: [
      "campaign manager",
      "campaign",
      "promotion",
    ],
  },
  {
    id: "campaigns-2",
    category: "Campaigns",
    question: "How do I create a campaign?",
    answer:
      "Open Campaign Manager, enter the campaign information, select products and platforms, generate or review the content, and save or launch the campaign.",
    steps: [
      "Tap More.",
      "Open Campaign Manager.",
      "Enter the campaign name and goal.",
      "Select the product or artwork.",
      "Select the connected platforms.",
      "Add or generate the campaign image and content.",
      "Review the campaign settings.",
      "Save, schedule, or launch the campaign.",
    ],
    keywords: [
      "create campaign",
      "campaign setup",
      "launch campaign",
    ],
  },
  {
    id: "campaigns-3",
    category: "Campaigns",
    question: "What are Saved Campaigns?",
    answer:
      "Saved Campaigns contains campaigns that were created and stored for later review, editing, scheduling, or reuse.",
    steps: [
      "Tap More.",
      "Select Saved Campaigns.",
      "Choose the campaign you want to review.",
      "Edit, schedule, duplicate, or launch it when those options are available.",
    ],
    keywords: [
      "saved campaign",
      "campaign draft",
      "reuse campaign",
    ],
  },
  {
    id: "campaigns-4",
    category: "Campaigns",
    question: "What is Campaign History?",
    answer:
      "Campaign History shows completed or attempted campaign activity. It can help you verify what was published and identify failed posts.",
    steps: [
      "Tap More.",
      "Select Campaign History.",
      "Review the campaign status.",
      "Open an entry to inspect platform results or errors when available.",
    ],
    keywords: [
      "campaign history",
      "past campaign",
      "completed campaign",
    ],
  },
  {
    id: "analytics-1",
    category: "Analytics",
    question: "What does the Analytics tool show?",
    answer:
      "Analytics is intended to summarize ArtBoost activity and available platform or campaign performance. The exact data shown depends on connected accounts and the information those platforms make available.",
    keywords: [
      "analytics",
      "performance",
      "results",
      "data",
    ],
  },
  {
    id: "analytics-2",
    category: "Analytics",
    question: "Why is some analytics data missing?",
    answer:
      "A platform may not provide that data, the account may need to be reconnected, the campaign may be too recent, or ArtBoost may not yet support that metric.",
    steps: [
      "Verify the platform is connected.",
      "Confirm the post or campaign was published successfully.",
      "Allow time for the platform to process engagement data.",
      "Refresh the Analytics screen.",
      "Reconnect the platform if the data remains unavailable.",
    ],
    keywords: [
      "missing analytics",
      "no data",
      "metrics",
      "engagement",
    ],
  },
  {
    id: "analytics-3",
    category: "Analytics",
    question: "How should I use analytics?",
    answer:
      "Use analytics to compare products, platforms, posting times, and campaign types. Look for patterns rather than relying on a single post.",
    steps: [
      "Compare multiple posts over time.",
      "Identify products receiving the most engagement.",
      "Compare results across platforms.",
      "Review which posting times perform best.",
      "Use the results to adjust future campaigns and automations.",
    ],
    keywords: [
      "use analytics",
      "improve sales",
      "engagement",
      "performance",
    ],
  },
  {
    id: "customer-service-1",
    category: "Customer Service",
    question: "What does AI Customer Service do?",
    answer:
      "AI Customer Service helps the ArtBoost user organize customer messages and draft replies. It can help identify the type of question, suggest a professional response, and direct customers to the appropriate connected store or fulfillment provider.",
    keywords: [
      "ai customer service",
      "customer messages",
      "draft reply",
    ],
  },
  {
    id: "customer-service-2",
    category: "Customer Service",
    question: "Can ArtBoost approve refunds or returns?",
    answer:
      "No. ArtBoost should not independently approve refunds, returns, cancellations, replacements, chargebacks, or financial promises. Those decisions must follow the connected store or fulfillment provider's policies and authorization process.",
    keywords: [
      "refund",
      "return",
      "cancel order",
      "replacement",
      "chargeback",
    ],
  },
  {
    id: "customer-service-3",
    category: "Customer Service",
    question: "Who handles customer order problems?",
    answer:
      "Questions involving a specific order, shipment, delivery delay, damaged product, return, refund, payment, or store policy should be handled through the store or fulfillment provider responsible for that order.",
    steps: [
      "Identify which store processed the order.",
      "Locate the order inside that store's management system.",
      "Review the store or fulfillment provider's policy.",
      "Use ArtBoost to help draft a response if needed.",
      "Complete any refund, replacement, or return directly through the store.",
    ],
    keywords: [
      "order problem",
      "shipping problem",
      "damaged item",
      "store support",
    ],
  },
  {
    id: "customer-service-4",
    category: "Customer Service",
    question: "What are the AI Customer Service response modes?",
    answer:
      "Draft Only creates a suggested reply for the seller to send. Require Approval prepares replies but requires seller approval. Auto-Reply is intended for approved routine questions, while sensitive issues should still be escalated.",
    steps: [
      "Use Draft Only for maximum control.",
      "Use Require Approval when you want AI assistance but still want to approve messages.",
      "Use Auto-Reply only after the supported channels, policies, and safety controls are fully configured.",
    ],
    keywords: [
      "draft only",
      "require approval",
      "auto reply",
      "response mode",
    ],
  },
  {
    id: "account-1",
    category: "Account",
    question: "Where do I manage my subscription?",
    answer:
      "Open the Studio or Subscription section to review the current ArtBoost plan and available features.",
    steps: [
      "Open the Studio tab or tap More.",
      "Select Subscription if shown.",
      "Review the current plan.",
      "Choose an available upgrade or management option.",
    ],
    keywords: [
      "subscription",
      "plan",
      "upgrade",
      "billing",
    ],
  },
  {
    id: "account-2",
    category: "Account",
    question: "What is the Brand Kit?",
    answer:
      "The Brand Kit stores business information that can help ArtBoost create more consistent content. This may include a business name, description, preferred tone, colors, logos, and other branding details.",
    steps: [
      "Tap More.",
      "Select Brand Kit.",
      "Enter or update the requested brand information.",
      "Save the changes.",
      "Use the saved brand information when generating future content.",
    ],
    keywords: [
      "brand kit",
      "logo",
      "brand voice",
      "business information",
    ],
  },
  {
    id: "account-3",
    category: "Account",
    question: "What are Notifications?",
    answer:
      "Notifications provide ArtBoost account updates, posting results, connection alerts, campaign information, and other app activity.",
    steps: [
      "Tap More.",
      "Select Notifications.",
      "Review unread notifications.",
      "Open a notification for more information.",
      "Delete or clear notifications when those options are available.",
    ],
    keywords: [
      "notifications",
      "alerts",
      "unread",
      "updates",
    ],
  },
  {
    id: "account-4",
    category: "Account",
    question: "What is Platform Status?",
    answer:
      "Platform Status helps you review the current connection state of supported social platforms. Use it when a post fails or when you need to verify an account is still connected.",
    steps: [
      "Tap More.",
      "Select Platform Status.",
      "Review each social connection.",
      "Reconnect any platform that shows an error or disconnected status.",
    ],
    keywords: [
      "platform status",
      "connection status",
      "social status",
    ],
  },
  {
    id: "troubleshooting-1",
    category: "Troubleshooting",
    question: "What should I do if a button does not work?",
    answer:
      "First make sure the screen has fully loaded. Then try the action again, return to the previous screen, or restart the app. If the problem continues, record the screen name and the exact action that failed.",
    steps: [
      "Wait briefly for the screen to finish loading.",
      "Tap the button again once.",
      "Return to the previous screen and reopen the tool.",
      "Close and reopen ArtBoost.",
      "Take a screenshot of the problem.",
      "Record the screen name and what happened.",
      "Report the issue to ArtBoost support.",
    ],
    keywords: [
      "button not working",
      "nothing happens",
      "frozen",
      "bug",
    ],
  },
  {
    id: "troubleshooting-2",
    category: "Troubleshooting",
    question: "What should I do if a screen is blank?",
    answer:
      "A blank screen may be caused by missing data, a loading failure, an expired connection, or an app error.",
    steps: [
      "Return to the previous screen.",
      "Verify the required store or platform is connected.",
      "Refresh or reopen the tool.",
      "Restart the app.",
      "Take a screenshot if the screen remains blank.",
      "Report the affected screen to ArtBoost support.",
    ],
    keywords: [
      "blank screen",
      "empty screen",
      "not loading",
      "white screen",
    ],
  },
  {
    id: "troubleshooting-3",
    category: "Troubleshooting",
    question: "Why is an image not showing?",
    answer:
      "The image URL may be unavailable, the product may not include a usable image, the upload may not have completed, or the external store may block the image from loading.",
    steps: [
      "Open the original product listing and verify the image is available.",
      "Return to ArtBoost and refresh the product.",
      "Try importing or uploading the image again.",
      "Use a different image if the original image cannot be loaded.",
    ],
    keywords: [
      "image not showing",
      "blank image",
      "missing photo",
      "preview",
    ],
  },
  {
    id: "troubleshooting-4",
    category: "Troubleshooting",
    question: "Why does a connection keep expiring?",
    answer:
      "Social platforms and stores may expire access tokens, revoke permissions, or require new authorization after account or security changes.",
    steps: [
      "Open Connect.",
      "Select the affected account.",
      "Choose Reconnect.",
      "Sign in to the correct account.",
      "Approve the requested permissions.",
      "Return to ArtBoost and verify the connection.",
    ],
    keywords: [
      "connection expired",
      "token expired",
      "reconnect",
      "permissions",
    ],
  },
  {
    id: "troubleshooting-5",
    category: "Troubleshooting",
    question: "How do I report an ArtBoost problem?",
    answer:
      "Provide the screen name, the action you attempted, what you expected to happen, what actually happened, and any error message or screenshot.",
    steps: [
      "Write down the name of the screen.",
      "Describe the button or action used.",
      "Describe the expected result.",
      "Describe the actual result.",
      "Copy the exact error message when available.",
      "Attach a screenshot.",
      "Include whether the issue occurred on iPhone, Android, or web.",
    ],
    keywords: [
      "report problem",
      "support",
      "bug report",
      "error message",
    ],
  },
];

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function getCategoryIcon(
  category: FAQCategory
): keyof typeof Ionicons.glyphMap {
  switch (category) {
    case "Getting Started":
      return "rocket-outline";
    case "Home":
      return "home-outline";
    case "Library":
      return "images-outline";
    case "Connect":
      return "link-outline";
    case "Posting":
      return "paper-plane-outline";
    case "Scheduling":
      return "calendar-outline";
    case "Automations":
      return "repeat-outline";
    case "Campaigns":
      return "megaphone-outline";
    case "Analytics":
      return "bar-chart-outline";
    case "Customer Service":
      return "headset-outline";
    case "Account":
      return "person-circle-outline";
    case "Troubleshooting":
      return "build-outline";
    default:
      return "help-circle-outline";
  }
}

export default function FAQScreen() {
  const [searchText, setSearchText] =
    useState("");

  const [selectedCategory, setSelectedCategory] =
    useState<FAQCategory | "All">("All");

  const [expandedId, setExpandedId] =
    useState<string | null>(
      "getting-started-2"
    );

  if (
    Platform.OS === "android" &&
    UIManager.setLayoutAnimationEnabledExperimental
  ) {
    UIManager.setLayoutAnimationEnabledExperimental(
      true
    );
  }

  const filteredItems = useMemo(() => {
    const normalizedSearch =
      normalizeSearch(searchText);

    return faqItems.filter(item => {
      const categoryMatches =
        selectedCategory === "All" ||
        item.category === selectedCategory;

      if (!categoryMatches) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        item.category,
        item.question,
        item.answer,
        ...(item.steps || []),
        ...(item.keywords || []),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        normalizedSearch
      );
    });
  }, [searchText, selectedCategory]);

  const groupedItems = useMemo(() => {
    return categories
      .filter(
        (
          category
        ): category is FAQCategory =>
          category !== "All"
      )
      .map(category => ({
        category,
        items: filteredItems.filter(
          item => item.category === category
        ),
      }))
      .filter(group => group.items.length > 0);
  }, [filteredItems]);

  function toggleFAQ(id: string) {
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );

    setExpandedId(current =>
      current === id ? null : id
    );
  }

  function selectCategory(
    category: FAQCategory | "All"
  ) {
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );

    setSelectedCategory(category);
    setExpandedId(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
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
          <Text style={styles.headerTitle}>
            Help & FAQ
          </Text>

          <Text style={styles.headerSubtitle}>
            Learn how to use ArtBoost AI
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="help-circle"
            size={25}
            color="#ffffff"
          />
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.contentContainer
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="book-outline"
              size={30}
              color="#ffffff"
            />
          </View>

          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>
              ArtBoost AI Help Center
            </Text>

            <Text style={styles.heroDescription}>
              Find step-by-step instructions for
              connecting accounts, importing products,
              creating posts, scheduling content, running
              automations, and using every major ArtBoost
              tool.
            </Text>
          </View>
        </View>

        <View style={styles.noticeCard}>
          <Ionicons
            name="information-circle"
            size={25}
            color="#a78bfa"
          />

          <View style={styles.noticeTextWrap}>
            <Text style={styles.noticeTitle}>
              ArtBoost Help Only
            </Text>

            <Text style={styles.noticeDescription}>
              This help center explains how to use
              ArtBoost AI. Questions involving customer
              orders, shipping, returns, refunds, damaged
              products, payments, or store policies must
              be handled through the connected store or
              fulfillment provider.
            </Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons
            name="search"
            size={21}
            color="#85858c"
          />

          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search ArtBoost help"
            placeholderTextColor="#707077"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {searchText ? (
            <Pressable
              style={styles.clearSearchButton}
              onPress={() => setSearchText("")}
            >
              <Ionicons
                name="close-circle"
                size={21}
                color="#77777d"
              />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={
            styles.categoryContainer
          }
        >
          {categories.map(category => {
            const selected =
              selectedCategory === category;

            return (
              <Pressable
                key={category}
                style={[
                  styles.categoryButton,
                  selected &&
                    styles.categoryButtonSelected,
                ]}
                onPress={() =>
                  selectCategory(category)
                }
              >
                {category !== "All" ? (
                  <Ionicons
                    name={getCategoryIcon(category)}
                    size={15}
                    color={
                      selected
                        ? "#ffffff"
                        : "#aaa0b5"
                    }
                  />
                ) : (
                  <Ionicons
                    name="apps-outline"
                    size={15}
                    color={
                      selected
                        ? "#ffffff"
                        : "#aaa0b5"
                    }
                  />
                )}

                <Text
                  style={[
                    styles.categoryButtonText,
                    selected &&
                      styles.categoryButtonTextSelected,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.resultRow}>
          <View>
            <Text style={styles.resultTitle}>
              {selectedCategory === "All"
                ? "All Help Topics"
                : selectedCategory}
            </Text>

            <Text style={styles.resultSubtitle}>
              {filteredItems.length}{" "}
              {filteredItems.length === 1
                ? "answer"
                : "answers"}
            </Text>
          </View>

          {selectedCategory !== "All" ||
          searchText ? (
            <Pressable
              style={styles.resetButton}
              onPress={() => {
                setSelectedCategory("All");
                setSearchText("");
                setExpandedId(null);
              }}
            >
              <Text style={styles.resetButtonText}>
                Reset
              </Text>
            </Pressable>
          ) : null}
        </View>

        {filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="search-outline"
              size={45}
              color="#766981"
            />

            <Text style={styles.emptyTitle}>
              No Help Topic Found
            </Text>

            <Text style={styles.emptyDescription}>
              Try a different search term or select
              another category.
            </Text>

            <Pressable
              style={styles.emptyButton}
              onPress={() => {
                setSearchText("");
                setSelectedCategory("All");
              }}
            >
              <Text style={styles.emptyButtonText}>
                Show All Help
              </Text>
            </Pressable>
          </View>
        ) : (
          groupedItems.map(group => (
            <View
              key={group.category}
              style={styles.groupSection}
            >
              <View style={styles.groupHeader}>
                <View style={styles.groupIcon}>
                  <Ionicons
                    name={getCategoryIcon(
                      group.category
                    )}
                    size={21}
                    color="#d8b4fe"
                  />
                </View>

                <View style={styles.groupHeaderText}>
                  <Text style={styles.groupTitle}>
                    {group.category}
                  </Text>

                  <Text
                    style={styles.groupDescription}
                  >
                    {group.items.length}{" "}
                    {group.items.length === 1
                      ? "topic"
                      : "topics"}
                  </Text>
                </View>
              </View>

              <View style={styles.faqList}>
                {group.items.map(item => {
                  const expanded =
                    expandedId === item.id;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.faqCard,
                        expanded &&
                          styles.faqCardExpanded,
                      ]}
                    >
                      <Pressable
                        style={styles.questionButton}
                        onPress={() =>
                          toggleFAQ(item.id)
                        }
                      >
                        <View
                          style={
                            styles.questionTextWrap
                          }
                        >
                          <Text
                            style={styles.questionText}
                          >
                            {item.question}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.expandIcon,
                            expanded &&
                              styles.expandIconActive,
                          ]}
                        >
                          <Ionicons
                            name={
                              expanded
                                ? "remove"
                                : "add"
                            }
                            size={20}
                            color={
                              expanded
                                ? "#ffffff"
                                : "#b8a9c5"
                            }
                          />
                        </View>
                      </Pressable>

                      {expanded ? (
                        <View
                          style={styles.answerSection}
                        >
                          <View
                            style={styles.answerDivider}
                          />

                          <Text
                            style={styles.answerText}
                          >
                            {item.answer}
                          </Text>

                          {item.steps &&
                          item.steps.length > 0 ? (
                            <View
                              style={styles.stepsSection}
                            >
                              <Text
                                style={styles.stepsTitle}
                              >
                                Step-by-step
                              </Text>

                              {item.steps.map(
                                (step, index) => (
                                  <View
                                    key={`${item.id}-${index}`}
                                    style={
                                      styles.stepRow
                                    }
                                  >
                                    <View
                                      style={
                                        styles.stepNumber
                                      }
                                    >
                                      <Text
                                        style={
                                          styles.stepNumberText
                                        }
                                      >
                                        {index + 1}
                                      </Text>
                                    </View>

                                    <Text
                                      style={
                                        styles.stepText
                                      }
                                    >
                                      {step}
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        <View style={styles.supportCard}>
          <View style={styles.supportIcon}>
            <Ionicons
              name="bug-outline"
              size={26}
              color="#ffffff"
            />
          </View>

          <View style={styles.supportTextWrap}>
            <Text style={styles.supportTitle}>
              Still Having an ArtBoost Problem?
            </Text>

            <Text style={styles.supportDescription}>
              When reporting an issue, include the screen
              name, what you tapped, what you expected,
              what happened instead, and a screenshot of
              any error.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0c0d",
  },

  header: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    backgroundColor: "#111112",
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

  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#8f8f96",
    fontSize: 12,
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

  container: {
    flex: 1,
  },

  contentContainer: {
    padding: 18,
    paddingBottom: 60,
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
    fontWeight: "900",
  },

  heroDescription: {
    color: "#b8b2c0",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },

  noticeCard: {
    backgroundColor: "#17131d",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3b2750",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
  },

  noticeTextWrap: {
    flex: 1,
    marginLeft: 12,
  },

  noticeTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  noticeDescription: {
    color: "#aaa1b0",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  searchBox: {
    backgroundColor: "#171719",
    borderRadius: 16,
    minHeight: 52,
    marginTop: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },

  clearSearchButton: {
    padding: 4,
  },

  categoryContainer: {
    gap: 8,
    paddingVertical: 15,
  },

  categoryButton: {
    backgroundColor: "#1b1b1e",
    borderRadius: 99,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#303034",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  categoryButtonSelected: {
    backgroundColor: "#7c3aed",
    borderColor: "#7c3aed",
  },

  categoryButtonText: {
    color: "#aaa0b5",
    fontSize: 12,
    fontWeight: "800",
  },

  categoryButtonTextSelected: {
    color: "#ffffff",
  },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  resultTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  resultSubtitle: {
    color: "#85858c",
    fontSize: 12,
    marginTop: 3,
  },

  resetButton: {
    marginLeft: "auto",
    backgroundColor: "#26212d",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  resetButtonText: {
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "900",
  },

  groupSection: {
    marginBottom: 24,
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },

  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  groupHeaderText: {
    flex: 1,
  },

  groupTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },

  groupDescription: {
    color: "#85858c",
    fontSize: 11,
    marginTop: 2,
  },

  faqList: {
    gap: 10,
  },

  faqCard: {
    backgroundColor: "#171719",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    overflow: "hidden",
  },

  faqCardExpanded: {
    borderColor: "#60407f",
    backgroundColor: "#19151e",
  },

  questionButton: {
    minHeight: 66,
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  questionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },

  questionText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },

  expandIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#252529",
    alignItems: "center",
    justifyContent: "center",
  },

  expandIconActive: {
    backgroundColor: "#7c3aed",
  },

  answerSection: {
    paddingHorizontal: 15,
    paddingBottom: 16,
  },

  answerDivider: {
    height: 1,
    backgroundColor: "#332b39",
    marginBottom: 14,
  },

  answerText: {
    color: "#aaa5ad",
    fontSize: 13,
    lineHeight: 20,
  },

  stepsSection: {
    marginTop: 17,
  },

  stepsTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 11,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 11,
  },

  stepNumber: {
    width: 27,
    height: 27,
    borderRadius: 99,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },

  stepNumberText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },

  stepText: {
    flex: 1,
    color: "#c4c0c7",
    fontSize: 12,
    lineHeight: 19,
  },

  emptyCard: {
    backgroundColor: "#171719",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2b2b2f",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
  },

  emptyDescription: {
    color: "#8f8f96",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },

  emptyButton: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 11,
    marginTop: 16,
  },

  emptyButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  supportCard: {
    backgroundColor: "#18131f",
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: "#3a2750",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
  },

  supportIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  supportTextWrap: {
    flex: 1,
  },

  supportTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  supportDescription: {
    color: "#aaa1b0",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});