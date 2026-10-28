import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REQUEST_NAV_ITEM,
  issueDetailHref,
  requestDetailHref,
  requestNavItemForIssueDetail,
  resolveRequestNavItem,
  type RequestNavItemId,
} from "./request-nav.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ISSUE_ID = "22222222-2222-4222-8222-222222222222";

const NAV_ITEMS = Object.values(REQUEST_NAV_ITEM);

function activeItems(
  pathname: string,
  options?: {
    activeNavItem?: string | null;
    registeredNavItem?: RequestNavItemId | null;
  },
): RequestNavItemId[] {
  const resolved = resolveRequestNavItem({ pathname, ...options });
  return NAV_ITEMS.filter((item) => item === resolved);
}

describe("resolveRequestNavItem", () => {
  it("highlights All Requests for the list and for request details opened from it", () => {
    assert.equal(
      resolveRequestNavItem({ pathname: "/requests/item-requests" }),
      REQUEST_NAV_ITEM.ALL_REQUESTS,
    );
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-requests/${REQUEST_ID}`,
      }),
      REQUEST_NAV_ITEM.ALL_REQUESTS,
    );
    assert.equal(
      resolveRequestNavItem({
        pathname: "/requests/item-requests",
        activeNavItem: REQUEST_NAV_ITEM.READY_TO_ISSUE,
      }),
      REQUEST_NAV_ITEM.ALL_REQUESTS,
    );
  });

  it("highlights Ready to Issue for the queue and for New Item Issue", () => {
    assert.equal(
      resolveRequestNavItem({
        pathname: "/requests/item-requests/ready-to-issue",
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-requests/${REQUEST_ID}/issue`,
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
  });

  it("does not let the create-issue route match All Requests", () => {
    const active = activeItems(`/requests/item-requests/${REQUEST_ID}/issue`);
    assert.deepEqual(active, [REQUEST_NAV_ITEM.READY_TO_ISSUE]);
  });

  it("keeps Ready to Issue on the source request after leaving New Item Issue", () => {
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-requests/${REQUEST_ID}`,
        activeNavItem: REQUEST_NAV_ITEM.READY_TO_ISSUE,
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
    assert.equal(
      requestDetailHref(REQUEST_ID, REQUEST_NAV_ITEM.READY_TO_ISSUE),
      `/requests/item-requests/${REQUEST_ID}?activeNavItem=READY_TO_ISSUE`,
    );
  });

  it("highlights a draft issue as Ready to Issue after the page loads it", () => {
    assert.equal(
      requestNavItemForIssueDetail({
        status: "DRAFT",
        destinationType: "BRANCH_STORE",
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-issues/${ISSUE_ID}`,
        registeredNavItem: REQUEST_NAV_ITEM.READY_TO_ISSUE,
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
  });

  it("uses the issue URL hint until the draft page finishes loading", () => {
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-issues/${ISSUE_ID}`,
        activeNavItem: REQUEST_NAV_ITEM.READY_TO_ISSUE,
      }),
      REQUEST_NAV_ITEM.READY_TO_ISSUE,
    );
    assert.equal(
      issueDetailHref(ISSUE_ID, REQUEST_NAV_ITEM.READY_TO_ISSUE),
      `/requests/item-issues/${ISSUE_ID}?activeNavItem=READY_TO_ISSUE`,
    );
  });

  it("lets the loaded issue replace a stale URL hint", () => {
    assert.equal(
      resolveRequestNavItem({
        pathname: `/requests/item-issues/${ISSUE_ID}`,
        activeNavItem: REQUEST_NAV_ITEM.READY_TO_ISSUE,
        registeredNavItem: REQUEST_NAV_ITEM.RETURNED_ISSUES,
      }),
      REQUEST_NAV_ITEM.RETURNED_ISSUES,
    );
  });

  it("maps returned, dispatched, issued, and department pages to one item each", () => {
    assert.deepEqual(
      activeItems("/requests/item-issues/returned"),
      [REQUEST_NAV_ITEM.RETURNED_ISSUES],
    );
    assert.equal(
      requestNavItemForIssueDetail({
        status: "RETURNED",
        destinationType: "BRANCH_STORE",
      }),
      REQUEST_NAV_ITEM.RETURNED_ISSUES,
    );

    assert.deepEqual(
      activeItems("/requests/item-issues/posted"),
      [REQUEST_NAV_ITEM.DISPATCHED_ISSUES],
    );
    assert.equal(
      requestNavItemForIssueDetail({
        status: "POSTED",
        destinationType: "BRANCH_STORE",
      }),
      REQUEST_NAV_ITEM.DISPATCHED_ISSUES,
    );

    assert.deepEqual(
      activeItems(`/requests/item-requests/${REQUEST_ID}`, {
        activeNavItem: REQUEST_NAV_ITEM.ISSUED_LIST,
      }),
      [REQUEST_NAV_ITEM.ISSUED_LIST],
    );
    assert.deepEqual(activeItems("/requests/item-requests/issued"), [
      REQUEST_NAV_ITEM.ISSUED_LIST,
    ]);

    assert.deepEqual(activeItems("/requests/department-consumption"), [
      REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION,
    ]);
    assert.deepEqual(activeItems("/requests/department-consumption/new"), [
      REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION,
    ]);
    assert.equal(
      requestNavItemForIssueDetail({
        status: "POSTED",
        destinationType: "CORPORATE_DEPARTMENT",
      }),
      REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION,
    );
    assert.equal(
      requestNavItemForIssueDetail({
        status: "DRAFT",
        destinationType: "CORPORATE_DEPARTMENT",
      }),
      REQUEST_NAV_ITEM.DEPARTMENT_CONSUMPTION,
    );
  });

  it("activates only one child for each owned route", () => {
    const paths = [
      "/requests/item-requests",
      `/requests/item-requests/${REQUEST_ID}`,
      "/requests/item-requests/ready-to-issue",
      `/requests/item-requests/${REQUEST_ID}/issue`,
      "/requests/item-issues/returned",
      "/requests/item-issues/posted",
      "/requests/item-requests/issued",
      "/requests/department-consumption",
      "/requests/department-consumption/new",
      "/requests/incoming-items/abc",
    ];

    for (const pathname of paths) {
      assert.equal(activeItems(pathname).length, 1, pathname);
    }
  });
});
