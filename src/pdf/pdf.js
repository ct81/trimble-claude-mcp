import express from 'express';
import multer from 'multer';
import path from 'node:path';

import {
  extractColumnSchedule
} from './scheduleParser.js';

import {
  generateCoordScheduleWorkbook
} from './coordScheduleExporter.js';

const router = express.Router();


// =====================================================
// MULTER
// =====================================================

const upload = multer({

  storage:
    multer.memoryStorage(),

  limits: {

    fileSize:
      50 * 1024 * 1024

  },

  fileFilter:
    (req, file, cb) => {

      if (
        file.mimetype === 'application/pdf' ||
        file.originalname
          .toLowerCase()
          .endsWith('.pdf')
      ) {

        cb(null, true);

      }
      else {

        cb(
          new Error(
            'Only PDF files are allowed'
          )
        );

      }

    }

});

const jsonUpload = multer({

  storage:
    multer.memoryStorage(),

  limits: {

    fileSize:
      50 * 1024 * 1024

  },

  fileFilter:
    (req, file, cb) => {

      const isJsonFile =
        file.mimetype === 'application/json' ||
        file.mimetype === 'application/x-json' ||
        file.originalname
          .toLowerCase()
          .endsWith('.json');

      if (isJsonFile) {

        cb(null, true);

      }
      else {

        cb(
          new Error(
            'Only JSON files are allowed'
          )
        );

      }

    }

});


// =====================================================
// EXTRACT COLUMN SCHEDULE
// =====================================================

router.post(

  '/extract-column-schedule',

  upload.single('file'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            'PDF file is required'

        });

      }


      console.log(
        'PDF received:',
        req.file.originalname
      );

      console.log(
        'PDF size:',
        req.file.size
      );


      // ================================================
      // EXTRACT ROWS
      // ================================================

      const rows =
        await extractColumnSchedule(
          req.file.buffer
        );


      // ================================================
      // RESPONSE
      // ================================================

      return res.json({

        success: true,

        file:
          req.file.originalname,

        count:
          rows.length,

        rows

      });

    }
    catch (error) {

      console.error(
        'PDF extraction error:',
        error
      );

      return res.status(500).json({

        success: false,

        error:
          error.message

      });

    }

  }

);


// =====================================================
// COLUMN SCHEDULE EXPORTER JSON UPLOAD
// =====================================================

router.post(

  '/column-schedule-exporter',

  jsonUpload.single('file'),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            'JSON file is required'

        });

      }

      const text =
        req.file.buffer.toString('utf8');

      let data;

      try {

        data =
          JSON.parse(text);

      }
      catch (error) {

        return res.status(400).json({

          success: false,

          error:
            `Invalid JSON file: ${error.message}`

        });

      }

      const rows =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.column_schedule)
            ? data.column_schedule.flatMap(item => Array.isArray(item?.rows) ? item.rows : [])
            : [];

      return res.json({

        success: true,

        file:
          req.file.originalname,

        count:
          rows.length,

        rows,

        data

      });

    }
    catch (error) {

      console.error(
        'JSON upload error:',
        error
      );

      return res.status(400).json({

        success: false,

        error:
          error.message

      });

    }

  }

);

// =====================================================
// COORDINATE SCHEDULE EXPORTER JSON TO EXCEL
// =====================================================

router.post(

  '/coord-schedule-exporter',

  jsonUpload.single('file'),

  async (req, res) => {

    try {

      if (!req.file && !req.body) {

        return res.status(400).json({

          success: false,

          error:
            'JSON file is required'

        });

      }

      let data;

      try {

        data = req.file
          ? JSON.parse(req.file.buffer.toString('utf8'))
          : req.body;

      }
      catch (error) {

        return res.status(400).json({

          success: false,

          error:
            `Invalid JSON file: ${error.message}`

        });

      }

      const outputFile =
        path.join(process.cwd(), `output-${Date.now()}.xlsx`);

      const result =
        await generateCoordScheduleWorkbook(
          data,
          outputFile
        );

      if (req.query.download === 'csv') {
        if (!result.csvBuffer) {
          return res.status(422).json({
            success: false,
            error: 'No CSV rows were generated'
          });
        }

        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="coord-schedule-output.csv"',
          'X-Coordinate-Item-Count': String(result.itemCount),
          'X-Coordinate-X-Clusters': String(result.xClusterCount),
          'X-Coordinate-Y-Rows': String(result.yRowCount)
        });
        return res.send(result.csvBuffer);
      }

      if (req.query.download === '1') {
        res.set({
          'X-Coordinate-Item-Count': String(result.itemCount),
          'X-Coordinate-X-Clusters': String(result.xClusterCount),
          'X-Coordinate-Y-Rows': String(result.yRowCount)
        });
        return res.download(
          result.outputFile,
          'coord-schedule-output.xlsx'
        );
      }

      return res.json({

        success: true,

        file:
          req.file.originalname,

        outputFile:
          result.outputFile,

        itemCount:
          result.itemCount,

        xClusterCount:
          result.xClusterCount,

        yRowCount:
          result.yRowCount,

        data

      });

    }
    catch (error) {

      console.error(
        'Coord schedule export error:',
        error
      );

      return res.status(500).json({

        success: false,

        error:
          error.message

      });

    }

  }

);

export default router;