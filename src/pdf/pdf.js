import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { config } from '../config.js';

import {
  extractColumnSchedule
} from './scheduleParser.js';

import {
  generateCoordScheduleWorkbook
} from './coordScheduleExporter.js';

const uploadedPdfs = new Map();
const uploadLifetimeMs = 15 * 60 * 1000;
const firebaseStorage = config.firebase.projectId &&
  config.firebase.clientEmail &&
  config.firebase.privateKey &&
  config.firebase.storageBucket
  ? getStorage(
      getApps()[0] || initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey
        }),
        storageBucket: config.firebase.storageBucket
      })
    ).bucket()
  : null;
const uploadCleanup = setInterval(() => {
  const now = Date.now();

  for (const [uploadId, upload] of uploadedPdfs) {
    if (upload.expiresAt <= now) {
      uploadedPdfs.delete(uploadId);
    }
  }
}, 60 * 1000);
uploadCleanup.unref();

export async function createPdfUpload(buffer, originalname) {
  const uploadId = crypto.randomUUID();
  const expiresAt = Date.now() + uploadLifetimeMs;

  if (firebaseStorage) {
    await firebaseStorage.file(`mcp-pdf-uploads/${uploadId}`).save(buffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          originalname,
          expiresAt: String(expiresAt)
        }
      }
    });

    return uploadId;
  }

  uploadedPdfs.set(uploadId, {
    buffer,
    originalname,
    expiresAt
  });

  return uploadId;
}

export async function getPdfUpload(uploadId) {
  if (firebaseStorage) {
    const file = firebaseStorage.file(`mcp-pdf-uploads/${uploadId}`);
    const [metadata] = await file.getMetadata().catch(() => [null]);
    const expiresAt = Number(metadata?.metadata?.expiresAt);

    if (!metadata || !expiresAt || expiresAt <= Date.now()) {
      await file.delete().catch(() => {});
      throw new Error('PDF upload not found or expired.');
    }

    const [buffer] = await file.download();
    return {
      buffer,
      originalname: metadata.metadata?.originalname || 'upload.pdf',
      expiresAt
    };
  }

  const upload = uploadedPdfs.get(uploadId);

  if (!upload || upload.expiresAt <= Date.now()) {
    uploadedPdfs.delete(uploadId);
    throw new Error('PDF upload not found or expired.');
  }

  return upload;
}

const router = express.Router();

router.get('/downloads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(
    process.cwd(),
    'src',
    'pdf',
    'temp',
    filename
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'Download not found or expired'
    });
  }

  return res.download(filePath, filename);
});


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

router.post(

  '/uploads',

  upload.single('file'),

  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'PDF file is required'
      });
    }

    const uploadId = await createPdfUpload(
      req.file.buffer,
      req.file.originalname
    );

    return res.status(201).json({
      success: true,
      uploadId,
      file: req.file.originalname,
      expiresInSeconds: uploadLifetimeMs / 1000
    });
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