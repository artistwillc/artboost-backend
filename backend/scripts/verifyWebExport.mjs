// ARTBOOST_WEB_EXPORT_VERIFY_V1_20260929
import fs from "node:fs";
import path from "node:path";

const frontendRoot = path.resolve(process.cwd(), "../frontend");
const distRoot = path.join(frontendRoot, "dist");
const required = [
  path.join(distRoot, "index.html"),
  path.join(distRoot, "web-auth.html"),
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required Expo web export: ${file}`);
    process.exit(1);
  }
}

const authHtml = fs.readFileSync(path.join(distRoot, "web-auth.html"), "utf8");
if (!authHtml.includes("/app/")) {
  console.error("web-auth.html was exported without the required /app base path.");
  process.exit(1);
}

console.log("ArtBoost web export verified: index.html + web-auth.html + /app base path.");
