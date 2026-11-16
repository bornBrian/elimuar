"use client";

import { useRef, useState } from "react";
import { ArrowCounterClockwise, UploadSimple } from "@phosphor-icons/react";
import { Btn, ConsolePage, Panel } from "@/components/console/kit";
import { BrandMark } from "@/components/BrandMark";
import { toast } from "@/components/toast";
import { resetBranding, uploadBranding, useBranding } from "@/lib/branding";

const ACCEPTED = ".svg,.png,.jpg,.jpeg,.webp";

export default function PlatformSettingsPage() {
  const branding = useBranding();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadBranding(file);
      toast.success("Platform logo updated.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not upload that logo.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function useBuiltIn() {
    setBusy(true);
    try {
      await resetBranding();
      toast.success("Back to the built-in mark.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not reset the mark.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Platform Settings" }]}
      title="Platform Settings"
      subtitle="Branding that applies to every school and every surface."
    >
      <Panel title="Platform logo" meta="Shown on the sign-in screen, the portal and this console.">
        <div className="flex flex-wrap items-center gap-5">
          <span className="shrink-0">
            <BrandMark size={72} />
          </span>

          <div className="min-w-[220px] flex-1">
            {branding.updatedAt ? (
              <p className="text-[13.5px] font-medium text-ink-800">
                A custom logo is in use.
                <span className="mt-0.5 block text-[12.5px] font-normal text-ink-500">
                  Last changed {new Date(branding.updatedAt).toLocaleString("en-GB")}
                </span>
              </p>
            ) : (
              <p className="text-[13.5px] font-medium text-ink-800">
                The built-in Tanzanian roundel is in use.
                <span className="mt-0.5 block text-[12.5px] font-normal text-ink-500">
                  Upload your own mark to replace it everywhere at once.
                </span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(event) => void pickLogo(event.target.files?.[0])}
              />
              <Btn variant="primary" loading={busy} onClick={() => fileInput.current?.click()}>
                <UploadSimple size={15} weight="bold" aria-hidden />
                Upload logo
              </Btn>
              {branding.logoUrl && (
                <Btn disabled={busy} onClick={() => void useBuiltIn()}>
                  <ArrowCounterClockwise size={15} weight="bold" aria-hidden />
                  Use the built-in mark
                </Btn>
              )}
            </div>
          </div>
        </div>
      </Panel>

    </ConsolePage>
  );
}
