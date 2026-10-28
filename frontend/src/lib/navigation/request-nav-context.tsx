"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RequestNavItemId } from "./request-nav";

type Registration = {
  token: number;
  navItemId: RequestNavItemId | null;
};

type RequestNavRegistrationContextValue = {
  /** `undefined` until a page claims the current route. */
  registeredNavItem: RequestNavItemId | null | undefined;
  register: (navItemId: RequestNavItemId | null) => () => void;
};

const RequestNavRegistrationContext =
  createContext<RequestNavRegistrationContextValue | null>(null);

export function RequestNavRegistrationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const nextToken = useRef(0);
  const [entries, setEntries] = useState<Registration[]>([]);

  const register = useCallback((navItemId: RequestNavItemId | null) => {
    const token = ++nextToken.current;
    setEntries((current) => [...current, { token, navItemId }]);
    return () => {
      setEntries((current) => current.filter((entry) => entry.token !== token));
    };
  }, []);

  const registeredNavItem =
    entries.length === 0 ? undefined : entries[entries.length - 1]?.navItemId;

  const value = useMemo(
    () => ({ registeredNavItem, register }),
    [registeredNavItem, register],
  );

  return (
    <RequestNavRegistrationContext.Provider value={value}>
      {children}
    </RequestNavRegistrationContext.Provider>
  );
}

export function useRegisteredRequestNavItem():
  | RequestNavItemId
  | null
  | undefined {
  return useContext(RequestNavRegistrationContext)?.registeredNavItem;
}

/**
 * Claims the current shared route for one sidebar item.
 * Pass `undefined` while the page is still loading so a URL hint can apply.
 */
export function useRegisterRequestNavItem(
  navItemId: RequestNavItemId | null | undefined,
) {
  const register = useContext(RequestNavRegistrationContext)?.register;

  useEffect(() => {
    if (!register || navItemId === undefined) {
      return;
    }
    return register(navItemId);
  }, [navItemId, register]);
}
