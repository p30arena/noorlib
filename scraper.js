require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE_URL = "https://noorlib.ir/api/book/getBookPageContent";
const HEADERS = {
  "accept": "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9,ar;q=0.8,fa;q=0.7",
  "authorization": `Bearer ${process.env.AUTH_TOKEN}`,
  "content-type": "application/json",
  "priority": "u=1, i",
  "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin"
};
const REFERRER = "https://noorlib.ir/";
const BOOK_ID = Number(process.env.BOOK_ID);

async function fetchBookPage(volumeNumber, sectionNumber, pageNumber) {
  const body = JSON.stringify({
    "origin": "noorlib.web.app",
    "language": "fa",
    "bookId": BOOK_ID,
    "bookView": false,
    volumeNumber,
    sectionNumber,
    "viewType": "html",
    "isReferralFromGoogleSearch": "",
    pageNumber
  });

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: HEADERS,
      referrer: REFERRER,
      body: body,
      mode: "cors",
      credentials: "include"
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("HTTP_TOO_MANY_REQUESTS");
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching data for V${volumeNumber} S${sectionNumber} P${pageNumber}:`, error);
    return null;
  }
}

// Export the function for testing or later use
module.exports = { fetchBookPage };