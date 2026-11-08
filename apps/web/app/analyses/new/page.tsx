import { UploadForm } from "@/components/analysis/UploadForm";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

export default function NewAnalysisPage() {
  return (
    <>
      <Nav />
      <main className="frame min-h-[60vh]">
        <header className="flex flex-col gap-2 border-b border-line p-5 md:p-10">
          <h1 className="text-3xl font-bold tracking-[-0.02em] md:text-5xl">사고 영상 올리기</h1>
          <p className="text-muted">영상에서 확인되는 사실을 정리하고 과실 기준과 대조합니다.</p>
        </header>
        <UploadForm />
      </main>
      <Footer />
    </>
  );
}
