// ARTBOOST_WEB_EXPORT_BUILD_V1_20260929
import { spawnSync } from "node:child_process";

if (process.env.ARTBOOST_SKIP_WEB_EXPORT === "1") {
  console.log("Skipping ArtBoost web export.");
  process.exit(0);
}

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

if (!supabaseUrl || !supabasePublishableKey) {
  console.error(
    "ArtBoost web export requires SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY (or EXPO_PUBLIC equivalents)."
  );
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
};

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["--prefix", "../frontend", "ci"]);
run(["--prefix", "../frontend", "run", "export:web"]);
