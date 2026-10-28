import { redirect } from "next/navigation";
import { ITEM_REQUEST_RECOMMENDED_HREF } from "@/lib/item-requests/queues";

export default function ItemRequestRecommendedPage() {
  redirect(ITEM_REQUEST_RECOMMENDED_HREF);
}
