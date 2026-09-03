"use client";

import { useParams } from "next/navigation";
import { EmployeeDetailPage } from "@/components/employees/employee-detail-page";

export default function OrganizationEmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  return <EmployeeDetailPage employeeId={params.id} />;
}
