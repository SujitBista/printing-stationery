"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  Store,
  StoreUser,
  StoreUserStatusFilter,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  deleteStoreUser,
  fetchStoreUsers,
  updateStoreUserStatus,
} from "@/lib/api/store-users";
import { StoreUserDeleteDialog } from "./store-user-delete-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PAGE_SIZE = 20;

function optionalEmployeeDisplayName(employee: {
  employeeName: string;
  employeeCode: string;
} | null | undefined): string {
  if (!employee) {
    return "—";
  }
  return `${employee.employeeName} (${employee.employeeCode})`;
}

export function StoreUserSetupPage() {
  const router = useRouter();
  const { canManageStoreUsers } = useAuth();
  const [assignments, setAssignments] = useState<StoreUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StoreUserStatusFilter>("ALL");
  const [storeId, setStoreId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "branchCode" | "branchName">[]
  >([]);
  const [stores, setStores] = useState<
    Pick<Store, "id" | "storeCode" | "storeName" | "branchId" | "isActive">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<StoreUser | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    async function loadFilterOptions() {
      const [branchesResult, storesResult] = await Promise.all([
        loadAllPaginatedOptions(fetchBranches, "ALL"),
        loadAllPaginatedOptions(fetchStores, "ALL"),
      ]);

      if (branchesResult.ok) {
        setBranches(
          branchesResult.data.map((branch) => ({
            id: branch.id,
            branchCode: branch.branchCode,
            branchName: branch.branchName,
          })),
        );
      }

      if (storesResult.ok) {
        setStores(
          storesResult.data.map((store) => ({
            id: store.id,
            storeCode: store.storeCode,
            storeName: store.storeName,
            branchId: store.branchId,
            isActive: store.isActive,
          })),
        );
      }
    }

    void loadFilterOptions();
  }, []);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchStoreUsers({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      storeId: storeId || undefined,
      branchId: branchId || undefined,
    });

    if (!result.ok) {
      setAssignments([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setAssignments(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setSelectedId((current) =>
      current && result.data.items.some((item) => item.id === current)
        ? current
        : null,
    );
    setLoading(false);
  }, [page, search, status, storeId, branchId]);

  useEffect(() => {
    if (!canManageStoreUsers) {
      setLoading(false);
      return;
    }
    void loadAssignments();
  }, [canManageStoreUsers, loadAssignments]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearch(searchInput.trim());
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchInput]);

  function openCreatePage() {
    router.push("/organization/store-users/new");
  }

  function openEditPage(assignment: StoreUser) {
    router.push(`/organization/store-users/${assignment.id}/edit`);
  }

  async function handleToggleStatus(assignment: StoreUser) {
    if (assignment.isActive) {
      const confirmed = window.confirm(
        `Deactivate assignment for ${optionalEmployeeDisplayName(assignment.maker?.employee)} at ${assignment.store.storeName}? The record remains in history.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(assignment.id);
    const result = await updateStoreUserStatus(assignment.id, {
      isActive: !assignment.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Store user configuration activated successfully."
        : "Store user configuration deactivated successfully.",
    });
    await loadAssignments();
  }

  async function handleDelete() {
    if (!deletingAssignment) {
      return;
    }

    setDeleting(true);
    const result = await deleteStoreUser(deletingAssignment.id);
    setDeleting(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDeletingAssignment(null);
    setSelectedId(null);
    setFeedback({
      type: "success",
      message: "Store user assignment deleted.",
    });
    await loadAssignments();
  }

  if (!canManageStoreUsers) {
    return (
      <section className="w-full max-w-7xl">
        <h1
          className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
        >
          Store User Setup
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          Only an Admin can manage store user assignments.
        </p>
      </section>
    );
  }

  const selectedAssignment =
    assignments.find((assignment) => assignment.id === selectedId) ?? null;

  function handleToolbarEdit() {
    if (!selectedAssignment) {
      setFeedback({
        type: "error",
        message: "Select a store user assignment to edit.",
      });
      return;
    }
    openEditPage(selectedAssignment);
  }

  function handleToolbarDelete() {
    if (!selectedAssignment) {
      setFeedback({
        type: "error",
        message: "Select a store user assignment to delete.",
      });
      return;
    }
    setDeletingAssignment(selectedAssignment);
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            Store User Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Assign a Maker and their Checker/Supervisor to each Store. Employee
            and Branch details come from Application User Setup.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Store, maker, supervisor or username"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StoreUserStatusFilter);
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Store</span>
          <SearchableSelect
            value={storeId}
            onChange={(nextValue) => {
              setPage(1);
              setStoreId(nextValue);
            }}
            placeholder="All stores"
            searchPlaceholder="Search stores…"
            options={stores.map((store) => ({
              value: store.id,
              label: `${store.storeCode} — ${store.storeName}`,
            }))}
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Branch</span>
          <SearchableSelect
            value={branchId}
            onChange={(nextValue) => {
              setPage(1);
              setBranchId(nextValue);
            }}
            placeholder="All branches"
            searchPlaceholder="Search branches…"
            options={branches.map((branch) => ({
              value: branch.id,
              label: `${branch.branchCode} — ${branch.branchName}`,
            }))}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCreatePage}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Add New
        </button>
        <button
          type="button"
          onClick={handleToolbarEdit}
          disabled={!selectedAssignment}
          className="rounded-lg border border-border bg-paper-elevated px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleToolbarDelete}
          disabled={!selectedAssignment || deleting}
          className="rounded-lg border border-danger/40 bg-paper-elevated px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        {selectedAssignment ? (
          <button
            type="button"
            onClick={() => void handleToggleStatus(selectedAssignment)}
            disabled={statusUpdatingId === selectedAssignment.id}
            className="rounded-lg border border-border bg-paper-elevated px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {statusUpdatingId === selectedAssignment.id
              ? "Updating…"
              : selectedAssignment.isActive
                ? "Deactivate"
                : "Activate"}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <p
          className={`mt-4 border-l-2 pl-3 text-sm ${
            feedback.type === "success"
              ? "border-success text-success"
              : "border-danger text-danger"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading store users…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load store users</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No store user assignments found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL" || storeId || branchId
                ? "Try adjusting search or filters."
                : "Add a store user assignment to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-[72rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      S.N.
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      StoreName
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Employee Code
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Employee Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      SupervisorCode
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      SupervisorName
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      UserSource
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      EmpUser
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      SupervisorUser
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment, index) => {
                    const isSelected = assignment.id === selectedId;
                    return (
                      <tr
                        key={assignment.id}
                        tabIndex={0}
                        aria-selected={isSelected}
                        onClick={() => setSelectedId(assignment.id)}
                        onDoubleClick={() => openEditPage(assignment)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            openEditPage(assignment);
                          }
                        }}
                        className={`cursor-pointer border-b border-border last:border-b-0 ${
                          isSelected
                            ? "bg-accent-tint [&>td]:bg-accent-tint"
                            : "hover:bg-accent-tint/40 hover:[&>td]:bg-accent-tint/40"
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-3 text-ink-muted">
                          {(page - 1) * PAGE_SIZE + index + 1}
                        </td>
                        <td className="min-w-[12rem] px-3 py-3">
                          <div className="font-medium">
                            {assignment.store.storeName}
                          </div>
                          <div className="text-xs text-ink-muted">
                            {assignment.store.storeCode}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {assignment.maker?.employee.employeeCode ?? "—"}
                        </td>
                        <td className="min-w-[12rem] px-3 py-3 font-medium">
                          {optionalEmployeeDisplayName(assignment.maker?.employee)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {assignment.supervisor?.employee.employeeCode ?? "—"}
                        </td>
                        <td className="min-w-[12rem] px-3 py-3">
                          {optionalEmployeeDisplayName(
                            assignment.supervisor?.employee,
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-3"
                          title="Employee"
                        >
                          E
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {assignment.maker?.username ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {assignment.supervisor?.username ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${assignment.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                          >
                            {assignment.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                Showing page {page}
                {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems}{" "}
                {totalItems === 1 ? "assignment" : "assignments"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      totalPages === 0
                        ? current
                        : Math.min(totalPages, current + 1),
                    )
                  }
                  disabled={totalPages === 0 || page >= totalPages}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <StoreUserDeleteDialog
        open={Boolean(deletingAssignment)}
        assignment={deletingAssignment}
        deleting={deleting}
        onClose={() => {
          if (!deleting) {
            setDeletingAssignment(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </section>
  );
}
