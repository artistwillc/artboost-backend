const data = {
  content: [
    "AI Content Generation",
    "Create platform-ready titles, captions, hashtags, descriptions, and calls-to-action from your artwork or products.",
  ],
  tools: [
    "Creator Tools",
    "Use AI generators, pricing calculators, POD profit tools, collection planning, store critique, trend tools, holiday planning, opportunity scanning, and AI business coaching.",
  ],
  consultant: [
    "AI Marketing Consultant",
    "Get personalized recommendations for platforms, posting schedules, campaign ideas, automation strategy, and marketing direction.",
  ],
  automation: [
    "Smart Scheduling & Automation",
    "Schedule future campaigns, build recurring workflows, rotate eligible products, and keep your marketing running consistently.",
  ],
  library: [
    "Store & Product Library",
    "Connect supported stores and organize your artwork, product images, titles, and links in one centralized marketing library.",
  ],
  analytics: [
    "Analytics & Insights",
    "Track campaign activity, automation health, publishing performance, and useful marketing signals.",
  ],
  support: [
    "AI Customer Support",
    "Get ArtBoost-specific help for features, connections, stores, subscriptions, publishing workflows, and troubleshooting.",
  ],
  publishing: [
    "Multi-Platform Publishing",
    "Create one campaign and publish through your connected social platforms using platform-aware workflows.",
  ],
};

const fm = document.getElementById("featureModal");
const pm = document.getElementById("pricingModal");
const am = document.getElementById("accountModal");
const toast = document.getElementById("toast");

let authClient = null;
let authMode = "signup";
let pendingTier = "";
let currentSession = null;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window._t);
  window._t = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle("open", open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
}

function openPricing() {
  setModalOpen(fm, false);
  setModalOpen(am, false);
  setModalOpen(pm, true);
}

function setAccountStatus(message, isError = false) {
  const status = document.getElementById("accountStatus");
  if (!status) return;
  status.textContent = message || "";
  status.style.color = isError ? "#ff9b9b" : "#d9d3ff";
}

function setAccountMode(mode) {
  authMode = mode === "login" ? "login" : "signup";

  const title = document.getElementById("accountTitle");
  const intro = document.getElementById("accountIntro");
  const submit = document.getElementById("accountSubmit");
  const password = document.getElementById("accountPassword");

  if (title) {
    title.textContent =
      authMode === "login"
        ? "Log in to ArtBoost"
        : "Create your ArtBoost account";
  }

  if (intro) {
    intro.textContent =
      authMode === "login"
        ? "Log in to manage your ArtBoost plan and continue to checkout."
        : "Create your account first, then choose the plan that fits your business.";
  }

  if (submit) {
    submit.textContent = authMode === "login" ? "Log In" : "Create Account";
  }

  if (password) {
    password.autocomplete =
      authMode === "login" ? "current-password" : "new-password";
  }

  setAccountStatus("");
}

function updateSignedInUi(session) {
  currentSession = session || null;

  const signedInActions = document.getElementById("signedInActions");
  const accountForm = document.getElementById("accountForm");
  const title = document.getElementById("accountTitle");
  const intro = document.getElementById("accountIntro");

  document.querySelectorAll(".login, .m-login").forEach((button) => {
    if (session?.user?.email) {
      button.dataset.toast = "";
      button.setAttribute("aria-label", "ArtBoost account");
      if (button.classList.contains("m-login")) {
        button.textContent = "Account";
      }
    } else if (button.classList.contains("m-login")) {
      button.textContent = "Log In";
    }
  });

  if (session?.user) {
    if (accountForm) accountForm.style.display = "none";
    if (signedInActions) signedInActions.style.display = "flex";
    if (title) title.textContent = "You're signed in";
    if (intro) {
      intro.textContent =
        `${session.user.email || "Your account"} is ready. Choose a plan when you're ready.`;
    }
  } else {
    if (accountForm) accountForm.style.display = "grid";
    if (signedInActions) signedInActions.style.display = "none";
  }
}

async function loadAuthClient() {
  if (authClient) return authClient;

  if (!window.supabase?.createClient) {
    throw new Error("ArtBoost account service could not load.");
  }

  const response = await fetch("/api/public-auth-config", {
    headers: { Accept: "application/json" },
  });

  const config = await response.json().catch(() => ({}));

  if (!response.ok || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error(
      config.error ||
        "ArtBoost website account sign-in is not configured yet."
    );
  }

  authClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  const { data } = await authClient.auth.getSession();
  updateSignedInUi(data.session);

  authClient.auth.onAuthStateChange((_event, session) => {
    updateSignedInUi(session);
  });

  return authClient;
}

async function ensureWebsiteProfile(session) {
  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }

  const response = await fetch("/website/ensure-profile", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Unable to prepare your ArtBoost account.");
  }

  return result;
}

async function openAccount(mode = "signup", tier = "") {
  pendingTier = tier || "";
  setModalOpen(pm, false);
  setModalOpen(fm, false);
  setAccountMode(mode);
  setModalOpen(am, true);

  try {
    const client = await loadAuthClient();
    const { data } = await client.auth.getSession();
    updateSignedInUi(data.session);

    if (data.session?.user && pendingTier) {
      setAccountStatus(
        `Signed in as ${data.session.user.email}. Continue to ${pendingTier}.`
      );
    }
  } catch (error) {
    setAccountStatus(error.message || String(error), true);
  }
}

async function startPaidCheckout(tier) {
  const client = await loadAuthClient();
  const { data } = await client.auth.getSession();
  const session = data.session;

  if (!session?.user) {
    await openAccount("signup", tier);
    setAccountStatus(
      `Create or log in to your ArtBoost account before choosing ${tier}.`
    );
    return;
  }

  await ensureWebsiteProfile(session);

  showToast(`Opening secure Stripe checkout for ArtBoost ${tier}...`);

  const response = await fetch("/website/create-checkout-session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tier }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Unable to start Stripe checkout.");
  }

  if (!result.url) {
    throw new Error("Stripe checkout did not return a destination.");
  }

  window.location.href = result.url;
}

async function completeFreeAccount() {
  const client = await loadAuthClient();
  const { data } = await client.auth.getSession();

  if (!data.session?.user) {
    await openAccount("signup", "free");
    return;
  }

  await ensureWebsiteProfile(data.session);
  setModalOpen(pm, false);
  showToast("Your ArtBoost Free account is ready.");
}

document
  .querySelectorAll("[data-feature]")
  .forEach((element) =>
    element.addEventListener("click", () => {
      const feature = data[element.dataset.feature];
      if (!feature || !fm) return;
      document.getElementById("featureTitle").textContent = feature[0];
      document.getElementById("featureBody").textContent = feature[1];
      setModalOpen(fm, true);
    })
  );

document
  .querySelectorAll("[data-close-feature]")
  .forEach((element) =>
    element.addEventListener("click", () => setModalOpen(fm, false))
  );

document
  .querySelectorAll("[data-pricing]")
  .forEach((element) =>
    element.addEventListener("click", () => openPricing())
  );

document
  .querySelectorAll("[data-close-pricing]")
  .forEach((element) =>
    element.addEventListener("click", () => setModalOpen(pm, false))
  );

document
  .querySelectorAll("[data-close-account]")
  .forEach((element) =>
    element.addEventListener("click", () => setModalOpen(am, false))
  );

document
  .querySelectorAll("[data-toast]")
  .forEach((element) =>
    element.addEventListener("click", () => {
      const message = element.dataset.toast;
      if (message) showToast(message);
    })
  );

document
  .querySelectorAll(".login, .m-login")
  .forEach((element) =>
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openAccount("login");
    })
  );

const generateButton = document.querySelector("[data-generate]");
if (generateButton) {
  generateButton.addEventListener("click", () =>
    showToast(
      "Demo content generated — the full AI workflow runs inside ArtBoost."
    )
  );
}

/*
 * =============================================================
 * ACCOUNT + PRICING
 * =============================================================
 *
 * Customers can see pricing at any time, but Stripe checkout is impossible
 * until they have authenticated with a real ArtBoost account.
 */
document
  .querySelectorAll("#pricingModal .plans article")
  .forEach((card) => {
    const planName = card.querySelector("h3")?.textContent?.trim();
    const button = card.querySelector("button");

    if (!button || !planName) return;

    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;

      try {
        if (planName === "Free") {
          button.textContent = "Creating Account...";
          await completeFreeAccount();
          return;
        }

        button.textContent = "Checking Account...";
        await startPaidCheckout(planName.toLowerCase());
      } catch (error) {
        showToast(error.message || "Unable to continue.");
        await openAccount("login", planName.toLowerCase());
        setAccountStatus(error.message || "Unable to continue.", true);
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 600);
      }
    });
  });

const accountCreateTab = document.getElementById("accountCreateTab");
const accountLoginTab = document.getElementById("accountLoginTab");
const accountForm = document.getElementById("accountForm");
const accountContinue = document.getElementById("accountContinue");
const accountSignOut = document.getElementById("accountSignOut");

accountCreateTab?.addEventListener("click", () => {
  updateSignedInUi(null);
  setAccountMode("signup");
});

accountLoginTab?.addEventListener("click", () => {
  updateSignedInUi(null);
  setAccountMode("login");
});

accountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("accountEmail")?.value?.trim();
  const password = document.getElementById("accountPassword")?.value || "";
  const submit = document.getElementById("accountSubmit");

  if (!email || !password) {
    setAccountStatus("Enter your email and password.", true);
    return;
  }

  try {
    if (submit) submit.disabled = true;
    setAccountStatus(
      authMode === "login" ? "Logging in..." : "Creating your account..."
    );

    const client = await loadAuthClient();

    let result;
    if (authMode === "login") {
      result = await client.auth.signInWithPassword({ email, password });
    } else {
      result = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/?account=confirmed`,
        },
      });
    }

    if (result.error) {
      throw result.error;
    }

    let session = result.data?.session || null;

    if (!session && authMode === "signup") {
      setAccountStatus(
        "Account created. Check your email to confirm it, then return here and log in."
      );
      setAccountMode("login");
      return;
    }

    if (!session) {
      const { data } = await client.auth.getSession();
      session = data.session;
    }

    if (!session?.user) {
      throw new Error("Account authentication did not complete.");
    }

    await ensureWebsiteProfile(session);
    updateSignedInUi(session);

    if (pendingTier && pendingTier !== "free") {
      const tier = pendingTier;
      pendingTier = "";
      setAccountStatus(`Account ready. Opening ${tier} checkout...`);
      await startPaidCheckout(tier);
      return;
    }

    if (pendingTier === "free") {
      pendingTier = "";
      setModalOpen(am, false);
      showToast("Your ArtBoost Free account is ready.");
      return;
    }

    setAccountStatus("Account ready. Choose a plan when you're ready.");
  } catch (error) {
    setAccountStatus(error.message || String(error), true);
  } finally {
    if (submit) submit.disabled = false;
  }
});

accountContinue?.addEventListener("click", () => {
  pendingTier = "";
  openPricing();
});

accountSignOut?.addEventListener("click", async () => {
  try {
    const client = await loadAuthClient();
    await client.auth.signOut();
    updateSignedInUi(null);
    setAccountMode("login");
    setAccountStatus("Signed out.");
  } catch (error) {
    setAccountStatus(error.message || String(error), true);
  }
});

/*
 * Checkout return messages.
 */
const searchParams = new URLSearchParams(window.location.search);
const checkoutStatus = searchParams.get("checkout");
const checkoutTier = searchParams.get("tier");
const accountRequired = searchParams.get("account");

if (accountRequired === "confirmed") {
  window.setTimeout(async () => {
    try {
      const client = await loadAuthClient();
      const { data } = await client.auth.getSession();

      if (data.session?.user) {
        await ensureWebsiteProfile(data.session);

        pendingTier = "";
        setAccountMode("login");
        setModalOpen(pm, false);
        setModalOpen(fm, false);
        setModalOpen(am, true);
        updateSignedInUi(data.session);

        const title = document.getElementById("accountTitle");
        const intro = document.getElementById("accountIntro");

        if (title) {
          title.textContent = "Email confirmed";
        }

        if (intro) {
          intro.textContent =
            "Your ArtBoost account is confirmed and ready. You can now choose a plan or continue using your account.";
        }

        setAccountStatus(
          `Confirmed: ${data.session.user.email || "your ArtBoost account"}.`
        );
      } else {
        pendingTier = "";
        setAccountMode("login");
        setModalOpen(pm, false);
        setModalOpen(fm, false);
        setModalOpen(am, true);

        const title = document.getElementById("accountTitle");
        const intro = document.getElementById("accountIntro");

        if (title) {
          title.textContent = "Email confirmed";
        }

        if (intro) {
          intro.textContent =
            "Your email has been confirmed. Log in with the email and password you created to continue.";
        }

        setAccountStatus("Email confirmed successfully. Please log in.");
      }
    } catch (error) {
      setModalOpen(am, true);
      setAccountMode("login");

      const title = document.getElementById("accountTitle");
      const intro = document.getElementById("accountIntro");

      if (title) {
        title.textContent = "Email confirmed";
      }

      if (intro) {
        intro.textContent =
          "Your confirmation link was accepted. Log in to continue to ArtBoost.";
      }

      setAccountStatus(
        error?.message || "Email confirmed. Please log in to continue.",
        true
      );
    }
  }, 150);
}

if (checkoutStatus === "success") {
  showToast(
    `ArtBoost ${
      checkoutTier
        ? checkoutTier[0].toUpperCase() + checkoutTier.slice(1)
        : ""
    } checkout completed. Your account is being synchronized.`
  );
}

if (checkoutStatus === "cancelled") {
  showToast("Checkout was cancelled. No subscription change was made.");
}

if (accountRequired === "required" || accountRequired === "create") {
  pendingTier = checkoutTier || "";
  window.setTimeout(() => {
    openAccount(accountRequired === "create" ? "signup" : "login", pendingTier);
  }, 100);
}

if (
  (checkoutStatus || accountRequired) &&
  window.history?.replaceState
) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setModalOpen(fm, false);
    setModalOpen(pm, false);
    setModalOpen(am, false);
  }
});

const mobileToggle = document.querySelector(".m-menu-toggle");
const mobileMenu = document.getElementById("mMenu");

if (mobileToggle && mobileMenu) {
  mobileToggle.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
    mobileToggle.setAttribute(
      "aria-expanded",
      mobileMenu.classList.contains("open")
    );
  });

  mobileMenu.querySelectorAll("a,button").forEach((element) =>
    element.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      mobileToggle.setAttribute("aria-expanded", "false");
    })
  );
}

loadAuthClient().catch((error) => {
  console.log("Website auth initialization:", error.message || error);
});
