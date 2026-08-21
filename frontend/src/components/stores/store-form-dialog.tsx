"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createStoreInputSchema,
  updateStoreInputSchema,
  type Branch,
  type CreateStoreInput,
  type Store,
  type UpdateStoreInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { fetchStores } from "@/lib/api/stores";
import { SearchableSelect } from "@/components/ui/searchable-select";

type StoreFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialStore?: Store | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateStoreInput) => Promise<void>;
  onSubmitEdit: (input: UpdateStoreInput) => Promise<void>;
};

type FormState = {
  storeCode: string;
  storeName: string;
  branchId: string;
  underStoreId: string;
  allowTransfer: boolean;
  allowDepartmentIssue: boolean;
  remarks: string;
};

type FieldErrors = Partial<
  Record<
    | "storeCode"
    | "storeName"
    | "branchId"
    | "underStoreId"
    | "allowTransfer"
    | "allowDepartmentIssue"
    | "remarks",
    string
  >
>;

const EMPTY_FORM: FormState = {
  storeCode: "",
  storeName: "",
  branchId: "",
  underStoreId: "",
  allowTransfer: false,
  allowDepartmentIssue: false,
  remarks: "",
};

type BranchOption = Pick<
  Branch,
  "id" | "branchCode" | "branchName" | "isActive"
>;

type UnderStoreOption = {
  id: string;
  storeCode: string;
  storeName: string;
  branchId: string;
  branchName: string;
  isActive: boolean;
  underStoreId: string | null;
};

function wouldCreateCycle(
  candidateId: string,
  currentStoreId: string,
  underStoreById: Map<string, string | null>,
): boolean {
  const visited = new Set<string>();
  let currentId: string | null = candidateId;

  while (currentId) {
    if (currentId === currentStoreId) {
      return true;
    }
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    currentId = underStoreById.get(currentId) ?? null;
  }

  return false;
}

export function formatUnderStoreOptionLabel(option: {
  storeCode: string;
  storeName: string;
  branchName: string;
  isActive: boolean;
}): string {
  const base = `${option.storeCode} — ${option.storeName} — ${option.branchName}`;
  return option.isActive ? base : `${base} (Inactive)`;
}

export function StoreFormDialog({
  open,
  mode,
  initialStore,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: StoreFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [underStoreOptions, setUnderStoreOptions] = useState<
    UnderStoreOption[]
  >([]);
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

    if (mode === "edit" && initialStore) {
      setForm({
        storeCode: initialStore.storeCode,
        storeName: initialStore.storeName,
        branchId: initialStore.branchId,
        underStoreId: initialStore.underStoreId ?? "",
        allowTransfer: initialStore.allowTransfer,
        allowDepartmentIssue: initialStore.allowDepartmentIssue,
        remarks: initialStore.remarks ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialStore]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const [branchesResult, activeStoresResult, allStoresResult] =
        await Promise.all([
          loadAllPaginatedOptions(fetchBranches, "ACTIVE"),
          loadAllPaginatedOptions(fetchStores, "ACTIVE"),
          loadAllPaginatedOptions(fetchStores, "ALL"),
        ]);

      if (cancelled) {
        return;
      }

      if (!branchesResult.ok || !activeStoresResult.ok || !allStoresResult.ok) {
        setBranches([]);
        setUnderStoreOptions([]);
        setOptionsError(
          !branchesResult.ok
            ? branchesResult.error
            : !activeStoresResult.ok
              ? activeStoresResult.error
              : allStoresResult.ok
                ? null
                : allStoresResult.error,
        );
        setOptionsLoading(false);
        return;
      }

      let nextBranches: BranchOption[] = branchesResult.data.map((branch) => ({
        id: branch.id,
        branchCode: branch.branchCode,
        branchName: branch.branchName,
        isActive: branch.isActive,
      }));

      if (mode === "edit" && initialStore) {
        if (!nextBranches.some((branch) => branch.id === initialStore.branchId)) {
          nextBranches = [
            {
              id: initialStore.branch.id,
              branchCode: initialStore.branch.branchCode,
              branchName: initialStore.branch.branchName,
              isActive: false,
            },
            ...nextBranches,
          ];
        }
      }

      const underStoreById = new Map(
        allStoresResult.data.map((store) => [store.id, store.underStoreId]),
      );

      const currentStoreId =
        mode === "edit" && initialStore ? initialStore.id : null;

      let nextUnderStores: UnderStoreOption[] = activeStoresResult.data
        .filter((store) => {
          if (currentStoreId && store.id === currentStoreId) {
            return false;
          }
          if (
            currentStoreId &&
            wouldCreateCycle(store.id, currentStoreId, underStoreById)
          ) {
            return false;
          }
          return true;
        })
        .map((store) => ({
          id: store.id,
          storeCode: store.storeCode,
          storeName: store.storeName,
          branchId: store.branchId,
          branchName: store.branch.branchName,
          isActive: store.isActive,
          underStoreId: store.underStoreId,
        }));

      if (
        mode === "edit" &&
        initialStore?.underStore &&
        !nextUnderStores.some(
          (store) => store.id === initialStore.underStore!.id,
        )
      ) {
        const underStoreRecord = allStoresResult.data.find(
          (store) => store.id === initialStore.underStore!.id,
        );
        nextUnderStores = [
          {
            id: initialStore.underStore.id,
            storeCode: initialStore.underStore.storeCode,
            storeName: initialStore.underStore.storeName,
            branchId: initialStore.underStore.branchId,
            branchName: underStoreRecord?.branch.branchName ?? "Unknown branch",
            isActive: false,
            underStoreId: underStoreRecord?.underStoreId ?? null,
          },
          ...nextUnderStores,
        ];
      }

      setBranches(nextBranches);
      setUnderStoreOptions(nextUnderStores);
      setOptionsLoading(false);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [open, mode, initialStore]);

  const underStoreLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of underStoreOptions) {
      map.set(option.id, formatUnderStoreOptionLabel(option));
    }
    return map;
  }, [underStoreOptions]);

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

    const underStoreId = form.underStoreId === "" ? null : form.underStoreId;

    if (mode === "create") {
      const parsed = createStoreInputSchema.safeParse({
        storeCode: form.storeCode,
        storeName: form.storeName,
        branchId: form.branchId,
        underStoreId,
        allowTransfer: form.allowTransfer,
        allowDepartmentIssue: form.allowDepartmentIssue,
        remarks: form.remarks,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "storeCode" ||
            key === "storeName" ||
            key === "branchId" ||
            key === "underStoreId" ||
            key === "allowTransfer" ||
            key === "allowDepartmentIssue" ||
            key === "remarks"
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
          error instanceof Error ? error.message : "Failed to create store",
        );
      }
      return;
    }

    const parsed = updateStoreInputSchema.safeParse({
      storeCode: form.storeCode,
      storeName: form.storeName,
      branchId: form.branchId,
      underStoreId,
      allowTransfer: form.allowTransfer,
      allowDepartmentIssue: form.allowDepartmentIssue,
      remarks: form.remarks,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "storeCode" ||
          key === "storeName" ||
          key === "branchId" ||
          key === "underStoreId" ||
          key === "allowTransfer" ||
          key === "allowDepartmentIssue" ||
          key === "remarks"
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
        error instanceof Error ? error.message : "Failed to update store",
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
            {mode === "create" ? "Add Store" : "Edit Store"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Define an inventory store location. Creating a store does not create stock."
              : "Update store details. Use Activate/Deactivate in the table to change status."}
          </p>
        </div>

        {optionsError ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
            {optionsError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Field
            label="Store Code"
            required
            error={fieldErrors.storeCode}
            htmlFor="store-code"
          >
            <input
              id="store-code"
              name="storeCode"
              value={form.storeCode}
              onChange={(event) => updateField("storeCode", event.target.value)}
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.storeCode)}
              aria-invalid={Boolean(fieldErrors.storeCode)}
            />
          </Field>

          <Field
            label="Store Name"
            required
            error={fieldErrors.storeName}
            htmlFor="store-name"
          >
            <input
              id="store-name"
              name="storeName"
              value={form.storeName}
              onChange={(event) => updateField("storeName", event.target.value)}
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.storeName)}
              aria-invalid={Boolean(fieldErrors.storeName)}
            />
          </Field>

          <Field
            label="Branch"
            required
            error={fieldErrors.branchId}
            htmlFor="store-branch"
          >
            <SearchableSelect
              id="store-branch"
              name="branchId"
              value={form.branchId}
              onChange={(nextValue) => updateField("branchId", nextValue)}
              disabled={saving || optionsLoading}
              required
              placeholder="Select a branch"
              searchPlaceholder="Search branches…"
              options={branches.map((branch) => ({
                value: branch.id,
                label: `${branch.branchCode} — ${branch.branchName}${branch.isActive ? "" : " (Inactive)"}`,
              }))}
            />
          </Field>

          <Field
            label="Under Store"
            error={fieldErrors.underStoreId}
            htmlFor="under-store"
            hint="Optional. Select an existing store under which this store operates."
          >
            <SearchableSelect
              id="under-store"
              name="underStoreId"
              value={form.underStoreId}
              onChange={(nextValue) => updateField("underStoreId", nextValue)}
              disabled={saving || optionsLoading}
              placeholder="No Under Store"
              searchPlaceholder="Search stores…"
              options={underStoreOptions.map((store) => ({
                value: store.id,
                label:
                  underStoreLabelById.get(store.id) ??
                  formatUnderStoreOptionLabel(store),
              }))}
            />
          </Field>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allowTransfer}
                onChange={(event) =>
                  updateField("allowTransfer", event.target.checked)
                }
                disabled={saving || optionsLoading}
                className="size-4 accent-accent"
              />
              Allow Store Transfer
            </span>
            <span className="pl-6 text-xs text-ink-muted">
              Allows this Store to participate in future inventory transfers
              between Stores.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allowDepartmentIssue}
                onChange={(event) =>
                  updateField("allowDepartmentIssue", event.target.checked)
                }
                disabled={saving || optionsLoading}
                className="size-4 accent-accent"
              />
              Allow Item Issue to Department
            </span>
            <span className="pl-6 text-xs text-ink-muted">
              Allows this Store to issue Items directly to Departments in future
              issue workflows.
            </span>
          </label>

          <Field
            label="Remarks"
            error={fieldErrors.remarks}
            htmlFor="store-remarks"
          >
            <textarea
              id="store-remarks"
              name="remarks"
              value={form.remarks}
              onChange={(event) => updateField("remarks", event.target.value)}
              disabled={saving || optionsLoading}
              rows={3}
              className={inputClassName(fieldErrors.remarks)}
              aria-invalid={Boolean(fieldErrors.remarks)}
            />
          </Field>
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
                ? "Create Store"
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
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  hint?: string;
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
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
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
