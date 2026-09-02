import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';


// =====================================================
// LOAD PDF
// =====================================================

async function loadPdf(buffer) {

  console.log('[PDF] Loading PDF...');

  const loadingTask =
    pdfjsLib.getDocument({
      data: new Uint8Array(buffer)
    });

  const pdf =
    await loadingTask.promise;

  console.log(
    `[PDF] PDF loaded successfully. Pages: ${pdf.numPages}`
  );

  return pdf;
}


// =====================================================
// EXTRACT PAGE ITEMS
// =====================================================

async function extractPageItems(page) {

  const content =
    await page.getTextContent();

  return content.items

    .filter(item =>
      item.str &&
      item.str.trim()
    )

    .map(item => {

      const transform =
        item.transform;

      return {

        text:
          item.str.trim(),

        x:
          Number(transform[4]) || 0,

        y:
          Number(transform[5]) || 0,

        width:
          Number(item.width) || 0,

        height:
          Number(item.height) || 0

      };

    });
}


// =====================================================
// DEBUG PAGE
// =====================================================

function debugPage(page) {

  console.log('');
  console.log(
    '===================================================='
  );

  console.log(
    `PAGE ${page.pageNumber}`
  );

  console.log(
    '===================================================='
  );


  console.log('');
  console.log('----- RAW TEXT -----');
  console.log('');


  const rawText =
    page.items
      .map(item => item.text)
      .join(' ');


  console.log(rawText);


  console.log('');
  console.log('----- POSITIONED ITEMS -----');
  console.log('');


  for (const item of page.items) {

    console.log(
      `[${item.x.toFixed(1)}, ${item.y.toFixed(1)}]`,
      item.text
    );

  }


  console.log('');
  console.log(
    `Total items: ${page.items.length}`
  );

  console.log(
    '===================================================='
  );

}


// =====================================================
// EXTRACT ALL PDF ITEMS
// =====================================================

async function extractPdfItems(buffer) {

  const pdf =
    await loadPdf(buffer);

  const pages = [];


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    console.log(
      `[PDF] Extracting page ${pageNumber}/${pdf.numPages}...`
    );


    const page =
      await pdf.getPage(pageNumber);


    const items =
      await extractPageItems(page);


    const pageData = {

      pageNumber,

      items

    };


    pages.push(pageData);


    debugPage(pageData);

  }


  return pages;

}


// =====================================================
// EXTRACT COLUMN SCHEDULE
// =====================================================

export async function extractColumnSchedule(buffer) {

  console.log('');
  console.log(
    '####################################################'
  );

  console.log(
    '[PDF] START EXTRACTION'
  );

  console.log(
    '####################################################'
  );


  const pages =
    await extractPdfItems(buffer);


  // ===================================================
  // COMPLETE RAW TEXT
  // ===================================================

  const rawText =
    pages

      .map(page =>
        page.items
          .map(item => item.text)
          .join(' ')
      )

      .join('\n');


  console.log('');
  console.log(
    '####################################################'
  );

  console.log(
    '[PDF] COMPLETE RAW TEXT'
  );

  console.log(
    '####################################################'
  );

  console.log('');

  console.log(rawText);

  console.log('');

  console.log(
    '####################################################'
  );


  // ===================================================
  // RETURN EXTRACTED DATA
  // ===================================================

  return pages;

}