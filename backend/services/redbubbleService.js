import supabase from "../lib/supabase.js";

const REDBUBBLE_BASE_URL =
  "https://www.redbubble.com";

function normalizeRedbubbleUsername(value) {
  const input = String(value || "").trim();

  if (!input) {
    throw new Error(
      "Enter a Redbubble storefront URL or username."
    );
  }

  let username = input;

  if (/^https?:\/\//i.test(input)) {
    let parsedUrl;

    try {
      parsedUrl = new URL(input);
    } catch {
      throw new Error(
        "Invalid Redbubble storefront URL."
      );
    }

    const hostname = parsedUrl.hostname
      .replace(/^www\./i, "")
      .toLowerCase();

    if (hostname !== "redbubble.com") {
      throw new Error(
        "The storefront URL must be a Redbubble URL."
      );
    }

    const pathParts = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    const peopleIndex = pathParts.findIndex(
      (part) =>
        part.toLowerCase() === "people"
    );

    if (
      peopleIndex === -1 ||
      !pathParts[peopleIndex + 1]
    ) {
      throw new Error(
        "Unable to find the Redbubble username in that URL."
      );
    }

    username = pathParts[peopleIndex + 1];
  }

  username = username
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_-]+$/i.test(username)) {
    throw new Error(
      "Invalid Redbubble username."
    );
  }

  return username;
}

async function saveRedbubbleConnection({
  userId,
  username,
}) {
  const now = new Date().toISOString();

  const {
    data: existingConnection,
    error: lookupError,
  } = await supabase
    .from("social_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "redbubble")
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `Unable to check Redbubble connection: ${lookupError.message}`
    );
  }

  if (existingConnection) {
    const {
      data: updatedConnection,
      error: updateError,
    } = await supabase
      .from("social_connections")
      .update({
        connected: true,
        shop_domain: username,
        updated_at: now,
      })
      .eq("id", existingConnection.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(
        `Unable to update Redbubble connection: ${updateError.message}`
      );
    }

    return updatedConnection;
  }

  const {
    data: newConnection,
    error: insertError,
  } = await supabase
    .from("social_connections")
    .insert({
      user_id: userId,
      platform: "redbubble",
      connected: true,
      shop_domain: username,
      connected_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(
      `Unable to save Redbubble connection: ${insertError.message}`
    );
  }

  return newConnection;
}

export async function importRedbubbleStore({
  userId,
  storeUrl,
}) {
  if (!userId) {
    throw new Error(
      "A userId is required to connect Redbubble."
    );
  }

  const username =
    normalizeRedbubbleUsername(storeUrl);

  const storefrontUrl =
    `${REDBUBBLE_BASE_URL}/people/${encodeURIComponent(
      username
    )}/explore?asc=u`;

  const connection =
    await saveRedbubbleConnection({
      userId,
      username,
    });

  const {
    count: productCount,
    error: productCountError,
  } = await supabase
    .from("products")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId)
    .eq("store_type", "redbubble")
    .eq("store_name", username);

  if (productCountError) {
    throw new Error(
      `Unable to count Redbubble products: ${productCountError.message}`
    );
  }

  return {
    store: {
      id: connection.id,
      storeType: "redbubble",
      storeName: username,
      storeUrl: storefrontUrl,
      connected: true,
      productCount: productCount || 0,
      updatedAt:
        connection.updated_at || null,
    },
    productsImported: 0,
    importMethod: "catalog",
  };
}