require('dotenv').config();
const { GoogleGenAI, Type } = require("@google/genai");
const fs = require("fs/promises");
const { confirm } = require("@inquirer/prompts");

const BOOK_DIR = `./scraped_data/${process.env.BOOK_NAME}`;
const apiKeys = (process.env.GEMINI_API_KEY || "").split(",").filter(Boolean);
let currentApiKeyIndex = 0;
let consecutiveErrors = 0;
let fullCycleCompleted = false;

if (!apiKeys.length) {
  console.error("No Gemini API keys found. Please check your .env file.");
  process.exit(1);
}

const titleCache = {};

async function translateText(text, isTitle = false) {
  if (isTitle && titleCache[text]) {
    return titleCache[text];
  }

  const prefix = "Translate the following Arabic text to Farsi:";
  const title_sufix = `
  ### Translation Helpers
   - The word "باب" is "موضوع".
   - The word "کراث" is "تره".
   - The word "جبن" is "پنیر".
   - The word "مفضل" sometimes relates to a person.
  `;
  const prompt = `${prefix} ${isTitle ? title_sufix : ""}\n---\n${text}`;

  const maxAttempts = apiKeys.length * 3; // A generous number of attempts
  let attempt = 0;

  while (attempt < maxAttempts) {
    const apiKey = apiKeys[currentApiKeyIndex];
    const ai = new GoogleGenAI({ apiKey });
    attempt++;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translation: {
                type: Type.STRING,
              },
            },
            required: ["translation"],
          },
        },
      });
      const translated = JSON.parse(response.text).translation;
      consecutiveErrors = 0; // Reset on success
      if (isTitle) {
        titleCache[text] = translated;
      }
      return translated;
    } catch (error) {
      console.error(`Error with API key index ${currentApiKeyIndex}:`, error.message);

      if (error.status === 429 || error.status === 503) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0; // Reset for other errors
      }

      // Switch to the next key
      currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;
      if (currentApiKeyIndex === 0) {
        fullCycleCompleted = true;
        console.log("Completed a full cycle through API keys.");
      }
      console.log(`Switching to API key index ${currentApiKeyIndex}`);

      if (fullCycleCompleted && consecutiveErrors >= 2) {
        const delay = Math.pow(2, 3) * 1000;
        console.log(`Two consecutive errors after a full cycle. Backing off for ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
        consecutiveErrors = 0; // Reset after backoff
      }
    }
  }

  console.error("Max attempts reached. Failed to translate text:", text);
  return text; // Return original text if all retries fail
}

async function fixTranslatedFile() {
  const filePath = `${BOOK_DIR}/hadiths_translated.json`;
  try {
    const data = await fs.readFile(filePath, "utf8");
    const fixedData = data
      .replace(/\(ص\)/g, "(صلوات الله علیه)")
      .replace(/\(ع\)/g, "(علیه السلام)");
    await fs.writeFile(filePath, fixedData, "utf8");
    console.log("Fixed special characters in the translated file.");
  } catch (error) {
    console.error("Error fixing the translated file:", error);
  }
}

async function main() {
  try {
    const data = await fs.readFile(`${BOOK_DIR}/hadiths.json`, "utf8");
    const hadiths = JSON.parse(data);
    let translatedHadiths = [];

    const doTranslate = await confirm({
      message: "Do you want to translate the book?",
      default: true,
    });

    if (!doTranslate) {
      console.log("Skipping translation. Generating Farsi JSON directly.");
      const hadithsInFarsi = hadiths.map((hadith) => ({
        ...hadith,
        title: "",
        content: "",
        title_fa: hadith.title,
        content_fa: hadith.content,
      }));

      await fs.writeFile(
        `${BOOK_DIR}/hadiths_translated.json`,
        JSON.stringify(hadithsInFarsi, null, 2)
      );
      console.log("Generated Farsi JSON file without translation.");
      return;
    }

    // Load existing translations to resume progress
    try {
      const translatedData = await fs.readFile(`${BOOK_DIR}/hadiths_translated.json`, "utf8");
      translatedHadiths = JSON.parse(translatedData);
      console.log(`Loaded ${translatedHadiths.length} existing translations.`);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("No existing translated file found. Starting fresh.");
      } else {
        throw error;
      }
    }

    const translatedIds = new Set(translatedHadiths.map((h) => h.id));

    for (const hadith of hadiths) {
      if (translatedIds.has(hadith.id)) {
        continue;
      }

      if (!hadith.content.trim()) {
        continue;
      }

      console.log(`Translating hadith ID: ${hadith.id}`);

      const translatedTitle = await translateText(hadith.title, true);
      const translatedContent = await translateText(hadith.content);

      const newHadith = {
        ...hadith,
        title_fa: translatedTitle.trim(),
        content_fa: translatedContent.trim(),
      };

      translatedHadiths.push(newHadith);

      // Save after each translation
      await fs.writeFile(
        `${BOOK_DIR}/hadiths_translated.json`,
        JSON.stringify(translatedHadiths, null, 2)
      );
      console.log(`Finished and saved hadith ID: ${hadith.id}`);
    }

    console.log(
      "Translation complete. All hadiths processed."
    );
  } catch (error) {
    console.error("An error occurred:", error);
  }

  await fixTranslatedFile();
}

main();