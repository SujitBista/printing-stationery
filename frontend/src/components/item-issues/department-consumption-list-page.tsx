"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DepartmentConsumptionListItem } from "@printing-stationery/shared";
import { actorCanAccessDepartmentConsumption } from "@printing-stationery/shared";
import { fetchDepartments } from "@/lib/api/departments";
import { fetchDepartmentConsumptions } from "@/lib/api/item-issues";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import { formatDateTime, personDisplayName } from "./item-issue-labels";

const PAGE_SIZE = 20;

export function DepartmentConsumptionListPage() {
  const { canAccessItemRequests } = useAuth();
  const { workflowRoles } = useItemRequestNavContext();
  const canAccess =
    canAccessItemRequests && actorCanAccessDepartmentConsumption(workflowRoles);
  const [items, setItems] = useState<DepartmentConsumptionListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDepartments() {
      const result = await loadAllPaginatedOptions(fetchDepartments, "ACTIVE");
      if (result.ok) {
        setDepartmentOptions(
          result.data.map((department) => ({
            id: department.id,
            label: `${department.departmentCode} — ${department.departmentName}`,
          })),
        );
      }
    }
    if (canAccess) {
      void loadDepartments();
    }
  }, [canAccess]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchDepartmentConsumptions({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      departmentId: departmentId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
    if (!result.ok) {
      setItems([]);
      setLoadError(result.error);
      setLoading(false);
      return;
    }
    setItems(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [departmentId, fromDate, page, search, toDate]);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [canAccess, load]);

  if (!canAccess) {
    return (
      <section className="w-full max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent">
          Department Consumption
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Department Consumption.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
            Department Consumption
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Confirmed issues from Corporate Store to a Corporate Department.
          </p>
        </div>
        <Link
          href="/requests/department-consumption/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Issue to Department
        </Link>
      </div>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search issue number"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm"
        />
        <select
          value={departmentId}
          onChange={(event) => {
            setPage(1);
            setDepartmentId(event.target.value);
          }}
          className="rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm"
        >
          <option value="">All departments</option>
          {departmentOptions.map((department) => (
            <option key={department.id} value={department.id}>
              {department.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => {
            setPage(1);
            setFromDate(event.target.value);
          }}
          className="rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(event) => {
            setPage(1);
            setToDate(event.target.value);
          }}
          className="rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm"
          aria-label="To date"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent-tint px-4 py-2 text-sm font-semibold text-accent"
        >
          Search
        </button>
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading consumption…</p>
      ) : loadError ? (
        <p className="mt-6 border-l-2 border-danger pl-3 text-sm text-danger">{loadError}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">No department consumption records.</p>
      ) : (
        <>
          <div className="ps-table-shell mt-4">
            <table className="min-w-[72rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Issue</th>
                  <th className="px-3 py-2 font-semibold">Issue date</th>
                  <th className="px-3 py-2 font-semibold">Department</th>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="px-3 py-2 font-semibold">Quantity consumed</th>
                  <th className="px-3 py-2 font-semibold">Unit cost</th>
                  <th className="px-3 py-2 font-semibold">Total consumption value</th>
                  <th className="px-3 py-2 font-semibold">Consumption Description</th>
                  <th className="px-3 py-2 font-semibold">Consumed by</th>
                  <th className="px-3 py-2 font-semibold">Created by</th>
                  <th className="px-3 py-2 font-semibold">Verified/issued by</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border hover:bg-accent-soft/70">
                    <td className="px-3 py-3">
                      <Link
                        href={`/requests/item-issues/${item.itemIssueId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {item.issueNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{formatDateTime(item.issueDate)}</td>
                    <td className="px-3 py-3">{item.department.departmentName}</td>
                    <td className="px-3 py-3">
                      {item.lines.map((line) => (
                        <div key={line.id}>
                          {line.itemCode} — {line.itemName}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {item.lines.map((line) => (
                        <div key={`${line.id}-unit`}>{line.unit.unitName}</div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {item.lines.map((line) => (
                        <div key={`${line.id}-qty`}>{line.quantity}</div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {item.lines.map((line) => (
                        <div key={`${line.id}-cost`}>{line.unitCost}</div>
                      ))}
                    </td>
                    <td className="px-3 py-3">{item.totalConsumptionValue}</td>
                    <td className="px-3 py-3">{item.consumptionDescription}</td>
                    <td className="px-3 py-3">
                      {item.consumedBy
                        ? `${item.consumedBy.employeeName} (${item.consumedBy.employeeCode})`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">{personDisplayName(item.createdBy)}</td>
                    <td className="px-3 py-3">{personDisplayName(item.verifiedBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <p>
              Showing page {page}
              {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems} records
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
