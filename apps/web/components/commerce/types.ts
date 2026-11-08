import type { components } from "@/lib/api.gen";

export type Product = components["schemas"]["ProductOut"];
export type Order = components["schemas"]["OrderOut"];

export const TEST_PAYMENT_NOTICE = "테스트 결제입니다. 실제로 청구되지 않습니다";
