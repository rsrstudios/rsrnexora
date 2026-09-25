import { GoogleGenAI } from "@google/genai";
import {
  AIProvider,
  ChatCompletionRequest,
  ChatStreamChunk,
  ContentAnalysisRequest,
  ContentAnalysisResponse,
  GroundingSource,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from "./types";
import { SYSTEM_DEFENSE_PROMPT, formatUntrustedAttachment } from "../security/promptDefense";
import { logger } from "../logger/logger";
import { normalizeModelName } from "../config/providerConfig";
import {
  getOrderedCandidateModels,
  markModelFailure,
  markModelSuccess,
  extractCleanErrorMessage,
} from "./modelHealth";

export class GeminiProvider implements AIProvider {
  public name = "Gemini AI Provider";
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return null;
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  private resolveModelName(selectedModel?: string): string {
    if (!selectedModel) {
      return "gemini-3.8-flash";
    }
    switch (selectedModel.toLowerCase()) {
      case "fast":
        return "gemini-3.8-flash";
      case "advanced":
        return "gemini-3.1-pro-preview";
      case "balanced":
        return "gemini-3.8-flash";
      default:
        return normalizeModelName(selectedModel, "gemini");
    }
  }

  private getModeAugmentation(mode?: string): string {
    switch (mode) {
      case "research":
        return "\n[MODE: RESEARCH]: Emphasize multi-source synthesis, deep analysis, nuance, and cite verified web facts.";
      case "coding":
        return "\n[MODE: CODING]: Output idiomatic, type-safe, production-ready code blocks with optimal complexity and defensive error handling.";
      case "writing":
        return "\n[MODE: WRITING]: Emphasize compelling prose, clear rhythm, precise terminology, and cohesive organization.";
      case "voice":
        return "\n[MODE: VOICE]: Format output naturally for spoken narration: concise, direct sentences without complex tables or ASCII art.";
      default:
        return "";
    }
  }

  public async streamResponse(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const ai = this.getClient();
    if (!ai) {
      await this.simulateFallbackChat(request, onChunk, signal);
      return;
    }

    let modelName = this.resolveModelName(request.model);

    // Build contents enforcing the 4-tier prompt defense hierarchy
    const contents: Array<{ role: "user" | "model"; parts: any[] }> = [];

    for (const msg of request.messages) {
      const parts: any[] = [];

      // Untrusted attachments are isolated with explicit boundaries
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.dataUrl) {
            const match = att.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1] || att.mimeType,
                  data: match[2],
                },
              });
            }
          } else if (att.textContent) {
            // Textual attachments formatted inside untrusted delimiter blocks
            parts.push({
              text: formatUntrustedAttachment(att),
            });
          }
        }
      }

      // Add user/assistant message text
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      const role = msg.role === "assistant" ? "model" : "user";
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    // Tools configuration (Google Search Grounding)
    const tools: any[] = [];
    if (request.webSearch || request.mode === "research") {
      tools.push({ googleSearch: {} });
    }

    // Compose system instruction adhering to Trust Hierarchy
    const fullSystemInstruction = [
      SYSTEM_DEFENSE_PROMPT,
      `[CONFIGURED MODEL TECHNOLOGY]: Currently configured engine model is ${modelName}.`,
      this.getModeAugmentation(request.mode),
      request.systemInstruction ? `\n[USER PERSONA DIRECTIVES]:\n${request.systemInstruction}` : "",
    ].filter(Boolean).join("\n");

    const config: any = {
      temperature: request.temperature ?? 0.7,
      systemInstruction: fullSystemInstruction,
    };

    if (signal) {
      config.abortSignal = signal;
    }

    if (tools.length > 0) {
      config.tools = tools;
    }

    // High availability candidate model list routed through the circuit breaker
    const candidateModels = getOrderedCandidateModels(modelName);

    try {
      let responseStream;
      let lastStreamError: any = null;
      const attemptedModels: string[] = [];

      for (const cand of candidateModels) {
        if (attemptedModels.includes(cand)) continue;
        attemptedModels.push(cand);

        if (signal?.aborted) {
          throw new Error("Request was aborted.");
        }

        let activeConfig = { ...config };

        // Helper function to attempt streaming for a specific model config
        const attemptStream = async (cfg: any) => {
          return await ai.models.generateContentStream({
            model: cand,
            contents,
            config: cfg,
          });
        };

        try {
          responseStream = await attemptStream(activeConfig);

          // Mark model success in circuit breaker
          markModelSuccess(cand);

          if (cand !== modelName) {
            logger.info(
              `[GeminiProvider] Engaged resilient fallback model ${cand} (preferred ${modelName}).`,
              { originalModel: modelName, fallbackModel: cand }
            );
          }
          break;
        } catch (err: any) {
          lastStreamError = err;
          const msg = String(err.message || "").toLowerCase();

          // If it's a permanent user input error (e.g. bad request 400), don't retry with other models
          if (
            err.status === 400 ||
            msg.includes("invalid argument") ||
            msg.includes("invalid input") ||
            signal?.aborted
          ) {
            throw err;
          }

          // If failure was caused by Google Search grounding quota exhaustion, retry immediately without tools
          if (
            activeConfig.tools?.length &&
            (err.status === 429 || msg.includes("quota") || msg.includes("resource_exhausted"))
          ) {
            try {
              const noToolsConfig = { ...activeConfig };
              delete noToolsConfig.tools;
              responseStream = await attemptStream(noToolsConfig);
              markModelSuccess(cand);
              logger.info(
                `[GeminiProvider] Search grounding quota reached; fulfilled stream without search tool using ${cand}.`,
                { model: cand }
              );
              break;
            } catch (retryErr: any) {
              lastStreamError = retryErr;
            }
          }

          // Record transient failure in model circuit breaker (e.g. 503 high demand spike)
          markModelFailure(cand, err.status, err);
          const cleanMessage = extractCleanErrorMessage(err);

          logger.info(
            `[GeminiProvider] Model ${cand} transiently busy (${err.status || 503} - ${cleanMessage}). Routing to next candidate...`,
            { attemptedModel: cand, status: err.status || 503 }
          );
        }
      }

      if (!responseStream) {
        throw lastStreamError || new Error("All candidate Gemini models failed.");
      }

      const sentSources = new Set<string>();

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          break;
        }

        const text = chunk.text;
        if (text) {
          onChunk({ text });
        }

        // Extract grounded sources
        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata && Array.isArray(groundingMetadata.groundingChunks)) {
          const newSources: GroundingSource[] = [];
          for (const gc of groundingMetadata.groundingChunks) {
            if (gc.web?.uri) {
              const uri = gc.web.uri;
              if (!sentSources.has(uri)) {
                sentSources.add(uri);
                let domain = "";
                try {
                  domain = new URL(uri).hostname.replace(/^www\./, "");
                } catch {
                  domain = "web";
                }
                newSources.push({
                  title: gc.web.title || domain,
                  uri,
                  domain,
                });
              }
            }
          }

          if (newSources.length > 0) {
            onChunk({ sources: newSources });
          }
        }
      }
    } catch (error: any) {
      logger.error("Gemini provider streaming execution failure:", {
        message: error.message,
        model: modelName,
      });

      // Mask sensitive error messages
      const safeMessage = error.message?.includes("API key")
        ? "AI service credential error. Please verify the server configuration."
        : "Failed to stream AI completion. Please try again.";

      throw new Error(safeMessage);
    }
  }

  public async generateResponse(
    request: ChatCompletionRequest
  ): Promise<{ text: string; sources?: GroundingSource[] }> {
    let fullText = "";
    let collectedSources: GroundingSource[] = [];

    await this.streamResponse(request, (chunk) => {
      if (chunk.text) fullText += chunk.text;
      if (chunk.sources) collectedSources = [...collectedSources, ...chunk.sources];
    });

    return { text: fullText, sources: collectedSources };
  }

  public async generateImage(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    const ai = this.getClient();
    if (!ai) {
      throw new Error("Server AI credentials are not configured.");
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: request.prompt,
        config: {
          imageConfig: {
            aspectRatio: request.aspectRatio || "1:1",
          },
        },
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.find((p: any) => p.inlineData);

      if (part && part.inlineData) {
        const mimeType = part.inlineData.mimeType || "image/png";
        const base64 = part.inlineData.data;
        return {
          imageUrl: `data:${mimeType};base64,${base64}`,
          prompt: request.prompt,
          aspectRatio: request.aspectRatio || "1:1",
          provider: "Gemini Image Studio",
        };
      }

      throw new Error("The image service returned no image output for this prompt.");
    } catch (error: any) {
      logger.error("Gemini image generation failure:", { message: error.message });
      throw new Error("Image generation failed. Please try a different prompt or aspect ratio.");
    }
  }

  public async analyzeContent(
    request: ContentAnalysisRequest
  ): Promise<ContentAnalysisResponse> {
    const prompt = `
Analyze the following document content based on this goal: "${request.instruction}".
Return:
1. A concise 2-3 sentence executive summary.
2. Up to 5 bullet points of key findings.
3. Up to 3 suggested next steps.

Document Content:
${request.content.slice(0, 40000)}
`.trim();

    const response = await this.generateResponse({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      model: "fast",
    });

    const lines = response.text.split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      summary: lines.slice(0, 2).join(" "),
      keyPoints: lines.filter((l) => l.startsWith("- ") || l.startsWith("* ")).map((l) => l.replace(/^[-*]\s*/, "")),
      suggestedActions: ["Audit findings", "Synthesize context", "Follow up on action items"],
    };
  }

  private async simulateFallbackChat(
    request: ChatCompletionRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const lastMessage = request.messages[request.messages.length - 1]?.content || "";
    const isSearch = request.webSearch || request.mode === "research";

    let reply = `Hello! I’m RSR Nexora, an AI assistant developed by RSR Studios. I received your message: "${lastMessage}".\n\n*(Note: To activate full live AI streaming capabilities, configure \`GEMINI_API_KEY\` in your environment variables).*`;

    if (isSearch) {
      reply += `\n\n**Search Grounding Active**: Live queries will cite real-time verified sources once the server API key is loaded.`;
      onChunk({
        sources: [
          { title: "RSR Nexora Documentation", uri: "https://ai.studio", domain: "ai.studio" },
        ],
      });
    }

    const words = reply.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) break;
      const chunkText = (i > 0 ? " " : "") + words[i];
      onChunk({ text: chunkText });
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}
