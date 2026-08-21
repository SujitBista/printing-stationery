"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createItemInputSchema,
  updateItemInputSchema,
  type CreateItemInput,
  type GroupType,
  type Item,
  type ItemGroup,
  type ReturnType,
  type Unit,
  type UpdateItemInput,
} from "@printing-stationery/shared";
import { fetchItemGroups } from "@/lib/api/item-groups";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { fetchUnits } from "@/lib/api/units";
import { groupTypeLabel } from "@/components/item-groups/item-group-form-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ItemFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialItem?: Item | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateItemInput) => Promise<void>;
  onSubmitEdit: (input: UpdateItemInput) => Promise<void>;
};

type FormState = {
  itemCode: string;
  itemName: string;
  unitId: string;
  itemGroupId: string;
  returnType: ReturnType;
  purchaseRate: string;
  remarks: string;
  isRequestable: boolean;
  isIssuable: boolean;
  trackSerialNumber: boolean;
};

type FieldErrors = Partial<
  Record<
    | "itemCode"
    | "itemName"
    | "unitId"
    | "itemGroupId"
    | "returnType"
    | "purchaseRate"
    | "remarks"
    | "isRequestable"
    | "isIssuable"
    | "trackSerialNumber",
    string
  >
>;

const EMPTY_FORM: FormState = {
  itemCode: "",
  itemName: "",
  unitId: "",
  itemGroupId: "",
  returnType: "NON_RETURNABLE",
  purchaseRate: "0",
  remarks: "",
  isRequestable: true,
  isIssuable: true,
  trackSerialNumber: false,
};

export function returnTypeLabel(type: ReturnType): string {
  switch (type) {
    case "RETURNABLE":
      return "Returnable";
    case "NON_RETURNABLE":
      return "Non-returnable";
  }
}

type UnitOption = Pick<Unit, "id" | "unitName" | "isActive">;
type ItemGroupOption = Pick<
  ItemGroup,
  "id" | "groupCode" | "groupName" | "groupType" | "isActive"
>;

export function ItemFormDialog({
  open,
  mode,
  initialItem,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: ItemFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroupOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && initialItem) {
      setForm({
        itemCode: initialItem.itemCode,
        itemName: initialItem.itemName,
        unitId: initialItem.unitId,
        itemGroupId: initialItem.itemGroupId,
        returnType: initialItem.returnType,
        purchaseRate: initialItem.purchaseRate,
        remarks: initialItem.remarks ?? "",
        isRequestable: initialItem.isRequestable,
        isIssuable: initialItem.isIssuable,
        trackSerialNumber: initialItem.trackSerialNumber,
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialItem]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const [unitsResult, itemGroupsResult] = await Promise.all([
        loadAllPaginatedOptions(fetchUnits, "ACTIVE"),
        loadAllPaginatedOptions(fetchItemGroups, "ACTIVE"),
      ]);

      if (cancelled) {
        return;
      }

      if (!unitsResult.ok || !itemGroupsResult.ok) {
        setUnits([]);
        setItemGroups([]);
        setOptionsError(
          unitsResult.ok
            ? itemGroupsResult.ok
              ? null
              : itemGroupsResult.error
            : unitsResult.error,
        );
        setOptionsLoading(false);
        return;
      }

      let nextUnits: UnitOption[] = unitsResult.data.map((unit) => ({
        id: unit.id,
        unitName: unit.unitName,
        isActive: unit.isActive,
      }));
      let nextGroups: ItemGroupOption[] = itemGroupsResult.data.map(
        (group) => ({
          id: group.id,
          groupCode: group.groupCode,
          groupName: group.groupName,
          groupType: group.groupType,
          isActive: group.isActive,
        }),
      );

      if (mode === "edit" && initialItem) {
        if (!nextUnits.some((unit) => unit.id === initialItem.unitId)) {
          nextUnits = [
            {
              id: initialItem.unit.id,
              unitName: initialItem.unit.unitName,
              isActive: false,
            },
            ...nextUnits,
          ];
        }

        if (!nextGroups.some((group) => group.id === initialItem.itemGroupId)) {
          nextGroups = [
            {
              id: initialItem.itemGroup.id,
              groupCode: initialItem.itemGroup.groupCode,
              groupName: initialItem.itemGroup.groupName,
              groupType: initialItem.itemGroup.groupType,
              isActive: false,
            },
            ...nextGroups,
          ];
        }
      }

      setUnits(nextUnits);
      setItemGroups(nextGroups);
      setOptionsLoading(false);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [open, mode, initialItem]);

  const selectedItemGroup =
    itemGroups.find((group) => group.id === form.itemGroupId) ?? null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) {
        return current;
      }
      const next = { ...current };
      delete next[key as keyof FieldErrors];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setFormError(null);
    setFieldErrors({});

    if (mode === "create") {
      const parsed = createItemInputSchema.safeParse({
        itemCode: form.itemCode,
        itemName: form.itemName,
        unitId: form.unitId,
        itemGroupId: form.itemGroupId,
        returnType: form.returnType,
        purchaseRate: form.purchaseRate,
        remarks: form.remarks,
        isRequestable: form.isRequestable,
        isIssuable: form.isIssuable,
        trackSerialNumber: form.trackSerialNumber,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "itemCode" ||
            key === "itemName" ||
            key === "unitId" ||
            key === "itemGroupId" ||
            key === "returnType" ||
            key === "purchaseRate" ||
            key === "remarks" ||
            key === "isRequestable" ||
            key === "isIssuable" ||
            key === "trackSerialNumber"
          ) {
            nextErrors[key] ??= issue.message;
          }
        }
        setFieldErrors(nextErrors);
        setFormError("Please correct the highlighted fields.");
        return;
      }

      try {
        await onSubmitCreate(parsed.data);
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Failed to create item",
        );
      }
      return;
    }

    const parsed = updateItemInputSchema.safeParse({
      itemCode: form.itemCode,
      itemName: form.itemName,
      unitId: form.unitId,
      itemGroupId: form.itemGroupId,
      returnType: form.returnType,
      purchaseRate: form.purchaseRate,
      remarks: form.remarks,
      isRequestable: form.isRequestable,
      isIssuable: form.isIssuable,
      trackSerialNumber: form.trackSerialNumber,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "itemCode" ||
          key === "itemName" ||
          key === "unitId" ||
          key === "itemGroupId" ||
          key === "returnType" ||
          key === "purchaseRate" ||
          key === "remarks" ||
          key === "isRequestable" ||
          key === "isIssuable" ||
          key === "trackSerialNumber"
        ) {
          nextErrors[key] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(
        parsed.error.issues[0]?.message ??
          "Please correct the highlighted fields.",
      );
      return;
    }

    try {
      await onSubmitEdit(parsed.data);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update item",
      );
    }
  }

  function requestClose() {
    if (saving) {
      return;
    }
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 hidden h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink open:flex backdrop:bg-ink/40 sm:p-6"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (saving) {
          event.preventDefault();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="my-auto flex w-full max-w-[40rem] flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg"
        noValidate
      >
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
          >
            {mode === "create" ? "Add Item" : "Edit Item"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Define an item master record. Creating an item does not create stock."
              : "Update item details. Use Activate/Deactivate in the table to change status."}
          </p>
        </div>

        {optionsError ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
            {optionsError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Field
            label="Item Code"
            required
            error={fieldErrors.itemCode}
            htmlFor="item-code"
          >
            <input
              id="item-code"
              name="itemCode"
              value={form.itemCode}
              onChange={(event) => updateField("itemCode", event.target.value)}
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.itemCode)}
              aria-invalid={Boolean(fieldErrors.itemCode)}
            />
          </Field>

          <Field
            label="Item Name"
            required
            error={fieldErrors.itemName}
            htmlFor="item-name"
          >
            <input
              id="item-name"
              name="itemName"
              value={form.itemName}
              onChange={(event) => updateField("itemName", event.target.value)}
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.itemName)}
              aria-invalid={Boolean(fieldErrors.itemName)}
            />
          </Field>

          <Field
            label="Unit"
            required
            error={fieldErrors.unitId}
            htmlFor="item-unit"
          >
            <SearchableSelect
              id="item-unit"
              name="unitId"
              value={form.unitId}
              onChange={(nextValue) => updateField("unitId", nextValue)}
              disabled={saving || optionsLoading}
              required
              placeholder="Select a unit"
              searchPlaceholder="Search units…"
              options={units.map((unit) => ({
                value: unit.id,
                label: `${unit.unitName}${unit.isActive ? "" : " (Inactive)"}`,
              }))}
            />
          </Field>

          <Field
            label="Item Group"
            required
            error={fieldErrors.itemGroupId}
            htmlFor="item-group"
          >
            <SearchableSelect
              id="item-group"
              name="itemGroupId"
              value={form.itemGroupId}
              onChange={(nextValue) => updateField("itemGroupId", nextValue)}
              disabled={saving || optionsLoading}
              required
              placeholder="Select an item group"
              searchPlaceholder="Search item groups…"
              options={itemGroups.map((group) => ({
                value: group.id,
                label: `${group.groupCode} — ${group.groupName} (${groupTypeLabel(group.groupType as GroupType)})${group.isActive ? "" : " (Inactive)"}`,
              }))}
            />
          </Field>

          <div className="rounded-md border border-border bg-paper px-3 py-2 text-sm">
            <span className="font-medium text-ink">Group Type</span>
            <p className="mt-1 text-ink-muted">
              {selectedItemGroup
                ? groupTypeLabel(selectedItemGroup.groupType)
                : "Select an Item Group to view its Group Type."}
            </p>
          </div>

          <Field
            label="Return Type"
            required
            error={fieldErrors.returnType}
            htmlFor="return-type"
          >
            <select
              id="return-type"
              name="returnType"
              value={form.returnType}
              onChange={(event) =>
                updateField("returnType", event.target.value as ReturnType)
              }
              disabled={saving || optionsLoading}
              className={inputClassName(fieldErrors.returnType)}
              aria-invalid={Boolean(fieldErrors.returnType)}
            >
              <option value="NON_RETURNABLE">
                {returnTypeLabel("NON_RETURNABLE")}
              </option>
              <option value="RETURNABLE">
                {returnTypeLabel("RETURNABLE")}
              </option>
            </select>
          </Field>

          <Field
            label="Purchase Rate"
            required
            error={fieldErrors.purchaseRate}
            htmlFor="purchase-rate"
          >
            <input
              id="purchase-rate"
              name="purchaseRate"
              inputMode="decimal"
              value={form.purchaseRate}
              onChange={(event) =>
                updateField("purchaseRate", event.target.value)
              }
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.purchaseRate)}
              aria-invalid={Boolean(fieldErrors.purchaseRate)}
            />
          </Field>

          <Field
            label="Remarks"
            error={fieldErrors.remarks}
            htmlFor="item-remarks"
          >
            <textarea
              id="item-remarks"
              name="remarks"
              value={form.remarks}
              onChange={(event) => updateField("remarks", event.target.value)}
              disabled={saving || optionsLoading}
              rows={3}
              className={inputClassName(fieldErrors.remarks)}
              aria-invalid={Boolean(fieldErrors.remarks)}
            />
          </Field>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isRequestable}
                onChange={(event) =>
                  updateField("isRequestable", event.target.checked)
                }
                disabled={saving || optionsLoading}
                className="size-4 accent-accent"
              />
              Active for Request
            </span>
            <span className="pl-6 text-xs text-ink-muted">
              Allows this item to be selected in new item requests.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isIssuable}
                onChange={(event) =>
                  updateField("isIssuable", event.target.checked)
                }
                disabled={saving || optionsLoading}
                className="size-4 accent-accent"
              />
              Active for Issue
            </span>
            <span className="pl-6 text-xs text-ink-muted">
              Allows this item to be selected in new item issues.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.trackSerialNumber}
                onChange={(event) =>
                  updateField("trackSerialNumber", event.target.checked)
                }
                disabled={saving || optionsLoading}
                className="size-4 accent-accent"
              />
              Track Serial Number
            </span>
            <span className="pl-6 text-xs text-ink-muted">
              Individual serial-number tracking will be supported in later stock
              transactions.
            </span>
          </label>
        </div>

        {formError ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || optionsLoading || Boolean(optionsError)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create Item"
                : "Save Changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function inputClassName(error?: string): string {
  return `w-full rounded-md border bg-paper-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60 ${
    error ? "border-danger" : "border-border"
  }`;
}
