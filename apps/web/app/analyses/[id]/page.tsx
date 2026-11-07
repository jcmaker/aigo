import { AnalysisDetail } from "@/components/analysis/AnalysisDetail";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh]">
        <AnalysisDetail id={id} />
      </main>
      <Footer />
    </>
  );
}
