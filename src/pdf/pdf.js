import express from 'express';
import multer from 'multer';
import fs from 'fs';

import {
  extractColumnScheduleFromPdf
} from './extractColumnSchedule.js';

const router = express.Router();

const upload = multer({
  dest: 'uploads/'
});


/**
 * @swagger
 * /api/pdf/extract-column-schedule:
 *   post:
 *     summary: Extract column schedule from PDF
 *     description: Upload a Tekla column schedule PDF and extract the column schedule data.
 *     tags:
 *       - PDF
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF file to process
 *     responses:
 *       200:
 *         description: PDF processed successfully
 *       400:
 *         description: PDF file is missing
 *       500:
 *         description: PDF processing failed
 */
router.post(
  '/extract-column-schedule',
  upload.single('file'),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'PDF file is required'
        });
      }

      console.log(
        'PDF received:',
        req.file.originalname
      );

      console.log(
        'Temporary path:',
        req.file.path
      );

      const rows =
        await extractColumnScheduleFromPdf(
          req.file.path
        );

      fs.unlinkSync(req.file.path);

      return res.json({
        success: true,
        file: req.file.originalname,
        count: rows.length,
        rows
      });

    }
    catch (error) {

      console.error(
        'Column schedule extraction failed:',
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message
      });

    }

  }
);


export default router;