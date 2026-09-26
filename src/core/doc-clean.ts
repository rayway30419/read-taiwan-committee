// Drive 匯出的 Markdown 前處理（pure）：去除圖片、base64 資料、Google Docs 匯出雜訊。
// 文件圖片一律不公開（可能含未遮蔽的個資截圖）。

/** 從 Drive / Docs 網址取出 file ID；不是 Drive 網址回傳 null。 */
export function driveFileId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  let m = s.match(/^https:\/\/(?:docs|drive)\.google\.com\/(?:document|file|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1]!;
  m = s.match(/^https:\/\/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1]!;
  return null;
}

export function cleanExportedMarkdown(md: string): string {
  return (
    md
      .replace(/\r\n?/g, '\n')
      // reference-style 圖片定義：[image1]: <data:image/png;base64,...>
      .replace(/^\[[^\]\n]+\]:\s*<?data:[^\n]*$/gm, '')
      // inline 圖片 ![alt](url) 與 reference 圖片 ![alt][ref]
      .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')
      .replace(/!\[[^\]\n]*\]\[[^\]\n]*\]/g, '')
      // 殘留的 data: URI
      .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '')
      // Google Docs 匯出的跳脫字元（\- \. \( 等）對閱讀無意義，但保留表格用的 \|
      .replace(/\\([-.()!#*_+=~>])/g, '$1')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}
