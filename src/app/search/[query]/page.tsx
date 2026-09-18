import { redirect } from "next/navigation";

export const revalidate = 3600;

type SearchPageProps = {
  params: Promise<{
    query: string;
  }>;
};

export default async function SearchPage({ params }: SearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);
  redirect(`/search?q=${encodeURIComponent(decodedQuery)}`);
}
