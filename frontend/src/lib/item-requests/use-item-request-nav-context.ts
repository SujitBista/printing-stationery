"use client";

import { useEffect, useState } from "react";
import type { ItemRequestWorkflowRole } from "@printing-stationery/shared";
import { fetchItemRequestContext } from "@/lib/api/item-requests";
import { useAuth } from "@/lib/auth/auth-context";

export function useItemRequestNavContext(): {
  workflowRoles: ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
  readyToIssueCount: number;
  pendingIssueVerificationCount: number;
  returnedIssueCount: number;
  loaded: boolean;
} {
  const { canAccessItemRequests } = useAuth();
  const [workflowRoles, setWorkflowRoles] = useState<ItemRequestWorkflowRole[]>(
    [],
  );
  const [canViewFulfilment, setCanViewFulfilment] = useState(false);
  const [readyToIssueCount, setReadyToIssueCount] = useState(0);
  const [pendingIssueVerificationCount, setPendingIssueVerificationCount] =
    useState(0);
  const [returnedIssueCount, setReturnedIssueCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canAccessItemRequests) {
      setWorkflowRoles([]);
      setCanViewFulfilment(false);
      setReadyToIssueCount(0);
      setPendingIssueVerificationCount(0);
      setReturnedIssueCount(0);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    void fetchItemRequestContext().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setWorkflowRoles(result.data.workflowRoles);
        setCanViewFulfilment(result.data.canViewFulfilment);
        setReadyToIssueCount(result.data.readyToIssueCount);
        setPendingIssueVerificationCount(
          result.data.pendingIssueVerificationCount,
        );
        setReturnedIssueCount(result.data.returnedIssueCount);
      }
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [canAccessItemRequests]);

  return {
    workflowRoles,
    canViewFulfilment,
    readyToIssueCount,
    pendingIssueVerificationCount,
    returnedIssueCount,
    loaded,
  };
}
