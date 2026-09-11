"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  CreatePartyInput,
  Party,
  PartyStatusFilter,
  UpdatePartyInput,
} from "@printing-stationery/shared";
import {
  createParty,
  deleteParty,
  fetchParties,
  updateParty,
  updatePartyStatus,
} from "@/lib/api/parties";
import { PartyFormDialog } from "./party-form-dialog";

const PAGE_SIZE = 20;

export function PartySetupPage() {
  const { canMutateMasterData } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PartyStatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingParty, setEditingParty] = useState<Party | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadParties = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchParties({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
    });

    if (!result.ok) {
      setParties([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setParties(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => {
    void loadParties();
  }, [loadParties]);

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
    setEditingParty(null);
    setDialogOpen(true);
  }

  function openEditDialog(party: Party) {
    setDialogMode("edit");
    setEditingParty(party);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreatePartyInput) {
    setSaving(true);
    const result = await createParty(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Party created successfully.",
    });
    await loadParties();
  }

  async function handleEdit(input: UpdatePartyInput) {
    if (!editingParty) {
      return;
    }

    setSaving(true);
    const result = await updateParty(editingParty.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Party updated successfully.",
    });
    await loadParties();
  }

  async function handleToggleStatus(party: Party) {
    if (party.isActive) {
      const confirmed = window.confirm(
        `Deactivate party "${party.partyName}" (${party.partyCode})? The party will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(party.id);
    const result = await updatePartyStatus(party.id, {
      isActive: !party.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Party activated successfully."
        : "Party deactivated successfully.",
    });
    await loadParties();
  }

  async function handleDelete(party: Party) {
    const confirmed = window.confirm(
      `Delete party "${party.partyName}" (${party.partyCode})? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(party.id);
    const result = await deleteParty(party.id);
    setDeletingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: `Party ${party.partyName} deleted.`,
    });
    await loadParties();
  }

  return (
    <section className="w-full max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            Party Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Parties are vendors and suppliers used on purchase records.
          </p>
        </div>
        {canMutateMasterData ? (
        <button
          type="button"
          onClick={openCreateDialog}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Add Party
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
            placeholder="Search by code or name"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm sm:w-48">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as PartyStatusFilter);
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
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
          <p className="text-sm text-ink-muted">Loading parties…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load parties</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : parties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No parties found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL"
                ? "Try adjusting search or status filters."
                : "Add a party to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Party Code</th>
                    <th className="px-3 py-2 font-semibold">Party Name</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((party) => (
                    <tr
                      key={party.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="px-3 py-3 font-medium">
                        {party.partyCode}
                      </td>
                      <td className="px-3 py-3">{party.partyName}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${party.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                        >
                          {party.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {canMutateMasterData ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(party)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(party)}
                            disabled={statusUpdatingId === party.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === party.id
                              ? "Updating…"
                              : party.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(party)}
                            disabled={deletingId === party.id}
                            className="font-medium text-danger hover:underline disabled:opacity-60"
                          >
                            {deletingId === party.id ? "Deleting…" : "Delete"}
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
                {totalItems === 1 ? "party" : "parties"}
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

      <PartyFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialParty={editingParty}
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
