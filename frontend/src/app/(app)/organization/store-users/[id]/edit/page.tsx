"use client";

import { useParams } from "next/navigation";
import { StoreUserFormPage } from "@/components/store-users/store-user-form-page";

export default function EditStoreUserPage() {
  const params = useParams<{ id: string }>();
  return <StoreUserFormPage mode="edit" assignmentId={params.id} />;
}
