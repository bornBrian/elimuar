import "dotenv/config";
import { ne, sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { insertManyReturning, insertReturning } from "./helpers.js";
import {
  auditEvents,
  classSubjects,
  classes,
  districts,
  gradeLevels,
  memberships,
  regions,
  schools,
  studentEnrollments,
  studentSubjects,
  subjects,
  teacherAssignments,
  users,
} from "./schema.js";
import { CORE_SUBJECTS, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECTS } from "@elimuar/shared";
import { hashPassword } from "../lib/password.js";

function requireSetting(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `${name} is not set. Account identities and secrets are read from the environment, never from the source — add it to apps/api/.env (copy .env.example).`
    );
    process.exit(1);
  }
  return value as string;
}

const STAFF_PASSWORD = requireSetting("SEED_STAFF_PASSWORD");
const STUDENT_PIN = requireSetting("SEED_STUDENT_PIN");
const ADMIN_EMAIL = requireSetting("SEED_ADMIN_EMAIL");
const HEAD_EMAIL = requireSetting("SEED_HEAD_EMAIL");
const ACADEMIC_EMAIL = requireSetting("SEED_ACADEMIC_EMAIL");
const SECRETARY_EMAIL = requireSetting("SEED_SECRETARY_EMAIL");
const TEACHER_EMAIL = requireSetting("SEED_TEACHER_EMAIL");
const UNCLAIMED_EMAIL = requireSetting("SEED_UNCLAIMED_TEACHER_EMAIL");

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
  console.error(
    [
      "Refusing to seed a production database.",
      "",
      "The seed deletes every row before it writes, and creates accounts with",
      "well-known credentials. Set SEED_ALLOW_PRODUCTION=true only if this really",
      "is a demonstration environment.",
    ].join("\n")
  );
  process.exit(1);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260910);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

const FIRST_NAMES = [
  "Amina", "Baraka", "Catherine", "Daudi", "Esther", "Faraja", "Grace", "Hamisi", "Irene", "Juma",
  "Khadija", "Lucas", "Maria", "Neema", "Omary", "Pendo", "Rehema", "Salma", "Tumaini", "Upendo",
  "Vumilia", "Wema", "Yusuf", "Zawadi", "Ali", "Bakari", "Fatuma", "Gerald", "Halima", "Ibrahim",
  "Jasmin", "Kelvin", "Lulu", "Mussa", "Nasra", "Oscar", "Paulina", "Rajabu", "Saida", "Tatu",
  "Farida", "Godfrey", "Hadija", "Issa", "Janeth", "Kenneth", "Latifa", "Mwajuma",
];
const LAST_NAMES = [
  "Mwakasege", "Kimaro", "Nyambura", "Mwinyi", "Shabani", "Mkumbo", "Materu", "Nyerere", "Kileo",
  "Msuya", "Mbwana", "Chacha", "Magesa", "Lema", "Ndosi", "Rwegasira", "Kessy", "Mollel",
];

async function main() {
  console.log("Resetting demo data…");
  // Everything about people and teaching; AR activities and their lessons are
  // kept (they are installed by `npm run ar-activities:seed`).
  const resetOrder = [
    "ar_activity_runs", "ar_activity_states", "lesson_assignments", "notifications",
    "student_subjects", "class_subjects", "teacher_assignments", "student_enrollments", "classes",
    "subjects", "grade_levels",
    "audit_events", "password_reset_codes", "refresh_tokens", "memberships", "users",
    "schools", "districts", "regions",
  ];
  await db.transaction(async (tx) => {
    await tx.execute(sql`set foreign_key_checks = 0`);
    for (const table of resetOrder) await tx.execute(sql.raw(`truncate table \`${table}\``));
    await tx.execute(sql`set foreign_key_checks = 1`);
  });

  const geography: Array<[string, string, string[]]> = [
    ["Arusha", "ARU", ["Arusha City", "Arusha Rural", "Meru", "Monduli", "Karatu", "Ngorongoro", "Longido"]],
    ["Dar es Salaam", "DSM", ["Ilala", "Kinondoni", "Ubungo", "Temeke", "Kigamboni"]],
    ["Dodoma", "DOD", ["Dodoma City", "Bahi", "Chamwino", "Chemba", "Kondoa", "Kongwa", "Mpwapwa"]],
    ["Geita", "GET", ["Geita", "Bukombe", "Chato", "Mbogwe", "Nyang'hwale"]],
    ["Iringa", "IRI", ["Iringa Urban", "Iringa Rural", "Kilolo", "Mufindi", "Mafinga"]],
    ["Kagera", "KAG", ["Bukoba Urban", "Bukoba Rural", "Muleba", "Karagwe", "Ngara", "Biharamulo", "Missenyi", "Kyerwa"]],
    ["Katavi", "KAT", ["Mpanda", "Mlele", "Tanganyika"]],
    ["Kigoma", "KIG", ["Kigoma Urban", "Kigoma Rural", "Kasulu", "Kibondo", "Uvinza", "Buhigwe", "Kakonko"]],
    ["Kilimanjaro", "KIL", ["Moshi Urban", "Moshi Rural", "Hai", "Rombo", "Same", "Siha", "Mwanga"]],
    ["Lindi", "LIN", ["Lindi Urban", "Lindi Rural", "Kilwa", "Ruangwa", "Nachingwea", "Liwale"]],
    ["Manyara", "MAN", ["Babati", "Hanang", "Kiteto", "Mbulu", "Simanjiro"]],
    ["Mara", "MAR", ["Musoma Urban", "Musoma Rural", "Bunda", "Serengeti", "Tarime", "Rorya", "Butiama"]],
    ["Mbeya", "MBE", ["Mbeya City", "Mbeya Rural", "Chunya", "Mbarali", "Rungwe", "Kyela", "Busokelo", "Mbozi"]],
    ["Morogoro", "MOR", ["Morogoro Urban", "Morogoro Rural", "Kilosa", "Kilombero", "Ulanga", "Gairo", "Mvomero"]],
    ["Mtwara", "MTW", ["Mtwara Urban", "Mtwara Rural", "Masasi", "Masasi Town", "Newala", "Tandahimba", "Nanyumbu"]],
    ["Mwanza", "MWA", ["Nyamagana", "Ilemela", "Sengerema", "Misungwi", "Kwimba", "Magu", "Ukerewe", "Buchosa"]],
    ["Njombe", "NJO", ["Njombe Urban", "Njombe Rural", "Wanging'ombe", "Makete", "Ludewa"]],
    ["Pwani", "PWA", ["Bagamoyo", "Kibaha Urban", "Kibaha Rural", "Kisarawe", "Mkuranga", "Rufiji", "Mafia", "Chalinze"]],
    ["Rukwa", "RUK", ["Sumbawanga Urban", "Sumbawanga Rural", "Nkasi", "Kalambo"]],
    ["Ruvuma", "RUV", ["Songea Urban", "Songea Rural", "Mbinga", "Nyasa", "Tunduru", "Namtumbo"]],
    ["Shinyanga", "SHI", ["Shinyanga Urban", "Shinyanga Rural", "Kahama", "Kishapu", "Ushetu", "Msalala"]],
    ["Simiyu", "SIM", ["Bariadi", "Busega", "Itilima", "Maswa", "Meatu"]],
    ["Singida", "SIN", ["Singida Urban", "Singida Rural", "Manyoni", "Iramba", "Ikungi", "Mkalama"]],
    ["Songwe", "SON", ["Ileje", "Mbozi", "Momba", "Songwe", "Tunduma"]],
    ["Tabora", "TAB", ["Tabora Urban", "Tabora Rural", "Nzega", "Igunga", "Uyui", "Urambo", "Sikonge", "Kaliua"]],
    ["Tanga", "TAN", ["Tanga City", "Muheza", "Korogwe", "Lushoto", "Handeni", "Kilindi", "Pangani", "Mkinga", "Bumbuli"]],
    ["Kaskazini Pemba", "KPN", ["Micheweni", "Wete"]],
    ["Kusini Pemba", "KSP", ["Chake Chake", "Mkoani"]],
    ["Kaskazini Unguja", "KUN", ["Kaskazini A", "Kaskazini B"]],
    ["Kusini Unguja", "KSU", ["Kati", "Kusini"]],
    ["Mjini Magharibi", "MMG", ["Mjini", "Magharibi"]],
  ];

  const regionRows = await insertManyReturning(
    regions,
    geography.map(([name, code]) => ({ name, code }))
  );

  const districtRows = await insertManyReturning(
    districts,
    geography.flatMap(([, , names], index) => names.map((name) => ({ regionId: regionRows[index].id, name })))
  );

  const districtId = (name: string): string => {
    const row = districtRows.find((district) => district.name === name);
    if (!row) throw new Error(`Seed error: no district called "${name}"`);
    return row.id;
  };

  const schoolRows = await insertManyReturning(schools, [
    { districtId: districtId("Mtwara Urban"), name: "Mtwara Technical Secondary School", code: "S0206", level: "secondary" as const, status: "active" },
    { districtId: districtId("Mtwara Urban"), name: "Mtwara Girls Secondary School", code: "S0211", level: "secondary" as const, status: "active" },
    { districtId: districtId("Masasi"), name: "Masasi High School", code: "S0314", level: "secondary" as const, status: "active" },
    { districtId: districtId("Kinondoni"), name: "Kinondoni Secondary School", code: "S0102", level: "secondary" as const, status: "pending" },
    { districtId: districtId("Mtwara Urban"), name: "Mtwara Technical Primary School", code: "PS0206", level: "primary" as const, status: "active" },
  ]);

  const demo = schoolRows[0];

  const staffPassword = hashPassword(STAFF_PASSWORD);

  const platformAdmin = await insertReturning(users, {
    email: ADMIN_EMAIL,
    passwordHash: staffPassword,
    firstName: "Neema",
    lastName: "Kessy",
  });

  await db.insert(memberships).values([{ userId: platformAdmin.id, role: "platform_admin" }]);

  const headRows = await insertManyReturning(
    users,
    schoolRows.map((s, i) => ({
      email: i === 0 ? HEAD_EMAIL : `head${i + 1}@${s.code.toLowerCase()}.elimuar.tz`,
      passwordHash: staffPassword,
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      phone: `+2557${between(10, 89)}${between(100000, 999999)}`,
    }))
  );

  await db.insert(memberships).values(headRows.map((h, i) => ({ userId: h.id, schoolId: schoolRows[i].id, role: "school_admin" as const })));

  const delegateRows = await insertManyReturning(
    users,
    [
      { email: ACADEMIC_EMAIL, passwordHash: staffPassword, firstName: "Baraka", lastName: "Materu", phone: `+2557${between(10, 89)}${between(100000, 999999)}` },
      { email: SECRETARY_EMAIL, passwordHash: staffPassword, firstName: "Salma", lastName: "Kileo", phone: `+2557${between(10, 89)}${between(100000, 999999)}` },
    ]
  );
  await db.insert(memberships).values([
    { userId: delegateRows[0].id, schoolId: demo.id, role: "academic_master" as const },
    { userId: delegateRows[1].id, schoolId: demo.id, role: "secretary" as const },
  ]);

  const teacherSeed = [
    { school: 0, first: "John", last: "Mwalimu" },
    { school: 0, first: "Asha", last: "Mkumbo" },
    { school: 0, first: "Peter", last: "Magesa" },
    { school: 1, first: "Rehema", last: "Ndosi" },
    { school: 2, first: "Samuel", last: "Kileo" },
  ];
  const teacherRows = await insertManyReturning(
    users,
    teacherSeed.map((t, i) => ({
      email: i === 0 ? TEACHER_EMAIL : `teacher${i + 1}@${schoolRows[t.school].code.toLowerCase()}.elimuar.tz`,
      passwordHash: staffPassword,
      firstName: t.first,
      lastName: t.last,
      phone: `+2557${between(10, 89)}${between(100000, 999999)}`,
    }))
  );

  await db.insert(memberships).values(
    teacherRows.map((t, i) => ({ userId: t.id, schoolId: schoolRows[teacherSeed[i].school].id, role: "teacher" as const }))
  );

  const [unclaimed] = await insertManyReturning(
    users,
    [{
      email: UNCLAIMED_EMAIL,
      passwordHash: "",
      firstName: "Neema",
      lastName: "Mushi",
      phone: "+255700111222",
    }]
  );
  await db.insert(memberships).values({ userId: unclaimed.id, schoolId: schoolRows[0].id, role: "teacher" as const });
  console.log(`  Unclaimed (register as) ${UNCLAIMED_EMAIL} — name Neema Mushi, phone +255700111222`);

  const formRows = await insertManyReturning(
    gradeLevels,
    DEFAULT_GRADE_LEVELS.map((name, index) => ({ name, position: index + 1 }))
  );
  await insertManyReturning(
    subjects,
    DEFAULT_SUBJECTS.map((name) => ({ name }))
  );

  const classSeed: Array<{ schoolId: string; name: string; gradeLevel: string; stream: string }> = [];
  for (const school of schoolRows.slice(0, 3)) {
    for (const grade of formRows.map((row) => row.name)) {
      classSeed.push({ schoolId: school.id, name: grade, gradeLevel: grade, stream: "A" });
    }
  }
  const classRows = await insertManyReturning(
    classes,
    classSeed.map((c) => ({
      ...c,
      academicYear: "2026",
      status: "active" as const,
    }))
  );

  // Every class studies the core subjects; Computer Science is optional.
  const classSubjectRows = await insertManyReturning(
    classSubjects,
    classRows.flatMap((c) => [
      ...CORE_SUBJECTS.map((subject) => ({ schoolId: c.schoolId, classId: c.id, subject, allStudents: true })),
      { schoolId: c.schoolId, classId: c.id, subject: "Computer Science", allStudents: false },
    ])
  );

  // Who teaches what at the demonstration school (the rest are left for the head to allocate).
  const teaches: Array<[number, string, string[]]> = [
    [0, "Biology", ["Form 1", "Form 2"]],
    [0, "Computer Science", ["Form 1", "Form 2", "Form 3", "Form 4"]],
    [1, "Biology", ["Form 3", "Form 4"]],
    [1, "Chemistry", ["Form 1", "Form 2", "Form 3", "Form 4"]],
    [2, "Physics", ["Form 1", "Form 2", "Form 3", "Form 4"]],
    [2, "Basic Mathematics", ["Form 1", "Form 2", "Form 3", "Form 4"]],
  ];
  await db.insert(teacherAssignments).values(
    teaches.flatMap(([teacher, subject, forms]) =>
      classRows
        .filter((c) => c.schoolId === demo.id && forms.includes(c.gradeLevel))
        .map((c) => ({ teacherId: teacherRows[teacher].id, classId: c.id, subject }))
    )
  );

  const demoClasses = classRows.filter((c) => c.schoolId === demo.id);
  const studentValues: Array<typeof users.$inferInsert> = [];
  const enrollmentPlan: Array<{ index: number; classId: string; identifier: string }> = [];

  let counter = 1;
  demoClasses.forEach((cls, classIndex) => {
    const size = classIndex === 0 ? 14 : classIndex === 1 ? 12 : classIndex === 2 ? 11 : 9;
    for (let i = 0; i < size; i += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const identifier = `S0206/${String(counter).padStart(4, "0")}/2026`;
      studentValues.push({
        // Learners sign in with their admission number; this address is internal only.
        email: `${identifier.replace(/\//g, "-").toLowerCase()}@learners.elimuar.tz`,
        passwordHash: hashPassword(STUDENT_PIN),
        firstName: first,
        lastName: last,
        phone: null,
      });
      enrollmentPlan.push({ index: studentValues.length - 1, classId: cls.id, identifier });
      counter += 1;
    }
  });

  const studentRows = await insertManyReturning(users, studentValues);

  await db.insert(memberships).values(studentRows.map((s) => ({ userId: s.id, schoolId: demo.id, role: "student" as const })));
  await db.insert(studentEnrollments).values(
    enrollmentPlan.map((p) => ({
      studentId: studentRows[p.index].id,
      classId: p.classId,
      schoolId: demo.id,
      studentIdentifier: p.identifier,
    }))
  );

  // About half of each class takes the optional Computer Science.
  const optional = classSubjectRows.filter((cs) => cs.subject === "Computer Science" && cs.schoolId === demo.id);
  const takers = enrollmentPlan
    .map((p, i) => ({ studentId: studentRows[p.index].id, classId: p.classId, takes: i % 2 === 0 }))
    .filter((p) => p.takes);
  await db.insert(studentSubjects).values(
    takers
      .map((p) => ({ classSubjectId: optional.find((cs) => cs.classId === p.classId)?.id, studentId: p.studentId }))
      .filter((row): row is { classSubjectId: string; studentId: string } => !!row.classSubjectId)
  );

  await db.insert(auditEvents).values([
    { actorId: platformAdmin.id, action: "school.status", entity: "school", entityId: demo.id, metadata: { name: demo.name, from: "pending", to: "active" }, ip: "41.59.84.12" },
    { actorId: platformAdmin.id, action: "region.create", entity: "region", entityId: regionRows[0].id, metadata: { name: regionRows[0].name }, ip: "41.59.84.12" },
    { actorId: platformAdmin.id, action: "district.create", entity: "district", entityId: districtRows[0].id, metadata: { name: districtRows[0].name, region: regionRows[0].name }, ip: "41.59.84.12" },
    { actorId: headRows[0].id, schoolId: demo.id, action: "roster.import", entity: "enrollment", metadata: { created: studentRows.length }, ip: "196.43.150.7" },
    { actorId: headRows[0].id, schoolId: demo.id, action: "membership.invite", entity: "membership", metadata: { role: "teacher" }, ip: "196.43.150.7" },
  ]);

  await db
    .update(users)
    .set({ claimedAt: new Date() })
    .where(ne(users.email, UNCLAIMED_EMAIL));

  console.log("Seed complete.");
  console.log(`  regions ${regionRows.length} · districts ${districtRows.length} · schools ${schoolRows.length}`);
  console.log(`  forms ${formRows.length} · subjects ${DEFAULT_SUBJECTS.length} (${CORE_SUBJECTS.length} taken by everyone)`);
  console.log(`  classes ${classRows.length} · students ${studentRows.length} (${demo.name})`);
  console.log("  AR activities: install them with `npm run db:seed:ar-activities`");
  console.log("");
  console.log("Accounts:");
  console.log(`  Platform admin   ${ADMIN_EMAIL} / ${STAFF_PASSWORD}`);
  console.log(`  School head      ${HEAD_EMAIL} / ${STAFF_PASSWORD}`);
  console.log(`  Academic master  ${ACADEMIC_EMAIL} / ${STAFF_PASSWORD}`);
  console.log(`  Secretary        ${SECRETARY_EMAIL} / ${STAFF_PASSWORD}`);
  console.log(`  Teacher          ${TEACHER_EMAIL} / ${STAFF_PASSWORD} (mobile app)`);
  console.log(`  Student (mobile) ${enrollmentPlan[0].identifier} / ${STUDENT_PIN}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
