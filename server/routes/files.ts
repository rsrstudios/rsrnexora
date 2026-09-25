import { Router } from "express";
import path from "path";
import fs from "fs";
import { filesRateLimiter } from "../middleware/rateLimiter";
import { authenticateSession } from "../middleware/authMiddleware";
import { sanitizeFilename, generateStorageFilename } from "../security/sanitizer";
import { db } from "../db/database";
import { logger } from "../logger/logger";

export const filesRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_EXTRACTED_CHARS = 60000; // 60,000 chars

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    // Ignore if already created
  }
}

const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/javascript",
  "text/typescript",
  "text/x-python",
  "application/x-typescript",
  "application/javascript",
  "text/html",
  "text/css",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".php",
  ".vbs",
  ".jar",
  ".com",
  ".pif",
  ".scr",
  ".msi",
  ".dll",
  ".so",
]);

// Extract headings safely from text/markdown content
function extractDocumentHeadings(text: string): string[] {
  const headings: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
      headings.push(trimmed.replace(/^#+\s*/, "").slice(0, 80));
    } else if (/^[A-Z0-9\s-]{4,40}:$/.test(trimmed)) {
      headings.push(trimmed.replace(/:$/, "").slice(0, 80));
    }
    if (headings.length >= 25) break;
  }
  return headings;
}

filesRouter.use(filesRateLimiter);
filesRouter.use(authenticateSession);

filesRouter.post("/extract", async (req, res, next) => {
  try {
    const { name, mimeType, textContent, dataUrl, size } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({
        error: {
          code: "MISSING_FILENAME",
          message: "A valid file name is required.",
        },
      });
      return;
    }

    // Sanitize filename and prevent path traversal
    const safeName = sanitizeFilename(name);
    const fileExt = path.extname(safeName).toLowerCase();

    if (FORBIDDEN_EXTENSIONS.has(fileExt)) {
      res.status(400).json({
        error: {
          code: "DANGEROUS_FILE_TYPE",
          message: "Executable and binary script files are strictly blocked for security.",
        },
      });
      return;
    }

    const cleanMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "text/plain";
    if (cleanMime && !ALLOWED_MIME_TYPES.has(cleanMime)) {
      res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: `The MIME type '${cleanMime}' is not permitted. Only documents and standard images are accepted.`,
        },
      });
      return;
    }

    if (size && typeof size === "number" && size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File exceeds 25MB maximum upload limit.",
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    // Atomic reservation of file usage
    const reservation = await db.reserveUsage(user.userId, user.tier, "files");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "files",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    let extractedText = typeof textContent === "string" ? textContent : "";

    // Process base64 dataUrl if textContent wasn't pre-extracted
    if (!extractedText && dataUrl && typeof dataUrl === "string") {
      if (dataUrl.includes(";base64,")) {
        const parts = dataUrl.split(";base64,");
        const base64Data = parts[1];
        if (base64Data) {
          try {
            const buffer = Buffer.from(base64Data, "base64");
            if (buffer.length > MAX_FILE_SIZE) {
              res.status(413).json({
                error: {
                  code: "FILE_TOO_LARGE",
                  message: "Decoded file exceeds maximum allowable size.",
                },
              });
              return;
            }

            if (!cleanMime || cleanMime.startsWith("text/") || cleanMime === "application/json") {
              extractedText = buffer.toString("utf-8");
            } else if (cleanMime === "application/pdf") {
              // Extract text stream tokens safely without native binaries
              const rawStr = buffer.toString("binary");
              const textMatches = rawStr.match(/\(([^)]+)\)\s*Tj/g) || rawStr.match(/\[([^\]]+)\]\s*TJ/g);
              if (textMatches && textMatches.length > 0) {
                extractedText = textMatches
                  .map((m) => m.replace(/^[(\[]|[)\]]\s*T[jJ]$/g, ""))
                  .filter((t) => t.trim().length > 1)
                  .join(" ");
              } else {
                extractedText = `[PDF Document: ${safeName}] Document structure processed safely for multimodal analysis.`;
              }
            }
          } catch (err: any) {
            logger.warn("Document buffer parsing warning:", { error: err.message, file: safeName });
            extractedText = `[Attachment: ${safeName}]`;
          }
        }
      }
    }

    // Bound extracted text to prevent memory exhaustion
    if (extractedText.length > MAX_EXTRACTED_CHARS) {
      extractedText = extractedText.slice(0, MAX_EXTRACTED_CHARS) + "\n\n[...content truncated for model safety...]";
    }

    // Record server-side attachment registry
    const storageName = generateStorageFilename(safeName);
    const userId = req.user?.userId || "guest";
    await db.recordAttachment({
      userId,
      originalName: safeName,
      storageName,
      mimeType: cleanMime,
      sizeBytes: size || extractedText.length,
    });

    const headings = extractDocumentHeadings(extractedText);

    res.json({
      success: true,
      name: safeName,
      mimeType: cleanMime,
      characterCount: extractedText.length,
      headings,
      textContent: extractedText,
      summaryPreview:
        extractedText.slice(0, 300) + (extractedText.length > 300 ? "..." : ""),
    });
  } catch (err) {
    if (req.user) {
      await db.rollbackUsage(req.user.userId, "files").catch(() => {});
    }
    next(err);
  }
});

// POST /api/files/upload - Upload and store a document or asset securely
filesRouter.post("/upload", async (req, res, next) => {
  try {
    const { name, mimeType, content, dataUrl, size } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({
        error: {
          code: "MISSING_FILENAME",
          message: "A valid file name is required.",
        },
      });
      return;
    }

    const safeName = sanitizeFilename(name);
    const fileExt = path.extname(safeName).toLowerCase();

    if (FORBIDDEN_EXTENSIONS.has(fileExt)) {
      res.status(400).json({
        error: {
          code: "DANGEROUS_FILE_TYPE",
          message: "Executable and binary script files are strictly blocked for security.",
        },
      });
      return;
    }

    const cleanMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "application/octet-stream";
    if (cleanMime !== "application/octet-stream" && !ALLOWED_MIME_TYPES.has(cleanMime)) {
      res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: `The MIME type '${cleanMime}' is not permitted.`,
        },
      });
      return;
    }

    if (size && typeof size === "number" && size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File exceeds 25MB maximum upload limit.",
        },
      });
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication session required.",
        },
      });
      return;
    }

    // Atomic reservation of file usage
    const reservation = await db.reserveUsage(user.userId, user.tier, "files");
    if (!reservation.allowed) {
      res.status(429).json({
        error: {
          code: "DAILY_LIMIT_REACHED",
          message: "You've reached today's limit. Your limit will reset tomorrow.",
          resource: "files",
          limit: reservation.limit,
          remaining: 0,
        },
      });
      return;
    }

    const storageName = generateStorageFilename(safeName);
    const filePath = path.join(UPLOAD_DIR, storageName);

    let fileBuffer: Buffer;
    if (typeof content === "string") {
      fileBuffer = Buffer.from(content, "utf-8");
    } else if (typeof dataUrl === "string" && dataUrl.includes(";base64,")) {
      const base64Data = dataUrl.split(";base64,")[1];
      fileBuffer = Buffer.from(base64Data, "base64");
    } else {
      fileBuffer = Buffer.from("", "utf-8");
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
      await db.rollbackUsage(user.userId, "files");
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "Payload content exceeds maximum upload limit.",
        },
      });
      return;
    }

    try {
      fs.writeFileSync(filePath, fileBuffer);

      const userId = user.userId;
      const attachment = await db.recordAttachment({
        userId,
        originalName: safeName,
        storageName,
        mimeType: cleanMime,
        sizeBytes: fileBuffer.length,
      });

      res.status(201).json({
        success: true,
        file: {
          id: attachment.id,
          filename: storageName,
          originalName: safeName,
          mimeType: cleanMime,
          sizeBytes: fileBuffer.length,
          uploadedAt: attachment.createdAt,
        },
      });
    } catch (writeErr) {
      await db.rollbackUsage(user.userId, "files");
      throw writeErr;
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/files/:filename - Safely retrieve stored file
filesRouter.get("/:filename", (req, res) => {
  try {
    const rawFilename = req.params.filename;
    const safeBasename = path.basename(rawFilename);
    const filePath = path.join(UPLOAD_DIR, safeBasename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "The requested file does not exist.",
        },
      });
      return;
    }

    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "FILE_SERVE_FAILED",
        message: "Failed to retrieve the requested file.",
      },
    });
  }
});

