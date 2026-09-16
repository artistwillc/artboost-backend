import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = process.cwd();
const helperPath = path.join(root, "lib", "campaignMultiPlatformFanout.ts");
const campaignPath = path.join(root, "app", "campaign-manager.tsx");
const packagePath = path.join(root, "package.json");

function fail(message) {
  console.error(`FAIL campaign multi-platform publishing regression: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(helperPath)) fail("fan-out helper missing");
if (!fs.existsSync(campaignPath)) fail("campaign-manager.tsx missing");
if (!fs.existsSync(packagePath)) fail("package.json missing");

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require(path.join(root, "node_modules", "typescript"));
} catch {
  try {
    ts = require("typescript");
  } catch {
    fail("TypeScript package unavailable");
  }
}

const helperSource = fs.readFileSync(helperPath, "utf8");
const campaignSource = fs.readFileSync(campaignPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

for (const needle of [
  "ARTBOOST_CAMPAIGN_MULTI_PLATFORM_FANOUT_V1",
  "for (const platform of platforms)",
  "await publishOne(platform)",
]) {
  if (!helperSource.includes(needle)) fail(`helper contract missing: ${needle}`);
}

for (const needle of [
  "runCampaignPlatformFanout",
  "selectedPlatforms",
  "results = await runCampaignPlatformFanout",
  "if (!response.ok || data?.error)",
  "continue",
  "Multi-Platform Publish Results",
]) {
  if (!campaignSource.includes(needle)) fail(`Campaign Manager contract missing: ${needle}`);
}

if (!pkg.scripts?.["test:campaign-multiplatform-publish-regression"]) {
  fail("package script missing");
}

const js = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const module = { exports: {} };
const sandbox = {
  module,
  exports: module.exports,
  require,
  console,
};
vm.runInNewContext(js, sandbox, { filename: "campaignMultiPlatformFanout.js" });

const { runCampaignPlatformFanout } = module.exports;
if (typeof runCampaignPlatformFanout !== "function") fail("fan-out function did not load");

const selected = ["Pinterest", "Facebook", "Instagram", "X"];
const attempted = [];

const results = await runCampaignPlatformFanout(selected, async (platform) => {
  attempted.push(platform);

  if (platform === "Facebook") {
    return { success: false, message: "simulated Facebook rejection" };
  }

  if (platform === "Instagram") {
    throw new Error("simulated Instagram transport failure");
  }

  return { success: true };
});

if (attempted.length !== selected.length) {
  fail(`expected ${selected.length} attempts, got ${attempted.length}`);
}
if (attempted.join("|") !== selected.join("|")) {
  fail(`attempt order/coverage mismatch: ${attempted.join(", ")}`);
}
if (results.length !== selected.length) {
  fail(`expected ${selected.length} results, got ${results.length}`);
}

const byPlatform = new Map(results.map((item) => [item.platform, item]));
if (byPlatform.get("Pinterest")?.success !== true) fail("Pinterest success missing");
if (byPlatform.get("X")?.success !== true) fail("X success missing");
if (byPlatform.get("Facebook")?.success !== false) fail("Facebook failure missing");
if (byPlatform.get("Instagram")?.success !== false) fail("Instagram thrown failure missing");
if (!String(byPlatform.get("Facebook")?.message || "").includes("simulated Facebook")) {
  fail("Facebook failure message missing");
}
if (!String(byPlatform.get("Instagram")?.message || "").includes("simulated Instagram")) {
  fail("Instagram transport failure message missing");
}

console.log("PASS campaign multi-platform behavioral publishing regression");
