// server.js
const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 30 MB per file
    files: 20
  }
});

// serve static frontend from "public" folder
app.use(express.static('public'));

// POST /make-pdf : accepts multipart/form-data with field "images"
app.post('/make-pdf', upload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).send('No files uploaded');
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Process files in received order
    for (const file of req.files) {
      // Use sharp to auto-rotate by EXIF, optionally resize large images
      // Here we convert to JPEG to ensure pdf-lib can embed consistently
      const optimized = await sharp(file.buffer)
        .rotate() // auto-rotate using EXIF
        // .resize({ width: 2000, withoutEnlargement: true }) // optional resizing
        .jpeg({ quality: 85 })
        .toBuffer();

      // Embed JPEG into pdf-lib
      const embeddedJpg = await pdfDoc.embedJpg(optimized);
      const { width, height } = embeddedJpg.size();

      // Add page sized exactly to image dimensions (points)
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width,
        height
      });
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error while creating PDF');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
