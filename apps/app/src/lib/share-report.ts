import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Report } from './analysis';
import { reportHtml } from './report-html';

/**
 * 레포트를 PDF로 만들어 공유 메뉴를 연다. 메뉴를 닫는 것은 오류가 아니다.
 * 임시 이름 대신 AIGO-report-{id}.pdf로 옮겨 보낸다. Android의 shareAsync는 대상 앱이 파일을 읽기 전에
 * 끝나므로 여기서 지우면 첨부가 비어 버린다. 파일은 앱 캐시에 두고 같은 분석을 다시 공유할 때 덮어쓴다.
 */
export async function shareReportPdf(report: Report, createdAt: string, id: string | number): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(report, createdAt) });
  const named = new File(Paths.cache, `AIGO-report-${id}.pdf`);
  await new File(uri).move(named, { overwrite: true });
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: '레포트 공유' });
}
