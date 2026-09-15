import assert from "node:assert/strict";
import { buildMetaSafeCloudinaryUrl } from "../services/mediaHostingService.js";

const source =
  "https://res.cloudinary.com/dcypp6xvl/image/upload/v1789470180/artboost-ai/automation/e624b77f42b930367e9e8943b9856f85.jpg";
const expected =
  "https://res.cloudinary.com/dcypp6xvl/image/upload/f_jpg,q_auto:good,cs_srgb,c_limit,w_1080,h_1080/v1789470180/artboost-ai/automation/e624b77f42b930367e9e8943b9856f85.jpg";

assert.equal(buildMetaSafeCloudinaryUrl(source), expected);
assert.equal(
  buildMetaSafeCloudinaryUrl("https://example.com/artwork.webp"),
  "https://example.com/artwork.webp"
);
assert.equal(
  buildMetaSafeCloudinaryUrl(
    "https://res.cloudinary.com/demo/image/upload/v1/folder/art.png"
  ),
  "https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto:good,cs_srgb,c_limit,w_1080,h_1080/v1/folder/art.jpg"
);

console.log("PASS meta-media-regression");
