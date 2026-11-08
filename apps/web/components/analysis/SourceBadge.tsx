import { Badge } from "@/components/ui/Badge";

/** DashPi 블랙박스가 올린 분석에만 붙는 출처 배지 */
export function SourceBadge({ source }: { source: string }) {
  return source === "dashpi" ? <Badge>DashPi</Badge> : null;
}
