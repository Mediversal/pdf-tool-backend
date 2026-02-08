const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const PdfController = require("../../src/pdf/pdf.controller");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, JPEG, PNG, GIF are allowed."));
    }
  },
});

const pdfController = new PdfController();

// PDF Operations Routes
router.post("/compress", upload.single("file"), pdfController.compressPdf);
router.post("/merge", upload.array("files", 10), pdfController.mergePdf);
router.post("/split", upload.single("file"), pdfController.splitPdf);
router.post("/convert/word", upload.single("file"), pdfController.pdfToWord);
router.post("/convert/excel", upload.single("file"), pdfController.pdfToExcel);
router.post("/convert/powerpoint", upload.single("file"), pdfController.pdfToPowerpoint);
router.post("/convert/images", upload.single("file"), pdfController.pdfToImages);
router.post("/protect", upload.single("file"), pdfController.protectPdf);
router.post("/unlock", upload.single("file"), pdfController.unlockPdf);
router.post("/rotate", upload.single("file"), pdfController.rotatePdf);
router.post("/watermark", upload.single("file"), pdfController.addWatermark);
router.post("/images-to-pdf", upload.array("files", 20), pdfController.imagesToPdf);

router.get("/download/:filename", pdfController.downloadFile); 

// Get operation history
router.get("/operations", pdfController.getOperations);
router.get("/operations/:id", pdfController.getOperationById);

module.exports = router;
