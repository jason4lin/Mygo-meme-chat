const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.static("public"));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

let MEME_DATABASE = [];
let model = null;

// Initialize Server and Fetch Memes
async function initialize() {
  try {
    console.log("Fetching meme metadata from new API...");
    // Fetch all memes from the user-provided endpoint
    const response = await fetch("https://mygoapi.miyago9267.com/mygo/all_img");
    const data = await response.json();

    // The structure is { urls: [ { url: "...", alt: "..." }, ... ] }
    if (data.urls && Array.isArray(data.urls)) {
      MEME_DATABASE = data.urls
        .filter((img) => img.alt) // Ensure alt text exists
        .map((img) => ({
          alt: img.alt,
          url: img.url,
        }));
    }

    console.log(`Loaded ${MEME_DATABASE.length} memes.`);

    console.log(`Loaded ${MEME_DATABASE.length} memes.`);

    // Note: Model is now instantiated per request via header key

    const PORT = 8088;
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize server:", error);
  }
}

initialize();

// Chat Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    console.log("------------------------------------------------");

    // 1. Get API Key from Header
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      console.warn("Missing API Key in headers");
      return res
        .status(401)
        .json({ error: "Missing API Key. Please enter it in the frontend." });
    }

    // 2. Instantiate Model Per Request (Stateless Auth)
    const genAI = new GoogleGenerativeAI(apiKey);
    const requestModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 20,
      },
    });

    console.log("Incoming Request Body:", JSON.stringify(req.body, null, 2));

    const userMessage = req.body.message || "";
    // Safe parse history
    let chatHistory = [];
    if (Array.isArray(req.body.history)) {
      chatHistory = req.body.history;
    } else {
      console.warn("History is not an array:", req.body.history);
    }

    console.log("Parsed User Message:", userMessage);

    // Construct History String Safe Guard
    const historyText = chatHistory
      .slice(-5)
      .map((msg) => {
        const role =
          msg.role === "user" || msg.role === "ai" ? msg.role : "unknown";
        const label = role === "user" ? "User" : "Bot";
        // Ensure content is string
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content || "");
        return `${label}: ${content}`;
      })
      .join("\n");

    console.log("Formatted History Context:\n", historyText);

    // Construct a "One-Shot" prompt with the list effectively injected
    const fullPrompt = `
    TASK: You are a Meme Selection Engine.
    
    CONTEXT: The user is chatting with you. You must reply with a meme.
    The "List of Valid Outputs" below contains the "Alt Text" (Descriptions) of the memes you have.
    Most of them are in Traditional Chinese.
    
    HISTORY:
    ${historyText}
    
    INPUT User Message (Language varies): "${userMessage}"
    
    INSTRUCTION:
    1. Analyze the User Message.
    2. If the message is in English (e.g. "I am hungry"), mentally translate it or find the equivalent Chinese sentiment (e.g. "肚子餓").
    3. Look through the "LIST OF VALID OUTPUTS" to find the BEST match for that sentiment.
    4. CRITICAL: You MUST output the EXACT string from the list. Do not translate the output. Keep it in Chinese as listed.
    
     LIST OF VALID OUTPUTS:
    ${MEME_DATABASE.map((m) => m.alt).join("\n")}
    
    BEST MATCHING ALT TEXT (Exact Chinese string from list):
    `;

    // Call LLM
    const result = await requestModel.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    });
    let responseText = result.response.text().trim();
    console.log("Raw from LLM:", JSON.stringify(responseText));

    // Find the URL for the chosen alt text
    let selectedMeme = MEME_DATABASE.find((m) => m.alt === responseText);

    if (!selectedMeme) {
      // Fuzzy match
      selectedMeme = MEME_DATABASE.find(
        (m) => m.alt.includes(responseText) || responseText.includes(m.alt)
      );
    }

    // Clean up if the LLM outputted something like "Best Matching: X"
    if (!selectedMeme) {
      // Last ditch effort: pick the first one matching substring
      const potential = MEME_DATABASE.find((m) => responseText.includes(m.alt));
      if (potential) selectedMeme = potential;
    }

    console.log("Selected Alt:", responseText);

    res.setHeader("Content-Type", "text/plain");
    res.send(responseText);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Error processing request: " + error.message);
  }
});

// Proxy/Image Lookup Endpoint
app.get("/api/meme", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  // 1. Check Local Cache (Exact or Fuzzy)
  let cachedMeme = MEME_DATABASE.find((m) => m.alt === query);

  if (!cachedMeme) {
    cachedMeme = MEME_DATABASE.find(
      (m) => m.alt.includes(query) || query.includes(m.alt)
    );
  }

  if (cachedMeme) {
    console.log(`Meme Found: "${cachedMeme.alt}" -> ${cachedMeme.url}`);
    return res.json({ data: [{ url: cachedMeme.url }] });
  }

  console.log(`Meme NOT Found: "${query}"`);
  res.json({ data: [] });
});
