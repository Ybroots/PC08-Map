import type { QueryExecutor } from "../../platform/database";
import { hashUploadCapability } from "./evidence-capability";

interface AttachmentRow {
  attached_now: boolean;
}

export interface AttachReadyEvidenceInput {
  evidenceId: string;
  reportId: string;
  areaId: string;
  uploadCapability: string;
}

/** Public application boundary used by owning modules inside their transaction. */
export class EvidenceAttachmentService {
  async attachReadyToReport(
    client: QueryExecutor,
    input: AttachReadyEvidenceInput,
  ): Promise<{ attachedNow: boolean } | null> {
    const result = await client.query<AttachmentRow>(
      `SELECT attached_now
         FROM evidence.attach_ready_to_report($1,$2,$3,$4::char(64))`,
      [
        input.evidenceId,
        input.reportId,
        input.areaId,
        hashUploadCapability(input.uploadCapability),
      ],
    );
    const row = result.rows[0];
    return row ? { attachedNow: row.attached_now } : null;
  }
}
