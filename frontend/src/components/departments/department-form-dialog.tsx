"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  createDepartmentInputSchema,
  updateDepartmentInputSchema,
  type CreateDepartmentInput,
  type Department,
  type UpdateDepartmentInput,
} from "@printing-stationery/shared";

type DepartmentFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialDepartment?: Department | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateDepartmentInput) => Promise<void>;
  onSubmitEdit: (input: UpdateDepartmentInput) => Promise<void>;
};

type FormState = {
  departmentCode: string;
  departmentName: string;
  isActive: boolean;
};

type FieldErrors = Partial<
  Record<"departmentCode" | "departmentName" | "isActive", string>
>;

const EMPTY_FORM: FormState = {
  departmentCode: "",
  departmentName: "",
  isActive: true,
};

export function DepartmentFormDialog({
  open,
  mode,
  initialDepartment,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: DepartmentFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

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

    if (mode === "edit" && initialDepartment) {
      setForm({
        departmentCode: initialDepartment.departmentCode,
        departmentName: initialDepartment.departmentName,
        isActive: initialDepartment.isActive,
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialDepartment]);

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
      const parsed = createDepartmentInputSchema.safeParse({
        departmentCode: form.departmentCode,
        departmentName: form.departmentName,
        isActive: form.isActive,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "departmentCode" ||
            key === "departmentName" ||
            key === "isActive"
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
          error instanceof Error ? error.message : "Failed to create department",
        );
      }
      return;
    }

    const parsed = updateDepartmentInputSchema.safeParse({
      departmentCode: form.departmentCode,
      departmentName: form.departmentName,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "departmentCode" || key === "departmentName") {
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
        error instanceof Error ? error.message : "Failed to update department",
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
        className="my-auto flex w-full max-w-[36rem] flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg"
        noValidate
      >
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mode === "create" ? "Add Department" : "Edit Department"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Create an organizational cost centre that may receive issued items."
              : "Update department details. Use Activate/Deactivate in the table to change status."}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Field
            label="Department Code"
            required
            error={fieldErrors.departmentCode}
            htmlFor="department-code"
          >
            <input
              id="department-code"
              name="departmentCode"
              value={form.departmentCode}
              onChange={(event) =>
                updateField("departmentCode", event.target.value)
              }
              disabled={saving}
              autoComplete="off"
              className={inputClassName(fieldErrors.departmentCode)}
              aria-invalid={Boolean(fieldErrors.departmentCode)}
            />
          </Field>

          <Field
            label="Department Name"
            required
            error={fieldErrors.departmentName}
            htmlFor="department-name"
          >
            <input
              id="department-name"
              name="departmentName"
              value={form.departmentName}
              onChange={(event) =>
                updateField("departmentName", event.target.value)
              }
              disabled={saving}
              autoComplete="organization"
              className={inputClassName(fieldErrors.departmentName)}
              aria-invalid={Boolean(fieldErrors.departmentName)}
            />
          </Field>

          {mode === "create" ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateField("isActive", event.target.checked)
                }
                disabled={saving}
                className="size-4 accent-accent"
              />
              Active
            </label>
          ) : (
            <div className="rounded-md border border-border bg-paper px-3 py-2 text-sm">
              <span className="text-ink-muted">Status: </span>
              <span className={form.isActive ? "text-success" : "text-ink-muted"}>
                {form.isActive ? "Active" : "Inactive"}
              </span>
              <p className="mt-1 text-xs text-ink-muted">
                Status is read-only here. Use Activate or Deactivate in the table.
              </p>
            </div>
          )}
        </div>

        {formError ? (
          <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
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
            disabled={saving}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create Department"
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
