import { Notice } from "@/components/ui/Notice";
import { FAILURES } from "./types";

/** 서버 메시지가 제목과 같은 말로 시작하면 두 번 쓰지 않는다. */
export function FailureNotice({ code, message }: { code: string; message: string }) {
  const known = FAILURES[code];
  const title = known?.title ?? "요청을 끝내지 못했습니다";
  const repeated = message.startsWith(title);

  return (
    <Notice tone="danger">
      <strong className="block font-bold">{repeated ? message : title}</strong>
      {!repeated && <span className="block">{message}</span>}
      {known?.hint && <span className="block text-muted">{known.hint}</span>}
    </Notice>
  );
}
