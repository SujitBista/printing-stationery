import { ItemIssueFormPage } from "@/components/item-issues/item-issue-form-page";

type ItemIssueDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemIssueDetailPage({
  params,
}: ItemIssueDetailPageProps) {
  const { id } = await params;
  return <ItemIssueFormPage mode="detail" issueId={id} />;
}
