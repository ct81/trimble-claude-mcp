import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';


export async function extractPdfText(pdfPath) {

  if (!fs.existsSync(pdfPath)) {

    throw new Error(
      `PDF not found: ${pdfPath}`
    );

  }


  const data =
    new Uint8Array(
      fs.readFileSync(pdfPath)
    );


  const loadingTask =
    pdfjsLib.getDocument({
      data
    });


  const pdf =
    await loadingTask.promise;


  const pages = [];

  let fullText = '';


  console.log(
    `[PDF] Number of pages: ${pdf.numPages}`
  );


  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {

    const page =
      await pdf.getPage(pageNumber);


    const content =
      await page.getTextContent();


    const items = [];


    for (
      const item of content.items
    ) {

      if (
        !item.str ||
        !item.str.trim()
      ) {
        continue;
      }


      const transform =
        item.transform || [];


      const x =
        transform[4] || 0;


      const y =
        transform[5] || 0;


      items.push({

        text:
          item.str,

        x,

        y,

        width:
          item.width || 0,

        height:
          item.height || 0,

        page:
          pageNumber

      });

    }


    pages.push({

      page:
        pageNumber,

      items

    });


    fullText +=
      items
        .map(item => item.text)
        .join(' ') +
      '\n';


    console.log(
      `[PDF] Page ${pageNumber}: ${items.length} text items`
    );

  }


  return {

    pages,

    text:
      fullText

  };

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