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
  createEmployeeInputSchema,
  updateEmployeeInputSchema,
  type Branch,
  type CreateEmployeeInput,
  type Employee,
  type UpdateEmployeeInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";

type EmployeeFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialEmployee?: Employee | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateEmployeeInput) => Promise<void>;
  onSubmitEdit: (input: UpdateEmployeeInput) => Promise<void>;
};

type FormState = {
  employeeCode: string;
  employeeName: string;
  branchId: string;
};

type FieldErrors = Partial<
  Record<"employeeCode" | "employeeName" | "branchId", string>
>;

const EMPTY_FORM: FormState = {
  employeeCode: "",
  employeeName: "",
  branchId: "",
};

type BranchOption = Pick<
  Branch,
  "id" | "branchCode" | "branchName" | "isActive"
>;

export function EmployeeFormDialog({
  open,
  mode,
  initialEmployee,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: EmployeeFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
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

    if (mode === "edit" && initialEmployee) {
      setForm({
        employeeCode: initialEmployee.employeeCode,
        employeeName: initialEmployee.employeeName,
        branchId: initialEmployee.branchId,
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialEmployee]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const branchesResult = await loadAllPaginatedOptions(
        fetchBranches,
        "ACTIVE",
      );

      if (cancelled) {
        return;
      }

      if (!branchesResult.ok) {
        setBranches([]);
        setOptionsError(branchesResult.error);
        setOptionsLoading(false);
        return;
      }

      let nextBranches: BranchOption[] = branchesResult.data.map((branch) => ({
        id: branch.id,
        branchCode: branch.branchCode,
        branchName: branch.branchName,
        isActive: branch.isActive,
      }));

      if (mode === "edit" && initialEmployee) {
        if (
          !nextBranches.some((branch) => branch.id === initialEmployee.branchId)
        ) {
          nextBranches = [
            {
              id: initialEmployee.branch.id,
              branchCode: initialEmployee.branch.branchCode,
              branchName: initialEmployee.branch.branchName,
              isActive: false,
            },
            ...nextBranches,
          ];
        }
      }

      setBranches(nextBranches);
      setOptionsLoading(false);
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [open, mode, initialEmployee]);

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
      const parsed = createEmployeeInputSchema.safeParse({
        employeeCode: form.employeeCode,
        employeeName: form.employeeName,
        branchId: form.branchId,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "employeeCode" ||
            key === "employeeName" ||
            key === "branchId"
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
          error instanceof Error ? error.message : "Failed to create employee",
        );
      }
      return;
    }

    const parsed = updateEmployeeInputSchema.safeParse({
      employeeCode: form.employeeCode,
      employeeName: form.employeeName,
      branchId: form.branchId,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "employeeCode" ||
          key === "employeeName" ||
          key === "branchId"
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
        error instanceof Error ? error.message : "Failed to update employee",
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
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mode === "create" ? "Add Employee" : "Edit Employee"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Create a local staff record for store-user and supervisor assignments."
              : "Update employee details. Use Activate/Deactivate in the table to change status."}
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
          <Field
            label="Employee Code"
            required
            error={fieldErrors.employeeCode}
            htmlFor="employee-code"
          >
            <input
              id="employee-code"
              name="employeeCode"
              value={form.employeeCode}
              onChange={(event) =>
                updateField("employeeCode", event.target.value)
              }
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.employeeCode)}
              aria-invalid={Boolean(fieldErrors.employeeCode)}
            />
          </Field>

          <Field
            label="Employee Name"
            required
            error={fieldErrors.employeeName}
            htmlFor="employee-name"
          >
            <input
              id="employee-name"
              name="employeeName"
              value={form.employeeName}
              onChange={(event) =>
                updateField("employeeName", event.target.value)
              }
              disabled={saving || optionsLoading}
              autoComplete="off"
              className={inputClassName(fieldErrors.employeeName)}
              aria-invalid={Boolean(fieldErrors.employeeName)}
            />
          </Field>

          <Field
            label="Branch"
            required
            error={fieldErrors.branchId}
            htmlFor="employee-branch"
          >
            <select
              id="employee-branch"
              name="branchId"
              value={form.branchId}
              onChange={(event) => updateField("branchId", event.target.value)}
              disabled={saving || optionsLoading}
              className={inputClassName(fieldErrors.branchId)}
              aria-invalid={Boolean(fieldErrors.branchId)}
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branchCode} — {branch.branchName}
                  {branch.isActive ? "" : " (Inactive)"}
                </option>
              ))}
            </select>
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
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create Employee"
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
