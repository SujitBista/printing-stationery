"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateItemInput,
  GroupType,
  Item,
  ItemGroup,
  ItemStatusFilter,
  Unit,
  UpdateItemInput,
} from "@printing-stationery/shared";
import { groupTypeLabel } from "@/components/item-groups/item-group-form-dialog";
import { fetchItemGroups } from "@/lib/api/item-groups";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  createItem,
  fetchItems,
  updateItem,
  updateItemStatus,
} from "@/lib/api/items";
import { fetchUnits } from "@/lib/api/units";
import { ItemFormDialog, returnTypeLabel } from "./item-form-dialog";
import { ItemImportDialog } from "./item-import-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PAGE_SIZE = 20;

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function ItemSetupPage() {
  const { canMutateMasterData } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ItemStatusFilter>("ALL");
  const [unitId, setUnitId] = useState("");
  const [itemGroupId, setItemGroupId] = useState("");
  const [groupType, setGroupType] = useState<GroupType | "">("");
  const [units, setUnits] = useState<Pick<Unit, "id" | "unitName">[]>([]);
  const [itemGroups, setItemGroups] = useState<
    Pick<ItemGroup, "id" | "groupCode" | "groupName">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    async function loadFilterOptions() {
      const [unitsResult, itemGroupsResult] = await Promise.all([
        loadAllPaginatedOptions(fetchUnits, "ALL"),
        loadAllPaginatedOptions(fetchItemGroups, "ALL"),
      ]);

      if (unitsResult.ok) {
        setUnits(
          unitsResult.data.map((unit) => ({
            id: unit.id,
            unitName: unit.unitName,
          })),
        );
      }

      if (itemGroupsResult.ok) {
        setItemGroups(
          itemGroupsResult.data.map((group) => ({
            id: group.id,
            groupCode: group.groupCode,
            groupName: group.groupName,
          })),
        );
      }
    }

    void loadFilterOptions();
  }, []);

  const loadItems = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchItems({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      unitId: unitId || undefined,
      itemGroupId: itemGroupId || undefined,
      groupType: groupType || undefined,
    });

    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    if (!result.ok) {
      setItems([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setItems(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status, unitId, itemGroupId, groupType]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setPage(1);
      setSearch(nextSearch);
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchInput]);

  function openCreateDialog() {
    setDialogMode("create");
    setEditingItem(null);
    setDialogOpen(true);
  }

  function openEditDialog(item: Item) {
    setDialogMode("edit");
    setEditingItem(item);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateItemInput) {
    setSaving(true);
    const result = await createItem(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Item created successfully.",
    });
    await loadItems();
  }

  async function handleEdit(input: UpdateItemInput) {
    if (!editingItem) {
      return;
    }

    setSaving(true);
    const result = await updateItem(editingItem.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Item updated successfully.",
    });
    await loadItems();
  }

  async function handleToggleStatus(item: Item) {
    if (item.isActive) {
      const confirmed = window.confirm(
        `Deactivate item "${item.itemName}"? The item will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(item.id);
    const result = await updateItemStatus(item.id, {
      isActive: !item.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Item activated successfully."
        : "Item deactivated successfully.",
    });
    await loadItems();
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            Item Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Maintain the item master for stationery and printing supplies.
          </p>
        </div>
        {canMutateMasterData ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportDialogOpen(true)}
              className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft font-medium text-ink hover:bg-paper"
            >
              Import Items
            </button>
            <button
              type="button"
              onClick={openCreateDialog}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              Add New
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 xl:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by code, name, unit, or group"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as ItemStatusFilter);
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Unit</span>
          <SearchableSelect
            value={unitId}
            onChange={(nextValue) => {
              setPage(1);
              setUnitId(nextValue);
            }}
            placeholder="All units"
            searchPlaceholder="Search units…"
            options={units.map((unit) => ({
              value: unit.id,
              label: unit.unitName,
            }))}
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Item Group</span>
          <SearchableSelect
            value={itemGroupId}
            onChange={(nextValue) => {
              setPage(1);
              setItemGroupId(nextValue);
            }}
            placeholder="All item groups"
            searchPlaceholder="Search item groups…"
            options={itemGroups.map((group) => ({
              value: group.id,
              label: `${group.groupCode} — ${group.groupName}`,
            }))}
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Group Type</span>
          <select
            value={groupType}
            onChange={(event) => {
              setPage(1);
              setGroupType(event.target.value as GroupType | "");
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="">All group types</option>
            <option value="INVENTORY">{groupTypeLabel("INVENTORY")}</option>
            <option value="FIXED_ASSET">
              {groupTypeLabel("FIXED_ASSET")}
            </option>
            <option value="SERVICES">{groupTypeLabel("SERVICES")}</option>
            <option value="MAINTENANCE">
              {groupTypeLabel("MAINTENANCE")}
            </option>
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
          <p className="text-sm text-ink-muted">Loading items…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load items</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No items found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search ||
              status !== "ALL" ||
              unitId ||
              itemGroupId ||
              groupType
                ? "Try adjusting search or filters."
                : "Add an item to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Item Code
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Item Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Unit
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Item Group
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Group Type
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Return Type
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Purchase Rate
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Requestable
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Issuable
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Serial Tracking
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
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {item.itemCode}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3 font-medium">
                        {item.itemName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {item.unit.unitName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {item.itemGroup.groupCode} — {item.itemGroup.groupName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {groupTypeLabel(item.itemGroup.groupType)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {returnTypeLabel(item.returnType)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                        {item.purchaseRate}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {yesNo(item.isRequestable)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {yesNo(item.isIssuable)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {yesNo(item.trackSerialNumber)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${item.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {canMutateMasterData ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(item)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(item)}
                            disabled={statusUpdatingId === item.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === item.id
                              ? "Updating…"
                              : item.isActive
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
                {totalItems === 1 ? "item" : "items"}
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

      <ItemFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialItem={editingItem}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
        onSubmitCreate={handleCreate}
        onSubmitEdit={handleEdit}
      />

      <ItemImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={(importedCount, skippedExistingCount) => {
          setImportDialogOpen(false);
          setFeedback({
            type: "success",
            message:
              skippedExistingCount > 0
                ? `Imported ${importedCount} item${importedCount === 1 ? "" : "s"}; skipped ${skippedExistingCount} existing.`
                : `Imported ${importedCount} item${importedCount === 1 ? "" : "s"}.`,
          });
          void loadItems();
        }}
      />
    </section>
  );
}
