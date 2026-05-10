import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingDetailPage } from "@/components/marketing-detail-page";
import { getMarketingPage, getMarketingStaticParams } from "@/lib/marketing-pages";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getMarketingStaticParams("product");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getMarketingPage("product", slug);

  if (!page) {
    return {};
  }

  return {
    title: page.label,
    description: page.description,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getMarketingPage("product", slug);

  if (!page) {
    notFound();
  }

  return <MarketingDetailPage page={page} />;
}
