import sharp from "sharp";
import { SharpEvidenceDerivativeAdapter } from "./sharp-evidence-derivative.adapter";

describe("SharpEvidenceDerivativeAdapter", () => {
  it("auto-orients, strips EXIF and emits a watermarked PNG", async () => {
    const source = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 3,
        background: { r: 38, g: 92, b: 132 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);

    const derivative = await new SharpEvidenceDerivativeAdapter().create({
      evidenceId: "00000000-0000-4000-8000-000000000111",
      bytes: source,
      mime: "image/jpeg",
    });
    const metadata = await sharp(derivative).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 64, height: 96 });
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();

    const bottomPixel = await sharp(derivative)
      .extract({ left: 2, top: 90, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...bottomPixel.subarray(0, 3)]).not.toEqual([38, 92, 132]);
  });

  it("fails closed on malformed image content", async () => {
    await expect(
      new SharpEvidenceDerivativeAdapter().create({
        evidenceId: "00000000-0000-4000-8000-000000000111",
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        mime: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA", retryable: false });
  });
});
