import { StreamableFile } from '@nestjs/common';
import type { ExportFile } from './export.types';

/** Resposta de download com `Content-Disposition: attachment` e nome em UTF-8. */
export function toStreamableFile(file: ExportFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: file.contentType,
    length: file.buffer.length,
    disposition: `attachment; filename="${asciiFilename(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  });
}

function asciiFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replaceAll(/[^\x20-\x7E]/g, '')
    .replaceAll('"', '');
}
