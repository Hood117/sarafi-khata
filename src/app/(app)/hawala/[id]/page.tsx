import { notFound } from "next/navigation";

import {
  getHawalaDetail,
  HawalaDetailView,
  isHawalaError,
} from "@/features/hawala";

type HawalaDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HawalaDetailPage({
  params,
}: HawalaDetailPageProps) {
  const { id } = await params;

  let hawala;

  try {
    hawala = await getHawalaDetail(id);
  } catch (error) {
    if (isHawalaError(error) && error.code === "NOT_FOUND") {
      notFound();
    }

    throw error;
  }

  return <HawalaDetailView hawala={hawala} />;
}
