import crypto from "crypto";
import { resolveRequestUserId } from "../middleware/auth.js";
import express from "express";

import supabase from "../lib/supabase.js";

const router = express.Router();

const BACKEND_URL =
  process.env.BACKEND_URL ||
  "https://artboost-ai.onrender.com";

const ETSY_CLIENT_ID =
  process.env.ETSY_CLIENT_ID || "";

const ETSY_CLIENT_SECRET =
  process.env.ETSY_CLIENT_SECRET || "";

const ETSY_REDIRECT_URI =
  `${BACKEND_URL}/auth/etsy/callback`;

const ETSY_API_KEY =
  ETSY_CLIENT_SECRET
    ? `${ETSY_CLIENT_ID}:${ETSY_CLIENT_SECRET}`
    : ETSY_CLIENT_ID;

const createCodeVerifier = () => {
  return crypto
    .randomBytes(32)
    .toString("base64url");
};

const createCodeChallenge = (
  verifier
) => {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
};

/*
 * GET /auth/etsy
 *
 * Starts the Etsy OAuth connection.
 */
router.get(
  "/auth/etsy",
  async (req, res) => {
    try {
      const userId = String(
        req.query.userId || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "Missing userId.",
        });
      }

      if (!ETSY_CLIENT_ID) {
        return res.status(500).json({
          success: false,
          error:
            "ETSY_CLIENT_ID is not configured.",
        });
      }

      const state =
        crypto.randomUUID();

      const codeVerifier =
        createCodeVerifier();

      const codeChallenge =
        createCodeChallenge(
          codeVerifier
        );

      /*
       * Remove older unfinished OAuth
       * attempts for this ArtBoost user.
       */
      const {
        error: cleanupError,
      } = await supabase
        .from("etsy_oauth_states")
        .delete()
        .eq("user_id", userId);

      if (cleanupError) {
        console.log(
          "Old Etsy state cleanup failed:",
          cleanupError
        );
      }

      const {
        error: stateInsertError,
      } = await supabase
        .from("etsy_oauth_states")
        .insert({
          state,
          user_id: userId,
          code_verifier:
            codeVerifier,
        });

      if (stateInsertError) {
        throw stateInsertError;
      }

      const authorizationUrl =
        new URL(
          "https://www.etsy.com/oauth/connect"
        );

      authorizationUrl.searchParams.set(
        "response_type",
        "code"
      );

      authorizationUrl.searchParams.set(
        "client_id",
        ETSY_CLIENT_ID
      );

      authorizationUrl.searchParams.set(
        "redirect_uri",
        ETSY_REDIRECT_URI
      );

      authorizationUrl.searchParams.set(
        "scope",
        "shops_r listings_r"
      );

      authorizationUrl.searchParams.set(
        "state",
        state
      );

      authorizationUrl.searchParams.set(
        "code_challenge",
        codeChallenge
      );

      authorizationUrl.searchParams.set(
        "code_challenge_method",
        "S256"
      );

      console.log(
        "ETSY AUTHORIZATION STARTED:",
        {
          userId,
          redirectUri:
            ETSY_REDIRECT_URI,
          clientIdPresent:
            Boolean(
              ETSY_CLIENT_ID
            ),
        }
      );

      return res.redirect(
        authorizationUrl.toString()
      );
    } catch (error) {
      console.error(
        "Etsy authorization error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error?.message ||
          "Unable to begin Etsy authorization.",
      });
    }
  }
);

/*
 * GET /auth/etsy/callback
 *
 * Receives Etsy's authorization code,
 * exchanges it for tokens, and saves
 * the connection in Supabase.
 */
router.get(
  "/auth/etsy/callback",
  async (req, res) => {
    try {
      const code = String(
        req.query.code || ""
      ).trim();

      const state = String(
        req.query.state || ""
      ).trim();

      const oauthError = String(
        req.query.error || ""
      ).trim();

      const oauthErrorDescription =
        String(
          req.query.error_description ||
            ""
        ).trim();

      if (oauthError) {
        throw new Error(
          oauthErrorDescription ||
            oauthError
        );
      }

      if (!code || !state) {
        return res.status(400).send(`
          <html>
            <body
              style="
                background:#101010;
                color:#ffffff;
                font-family:Arial,sans-serif;
                text-align:center;
                padding:40px;
              "
            >
              <h1>Etsy Connection Failed</h1>
              <p>
                Etsy did not return the required authorization information.
              </p>
            </body>
          </html>
        `);
      }

      const {
        data: oauthState,
        error: stateError,
      } = await supabase
        .from("etsy_oauth_states")
        .select(
          "user_id, code_verifier"
        )
        .eq("state", state)
        .maybeSingle();

      if (stateError) {
        throw stateError;
      }

      if (!oauthState) {
        return res.status(400).send(`
          <html>
            <body
              style="
                background:#101010;
                color:#ffffff;
                font-family:Arial,sans-serif;
                text-align:center;
                padding:40px;
              "
            >
              <h1>Etsy Session Expired</h1>
              <p>
                Return to ArtBoost and press Connect again.
              </p>
            </body>
          </html>
        `);
      }

      const tokenResponse =
        await fetch(
          "https://openapi.etsy.com/v3/public/oauth/token",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type:
                "authorization_code",
              client_id:
                ETSY_CLIENT_ID,
              redirect_uri:
                ETSY_REDIRECT_URI,
              code,
              code_verifier:
                oauthState.code_verifier,
            }).toString(),
          }
        );

      const tokenText =
        await tokenResponse.text();

      let tokenData;

      try {
        tokenData =
          JSON.parse(tokenText);
      } catch {
        throw new Error(
          `Etsy token response was not valid JSON. HTTP ${tokenResponse.status}: ${tokenText.slice(
            0,
            300
          )}`
        );
      }

      if (!tokenResponse.ok) {
        throw new Error(
          tokenData.error_description ||
            tokenData.error ||
            `Etsy token exchange failed with HTTP ${tokenResponse.status}.`
        );
      }

      const accessToken =
        String(
          tokenData.access_token || ""
        ).trim();

      const refreshToken =
        String(
          tokenData.refresh_token || ""
        ).trim();

      if (!accessToken) {
        throw new Error(
          "Etsy did not return an access token."
        );
      }

      const expiresIn =
        Number(
          tokenData.expires_in
        ) || 3600;

      const expiresAt =
        new Date(
          Date.now() +
            expiresIn * 1000
        ).toISOString();

      /*
       * Etsy access tokens normally begin
       * with the authorized Etsy user ID:
       *
       * userId.tokenValue
       */
      const etsyUserId =
        accessToken.includes(".")
          ? accessToken.split(".")[0]
          : "";

      let shopId = null;
      let shopName = null;

      /*
       * Shop lookup is optional.
       * A failed lookup must not prevent the
       * valid OAuth token from being saved.
       */
      if (etsyUserId) {
        try {
          const shopResponse =
            await fetch(
              `https://openapi.etsy.com/v3/application/users/${encodeURIComponent(
                etsyUserId
              )}/shops`,
              {
                headers: {
                  "x-api-key":
                    ETSY_API_KEY,
                  Authorization:
                    `Bearer ${accessToken}`,
                },
              }
            );

          const shopText =
            await shopResponse.text();

          if (shopResponse.ok) {
            const shopData =
              JSON.parse(shopText);

            const shop =
              Array.isArray(
                shopData.results
              )
                ? shopData.results[0]
                : shopData;

            if (shop) {
              shopId =
                shop.shop_id
                  ? String(
                      shop.shop_id
                    )
                  : null;

              shopName =
                shop.shop_name
                  ? String(
                      shop.shop_name
                    )
                  : null;
            }
          } else {
            console.log(
              "Etsy shop lookup did not succeed:",
              shopResponse.status,
              shopText.slice(
                0,
                300
              )
            );
          }
        } catch (shopError) {
          console.log(
            "Etsy shop lookup failed:",
            shopError
          );
        }
      }

      const {
        error: connectionError,
      } = await supabase
        .from("etsy_connections")
        .upsert(
          {
            user_id:
              oauthState.user_id,
            access_token:
              accessToken,
            refresh_token:
              refreshToken || null,
            expires_at:
              expiresAt,
            scopes:
              tokenData.scope ||
              "shops_r listings_r",
            shop_id:
              shopId,
            shop_name:
              shopName,
            connected_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "user_id",
          }
        );

      if (connectionError) {
        throw connectionError;
      }

      const {
        error: stateDeleteError,
      } = await supabase
        .from("etsy_oauth_states")
        .delete()
        .eq("state", state);

      if (stateDeleteError) {
        console.log(
          "Etsy OAuth state cleanup failed:",
          stateDeleteError
        );
      }

      console.log(
        "Etsy connection saved:",
        {
          userId:
            oauthState.user_id,
          etsyUserId:
            etsyUserId || null,
          shopId,
          shopName,
        }
      );

      return res.send(`
        <html>
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </head>

          <body
            style="
              background:#101010;
              color:#ffffff;
              font-family:Arial,sans-serif;
              text-align:center;
              padding:40px 20px;
            "
          >
            <h1>Etsy Connected</h1>

            <p>
              ${
                shopName
                  ? `The Etsy shop <strong>${shopName}</strong> is now connected to ArtBoost.`
                  : "Your Etsy account is now connected to ArtBoost."
              }
            </p>

            <p>
              Return to ArtBoost and press
              <strong>Refresh Connection Status</strong>.
            </p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Etsy callback error:",
        error
      );

      return res.status(500).send(`
        <html>
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </head>

          <body
            style="
              background:#101010;
              color:#ffffff;
              font-family:Arial,sans-serif;
              text-align:center;
              padding:40px 20px;
            "
          >
            <h1>Etsy Connection Failed</h1>

            <p>
              ${
                error?.message ||
                "Etsy authorization failed."
              }
            </p>

            <p>
              Return to ArtBoost and try again.
            </p>
          </body>
        </html>
      `);
    }
  }
);

/*
 * GET /etsy/status
 *
 * Returns the Etsy connection status
 * for the current ArtBoost user.
 */
router.get(
  "/etsy/status",
  async (req, res) => {
    try {
      const userId =
        await resolveRequestUserId(req, res);

      if (!userId) return;

      const {
        data,
        error,
      } = await supabase
        .from("etsy_connections")
        .select(
          [
            "access_token",
            "expires_at",
            "scopes",
            "connected_at",
            "shop_id",
            "shop_name",
          ].join(",")
        )
        .eq(
          "user_id",
          userId
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      return res.json({
        configured:
          Boolean(
            ETSY_CLIENT_ID
          ),
        connected:
          Boolean(
            data?.access_token
          ),
        expiresAt:
          data?.expires_at ||
          null,
        scopes:
          data?.scopes ||
          null,
        connectedAt:
          data?.connected_at ||
          null,
        shopId:
          data?.shop_id ||
          null,
        shopName:
          data?.shop_name ||
          null,
      });
    } catch (error) {
      console.error(
        "Etsy status error:",
        error
      );

      return res.status(500).json({
        configured:
          Boolean(
            ETSY_CLIENT_ID
          ),
        connected: false,
        expiresAt: null,
        scopes: null,
        connectedAt: null,
        shopId: null,
        shopName: null,
        error:
          error?.message ||
          "Unable to check Etsy status.",
      });
    }
  }
);

export default router;