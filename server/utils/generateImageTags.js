const { GoogleGenerativeAI } = require("@google/generative-ai");
const https = require("https");
const http = require("http");

let genAI = null;

function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      throw new Error("GEMINI_API_KEY is not configured in .env");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Downloads an image from a URL and returns a base64 string + mimeType.
 * @param {string} url
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
function fetchImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers["content-type"] || "image/jpeg";
        resolve({
          base64: buffer.toString("base64"),
          mimeType: contentType.split(";")[0],
        });
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Uses Gemini Vision to extract descriptive tags from an image URL.
 * Returns up to 10 concise keyword tags (e.g. ["black wallet", "leather", "card slots"]).
 * @param {string} imageUrl - Cloudinary HTTPS URL
 * @returns {Promise<string[]>} - Array of tag strings
 */
async function generateImageTags(imageUrl) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);

  const prompt = `You are an assistant for a Lost & Found system at a college campus.
Look at this image and return a JSON array of up to 10 concise descriptive keyword tags.
Focus on: object type, color, brand (if visible), material, size, distinctive features.
Respond ONLY with a valid JSON array of strings, no explanation.
Example: ["black wallet", "leather", "bifold", "card slots", "zipper coin pouch"]`;

  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    prompt,
  ]);

  const text = result.response.text().trim();

  // Extract JSON array from response (strip markdown code fences if present)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const tags = JSON.parse(jsonMatch[0]);
  return Array.isArray(tags) ? tags.slice(0, 10) : [];
}

module.exports = { generateImageTags };
