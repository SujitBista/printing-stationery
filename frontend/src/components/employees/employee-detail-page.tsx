"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  Employee,
  EmployeeTransfer,
  EmployeeTransferAssignment,
  UpdateEmployeeInput,
} from "@printing-stationery/shared";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchEmployee,
  fetchEmployeeTransferContext,
  fetchEmployeeTransfers,
  updateEmployee,
  updateEmployeeStatus,
} from "@/lib/api/employees";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmployeeFormDialog } from "./employee-form-dialog";
import {
  formatIsoDate,
  personLabel,
  storeLabel,
} from "./employee-transfer-labels";

const LIST_HREF = "/organization/employees";

type EmployeeDetailPageProps = {
  employeeId: string;
};

export function EmployeeDetailPage({ employeeId }: EmployeeDetailPageProps) {
  const { canMutateMasterData } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);
  const [currentAssignment, setCurrentAssignment] =
    useState<EmployeeTransferAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [employeeResult, transfersResult, contextResult] = await Promise.all([
      fetchEmployee(employeeId),
      fetchEmployeeTransfers(employeeId),
      fetchEmployeeTransferContext(employeeId),
    ]);

    if (!employeeResult.ok) {
      setEmployee(null);
      setTransfers([]);
      setCurrentAssignment(null);
      setLoadError(employeeResult.error);
      setLoading(false);
      return;
    }

    setEmployee(employeeResult.data);
    setTransfers(transfersResult.ok ? transfersResult.data.items : []);
    setCurrentAssignment(
      contextResult.ok ? contextResult.data.currentAssignment : null,
    );
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEdit(input: UpdateEmployeeInput) {
    if (!employee) {
      return;
    }
    setSaving(true);
    const result = await updateEmployee(employee.id, input);
    setSaving(false);
    if (!result.ok) {
      throw new Error(result.error);
    }
    setEditOpen(false);
    setFeedback({ type: "success", message: "Employee updated successfully." });
    await load();
  }

  async function handleToggleStatus() {
    if (!employee) {
      return;
    }
    if (employee.isActive) {
      const confirmed = window.confirm(
        `Deactivate employee "${employee.employeeName}"? The employee will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdating(true);
    const result = await updateEmployeeStatus(employee.id, {
      isActive: !employee.isActive,
    });
    setStatusUpdating(false);
    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }
    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Employee activated successfully."
        : "Employee deactivated successfully.",
    });
    await load();
  }

  if (loading) {
    return (
      <section className="w-full max-w-6xl">
        <PageHeader title="Employee" description="Loading employee details…" />
      </section>
    );
  }

  if (loadError || !employee) {
    return (
      <section className="w-full max-w-6xl">
        <PageHeader title="Employee" />
        <div className="mt-6 border-l-2 border-danger pl-4">
          <p className="font-medium text-danger">Unable to load employee</p>
          <p className="mt-1 text-sm text-ink-muted">
            {loadError ?? "Employee not found"}
          </p>
          <Link
            href={LIST_HREF}
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Back to Employee Setup
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl">
      <PageHeader
        eyebrow="Organization"
        title={employee.employeeName}
        description={`${employee.employeeCode} · ${employee.branch.branchCode} — ${employee.branch.branchName}`}
        actions={
          <>
            <Button href={LIST_HREF} variant="ghost">
              Back
            </Button>
            {canMutateMasterData ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={statusUpdating}
                  onClick={() => void handleToggleStatus()}
                >
                  {statusUpdating
                    ? "Updating…"
                    : employee.isActive
                      ? "Deactivate"
                      : "Activate"}
                </Button>
                <Button href={`/organization/employees/${employee.id}/transfer`}>
                  Transfer Employee
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {feedback ? (
        <p
          className={`mt-4 border-l-2 pl-3 text-sm ${
            feedback.type === "success"
              ? "border-success text-success"
              : "border-danger text-danger"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      <dl className="mt-6 grid gap-4 rounded-xl border border-border bg-paper-elevated p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">
            Status
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {employee.isActive ? "Active" : "Inactive"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">
            Current branch
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {employee.branch.branchName}
          </dd>
          <dd className="text-xs text-ink-muted">{employee.branch.branchCode}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">
            Current store
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {currentAssignment
              ? storeLabel(currentAssignment.store)
              : "No active store assignment"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">
            Current supervisor
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {currentAssignment
              ? personLabel(currentAssignment.supervisor)
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">
          Transfer history
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Historical inventory requests and issues keep the branch and
          assignment from the time they were created.
        </p>

        {transfers.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-8 text-center">
            <p className="font-medium text-ink">No transfers recorded</p>
            <p className="mt-1 text-sm text-ink-muted">
              Branch changes made through Transfer appear here.
            </p>
          </div>
        ) : (
          <div className="ps-table-shell mt-4">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Effective date
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    From branch
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    To branch
                  </th>
                  <th className="min-w-[12rem] px-3 py-2 font-semibold">
                    Reason
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">
                    Transferred by
                  </th>
                  <th className="min-w-[10rem] px-3 py-2 font-semibold">
                    Previous assignment
                  </th>
                  <th className="min-w-[10rem] px-3 py-2 font-semibold">
                    New assignment
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    className="border-b border-border last:border-b-0 align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-medium">
                      {formatIsoDate(transfer.effectiveDate)}
                    </td>
                    <td className="px-3 py-3">
                      <div>{transfer.fromBranch.branchName}</div>
                      <div className="text-xs text-ink-muted">
                        {transfer.fromBranch.branchCode}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{transfer.toBranch.branchName}</div>
                      <div className="text-xs text-ink-muted">
                        {transfer.toBranch.branchCode}
                      </div>
                    </td>
                    <td className="px-3 py-3">{transfer.reason}</td>
                    <td className="px-3 py-3">
                      {personLabel(transfer.transferredBy)}
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      <div>
                        Store:{" "}
                        {transfer.fromStore
                          ? storeLabel(transfer.fromStore)
                          : "—"}
                      </div>
                      <div>
                        Supervisor:{" "}
                        {transfer.fromSupervisor
                          ? personLabel(transfer.fromSupervisor)
                          : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      <div>
                        Store:{" "}
                        {transfer.toStore ? storeLabel(transfer.toStore) : "—"}
                      </div>
                      <div>
                        Supervisor:{" "}
                        {transfer.toSupervisor
                          ? personLabel(transfer.toSupervisor)
                          : "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EmployeeFormDialog
        open={editOpen}
        mode="edit"
        initialEmployee={employee}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setEditOpen(false);
          }
        }}
        onSubmitCreate={async () => undefined}
        onSubmitEdit={handleEdit}
      />
    </section>
  );
}
