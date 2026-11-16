import { db } from "../db/client.js";
import { auditEvents } from "../db/schema.js";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  schoolId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

function normaliseIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.replace(/^::ffff:/, "");
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorId: input.actorId ?? null,
      schoolId: input.schoolId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ip: normaliseIp(input.ip),
    });
  } catch (error) {
    console.error(`[audit] failed to record ${input.action}:`, error);
  }
}
