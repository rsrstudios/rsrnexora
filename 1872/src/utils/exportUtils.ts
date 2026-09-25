import { Conversation } from "../types";

export function exportToTxt(conversation: Conversation) {
  const dateStr = new Date(conversation.createdAt).toLocaleString();
  let content = `=====================================================\n`;
  content += `RSR Nexora - Conversation Transcript\n`;
  content += `Title: ${conversation.title}\n`;
  content += `Date: ${dateStr}\n`;
  content += `Model: ${conversation.modelTier || "Balanced"}\n`;
  content += `=====================================================\n\n`;

  conversation.messages.forEach((msg, idx) => {
    const roleLabel = msg.role === "assistant" ? "RSR Nexora" : "User";
    const time = new Date(msg.timestamp).toLocaleTimeString();
    content += `[${idx + 1}] ${roleLabel} (${time}):\n`;

    if (msg.attachments && msg.attachments.length > 0) {
      content += `Attachments: ${msg.attachments.map((a) => a.name).join(", ")}\n`;
    }

    content += `${msg.content}\n`;

    if (msg.sources && msg.sources.length > 0) {
      content += `Sources:\n`;
      msg.sources.forEach((s) => {
        content += `  - ${s.title}: ${s.uri}\n`;
      });
    }

    content += `\n-----------------------------------------------------\n\n`;
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${slugify(conversation.title)}.txt`);
}

export function exportToMarkdown(conversation: Conversation) {
  const dateStr = new Date(conversation.createdAt).toLocaleString();
  let md = `# ${conversation.title}\n\n`;
  md += `> **Exported from RSR Nexora** on ${dateStr}  \n`;
  md += `> **Model Tier:** ${conversation.modelTier || "Balanced"}\n\n`;
  md += `---\n\n`;

  conversation.messages.forEach((msg) => {
    const isAi = msg.role === "assistant";
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    md += `### ${isAi ? "🤖 RSR Nexora" : "👤 User"} *(${time})*\n\n`;

    if (msg.attachments && msg.attachments.length > 0) {
      md += `**Attachments:**\n`;
      msg.attachments.forEach((a) => {
        md += `- \`${a.name}\` (${(a.size / 1024).toFixed(1)} KB)\n`;
      });
      md += `\n`;
    }

    if (msg.imageUrl) {
      md += `![Generated Image](${msg.imageUrl})\n\n`;
      if (msg.imagePrompt) {
        md += `*Prompt: ${msg.imagePrompt}*\n\n`;
      }
    }

    md += `${msg.content}\n\n`;

    if (msg.sources && msg.sources.length > 0) {
      md += `**Web Sources:**\n`;
      msg.sources.forEach((s) => {
        md += `- [${s.title}](${s.uri})\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${slugify(conversation.title)}.md`);
}

export function exportToPdf(conversation: Conversation) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export to PDF.");
    return;
  }

  const dateStr = new Date(conversation.createdAt).toLocaleString();

  const messagesHtml = conversation.messages
    .map((msg) => {
      const isAi = msg.role === "assistant";
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const roleLabel = isAi ? "RSR Nexora" : "You";

      let attachmentsHtml = "";
      if (msg.attachments && msg.attachments.length > 0) {
        attachmentsHtml = `
          <div style="font-size: 11px; color: #666; margin-bottom: 6px;">
            <strong>Attachments:</strong> ${msg.attachments.map((a) => a.name).join(", ")}
          </div>
        `;
      }

      let sourcesHtml = "";
      if (msg.sources && msg.sources.length > 0) {
        sourcesHtml = `
          <div style="margin-top: 10px; font-size: 11px; border-top: 1px solid #eee; padding-top: 6px;">
            <strong>Web Sources:</strong>
            <ul>
              ${msg.sources.map((s) => `<li><a href="${s.uri}" target="_blank">${s.title}</a> (${s.uri})</li>`).join("")}
            </ul>
          </div>
        `;
      }

      let imageHtml = "";
      if (msg.imageUrl) {
        imageHtml = `<img src="${msg.imageUrl}" style="max-width: 320px; border-radius: 8px; margin-top: 8px;" />`;
      }

      return `
        <div style="margin-bottom: 20px; padding: 14px; border-radius: 8px; background: ${isAi ? "#f9fafb" : "#ffffff"}; border: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: ${isAi ? "#1e293b" : "#0284c7"};">
            <span>${roleLabel}</span>
            <span style="font-weight: 400; font-size: 11px; color: #94a3b8;">${time}</span>
          </div>
          ${attachmentsHtml}
          <div style="font-size: 13px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${escapeHtml(msg.content)}</div>
          ${imageHtml}
          ${sourcesHtml}
        </div>
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(conversation.title)} - RSR Nexora</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            color: #1e293b;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 6px;
          }
          .meta {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 24px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 12px;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(conversation.title)}</h1>
        <div class="meta">
          <strong>RSR Nexora Transcript</strong> &bull; Generated: ${dateStr} &bull; Model: ${conversation.modelTier || "Balanced"}
        </div>
        ${messagesHtml}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
