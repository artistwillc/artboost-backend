import crypto from "crypto";
import express from "express";

import supabase from "../lib/supabase.js";

const router = express.Router();

const BACKEND_URL =
  process.env.BACKEND_URL ||
  "https://artboost-ai.onrender.com";

const ETSY_CLIENT_ID =
  process.env.ETSY_CLIENT_ID;

const ETSY_REDIRECT_URI =
  `${BACKEND_URL}/auth/etsy/callback`;

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
 * Begins Etsy OAuth.
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

      if (!code || !state) {
        return res.status(400).send(
          "Missing Etsy authorization code or state."
        );
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
        return res.status(400).send(
          "The Etsy authorization session is invalid or expired."
        );
      }

      const tokenResponse =
        await fetch(
          "https://api.etsy.com/v3/public/oauth/token",
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
          `Etsy returned HTTP ${tokenResponse.status}: ${tokenText.slice(
            0,
            300
          )}`
        );
      }

      if (!tokenResponse.ok) {
        throw new Error(
          tokenData.error_description ||
            tokenData.error ||
            "Etsy token exchange failed."
        );
      }

      const accessToken =
        String(
          tokenData.access_token || ""
        );

      const refreshToken =
        String(
          tokenData.refresh_token || ""
        );

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

      const userResponse =
        await fetch(
          "https://openapi.etsy.com/v3/application/users/me",
          {
            headers: {
              "x-api-key":
                ETSY_CLIENT_ID,
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const userText =
        await userResponse.text();

      let etsyUser;

      try {
        etsyUser =
          JSON.parse(userText);
      } catch {
        throw new Error(
          `Etsy user lookup returned HTTP ${userResponse.status}: ${userText.slice(
            0,
            300
          )}`
        );
      }

      if (!userResponse.ok) {
        throw new Error(
          etsyUser.error ||
            "Unable to load the Etsy account."
        );
      }

      const etsyUserId =
        String(
          etsyUser.user_id || ""
        );

      const shopId =
        etsyUser.shop_id
          ? String(
              etsyUser.shop_id
            )
          : null;

      let shopName = null;

      if (shopId) {
        const shopResponse =
          await fetch(
            `https://openapi.etsy.com/v3/application/shops/${encodeURIComponent(
              shopId
            )}`,
            {
              headers: {
                "x-api-key":
                  ETSY_CLIENT_ID,
                Authorization:
                  `Bearer ${accessToken}`,
              },
            }
          );

        if (shopResponse.ok) {
          const shopData =
            await shopResponse.json();

          shopName =
            shopData.shop_name ||
            null;
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

      await supabase
        .from("etsy_oauth_states")
        .delete()
        .eq("state", state);

      return res.send(`
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
            <h1>Etsy Connected</h1>
            <p>
              ${
                shopName
                  ? `The Etsy shop <strong>${shopName}</strong> is now connected to ArtBoost.`
                  : "Your Etsy account is now connected to ArtBoost."
              }
            </p>

            <p>
              You may return to the ArtBoost app and press Refresh Connection Status.
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
              ${
                error?.message ||
                "Etsy authorization failed."
              }
            </p>
          </body>
        </html>
      `);
    }
  }
);

/*
 * GET /auth/etsy/callback
 *
 * Placeholder callback.
 * Token exchange comes next.
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

      if (!code || !state) {
        return res.status(400).send(
          "Missing Etsy authorization code or state."
        );
      }

      return res.send(`
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
            <h1>Etsy authorization received</h1>
            <p>
              You may return to ArtBoost.
            </p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Etsy callback error:",
        error
      );

      return res.status(500).send(
        "Etsy authorization failed."
      );
    }
  }
);

/*
 * GET /etsy/status
 */
router.get(
  "/etsy/status",
  async (req, res) => {
    try {
      const userId = String(
        req.query.userId || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          configured:
            Boolean(
              ETSY_CLIENT_ID
            ),
          connected: false,
          error: "Missing userId.",
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from(
          "etsy_connections"
        )
        .select(
          "access_token, expires_at, scopes, connected_at"
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
        error:
          error?.message ||
          "Unable to check Etsy status.",
      });
    }
  }
);

export default router;