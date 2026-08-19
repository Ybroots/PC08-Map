import sharp from "sharp";
import {
  EvidenceMediaFailure,
  type EvidenceDerivativePort,
} from "./evidence-media.types";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character]!;
  });
}

export class SharpEvidenceDerivativeAdapter implements EvidenceDerivativePort {
  async create(input: {
    evidenceId: string;
    bytes: Buffer;
    mime: "image/jpeg" | "image/png";
  }): Promise<Buffer> {
    try {
      const source = sharp(input.bytes, { failOn: "error" }).rotate();
      const metadata = await source.metadata();
      if (!metadata.width || !metadata.height) {
        throw new EvidenceMediaFailure("UNSUPPORTED_MEDIA", false);
      }
      const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
      const width = swapsDimensions ? metadata.height : metadata.width;
      const height = swapsDimensions ? metadata.width : metadata.height;
      const fontSize = Math.max(12, Math.min(32, width / 18));
      const label = escapeXml(
        `ATGT INTERNAL · ${input.evidenceId.slice(0, 8).toUpperCase()}`,
      );
      const watermark = Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="${Math.max(0, height - fontSize * 2.2)}" width="100%" height="${fontSize * 2.2}" fill="#111827" fill-opacity="0.62"/>
          <text x="${Math.max(8, fontSize * 0.65)}" y="${height - fontSize * 0.65}" fill="#ffffff" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700">${label}</text>
        </svg>`,
      );
      return await source
        .composite([{ input: watermark, top: 0, left: 0 }])
        .png()
        .toBuffer();
    } catch (error) {
      if (error instanceof EvidenceMediaFailure) throw error;
      throw new EvidenceMediaFailure("UNSUPPORTED_MEDIA", false);
    }
  }
}
