"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  transferEmployeeInputSchema,
  type Branch,
  type EligibleStoreApplicationUser,
  type EmployeeTransferContext,
  type Store,
} from "@printing-stationery/shared";
import { fetchBranches } from "@/lib/api/branches";
import { fetchStores } from "@/lib/api/stores";
import { fetchEligibleStoreApplicationUsers } from "@/lib/api/store-users";
import {
  fetchEmployeeTransferContext,
  transferEmployee,
} from "@/lib/api/employees";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  branchLabel,
  formatIsoDate,
  localIsoDate,
  personLabel,
  storeLabel,
} from "./employee-transfer-labels";

type EmployeeTransferPageProps = {
  employeeId: string;
};

type FieldErrors = Partial<
  Record<
    | "toBranchId"
    | "effectiveDate"
    | "reason"
    | "toStoreId"
    | "toSupervisorApplicationUserId",
    string
  >
>;

function Field({
  label,
  required,
  error,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  hint?: string;
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
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function EmployeeTransferPage({ employeeId }: EmployeeTransferPageProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const detailsHref = `/organization/employees/${employeeId}`;

  const [context, setContext] = useState<EmployeeTransferContext | null>(null);
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "branchCode" | "branchName" | "isActive">[]
  >([]);
  const [stores, setStores] = useState<
    Pick<Store, "id" | "storeCode" | "storeName" | "isActive">[]
  >([]);
  const [supervisors, setSupervisors] = useState<EligibleStoreApplicationUser[]>(
    [],
  );
  const [toBranchId, setToBranchId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(localIsoDate());
  const [reason, setReason] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [toSupervisorApplicationUserId, setToSupervisorApplicationUserId] =
    useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [destinationLoading, setDestinationLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setOptionsError(null);

      const [contextResult, branchesResult] = await Promise.all([
        fetchEmployeeTransferContext(employeeId),
        loadAllPaginatedOptions(fetchBranches, "ACTIVE"),
      ]);

      if (cancelled) {
        return;
      }

      if (!contextResult.ok) {
        setContext(null);
        setFormError(contextResult.error);
        setLoading(false);
        return;
      }

      setContext(contextResult.data);
      if (!branchesResult.ok) {
        setBranches([]);
        setOptionsError(branchesResult.error);
      } else {
        setBranches(
          branchesResult.data.filter(
            (branch) => branch.id !== contextResult.data.employee.branchId,
          ),
        );
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeId, isAdmin]);

  useEffect(() => {
    if (!toBranchId) {
      setStores([]);
      setSupervisors([]);
      setToStoreId("");
      setToSupervisorApplicationUserId("");
      return;
    }

    let cancelled = false;

    async function loadDestination() {
      setDestinationLoading(true);
      const [storesResult, supervisorsResult] = await Promise.all([
        fetchStores({
          page: 1,
          pageSize: 100,
          status: "ACTIVE",
          branchId: toBranchId,
          hierarchy: "ALL",
        }),
        fetchEligibleStoreApplicationUsers({
          role: "CHECKER",
          branchId: toBranchId,
          page: 1,
          pageSize: 100,
        }),
      ]);

      if (cancelled) {
        return;
      }

      setStores(storesResult.ok ? storesResult.data.items : []);
      setSupervisors(supervisorsResult.ok ? supervisorsResult.data.items : []);
      setToStoreId("");
      setToSupervisorApplicationUserId("");
      setDestinationLoading(false);
    }

    void loadDestination();
    return () => {
      cancelled = true;
    };
  }, [toBranchId]);

  const canAssignStore = Boolean(
    context?.applicationUser?.roles.includes("MAKER") &&
      !context.applicationUser.roles.includes("ADMIN") &&
      !context.applicationUser.roles.includes("HR"),
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === toBranchId),
    [branches, toBranchId],
  );
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === toStoreId),
    [stores, toStoreId],
  );
  const selectedSupervisor = useMemo(
    () =>
      supervisors.find((user) => user.id === toSupervisorApplicationUserId),
    [supervisors, toSupervisorApplicationUserId],
  );

  function parsedInput() {
    return transferEmployeeInputSchema.safeParse({
      toBranchId,
      effectiveDate,
      reason,
      toStoreId: toStoreId || null,
      toSupervisorApplicationUserId: toSupervisorApplicationUserId || null,
    });
  }

  function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !context?.canTransfer) {
      return;
    }

    setFormError(null);
    setFieldErrors({});

    const parsed = parsedInput();
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "toBranchId" ||
          key === "effectiveDate" ||
          key === "reason" ||
          key === "toStoreId" ||
          key === "toSupervisorApplicationUserId"
        ) {
          nextErrors[key] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError("Please complete every required transfer field.");
      return;
    }

    setStep("confirm");
  }

  async function handleConfirm() {
    if (!context || saving) {
      return;
    }

    const parsed = parsedInput();
    if (!parsed.success) {
      setStep("form");
      return;
    }

    setSaving(true);
    setFormError(null);
    const result = await transferEmployee(employeeId, parsed.data);
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      setStep("form");
      return;
    }

    router.push(detailsHref);
  }

  if (!isAdmin) {
    return (
      <section className="w-full max-w-3xl">
        <PageHeader title="Transfer Employee" />
        <p className="mt-4 text-sm text-ink-muted">
          Only an administrator can transfer an employee.
        </p>
        <Link
          href={detailsHref}
          className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
        >
          Back to employee
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="w-full max-w-3xl">
        <PageHeader title="Transfer Employee" description="Loading…" />
      </section>
    );
  }

  const employee = context?.employee;

  return (
    <section className="w-full max-w-3xl">
      <PageHeader
        eyebrow="Organization"
        title="Transfer Employee"
        description="Move this employee to another branch. Historical inventory records are not changed."
        actions={
          <Button href={detailsHref} variant="ghost">
            Cancel
          </Button>
        }
      />

      {employee ? (
        <dl className="mt-6 grid gap-3 rounded-xl border border-border bg-paper-elevated p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">
              Employee
            </dt>
            <dd className="mt-1 text-sm font-medium">{employee.employeeName}</dd>
            <dd className="text-xs text-ink-muted">{employee.employeeCode}</dd>
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
        </dl>
      ) : null}

      {context && context.blockers.length > 0 ? (
        <div className="mt-4 border-l-2 border-warning pl-3 text-sm" role="alert">
          <p className="font-medium text-warning">
            This employee cannot be transferred yet.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
            {context.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {optionsError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
          {optionsError}
        </p>
      ) : null}

      {formError ? (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}

      {step === "form" ? (
        <form
          onSubmit={handleContinue}
          className="mt-6 rounded-xl border border-border bg-paper-elevated p-5"
          noValidate
        >
          <div className="grid gap-4">
            <Field
              label="New branch"
              required
              error={fieldErrors.toBranchId}
              htmlFor="employee-transfer-branch"
            >
              <SearchableSelect
                id="employee-transfer-branch"
                name="toBranchId"
                value={toBranchId}
                onChange={setToBranchId}
                disabled={saving || !context?.canTransfer}
                required
                placeholder="Select a different branch"
                searchPlaceholder="Search branches…"
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branchLabel(branch),
                }))}
              />
            </Field>

            <Field
              label="Effective date"
              required
              error={fieldErrors.effectiveDate}
              htmlFor="employee-transfer-effective-date"
            >
              <input
                id="employee-transfer-effective-date"
                name="effectiveDate"
                type="date"
                value={effectiveDate}
                max={localIsoDate()}
                onChange={(event) => setEffectiveDate(event.target.value)}
                disabled={saving || !context?.canTransfer}
                className="w-full rounded-md border border-border bg-paper-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
              />
            </Field>

            <Field
              label="Transfer reason"
              required
              error={fieldErrors.reason}
              htmlFor="employee-transfer-reason"
            >
              <textarea
                id="employee-transfer-reason"
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={saving || !context?.canTransfer}
                rows={4}
                maxLength={500}
                placeholder="Why is this employee moving branches?"
                className="w-full rounded-md border border-border bg-paper-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
              />
            </Field>

            <Field
              label="New store"
              error={fieldErrors.toStoreId}
              htmlFor="employee-transfer-store"
              hint={
                canAssignStore
                  ? "Optional. Only active stores in the new branch can be selected."
                  : "A new store assignment is only available when this employee has a MAKER account."
              }
            >
              <SearchableSelect
                id="employee-transfer-store"
                name="toStoreId"
                value={toStoreId}
                onChange={setToStoreId}
                disabled={
                  saving ||
                  !canAssignStore ||
                  !toBranchId ||
                  destinationLoading ||
                  !context?.canTransfer
                }
                placeholder={
                  destinationLoading ? "Loading stores…" : "No store change"
                }
                searchPlaceholder="Search stores…"
                emptyMessage="No active store in this branch"
                options={stores.map((store) => ({
                  value: store.id,
                  label: storeLabel(store),
                }))}
              />
            </Field>

            <Field
              label="New supervisor"
              error={fieldErrors.toSupervisorApplicationUserId}
              htmlFor="employee-transfer-supervisor"
              hint="Optional. Must be an active checker in the new branch."
            >
              <SearchableSelect
                id="employee-transfer-supervisor"
                name="toSupervisorApplicationUserId"
                value={toSupervisorApplicationUserId}
                onChange={setToSupervisorApplicationUserId}
                disabled={
                  saving ||
                  !canAssignStore ||
                  !toBranchId ||
                  destinationLoading ||
                  !context?.canTransfer
                }
                placeholder={
                  destinationLoading
                    ? "Loading supervisors…"
                    : "No supervisor change"
                }
                searchPlaceholder="Search supervisors…"
                emptyMessage="No active supervisor in this branch"
                options={supervisors.map((user) => ({
                  value: user.id,
                  label: personLabel({
                    username: user.username,
                    employeeName: user.employee.employeeName,
                    employeeCode: user.employee.employeeCode,
                  }),
                }))}
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button href={detailsHref} variant="ghost">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !context?.canTransfer || Boolean(optionsError)}
            >
              Review transfer
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-paper-elevated p-5">
          <h2 className="text-lg font-semibold">Confirm transfer</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {employee?.employeeName} will move from{" "}
            <span className="font-medium text-ink">
              {employee ? branchLabel(employee.branch) : "the current branch"}
            </span>{" "}
            to{" "}
            <span className="font-medium text-ink">
              {selectedBranch ? branchLabel(selectedBranch) : "the new branch"}
            </span>{" "}
            effective {formatIsoDate(effectiveDate)}. Previous inventory
            requests, issues, and approvals will still show the old branch and
            assignment.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">
                Previous store
              </dt>
              <dd className="mt-1">
                {context?.currentAssignment
                  ? storeLabel(context.currentAssignment.store)
                  : "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">
                New store
              </dt>
              <dd className="mt-1">
                {selectedStore ? storeLabel(selectedStore) : "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">
                Previous supervisor
              </dt>
              <dd className="mt-1">
                {context?.currentAssignment
                  ? personLabel(context.currentAssignment.supervisor)
                  : "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-muted">
                New supervisor
              </dt>
              <dd className="mt-1">
                {selectedSupervisor
                  ? personLabel({
                      username: selectedSupervisor.username,
                      employeeName: selectedSupervisor.employee.employeeName,
                      employeeCode: selectedSupervisor.employee.employeeCode,
                    })
                  : "None"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wider text-ink-muted">
                Reason
              </dt>
              <dd className="mt-1">{reason}</dd>
            </div>
          </dl>
          {context?.currentAssignment ? (
            <p className="mt-4 text-sm text-ink-muted">
              The previous store/supervisor assignment will be ended.
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setStep("form")}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirm()}
            >
              {saving ? "Transferring…" : "Confirm transfer"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
