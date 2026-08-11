"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthenticatedUser } from "@printing-stationery/shared";
import { fetchCurrentUser, logout as logoutRequest } from "@/lib/api/auth";
import {
  canMutateMasterData,
  canReadMasterData,
  isAdmin,
} from "@/lib/auth/permissions";

type AuthContextValue = {
  user: AuthenticatedUser;
  refresh: () => Promise<AuthenticatedUser | null>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canMutateMasterData: boolean;
  canReadMasterData: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  initialUser: AuthenticatedUser;
  children: ReactNode;
};

export function AuthProvider({ initialUser, children }: AuthProviderProps) {
  const [user, setUser] = useState(initialUser);

  const refresh = useCallback(async () => {
    const result = await fetchCurrentUser();
    if (!result.ok) {
      return null;
    }
    setUser(result.data);
    return result.data;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      refresh,
      logout,
      isAdmin: isAdmin(user),
      canMutateMasterData: canMutateMasterData(user),
      canReadMasterData: canReadMasterData(user),
    }),
    [user, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
