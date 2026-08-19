import type { AntivirusPort, AntivirusVerdict } from "./evidence-media.types";

const EICAR_MARKER = Buffer.from(
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  "ascii",
);

export class FakeAntivirusAdapter implements AntivirusPort {
  async scan(bytes: Buffer): Promise<AntivirusVerdict> {
    return {
      clean: !bytes.includes(EICAR_MARKER),
      engine: "atgt-fake-eicar",
      engineVersion: "1",
    };
  }
}
