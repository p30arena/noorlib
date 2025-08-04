const { fetchBookPage } = require('./scraper');
const fs = require('fs');
const path = require('path');

const BOOK_DIR = `./scraped_data/${process.env.BOOK_NAME}`;
const PROGRESS_FILE = `${BOOK_DIR}/progress.json`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds
const TOO_MANY_REQUESTS_DELAY_MS = 10000; // 10 seconds for 429 errors

async function saveJsonToFile(data, volume, section, page) {
  const dirPath = path.join(BOOK_DIR, `volume_${volume}`, `section_${section}`);
  const filePath = path.join(dirPath, `page_${page}.json`);

  await fs.promises.mkdir(dirPath, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved: ${filePath}`);
}

async function saveProgress(volume, section, page) {
  const progress = { volume, section, page };
  await fs.promises.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function loadProgress() {
  try {
    const data = await fs.promises.readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No progress file found. Starting from the beginning.');
      return { volume: 1, section: 1, page: 1 };
    }
    console.error('Error loading progress file:', error);
    return { volume: 1, section: 1, page: 1 };
  }
}

async function scrapeBook() {
  let { volume, section, page } = await loadProgress();

  let continueScraping = true;

  while (continueScraping) {
    console.log(`Attempting to scrape V${volume} S${section} P${page}`);
    let data = null;
    let retries = 0;
    let delay = RETRY_DELAY_MS;

    while (retries < MAX_RETRIES) {
      try {
        data = await fetchBookPage(volume, section, page);
        if (data) {
          break; // Success
        }
      } catch (error) {
        if (error.message === "HTTP_TOO_MANY_REQUESTS") {
          console.warn(`Received 429 Too Many Requests. Waiting ${TOO_MANY_REQUESTS_DELAY_MS / 1000} seconds before retrying.`);
          delay = TOO_MANY_REQUESTS_DELAY_MS;
        } else {
          console.error(`Error fetching data: ${error.message}`);
          delay = RETRY_DELAY_MS;
        }
      }
      retries++;
      console.warn(`Retrying V${volume} S${section} P${page} (attempt ${retries}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!data) {
      console.error(`Failed to fetch V${volume} S${section} P${page} after ${MAX_RETRIES} retries. Moving to next possible section/volume.`);
      // If a page consistently fails, it might mean the end of a section or volume.
      // This logic assumes that if a page fails after retries, we should advance.
      // This is a heuristic and might need adjustment based on real API behavior.
      page = 1;
      section++;
      console.log(`Moving to next section: V${volume} S${section}`);
      await saveProgress(volume, section, page); // Save progress even on failure to advance
      continue;
    }

    // Check for "page does not exist" condition or insufficient credit
    const validation = data.data && data.data.length > 0 && data.data[0].validation;
    const isPageNotFound = validation && validation.code === 2;
    const isInsufficientCredit = validation && validation.code === 14;

    if (isInsufficientCredit) {
      console.error(`Error: Insufficient credit to access V${volume} S${section} P${page}. Stopping scraper.`);
      continueScraping = false; // Stop the scraper
      break; // Exit the while loop
    } else if (isPageNotFound) {
      console.log(`Page V${volume} S${section} P${page} does not exist. Advancing to next section or volume.`);
      // Heuristic: If section 1 and page 1 is not found, assume end of volume and try next volume.
      // This needs careful testing with the actual API.
      // If page 1 of the current section is not found, it means the volume has ended.
      if (page === 1 && section === 1) {
          console.log('Done Scraping.');
          break; // End of book
      } if (page === 1) {
        section = 1;
        volume++;
        console.log(`Moving to next volume: V${volume} S${section}`);
      } else {
        page = 1;
        section++;
        console.log(`Moving to next section: V${volume} S${section}`);
      }
      await saveProgress(volume, section, page);
    } else {
      await saveJsonToFile(data, volume, section, page);
      await saveProgress(volume, section, page + 1); // Save progress for the *next* page
      page++;
    }
  }
}

scrapeBook();