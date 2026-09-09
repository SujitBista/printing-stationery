import { PurchaseDetailPage } from "@/components/purchases/purchase-detail-page";

type PurchasePageProps = {
  params: Promise<{ id: string }>;
};

export default async function PurchasePage({ params }: PurchasePageProps) {
  const { id } = await params;
  return <PurchaseDetailPage purchaseId={id} />;
}
