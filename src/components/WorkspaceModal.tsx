import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Folder,
  Code,
  BookOpen,
  Sparkles,
  Search,
  Trash2,
  FileText,
  Upload,
  Check,
  Briefcase,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { WorkspaceFile } from "../types";

export const WorkspaceModal: React.FC = () => {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addFileToWorkspace,
    removeFileFromWorkspace,
    isWorkspaceModalOpen,
    closeWorkspaceModal,
  } = useWorkspace();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newIcon, setNewIcon] = useState("Folder");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isWorkspaceModalOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createWorkspace(newName, newDesc, newIcon, "#3b82f6", newInstructions);
    setNewName("");
    setNewDesc("");
    setNewInstructions("");
    setIsCreating(false);
  };

  const handleUploadWorkspaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let textContent = "";
      try {
        textContent = await file.text();
      } catch {
        textContent = `Reference file: ${file.name}`;
      }

      const wsFile: WorkspaceFile = {
        id: "wf_" + Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: file.size,
        mimeType: file.type || "text/plain",
        fileCategory: file.name.match(/\.(ts|js|py|html|css|json)$/i)
          ? "code"
          : file.name.endsWith(".pdf")
          ? "pdf"
          : "text",
        textContent,
        createdAt: Date.now(),
      };

      addFileToWorkspace(activeWorkspaceId, wsFile);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const ICONS: Record<string, React.ElementType> = {
    Folder,
    Code,
    BookOpen,
    Search,
    Sparkles,
    Briefcase,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#11141a] text-neutral-900 dark:text-neutral-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 id="workspace-modal-title" className="text-sm font-semibold tracking-tight">
                Workspaces & Projects
              </h2>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Isolate conversations, custom instructions & reference files
              </span>
            </div>
          </div>

          <button
            onClick={closeWorkspaceModal}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Workspaces Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Select Active Workspace
              </span>
              {!isCreating && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Workspace</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {workspaces.map((ws) => {
                const IconComponent = ICONS[ws.icon] || Folder;
                const isActive = ws.id === activeWorkspaceId;

                return (
                  <div
                    key={ws.id}
                    onClick={() => setActiveWorkspaceId(ws.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                      isActive
                        ? "border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs"
                        : "border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#151921]/50 hover:border-neutral-300 dark:hover:border-neutral-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <IconComponent
                            className={`w-4 h-4 ${
                              isActive ? "text-blue-600 dark:text-blue-400" : "text-neutral-500"
                            }`}
                          />
                          <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                            {ws.name}
                          </span>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      {ws.description && (
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mb-2">
                          {ws.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-2 pt-2 border-t border-neutral-200/40 dark:border-neutral-800/40">
                      <span>{ws.files?.length || 0} reference files</span>
                      {workspaces.length > 1 && ws.id !== "workspace-default" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWorkspace(ws.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-1 cursor-pointer"
                          title="Delete workspace"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create Workspace Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#151921] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Create Workspace
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-neutral-400 hover:text-neutral-600 text-xs"
                >
                  Cancel
                </button>
              </div>

              <input
                type="text"
                placeholder="Workspace name (e.g. Mobile App Dev, Research Lab)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="Short description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />

              <textarea
                placeholder="Custom Instructions for this workspace (e.g. Always respond in TypeScript, avoid comments, focus on clean architecture)"
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500 resize-none"
              />

              <button
                type="submit"
                className="w-full py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
              >
                Create Workspace
              </button>
            </form>
          )}

          {/* Active Workspace Settings: Instructions & Reference Files */}
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Active Workspace: {activeWorkspace.name}
            </h3>

            {/* Custom Instructions Editor */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Workspace System Instructions
              </label>
              <textarea
                value={activeWorkspace.customInstructions || ""}
                onChange={(e) =>
                  updateWorkspace(activeWorkspace.id, { customInstructions: e.target.value })
                }
                placeholder="Custom guidelines that will automatically be injected for every conversation in this workspace..."
                rows={3}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500 leading-relaxed"
              />
            </div>

            {/* Reference Files */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Shared Reference Files ({activeWorkspace.files?.length || 0})
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Files</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleUploadWorkspaceFile}
                  className="hidden"
                />
              </div>

              {activeWorkspace.files && activeWorkspace.files.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {activeWorkspace.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151921] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                        <span className="truncate text-neutral-800 dark:text-neutral-200">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <button
                        onClick={() => removeFileFromWorkspace(activeWorkspace.id, file.id)}
                        className="text-neutral-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-center text-[11px] text-neutral-400">
                  No reference files added yet. Upload documents or code snippets to provide shared context across all chats in this workspace.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-800 flex justify-end flex-shrink-0">
          <button
            onClick={closeWorkspaceModal}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
