"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  Branch,
  CreateEmployeeInput,
  Employee,
  EmployeeStatusFilter,
  UpdateEmployeeInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  createEmployee,
  fetchEmployees,
  updateEmployee,
  updateEmployeeStatus,
} from "@/lib/api/employees";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { EmployeeImportDialog } from "./employee-import-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PAGE_SIZE = 20;

export function EmployeeSetupPage() {
  const { canMutateMasterData } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmployeeStatusFilter>("ALL");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "branchCode" | "branchName">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    async function loadFilterOptions() {
      const branchesResult = await loadAllPaginatedOptions(fetchBranches, "ALL");

      if (branchesResult.ok) {
        setBranches(
          branchesResult.data.map((branch) => ({
            id: branch.id,
            branchCode: branch.branchCode,
            branchName: branch.branchName,
          })),
        );
      }
    }

    void loadFilterOptions();
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchEmployees({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      branchId: branchId || undefined,
    });

    if (!result.ok) {
      setEmployees([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setEmployees(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status, branchId]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearch(searchInput.trim());
      });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchInput]);

  function openCreateDialog() {
    setDialogMode("create");
    setEditingEmployee(null);
    setDialogOpen(true);
  }

  function openEditDialog(employee: Employee) {
    setDialogMode("edit");
    setEditingEmployee(employee);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateEmployeeInput) {
    setSaving(true);
    const result = await createEmployee(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Employee created successfully.",
    });
    await loadEmployees();
  }

  async function handleEdit(input: UpdateEmployeeInput) {
    if (!editingEmployee) {
      return;
    }

    setSaving(true);
    const result = await updateEmployee(editingEmployee.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Employee updated successfully.",
    });
    await loadEmployees();
  }

  async function handleToggleStatus(employee: Employee) {
    if (employee.isActive) {
      const confirmed = window.confirm(
        `Deactivate employee "${employee.employeeName}"? The employee will remain in the system but marked inactive.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(employee.id);
    const result = await updateEmployeeStatus(employee.id, {
      isActive: !employee.isActive,
    });
    setStatusUpdatingId(null);

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
    await loadEmployees();
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            Employee Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Employees provide the local staff records used for store-user and
            supervisor assignments.
          </p>
        </div>
        {canMutateMasterData ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportDialogOpen(true)}
              className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
            >
              Import Employees
            </button>
            <button
              type="button"
              onClick={openCreateDialog}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              Add New
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by code or name"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as EmployeeStatusFilter);
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Branch</span>
          <SearchableSelect
            value={branchId}
            onChange={(nextValue) => {
              setPage(1);
              setBranchId(nextValue);
            }}
            placeholder="All branches"
            searchPlaceholder="Search branches…"
            options={branches.map((branch) => ({
              value: branch.id,
              label: `${branch.branchCode} — ${branch.branchName}`,
            }))}
          />
        </label>
      </div>

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

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading employees…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load employees</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No employees found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL" || branchId
                ? "Try adjusting search or filters."
                : "Add an employee to get started."}
            </p>
          </div>
        ) : (
          <>
            <div className="ps-table-shell">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Employee Code
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Employee Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr
                      key={employee.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {employee.employeeCode}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3 font-medium">
                        {employee.employeeName}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <div>{employee.branch.branchName}</div>
                        <div className="text-xs text-ink-muted">
                          {employee.branch.branchCode}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${employee.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                        >
                          {employee.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {canMutateMasterData ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(employee)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(employee)}
                            disabled={statusUpdatingId === employee.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === employee.id
                              ? "Updating…"
                              : employee.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">
                Showing page {page}
                {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems}{" "}
                {totalItems === 1 ? "employee" : "employees"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      totalPages === 0
                        ? current
                        : Math.min(totalPages, current + 1),
                    )
                  }
                  disabled={totalPages === 0 || page >= totalPages}
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <EmployeeFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialEmployee={editingEmployee}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
        onSubmitCreate={handleCreate}
        onSubmitEdit={handleEdit}
      />

      <EmployeeImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={async (importedCount, skippedExistingCount) => {
          setImportDialogOpen(false);
          const parts = [
            `Imported ${importedCount} ${importedCount === 1 ? "employee" : "employees"}.`,
          ];
          if (skippedExistingCount > 0) {
            parts.push(
              `Skipped ${skippedExistingCount} existing ${skippedExistingCount === 1 ? "code" : "codes"}.`,
            );
          }
          setFeedback({
            type: "success",
            message: parts.join(" "),
          });
          await loadEmployees();
        }}
      />
    </section>
  );
}
