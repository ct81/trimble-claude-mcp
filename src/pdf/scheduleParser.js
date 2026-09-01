import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';


// =====================================================
// LOAD PDF
// =====================================================

async function loadPdf(buffer) {

  const loadingTask =
    pdfjsLib.getDocument({
      data: new Uint8Array(buffer)
    });

  return await loadingTask.promise;
}


// =====================================================
// EXTRACT TEXT WITH POSITION
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
          transform[4],

        y:
          transform[5],

        width:
          item.width || 0,

        height:
          item.height || 0

      };

    });

}


// =====================================================
// EXTRACT ALL PAGES
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

    const page =
      await pdf.getPage(pageNumber);

    const items =
      await extractPageItems(page);

    pages.push({

      pageNumber,

      items

    });

  }

  return pages;

}


// =====================================================
// DEBUG PAGE ITEMS
// =====================================================

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
// EXTRACT COLUMN SCHEDULE
// =====================================================

export async function extractColumnSchedule(buffer) {

  // ===================================================
  // EXTRACT PDF ITEMS
  // ===================================================

  const pages =
    await extractPdfItems(buffer);


  // ===================================================
  // TEMPORARY DEBUG
  // ===================================================

  for (const page of pages) {

    debugPageItems(page);

  }


  // ===================================================
  // YOUR EXISTING JSON GENERATION CODE
  // ===================================================
  //
  // Put the existing parsing logic here.
  //
  // Example:
  //
  // const rows = ...
  //
  // return rows;
  // ===================================================


  return pages;

}

// export function parseColumnSchedule(pdfData) {

//   console.log(
//     '[PDF Parser] PDF data received'
//   );

//   console.log(
//     '[PDF Parser] Keys:',
//     Object.keys(pdfData || {})
//   );

//   console.log(
//     '[PDF Parser] Text length:',
//     pdfData?.text?.length || 0
//   );


//   // Temporary test row
//   return [];
// }



// export function parseColumnSchedule(pdfData) {

//   const rows = [];

//   // Find DetailMark
//   const detailMarks = findDetailMarks(pdfData);

//   // Find storeys
//   const storeys = findStoreys(pdfData);

//   // Find dimensions
//   const dimensions = findDimensions(pdfData);

//   // Find reinforcement
//   const reinforcement = findReinforcement(pdfData);

//   // Find stirrups
//   const stirrups = findStirrups(pdfData);

//   // Find method
//   const methods = findMethods(pdfData);

//   // Match everything together
//   for (const detailMark of detailMarks) {

//     rows.push({
//       DetailMark: detailMark,
//       StartStorey: '',
//       EndStorey: '',
//       Width: '',
//       Breadth: '',
//       BottomRebar: '',
//       TopRebar: '',
//       Stirrups: '',
//       Method: ''
//     });

//   }

//   return rows;
// }