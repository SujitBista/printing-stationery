import { ItemIssueFormPage } from "@/components/item-issues/item-issue-form-page";

type ItemIssueCreatePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemIssueCreatePage({
  params,
}: ItemIssueCreatePageProps) {
  const { id } = await params;
  return <ItemIssueFormPage mode="create" requestId={id} />;
}
