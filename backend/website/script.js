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

let accountMode = "signup";
let supabaseClient = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) throw new Error("Secure sign-in is still loading. Please try again.");
  const response = await fetch("/api/public-auth-config", { headers: { Accept: "application/json" } });
  const config = await response.json();
  if (!response.ok || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error(config.error || "Website sign-in is not configured.");
  }
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  return supabaseClient;
}

function setAccountMode(mode) {
  accountMode = mode === "signin" ? "signin" : "signup";
  const signup = accountMode === "signup";
  document.querySelector("#accountTitle").textContent = signup ? "Create your ArtBoost account" : "Sign in to ArtBoost";
  document.querySelector("#accountCopy").textContent = signup
    ? "Create your account and start on the Free tier."
    : "Sign in with the same ArtBoost account you use in the app.";
  document.querySelector("#accountSubmit").textContent = signup ? "Create Account" : "Sign In";
  document.querySelector("#accountPassword").autocomplete = signup ? "new-password" : "current-password";
  document.querySelector("#authStatus").textContent = "";
  document.querySelectorAll("[data-account-tab]").forEach(b => b.classList.toggle("active", b.dataset.accountTab === accountMode));
}
document.querySelectorAll("[data-account]").forEach(btn => btn.addEventListener("click", () => {
  setAccountMode(btn.dataset.account);
  openModal(accountModal);
}));
document.querySelectorAll("[data-account-tab]").forEach(btn => btn.addEventListener("click", () => setAccountMode(btn.dataset.accountTab)));

document.querySelector("#accountForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.querySelector("#accountEmail").value.trim();
  const password = document.querySelector("#accountPassword").value;
  const accepted = document.querySelector("#accountTerms").checked;
  const status = document.querySelector("#authStatus");
  const submit = document.querySelector("#accountSubmit");

  if (!accepted) {
    status.textContent = "Accept the Terms of Service and Privacy Policy before continuing.";
    return;
  }

  submit.disabled = true;
  status.textContent = accountMode === "signup" ? "Creating account…" : "Signing in…";
  try {
    const client = await getSupabaseClient();
    const result = accountMode === "signup"
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (accountMode === "signup" && !result.data?.session) {
      status.textContent = "Account created. Check your email to confirm your account, then sign in.";
      return;
    }
    window.location.assign("/workspace.html");
  } catch (error) {
    status.textContent = error?.message || "Unable to continue. Please try again.";
  } finally {
    submit.disabled = false;
  }
});

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
