"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  createUnitInputSchema,
  updateUnitInputSchema,
  type CreateUnitInput,
  type Unit,
  type UpdateUnitInput,
} from "@printing-stationery/shared";

type UnitFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialUnit?: Unit | null;
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateUnitInput) => Promise<void>;
  onSubmitEdit: (input: UpdateUnitInput) => Promise<void>;
};

type FormState = {
  unitName: string;
  isActive: boolean;
};

type FieldErrors = Partial<Record<"unitName" | "isActive", string>>;

const EMPTY_FORM: FormState = {
  unitName: "",
  isActive: true,
};

export function UnitFormDialog({
  open,
  mode,
  initialUnit,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: UnitFormDialogProps) {
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

    if (mode === "edit" && initialUnit) {
      setForm({
        unitName: initialUnit.unitName,
        isActive: initialUnit.isActive,
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setFieldErrors({});
    setFormError(null);
  }, [open, mode, initialUnit]);

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
      const parsed = createUnitInputSchema.safeParse({
        unitName: form.unitName,
        isActive: form.isActive,
      });

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (key === "unitName" || key === "isActive") {
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
          error instanceof Error ? error.message : "Failed to create unit",
        );
      }
      return;
    }

    const parsed = updateUnitInputSchema.safeParse({
      unitName: form.unitName,
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "unitName") {
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
        error instanceof Error ? error.message : "Failed to update unit",
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
            {mode === "create" ? "Add Unit" : "Edit Unit"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === "create"
              ? "Create a unit of measure for stationery and printing items."
              : "Update the unit name. Use Activate/Deactivate in the table to change status."}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Field
            label="Unit Name"
            required
            error={fieldErrors.unitName}
            htmlFor="unit-name"
          >
            <input
              id="unit-name"
              name="unitName"
              value={form.unitName}
              onChange={(event) => updateField("unitName", event.target.value)}
              disabled={saving}
              autoComplete="off"
              className={inputClassName(fieldErrors.unitName)}
              aria-invalid={Boolean(fieldErrors.unitName)}
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
                ? "Create Unit"
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
