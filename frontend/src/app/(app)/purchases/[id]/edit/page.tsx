import { PurchaseFormPage } from "@/components/purchases/purchase-form-page";

type EditPurchasePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPurchasePage({
  params,
}: EditPurchasePageProps) {
  const { id } = await params;
  return <PurchaseFormPage mode="edit" purchaseId={id} />;
}
