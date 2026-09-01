// =====================================================
// pdfExtractor.js
// =====================================================

import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// =====================================================
// EXTRACT PDF ITEMS
// =====================================================

export async function extractPdfItems(buffer) {

  const loadingTask =
    pdfjsLib.getDocument({
      data: buffer
    });

  const pdf =
    await loadingTask.promise;

  const pages = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    const pdfPage =
      await pdf.getPage(pageNumber);

    const textContent =
      await pdfPage.getTextContent();

    const items = [];

    for (const item of textContent.items) {

      if (!item.str || !item.str.trim()) {
        continue;
      }

      const transform = item.transform;

      const x = transform[4];

      const y = transform[5];

      items.push({
        text: item.str.trim(),
        x,
        y,
        width: item.width || 0,
        height: item.height || 0
      });

    }

    pages.push({
      pageNumber,
      items
    });

  }

  return pages;

}

function debugPageItems(page) {

  console.log(
    `\n========== PAGE ${page.pageNumber} ==========`
  );

  for (const item of page.items) {

    console.log(
      `[${item.x.toFixed(1)}, ${item.y.toFixed(1)}]`,
      item.text
    );

  }

}

// =====================================================
// MAIN PDF PROCESSING
// =====================================================

export async function processPdf(buffer) {

  // ---------------------------------------------------
  // Extract PDF
  // ---------------------------------------------------

  const pages =
    await extractPdfItems(buffer);


  // ---------------------------------------------------
  // DEBUG PDF ITEMS
  // ---------------------------------------------------
  // TEMPORARY
  // Remove this section after debugging.
  // ---------------------------------------------------

  for (const page of pages) {

    debugPageItems(page);

  }


  // ---------------------------------------------------
  // FINAL JSON GENERATION
  // ---------------------------------------------------
  //
  // Put your existing JSON-generation code here.
  //
  // Example:
  //
  // const result =
  //   generateFinalJson(pages);
  //
  // return result;
  // ---------------------------------------------------

  return pages;

}


// =====================================================
// OPTIONAL: RUN DIRECTLY
// =====================================================

async function main() {

  const pdfPath =
    process.argv[2];

  if (!pdfPath) {

    console.error(
      "Usage: node pdfExtractor.js <pdf-file>"
    );

    process.exit(1);

  }

  if (!fs.existsSync(pdfPath)) {

    console.error(
      `PDF file not found: ${pdfPath}`
    );

    process.exit(1);

  }

  const buffer =
    fs.readFileSync(pdfPath);

  const pages =
    await processPdf(buffer);

  console.log(
    `\nExtracted ${pages.length} page(s).`
  );

}


// =====================================================
// RUN
// =====================================================

if (
  process.argv[1] &&
  process.argv[1].endsWith("pdfExtractor.js")
) {

  main().catch(error => {

    console.error(
      "\nPDF extraction failed:"
    );

    console.error(error);

    process.exit(1);

  });

}

// import fs from 'fs';

// export async function loadPdf(pdfPath) {

//   if (!fs.existsSync(pdfPath)) {
//     throw new Error(`PDF not found: ${pdfPath}`);
//   }

//   return fs.readFileSync(pdfPath);
// }


// export async function extractPdfText(pdfPath) {

//   const pdfBuffer = await loadPdf(pdfPath);

//   // PDF parser will go here

//   return {
//     pages: [],
//     text: ''
//   };
// }