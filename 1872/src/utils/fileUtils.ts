import { FileCategory, MessageAttachment } from "../types";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "html", "css", "json", "md",
  "java", "c", "cpp", "h", "cs", "go", "rs", "php", "rb", "sh",
  "yaml", "yml", "xml", "sql", "graphql",
]);

export function detectFileCategory(file: File): FileCategory {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    return "pdf";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (CODE_EXTENSIONS.has(ext)) {
    return "code";
  }
  if (file.type.startsWith("text/") || ext === "txt") {
    return "text";
  }
  return "other";
}

/**
 * Compresses an image file if it exceeds target dimensions, maintaining high visual quality
 * while speeding up upload time on slow connections.
 */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as jpeg/webp if original was png/jpeg
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        const compressedUrl = canvas.toDataURL(mime, 0.85);
        resolve(compressedUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reads text content from a text or code file
 */
async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Reads file as base64 data URL
 */
async function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function processUploadFile(file: File): Promise<MessageAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File "${file.name}" exceeds the maximum 15MB limit. Please attach a smaller file.`
    );
  }

  const category = detectFileCategory(file);
  const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let dataUrl: string | undefined;
  let textContent: string | undefined;

  if (category === "image") {
    dataUrl = await compressImage(file);
  } else if (category === "pdf") {
    dataUrl = await readDataUrl(file);
  } else if (category === "text" || category === "code") {
    textContent = await readTextFile(file);
    // Also include a dataUrl for consistency
    dataUrl = await readDataUrl(file);
  } else {
    // Other file types
    dataUrl = await readDataUrl(file);
  }

  return {
    id,
    name: file.name,
    type: file.type || "application/octet-stream",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    textContent,
    fileCategory: category,
  };
}
