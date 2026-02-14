const PdfService = require("./pdf.service");
const { catchAsync } = require("../common/middleware/error.middleware");
const path = require("path");
const fs = require("fs");

class PdfController {
  constructor() {
    this.pdfService = new PdfService();
  }

  compressPdf = catchAsync(async (req, res) => {
    const { compressionLevel = "medium" } = req.body;
    
    const result = await this.pdfService.compressPdf(
      req.correlationId,
      req.file,
      compressionLevel
    );

    res.status(200).json({
      success: true,
      message: "PDF compressed successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  mergePdf = catchAsync(async (req, res) => {
    const result = await this.pdfService.mergePdf(
      req.correlationId,
      req.files
    );

    res.status(200).json({
      success: true,
      message: "PDFs merged successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  splitPdf = catchAsync(async (req, res) => {
    const { pages } = req.body; // e.g., "1-3,5,7-9"
    
    const result = await this.pdfService.splitPdf(
      req.correlationId,
      req.file,
      pages
    );

    res.status(200).json({
      success: true,
      message: "PDF split successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  pdfToWord = catchAsync(async (req, res) => {
    const result = await this.pdfService.pdfToWord(
      req.correlationId,
      req.file
    );

    res.status(200).json({
      success: true,
      message: "PDF converted to Word successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  pdfToExcel = catchAsync(async (req, res) => {
    const result = await this.pdfService.pdfToExcel(
      req.correlationId,
      req.file
    );

    res.status(200).json({
      success: true,
      message: "PDF converted to Excel successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  pdfToPowerpoint = catchAsync(async (req, res) => {
    const result = await this.pdfService.pdfToPowerpoint(
      req.correlationId,
      req.file
    );

    res.status(200).json({
      success: true,
      message: "PDF converted to PowerPoint successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  pdfToImages = catchAsync(async (req, res) => {
    const { format = "png" } = req.body;
    
    const result = await this.pdfService.pdfToImages(
      req.correlationId,
      req.file,
      format
    );

    res.status(200).json({
      success: true,
      message: "PDF converted to images successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  protectPdf = catchAsync(async (req, res) => {
    const { password, permissions } = req.body;
    
    const result = await this.pdfService.protectPdf(
      req.correlationId,
      req.file,
      password,
      permissions
    );

    res.status(200).json({
      success: true,
      message: "PDF protected successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  unlockPdf = catchAsync(async (req, res) => {
    const { password } = req.body;
    
    const result = await this.pdfService.unlockPdf(
      req.correlationId,
      req.file,
      password
    );

    res.status(200).json({
      success: true,
      message: "PDF unlocked successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  rotatePdf = catchAsync(async (req, res) => {
    const { pages, degrees } = req.body;
    
    const result = await this.pdfService.rotatePdf(
      req.correlationId,
      req.file,
      pages,
      degrees
    );

    res.status(200).json({
      success: true,
      message: "PDF rotated successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });

  addWatermark = catchAsync(async (req, res) => {
    const { text, opacity = 0.5, fontSize = 48 } = req.body;
    
    const result = await this.pdfService.addWatermark(
      req.correlationId,
      req.file,
      text,
      { opacity, fontSize }
    );

    res.status(200).json({
      success: true,
      message: "Watermark added successfully.",
      data: result,
      correlationId: req.correlationId,
    });
  });

  imagesToPdf = catchAsync(async (req, res) => {
    const result = await this.pdfService.imagesToPdf(
      req.correlationId,
      req.files
    );

    res.status(200).json({
      success: true,
      message: "Images converted to PDF successfully",
      data: result,
      correlationId: req.correlationId,
    });
  });


// ============================================
  // DOWNLOAD FILE METHOD - YEH NEW HAI
  // ============================================
  downloadFile = catchAsync(async (req, res) => {
    const { filename } = req.params;
    
    // Security: Only allow files from uploads directory
    const uploadsDir = path.join(__dirname, "../../uploads");
    const filePath = path.join(uploadsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }
    
    // Check if file is within uploads directory (security)
    const realPath = fs.realpathSync(filePath);
    const realUploadsDir = fs.realpathSync(uploadsDir);
    
    if (!realPath.startsWith(realUploadsDir)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    
    // Set appropriate headers for download
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    // Clean up file after download (optional - after 1 hour)
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }, 60 * 60 * 1000); // Delete after 1 hour
  });



  getOperations = catchAsync(async (req, res) => {
    const { limit = 50, offset = 0, operation_type } = req.query;
    
    const operations = await this.pdfService.getOperations(
      req.correlationId,
      { limit, offset, operation_type }
    );

    res.status(200).json({
      success: true,
      data: operations,
      correlationId: "firoz",
      message: "Operation history retrieved successfully"
    });
  });

  getOperationById = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    const operation = await this.pdfService.getOperationById(
      req.correlationId,
      id
    );

    res.status(200).json({
      success: true,
      data: operation,
      correlationId: req.correlationId,
    });
  });
}

module.exports = PdfController;
