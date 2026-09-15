"use client";

import { useEffect, useState } from "react";
import type { ItemRequestWorkflowRole } from "@printing-stationery/shared";
import { fetchItemRequestContext } from "@/lib/api/item-requests";
import { useAuth } from "@/lib/auth/auth-context";

export function useItemRequestNavContext(): {
  workflowRoles: ItemRequestWorkflowRole[];
  canViewFulfilment: boolean;
  loaded: boolean;
} {
  const { canAccessItemRequests } = useAuth();
  const [workflowRoles, setWorkflowRoles] = useState<ItemRequestWorkflowRole[]>(
    [],
  );
  const [canViewFulfilment, setCanViewFulfilment] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canAccessItemRequests) {
      setWorkflowRoles([]);
      setCanViewFulfilment(false);
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
      }
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [canAccessItemRequests]);

  return { workflowRoles, canViewFulfilment, loaded };
}
