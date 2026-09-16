import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const frontendRoot = process.cwd();
const campaignPath = path.join(frontendRoot, "app", "campaign-manager.tsx");

assert.ok(fs.existsSync(campaignPath), "campaign-manager.tsx must exist");

const src = fs.readFileSync(campaignPath, "utf8");

assert.ok(
  src.includes("ARTBOOST_CAMPAIGN_PINTEREST_USERID_REPAIR_V3"),
  "V3 repair marker is missing"
);

assert.ok(
  src.includes("await supabase.auth.getSession()"),
  "Campaign Manager must resolve the current Supabase session inside loadBoards"
);

assert.ok(
  src.includes('const pinterestUserId = pinterestAuthData.session?.user?.id || "";'),
  "Authenticated Pinterest userId resolver is missing"
);

assert.ok(
  src.includes('/pinterest/boards?userId=${encodeURIComponent(pinterestUserId)}'),
  "Pinterest boards request must include authenticated userId"
);

assert.ok(
  !src.includes('const response = await fetch(`${BACKEND_URL}/pinterest/boards`);'),
  "Bare /pinterest/boards request must not return"
);

console.log("PASS campaign Pinterest authenticated-userId regression");