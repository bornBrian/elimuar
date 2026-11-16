// The types and validation rules the API, the web portal and the scripts share,
// so a request the portal sends is checked by the same rule the API applies.
export * from "./envelope.js"; // { ok, data } / { ok: false, error } replies and error codes
export * from "./validate.js"; // names, emails, phones, admission numbers
export * from "./auth.js"; // roles, sign-in, sessions, passwords
export * from "./platform.js"; // platform admin console, branding, notifications
export * from "./org.js"; // regions, schools, classes, staff, students
export * from "./academic.js"; // forms, subjects, what each class studies
export * from "./arActivity.js"; // AR activities: catalogue, uploads, the phone's ledger
export * from "./activity.js"; // what the phone reports when an activity is played
export * from "./assignment.js"; // assignments and hand-ins
export * from "./reports.js"; // the head of school's overview and reports
