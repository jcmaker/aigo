const won = new Intl.NumberFormat("ko-KR");

/** 129000 → "129,000원" */
export function formatWon(n: number): string {
  return `${won.format(n)}원`;
}

/** 초 → "2:05". 영상 시각이라 소수점은 버린다. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
