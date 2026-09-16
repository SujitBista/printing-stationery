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
  APP_ROLES,
  createApplicationUserInputSchema,
  isStoreManagingRole,
  NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
  resolveStoreAssignment,
  STORE_SELECTION_REQUIRED_MESSAGE,
  updateApplicationUserInputSchema,
  type ApplicationUser,
  type CreateApplicationUserInput,
  type Employee,
  type UpdateApplicationUserInput,
} from "@printing-stationery/shared";
import { fetchEligibleEmployees } from "@/lib/api/application-users";
import { fetchStores } from "@/lib/api/stores";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ApplicationUserFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: ApplicationUser | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateApplicationUserInput) => Promise<void>;
  onSubmitEdit: (input: UpdateApplicationUserInput) => Promise<void>;
};

type FormState = {
  employeeId: string;
  username: string;
  role: string;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  storeId: string;
};

type FieldErrors = Partial<
  Record<
    | "employeeId"
    | "username"
    | "role"
    | "temporaryPassword"
    | "confirmTemporaryPassword"
    | "storeId",
    string
  >
>;

const EMPTY_FORM: FormState = {
  employeeId: "",
  username: "",
  role: "",
  temporaryPassword: "",
  confirmTemporaryPassword: "",
  storeId: "",
};

export function ApplicationUserFormDialog({
  open,
  mode,
  initialUser,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: ApplicationUserFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [branchStores, setBranchStores] = useState<
    Array<{
      id: string;
      storeCode: string;
      storeName: string;
      isActive: boolean;
    }>
  >([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);

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

    if (mode === "edit" && initialUser) {
      setForm({
        employeeId: initialUser.employeeId,
        username: initialUser.username,
        role: initialUser.role,
        temporaryPassword: "",
        confirmTemporaryPassword: "",
        storeId: initialUser.assignedStore?.id ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialUser]);

  useEffect(() => {
    if (!open || mode !== "create") {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const result = await loadAllPaginatedOptions(
        (query) =>
          fetchEligibleEmployees({
            page: query.page,
            pageSize: query.pageSize,
          }),
        "ALL",
      );

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setEmployees([]);
        setOptionsError(result.error);
        setOptionsLoading(false);
        return;
      }

      setEmployees(result.data);
      setOptionsLoading(false);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  const selectedEmployee =
    mode === "edit" && initialUser
      ? initialUser.employee
      : employees.find((employee) => employee.id === form.employeeId);

  const managesStores = isStoreManagingRole(form.role);
  const storeResolution = managesStores
    ? resolveStoreAssignment({
        activeStores: branchStores,
        selectedStoreId: form.storeId,
      })
    : null;

  useEffect(() => {
    if (!open || !managesStores || !selectedEmployee) {
      setBranchStores([]);
      setStoresError(null);
      setStoresLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStores() {
      setStoresLoading(true);
      setStoresError(null);

      const result = await loadAllPaginatedOptions(
        (query) =>
          fetchStores({
            page: query.page,
            pageSize: query.pageSize,
            status: "ACTIVE",
            branchId: selectedEmployee!.branchId,
            hierarchy: "ALL",
          }),
        "ACTIVE",
      );

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setBranchStores([]);
        setStoresError(result.error);
        setStoresLoading(false);
        return;
      }

      setBranchStores(
        result.data
          .filter(
            (store) =>
              store.isActive && store.branchId === selectedEmployee!.branchId,
          )
          .map((store) => ({
            id: store.id,
            storeCode: store.storeCode,
            storeName: store.storeName,
            isActive: store.isActive,
          })),
      );
      setStoresLoading(false);
    }

    void loadStores();

    return () => {
      cancelled = true;
    };
  }, [open, managesStores, selectedEmployee]);

  useEffect(() => {
    if (!managesStores) {
      if (form.storeId) {
        updateField("storeId", "");
      }
      return;
    }

    if (branchStores.length === 1 && form.storeId !== branchStores[0]!.id) {
      updateField("storeId", branchStores[0]!.id);
    }
  }, [managesStores, branchStores, form.storeId]);

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

    if (managesStores) {
      if (storesError) {
        setFormError(storesError);
        return;
      }
      if (!storesLoading && storeResolution?.status === "NONE") {
        setFieldErrors({ storeId: NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE });
        setFormError(NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE);
        return;
      }
      if (
        !storesLoading &&
        storeResolution?.status === "SELECTION_REQUIRED"
      ) {
        setFieldErrors({ storeId: STORE_SELECTION_REQUIRED_MESSAGE });
        setFormError(STORE_SELECTION_REQUIRED_MESSAGE);
        return;
      }
    }

    const assignedStoreId = managesStores
      ? form.storeId || null
      : null;

    if (mode === "create") {
      const parsed = createApplicationUserInputSchema.safeParse({
        employeeId: form.employeeId,
        username: form.username,
        role: form.role,
        temporaryPassword: form.temporaryPassword,
        confirmTemporaryPassword: form.confirmTemporaryPassword,
        storeId: assignedStoreId,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "employeeId" ||
            key === "username" ||
            key === "role" ||
            key === "temporaryPassword" ||
            key === "confirmTemporaryPassword" ||
            key === "storeId"
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
          error instanceof Error
            ? error.message
            : "Failed to create application user",
        );
      }
      return;
    }

    const parsed = updateApplicationUserInputSchema.safeParse({
      username: form.username,
      role: form.role,
      storeId: assignedStoreId,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "username" || key === "role" || key === "storeId") {
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
        error instanceof Error
          ? error.message
          : "Failed to update application user",
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
            {mode === "create"
              ? "Add Application User"
              : "Edit Application User"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Create a login account for an existing employee. The employee’s branch comes from Employee Setup."
              : "Update username and role. Use Reset Password or Activate/Deactivate in the table for other changes."}
          </p>
        </div>

        {optionsError ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {optionsError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {mode === "create" ? (
            <Field
              label="Employee"
              required
              error={fieldErrors.employeeId}
              htmlFor="application-user-employee"
            >
              <SearchableSelect
                id="application-user-employee"
                name="employeeId"
                value={form.employeeId}
                onChange={(nextValue) => updateField("employeeId", nextValue)}
                disabled={saving || optionsLoading}
                required
                placeholder="Select an employee"
                searchPlaceholder="Search employees…"
                options={employees.map((employee) => ({
                  value: employee.id,
                  label: `${employee.employeeCode} — ${employee.employeeName}`,
                }))}
              />
            </Field>
          ) : null}

          {selectedEmployee ? (
            <div className="grid gap-3 rounded-md border border-border bg-paper p-3 sm:grid-cols-3">
              <ReadOnlyField
                label="Employee Code"
                value={selectedEmployee.employeeCode}
              />
              <ReadOnlyField
                label="Employee Name"
                value={selectedEmployee.employeeName}
              />
              <ReadOnlyField
                label="Branch"
                value={`${selectedEmployee.branch.branchCode} — ${selectedEmployee.branch.branchName}`}
              />
            </div>
          ) : null}

          <Field
            label="Username"
            required
            error={fieldErrors.username}
            htmlFor="application-user-username"
          >
            <input
              id="application-user-username"
              name="username"
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              disabled={saving}
              autoComplete="off"
              className={inputClassName(fieldErrors.username)}
              aria-invalid={Boolean(fieldErrors.username)}
            />
          </Field>

          <Field
            label="Role"
            required
            error={fieldErrors.role}
            htmlFor="application-user-role"
          >
            <select
              id="application-user-role"
              name="role"
              value={form.role}
              onChange={(event) => updateField("role", event.target.value)}
              disabled={saving}
              className={inputClassName(fieldErrors.role)}
              aria-invalid={Boolean(fieldErrors.role)}
            >
              <option value="">Select a role</option>
              {APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>

          {managesStores && selectedEmployee ? (
            <Field
              label="Assigned Store"
              required={storeResolution?.status === "SELECTION_REQUIRED"}
              error={
                fieldErrors.storeId ??
                (storesError ??
                  (!storesLoading && storeResolution?.status === "NONE"
                    ? NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE
                    : undefined))
              }
              htmlFor="application-user-store"
            >
              {storesLoading ? (
                <p className="text-sm text-ink-muted">Loading stores…</p>
              ) : storeResolution?.status === "SINGLE" ? (
                <p className="rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink">
                  {branchStores[0]
                    ? `${branchStores[0].storeCode} — ${branchStores[0].storeName}`
                    : "—"}
                </p>
              ) : storeResolution?.status === "NONE" ? (
                <p className="text-sm text-ink-muted">
                  {NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE}
                </p>
              ) : (
                <SearchableSelect
                  id="application-user-store"
                  name="storeId"
                  value={form.storeId}
                  onChange={(nextValue) => updateField("storeId", nextValue)}
                  disabled={saving || storesLoading}
                  required
                  placeholder="Select a store"
                  searchPlaceholder="Search stores…"
                  emptyMessage="No active store in this branch"
                  options={branchStores.map((store) => ({
                    value: store.id,
                    label: `${store.storeCode} — ${store.storeName}`,
                  }))}
                />
              )}
            </Field>
          ) : null}

          {mode === "create" ? (
            <>
              <Field
                label="Temporary Password"
                required
                error={fieldErrors.temporaryPassword}
                htmlFor="application-user-password"
              >
                <input
                  id="application-user-password"
                  name="temporaryPassword"
                  type="password"
                  value={form.temporaryPassword}
                  onChange={(event) =>
                    updateField("temporaryPassword", event.target.value)
                  }
                  disabled={saving}
                  autoComplete="new-password"
                  className={inputClassName(fieldErrors.temporaryPassword)}
                  aria-invalid={Boolean(fieldErrors.temporaryPassword)}
                />
              </Field>

              <Field
                label="Confirm Temporary Password"
                required
                error={fieldErrors.confirmTemporaryPassword}
                htmlFor="application-user-confirm-password"
              >
                <input
                  id="application-user-confirm-password"
                  name="confirmTemporaryPassword"
                  type="password"
                  value={form.confirmTemporaryPassword}
                  onChange={(event) =>
                    updateField("confirmTemporaryPassword", event.target.value)
                  }
                  disabled={saving}
                  autoComplete="new-password"
                  className={inputClassName(
                    fieldErrors.confirmTemporaryPassword,
                  )}
                  aria-invalid={Boolean(fieldErrors.confirmTemporaryPassword)}
                />
              </Field>
            </>
          ) : null}
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
            disabled={
              saving ||
              (mode === "create" &&
                (optionsLoading || Boolean(optionsError))) ||
              (managesStores &&
                (storesLoading ||
                  Boolean(storesError) ||
                  storeResolution?.status === "NONE" ||
                  storeResolution?.status === "SELECTION_REQUIRED"))
            }
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create User"
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className="truncate text-sm text-ink">{value}</span>
    </div>
  );
}

function inputClassName(error?: string): string {
  return `w-full rounded-md border bg-paper-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60 ${
    error ? "border-danger" : "border-border"
  }`;
}
