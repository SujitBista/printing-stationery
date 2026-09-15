"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ItemRequestWorkflowRole } from "@printing-stationery/shared";
import { fetchItemRequestContext } from "@/lib/api/item-requests";
import { useAuth } from "@/lib/auth/auth-context";

export type ItemRequestNavContextValue = {
  workflowRoles: ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
  canCreate: boolean;
  readyToIssueCount: number;
  pendingIssueVerificationCount: number;
  returnedIssueCount: number;
  loaded: boolean;
  setReadyToIssueCount: (count: number) => void;
  setPendingIssueVerificationCount: (count: number) => void;
  setReturnedIssueCount: (count: number) => void;
  refresh: () => Promise<void>;
};

const ItemRequestNavContext = createContext<ItemRequestNavContextValue | null>(
  null,
);

function useItemRequestNavContextState(): ItemRequestNavContextValue {
  const { canAccessItemRequests } = useAuth();
  const [workflowRoles, setWorkflowRoles] = useState<ItemRequestWorkflowRole[]>(
    [],
  );
  const [canViewFulfilment, setCanViewFulfilment] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [readyToIssueCount, setReadyToIssueCount] = useState(0);
  const [pendingIssueVerificationCount, setPendingIssueVerificationCount] =
    useState(0);
  const [returnedIssueCount, setReturnedIssueCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!canAccessItemRequests) {
      setWorkflowRoles([]);
      setCanViewFulfilment(false);
      setCanCreate(false);
      setReadyToIssueCount(0);
      setPendingIssueVerificationCount(0);
      setReturnedIssueCount(0);
      setLoaded(true);
      return;
    }

    const result = await fetchItemRequestContext();
    if (!result.ok) {
      setLoaded(true);
      return;
    }

    setWorkflowRoles(result.data.workflowRoles);
    setCanViewFulfilment(result.data.canViewFulfilment);
    setCanCreate(result.data.canCreate);
    setReadyToIssueCount(result.data.readyToIssueCount);
    setPendingIssueVerificationCount(result.data.pendingIssueVerificationCount);
    setReturnedIssueCount(result.data.returnedIssueCount);
    setLoaded(true);
  }, [canAccessItemRequests]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return useMemo(
    () => ({
      workflowRoles,
      canViewFulfilment,
      canCreate,
      readyToIssueCount,
      pendingIssueVerificationCount,
      returnedIssueCount,
      loaded,
      setReadyToIssueCount,
      setPendingIssueVerificationCount,
      setReturnedIssueCount,
      refresh,
    }),
    [
      workflowRoles,
      canViewFulfilment,
      canCreate,
      readyToIssueCount,
      pendingIssueVerificationCount,
      returnedIssueCount,
      loaded,
      refresh,
    ],
  );
}

export function ItemRequestNavProvider({ children }: { children: ReactNode }) {
  const value = useItemRequestNavContextState();
  return (
    <ItemRequestNavContext.Provider value={value}>
      {children}
    </ItemRequestNavContext.Provider>
  );
}

export function useItemRequestNavContext(): ItemRequestNavContextValue {
  const context = useContext(ItemRequestNavContext);
  if (!context) {
    throw new Error(
      "useItemRequestNavContext must be used within ItemRequestNavProvider",
    );
  }
  return context;
}
