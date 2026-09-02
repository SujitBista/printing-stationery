"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StoreUser } from "@printing-stationery/shared";

type StoreUserDeleteDialogProps = {
  open: boolean;
  assignment: StoreUser | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

function personLabel(person: StoreUser["maker"]): string {
  return `${person.employee.employeeName} (${person.employee.employeeCode})`;
}

export function StoreUserDeleteDialog({
  open,
  assignment,
  deleting,
  onClose,
  onConfirm,
}: StoreUserDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleConfirm() {
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Failed to delete store user assignment",
      );
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 hidden h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink open:flex backdrop:bg-ink/40 sm:p-6"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (deleting) {
          event.preventDefault();
        }
      }}
    >
      <div className="my-auto flex w-full max-w-[32rem] flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
        <div>
          <h2 id={titleId} className="text-xl font-semibold tracking-tight">
            Delete Store User
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            This assignment will be removed permanently. You can create it again
            later if needed.
          </p>
        </div>

        {assignment ? (
          <dl className="grid gap-3 rounded-md border border-border bg-paper p-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Store
              </dt>
              <dd className="truncate text-sm font-medium text-ink">
                {assignment.store.storeName}
                <span className="ml-1 font-normal text-ink-muted">
                  ({assignment.store.storeCode})
                </span>
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Store User
              </dt>
              <dd className="truncate text-sm text-ink">
                {personLabel(assignment.maker)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                Supervisor
              </dt>
              <dd className="truncate text-sm text-ink">
                {personLabel(assignment.supervisor)}
              </dd>
            </div>
          </dl>
        ) : null}

        {error ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (!deleting) {
                onClose();
              }
            }}
            disabled={deleting}
            className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting || !assignment}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
