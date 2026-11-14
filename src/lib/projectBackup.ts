import JSZip from 'jszip';
import archivedFiles from 'virtual:project-source-archive';
import { buildBackupReadmeText } from './backupReadme';

export async function buildProjectBackupZipBlob(backupPayload: {
  exported_at: string;
  empresa_id: number;
  mode: string;
  snapshot: unknown;
}): Promise<Blob> {
  const zip = new JSZip();

  for (const file of archivedFiles) {
    if (file.encoding === 'base64') {
      zip.file(file.path, file.content, { base64: true });
    } else {
      zip.file(file.path, file.content);
    }
  }

  zip.file('RESPALDO_DATOS_BARFLOW.json', JSON.stringify(backupPayload, null, 2));
  zip.file(
    'LEEME_RESPALDO_PC.txt',
    buildBackupReadmeText(backupPayload.mode, backupPayload.exported_at)
  );

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
