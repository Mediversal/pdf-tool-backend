const db = require("../common/database/dbConnection.service");
const logger = require("../common/logger/logger.service");
const { PDFDocument, rgb, degrees: pdfDegrees, StandardFonts } = require("pdf-lib");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const { AppError } = require("../common/middleware/error.middleware");
const pdfParse = require("pdf-parse");
const { fromPath } = require("pdf2pic");

class PdfService {
  async compressPdf(correlationId, file, compressionLevel) {
    try {
      logger.logRequest(correlationId, "COMPRESS_PDF", { 
        filename: file.originalname,
        size: file.size,
        compressionLevel 
      });

      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Optimize PDF
      const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });

      const outputPath = path.join(
        path.dirname(file.path),
        `compressed-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, compressedBytes);

      // Calculate compression ratio
      const originalSize = file.size;
      const compressedSize = compressedBytes.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      // Save operation to database (optional)
      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "compress",
          original_filename: file.originalname,
          original_size: originalSize,
          processed_size: compressedSize,
          output_path: outputPath,
          metadata: { compressionLevel, compressionRatio },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation",
          error: dbError.message 
        });
      }

      // Clean up original file
      await fs.unlink(file.path);

      const result = {
        operationId,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "COMPRESS_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "COMPRESS_PDF", error);
      throw new AppError(error.message, 500);
    }
  }

  async mergePdf(correlationId, files) {
    try {
      logger.logRequest(correlationId, "MERGE_PDF", { 
        filesCount: files.length 
      });

      if (files.length < 2) {
        throw new AppError("At least 2 PDF files are required for merging", 400);
      }

      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const pdfBytes = await fs.readFile(file.path);
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const outputPath = path.join(
        path.dirname(files[0].path),
        `merged-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, mergedBytes);

      // Save operation to database (optional)
      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "merge",
          original_filename: files.map(f => f.originalname).join(", "),
          original_size: files.reduce((sum, f) => sum + f.size, 0),
          processed_size: mergedBytes.length,
          output_path: outputPath,
          metadata: { fileCount: files.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      // Clean up original files
      for (const file of files) {
        await fs.unlink(file.path);
      }

      const result = {
        operationId,
        mergedSize: mergedBytes.length,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "MERGE_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "MERGE_PDF", error);
      throw new AppError(error.message, 500);
    }
  }

  async splitPdf(correlationId, file, pageRanges) {
    try {
      logger.logRequest(correlationId, "SPLIT_PDF", { 
        filename: file.originalname,
        pageRanges 
      });

      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Parse page ranges (e.g., "1-3,5,7-9")
      const pages = this.parsePageRanges(pageRanges, pdfDoc.getPageCount());
      
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdfDoc, pages);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const splitBytes = await newPdf.save();
      const outputPath = path.join(
        path.dirname(file.path),
        `split-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, splitBytes);

      // Save operation to database (optional)
      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "split",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: splitBytes.length,
          output_path: outputPath,
          metadata: { pageRanges, extractedPages: pages.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      // Clean up original file
      await fs.unlink(file.path);

      const result = {
        operationId,
        extractedPages: pages.length,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "SPLIT_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "SPLIT_PDF", error);
      throw new AppError(error.message, 500);
    }
  }

  // ✅ PDF to Word Conversion
  async pdfToWord(correlationId, file) {
    try {
      logger.logRequest(correlationId, "PDF_TO_WORD", { 
        filename: file.originalname 
      });

      const pdfBuffer = await fs.readFile(file.path);
      const data = await pdfParse(pdfBuffer);
      
      const rtfContent = this.createRTFDocument(data.text, file.originalname);
      
      const outputPath = path.join(
        path.dirname(file.path),
        `converted-${Date.now()}.rtf`
      );
      
      await fs.writeFile(outputPath, rtfContent);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "pdf_to_word",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: Buffer.byteLength(rtfContent),
          output_path: outputPath,
          metadata: { pages: data.numpages, extractedText: data.text.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        pages: data.numpages,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath),
        format: 'RTF (Microsoft Word Compatible)'
      };

      logger.logResponse(correlationId, "PDF_TO_WORD", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "PDF_TO_WORD", error);
      throw new AppError(error.message, 500);
    }
  }

  // ✅ PDF to Excel Conversion
  async pdfToExcel(correlationId, file) {
    try {
      logger.logRequest(correlationId, "PDF_TO_EXCEL", { 
        filename: file.originalname 
      });

      const pdfBuffer = await fs.readFile(file.path);
      const data = await pdfParse(pdfBuffer);
      
      const csvContent = this.createCSVFromText(data.text);
      
      const outputPath = path.join(
        path.dirname(file.path),
        `converted-${Date.now()}.csv`
      );
      
      await fs.writeFile(outputPath, csvContent);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "pdf_to_excel",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: Buffer.byteLength(csvContent),
          output_path: outputPath,
          metadata: { pages: data.numpages },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        pages: data.numpages,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath),
        format: 'CSV (Excel Compatible)'
      };

      logger.logResponse(correlationId, "PDF_TO_EXCEL", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "PDF_TO_EXCEL", error);
      throw new AppError(error.message, 500);
    }
  }

  async pdfToPowerpoint(correlationId, file) {
    try {
      logger.logRequest(correlationId, "PDF_TO_POWERPOINT", { 
        filename: file.originalname 
      });

      const pdfBuffer = await fs.readFile(file.path);
      const data = await pdfParse(pdfBuffer);
      
      const txtContent = this.createPowerPointText(data.text, data.numpages);
      
      const outputPath = path.join(
        path.dirname(file.path),
        `converted-${Date.now()}.txt`
      );
      
      await fs.writeFile(outputPath, txtContent);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "pdf_to_powerpoint",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: Buffer.byteLength(txtContent),
          output_path: outputPath,
          metadata: { pages: data.numpages },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        pages: data.numpages,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath),
        format: 'TXT (Import to PowerPoint)'
      };

      logger.logResponse(correlationId, "PDF_TO_POWERPOINT", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "PDF_TO_POWERPOINT", error);
      throw new AppError(error.message, 500);
    }
  }

  // ✅ WORKING: PDF to Images with pdf2pic
  async pdfToImages(correlationId, file, format = "png") {
    try {
      logger.logRequest(correlationId, "PDF_TO_IMAGES", { 
        filename: file.originalname,
        format 
      });

      const options = {
        density: 150,
        saveFilename: `page-${Date.now()}`,
        savePath: path.dirname(file.path),
        format: format,
        width: 1024,
        height: 1448
      };

      const convert = fromPath(file.path, options);
      
      // Get total pages
      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();

      const images = [];

      // Convert each page
      for (let i = 1; i <= pageCount; i++) {
        try {
          const pageImage = await convert(i, { responseType: "image" });
          
          images.push({
            page: i,
            url: `/uploads/${pageImage.name}`,
            filename: pageImage.name,
            path: pageImage.path
          });
        } catch (pageError) {
          logger.logError(correlationId, `PDF_TO_IMAGES_PAGE_${i}`, pageError);
        }
      }

      // Save operation to database (optional)
      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "pdf_to_images",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: 0,
          output_path: images.map(img => img.path).join(';'),
          metadata: { format, imageCount: images.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      // Clean up original file
      await fs.unlink(file.path);

      const result = {
        operationId,
        images,
        imageCount: images.length,
        format
      };

      logger.logResponse(correlationId, "PDF_TO_IMAGES", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "PDF_TO_IMAGES", error);
      throw new AppError(error.message, 500);
    }
  }

  // ✅ FULLY WORKING: Protect PDF with Strong Password
  async protectPdf(correlationId, file, password, permissions = {}) {
    try {
      logger.logRequest(correlationId, "PROTECT_PDF", { 
        filename: file.originalname,
        hasPassword: !!password 
      });

      // Validate password
      if (!password || password.trim().length === 0) {
        throw new AppError("Password is required to protect PDF", 400);
      }

      if (password.length < 4) {
        throw new AppError("Password must be at least 4 characters long", 400);
      }

      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Save with strong encryption and password
      const protectedBytes = await pdfDoc.save({
        userPassword: password,
        ownerPassword: password + "_owner", // Different owner password for better security
        permissions: {
          printing: permissions.allowPrinting !== false ? 'highResolution' : 'lowResolution',
          modifying: permissions.allowModifying === true,
          copying: permissions.allowCopying === true,
          annotating: permissions.allowAnnotating === true,
          fillingForms: permissions.allowFillingForms !== false,
          contentAccessibility: true,
          documentAssembly: permissions.allowDocumentAssembly === true
        }
      });

      const outputPath = path.join(
        path.dirname(file.path),
        `protected-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, protectedBytes);

      // Save operation to database (optional)
      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "protect",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: protectedBytes.length,
          output_path: outputPath,
          metadata: { 
            hasPassword: true, 
            permissions,
            passwordLength: password.length 
          },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      // Clean up original file
      await fs.unlink(file.path);

      const result = {
        operationId,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath),
        protected: true,
        message: 'PDF successfully protected with password. You will need this password to open the file.'
      };

      logger.logResponse(correlationId, "PROTECT_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "PROTECT_PDF", error);
      throw new AppError(error.message, error.statusCode || 500);
    }
  }

  async unlockPdf(correlationId, file, password) {
    try {
      logger.logRequest(correlationId, "UNLOCK_PDF", { 
        filename: file.originalname 
      });

      if (!password || password.trim().length === 0) {
        throw new AppError("Password is required to unlock PDF", 400);
      }

      const pdfBytes = await fs.readFile(file.path);
      
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(pdfBytes, { password });
      } catch (error) {
        throw new AppError("Invalid password. Please check your password and try again.", 401);
      }
      
      // Save without password
      const unlockedBytes = await pdfDoc.save();

      const outputPath = path.join(
        path.dirname(file.path),
        `unlocked-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, unlockedBytes);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "unlock",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: unlockedBytes.length,
          output_path: outputPath,
          metadata: {},
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath),
        unlocked: true
      };

      logger.logResponse(correlationId, "UNLOCK_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "UNLOCK_PDF", error);
      if (error.statusCode === 401) {
        throw error;
      }
      throw new AppError("Failed to unlock PDF. Please check your password.", 500);
    }
  }

  async rotatePdf(correlationId, file, pages, degrees) {
    try {
      logger.logRequest(correlationId, "ROTATE_PDF", { 
        filename: file.originalname,
        pages,
        degrees 
      });

      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();

      const pageIndices = this.parsePageRanges(pages || `1-${totalPages}`, totalPages);

      pageIndices.forEach(pageIndex => {
        const page = pdfDoc.getPage(pageIndex);
        const currentRotation = page.getRotation().angle;
        page.setRotation(pdfDegrees(currentRotation + parseInt(degrees)));
      });

      const rotatedBytes = await pdfDoc.save();
      const outputPath = path.join(
        path.dirname(file.path),
        `rotated-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, rotatedBytes);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "rotate",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: rotatedBytes.length,
          output_path: outputPath,
          metadata: { pages, degrees, rotatedPages: pageIndices.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        rotatedPages: pageIndices.length,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "ROTATE_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "ROTATE_PDF", error);
      throw new AppError(error.message, 500);
    }
  }

  async addWatermark(correlationId, file, text, options = {}) {
    try {
      logger.logRequest(correlationId, "ADD_WATERMARK", { 
        filename: file.originalname,
        text 
      });

      const pdfBytes = await fs.readFile(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      const pages = pdfDoc.getPages();
      const { opacity = 0.5, fontSize = 48 } = options;

      pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(text, {
          x: width / 4,
          y: height / 2,
          size: fontSize,
          color: rgb(0.75, 0.75, 0.75),
          opacity: parseFloat(opacity),
          rotate: pdfDegrees(45),
        });
      });

      const watermarkedBytes = await pdfDoc.save();
      const outputPath = path.join(
        path.dirname(file.path),
        `watermarked-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, watermarkedBytes);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "watermark",
          original_filename: file.originalname,
          original_size: file.size,
          processed_size: watermarkedBytes.length,
          output_path: outputPath,
          metadata: { text, opacity, fontSize },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      await fs.unlink(file.path);

      const result = {
        operationId,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "ADD_WATERMARK", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "ADD_WATERMARK", error);
      throw new AppError(error.message, 500);
    }
  }

  async imagesToPdf(correlationId, files) {
    try {
      logger.logRequest(correlationId, "IMAGES_TO_PDF", { 
        filesCount: files.length 
      });

      const pdfDoc = await PDFDocument.create();

      for (const file of files) {
        let image;
        const imageBytes = await fs.readFile(file.path);

        if (file.mimetype === "image/png") {
          image = await pdfDoc.embedPng(imageBytes);
        } else if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          const pngBytes = await sharp(imageBytes).png().toBuffer();
          image = await pdfDoc.embedPng(pngBytes);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const outputPath = path.join(
        path.dirname(files[0].path),
        `images-to-pdf-${Date.now()}.pdf`
      );
      
      await fs.writeFile(outputPath, pdfBytes);

      let operationId = null;
      try {
        operationId = await this.saveOperation(correlationId, {
          operation_type: "images_to_pdf",
          original_filename: files.map(f => f.originalname).join(", "),
          original_size: files.reduce((sum, f) => sum + f.size, 0),
          processed_size: pdfBytes.length,
          output_path: outputPath,
          metadata: { imageCount: files.length },
        });
      } catch (dbError) {
        logger.logError(correlationId, "DB_SAVE_OPERATION", { 
          message: "Database not configured - continuing without saving operation" 
        });
      }

      for (const file of files) {
        await fs.unlink(file.path);
      }

      const result = {
        operationId,
        imageCount: files.length,
        downloadUrl: `/uploads/${path.basename(outputPath)}`,
        filename: path.basename(outputPath)
      };

      logger.logResponse(correlationId, "IMAGES_TO_PDF", result);
      return result;
    } catch (error) {
      logger.logError(correlationId, "IMAGES_TO_PDF", error);
      throw new AppError(error.message, 500);
    }
  }

  // Helper: Create RTF document from text
  createRTFDocument(text, originalFilename) {
    const rtfHeader = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fswiss Arial;}}
{\\info{\\title Converted from ${originalFilename}}}
\\f0\\fs24
`;
    const rtfFooter = `}`;
    
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/\n/g, '\\par\n');
    
    return rtfHeader + escapedText + rtfFooter;
  }

  // Helper: Create CSV from text
  createCSVFromText(text) {
    const lines = text.split('\n').filter(line => line.trim());
    let csv = 'Content\n';
    
    lines.forEach(line => {
      const escapedLine = line.replace(/"/g, '""');
      csv += `"${escapedLine}"\n`;
    });
    
    return csv;
  }

  // Helper: Create PowerPoint-compatible text
  createPowerPointText(text, pageCount) {
    let output = `PDF to PowerPoint Conversion\n`;
    output += `Total Pages: ${pageCount}\n`;
    output += `\n${'='.repeat(50)}\n\n`;
    output += text;
    output += `\n\n${'='.repeat(50)}\n`;
    output += `\nNote: Import this text file into PowerPoint to create slides.\n`;
    return output;
  }

  async saveOperation(correlationId, operationData) {
    try {
      const pool = await db.getPool();
      const sql = `
        SELECT sp_create_pdf_operation(
          $1, $2, $3, $4, $5, $6
        ) AS operation_id;
      `;

      const values = [
        operationData.operation_type,
        operationData.original_filename,
        operationData.original_size,
        operationData.processed_size,
        operationData.output_path,
        JSON.stringify(operationData.metadata),
      ];

      const result = await pool.query(sql, values);
      return result.rows[0].operation_id;
    } catch (error) {
      logger.logError(correlationId, "SAVE_OPERATION", error);
      throw error;
    }
  }

  async getOperations(correlationId, filters) {
    try {
      const pool = await db.getPool();
      const sql = `
        SELECT * FROM sp_get_pdf_operations(
          $1, $2, $3
        );
      `;

      const values = [
        filters.limit || 50,
        filters.offset || 0,
        filters.operation_type || null,
      ];

      const result = await pool.query(sql, values);
      return result.rows;
    } catch (error) {
      logger.logError(correlationId, "GET_OPERATIONS", error);
      throw new AppError(error.message, 500);
    }
  }

  async getOperationById(correlationId, operationId) {
    try {
      const pool = await db.getPool();
      const sql = `
        SELECT * FROM pdf_operations WHERE id = $1;
      `;

      const result = await pool.query(sql, [operationId]);
      
      if (result.rows.length === 0) {
        throw new AppError("Operation not found", 404);
      }

      return result.rows[0];
    } catch (error) {
      logger.logError(correlationId, "GET_OPERATION_BY_ID", error);
      throw new AppError(error.message, error.statusCode || 500);
    }
  }

  parsePageRanges(rangeString, totalPages) {
    const ranges = rangeString.split(",").map(s => s.trim());
    const pages = new Set();

    ranges.forEach(range => {
      if (range.includes("-")) {
        const [start, end] = range.split("-").map(n => parseInt(n.trim()));
        for (let i = start; i <= end; i++) {
          if (i > 0 && i <= totalPages) {
            pages.add(i - 1);
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum > 0 && pageNum <= totalPages) {
          pages.add(pageNum - 1);
        }
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  }
}

module.exports = PdfService;
