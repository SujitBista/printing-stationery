"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ItemRequestActionType } from "@printing-stationery/shared";
import { ITEM_REQUEST_ACTION_LABELS } from "./item-request-labels";

const CONFIRM_ACTIONS = new Set<ItemRequestActionType>([
  "SUBMIT",
  "RESUBMIT",
  "RECOMMEND",
  "FORWARD",
  "APPROVE",
  "REJECT",
  "CANCEL",
]);

const REQUIRED_REMARK_ACTIONS = new Set<ItemRequestActionType>([
  "RETURN",
  "REJECT",
]);

type ItemRequestActionDialogProps = {
  open: boolean;
  action: ItemRequestActionType | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (remarks: string | null) => Promise<void>;
};

export function ItemRequestActionDialog({
  open,
  action,
  saving,
  onClose,
  onConfirm,
}: ItemRequestActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      setRemarks("");
      setError(null);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!action) {
      return;
    }

    const trimmed = remarks.trim();
    if (REQUIRED_REMARK_ACTIONS.has(action) && trimmed.length === 0) {
      setError("Remarks are required for this action");
      return;
    }

    if (trimmed.length > 500) {
      setError("Remarks must be at most 500 characters");
      return;
    }

    setError(null);
    try {
      await onConfirm(trimmed.length === 0 ? null : trimmed);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to perform this action",
      );
    }
  }

  const remarksRequired = action ? REQUIRED_REMARK_ACTIONS.has(action) : false;
  const confirmLabel = action
    ? ITEM_REQUEST_ACTION_LABELS[action]
    : "Confirm";

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
        onSubmit={(event) => void handleSubmit(event)}
        className="my-auto flex w-full max-w-[32rem] flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg"
        noValidate
      >
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
          >
            {confirmLabel}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {action && CONFIRM_ACTIONS.has(action)
              ? "Please confirm this workflow action. It cannot be undone from this screen."
              : "Add remarks if required, then confirm."}
          </p>
        </div>

        {error ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">
            Remarks{remarksRequired ? " (required)" : " (optional)"}
          </span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={4}
            maxLength={500}
            disabled={saving}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (!saving) {
                onClose();
              }
            }}
            disabled={saving}
            className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={saving || !action}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {saving ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}