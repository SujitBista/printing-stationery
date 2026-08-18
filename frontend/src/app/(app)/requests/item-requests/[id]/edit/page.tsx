"use client";

import { useParams } from "next/navigation";
import { ItemRequestFormPage } from "@/components/item-requests/item-request-form-page";

export default function EditItemRequestPage() {
  const params = useParams<{ id: string }>();
  return <ItemRequestFormPage mode="edit" requestId={params.id} />;
}