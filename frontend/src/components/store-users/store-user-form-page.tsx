"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createStoreUserInputSchema,
  updateStoreUserInputSchema,
  type CreateStoreUserInput,
  type EligibleStoreApplicationUser,
  type StoreUser,
  type StoreUserPersonSummary,
  type StoreUserStoreSummary,
  type UpdateStoreUserInput,
} from "@printing-stationery/shared";
import {
  createStoreUser,
  fetchEligibleStoreApplicationUsers,
  fetchEligibleStores,
  fetchStoreUser,
  updateStoreUser,
} from "@/lib/api/store-users";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";
import { useAuth } from "@/lib/auth/auth-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";

const LIST_HREF = "/organization/store-users";
const USER_SOURCE = "EMPLOYEE";

type StoreUserFormPageProps = {
  mode: "create" | "edit";
  assignmentId?: string;
};

type FormState = {
  storeId: string;
  userSource: typeof USER_SOURCE;
  makerApplicationUserId: string;
  supervisorApplicationUserId: string;
};

type FieldErrors = Partial<
  Record<
    "storeId" | "makerApplicationUserId" | "supervisorApplicationUserId",
    string
  >
>;

const EMPTY_FORM: FormState = {
  storeId: "",
  userSource: USER_SOURCE,
  makerApplicationUserId: "",
  supervisorApplicationUserId: "",
};

function employeeOptionLabel(user: StoreUserPersonSummary): string {
  return `${user.employee.employeeName} (${user.employee.employeeCode})`;
}

function storeOptionLabel(store: StoreUserStoreSummary): string {
  return store.storeName;
}

function ensureCurrentUser(
  users: EligibleStoreApplicationUser[],
  current: StoreUserPersonSummary | undefined,
): EligibleStoreApplicationUser[] {
  if (!current) {
    return users;
  }

  if (users.some((user) => user.id === current.id)) {
    return users;
  }

  if (current.role !== "MAKER" && current.role !== "CHECKER") {
    return users;
  }

  return [
    {
      ...current,
      role: current.role,
    },
    ...users,
  ];
}

export function StoreUserFormPage({
  mode,
  assignmentId,
}: StoreUserFormPageProps) {
  const router = useRouter();
  const { canManageStoreUsers } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreUserStoreSummary[]>([]);
  const [eligibleMakers, setEligibleMakers] = useState<
    EligibleStoreApplicationUser[]
  >([]);
  const [eligibleSupervisors, setEligibleSupervisors] = useState<
    EligibleStoreApplicationUser[]
  >([]);
  const [assignment, setAssignment] = useState<StoreUser | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [makersLoading, setMakersLoading] = useState(false);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [makersError, setMakersError] = useState<string | null>(null);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageStoreUsers) {
      setPageLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPage() {
      setPageLoading(true);
      setLoadError(null);

      if (mode === "edit") {
        if (!assignmentId) {
          setLoadError("Store user assignment was not found.");
          setPageLoading(false);
          return;
        }

        const result = await fetchStoreUser(assignmentId);
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setLoadError(result.error);
          setPageLoading(false);
          return;
        }

        setAssignment(result.data);
        setStores([result.data.store]);
        setForm({
          storeId: result.data.storeId,
          userSource: USER_SOURCE,
          makerApplicationUserId: result.data.makerApplicationUserId,
          supervisorApplicationUserId: result.data.supervisorApplicationUserId,
        });
        setPageLoading(false);
        return;
      }

      const storesResult = await loadAllPaginatedOptions(
        (query) =>
          fetchEligibleStores({
            page: query.page,
            pageSize: query.pageSize,
          }),
        "ALL",
      );

      if (cancelled) {
        return;
      }

      if (!storesResult.ok) {
        setLoadError(storesResult.error);
        setPageLoading(false);
        return;
      }

      setStores(storesResult.data);
      setForm(EMPTY_FORM);
      setPageLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [assignmentId, canManageStoreUsers, mode]);

  useEffect(() => {
    if (!canManageStoreUsers || pageLoading || !form.storeId) {
      if (!form.storeId) {
        setEligibleSupervisors([]);
        setSupervisorsLoading(false);
        setSupervisorsError(null);
      }
      return;
    }

    let cancelled = false;

    async function loadSupervisors() {
      setSupervisorsLoading(true);
      setSupervisorsError(null);

      const excludeAssignmentId = mode === "edit" ? assignment?.id : undefined;

      const supervisorsResult = await loadAllPaginatedOptions(
        (query) =>
          fetchEligibleStoreApplicationUsers({
            storeId: form.storeId,
            role: "CHECKER",
            page: query.page,
            pageSize: query.pageSize,
            excludeAssignmentId,
          }),
        "ALL",
      );

      if (cancelled) {
        return;
      }

      if (!supervisorsResult.ok) {
        setEligibleSupervisors([]);
        setSupervisorsError(supervisorsResult.error);
        setSupervisorsLoading(false);
        return;
      }

      const storeBranchId =
        stores.find((store) => store.id === form.storeId)?.branch.id ??
        assignment?.store.branch.id;
      const currentSupervisor =
        assignment &&
        assignment.supervisor.employee.branch.id === storeBranchId
          ? assignment.supervisor
          : undefined;

      setEligibleSupervisors(
        ensureCurrentUser(supervisorsResult.data, currentSupervisor),
      );
      setSupervisorsLoading(false);
    }

    void loadSupervisors();

    return () => {
      cancelled = true;
    };
  }, [
    assignment,
    canManageStoreUsers,
    form.storeId,
    mode,
    pageLoading,
    stores,
  ]);

  useEffect(() => {
    if (!canManageStoreUsers || pageLoading || !form.storeId) {
      if (!form.storeId) {
        setEligibleMakers([]);
        setMakersLoading(false);
        setMakersError(null);
      }
      return;
    }

    let cancelled = false;

    async function loadMakers() {
      setMakersLoading(true);
      setMakersError(null);

      const excludeAssignmentId = mode === "edit" ? assignment?.id : undefined;

      const makersResult = await loadAllPaginatedOptions(
        (query) =>
          fetchEligibleStoreApplicationUsers({
            storeId: form.storeId,
            role: "MAKER",
            page: query.page,
            pageSize: query.pageSize,
            excludeAssignmentId,
          }),
        "ALL",
      );

      if (cancelled) {
        return;
      }

      if (!makersResult.ok) {
        setEligibleMakers([]);
        setMakersError(makersResult.error);
        setMakersLoading(false);
        return;
      }

      setEligibleMakers(ensureCurrentUser(makersResult.data, assignment?.maker));
      setMakersLoading(false);
    }

    void loadMakers();

    return () => {
      cancelled = true;
    };
  }, [
    assignment,
    canManageStoreUsers,
    form.storeId,
    mode,
    pageLoading,
  ]);

  const makerOptions = useMemo(
    () =>
      eligibleMakers.filter(
        (user) => user.id !== form.supervisorApplicationUserId,
      ),
    [eligibleMakers, form.supervisorApplicationUserId],
  );

  const supervisorOptions = useMemo(
    () =>
      eligibleSupervisors.filter(
        (user) => user.id !== form.makerApplicationUserId,
      ),
    [eligibleSupervisors, form.makerApplicationUserId],
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "storeId") {
        next.makerApplicationUserId = "";
        next.supervisorApplicationUserId = "";
      }
      if (
        key === "makerApplicationUserId" &&
        value === current.supervisorApplicationUserId
      ) {
        next.supervisorApplicationUserId = "";
      }
      if (
        key === "supervisorApplicationUserId" &&
        value === current.makerApplicationUserId
      ) {
        next.makerApplicationUserId = "";
      }
      return next;
    });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key as keyof FieldErrors];
      if (key === "storeId") {
        delete next.makerApplicationUserId;
        delete next.supervisorApplicationUserId;
      }
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
      const parsed = createStoreUserInputSchema.safeParse({
        storeId: form.storeId,
        makerApplicationUserId: form.makerApplicationUserId,
        supervisorApplicationUserId: form.supervisorApplicationUserId,
      } satisfies CreateStoreUserInput);

      if (!parsed.success) {
        const nextErrors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (
            key === "storeId" ||
            key === "makerApplicationUserId" ||
            key === "supervisorApplicationUserId"
          ) {
            nextErrors[key] ??= issue.message;
          }
        }
        setFieldErrors(nextErrors);
        setFormError("Please correct the highlighted fields.");
        return;
      }

      setSaving(true);
      const result = await createStoreUser(parsed.data);
      setSaving(false);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push(LIST_HREF);
      return;
    }

    if (!assignment) {
      setFormError("Store user assignment was not found.");
      return;
    }

    const parsed = updateStoreUserInputSchema.safeParse({
      makerApplicationUserId: form.makerApplicationUserId,
      supervisorApplicationUserId: form.supervisorApplicationUserId,
    } satisfies UpdateStoreUserInput);

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "makerApplicationUserId" ||
          key === "supervisorApplicationUserId"
        ) {
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

    setSaving(true);
    const result = await updateStoreUser(assignment.id, parsed.data);
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    router.push(LIST_HREF);
  }

  if (!canManageStoreUsers) {
    return (
      <section className="w-full max-w-5xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent">
          Add StoreUser
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          Only an Admin can manage store user assignments.
        </p>
      </section>
    );
  }

  const title = mode === "create" ? "Add StoreUser" : "Edit StoreUser";
  const optionsError = makersError ?? supervisorsError;
  const makerDisabled = saving || !form.storeId || makersLoading;
  const supervisorDisabled = saving || !form.storeId || supervisorsLoading;

  return (
    <section className="w-full max-w-5xl">
      {pageLoading ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-accent">
            {title}
          </h1>
          <p className="mt-6 text-sm text-ink-muted">Loading store user form…</p>
        </>
      ) : loadError ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-accent">
            {title}
          </h1>
          <div className="mt-6 border-l-2 border-danger pl-4">
            <p className="font-medium text-danger">Unable to load this form</p>
            <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
            <Link
              href={LIST_HREF}
              className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-dark hover:underline"
            >
              Back to Store User Setup
            </Link>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="rounded-xl border border-border bg-paper-elevated p-5 shadow-sm sm:p-6"
          noValidate
        >
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>

          {optionsError ? (
            <p
              className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger"
              role="alert"
            >
              {optionsError}
            </p>
          ) : null}

          <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field
              label="StoreName"
              required
              error={fieldErrors.storeId}
              htmlFor="store-user-store"
            >
              <SearchableSelect
                id="store-user-store"
                name="storeId"
                value={form.storeId}
                onChange={(nextValue) => updateField("storeId", nextValue)}
                disabled={saving || mode === "edit"}
                required
                clearable={false}
                placeholder="Select a store"
                searchPlaceholder="Search stores…"
                emptyMessage="No stores available to assign"
                options={stores.map((store) => ({
                  value: store.id,
                  label: storeOptionLabel(store),
                }))}
              />
            </Field>

            <Field label="UserSource" required htmlFor="store-user-source">
              <select
                id="store-user-source"
                name="userSource"
                value={form.userSource}
                onChange={() => updateField("userSource", USER_SOURCE)}
                disabled={saving}
                className="w-full rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
              >
                <option value={USER_SOURCE}>Employee</option>
              </select>
            </Field>

            <Field
              label="SupervisorName"
              required
              error={fieldErrors.supervisorApplicationUserId}
              htmlFor="store-user-supervisor"
            >
              <SearchableSelect
                id="store-user-supervisor"
                name="supervisorApplicationUserId"
                value={form.supervisorApplicationUserId}
                onChange={(nextValue) =>
                  updateField("supervisorApplicationUserId", nextValue)
                }
                disabled={supervisorDisabled}
                required
                clearable={false}
                placeholder={
                  !form.storeId
                    ? "Select a store first"
                    : supervisorsLoading
                      ? "Loading supervisors…"
                      : "Select a supervisor"
                }
                searchPlaceholder="Search supervisors…"
                emptyMessage="No Checker employees in this store’s branch"
                options={supervisorOptions.map((user) => ({
                  value: user.id,
                  label: employeeOptionLabel(user),
                }))}
              />
            </Field>

            <Field
              label="StoreUserName"
              required
              error={fieldErrors.makerApplicationUserId}
              htmlFor="store-user-maker"
            >
              <SearchableSelect
                id="store-user-maker"
                name="makerApplicationUserId"
                value={form.makerApplicationUserId}
                onChange={(nextValue) =>
                  updateField("makerApplicationUserId", nextValue)
                }
                disabled={makerDisabled}
                required
                clearable={false}
                placeholder={
                  !form.storeId
                    ? "Select a store first"
                    : makersLoading
                      ? "Loading store users…"
                      : "Select a store user"
                }
                searchPlaceholder="Search store users…"
                emptyMessage="No Maker employees in this store’s branch"
                options={makerOptions.map((user) => ({
                  value: user.id,
                  label: employeeOptionLabel(user),
                }))}
              />
            </Field>
          </div>

          <p className="mt-5 text-sm italic text-ink-muted">
            Note: SupervisorName lists Checker employees in the selected
            store’s branch. StoreUserName lists Maker employees in the selected
            store’s branch.
          </p>

          {formError ? (
            <p
              className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => router.push(LIST_HREF)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !form.storeId ||
                makersLoading ||
                supervisorsLoading ||
                Boolean(optionsError)
              }
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </section>
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
    <div className="flex min-w-0 flex-col gap-1">
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
