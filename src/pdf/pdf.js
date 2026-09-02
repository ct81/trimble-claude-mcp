import express from 'express';
import multer from 'multer';

import {
  extractColumnSchedule
} from './scheduleParser.js';

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


export default router;