"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { getUser, roleHome } from "@/lib/session";
import { PageLoader } from "@/components/loaders";
import { Landing } from "@/components/landing/Landing";

/** Signed-in staff go straight to their portal; everyone else sees the front page. */
export default function IndexPage() {
  const router = useRouter();
  const [visitor, setVisitor] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user) router.replace(roleHome(user.role));
    else setVisitor(true);
  }, [router]);

  if (visitor) return <Landing />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
      <PageLoader />
    </div>
  );
}
