"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  CreateStoreInput,
  Store,
  StoreHierarchyFilter,
  StoreStatusFilter,
  UpdateStoreInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  createStore,
  fetchStores,
  updateStore,
  updateStoreStatus,
} from "@/lib/api/stores";
import { StoreFormDialog } from "./store-form-dialog";
import { StoreImportDialog } from "./store-import-dialog";

const PAGE_SIZE = 20;

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function StoreSetupPage() {
  const { canMutateMasterData } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StoreStatusFilter>("ALL");
  const [branchId, setBranchId] = useState("");
  const [hierarchy, setHierarchy] = useState<StoreHierarchyFilter>("ALL");
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "branchCode" | "branchName">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    async function loadFilterOptions() {
      const branchesResult = await loadAllPaginatedOptions(fetchBranches, "ALL");

      if (branchesResult.ok) {
        setBranches(
          branchesResult.data.map((branch) => ({
            id: branch.id,
            branchCode: branch.branchCode,
            branchName: branch.branchName,
          })),
        );
      }
    }

    void loadFilterOptions();
  }, []);

  const loadStores = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchStores({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      branchId: branchId || undefined,
      hierarchy,
    });

    if (!result.ok) {
      setStores([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setStores(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status, branchId, hierarchy]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

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
    setEditingStore(null);
    setDialogOpen(true);
  }

  function openEditDialog(store: Store) {
    setDialogMode("edit");
    setEditingStore(store);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateStoreInput) {
    setSaving(true);
    const result = await createStore(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Store created successfully.",
    });
    await loadStores();
  }

  async function handleEdit(input: UpdateStoreInput) {
    if (!editingStore) {
      return;
    }

    setSaving(true);
    const result = await updateStore(editingStore.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Store updated successfully.",
    });
    await loadStores();
  }

  async function handleToggleStatus(store: Store) {
    if (store.isActive) {
      const confirmed = window.confirm(
        `Deactivate store "${store.storeName}"? The store will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(store.id);
    const result = await updateStoreStatus(store.id, {
      isActive: !store.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Store activated successfully."
        : "Store deactivated successfully.",
    });
    await loadStores();
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Store Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Stores define the inventory locations where stationery and printing
            items will be held and managed.
          </p>
        </div>
        {canMutateMasterData ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportDialogOpen(true)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
            >
              Import Stores
            </button>
            <button
              type="button"
              onClick={openCreateDialog}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Add New
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by code or name"
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as StoreStatusFilter);
            }}
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Branch</span>
          <select
            value={branchId}
            onChange={(event) => {
              setPage(1);
              setBranchId(event.target.value);
            }}
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.branchCode} — {branch.branchName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Hierarchy</span>
          <select
            value={hierarchy}
            onChange={(event) => {
              setPage(1);
              setHierarchy(event.target.value as StoreHierarchyFilter);
            }}
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="ALL">All stores</option>
            <option value="TOP_LEVEL">Top-level only</option>
            <option value="NESTED">Under another store</option>
          </select>
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
          <p className="text-sm text-ink-muted">Loading stores…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load stores</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
            <p className="font-medium text-ink">No stores found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL" || branchId || hierarchy !== "ALL"
                ? "Try adjusting search or filters."
                : "Add a store to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border bg-paper-elevated">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store Code
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Store Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Under Store
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Allow Transfer
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Department Issue
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
                  {stores.map((store) => (
                    <tr
                      key={store.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {store.storeCode}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3 font-medium">
                        {store.storeName}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <div>{store.branch.branchName}</div>
                        <div className="text-xs text-ink-muted">
                          {store.branch.branchCode}
                        </div>
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        {store.underStore ? (
                          <>
                            <div>{store.underStore.storeName}</div>
                            <div className="text-xs text-ink-muted">
                              {store.underStore.storeCode}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-muted">None</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {yesNo(store.allowTransfer)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {yesNo(store.allowDepartmentIssue)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={
                            store.isActive ? "text-success" : "text-ink-muted"
                          }
                        >
                          {store.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {canMutateMasterData ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(store)}
                            className="text-accent hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(store)}
                            disabled={statusUpdatingId === store.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === store.id
                              ? "Updating…"
                              : store.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
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
                {totalItems === 1 ? "store" : "stores"}
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

      <StoreFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialStore={editingStore}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
        onSubmitCreate={handleCreate}
        onSubmitEdit={handleEdit}
      />

      <StoreImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={(importedCount, skippedExistingCount) => {
          setImportDialogOpen(false);
          setFeedback({
            type: "success",
            message:
              skippedExistingCount > 0
                ? `Imported ${importedCount} store${importedCount === 1 ? "" : "s"}; skipped ${skippedExistingCount} existing.`
                : `Imported ${importedCount} store${importedCount === 1 ? "" : "s"}.`,
          });
          void loadStores();
        }}
      />
    </section>
  );
}
