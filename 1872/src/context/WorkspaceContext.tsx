import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Workspace, WorkspaceFile } from "../types";
import { StorageService, DEFAULT_WORKSPACE } from "../services/storageService";

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (
    name: string,
    description?: string,
    icon?: string,
    color?: string,
    customInstructions?: string
  ) => string;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;
  addFileToWorkspace: (workspaceId: string, file: WorkspaceFile) => void;
  removeFileFromWorkspace: (workspaceId: string, fileId: string) => void;
  isWorkspaceModalOpen: boolean;
  openWorkspaceModal: () => void;
  closeWorkspaceModal: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

function generateId(): string {
  return "ws_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    return StorageService.getWorkspaces();
  });

  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => {
    return StorageService.getActiveWorkspaceId();
  });

  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);

  // Sync to storage
  useEffect(() => {
    StorageService.saveWorkspaces(workspaces);
  }, [workspaces]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    StorageService.setActiveWorkspaceId(id);
  }, []);

  const createWorkspace = useCallback(
    (
      name: string,
      description?: string,
      icon: string = "Folder",
      color: string = "#3b82f6",
      customInstructions?: string
    ): string => {
      const newId = generateId();
      const newWs: Workspace = {
        id: newId,
        name: name.trim(),
        description: description?.trim(),
        icon,
        color,
        customInstructions: customInstructions?.trim(),
        files: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspaceId(newId);
      return newId;
    },
    [setActiveWorkspaceId]
  );

  const updateWorkspace = useCallback((id: string, updates: Partial<Workspace>) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w))
    );
  }, []);

  const deleteWorkspace = useCallback(
    (id: string) => {
      if (id === DEFAULT_WORKSPACE.id) {
        // Cannot delete default workspace
        return;
      }
      setWorkspaces((prev) => {
        const remaining = prev.filter((w) => w.id !== id);
        return remaining.length > 0 ? remaining : [DEFAULT_WORKSPACE];
      });
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(DEFAULT_WORKSPACE.id);
      }
    },
    [activeWorkspaceId, setActiveWorkspaceId]
  );

  const addFileToWorkspace = useCallback((workspaceId: string, file: WorkspaceFile) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          files: [file, ...(w.files || [])],
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const removeFileFromWorkspace = useCallback((workspaceId: string, fileId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        return {
          ...w,
          files: (w.files || []).filter((f) => f.id !== fileId),
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || DEFAULT_WORKSPACE;

  return (
    <WorkspaceContext.Provider
      value={{
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
        openWorkspaceModal: () => setIsWorkspaceModalOpen(true),
        closeWorkspaceModal: () => setIsWorkspaceModalOpen(false),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
