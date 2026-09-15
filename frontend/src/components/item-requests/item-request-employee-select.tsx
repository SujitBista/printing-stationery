"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Employee,
  ItemRequestRequestedByEmployee,
} from "@printing-stationery/shared";
import { fetchEmployees } from "@/lib/api/employees";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { employeeDisplayName } from "./item-request-labels";

const SEARCH_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export type RequestedByEmployeeOption = ItemRequestRequestedByEmployee;

function toOption(employee: Employee): RequestedByEmployeeOption {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    isActive: employee.isActive,
    branch: employee.branch,
    department: null,
  };
}

export function ItemRequestEmployeeSelect(props: {
  value: RequestedByEmployeeOption | null;
  branchId?: string;
  disabled?: boolean;
  onChange: (employee: RequestedByEmployeeOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RequestedByEmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);

  const searchEmployees = useCallback(async (search: string) => {
    setLoading(true);
    const result = await fetchEmployees({
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      status: "ACTIVE",
      search: search.trim() || undefined,
      branchId: props.branchId,
    });
    setLoading(false);
    if (!result.ok) {
      setResults([]);
      return;
    }
    setResults(result.data.items.map(toOption));
  }, [props.branchId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void searchEmployees(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, searchEmployees]);

  const options = useMemo(() => {
    const list = [...results];
    if (props.value && !list.some((employee) => employee.id === props.value?.id)) {
      list.unshift(props.value);
    }
    return list;
  }, [props.value, results]);

  return (
    <SearchableSelect
      value={props.value?.id ?? ""}
      disabled={props.disabled}
      placeholder="Search employees…"
      searchPlaceholder="Search by name or employee number…"
      emptyMessage="No active employees match"
      filterLocally={false}
      loading={loading}
      options={options.map((employee) => ({
        value: employee.id,
        label: employeeDisplayName(employee),
      }))}
      onQueryChange={setQuery}
      onChange={(nextValue) => {
        if (!nextValue) {
          props.onChange(null);
          return;
        }
        const selected =
          options.find((employee) => employee.id === nextValue) ?? null;
        props.onChange(selected);
      }}
    />
  );
}
