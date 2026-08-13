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
  resetApplicationUserPasswordInputSchema,
  type ApplicationUser,
  type ResetApplicationUserPasswordInput,
} from "@printing-stationery/shared";

type ResetPasswordDialogProps = {
  open: boolean;
  user: ApplicationUser | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: ResetApplicationUserPasswordInput) => Promise<void>;
};

type FormState = {
  temporaryPassword: string;
  confirmTemporaryPassword: string;
};

type FieldErrors = Partial<
  Record<"temporaryPassword" | "confirmTemporaryPassword", string>
>;

const EMPTY_FORM: FormState = {
  temporaryPassword: "",
  confirmTemporaryPassword: "",
};

export function ResetPasswordDialog({
  open,
  user,
  saving,
  onClose,
  onSubmit,
}: ResetPasswordDialogProps) {
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

    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  }, [open, user]);

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

    const parsed = resetApplicationUserPasswordInputSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "temporaryPassword" || key === "confirmTemporaryPassword") {
          nextErrors[key] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError("Please correct the highlighted fields.");
      return;
    }

    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to reset password",
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
            Reset Password
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Set a new temporary password
            {user ? ` for ${user.username}` : ""}. The user must change it on
            next login. The current password is never shown.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Field
            label="Temporary Password"
            required
            error={fieldErrors.temporaryPassword}
            htmlFor="reset-password"
          >
            <input
              id="reset-password"
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
            htmlFor="reset-confirm-password"
          >
            <input
              id="reset-confirm-password"
              name="confirmTemporaryPassword"
              type="password"
              value={form.confirmTemporaryPassword}
              onChange={(event) =>
                updateField("confirmTemporaryPassword", event.target.value)
              }
              disabled={saving}
              autoComplete="new-password"
              className={inputClassName(fieldErrors.confirmTemporaryPassword)}
              aria-invalid={Boolean(fieldErrors.confirmTemporaryPassword)}
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
            disabled={saving}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Resetting…" : "Reset Password"}
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
