"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createStoreUserInputSchema,
  updateStoreUserInputSchema,
  type BranchType,
  type CreateStoreUserInput,
  type EligibleStoreApplicationUser,
  type StoreUser,
  type StoreUserPersonSummary,
  type StoreUserStoreSummary,
  type UpdateStoreUserInput,
} from "@printing-stationery/shared";
import { fetchEligibleStoreApplicationUsers } from "@/lib/api/store-users";
import { loadAllPaginatedOptions } from "@/lib/api/load-paginated-options";

type StoreUserFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initialAssignment?: StoreUser | null;
  stores: StoreUserStoreSummary[];
  saving: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateStoreUserInput) => Promise<void>;
  onSubmitEdit: (input: UpdateStoreUserInput) => Promise<void>;
};

type FormState = {
  storeId: string;
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
  makerApplicationUserId: "",
  supervisorApplicationUserId: "",
};

function branchTypeLabel(branchType: BranchType): string {
  return branchType === "HEAD_OFFICE" ? "Head Office" : "Branch";
}

function optionLabel(user: StoreUserPersonSummary): string {
  return `${user.username} — ${user.employee.employeeName} (${user.employee.employeeCode})`;
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

function personPreview(
  selected: StoreUserPersonSummary | undefined,
): {
  employeeCode: string;
  employeeName: string;
  username: string;
  role: string;
  branch: string;
  branchType: string;
} | null {
  if (!selected) {
    return null;
  }

  return {
    employeeCode: selected.employee.employeeCode,
    employeeName: selected.employee.employeeName,
    username: selected.username,
    role: selected.role,
    branch: `${selected.employee.branch.branchCode} — ${selected.employee.branch.branchName}`,
    branchType: branchTypeLabel(selected.employee.branch.branchType),
  };
}

export function StoreUserFormDialog({
  open,
  mode,
  initialAssignment,
  stores,
  saving,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
}: StoreUserFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [eligibleMakers, setEligibleMakers] = useState<
    EligibleStoreApplicationUser[]
  >([]);
  const [eligibleSupervisors, setEligibleSupervisors] = useState<
    EligibleStoreApplicationUser[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

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

    if (mode === "edit" && initialAssignment) {
      setForm({
        storeId: initialAssignment.storeId,
        makerApplicationUserId: initialAssignment.makerApplicationUserId,
        supervisorApplicationUserId:
          initialAssignment.supervisorApplicationUserId,
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setEligibleMakers([]);
    setEligibleSupervisors([]);
    setFieldErrors({});
    setFormError(null);
    setOptionsError(null);
  }, [open, mode, initialAssignment]);

  useEffect(() => {
    if (!open || !form.storeId) {
      if (!form.storeId) {
        setEligibleMakers([]);
        setEligibleSupervisors([]);
        setOptionsLoading(false);
        setOptionsError(null);
      }
      return;
    }

    let cancelled = false;

    async function loadEligibleUsers() {
      setOptionsLoading(true);
      setOptionsError(null);

      const excludeAssignmentId =
        mode === "edit" ? initialAssignment?.id : undefined;

      const [makersResult, supervisorsResult] = await Promise.all([
        loadAllPaginatedOptions(
          (query) =>
            fetchEligibleStoreApplicationUsers({
              storeId: form.storeId,
              role: "MAKER",
              page: query.page,
              pageSize: query.pageSize,
              excludeAssignmentId,
            }),
          "ALL",
        ),
        loadAllPaginatedOptions(
          (query) =>
            fetchEligibleStoreApplicationUsers({
              storeId: form.storeId,
              role: "CHECKER",
              page: query.page,
              pageSize: query.pageSize,
              excludeAssignmentId,
            }),
          "ALL",
        ),
      ]);

      if (cancelled) {
        return;
      }

      if (!makersResult.ok) {
        setEligibleMakers([]);
        setEligibleSupervisors([]);
        setOptionsError(makersResult.error);
        setOptionsLoading(false);
        return;
      }

      if (!supervisorsResult.ok) {
        setEligibleMakers([]);
        setEligibleSupervisors([]);
        setOptionsError(supervisorsResult.error);
        setOptionsLoading(false);
        return;
      }

      setEligibleMakers(
        ensureCurrentUser(makersResult.data, initialAssignment?.maker),
      );
      setEligibleSupervisors(
        ensureCurrentUser(
          supervisorsResult.data,
          initialAssignment?.supervisor,
        ),
      );
      setOptionsLoading(false);
    }

    void loadEligibleUsers();

    return () => {
      cancelled = true;
    };
  }, [open, mode, form.storeId, initialAssignment]);

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

  const selectedMaker =
    eligibleMakers.find((user) => user.id === form.makerApplicationUserId) ??
    (mode === "edit" &&
    initialAssignment &&
    initialAssignment.makerApplicationUserId === form.makerApplicationUserId
      ? initialAssignment.maker
      : undefined);

  const selectedSupervisor =
    eligibleSupervisors.find(
      (user) => user.id === form.supervisorApplicationUserId,
    ) ??
    (mode === "edit" &&
    initialAssignment &&
    initialAssignment.supervisorApplicationUserId ===
      form.supervisorApplicationUserId
      ? initialAssignment.supervisor
      : undefined);

  const makerPreview = personPreview(selectedMaker);
  const supervisorPreview = personPreview(selectedSupervisor);

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
      });

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

      try {
        await onSubmitCreate(parsed.data);
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "Failed to create store user configuration",
        );
      }
      return;
    }

    const parsed = updateStoreUserInputSchema.safeParse({
      makerApplicationUserId: form.makerApplicationUserId,
      supervisorApplicationUserId: form.supervisorApplicationUserId,
    });

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

    try {
      await onSubmitEdit(parsed.data);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to update store user configuration",
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
        className="my-auto flex w-full max-w-[42rem] flex-col gap-4 rounded-lg border border-border bg-paper-elevated p-5 shadow-lg"
        noValidate
      >
        <div>
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {mode === "create" ? "Add Store User" : "Edit Store User"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Assign a Maker and their Checker/Supervisor to each Store. Employee
            and Branch details come from Application User Setup.
          </p>
        </div>

        {optionsError ? (
          <p
            className="border-l-2 border-danger pl-3 text-sm text-danger"
            role="alert"
          >
            {optionsError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <Field
            label="Store"
            required
            error={fieldErrors.storeId}
            htmlFor="store-user-store"
          >
            <select
              id="store-user-store"
              name="storeId"
              value={form.storeId}
              onChange={(event) => updateField("storeId", event.target.value)}
              disabled={saving || mode === "edit"}
              className={inputClassName(fieldErrors.storeId)}
              aria-invalid={Boolean(fieldErrors.storeId)}
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeCode} — {store.storeName}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Store User (Maker)"
            required
            error={fieldErrors.makerApplicationUserId}
            htmlFor="store-user-maker"
          >
            <select
              id="store-user-maker"
              name="makerApplicationUserId"
              value={form.makerApplicationUserId}
              onChange={(event) =>
                updateField("makerApplicationUserId", event.target.value)
              }
              disabled={saving || !form.storeId || optionsLoading}
              className={inputClassName(fieldErrors.makerApplicationUserId)}
              aria-invalid={Boolean(fieldErrors.makerApplicationUserId)}
            >
              <option value="">
                {!form.storeId
                  ? "Select a store first"
                  : optionsLoading
                    ? "Loading eligible makers…"
                    : "Select a maker"}
              </option>
              {makerOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {optionLabel(user)}
                </option>
              ))}
            </select>
          </Field>

          {makerPreview ? (
            <PersonDetails title="Selected maker" preview={makerPreview} />
          ) : null}

          <Field
            label="Supervisor (Checker)"
            required
            error={fieldErrors.supervisorApplicationUserId}
            htmlFor="store-user-supervisor"
          >
            <select
              id="store-user-supervisor"
              name="supervisorApplicationUserId"
              value={form.supervisorApplicationUserId}
              onChange={(event) =>
                updateField("supervisorApplicationUserId", event.target.value)
              }
              disabled={saving || !form.storeId || optionsLoading}
              className={inputClassName(
                fieldErrors.supervisorApplicationUserId,
              )}
              aria-invalid={Boolean(fieldErrors.supervisorApplicationUserId)}
            >
              <option value="">
                {!form.storeId
                  ? "Select a store first"
                  : optionsLoading
                    ? "Loading eligible checkers…"
                    : "Select a supervisor"}
              </option>
              {supervisorOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {optionLabel(user)}
                </option>
              ))}
            </select>
          </Field>

          {supervisorPreview ? (
            <PersonDetails
              title="Selected supervisor"
              preview={supervisorPreview}
            />
          ) : null}
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
            disabled={
              saving || !form.storeId || optionsLoading || Boolean(optionsError)
            }
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create Assignment"
                : "Save Changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function PersonDetails({
  title,
  preview,
}: {
  title: string;
  preview: {
    employeeCode: string;
    employeeName: string;
    username: string;
    role: string;
    branch: string;
    branchType: string;
  };
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-paper p-3 sm:grid-cols-2">
      <p className="sr-only">{title}</p>
      <ReadOnlyField label="Employee Code" value={preview.employeeCode} />
      <ReadOnlyField label="Employee Name" value={preview.employeeName} />
      <ReadOnlyField label="Username" value={preview.username} />
      <ReadOnlyField label="Role" value={preview.role} />
      <ReadOnlyField label="Branch" value={preview.branch} />
      <ReadOnlyField label="Branch Type" value={preview.branchType} />
    </div>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className="truncate text-sm text-ink">{value}</span>
    </div>
  );
}

function inputClassName(error?: string): string {
  return `w-full rounded-md border bg-paper-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60 ${
    error ? "border-danger" : "border-border"
  }`;
}
