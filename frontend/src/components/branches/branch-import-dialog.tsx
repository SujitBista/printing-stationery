"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { BranchImportPreviewResponse } from "@printing-stationery/shared";
import { confirmBranchImport, previewBranchImport } from "@/lib/api/branches";

type BranchImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImported: (importedCount: number, skippedExistingCount: number) => void;
};

export function BranchImportDialog({
  open,
  onClose,
  onImported,
}: BranchImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BranchImportPreviewResponse | null>(null);
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

    const result = await previewBranchImport(file);
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

    const result = await confirmBranchImport({
      branches: preview.ready.map((row) => ({
        branchCode: row.branchCode,
        branchName: row.branchName,
        branchType: row.branchType,
        address: row.address,
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
      <div className="my-auto flex w-full max-w-5xl flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg">
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Import Branches
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload `storemaster.xlsx`. The importer uses `StoreCode` as branch
            code and `BranchName` as branch name.
          </p>
        </div>

        <form onSubmit={handlePreview} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="branch-import-file" className="font-medium text-ink">
              Excel file (.xlsx)
            </label>
            <input
              id="branch-import-file"
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
                Choose storemaster.xlsx, then preview before importing.
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
          <p className="border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryChip label="Ready" value={preview.summary.readyCount} tone="success" />
              <SummaryChip label="Existing" value={preview.summary.existingCount} />
              <SummaryChip
                label="Duplicate codes"
                value={preview.summary.duplicateCodeCount}
                tone={preview.summary.duplicateCodeCount > 0 ? "danger" : "muted"}
              />
              <SummaryChip
                label="Invalid rows"
                value={preview.summary.invalidRowCount}
                tone={preview.summary.invalidRowCount > 0 ? "danger" : "muted"}
              />
              <SummaryChip label="Total rows" value={preview.summary.totalRows} />
            </div>

            <PreviewSection title="Ready branches" empty="No new branches ready to import.">
              {preview.ready.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Row</th>
                      <th className="px-2 py-1.5 font-semibold">Branch Code</th>
                      <th className="px-2 py-1.5 font-semibold">Branch Name</th>
                      <th className="px-2 py-1.5 font-semibold">Type</th>
                      <th className="px-2 py-1.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.ready.map((row) => (
                      <tr key={`ready-${row.rowNumber}`} className="border-b border-border last:border-b-0">
                        <td className="px-2 py-1.5">{row.rowNumber}</td>
                        <td className="px-2 py-1.5 font-medium">{row.branchCode}</td>
                        <td className="px-2 py-1.5">{row.branchName}</td>
                        <td className="px-2 py-1.5">{row.branchType === "HEAD_OFFICE" ? "Head Office" : "Branch"}</td>
                        <td className="px-2 py-1.5">{row.isActive ? "Active" : "Inactive"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </PreviewSection>

            <PreviewSection title="Already existing" empty="No existing branch codes matched.">
              {preview.existing.length > 0 ? (
                <ul className="space-y-1 text-sm text-ink-muted">
                  {preview.existing.map((row) => (
                    <li key={`existing-${row.rowNumber}`}>
                      Row {row.rowNumber}: {row.branchCode} — {row.branchName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </PreviewSection>

            <PreviewSection title="Invalid rows" empty="No invalid rows.">
              {preview.invalidRows.length > 0 ? (
                <ul className="space-y-1 text-sm text-danger">
                  {preview.invalidRows.map((row) => (
                    <li key={`invalid-${row.rowNumber}`}>
                      Row {row.rowNumber}: {row.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </PreviewSection>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={preview.ready.length === 0 || busy}
                onClick={() => void handleConfirm()}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {importing
                  ? "Importing…"
                  : `Import ${preview.ready.length} ready branch${preview.ready.length === 1 ? "" : "es"}`}
              </button>
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:bg-paper disabled:opacity-60"
              >
                Close
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
  tone?: "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 text-success"
      : tone === "danger"
        ? "border-danger/30 text-danger"
        : "border-border text-ink-muted";

  return (
    <div className={`rounded-md border bg-paper px-3 py-2 text-sm ${toneClass}`}>
      <div className="text-xs uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
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
  const hasContent = children !== null && children !== false;
  return (
    <div className="rounded-md border border-border bg-paper p-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 max-h-48 overflow-auto">
        {hasContent ? children : <p className="text-sm text-ink-muted">{empty}</p>}
      </div>
    </div>
  );
}
