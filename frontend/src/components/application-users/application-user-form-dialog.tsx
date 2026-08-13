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
  updateApplicationUserInputSchema,
  type ApplicationUser,
  type CreateApplicationUserInput,
  type Employee,
  type UpdateApplicationUserInput,
} from "@printing-stationery/shared";
import { fetchEligibleEmployees } from "@/lib/api/application-users";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";

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
};

type FieldErrors = Partial<
  Record<
    | "employeeId"
    | "username"
    | "role"
    | "temporaryPassword"
    | "confirmTemporaryPassword",
    string
  >
>;

const EMPTY_FORM: FormState = {
  employeeId: "",
  username: "",
  role: "",
  temporaryPassword: "",
  confirmTemporaryPassword: "",
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
      const parsed = createApplicationUserInputSchema.safeParse({
        employeeId: form.employeeId,
        username: form.username,
        role: form.role,
        temporaryPassword: form.temporaryPassword,
        confirmTemporaryPassword: form.confirmTemporaryPassword,
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
            key === "confirmTemporaryPassword"
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
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "username" || key === "role") {
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
            style={{ fontFamily: "var(--font-display)" }}
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
              <select
                id="application-user-employee"
                name="employeeId"
                value={form.employeeId}
                onChange={(event) =>
                  updateField("employeeId", event.target.value)
                }
                disabled={saving || optionsLoading}
                className={inputClassName(fieldErrors.employeeId)}
                aria-invalid={Boolean(fieldErrors.employeeId)}
              >
                <option value="">Select an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} — {employee.employeeName}
                  </option>
                ))}
              </select>
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
                (optionsLoading || Boolean(optionsError)))
            }
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
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
