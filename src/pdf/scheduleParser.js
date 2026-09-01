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
// DEBUG RAW TEXT
// =====================================================

function debugRawText(page, items) {

  console.log(
    `\n====================================================`
  );

  console.log(
    `RAW TEXT - PAGE ${page.pageNumber}`
  );

  console.log(
    `====================================================`
  );


  const rawText =
    items
      .map(item => item.text)
      .join(' ');


  console.log(rawText);


  console.log(
    `\n========== END RAW TEXT PAGE ${page.pageNumber} ==========\n`
  );

}


// =====================================================
// DEBUG PAGE ITEMS WITH POSITION
// =====================================================

function debugPageItems(page) {

  console.log(
    `\n====================================================`
  );

  console.log(
    `POSITIONED ITEMS - PAGE ${page.pageNumber}`
  );

  console.log(
    `====================================================`
  );


  for (const item of page.items) {

    console.log(

      `[${item.x.toFixed(1)}, ${item.y.toFixed(1)}]`,

      `[W:${item.width.toFixed(1)} H:${item.height.toFixed(1)}]`,

      item.text

    );

  }


  console.log(
    `\n========== END PAGE ${page.pageNumber} ==========\n`
  );

}


// =====================================================
// EXTRACT ALL PAGES
// =====================================================

async function extractPdfItems(buffer) {

  const pdf =
    await loadPdf(buffer);

  const pages = [];


  console.log(
    `\n####################################################`
  );

  console.log(
    `[PDF] Number of pages: ${pdf.numPages}`
  );

  console.log(
    `####################################################\n`
  );


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    const page =
      await pdf.getPage(pageNumber);


    const items =
      await extractPageItems(page);


    const pageData = {

      pageNumber,

      items

    };


    pages.push(pageData);


    // =================================================
    // DEBUG RAW TEXT
    // =================================================

    debugRawText(
      page,
      items
    );


    // =================================================
    // DEBUG POSITIONED ITEMS
    // =================================================

    debugPageItems(
      pageData
    );

  }


  return pages;

}


// =====================================================
// NORMALIZE ROW
// =====================================================

function normalizeRow(row) {

  return {

    DetailMark:
      row.DetailMark || '',

    StartStorey:
      row.StartStorey || '',

    EndStorey:
      row.EndStorey || '',

    Width:
      Number(row.Width) || 0,

    Breadth:
      Number(row.Breadth) || 0,

    BottomRebar:
      row.BottomRebar || '',

    TopRebar:
      row.TopRebar || '',

    Stirrups:
      row.Stirrups || '',

    Method:
      row.Method || ''

  };

}


// =====================================================
// PARSE COLUMN SCHEDULE
// =====================================================

function parseColumnSchedule(pages) {

  const rows = [];


  // ===================================================
  // YOUR COLUMN SCHEDULE PARSING LOGIC
  // ===================================================
  //
  // The raw PDF items are available here:
  //
  // pages[n].items
  //
  // Each item contains:
  //
  // {
  //   text,
  //   x,
  //   y,
  //   width,
  //   height
  // }
  //
  // ===================================================


  return rows.map(
    normalizeRow
  );

}


// =====================================================
// EXTRACT COLUMN SCHEDULE
// =====================================================

export async function extractColumnSchedule(buffer) {

  console.log(
    '\n===================================================='
  );

  console.log(
    '[PDF] START COLUMN SCHEDULE EXTRACTION'
  );

  console.log(
    '====================================================\n'
  );


  // ===================================================
  // EXTRACT PDF ITEMS
  // ===================================================

  const pages =
    await extractPdfItems(buffer);


  console.log(
    `\n[PDF] Extraction complete`
  );

  console.log(
    `[PDF] Pages extracted: ${pages.length}`
  );


  // ===================================================
  // GENERATE ROWS
  // ===================================================

  const rows =
    parseColumnSchedule(
      pages
    );


  // ===================================================
  // DEBUG FINAL ROWS
  // ===================================================

  console.log(
    '\n===================================================='
  );

  console.log(
    '[PDF] FINAL PARSED ROWS'
  );

  console.log(
    '===================================================='
  );


  console.log(
    JSON.stringify(
      rows,
      null,
      2
    )
  );


  // ===================================================
  // RETURN ROWS
  // ===================================================

  return rows;

}




// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';


// // =====================================================
// // LOAD PDF
// // =====================================================

// async function loadPdf(buffer) {

//   const loadingTask =
//     pdfjsLib.getDocument({
//       data: new Uint8Array(buffer)
//     });

//   return await loadingTask.promise;
// }


// // =====================================================
// // EXTRACT TEXT WITH POSITION
// // =====================================================

// async function extractPageItems(page) {

//   const content =
//     await page.getTextContent();

//   return content.items

//     .filter(item =>
//       item.str &&
//       item.str.trim()
//     )

//     .map(item => {

//       const transform =
//         item.transform;

//       return {

//         text:
//           item.str.trim(),

//         x:
//           transform[4],

//         y:
//           transform[5],

//         width:
//           item.width || 0,

//         height:
//           item.height || 0

//       };

//     });

// }


// // =====================================================
// // EXTRACT ALL PAGES
// // =====================================================

// async function extractPdfItems(buffer) {

//   const pdf =
//     await loadPdf(buffer);

//   const pages = [];

//   for (
//     let pageNumber = 1;
//     pageNumber <= pdf.numPages;
//     pageNumber++
//   ) {

//     const page =
//       await pdf.getPage(pageNumber);

//     const items =
//       await extractPageItems(page);

//     pages.push({

//       pageNumber,

//       items

//     });

//   }

//   return pages;

// }


// // =====================================================
// // DEBUG PAGE ITEMS
// // =====================================================

// function debugPageItems(page) {

//   console.log(
//     `\n========== PAGE ${page.pageNumber} ==========`
//   );

//   for (const item of page.items) {

//     console.log(
//       `[${item.x.toFixed(1)}, ${item.y.toFixed(1)}]`,
//       item.text
//     );

//   }

// }


// // =====================================================
// // EXTRACT COLUMN SCHEDULE
// // =====================================================

// export async function extractColumnSchedule(buffer) {

//   // ===================================================
//   // EXTRACT PDF ITEMS
//   // ===================================================

//   const pages =
//     await extractPdfItems(buffer);


//   // ===================================================
//   // TEMPORARY DEBUG
//   // ===================================================

//   for (const page of pages) {

//     debugPageItems(page);

//   }


//   // ===================================================
//   // YOUR EXISTING JSON GENERATION CODE
//   // ===================================================
//   //
//   // Put the existing parsing logic here.
//   //
//   // Example:
//   //
//   // const rows = ...
//   //
//   // return rows;
//   // ===================================================


//   return pages;

// }

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