import {
  Conversation,
  Workspace,
  MemoryItem,
  AppSettings,
  GeneratedImage,
  SmartMode,
} from "../types";

export const STORAGE_VERSION = "3.0.0";
const PREFIX = "rsr_ai_v3_";

export const KEYS = {
  VERSION: `${PREFIX}schema_version`,
  WORKSPACES: `${PREFIX}workspaces`,
  ACTIVE_WORKSPACE: `${PREFIX}active_workspace_id`,
  CONVERSATIONS: `${PREFIX}conversations`,
  CURRENT_CONV_ID: `${PREFIX}current_conversation_id`,
  SETTINGS: `${PREFIX}settings`,
  MEMORIES: `${PREFIX}memories`,
  IMAGE_GALLERY: `${PREFIX}image_gallery`,
  PROFILE: `${PREFIX}user_profile`,
};

// Default Workspace
export const DEFAULT_WORKSPACE: Workspace = {
  id: "workspace-default",
  name: "Personal Space",
  description: "Your primary workspace for everyday tasks and thoughts",
  icon: "Folder",
  color: "#3b82f6",
  customInstructions: "Provide clear, structured, and insightful answers with concise summaries.",
  files: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  systemInstruction:
    "You are RSR Nexora, an intelligent, professional, and helpful AI assistant developed by RSR Studios. Provide concise, clear, and well-structured answers.",
  temperature: 0.7,
  streamResponse: true,
  fontSize: "normal",
  selectedModel: "balanced",
  webSearchEnabled: false,
  voiceEnabled: true,
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  voiceAutoplay: false,
  memoryEnabled: true,
  activeMode: "chat",
};

export class StorageService {
  public static init(): void {
    try {
      this.runMigrations();
    } catch (e) {
      console.error("Storage migration failed:", e);
    }
  }

  // Schema migration from v2 to v3
  private static runMigrations(): void {
    const currentVer = localStorage.getItem(KEYS.VERSION);
    if (currentVer === STORAGE_VERSION) return;

    // Migrate conversations from v2
    const v2Convs = localStorage.getItem("rsr_ai_conversations_v2");
    if (v2Convs && !localStorage.getItem(KEYS.CONVERSATIONS)) {
      try {
        const parsed = JSON.parse(v2Convs);
        if (Array.isArray(parsed)) {
          const migrated: Conversation[] = parsed.map((c) => ({
            ...c,
            workspaceId: "workspace-default",
            isPinned: false,
            isFavorite: false,
            isArchived: false,
            mode: "chat",
            messages: c.messages.map((m: any) => ({
              ...m,
              versions: m.versions || [m.content],
              currentVersionIndex: 0,
            })),
          }));
          localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(migrated));
        }
      } catch (e) {
        console.warn("Migration v2 convs failed:", e);
      }
    }

    // Migrate settings from v2
    const v2Settings = localStorage.getItem("rsr_ai_settings_v2");
    if (v2Settings && !localStorage.getItem(KEYS.SETTINGS)) {
      try {
        const parsed = JSON.parse(v2Settings);
        localStorage.setItem(
          KEYS.SETTINGS,
          JSON.stringify({ ...DEFAULT_SETTINGS, ...parsed, activeMode: "chat" })
        );
      } catch {}
    }

    // Migrate memories from v2
    const v2Memories = localStorage.getItem("rsr_ai_memories_v2");
    if (v2Memories && !localStorage.getItem(KEYS.MEMORIES)) {
      try {
        const parsed = JSON.parse(v2Memories);
        if (Array.isArray(parsed)) {
          localStorage.setItem(KEYS.MEMORIES, JSON.stringify(parsed));
        }
      } catch {}
    }

    // Ensure default workspace exists
    if (!localStorage.getItem(KEYS.WORKSPACES)) {
      localStorage.setItem(KEYS.WORKSPACES, JSON.stringify([DEFAULT_WORKSPACE]));
    }

    localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
  }

  // Workspaces
  public static getWorkspaces(): Workspace[] {
    try {
      const data = localStorage.getItem(KEYS.WORKSPACES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [DEFAULT_WORKSPACE];
  }

  public static saveWorkspaces(workspaces: Workspace[]): void {
    localStorage.setItem(KEYS.WORKSPACES, JSON.stringify(workspaces));
  }

  public static getActiveWorkspaceId(): string {
    return localStorage.getItem(KEYS.ACTIVE_WORKSPACE) || "workspace-default";
  }

  public static setActiveWorkspaceId(id: string): void {
    localStorage.setItem(KEYS.ACTIVE_WORKSPACE, id);
  }

  // Conversations (debounced by default to prevent main-thread freezing during streaming)
  public static getConversations(): Conversation[] {
    try {
      const data = localStorage.getItem(KEYS.CONVERSATIONS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load conversations from storage:", e);
    }
    return [];
  }

  private static saveConvTimer: any = null;
  public static saveConversations(convs: Conversation[], immediate: boolean = false): void {
    if (immediate) {
      if (this.saveConvTimer) clearTimeout(this.saveConvTimer);
      try {
        localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(convs));
      } catch (e) {
        console.warn("Storage write failed:", e);
      }
      return;
    }
    if (this.saveConvTimer) clearTimeout(this.saveConvTimer);
    this.saveConvTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(convs));
      } catch (e) {
        console.warn("Deferred storage write failed:", e);
      }
    }, 350);
  }

  // Settings
  private static saveSettingsTimer: any = null;
  public static getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(KEYS.SETTINGS);
      if (data) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  }

  public static saveSettings(settings: AppSettings): void {
    if (this.saveSettingsTimer) clearTimeout(this.saveSettingsTimer);
    this.saveSettingsTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
      } catch (e) {
        console.warn("Settings storage write failed:", e);
      }
    }, 200);
  }

  // Memories
  public static getMemories(): MemoryItem[] {
    try {
      const data = localStorage.getItem(KEYS.MEMORIES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  public static saveMemories(memories: MemoryItem[]): void {
    localStorage.setItem(KEYS.MEMORIES, JSON.stringify(memories));
  }

  // Images Gallery
  public static getImageGallery(): GeneratedImage[] {
    try {
      const data = localStorage.getItem(KEYS.IMAGE_GALLERY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  public static saveImageGallery(images: GeneratedImage[]): void {
    localStorage.setItem(KEYS.IMAGE_GALLERY, JSON.stringify(images));
  }

  // Data & Privacy Calculations
  public static calculateStorageUsage(): {
    totalBytes: number;
    formattedSize: string;
    conversationCount: number;
    messageCount: number;
    memoryCount: number;
    imageCount: number;
    workspaceCount: number;
  } {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("rsr_ai")) {
        const val = localStorage.getItem(key) || "";
        totalBytes += key.length * 2 + val.length * 2;
      }
    }

    const convs = this.getConversations();
    const memories = this.getMemories();
    const images = this.getImageGallery();
    const workspaces = this.getWorkspaces();

    let messageCount = 0;
    convs.forEach((c) => (messageCount += c.messages?.length || 0));

    const kb = totalBytes / 1024;
    const formattedSize = kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;

    return {
      totalBytes,
      formattedSize,
      conversationCount: convs.length,
      messageCount,
      memoryCount: memories.length,
      imageCount: images.length,
      workspaceCount: workspaces.length,
    };
  }

  // Export full JSON backup
  public static exportAllData(): string {
    const backup = {
      app: "RSR Nexora",
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      workspaces: this.getWorkspaces(),
      conversations: this.getConversations(),
      memories: this.getMemories(),
      images: this.getImageGallery(),
      settings: this.getSettings(),
    };
    return JSON.stringify(backup, null, 2);
  }

  // Import JSON backup
  public static importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.workspaces && Array.isArray(data.workspaces)) {
        this.saveWorkspaces(data.workspaces);
      }
      if (data.conversations && Array.isArray(data.conversations)) {
        this.saveConversations(data.conversations);
      }
      if (data.memories && Array.isArray(data.memories)) {
        this.saveMemories(data.memories);
      }
      if (data.images && Array.isArray(data.images)) {
        this.saveImageGallery(data.images);
      }
      if (data.settings) {
        this.saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
      return true;
    } catch (e) {
      console.error("Failed to import data", e);
      return false;
    }
  }

  // Clear all local data
  public static clearAllData(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("rsr_ai")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    this.init();
  }
}
