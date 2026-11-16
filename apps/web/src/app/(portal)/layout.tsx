"use client";

import { usePathname } from "next/navigation";
import { ConsoleShell, RoleGate } from "@/components/console/ConsoleShell";
import type { SessionUser } from "@elimuar/shared";

const PLATFORM_ONLY: SessionUser["role"][] = ["platform_admin"];
const SCHOOL_STAFF: SessionUser["role"][] = ["school_admin", "academic_master", "secretary", "platform_admin"];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const allowed = pathname.startsWith("/admin") ? PLATFORM_ONLY : SCHOOL_STAFF;

  return (
    <RoleGate allowed={allowed}>
      <ConsoleShell>{children}</ConsoleShell>
    </RoleGate>
  );
}
