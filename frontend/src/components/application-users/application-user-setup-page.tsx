"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  APP_ROLES,
  type AppRole,
  type ApplicationUser,
  type ApplicationUserStatusFilter,
  type Branch,
  type CreateApplicationUserInput,
  type ResetApplicationUserPasswordInput,
  type UpdateApplicationUserInput,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import {
  createApplicationUser,
  fetchApplicationUsers,
  resetApplicationUserPassword,
  updateApplicationUser,
  updateApplicationUserStatus,
} from "@/lib/api/application-users";
import { ApplicationUserFormDialog } from "./application-user-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PAGE_SIZE = 20;

export function ApplicationUserSetupPage() {
  const { canManageApplicationUsers } = useAuth();
  const [users, setUsers] = useState<ApplicationUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationUserStatusFilter>("ALL");
  const [role, setRole] = useState<AppRole | "">("");
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
  const [editingUser, setEditingUser] = useState<ApplicationUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetUser, setResetUser] = useState<ApplicationUser | null>(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    async function loadFilterOptions() {
      const branchesResult = await loadAllPaginatedOptions(
        fetchBranches,
        "ALL",
      );

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

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setIsUnavailable(false);

    const result = await fetchApplicationUsers({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      role: role || undefined,
      branchId: branchId || undefined,
    });

    if (!result.ok) {
      setUsers([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setIsUnavailable(result.status === 503);
      setLoading(false);
      return;
    }

    setUsers(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    setLoading(false);
  }, [page, search, status, role, branchId]);

  useEffect(() => {
    if (!canManageApplicationUsers) {
      setLoading(false);
      return;
    }
    void loadUsers();
  }, [canManageApplicationUsers, loadUsers]);

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
    setEditingUser(null);
    setDialogOpen(true);
  }

  function openEditDialog(user: ApplicationUser) {
    setDialogMode("edit");
    setEditingUser(user);
    setDialogOpen(true);
  }

  async function handleCreate(input: CreateApplicationUserInput) {
    setSaving(true);
    const result = await createApplicationUser(input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Application user created successfully.",
    });
    await loadUsers();
  }

  async function handleEdit(input: UpdateApplicationUserInput) {
    if (!editingUser) {
      return;
    }

    setSaving(true);
    const result = await updateApplicationUser(editingUser.id, input);
    setSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setDialogOpen(false);
    setFeedback({
      type: "success",
      message: "Application user updated successfully.",
    });
    await loadUsers();
  }

  async function handleResetPassword(input: ResetApplicationUserPasswordInput) {
    if (!resetUser) {
      return;
    }

    setResetSaving(true);
    const result = await resetApplicationUserPassword(resetUser.id, input);
    setResetSaving(false);

    if (!result.ok) {
      throw new Error(result.error);
    }

    setResetUser(null);
    setFeedback({
      type: "success",
      message: "Password reset. The user must change it on next login.",
    });
    await loadUsers();
  }

  async function handleToggleStatus(user: ApplicationUser) {
    if (user.isActive) {
      const confirmed = window.confirm(
        `Deactivate user "${user.username}"? The account will remain in the system but cannot log in.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setStatusUpdatingId(user.id);
    const result = await updateApplicationUserStatus(user.id, {
      isActive: !user.isActive,
    });
    setStatusUpdatingId(null);

    if (!result.ok) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setFeedback({
      type: "success",
      message: result.data.isActive
        ? "Application user activated successfully."
        : "Application user deactivated successfully.",
    });
    await loadUsers();
  }

  if (!canManageApplicationUsers) {
    return (
      <section className="w-full max-w-7xl">
        <h1
          className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
        >
          Application User Setup
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          Only an Admin can manage application users.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-accent sm:text-3xl"
          >
            Application User Setup
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Give an existing employee a username, password and application role.
            Branch comes from Employee Setup.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateDialog}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            Add New
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-ink">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by username, code or name"
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Role</span>
          <select
            value={role}
            onChange={(event) => {
              setPage(1);
              setRole(event.target.value as AppRole | "");
            }}
            className="rounded-lg border border-border bg-paper-elevated px-3 py-2 outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
          >
            <option value="">All roles</option>
            {APP_ROLES.map((appRole) => (
              <option key={appRole} value={appRole}>
                {appRole}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as ApplicationUserStatusFilter);
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
          <p className="text-sm text-ink-muted">Loading application users…</p>
        ) : isUnavailable ? (
          <div className="border-l-2 border-warning pl-4">
            <p className="font-medium text-warning">Database unavailable</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : loadError ? (
          <div className="border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">
              Unable to load application users
            </p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-accent-soft/50 px-4 py-10 text-center">
            <p className="font-medium text-ink">No application users found</p>
            <p className="mt-1 text-sm text-ink-muted">
              {search || status !== "ALL" || role || branchId
                ? "Try adjusting search or filters."
                : "Add an application user to get started."}
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
                      Username
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Role
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Must Change Password
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-soft/70"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {user.employee.employeeCode}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3 font-medium">
                        {user.employee.employeeName}
                      </td>
                      <td className="min-w-[10rem] px-3 py-3">
                        <div>{user.employee.branch.branchName}</div>
                        <div className="text-xs text-ink-muted">
                          {user.employee.branch.branchCode}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {user.username}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {user.role}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${user.isActive ? "border-secondary-tint bg-secondary-soft text-secondary-dark" : "border-border-strong bg-paper text-ink-muted"}`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {user.mustChangePassword ? "Yes" : "No"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(user)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetUser(user)}
                            className="font-medium text-accent hover:text-accent-dark hover:underline"
                          >
                            Reset Password
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(user)}
                            disabled={statusUpdatingId === user.id}
                            className="text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
                          >
                            {statusUpdatingId === user.id
                              ? "Updating…"
                              : user.isActive
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
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
                {totalItems === 1 ? "user" : "users"}
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

      <ApplicationUserFormDialog
        open={dialogOpen}
        mode={dialogMode}
        initialUser={editingUser}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setDialogOpen(false);
          }
        }}
        onSubmitCreate={handleCreate}
        onSubmitEdit={handleEdit}
      />

      <ResetPasswordDialog
        open={resetUser !== null}
        user={resetUser}
        saving={resetSaving}
        onClose={() => {
          if (!resetSaving) {
            setResetUser(null);
          }
        }}
        onSubmit={handleResetPassword}
      />
    </section>
  );
}
