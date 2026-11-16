import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  createSchoolSubjectRequestSchema,
  updateClassSubjectRequestSchema,
  type ClassSubject,
  type SchoolSubjectsResponse,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { newId } from "../db/helpers.js";
import {
  classSubjects,
  classes,
  memberships,
  studentEnrollments,
  studentSubjects,
  subjects,
  teacherAssignments,
  users,
} from "../db/schema.js";
import { recordAudit } from "../lib/audit.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { isPlatformStaff, requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

/** What each class studies (Classes & Subjects → Subjects). */

export const teachingRouter = Router();
teachingRouter.use(requireAuth);

const MANAGERS = ["school_admin", "academic_master", "platform_admin"] as const;

function ownSchool(req: AuthedRequest, schoolId: string) {
  const auth = req.auth!;
  if (!isPlatformStaff(auth.role) && auth.schoolId !== schoolId) throw HttpError.forbidden();
}

async function schoolSubjects(schoolId: string): Promise<SchoolSubjectsResponse> {
  const [rows, enrolled, chosen, teachers, catalogue] = await Promise.all([
    db
      .select({ cs: classSubjects, className: classes.name, gradeLevel: classes.gradeLevel })
      .from(classSubjects)
      .innerJoin(classes, eq(classSubjects.classId, classes.id))
      .where(and(eq(classSubjects.schoolId, schoolId), eq(classes.status, "active")))
      .orderBy(asc(classSubjects.subject), asc(classes.gradeLevel), asc(classes.name)),
    db
      .select({ classId: studentEnrollments.classId, studentId: studentEnrollments.studentId })
      .from(studentEnrollments)
      .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.status, "active"))),
    db
      .select({ classSubjectId: studentSubjects.classSubjectId, studentId: studentSubjects.studentId })
      .from(studentSubjects)
      .innerJoin(classSubjects, eq(studentSubjects.classSubjectId, classSubjects.id))
      .where(eq(classSubjects.schoolId, schoolId)),
    db
      .select({
        classId: teacherAssignments.classId,
        subject: teacherAssignments.subject,
        teacherId: teacherAssignments.teacherId,
        teacherName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      })
      .from(teacherAssignments)
      .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .where(eq(classes.schoolId, schoolId)),
    db.select({ name: subjects.name }).from(subjects).where(eq(subjects.status, "active")).orderBy(asc(subjects.name)),
  ]);

  const roll = new Map<string, string[]>();
  for (const e of enrolled) roll.set(e.classId, [...(roll.get(e.classId) ?? []), e.studentId]);
  const picked = new Map<string, string[]>();
  for (const c of chosen) picked.set(c.classSubjectId, [...(picked.get(c.classSubjectId) ?? []), c.studentId]);

  const bySubject = new Map<string, ClassSubject[]>();
  for (const r of rows) {
    const teacher = teachers.find((t) => t.classId === r.cs.classId && t.subject === r.cs.subject) ?? null;
    const classRoll = roll.get(r.cs.classId) ?? [];
    const takers = r.cs.allStudents ? classRoll : (picked.get(r.cs.id) ?? []).filter((id) => classRoll.includes(id));
    const entry: ClassSubject = {
      id: r.cs.id,
      classId: r.cs.classId,
      className: r.className,
      subject: r.cs.subject,
      allStudents: r.cs.allStudents,
      teacherId: teacher?.teacherId ?? null,
      teacherName: teacher?.teacherName ?? null,
      studentCount: takers.length,
      classSize: classRoll.length,
      studentIds: r.cs.allStudents ? [] : takers,
    };
    bySubject.set(r.cs.subject, [...(bySubject.get(r.cs.subject) ?? []), entry]);
  }

  return {
    subjects: [...bySubject.entries()].map(([name, list]) => ({
      name,
      classes: list,
      studentCount: list.reduce((n, c) => n + c.studentCount, 0),
      teacherNames: [...new Set(list.map((c) => c.teacherName).filter((n): n is string => !!n))].sort(),
    })),
    catalogue: catalogue.map((c) => c.name),
  };
}

teachingRouter.get(
  "/schools/:schoolId/subjects",
  asyncHandler(async (req: AuthedRequest, res) => {
    ownSchool(req, req.params.schoolId);
    sendData(res, await schoolSubjects(req.params.schoolId));
  })
);

teachingRouter.post(
  "/schools/:schoolId/subjects",
  requireRole(...MANAGERS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const schoolId = req.params.schoolId;
    ownSchool(req, schoolId);
    const body = parse(createSchoolSubjectRequestSchema, req.body);

    // A subject new to the platform joins the catalogue every school picks from.
    const [known] = await db.select().from(subjects).where(eq(subjects.name, body.subject)).limit(1);
    if (!known) await db.insert(subjects).values({ id: newId(), name: body.subject });
    else if (known.status !== "active") await db.update(subjects).set({ status: "active" }).where(eq(subjects.id, known.id));

    const own = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), inArray(classes.id, body.classIds)));
    if (own.length === 0) throw HttpError.badRequest("Choose classes at your school.");
    await db
      .insert(classSubjects)
      .values(own.map((c) => ({ id: newId(), schoolId, classId: c.id, subject: body.subject, allStudents: body.allStudents })))
      .onDuplicateKeyUpdate({ set: { allStudents: body.allStudents } });

    await recordAudit({
      actorId: req.auth!.userId,
      schoolId,
      action: "academic.subject.create",
      entity: "class_subject",
      metadata: { name: body.subject, classes: own.length },
      ip: req.ip,
    });
    sendData(res, await schoolSubjects(schoolId), 201);
  })
);

async function classSubjectInSchool(req: AuthedRequest) {
  const [row] = await db.select().from(classSubjects).where(eq(classSubjects.id, req.params.id)).limit(1);
  if (!row) throw HttpError.notFound("That subject is not taught in that class.");
  ownSchool(req, row.schoolId);
  return row;
}

teachingRouter.patch(
  "/class-subjects/:id",
  requireRole(...MANAGERS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await classSubjectInSchool(req);
    const body = parse(updateClassSubjectRequestSchema, req.body);

    if (body.teacherId !== undefined) {
      await db
        .delete(teacherAssignments)
        .where(and(eq(teacherAssignments.classId, row.classId), eq(teacherAssignments.subject, row.subject)));
      if (body.teacherId) {
        const [teacher] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, body.teacherId),
              eq(memberships.schoolId, row.schoolId),
              eq(memberships.role, "teacher"),
              eq(memberships.status, "active")
            )
          )
          .limit(1);
        if (!teacher) throw HttpError.badRequest("Choose a teacher at your school.");
        await db.insert(teacherAssignments).values({ id: newId(), teacherId: body.teacherId, classId: row.classId, subject: row.subject });
      }
    }

    if (body.allStudents !== undefined) {
      await db.update(classSubjects).set({ allStudents: body.allStudents }).where(eq(classSubjects.id, row.id));
    }
    if (body.studentIds !== undefined) {
      await db.delete(studentSubjects).where(eq(studentSubjects.classSubjectId, row.id));
      const inClass = body.studentIds.length
        ? await db
            .select({ studentId: studentEnrollments.studentId })
            .from(studentEnrollments)
            .where(
              and(
                eq(studentEnrollments.classId, row.classId),
                eq(studentEnrollments.status, "active"),
                inArray(studentEnrollments.studentId, body.studentIds)
              )
            )
        : [];
      if (inClass.length) {
        await db.insert(studentSubjects).values(inClass.map((s) => ({ id: newId(), classSubjectId: row.id, studentId: s.studentId })));
      }
    }

    await recordAudit({
      actorId: req.auth!.userId,
      schoolId: row.schoolId,
      action: "academic.class_subject",
      entity: "class_subject",
      entityId: row.id,
      metadata: { name: row.subject, teacherChanged: body.teacherId !== undefined, learnersChanged: body.studentIds !== undefined },
      ip: req.ip,
    });
    sendData(res, await schoolSubjects(row.schoolId));
  })
);

teachingRouter.delete(
  "/class-subjects/:id",
  requireRole(...MANAGERS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await classSubjectInSchool(req);
    await db
      .delete(teacherAssignments)
      .where(and(eq(teacherAssignments.classId, row.classId), eq(teacherAssignments.subject, row.subject)));
    await db.delete(classSubjects).where(eq(classSubjects.id, row.id));
    sendData(res, await schoolSubjects(row.schoolId));
  })
);
