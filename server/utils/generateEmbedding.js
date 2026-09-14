const { GoogleGenerativeAI } = require("@google/generative-ai");

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
 * Generates a 768-dimensional text embedding using Gemini embedding-001.
 * (text-embedding-004 requires the v1 API endpoint; embedding-001 works on v1beta
 *  which is the default used by the @google/generative-ai JS SDK.)
 * @param {string} text - The text to embed (title + description + category + location)
 * @returns {Promise<number[]>} - Float array of length 768
 */
async function generateTextEmbedding(text) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

module.exports = { generateTextEmbedding };
