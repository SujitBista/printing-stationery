import type { Metadata } from "next";
import { ItemRequestListPage } from "@/components/item-requests/item-request-list-page";

export const metadata: Metadata = {
  title: "Pending My Review",
};

export default function ItemRequestRecommendPage() {
  return <ItemRequestListPage queue="recommend" />;
}
