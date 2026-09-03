"use client";

import { useParams } from "next/navigation";
import { EmployeeTransferPage } from "@/components/employees/employee-transfer-page";

export default function OrganizationEmployeeTransferPage() {
  const params = useParams<{ id: string }>();
  return <EmployeeTransferPage employeeId={params.id} />;
}
