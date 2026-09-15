"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ItemIssueListItem, ItemIssueQueue } from "@printing-stationery/shared";
import { fetchItemIssues } from "@/lib/api/item-issues";
import { useAuth } from "@/lib/auth/auth-context";
import { getItemIssueQueue } from "@/lib/item-issues/queues";
import { useItemRequestNavContext } from "@/lib/item-requests/use-item-request-nav-context";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  ITEM_ISSUE_STATUS_LABELS,
  itemIssueStatusTone,
  personDisplayName,
} from "./item-issue-labels";

const PAGE_SIZE = 20;

type ItemIssueListPageProps = {
  queue: ItemIssueQueue;
};

export function ItemIssueListPage({ queue }: ItemIssueListPageProps) {
  const queueMeta = getItemIssueQueue(queue);
  const { canAccessItemRequests } = useAuth();
  const { setPendingIssueVerificationCount, setReturnedIssueCount } =
    useItemRequestNavContext();
  const [issues, setIssues] = useState<ItemIssueListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setSearchInput("");
    setSearch("");
  }, [queue]);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchItemIssues({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      queue,
      status: "ALL",
    });
    if (!result.ok) {
      setIssues([]);
      setTotalItems(0);
      setTotalPages(0);
      setLoadError(result.error);
      setLoading(false);
      return;
    }
    setIssues(result.data.items);
    setTotalItems(result.data.totalItems);
    setTotalPages(result.data.totalPages);
    if (!search) {
      if (queue === "pending-verification") {
        setPendingIssueVerificationCount(result.data.totalItems);
      }
      if (queue === "returned") {
        setReturnedIssueCount(result.data.totalItems);
      }
    }
    setLoading(false);
  }, [
    page,
    queue,
    search,
    setPendingIssueVerificationCount,
    setReturnedIssueCount,
  ]);

  useEffect(() => {
    if (!canAccessItemRequests) {
      setLoading(false);
      return;
    }
    void loadIssues();
  }, [canAccessItemRequests, loadIssues]);

  if (!canAccessItemRequests) {
    return (
      <section className="w-full max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
          Item Issues
        </h1>
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm text-danger">
          You do not have access to Item Issues.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
        {queueMeta.title}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{queueMeta.description}</p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search issue or request number"
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm outline-none focus:border-accent-mid focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent-tint bg-paper-elevated px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          Search
        </button>
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading issues…</p>
      ) : loadError ? (
        <p className="mt-6 border-l-2 border-danger pl-3 text-sm text-danger">
          {loadError}
        </p>
      ) : issues.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">No item issues in this queue.</p>
      ) : (
        <>
          <div className="ps-table-shell mt-4">
            <table className="min-w-[64rem] w-full text-left text-sm">
              <thead className="border-b border-border bg-accent-soft text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Issue</th>
                  <th className="px-3 py-2 font-semibold">Request</th>
                  <th className="px-3 py-2 font-semibold">From → To</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-border last:border-b-0 hover:bg-accent-soft/70"
                  >
                    <td className="px-3 py-3 font-medium">{issue.issueNumber}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/requests/item-requests/${issue.requestId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {issue.requestNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div>{issue.fromStore.storeName}</div>
                      <div className="text-xs text-ink-muted">
                        Receiving: {issue.toStore.storeName} (
                        {issue.toStore.branch.branchName})
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={itemIssueStatusTone(issue.status)}>
                        {ITEM_ISSUE_STATUS_LABELS[issue.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div>{personDisplayName(issue.createdBy)}</div>
                      <div className="text-xs text-ink-muted">
                        {formatDateTime(issue.createdAt)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/requests/item-issues/${issue.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {issue.canVerify
                          ? "Verify"
                          : issue.canEdit
                            ? "Continue"
                            : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <p>
              Showing page {page}
              {totalPages > 0 ? ` of ${totalPages}` : ""} · {totalItems}{" "}
              {totalItems === 1 ? "issue" : "issues"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-accent-tint px-3 py-1.5 font-medium text-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
