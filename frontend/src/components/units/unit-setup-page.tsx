"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  CreateUnitInput,
  Unit,
  UnitStatusFilter,
  UpdateUnitInput,
} from "@printing-stationery/shared";
import {
  createUnit,
  fetchUnits,
  updateUnit,
  updateUnitStatus,
} from "@/lib/api/units";
import { UnitFormDialog } from "./unit-form-dialog";

const PAGE_SIZE = 20;

export function UnitSetupPage() {
  const { canMutateMasterData } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UnitStatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadUnits = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchUnits({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
    });

    if (!result.ok) {
      setUnits([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setUnits(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

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
    setEditingUnit(null);
    setDialogOpen(true);
  }

  function openEditDialog(unit: Unit) {
    setDialogMode("edit");
    setEditingUnit(unit);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateUnitInput) {
    setSaving(true);
    const result = await createUnit(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Unit created successfully.",
    });
    await loadUnits();
  }

  async function handleEdit(input: UpdateUnitInput) {
    if (!editingUnit) {
      return;
    }

    setSaving(true);
    const result = await updateUnit(editingUnit.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Unit updated successfully.",
    });
    await loadUnits();
  }

  async function handleToggleStatus(unit: Unit) {
    if (unit.isActive) {
      const confirmed = window.confirm(
        `Deactivate unit "${unit.unitName}"? The unit will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(unit.id);
    const result = await updateUnitStatus(unit.id, {
      isActive: !unit.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Unit activated successfully."
        : "Unit deactivated successfully.",
    });
    await loadUnits();
  }

  return (
    <section className="w-full max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Unit Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Units define how stationery and printing items are counted or
            measured.
          </p>
        </div>
        {canMutateMasterData ? (
        <button
          type="button"
          onClick={openCreateDialog}
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Add Unit
        </button>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by unit name"
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-48">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as UnitStatusFilter);
            }}
            className="rounded-md border border-border bg-paper-elevated px-3 py-2 outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
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
          <p className="text-sm text-ink-muted">Loading units…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load units</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
            <p className="font-medium text-ink">No units found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL"
                ? "Try adjusting search or status filters."
                : "Add a unit to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border bg-paper-elevated">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-paper text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Unit Name</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr
                      key={unit.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-3 font-medium">{unit.unitName}</td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            unit.isActive ? "text-success" : "text-ink-muted"
                          }
                        >
                          {unit.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {canMutateMasterData ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(unit)}
                            className="text-accent hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(unit)}
                            disabled={statusUpdatingId === unit.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === unit.id
                              ? "Updating…"
                              : unit.isActive
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
                {totalItems === 1 ? "unit" : "units"}
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

      <UnitFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialUnit={editingUnit}
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
