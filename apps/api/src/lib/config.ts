
interface Problem {
  key: string;
  why: string;
}

const DEV_SECRET_HINTS = ["change-me", "dev-access-secret", "dev-refresh-secret", "secret"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"];

function looksLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.includes(host);
  } catch {
    return true;
  }
}

export function productionConfigProblems(): Problem[] {
  if (process.env.NODE_ENV !== "production") return [];

  const problems: Problem[] = [];

  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = process.env[key] ?? "";
    if (value.length < 32 || DEV_SECRET_HINTS.some((hint) => value.toLowerCase().includes(hint))) {
      problems.push({ key, why: "set it to a fresh random string of at least 32 characters" });
    }
  }

  for (const key of ["PUBLIC_API_URL", "PORTAL_URL"]) {
    const value = process.env[key] ?? "";
    if (!value || looksLocal(value)) {
      problems.push({ key, why: "point it at the address the internet will actually reach" });
    }
  }

  const from = (process.env.MAIL_FROM_ADDRESS ?? "").trim();
  if (process.env.RESEND_API_KEY && (from.length === 0 || /@resend\.dev>?$/i.test(from))) {
    problems.push({
      key: "MAIL_FROM_ADDRESS",
      why: "set it to an address on a domain verified in your Resend account; @resend.dev only delivers to you",
    });
  }

  return problems;
}

export function assertProductionConfig(): void {
  const problems = productionConfigProblems();

  if (problems.length > 0) {
    const lines = problems.map((problem) => `  · ${problem.key}: ${problem.why}`).join("\n");
    throw new Error(`Refusing to start in production with development configuration:\n${lines}`);
  }

  if (process.env.NODE_ENV === "production") {
    const missing = [
      ["RESEND_API_KEY", process.env.RESEND_API_KEY],
      ["SMS_PROVIDER_URL", process.env.SMS_PROVIDER_URL],
      ["SMS_PROVIDER_KEY", process.env.SMS_PROVIDER_KEY],
    ].filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      console.warn(
        `[config] email/SMS delivery is not configured (${missing.join(", ")}). ` +
          "Messages are queued in the outbox and can be flushed later from the console."
      );
    }
  }
}
