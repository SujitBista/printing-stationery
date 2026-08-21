"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  CreateStoreUserInput,
  Store,
  StoreUser,
  StoreUserStatusFilter,
  StoreUserStoreSummary,
  UpdateStoreUserInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  createStoreUser,
  fetchEligibleStores,
  fetchStoreUsers,
  updateStoreUser,
  updateStoreUserStatus,
} from "@/lib/api/store-users";
import { StoreUserFormDialog } from "./store-user-form-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PAGE_SIZE = 20;

function employeeDisplayName(employee: {
  employeeName: string;
  employeeCode: string;
}): string {
  return `${employee.employeeName} (${employee.employeeCode})`;
}

export function StoreUserSetupPage() {
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
  const [eligibleStores, setEligibleStores] = useState<StoreUserStoreSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingAssignment, setEditingAssignment] = useState<StoreUser | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadEligibleStores = useCallback(async () => {
    const result = await loadAllPaginatedOptions(
      (query) =>
        fetchEligibleStores({
          page: query.page,
          pageSize: query.pageSize,
        }),
      "ALL",
    );
    if (result.ok) {
      setEligibleStores(result.data);
    }
  }, []);

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

      await loadEligibleStores();
    }

    void loadFilterOptions();
  }, [loadEligibleStores]);

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

  function openCreateDialog() {
    setDialogMode("create");
    setEditingAssignment(null);
    setDialogOpen(true);
  }

  function openEditDialog(assignment: StoreUser) {
    setDialogMode("edit");
    setEditingAssignment(assignment);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateStoreUserInput) {
    setSaving(true);
    const result = await createStoreUser(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Store user configuration created successfully.",
    });
    await Promise.all([loadAssignments(), loadEligibleStores()]);
  }

  async function handleEdit(input: UpdateStoreUserInput) {
    if (!editingAssignment) {
      return;
    }

    setSaving(true);
    const result = await updateStoreUser(editingAssignment.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Store user configuration updated successfully.",
    });
    await loadAssignments();
  }

  async function handleToggleStatus(assignment: StoreUser) {
    if (assignment.isActive) {
      const confirmed = window.confirm(
        `Deactivate assignment for ${employeeDisplayName(assignment.maker.employee)} at ${assignment.store.storeName}? The record remains in history.`,
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
    await Promise.all([loadAssignments(), loadEligibleStores()]);
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

  const dialogStores: StoreUserStoreSummary[] =
    dialogMode === "edit" && editingAssignment
      ? [editingAssignment.store]
      : eligibleStores;

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
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateDialog}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            Add New
          </button>
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
              <table className="min-w-[64rem] w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store User
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Maker Username
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Supervisor
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Supervisor Username
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr
                      key={assignment.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="min-w-[12rem] px-3 py-3">
                        <div className="font-medium">
                          {assignment.store.storeName}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {assignment.store.storeCode}
                        </div>
                      </td>
                      <td className="min-w-[10rem] px-3 py-3 font-medium">
                        {employeeDisplayName(assignment.maker.employee)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {assignment.maker.username}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {employeeDisplayName(assignment.supervisor.employee)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {assignment.supervisor.username}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <div>{assignment.store.branch.branchName}</div>
                        <div className="text-xs text-ink-muted">
                          {assignment.store.branch.branchCode}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${assignment.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                        >
                          {assignment.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(assignment)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(assignment)}
                            disabled={statusUpdatingId === assignment.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === assignment.id
                              ? "Updating…"
                              : assignment.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      <StoreUserFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialAssignment={editingAssignment}
        stores={dialogStores}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
        onSubmitCreate={handleCreate}
        onSubmitEdit={handleEdit}
      />
    </section>
  );
}
