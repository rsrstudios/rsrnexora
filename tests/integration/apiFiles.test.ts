import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiFilesTests() {
  await describe("Integration: File Upload & Document Endpoints", () => {
    const baseUrl = getTestBaseUrl();
    let uploadedFilename = "";

    it("POST /api/files/upload - should safely accept and store allowed documents", async () => {
      const res = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "production_report.txt",
          mimeType: "text/plain",
          content: "System Architecture Audit Report\n\nAll security policies active.",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.file.originalName).toBe("production_report.txt");
      expect(typeof data.file.filename).toBe("string");
      uploadedFilename = data.file.filename;
    });

    it("POST /api/files/upload - should strictly block executable files (.exe, .sh, .bat)", async () => {
      const res = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "malicious_payload.exe",
          mimeType: "application/octet-stream",
          content: "MZ90...",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("DANGEROUS_FILE_TYPE");
    });

    it("POST /api/files/upload - should sanitize path traversal in filenames", async () => {
      const res = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "../../../etc/passwd.txt",
          mimeType: "text/plain",
          content: "Safe content",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      // Filename must have path traversal stripped
      expect(data.file.originalName).toBe("passwd.txt");
    });

    it("GET /api/files/:filename - should retrieve stored file content", async () => {
      const res = await fetch(`${baseUrl}/api/files/${uploadedFilename}`);
      expect(res.status).toBe(200);
      const content = await res.text();
      expect(content).toContain("System Architecture Audit Report");
    });

    it("GET /api/files/:filename - should return 404 for non-existent file", async () => {
      const res = await fetch(`${baseUrl}/api/files/non_existent_file_9999.txt`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("FILE_NOT_FOUND");
    });

    it("GET /api/files/:filename - should neutralize path traversal attempts", async () => {
      const res = await fetch(`${baseUrl}/api/files/..%2F..%2Fpackage.json`);
      // Express / path.basename prevents traversal, returns 404 or safe rejection
      expect(res.status >= 400).toBe(true);
    });

    it("POST /api/files/extract - should parse document intelligence and extract headings", async () => {
      const docText = "# Executive Summary\nRSR Nexora provides production-ready intelligence.\n\n## Core Findings\nAll systems operational.";
      const res = await fetch(`${baseUrl}/api/files/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "summary.md",
          mimeType: "text/markdown",
          textContent: docText,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.headings.length).toBeGreaterThanOrEqual(2);
      expect(data.headings).toContain("Executive Summary");
      expect(data.headings).toContain("Core Findings");
    });
  });
}
