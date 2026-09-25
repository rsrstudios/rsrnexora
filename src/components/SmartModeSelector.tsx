import React from "react";
import { MessageSquare, Globe, Code2, PenTool, Image, Mic } from "lucide-react";
import { SmartMode } from "../types";
import { useChat } from "../context/ChatContext";

interface SmartModeSelectorProps {
  onOpenVoiceModal?: () => void;
  onOpenImageModal?: () => void;
  compact?: boolean;
}

interface ModeConfig {
  id: SmartMode;
  label: string;
  icon: React.ElementType;
  description: string;
}

const MODES: ModeConfig[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    description: "General intelligence & daily tasks",
  },
  {
    id: "research",
    label: "Research",
    icon: Globe,
    description: "Live web search & fact synthesis",
  },
  {
    id: "coding",
    label: "Coding",
    icon: Code2,
    description: "Architecture, logic & code syntax",
  },
  {
    id: "writing",
    label: "Writing",
    icon: PenTool,
    description: "Prose, drafting & editorial review",
  },
  {
    id: "image",
    label: "Image",
    icon: Image,
    description: "High-fidelity AI visual studio",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic,
    description: "Real-time speech conversation",
  },
];

export const SmartModeSelector: React.FC<SmartModeSelectorProps> = ({
  onOpenVoiceModal,
  onOpenImageModal,
  compact = false,
}) => {
  const { activeMode, setActiveMode } = useChat();

  const handleSelectMode = (mode: SmartMode) => {
    setActiveMode(mode);
    if (mode === "voice" && onOpenVoiceModal) {
      onOpenVoiceModal();
    } else if (mode === "image" && onOpenImageModal) {
      onOpenImageModal();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Smart chat mode selector"
      className={`inline-flex items-center gap-1 p-1 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-xs ${
        compact ? "scale-90 origin-left" : ""
      }`}
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const isActive = activeMode === m.id;

        return (
          <button
            key={m.id}
            id={`smart-mode-${m.id}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelectMode(m.id)}
            title={`${m.label}: ${m.description}`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer select-none ${
              isActive
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs border border-neutral-200/60 dark:border-neutral-700/60"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50"
            }`}
          >
            <Icon
              className={`w-3.5 h-3.5 ${
                isActive ? "text-blue-600 dark:text-blue-400" : "opacity-70"
              }`}
            />
            <span className="whitespace-nowrap">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
};
