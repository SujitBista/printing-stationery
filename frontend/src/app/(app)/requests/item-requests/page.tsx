import type { Metadata } from "next";
import { ItemRequestListPage } from "@/components/item-requests/item-request-list-page";

export const metadata: Metadata = {
  title: "All Requests",
};

export default function ItemRequestsPage() {
  return <ItemRequestListPage queue="request-list" />;
}
