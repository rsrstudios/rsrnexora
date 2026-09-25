import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, X, AlertCircle } from "lucide-react";
import { useChat } from "../context/ChatContext";

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ isOpen, onClose }) => {
  const { sendMessage, currentConversation, isGenerating, settings } = useChat();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const recognitionRef = useRef<any>(null);
  const lastSpokenMsgIdRef = useRef<string | null>(null);

  // Check speech recognition support
  const isSpeechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!isOpen || !isSpeechSupported) return;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMessage(null);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setErrorMessage("Microphone access was denied. Please allow microphone permissions.");
      } else if (event.error !== "no-speech") {
        setErrorMessage(`Microphone error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [isOpen, isSpeechSupported]);

  // Handle Speech Synthesis for assistant response
  useEffect(() => {
    if (!isOpen || !audioEnabled) return;

    const messages = currentConversation?.messages || [];
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg.role === "assistant" &&
      !isGenerating &&
      lastMsg.content &&
      lastMsg.id !== lastSpokenMsgIdRef.current
    ) {
      lastSpokenMsgIdRef.current = lastMsg.id;
      speakText(lastMsg.content);
    }
  }, [currentConversation?.messages, isGenerating, isOpen, audioEnabled]);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    // Clean markdown before speaking
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/[*#_`>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = settings.voiceSpeed || 1.0;
    utterance.pitch = settings.voicePitch || 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      setErrorMessage(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Failed to start speech recognition:", err);
      }
    }
  };

  const handleSendTranscript = () => {
    if (!transcript.trim() || isGenerating) return;
    sendMessage(transcript.trim());
    setTranscript("");
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#151921] border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden p-6 flex flex-col items-center text-center relative">
        {/* Top Controls */}
        <div className="w-full flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase text-neutral-500">
              Voice Mode
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setAudioEnabled(!audioEnabled);
                if (audioEnabled && typeof window !== "undefined") {
                  window.speechSynthesis.cancel();
                  setIsSpeaking(false);
                }
              }}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title={audioEnabled ? "Mute speech audio" : "Enable speech audio"}
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-rose-500" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Animated Speaking / Listening Sphere */}
        <div className="relative my-6 flex items-center justify-center">
          {/* Ripples */}
          {(isListening || isSpeaking) && (
            <>
              <div
                className={`absolute w-36 h-36 rounded-full opacity-20 animate-ping ${
                  isSpeaking ? "bg-purple-500" : "bg-blue-500"
                }`}
              />
              <div
                className={`absolute w-44 h-44 rounded-full opacity-10 animate-pulse ${
                  isSpeaking ? "bg-purple-500" : "bg-blue-500"
                }`}
              />
            </>
          )}

          {/* Central orb */}
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
              isSpeaking
                ? "bg-purple-600 text-white scale-105 ring-8 ring-purple-500/20"
                : isListening
                ? "bg-blue-600 text-white scale-105 ring-8 ring-blue-500/20"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
            }`}
          >
            {isSpeaking ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-6 bg-white rounded-full animate-bounce" />
                <span className="w-1.5 h-10 bg-white rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-7 bg-white rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            ) : (
              <Mic className={`w-10 h-10 ${isListening ? "animate-pulse" : ""}`} />
            )}
          </div>
        </div>

        {/* Status label */}
        <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 mb-1">
          {isSpeaking
            ? "RSR Nexora is speaking..."
            : isListening
            ? "Listening to you..."
            : isGenerating
            ? "Generating response..."
            : "Tap microphone to speak"}
        </div>

        {/* Live transcript text */}
        <div className="min-h-[60px] max-h-[120px] w-full overflow-y-auto px-4 py-2 my-3 rounded-2xl bg-neutral-50 dark:bg-[#1c212c] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 italic text-center leading-relaxed">
          {transcript ? `"${transcript}"` : "Speak clearly into your microphone..."}
        </div>

        {/* Error message if any */}
        {errorMessage && (
          <div className="flex items-center gap-1.5 text-xs text-rose-500 mb-4 text-left">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!isSpeechSupported && (
          <div className="text-xs text-amber-500 mb-4">
            Live Speech Recognition is not supported in this browser. Please use Chrome or Edge.
          </div>
        )}

        {/* Bottom Actions */}
        <div className="w-full flex items-center justify-center gap-3 mt-4">
          <button
            id="voice-mic-toggle-btn"
            disabled={!isSpeechSupported}
            onClick={toggleListening}
            className={`px-5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
              isListening
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Stop Listening</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Start Listening</span>
              </>
            )}
          </button>

          {transcript && (
            <button
              onClick={handleSendTranscript}
              disabled={isGenerating}
              className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              Send Message
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
