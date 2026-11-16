
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME = { jpeg: "image/jpeg", png: "image/png" } as const;
export type ImageKind = keyof typeof AVATAR_MIME;

export function detectImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => bytes[index] === byte)) return "png";
  return null;
}

function cleanJpeg(bytes: Buffer): Buffer {
  const drop = new Set([0xe1, 0xed, 0xfe]);
  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];

    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }
    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    const size = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + size;
    if (size < 2 || end > bytes.length) break;

    if (!drop.has(marker)) parts.push(bytes.subarray(offset, end));
    offset = end;
  }

  return parts.length > 1 ? Buffer.concat(parts) : bytes;
}

function cleanPng(bytes: Buffer): Buffer {
  const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
  const parts: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > bytes.length) break;

    if (!drop.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;

    if (type === "IEND") break;
  }

  return parts.length > 1 ? Buffer.concat(parts) : bytes;
}

export type SanitizeResult =
  | { ok: true; kind: ImageKind; bytes: Buffer; mime: string }
  | { ok: false; reason: string };

function looksComplete(bytes: Buffer, kind: ImageKind): boolean {
  if (kind === "png") {
    const names = ["IHDR", "IDAT", "IEND"];
    const present = new Set<string>();
    for (let offset = 8; offset + 8 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      present.add(type);
      offset += 12 + length;
    }
    return names.every((name) => present.has(name));
  }

  let hasScan = false;
  for (let offset = 2; offset + 1 < bytes.length; offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === 0xda) {
      hasScan = true;
      break;
    }
  }
  return hasScan;
}

export function sanitizeAvatar(bytes: Buffer): SanitizeResult {
  if (bytes.length === 0) return { ok: false, reason: "That file is empty." };
  if (bytes.length > AVATAR_MAX_BYTES) {
    return { ok: false, reason: `Pictures have to be under ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.` };
  }

  const kind = detectImageKind(bytes);
  if (!kind) return { ok: false, reason: "Only JPG and PNG pictures are accepted." };

  const cleaned = kind === "jpeg" ? cleanJpeg(bytes) : cleanPng(bytes);
  if (!looksComplete(cleaned, kind)) return { ok: false, reason: "That picture is damaged or incomplete." };

  return { ok: true, kind, bytes: cleaned, mime: AVATAR_MIME[kind] };
}
