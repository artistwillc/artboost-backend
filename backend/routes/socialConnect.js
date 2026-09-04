// ARTBOOST_CONNECTION_STATUS_EXPIRY_V3157
import express from "express";
import { resolveRequestUserId } from "../middleware/auth.js";
import supabase from "../lib/supabase.js";
import {
  findSocialProvider,
  getSocialProviders,
  publicProvider,
} from "../config/socialProviderRegistry.js";
import {
  completeProviderOAuth,
  startProviderOAuth,
} from "../services/genericOAuthService.js";

const router =
  express.Router();

function clean(value) {
  return String(value ?? "").trim();
}

router.get(
  "/social-connect/providers",
  (_req, res) => {
    return res.json({
      success: true,
      providers:
        getSocialProviders().map(
          publicProvider
        ),
    });
  }
);

router.get(
  "/social-connect/resolve",
  (req, res) => {
    const provider =
      findSocialProvider(
        req.query?.q
      );

    return res.json({
      success: true,
      found:
        Boolean(provider),
      provider:
        publicProvider(provider),
    });
  }
);

router.get(
  "/social-connect/status/:providerId",
  async (req, res) => {
    try {
      const provider =
        findSocialProvider(
          req.params.providerId
        );

      if (!provider) {
        return res.json({
          connected: false,
          supported: false,
        });
      }

      if (
        provider.authMode ===
          "native" &&
        provider.statusPath
      ) {
        return res.json({
          connected: null,
          supported: true,
          delegated: true,
          statusPath:
            provider.statusPath,
          requiresUserId:
            provider.requiresUserId !==
            false,
        });
      }

      const userId =
        await resolveRequestUserId(
          req,
          res,
          { allowMissing: true }
        );

      if (userId === null) return;

      if (!userId) {
        return res.json({
          connected: false,
          supported: true,
        });
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "social_connections"
          )
          .select(
            "id,connected,platform_data,updated_at"
          )
          .eq(
            "user_id",
            userId
          )
          .eq(
            "platform",
            provider.id
          )
          .maybeSingle();

      if (error) {
        throw new Error(
          error.message
        );
      }

      const expiresAt =
        data?.platform_data?.expiresAt ||
        null;

      const expired =
        Boolean(
          expiresAt &&
          Number.isFinite(
            Date.parse(expiresAt)
          ) &&
          Date.parse(expiresAt) <= Date.now()
        );

      const hasRefreshToken =
        Boolean(
          data?.platform_data?.refreshToken
        );

      return res.json({
        connected:
          Boolean(
            data &&
            data.connected !== false &&
            !expired
          ),
        supported: true,
        expired,
        reconnectRequired:
          Boolean(
            data &&
            data.connected !== false &&
            expired &&
            !hasRefreshToken
          ),
        accountName:
          data?.platform_data?.accountName ||
          null,
        accountUrl:
          data?.platform_data?.accountUrl ||
          null,
        updatedAt:
          data?.updated_at ||
          null,
        expiresAt,
      });
    } catch (error) {
      return res.status(500).json({
        connected: false,
        supported: true,
        error:
          error instanceof Error
            ? error.message
            : "Unable to check social connection status.",
      });
    }
  }
);

router.get(
  "/social-connect/auth/:providerId",
  (req, res) => {
    try {
      const provider =
        findSocialProvider(
          req.params.providerId
        );

      if (!provider) {
        return res
          .status(404)
          .send(
            "This platform is not supported yet."
          );
      }

      const userId =
        clean(req.query?.userId);

      if (
        provider.requiresUserId !==
          false &&
        !userId
      ) {
        return res
          .status(400)
          .send(
            "Please log in to ArtBoost before connecting this platform."
          );
      }

      if (
        provider.authMode ===
          "native"
      ) {
        const params =
          new URLSearchParams();

        if (
          provider.requiresUserId !==
            false &&
          userId
        ) {
          params.set(
            "userId",
            userId
          );
        }

        const suffix =
          params.toString()
            ? `?${params.toString()}`
            : "";

        return res.redirect(
          `${provider.authPath}${suffix}`
        );
      }

      const url =
        startProviderOAuth({
          providerId:
            provider.id,
          userId,
        });

      return res.redirect(url);
    } catch (error) {
      return res
        .status(500)
        .send(
          error instanceof Error
            ? error.message
            : "Unable to start social authorization."
        );
    }
  }
);

router.get(
  "/social-connect/callback",
  async (req, res) => {
    try {
      const code =
        clean(req.query?.code);

      const state =
        clean(req.query?.state);

      if (!code || !state) {
        return res
          .status(400)
          .send(
            "The social platform did not return a valid authorization response."
          );
      }

      const result =
        await completeProviderOAuth({
          code,
          state,
        });

      const name =
        result.provider.name;

      const accountName =
        result.accountName ||
        name;

      return res.send(`
        <!doctype html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1"/>
            <title>${name} Connected</title>
            <style>
              body{font-family:system-ui,-apple-system,sans-serif;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
              main{max-width:560px;padding:32px;text-align:center}
              h1{font-size:28px;margin-bottom:12px}
              p{color:#b5b5b5;line-height:1.55}
              .ok{color:#34d399;font-weight:800}
            </style>
          </head>
          <body>
            <main>
              <h1>${name} Connected</h1>
              <p class="ok">${String(accountName).replace(/[<>&"]/g, "")}</p>
              <p>Return to ArtBoost and refresh connection status. This platform is now available to Store Automation.</p>
            </main>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Universal social callback error:",
        error
      );

      return res
        .status(500)
        .send(
          error instanceof Error
            ? error.message
            : "Unable to complete social authorization."
        );
    }
  }
);

export default router;
