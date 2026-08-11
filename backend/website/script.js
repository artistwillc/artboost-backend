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

const fm =
  document.getElementById(
    "featureModal"
  );

const pm =
  document.getElementById(
    "pricingModal"
  );

const toast =
  document.getElementById(
    "toast"
  );

function showToast(message) {
  if (!toast) {
    return;
  }

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    window._t
  );

  window._t =
    window.setTimeout(
      () =>
        toast.classList.remove(
          "show"
        ),
      3000
    );
}

document
  .querySelectorAll(
    "[data-feature]"
  )
  .forEach((element) =>
    element.addEventListener(
      "click",
      () => {
        const feature =
          data[
            element.dataset
              .feature
          ];

        if (
          !feature ||
          !fm
        ) {
          return;
        }

        document.getElementById(
          "featureTitle"
        ).textContent =
          feature[0];

        document.getElementById(
          "featureBody"
        ).textContent =
          feature[1];

        fm.classList.add(
          "open"
        );

        fm.setAttribute(
          "aria-hidden",
          "false"
        );
      }
    )
  );

document
  .querySelectorAll(
    "[data-close-feature]"
  )
  .forEach((element) =>
    element.addEventListener(
      "click",
      () => {
        fm?.classList.remove(
          "open"
        );

        fm?.setAttribute(
          "aria-hidden",
          "true"
        );
      }
    )
  );

document
  .querySelectorAll(
    "[data-pricing]"
  )
  .forEach((element) =>
    element.addEventListener(
      "click",
      () => {
        fm?.classList.remove(
          "open"
        );

        pm?.classList.add(
          "open"
        );

        pm?.setAttribute(
          "aria-hidden",
          "false"
        );
      }
    )
  );

document
  .querySelectorAll(
    "[data-close-pricing]"
  )
  .forEach((element) =>
    element.addEventListener(
      "click",
      () => {
        pm?.classList.remove(
          "open"
        );

        pm?.setAttribute(
          "aria-hidden",
          "true"
        );
      }
    )
  );

document
  .querySelectorAll(
    "[data-toast]"
  )
  .forEach((element) =>
    element.addEventListener(
      "click",
      () =>
        showToast(
          element.dataset
            .toast
        )
    )
  );

const generateButton =
  document.querySelector(
    "[data-generate]"
  );

if (generateButton) {
  generateButton.addEventListener(
    "click",
    () =>
      showToast(
        "Demo content generated — the full AI workflow runs inside ArtBoost."
      )
  );
}

/*
 * ============================================================
 * PRICING BUTTONS
 * ============================================================
 *
 * The current website HTML has plain buttons with no onclick
 * handlers. Detect the plan name from each pricing card and wire
 * the button to the matching server checkout route.
 *
 * No index.html rewrite is required.
 */
const planRoutes = {
  Free: "/subscribe/free",
  Starter:
    "/subscribe/starter",
  Pro: "/subscribe/pro",
  Business:
    "/subscribe/business",
};

document
  .querySelectorAll(
    "#pricingModal .plans article"
  )
  .forEach((card) => {
    const planName =
      card
        .querySelector("h3")
        ?.textContent?.trim();

    const button =
      card.querySelector(
        "button"
      );

    const route =
      planRoutes[planName];

    if (
      !button ||
      !route
    ) {
      return;
    }

    button.addEventListener(
      "click",
      () => {
        const originalText =
          button.textContent;

        button.disabled =
          true;

        button.textContent =
          planName === "Free"
            ? "Opening..."
            : "Opening Checkout...";

        showToast(
          planName === "Free"
            ? "Opening the ArtBoost Free plan..."
            : `Opening secure Stripe checkout for ArtBoost ${planName}...`
        );

        window.setTimeout(
          () => {
            window.location.href =
              route;
          },
          150
        );

        window.setTimeout(
          () => {
            button.disabled =
              false;

            button.textContent =
              originalText;
          },
          5000
        );
      }
    );
  });

/*
 * Checkout return messages.
 */
const searchParams =
  new URLSearchParams(
    window.location.search
  );

const checkoutStatus =
  searchParams.get(
    "checkout"
  );

const checkoutTier =
  searchParams.get("tier");

if (
  checkoutStatus ===
  "success"
) {
  showToast(
    `ArtBoost ${
      checkoutTier
        ? checkoutTier[0].toUpperCase() +
          checkoutTier.slice(1)
        : ""
    } checkout completed. Sign in with the same email to sync your subscription.`
  );

  if (
    window.history
      ?.replaceState
  ) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
}

if (
  checkoutStatus ===
  "cancelled"
) {
  showToast(
    "Checkout was cancelled. No subscription change was made."
  );

  if (
    window.history
      ?.replaceState
  ) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
}

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key ===
      "Escape"
    ) {
      fm?.classList.remove(
        "open"
      );

      pm?.classList.remove(
        "open"
      );
    }
  }
);

const mobileToggle =
  document.querySelector(
    ".m-menu-toggle"
  );

const mobileMenu =
  document.getElementById(
    "mMenu"
  );

if (
  mobileToggle &&
  mobileMenu
) {
  mobileToggle.addEventListener(
    "click",
    () => {
      mobileMenu.classList.toggle(
        "open"
      );

      mobileToggle.setAttribute(
        "aria-expanded",
        mobileMenu.classList.contains(
          "open"
        )
      );
    }
  );

  mobileMenu
    .querySelectorAll(
      "a,button"
    )
    .forEach((element) =>
      element.addEventListener(
        "click",
        () => {
          mobileMenu.classList.remove(
            "open"
          );

          mobileToggle.setAttribute(
            "aria-expanded",
            "false"
          );
        }
      )
    );
}
