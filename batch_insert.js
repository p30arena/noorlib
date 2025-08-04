require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");

const hadiths = require(`./scraped_data/${process.env.BOOK_NAME}/hadiths_translated.json`);

const irabRegex = /[\u0617-\u061A\u064B-\u065F\u0670]/g;

function removeIrab(text) {
  if (typeof text !== "string") {
    return text; // Handle non-string inputs gracefully
  }

  // Define a regular expression that matches Arabic diacritics (اعراب).
  // This includes:
  // - Fatha (َ)
  // - Kasra (ِ)
  // - Damma (ُ)
  // - Sukun (ْ)
  // - Tanwin Fath (ً)
  // - Tanwin Kasr (ٍ)
  // - Tanwin Damm (ٌ)
  // - Shadda (ّ)
  // - Madda (ٓ)
  // - Hamza above (ٔ)
  // - Hamza below (ٕ)
  // - Dagger Alif (ٰ)

  return text.replace(irabRegex, "");
}

const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

async function main() {
  const indexName = process.env.ELASTICSEARCH_INDEX_NAME;

  console.log(`Checking if index "${indexName}" exists...`);
  const indexExists = await client.indices.exists({ index: indexName });

  if (!indexExists) {
    console.log(`Index "${indexName}" does not exist.`);
    process.exit(-1);
  } else {
    console.log(`Index "${indexName}" already exists.`);
  }

  const chunkSize = 100;
  for (let i = 0; i < hadiths.length; i += chunkSize) {
    const chunk = hadiths.slice(i, i + chunkSize);
    const body = chunk.flatMap((doc) => {
      const {
        id,
        title,
        title_fa,
        content,
        content_fa,
        sanad,
        ghael,
        vol,
        page,
      } = doc;
      const transformedDoc = {
        book: {
          title: process.env.BOOK_TITLE,
          page_no: page,
          vol_no: vol,
        },
        title: title_fa,
        topic: title,
        text_arabic_irab: content,
        text_arabic: removeIrab(content),
        text_farsi: content_fa,
        sayers_list: ghael ? [ghael] : sanad ? [sanad] : [],
        keywords: [],
        categories: [],
      };
      return [
        { index: { _index: indexName, _id: `${process.env.BOOK_NAME}_${id}` } },
        transformedDoc,
      ];
    });

    console.log(`Batch inserting documents ${i + 1} to ${i + chunk.length}...`);
    const bulkResponse = await client.bulk({ refresh: true, body });

    if (bulkResponse.errors) {
      const erroredDocuments = [];
      bulkResponse.items.forEach((action, i) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: body[i * 2],
            document: body[i * 2 + 1],
          });
        }
      });
      console.log("Errored documents:", erroredDocuments);
    }
  }

  const countResponse = await client.count({ index: indexName });
  console.log(`There are ${countResponse.count} documents in the index.`);
}

main().catch(console.error);
