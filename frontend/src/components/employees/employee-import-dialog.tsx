"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { EmployeeImportPreviewResponse } from "@printing-stationery/shared";
import {
  confirmEmployeeImport,
  previewEmployeeImport,
} from "@/lib/api/employees";

type EmployeeImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImported: (importedCount: number, skippedExistingCount: number) => void;
};

export function EmployeeImportDialog({
  open,
  onClose,
  onImported,
}: EmployeeImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Chromium closes <dialog showModal()> when the OS file picker opens/closes.
  // Always suppress native cancel and close only via Cancel / Escape.
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreviewResponse | null>(
    null,
  );
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setFile(null);
    setPreview(null);
    setPreviewing(false);
    setImporting(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open]);

  function requestClose() {
    if (previewing || importing) {
      return;
    }
    dialogRef.current?.close();
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || previewing || importing) {
      return;
    }

    setError(null);
    setPreview(null);
    setPreviewing(true);

    const result = await previewEmployeeImport(file);
    setPreviewing(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(result.data);
  }

  async function handleConfirm() {
    if (!preview || preview.ready.length === 0 || importing || previewing) {
      return;
    }

    setError(null);
    setImporting(true);

    const result = await confirmEmployeeImport({
      employees: preview.ready.map((row) => ({
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        branchId: row.branchId,
        isActive: row.isActive,
      })),
    });
    setImporting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onImported(result.data.importedCount, result.data.skippedExistingCount);
  }

  const busy = previewing || importing;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 hidden h-auto max-h-none w-auto max-w-none items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink open:flex backdrop:bg-ink/40 sm:p-6"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        // Native cancel also fires when the OS file picker opens/closes from a
        // showModal() dialog (Chromium). Always suppress it and close explicitly.
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        if (busy) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        requestClose();
      }}
    >
      <div className="my-auto flex w-full max-w-4xl flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Import Employees
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload an HRIS .xlsx file to preview and import employee code, name,
            and branch. Existing employee codes are skipped. Passwords and login
            accounts are never imported.
          </p>
        </div>

        <form onSubmit={handlePreview} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="employee-import-file" className="font-medium text-ink">
              Excel file (.xlsx)
            </label>
            <input
              id="employee-import-file"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                setPreview(null);
                setError(null);
              }}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border file:border-border file:bg-paper file:px-3 file:py-1.5 file:text-sm"
            />
            {file ? (
              <p className="text-xs text-ink-muted">Selected: {file.name}</p>
            ) : (
              <p className="text-xs text-ink-muted">
                Choose an .xlsx workbook, then preview before importing.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!file || busy}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {previewing ? "Validating…" : "Preview & Validate"}
            </button>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>

        {error ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryChip
                label="Ready"
                value={preview.summary.readyCount}
                tone="success"
              />
              <SummaryChip
                label="Existing"
                value={preview.summary.existingCount}
              />
              <SummaryChip
                label="Duplicate codes"
                value={preview.summary.duplicateCodeCount}
                tone={
                  preview.summary.duplicateCodeCount > 0 ? "danger" : "muted"
                }
              />
              <SummaryChip
                label="Unknown branches"
                value={preview.summary.unknownBranchCount}
                tone={
                  preview.summary.unknownBranchCount > 0 ? "danger" : "muted"
                }
              />
              <SummaryChip
                label="Invalid rows"
                value={preview.summary.invalidRowCount}
                tone={preview.summary.invalidRowCount > 0 ? "danger" : "muted"}
              />
              <SummaryChip label="Total rows" value={preview.summary.totalRows} />
            </div>

            <PreviewSection
              title="Ready employees"
              empty="No new employees ready to import."
            >
              {preview.ready.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Row</th>
                      <th className="px-2 py-1.5 font-semibold">Code</th>
                      <th className="px-2 py-1.5 font-semibold">Name</th>
                      <th className="px-2 py-1.5 font-semibold">Branch</th>
                      <th className="px-2 py-1.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.ready.map((row) => (
                      <tr key={`ready-${row.rowNumber}`} className="border-b border-border last:border-b-0">
                        <td className="px-2 py-1.5">{row.rowNumber}</td>
                        <td className="px-2 py-1.5 font-medium">
                          {row.employeeCode}
                        </td>
                        <td className="px-2 py-1.5">{row.employeeName}</td>
                        <td className="px-2 py-1.5">
                          {row.branchCode} — {row.branchName}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.isActive ? "Active" : "Inactive"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </PreviewSection>

            <PreviewSection
              title="Existing employees (will be skipped)"
              empty="No existing employee codes found."
            >
              {preview.existing.length > 0 ? (
                <SimpleCodeNameTable rows={preview.existing} />
              ) : null}
            </PreviewSection>

            <PreviewSection
              title="Duplicate employee codes in file"
              empty="No duplicate employee codes."
            >
              {preview.duplicateCodes.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Code</th>
                      <th className="px-2 py-1.5 font-semibold">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.duplicateCodes.map((row) => (
                      <tr
                        key={`dup-${row.employeeCode}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-2 py-1.5 font-medium">
                          {row.employeeCode}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.rowNumbers.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </PreviewSection>

            <PreviewSection
              title="Unknown branches"
              empty="No unknown branches."
            >
              {preview.unknownBranches.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Row</th>
                      <th className="px-2 py-1.5 font-semibold">Code</th>
                      <th className="px-2 py-1.5 font-semibold">Branch code</th>
                      <th className="px-2 py-1.5 font-semibold">Branch name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.unknownBranches.map((row) => (
                      <tr
                        key={`branch-${row.rowNumber}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-2 py-1.5">{row.rowNumber}</td>
                        <td className="px-2 py-1.5">
                          {row.employeeCode ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.branchCode ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.branchName ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </PreviewSection>

            <PreviewSection title="Invalid rows" empty="No invalid rows.">
              {preview.invalidRows.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Row</th>
                      <th className="px-2 py-1.5 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.invalidRows.map((row) => (
                      <tr
                        key={`invalid-${row.rowNumber}-${row.reason}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-2 py-1.5">{row.rowNumber}</td>
                        <td className="px-2 py-1.5">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </PreviewSection>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy || preview.ready.length === 0}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {importing
                  ? "Importing…"
                  : `Confirm Import (${preview.ready.length})`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

function SummaryChip({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-ink";

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function PreviewSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasContent = Boolean(children);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {hasContent ? (
        <div className="max-h-48 overflow-auto rounded-md border border-border">
          {children}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{empty}</p>
      )}
    </section>
  );
}

function SimpleCodeNameTable({
  rows,
}: {
  rows: Array<{ rowNumber: number; employeeCode: string; employeeName: string }>;
}) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
        <tr>
          <th className="px-2 py-1.5 font-semibold">Row</th>
          <th className="px-2 py-1.5 font-semibold">Code</th>
          <th className="px-2 py-1.5 font-semibold">Name</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`existing-${row.rowNumber}`}
            className="border-b border-border last:border-b-0"
          >
            <td className="px-2 py-1.5">{row.rowNumber}</td>
            <td className="px-2 py-1.5 font-medium">{row.employeeCode}</td>
            <td className="px-2 py-1.5">{row.employeeName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
