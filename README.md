# Book Scraper

This project is a Node.js application designed to scrape JSON content (related to a book) from a specified API, permuting through volume, section, and page numbers. The scraped data is saved into a local directory structure.

## Setup

1.  **Clone the repository (if applicable) or navigate to the project directory.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
    (Note: This project uses native `fetch` available in Node.js 18+, so no external `node-fetch` package is required.)

## Environment Variables

This project uses a `.env` file to manage sensitive information, specifically the authorization token for the API.

1.  **Create a `.env` file:**
    Copy the `.env.example` file and rename it to `.env` in the root directory of the project.
    ```bash
    cp .env.example .env
    ```
2.  **Add your Authorization Token:**
    Open the newly created `.env` file and replace `your_authorization_token_here` with your actual bearer token.

    ```
    AUTH_TOKEN=your_authorization_token_here
    ```
    **Important:** Do not commit your `.env` file to version control. It should be ignored by Git (it's already included in `.gitignore`).

## Usage

To start the scraping process, run the following command:

```bash
npm start
```

This will execute the `main.js` script, which will begin fetching data from the API, saving it to the `scraped_data` directory.

## Project Structure

*   `main.js`: The main script that orchestrates the scraping process, including iteration logic, retry mechanism, and saving data. It also handles resume capability and specific API error codes.
*   `scraper.js`: Contains the core `fetch` logic for making API requests to retrieve book page content.
*   `scraped_data/`: This directory will be created automatically and will store the scraped JSON content, organized by volume and section.
*   `package.json`: Node.js project configuration and scripts.
*   `progress.json`: Stores the last successfully scraped volume, section, and page for resuming the scrape.
*   `sample.js`: Original sample `fetch` request provided for reference.

## Important Notes

*   The scraper currently permutes `volumeNumber`, `sectionNumber`, and `pageNumber` starting from 1.
*   **Resume Capability:** The scraper saves its progress to `progress.json` and can resume from the last successfully scraped page if interrupted.
*   **Rate Limiting (429) Handling:** The scraper will pause for 10 seconds and retry if it encounters a `429 Too Many Requests` error.
*   **Insufficient Credit Error:** The API may return a `validation.code: 14` with the message "Insufficient credit to deduct the page study fee". If this error is encountered, the scraper will log the error and stop the scraping process, as it indicates a business-level restriction from the API that cannot be bypassed by the scraper. Ensure your authorization token has sufficient access or credit.
*   The logic for detecting the end of a section or volume is based on the API's response when a page does not exist (specifically, a `validation.code` of 2). This might need refinement based on further observation of the API's behavior.
*   Failed network requests (other than 429) are retried up to 3 times with a 2-second delay between retries.