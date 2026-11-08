"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export function ProductError() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <div className="flex flex-col items-start gap-4 p-5 md:p-10">
      <Notice tone="danger">상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>
      <Button variant="secondary" loading={retrying} onClick={() => startRetry(() => router.refresh())}>
        다시 시도
      </Button>
    </div>
  );
}
