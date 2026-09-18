import { IncomingShipmentDetailPage } from "@/components/item-issues/incoming-shipment-detail-page";

type IncomingShipmentRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function IncomingShipmentRoutePage({
  params,
}: IncomingShipmentRouteProps) {
  const { id } = await params;
  return <IncomingShipmentDetailPage shipmentId={id} />;
}
