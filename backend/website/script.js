const TOOLS = {
  content: {
    title: "AI Content Generation",
    body: "Create platform-ready marketing content for your artwork and products in seconds.",
    bullets: ["Generate titles, captions, hashtags and calls-to-action.", "Create reusable marketing content for multiple platforms.", "Use ArtBoost to prepare campaigns faster."]
  },
  image: {
    title: "AI Image Generation",
    body: "Create supporting visual concepts and marketing imagery for your creative business.",
    bullets: ["Generate visual concepts from prompts.", "Create campaign-supporting graphics.", "Keep your creative workflow inside ArtBoost."]
  },
  scheduler: {
    title: "Smart Scheduler",
    body: "Plan campaigns and automate recurring promotion so your marketing keeps moving.",
    bullets: ["Schedule posts ahead of time.", "Use repeat and automation workflows.", "Coordinate posting across connected platforms."]
  },
  connect: {
    title: "Social Media Connect",
    body: "Connect supported stores and social networks so ArtBoost can organize publishing from one workspace.",
    bullets: ["Connect supported social platforms.", "Connect and import supported stores.", "Use your connections in campaigns and automations."]
  },
  chat: {
    title: "AI Chat Assistant",
    body: "Get ArtBoost guidance, feature help, troubleshooting and marketing assistance.",
    bullets: ["Ask how to use ArtBoost.", "Get troubleshooting guidance.", "Get help understanding features and workflows."]
  },
  caption: {
    title: "AI Caption Generation",
    body: "Generate polished captions matched to your artwork, product and campaign goal.",
    bullets: ["Create platform-ready captions.", "Adjust messaging for different campaign goals.", "Pair captions with titles, hashtags and CTAs."]
  },
  analytics: {
    title: "Analytics & Reports",
    body: "Review ArtBoost activity and available performance data to understand what is working.",
    bullets: ["Review campaign and posting activity.", "Compare products and platforms.", "Use insights to improve future campaigns."]
  },
  hashtags: {
    title: "Hashtag Generator",
    body: "Build relevant hashtag groups for artwork, products and social campaigns.",
    bullets: ["Generate targeted hashtag sets.", "Support different content themes and niches.", "Speed up social post preparation."]
  },
  rewriter: {
    title: "AI Rewriter",
    body: "Refresh existing marketing copy while keeping the core message intact.",
    bullets: ["Rewrite captions and descriptions.", "Change tone without starting from scratch.", "Create alternate versions for testing."]
  },
  keywords: {
    title: "Keyword Optimizer",
    body: "Improve discoverability by strengthening the keywords used in your listings and marketing copy.",
    bullets: ["Identify stronger keyword phrasing.", "Improve listing and campaign language.", "Support SEO-conscious product copy."]
  },
  uploader: {
    title: "Bulk Uploader",
    body: "Bring larger groups of products or artwork into your ArtBoost workflow more efficiently.",
    bullets: ["Support catalog-oriented importing.", "Reduce repetitive product entry.", "Prepare imported products for campaigns and automation."]
  },
  settings: {
    title: "Settings",
    body: "Manage your ArtBoost account, connections, subscriptions and preferences.",
    bullets: ["Review account and subscription settings.", "Manage connected services.", "Adjust ArtBoost preferences."]
  }
};

const toolModal = document.querySelector("#toolModal");
const pricingModal = document.querySelector("#pricingModal");
const accountModal = document.querySelector("#accountModal");
const toast = document.querySelector("#toast");
let toastTimer;

function openModal(el) {
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal(el) {
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.open")) document.body.style.overflow = "";
}
function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-tool]").forEach(btn => {
  btn.addEventListener("click", () => {
    const tool = TOOLS[btn.dataset.tool];
    if (!tool) return;
    document.querySelector("#toolTitle").textContent = tool.title;
    document.querySelector("#toolBody").textContent = tool.body;
    document.querySelector("#toolList").innerHTML = tool.bullets.map(x => `<li>${x}</li>`).join("");
    openModal(toolModal);
  });
});

document.querySelectorAll("[data-pricing]").forEach(btn => {
  btn.addEventListener("click", () => openModal(pricingModal));
});
document.querySelectorAll("[data-close-pricing]").forEach(btn => btn.addEventListener("click", () => closeModal(pricingModal)));
document.querySelectorAll("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => closeModal(toolModal)));
document.querySelectorAll("[data-close-account]").forEach(btn => btn.addEventListener("click", () => closeModal(accountModal)));

function setAccountMode(mode) {
  const signup = mode !== "signin";
  document.querySelector("#accountTitle").textContent = signup ? "Create your ArtBoost account" : "Sign in to ArtBoost";
  document.querySelector("#accountCopy").textContent = signup
    ? "Create your account first, then choose the plan that fits your business."
    : "Sign in securely in your browser with your existing ArtBoost account.";
  const image = document.querySelector("#accountButtonImage");
  const primary = document.querySelector("#accountPrimary");
  const pendingTier = new URLSearchParams(window.location.search).get("tier");
  const validTier = ["starter", "pro", "business"].includes(String(pendingTier || "").toLowerCase())
    ? String(pendingTier).toLowerCase()
    : "";
  const query = new URLSearchParams({ mode: signup ? "signup" : "signin" });
  if (validTier) query.set("tier", validTier);
  primary.href = `/app/web-auth?${query.toString()}`;
  image.src = signup ? "assets/create-account.webp" : "assets/sign-in.webp";
  image.alt = signup ? "Create an Account" : "Sign In";
  document.querySelectorAll("[data-account-tab]").forEach(b => b.classList.toggle("active", b.dataset.accountTab === (signup ? "signup" : "signin")));
}
document.querySelectorAll("[data-account]").forEach(btn => btn.addEventListener("click", () => {
  setAccountMode(btn.dataset.account);
  openModal(accountModal);
}));
document.querySelectorAll("[data-account-tab]").forEach(btn => btn.addEventListener("click", () => setAccountMode(btn.dataset.accountTab)));

const pageParams = new URLSearchParams(window.location.search);
const requestedAccount = pageParams.get("account");
const requestedTier = String(pageParams.get("tier") || "").toLowerCase();
const checkoutStatus = pageParams.get("checkout");
if (checkoutStatus === "success") {
  const label = requestedTier ? requestedTier.charAt(0).toUpperCase() + requestedTier.slice(1) : "paid";
  showToast(`Your ${label} checkout is complete. Sign in to open your ArtBoost workspace.`);
} else if (checkoutStatus === "cancelled") {
  showToast("Checkout was cancelled. No new purchase was completed.");
}
if (requestedAccount && ["free", "starter", "pro", "business"].includes(requestedTier || "free")) {
  setAccountMode(requestedAccount === "required" ? "signin" : "signup");
  openModal(accountModal);
}


document.querySelector("[data-demo-generate]").addEventListener("click", () => {
  const status = document.querySelector("#demoStatus");
  status.textContent = "AI example generated — Title, Caption, Hashtags and CTA are shown in the preview.";
  showToast("Demo content generated.");
});

document.querySelector(".menu-btn").addEventListener("click", e => {
  const nav = document.querySelector(".nav");
  nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", nav.classList.contains("open") ? "true" : "false");
});
document.querySelectorAll(".nav a,.nav button").forEach(el => el.addEventListener("click", () => document.querySelector(".nav").classList.remove("open")));

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  [toolModal, pricingModal, accountModal].forEach(closeModal);
});

// Make normal external links, checkout links, FAQ/Privacy/Terms links, tool tiles,
// workflow cards, View Plans & Pricing, Create Account, Sign In and mobile nav all active.
console.info("ArtBoost website interactions loaded.");
