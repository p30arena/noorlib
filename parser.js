require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

const BOOK_DIR = `./scraped_data/${process.env.BOOK_NAME}`;
const OUTPUT_FILE = `${BOOK_DIR}/hadiths.json`;

async function getFilePaths(dir) {
  let allFiles = [];
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      allFiles = allFiles.concat(await getFilePaths(res));
    } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
      allFiles.push(res);
    }
  }
  return allFiles;
}

async function main() {
  console.log('Starting parser...');
  const filePaths = await getFilePaths(BOOK_DIR);

  const groupedFiles = filePaths.reduce((acc, filePath) => {
    const match = filePath.match(/volume_(\d+)\/section_(\d+)\/page_(\d+)\.json$/);
    if (match) {
      const [, volume, section, page] = match.map(Number);
      if (!acc[volume]) {
        acc[volume] = {};
      }
      if (!acc[volume][section]) {
        acc[volume][section] = [];
      }
      acc[volume][section].push({ path: filePath, page });
    }
    return acc;
  }, {});

  const sortedPaths = [];
  const sortedVolumes = Object.keys(groupedFiles).sort((a, b) => Number(a) - Number(b));

  for (const volume of sortedVolumes) {
    const sortedSections = Object.keys(groupedFiles[volume]).sort((a, b) => Number(a) - Number(b));
    for (const section of sortedSections) {
      const pages = groupedFiles[volume][section];
      // Create a new sorted array instead of sorting in-place to be safe
      const sortedPages = [...pages].sort((a, b) => a.page - b.page);
      for (const page of sortedPages) {
        sortedPaths.push(page.path);
      }
    }
  }

  console.log(`Found ${sortedPaths.length} files to parse.`);

  const hadithsById = {};
  let currentTitle = 'Untitled';

  for (const filePath of sortedPaths) {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    const paragList = jsonData.data[0].paragList;

    if (!paragList) continue;

    const match = filePath.match(/volume_(\d+)\/section_(\d+)\/page_(\d+)\.json$/);
    if (!match) continue;
    const [, volume, section, page] = match.map(Number);

    for (const parag of paragList) {
      const $ = cheerio.load(parag.text, { decodeEntities: false });
      const heading = $('heading').text().trim();
      if (heading) {
        currentTitle = heading;
      }

      $('format.hadith').each((index, hadithElement) => {
        const $hadith = $(hadithElement);
        let revayatIndex = $hadith.attr('revayatindex');

        if (!revayatIndex) {
          const paragraphId = $hadith.closest('p').attr('id');
          revayatIndex = `gen_${filePath}_${paragraphId}`;
        }

        const existingHadith = hadithsById[revayatIndex];

        const contentClone = $hadith.clone();
        contentClone.find('format.sanadHadith').remove();
        contentClone.find('lfootnote').remove();
        const hadithContent = contentClone.text().trim();

        if (existingHadith) {
          if (!existingHadith.pages.includes(page)) {
            existingHadith.pages.push(page);
          }
          if (hadithContent && !existingHadith.parts.includes(hadithContent)) {
            existingHadith.parts.push(hadithContent);
          }
        } else {
          const sanadElement = $hadith.find('format.sanadHadith');
          const ghaelElement = sanadElement.find('format.maasoom');
          const ghael = ghaelElement.text().trim();
          const sanad = sanadElement.text().trim();

          hadithsById[revayatIndex] = {
            vol: volume,
            sec: section,
            pages: [page],
            id: revayatIndex,
            title: currentTitle,
            ghael: ghael,
            sanad: sanad,
            parts: hadithContent ? [hadithContent] : [],
          };
        }
      });
    }
  }

  // Fallback for books with a different structure
  if (Object.keys(hadithsById).length === 0) {
    console.log('No hadiths found with the primary method. Trying fallback...');
    for (const filePath of sortedPaths) {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);
      const paragList = jsonData.data[0].paragList;

      if (!paragList) continue;

      const match = filePath.match(/volume_(\d+)\/section_(\d+)\/page_(\d+)\.json$/);
      if (!match) continue;
      const [, volume, section, page] = match.map(Number);

      for (const parag of paragList) {
        const $ = cheerio.load(parag.text, { decodeEntities: false });
        const text = $('p').text();
        const hadithMatch = text.match(/(.+) فرمود: «(.+)»/);

        if (hadithMatch) {
          const [, ghael, content] = hadithMatch;
          const revayatIndex = `fallback_${parag.paragraphId}`;

          if (!hadithsById[revayatIndex]) {
            hadithsById[revayatIndex] = {
              vol: volume,
              sec: section,
              pages: [page],
              id: revayatIndex,
              title: currentTitle,
              ghael: ghael.trim(),
              sanad: '', // No sanad info in this format
              parts: [content.trim()],
            };
          }
        }
      }
    }
  }

  const allHadiths = Object.values(hadithsById).map(h => {
    return {
      ...h,
      content: h.parts.join('\n').trim(),
      parts: undefined, // remove parts from final output
    };
  });

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(allHadiths, null, 2));
  console.log(`Successfully parsed and saved ${allHadiths.length} hadiths to ${OUTPUT_FILE}`);
  console.log('Parsing complete.');
}

main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});