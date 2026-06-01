export function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}

export function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    ({
      pdf: 'ti-file-type-pdf',
      zip: 'ti-file-zip', rar: 'ti-file-zip', gz: 'ti-file-zip', tar: 'ti-file-zip',
      mp4: 'ti-movie', mkv: 'ti-movie', mov: 'ti-movie', avi: 'ti-movie', webm: 'ti-movie',
      mp3: 'ti-music', wav: 'ti-music', flac: 'ti-music', ogg: 'ti-music',
      jpg: 'ti-photo', jpeg: 'ti-photo', png: 'ti-photo', gif: 'ti-photo', webp: 'ti-photo', svg: 'ti-photo',
      doc: 'ti-file-word', docx: 'ti-file-word',
      xls: 'ti-file-spreadsheet', xlsx: 'ti-file-spreadsheet', csv: 'ti-file-spreadsheet',
      js: 'ti-brand-javascript', ts: 'ti-brand-typescript', py: 'ti-brand-python',
      txt: 'ti-txt', md: 'ti-markdown', json: 'ti-braces',
    } as Record<string, string>)[ext] ?? 'ti-file'
  );
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
