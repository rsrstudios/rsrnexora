import { describe, it, expect } from "../framework";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 40) || "rsr-ai-chat"
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateMarkdownRepresentation(conversation: any): string {
  const dateStr = new Date(conversation.createdAt).toISOString();
  let md = `# ${conversation.title}\n\n`;
  md += `> **Exported from RSR AI** on ${dateStr}  \n`;
  md += `> **Model Tier:** ${conversation.modelTier || "Balanced"}\n\n`;
  md += `---\n\n`;

  conversation.messages.forEach((msg: any) => {
    const isAi = msg.role === "assistant";
    md += `### ${isAi ? "🤖 RSR AI" : "👤 User"}\n\n`;
    if (msg.attachments && msg.attachments.length > 0) {
      md += `**Attachments:**\n`;
      msg.attachments.forEach((a: any) => {
        md += `- \`${a.name}\`\n`;
      });
      md += `\n`;
    }
    md += `${msg.content}\n\n`;
    md += `---\n\n`;
  });

  return md;
}

export async function runExportUnitTests() {
  await describe("Unit: Export & Document Formatting Utilities", () => {
    it("should generate clean, safe filesystem slug from conversation titles", () => {
      expect(slugify("Project Architecture & Design 2026!")).toBe("project-architecture-design-2026");
      expect(slugify("../../dangerous/path")).toBe("dangerous-path");
      expect(slugify("   ")).toBe("rsr-ai-chat");
      expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40);
    });

    it("should safely escape HTML entities to prevent injection in exported transcripts", () => {
      const raw = `<script>alert("XSS")</script>&'quotes'`;
      const escaped = escapeHtml(raw);

      expect(escaped).not.toContain("<script>");
      expect(escaped).toContain("&lt;script&gt;");
      expect(escaped).toContain("&amp;");
      expect(escaped).toContain("&quot;");
      expect(escaped).toContain("&#039;");
    });

    it("should produce a structured Markdown document from conversation model", () => {
      const conv = {
        id: "conv_test",
        title: "Security Engineering Review",
        createdAt: 1710000000000,
        modelTier: "advanced",
        messages: [
          { role: "user", content: "Can you analyze this code?", timestamp: 1710000001000 },
          { role: "assistant", content: "Here is the architectural analysis.", timestamp: 1710000002000 },
        ],
      };

      const md = generateMarkdownRepresentation(conv);
      expect(md).toContain("# Security Engineering Review");
      expect(md).toContain("👤 User");
      expect(md).toContain("🤖 RSR AI");
      expect(md).toContain("Here is the architectural analysis.");
    });
  });
}
