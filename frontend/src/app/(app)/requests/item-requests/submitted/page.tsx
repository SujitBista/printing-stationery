import { redirect } from "next/navigation";
import { ITEM_REQUEST_MAKER_SUBMITTED_HREF } from "@/lib/item-requests/queues";

export default function ItemRequestSubmittedPage() {
  redirect(ITEM_REQUEST_MAKER_SUBMITTED_HREF);
}
