import React, { createContext, useContext, useState, useEffect } from "react";
import { UserProfile } from "../types";

const TOKEN_STORAGE_KEY = "rsr_ai_auth_token_v4";
const USER_STORAGE_KEY = "rsr_ai_user_auth_v4";

interface AuthContextType {
  user: UserProfile;
  token: string | null;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string, confirmPassword?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  toggleCloudSync: () => void;
}

const DEFAULT_GUEST_USER: UserProfile = {
  id: "guest_local",
  name: "Guest User",
  isGuest: true,
  syncEnabled: false,
  createdAt: Date.now(),
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });

  const [user, setUser] = useState<UserProfile>(() => {
    if (typeof window === "undefined") return DEFAULT_GUEST_USER;
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to read user auth state:", e);
    }
    return DEFAULT_GUEST_USER;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Validate session with backend on mount
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    fetch("/api/auth/session", {
      headers,
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            isGuest: Boolean(data.user.isGuest),
            syncEnabled: !data.user.isGuest,
            createdAt: data.user.createdAt || Date.now(),
          });
          if (data.token && !token) {
            setToken(data.token);
          }
        } else {
          // Token expired or invalid
          setToken(null);
          setUser(DEFAULT_GUEST_USER);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(USER_STORAGE_KEY);
        }
      })
      .catch(() => {
        // Offline or connection failure - keep local cached profile
      });
  }, [token]);

  // Persist user and token to local storage
  useEffect(() => {
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.error("Failed to save auth state:", e);
    }
  }, [user, token]);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || "Invalid email or password.",
        };
      }

      setToken(data.token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        isGuest: false,
        syncEnabled: true,
        createdAt: data.user.createdAt,
      });
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: "Unable to connect to authentication server. Please verify your connection.",
      };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    confirmPassword?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || "Registration failed. Please check your details.",
        };
      }

      setToken(data.token);
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        isGuest: false,
        syncEnabled: true,
        createdAt: data.user.createdAt,
      });
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: "Unable to connect to registration server. Please verify your connection.",
      };
    }
  };

  const signOut = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch("/api/auth/logout", {
        method: "POST",
        headers,
        credentials: "include",
      });
    } catch {}
    setToken(null);
    setUser(DEFAULT_GUEST_USER);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  const toggleCloudSync = () => {
    setUser((prev) => ({
      ...prev,
      syncEnabled: !prev.syncEnabled,
    }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        signIn,
        signUp,
        signOut,
        toggleCloudSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
