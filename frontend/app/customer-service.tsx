import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type SupportMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  steps?: string[];
};

type HelpAnswer = {
  text: string;
  steps?: string[];
};

const popularQuestions = [
  "How do I connect Redbubble?",
  "How do I import my artwork?",
  "How do automations work?",
  "Why didn't my post publish?",
  "How do I schedule a post?",
  "What should I do first?",
];

function normalizeQuestion(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function includesAny(
  question: string,
  terms: string[]
) {
  return terms.some(term =>
    question.includes(term)
  );
}

function getArtBoostAnswer(
  questionValue: string
): HelpAnswer {
  const question =
    normalizeQuestion(questionValue);

  if (!question) {
    return {
      text: "Enter a question about using ArtBoost AI.",
    };
  }

  if (
    includesAny(question, [
      "what should i do first",
      "how do i start",
      "getting started",
      "new to artboost",
      "brand new",
      "begin",
    ])
  ) {
    return {
      text:
        "The fastest way to get started is to connect your artwork source, connect your social platforms, generate your first post, and then create an automation.",
      steps: [
        "Open the Connect tab.",
        "Connect a supported store or import your artwork.",
        "Connect the social platforms where you want to promote your artwork.",
        "Open the Library and select a product or design.",
        "Generate your marketing content.",
        "Choose Post Now, Schedule, or create an automation.",
      ],
    };
  }

  if (
    includesAny(question, [
      "connect redbubble",
      "redbubble store",
      "import redbubble",
      "redbubble collection",
      "redbubble listing",
    ])
  ) {
    return {
      text:
        "ArtBoost can import a Redbubble storefront, collection, or individual listing using the appropriate Redbubble link.",
      steps: [
        "Open the Connect tab.",
        "Select Stores.",
        "Choose Redbubble.",
        "Select Import Store, Import Collection, or Import Single Listing.",
        "Paste the correct Redbubble link.",
        "Start the import.",
        "Open the Library to review the imported artwork.",
      ],
    };
  }

  if (
    includesAny(question, [
      "connect shopify",
      "shopify store",
      "shopify connection",
    ])
  ) {
    return {
      text:
        "Connect Shopify through the Stores section and complete the Shopify authorization process.",
      steps: [
        "Open Connect.",
        "Select Stores.",
        "Choose Shopify.",
        "Enter your Shopify store address.",
        "Complete the Shopify authorization steps.",
        "Return to ArtBoost.",
        "Confirm Shopify shows as connected.",
      ],
    };
  }

  if (
    includesAny(question, [
      "import my artwork",
      "add artwork",
      "upload artwork",
      "import product",
      "add product",
      "manual upload",
    ])
  ) {
    return {
      text:
        "You can import artwork from a supported store or add it manually when a store connection is unavailable.",
      steps: [
        "Open the Library or product-import tool.",
        "Choose a connected store import or manual upload.",
        "Add the artwork image.",
        "Enter the title, description, and product link when requested.",
        "Save the artwork.",
        "Open it from the Library to generate marketing content.",
      ],
    };
  }

  if (
    includesAny(question, [
      "connect facebook",
      "facebook page",
      "facebook connection",
    ])
  ) {
    return {
      text:
        "Facebook must be connected through the Social Platforms section. You may also need to select the correct Facebook Page.",
      steps: [
        "Open Connect.",
        "Select Social Platforms.",
        "Choose Facebook.",
        "Sign in to the correct Facebook account.",
        "Approve the requested permissions.",
        "Select the Page you want ArtBoost to use.",
        "Return to ArtBoost and verify the connection.",
      ],
    };
  }

  if (
    includesAny(question, [
      "connect instagram",
      "instagram connection",
      "instagram business",
    ])
  ) {
    return {
      text:
        "Instagram should be connected through a supported professional account linked to the required Meta account.",
      steps: [
        "Open Connect.",
        "Select Social Platforms.",
        "Choose Instagram.",
        "Sign in when prompted.",
        "Approve the required permissions.",
        "Select the correct Instagram professional account.",
        "Return to ArtBoost and verify the connection.",
      ],
    };
  }

  if (
    includesAny(question, [
      "connect pinterest",
      "pinterest connection",
      "pinterest board",
    ])
  ) {
    return {
      text:
        "Connect Pinterest through Social Platforms and make sure the correct board is selected before publishing.",
      steps: [
        "Open Connect.",
        "Select Social Platforms.",
        "Choose Pinterest.",
        "Complete the authorization process.",
        "Select or confirm the Pinterest board.",
        "Create a post and verify the board before publishing.",
      ],
    };
  }

  if (
    includesAny(question, [
      "how do automations work",
      "what is automation",
      "automatic posting",
      "automations",
    ])
  ) {
    return {
      text:
        "Automations repeatedly select eligible artwork and create promotional posts using the schedule, platforms, and product-selection rules you choose.",
      steps: [
        "Open the automation tool.",
        "Select the artwork source, store, or collection.",
        "Choose the connected social platforms.",
        "Choose daily, weekly, monthly, weekdays, or one-time scheduling.",
        "Choose the posting time.",
        "Select Random, Never Posted First, or Least Recently Posted.",
        "Set the repeat-delay period if available.",
        "Save the automation.",
      ],
    };
  }

  if (
    includesAny(question, [
      "random",
      "never posted first",
      "least recently posted",
      "selection mode",
    ])
  ) {
    return {
      text:
        "Random chooses any eligible artwork. Never Posted First prioritizes artwork that has not been promoted yet. Least Recently Posted prioritizes artwork that has gone the longest without being promoted.",
    };
  }

  if (
    includesAny(question, [
      "repeat delay",
      "repeat product",
      "repeat artwork",
    ])
  ) {
    return {
      text:
        "Repeat Delay controls how many days must pass before the same artwork can be selected again by an automation.",
    };
  }

  if (
    includesAny(question, [
      "run now",
      "test automation",
    ])
  ) {
    return {
      text:
        "Run Now immediately starts a saved automation so you can test it without waiting for the next scheduled time.",
      steps: [
        "Save the automation.",
        "Open the saved automation.",
        "Tap Run Now.",
        "Review the result shown by ArtBoost.",
        "Verify the post on each selected platform.",
      ],
    };
  }

  if (
    includesAny(question, [
      "schedule a post",
      "how do i schedule",
      "scheduled post",
      "post later",
    ])
  ) {
    return {
      text:
        "Create the post, choose Schedule, select the date and time, and save it.",
      steps: [
        "Select artwork from the Library.",
        "Generate the marketing content.",
        "Choose the social platform.",
        "Select Schedule instead of Post Now.",
        "Choose the date and time.",
        "Review the content.",
        "Save the scheduled post.",
      ],
    };
  }

  if (
    includesAny(question, [
      "why didn t my post publish",
      "post failed",
      "did not publish",
      "not posting",
      "publish error",
      "post error",
    ])
  ) {
    return {
      text:
        "A post can fail when a platform connection expires, required information is missing, the wrong account or board is selected, or the social platform rejects the post.",
      steps: [
        "Read the error message shown by ArtBoost.",
        "Open Connect and confirm the platform still shows as connected.",
        "Confirm the correct page, account, or board is selected.",
        "Verify the post includes a valid image and required content.",
        "Try publishing again.",
        "Reconnect the platform if the problem continues.",
      ],
    };
  }

  if (
    includesAny(question, [
      "post now",
      "publish now",
    ])
  ) {
    return {
      text:
        "Post Now attempts to immediately publish the current marketing content to the selected connected platform.",
      steps: [
        "Select your artwork.",
        "Generate or review the content.",
        "Choose the connected platform.",
        "Confirm the image, text, and product link.",
        "Tap Post Now.",
        "Verify the result on the social platform.",
      ],
    };
  }

  if (
    includesAny(question, [
      "instagram link",
      "link in bio",
      "clickable instagram link",
    ])
  ) {
    return {
      text:
        "Instagram captions generally do not provide clickable product links. ArtBoost may use a call to action such as “Tap the link in bio” instead.",
    };
  }

  if (
    includesAny(question, [
      "campaign manager",
      "create campaign",
      "campaign",
    ])
  ) {
    return {
      text:
        "Campaign Manager helps organize a coordinated promotion using selected artwork, generated content, platforms, dates, and campaign goals.",
      steps: [
        "Tap More.",
        "Open Campaign Manager.",
        "Enter the campaign name and goal.",
        "Select the artwork.",
        "Choose the connected platforms.",
        "Generate or review the campaign content.",
        "Save, schedule, or launch the campaign.",
      ],
    };
  }

  if (
    includesAny(question, [
      "analytics",
      "performance",
      "engagement",
      "results",
    ])
  ) {
    return {
      text:
        "Analytics helps you review available ArtBoost activity and campaign performance. The exact information depends on the connected platforms and the data they provide.",
      steps: [
        "Tap More.",
        "Open Analytics.",
        "Review results by artwork, platform, or campaign.",
        "Compare multiple posts over time.",
        "Use the patterns to adjust future posts and automations.",
      ],
    };
  }

  if (
    includesAny(question, [
      "subscription",
      "pricing",
      "plan",
      "upgrade",
      "billing",
    ])
  ) {
    return {
      text:
        "Open the Studio or Subscription section to review your current ArtBoost plan and the features included with each available tier.",
      steps: [
        "Open the Studio tab or tap More.",
        "Select Subscription.",
        "Review your current plan.",
        "Compare the available features.",
        "Choose the appropriate plan-management option.",
      ],
    };
  }

  if (
    includesAny(question, [
      "image not showing",
      "blank image",
      "missing image",
      "image preview",
      "photo not showing",
    ])
  ) {
    return {
      text:
        "The image may not have imported correctly, the external image link may be unavailable, or the product may not contain a usable image.",
      steps: [
        "Open the original product listing and verify the image works.",
        "Return to ArtBoost.",
        "Refresh or reimport the artwork.",
        "Try uploading the image manually.",
        "Report the issue if the image remains blank.",
      ],
    };
  }

  if (
    includesAny(question, [
      "button not working",
      "nothing happens",
      "screen blank",
      "app frozen",
      "bug",
      "error",
      "troubleshoot",
    ])
  ) {
    return {
      text:
        "Try reopening the tool and confirming all required connections and information are available. If the issue continues, document exactly where it occurred.",
      steps: [
        "Wait briefly for the screen to finish loading.",
        "Return to the previous screen.",
        "Open the tool again.",
        "Verify the required store or social connection.",
        "Close and reopen ArtBoost.",
        "Take a screenshot of the problem.",
        "Record the screen name, button used, and error message.",
      ],
    };
  }

  if (
    includesAny(question, [
      "marketing my artwork",
      "market my art",
      "promote my art",
      "marketing advice",
      "best way to promote",
    ])
  ) {
    return {
      text:
        "A strong ArtBoost workflow is to organize related artwork into clear groups, generate platform-specific content, and use automations to promote the artwork consistently without repeating the same design too frequently.",
      steps: [
        "Import your artwork into the Library.",
        "Organize related artwork by store, collection, or theme.",
        "Connect the social platforms that fit your audience.",
        "Generate content for each design.",
        "Create a consistent posting schedule.",
        "Use Never Posted First when launching a new collection.",
        "Use Least Recently Posted for balanced long-term promotion.",
        "Review Analytics and adjust the schedule over time.",
      ],
    };
  }

  if (
    includesAny(question, [
      "refund",
      "return",
      "shipping order",
      "damaged product",
      "customer order",
      "store customer service",
      "tax",
      "payment dispute",
    ])
  ) {
    return {
      text:
        "ArtBoost Customer Service only provides help with using the ArtBoost app and marketing artwork through ArtBoost. Questions about external store orders, shipping, returns, refunds, taxes, payments, or product fulfillment must be handled through the applicable store or service provider.",
    };
  }

  return {
    text:
      "I can help with questions about using ArtBoost, connecting accounts, importing artwork, generating marketing content, scheduling posts, automations, campaigns, analytics, subscriptions, and troubleshooting. Try asking your question with the name of the ArtBoost feature you are using.",
    steps: [
      "Describe the ArtBoost screen or feature.",
      "Explain what you were trying to do.",
      "Include any error message you received.",
      "Ask what step you should take next.",
    ],
  };
}

export default function CustomerServiceScreen() {
  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] = useState<
    SupportMessage[]
  >([
    {
      id: "welcome",
      sender: "assistant",
      text:
        "Welcome to ArtBoost Customer Service. I can help you learn how to use ArtBoost, connect accounts, import artwork, generate marketing content, create automations, schedule posts, and troubleshoot app problems.",
    },
  ]);

  const scrollViewRef =
    useRef<ScrollView>(null);

  const hasConversation =
    messages.length > 1;

  const suggestedTopics = useMemo(
    () => [
      {
        title: "Getting Started",
        description:
          "Set up ArtBoost and create your first post.",
        icon: "rocket-outline" as const,
        question:
          "What should I do first?",
      },
      {
        title: "Connect Accounts",
        description:
          "Connect stores and social platforms.",
        icon: "link-outline" as const,
        question:
          "How do I connect my accounts?",
      },
      {
        title: "Import Artwork",
        description:
          "Add artwork from stores or manual uploads.",
        icon: "images-outline" as const,
        question:
          "How do I import my artwork?",
      },
      {
        title: "Automations",
        description:
          "Promote artwork on a repeating schedule.",
        icon: "repeat-outline" as const,
        question:
          "How do automations work?",
      },
      {
        title: "Scheduling",
        description:
          "Create posts for a future date and time.",
        icon: "calendar-outline" as const,
        question:
          "How do I schedule a post?",
      },
      {
        title: "Troubleshooting",
        description:
          "Resolve connection and posting problems.",
        icon: "build-outline" as const,
        question:
          "Why didn't my post publish?",
      },
    ],
    []
  );

  function submitQuestion(
    selectedQuestion?: string
  ) {
    const finalQuestion = String(
      selectedQuestion || question
    ).trim();

    if (!finalQuestion) {
      return;
    }

    const answer =
      getArtBoostAnswer(finalQuestion);

    const timestamp = Date.now();

    const userMessage: SupportMessage = {
      id: `user-${timestamp}`,
      sender: "user",
      text: finalQuestion,
    };

    const assistantMessage: SupportMessage = {
      id: `assistant-${timestamp}`,
      sender: "assistant",
      text: answer.text,
      steps: answer.steps,
    };

    setMessages(current => [
      ...current,
      userMessage,
      assistantMessage,
    ]);

    setQuestion("");

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({
        animated: true,
      });
    }, 100);
  }

  function clearConversation() {
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text:
          "Welcome to ArtBoost Customer Service. I can help you learn how to use ArtBoost, connect accounts, import artwork, generate marketing content, create automations, schedule posts, and troubleshoot app problems.",
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
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
              Customer Service
            </Text>

            <Text style={styles.headerSubtitle}>
              Help using ArtBoost AI
            </Text>
          </View>

          {hasConversation ? (
            <Pressable
              style={styles.headerButton}
              onPress={clearConversation}
            >
              <Ionicons
                name="refresh-outline"
                size={22}
                color="#ffffff"
              />
            </Pressable>
          ) : (
            <View style={styles.headerIcon}>
              <Ionicons
                name="chatbubbles"
                size={22}
                color="#ffffff"
              />
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={
            styles.contentContainer
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (hasConversation) {
              scrollViewRef.current?.scrollToEnd({
                animated: true,
              });
            }
          }}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="sparkles"
                size={29}
                color="#ffffff"
              />
            </View>

            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>
                How can we help?
              </Text>

              <Text style={styles.heroDescription}>
                Ask a question about using ArtBoost,
                connecting accounts, importing artwork,
                generating marketing content, scheduling,
                automations, campaigns, or
                troubleshooting.
              </Text>
            </View>
          </View>

          <View style={styles.scopeNotice}>
            <Ionicons
              name="information-circle"
              size={23}
              color="#a78bfa"
            />

            <View style={styles.scopeTextWrap}>
              <Text style={styles.scopeTitle}>
                ArtBoost Support Only
              </Text>

              <Text style={styles.scopeDescription}>
                Customer Service provides help with
                ArtBoost and marketing artwork through
                the app. External store orders, shipping,
                returns, refunds, payments, taxes, and
                fulfillment must be handled by the
                applicable third-party service.
              </Text>
            </View>
          </View>

          <View style={styles.chatSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Ask ArtBoost
              </Text>

              <Text style={styles.sectionSubtitle}>
                Get an immediate ArtBoost help answer.
              </Text>
            </View>

            <View style={styles.messageList}>
              {messages.map(message => (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    message.sender === "user" &&
                      styles.messageRowUser,
                  ]}
                >
                  {message.sender ===
                  "assistant" ? (
                    <View
                      style={
                        styles.assistantAvatar
                      }
                    >
                      <Ionicons
                        name="sparkles"
                        size={18}
                        color="#ffffff"
                      />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.messageBubble,
                      message.sender === "user"
                        ? styles.userBubble
                        : styles.assistantBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        message.sender === "user" &&
                          styles.userMessageText,
                      ]}
                    >
                      {message.text}
                    </Text>

                    {message.steps &&
                    message.steps.length > 0 ? (
                      <View
                        style={styles.stepsContainer}
                      >
                        {message.steps.map(
                          (step, index) => (
                            <View
                              key={`${message.id}-${index}`}
                              style={styles.stepRow}
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
                                style={styles.stepText}
                              >
                                {step}
                              </Text>
                            </View>
                          )
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {!hasConversation ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Popular Questions
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Tap a question to see the answer.
                </Text>
              </View>

              <View
                style={
                  styles.popularQuestionsList
                }
              >
                {popularQuestions.map(
                  popularQuestion => (
                    <Pressable
                      key={popularQuestion}
                      style={
                        styles.popularQuestion
                      }
                      onPress={() =>
                        submitQuestion(
                          popularQuestion
                        )
                      }
                    >
                      <View
                        style={
                          styles.questionIcon
                        }
                      >
                        <Ionicons
                          name="help"
                          size={17}
                          color="#d8b4fe"
                        />
                      </View>

                      <Text
                        style={
                          styles.popularQuestionText
                        }
                      >
                        {popularQuestion}
                      </Text>

                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color="#707077"
                      />
                    </Pressable>
                  )
                )}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Browse Help Topics
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Choose the ArtBoost feature you need
                  help with.
                </Text>
              </View>

              <View style={styles.topicGrid}>
                {suggestedTopics.map(topic => (
                  <Pressable
                    key={topic.title}
                    style={styles.topicCard}
                    onPress={() =>
                      submitQuestion(topic.question)
                    }
                  >
                    <View style={styles.topicIcon}>
                      <Ionicons
                        name={topic.icon}
                        size={23}
                        color="#d8b4fe"
                      />
                    </View>

                    <Text style={styles.topicTitle}>
                      {topic.title}
                    </Text>

                    <Text
                      style={
                        styles.topicDescription
                      }
                    >
                      {topic.description}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            style={styles.faqCard}
            onPress={() => router.push("/faq")}
          >
            <View style={styles.faqIcon}>
              <Ionicons
                name="book-outline"
                size={25}
                color="#ffffff"
              />
            </View>

            <View style={styles.faqTextWrap}>
              <Text style={styles.faqTitle}>
                Need Step-by-Step Instructions?
              </Text>

              <Text style={styles.faqDescription}>
                Open Help & FAQ to browse the complete
                ArtBoost user guide.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#a78bfa"
            />
          </Pressable>

          <View style={styles.localNotice}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color="#8f8f96"
            />

            <Text style={styles.localNoticeText}>
              This version uses the built-in ArtBoost
              help library. Live AI support can be
              connected to the ArtBoost backend later.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask anything about ArtBoost..."
              placeholderTextColor="#73737a"
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={() =>
                submitQuestion()
              }
            />

            <Pressable
              style={[
                styles.sendButton,
                !question.trim() &&
                  styles.sendButtonDisabled,
              ]}
              disabled={!question.trim()}
              onPress={() => submitQuestion()}
            >
              <Ionicons
                name="arrow-up"
                size={21}
                color="#ffffff"
              />
            </Pressable>
          </View>

          <Text style={styles.inputHint}>
            Ask about ArtBoost features,
            connections, posting, or troubleshooting.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0c0d",
  },

  keyboardView: {
    flex: 1,
  },

  header: {
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

  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#29212f",
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
  },

  contentContainer: {
    padding: 18,
    paddingBottom: 30,
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
    width: 53,
    height: 53,
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
    fontSize: 21,
    fontWeight: "900",
  },

  heroDescription: {
    color: "#b8b2c0",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },

  scopeNotice: {
    backgroundColor: "#17131d",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#3b2750",
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 14,
  },

  scopeTextWrap: {
    flex: 1,
    marginLeft: 11,
  },

  scopeTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  scopeDescription: {
    color: "#a59dab",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  chatSection: {
    marginTop: 25,
  },

  sectionHeader: {
    marginTop: 25,
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#8f8f96",
    fontSize: 12,
    marginTop: 3,
  },

  messageList: {
    gap: 13,
  },

  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  messageRowUser: {
    justifyContent: "flex-end",
  },

  assistantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  messageBubble: {
    maxWidth: "86%",
    borderRadius: 18,
    padding: 14,
  },

  assistantBubble: {
    backgroundColor: "#19191c",
    borderWidth: 1,
    borderColor: "#2b2b30",
    borderTopLeftRadius: 6,
  },

  userBubble: {
    backgroundColor: "#7c3aed",
    borderTopRightRadius: 6,
  },

  messageText: {
    color: "#d0cdd3",
    fontSize: 13,
    lineHeight: 20,
  },

  userMessageText: {
    color: "#ffffff",
    fontWeight: "700",
  },

  stepsContainer: {
    marginTop: 14,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 99,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  stepNumberText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  stepText: {
    flex: 1,
    color: "#c5c1c8",
    fontSize: 12,
    lineHeight: 18,
  },

  popularQuestionsList: {
    gap: 9,
  },

  popularQuestion: {
    backgroundColor: "#171719",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: "#2b2b2f",
    flexDirection: "row",
    alignItems: "center",
  },

  questionIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  popularQuestionText: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    paddingRight: 8,
  },

  topicGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  topicCard: {
    width: "48.5%",
    minHeight: 150,
    backgroundColor: "#171719",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#2b2b2f",
  },

  topicIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#2d2338",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  topicTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  topicDescription: {
    color: "#8f8f96",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },

  faqCard: {
    backgroundColor: "#18131f",
    borderRadius: 19,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3a2750",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 25,
  },

  faqIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  faqTextWrap: {
    flex: 1,
    paddingRight: 10,
  },

  faqTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  faqDescription: {
    color: "#a59dab",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  localNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    marginTop: 18,
  },

  localNoticeText: {
    flex: 1,
    color: "#77777e",
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 8,
  },

  inputArea: {
    backgroundColor: "#111112",
    borderTopWidth: 1,
    borderTopColor: "#242424",
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom:
      Platform.OS === "ios" ? 10 : 12,
  },

  inputContainer: {
    minHeight: 52,
    maxHeight: 130,
    backgroundColor: "#1b1b1e",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#333338",
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
  },

  input: {
    flex: 1,
    minHeight: 39,
    maxHeight: 110,
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 9,
    paddingRight: 9,
    textAlignVertical: "top",
  },

  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },

  sendButtonDisabled: {
    backgroundColor: "#39343e",
  },

  inputHint: {
    color: "#67676d",
    fontSize: 9,
    textAlign: "center",
    marginTop: 7,
  },
});