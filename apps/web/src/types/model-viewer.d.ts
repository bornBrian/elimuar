import type * as React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        ar?: boolean | "";
        "ar-modes"?: string;
        "ar-scale"?: string;
        "ar-placement"?: string;
        "camera-controls"?: boolean | "";
        "disable-tap"?: boolean | "";
        "disable-zoom"?: boolean | "";
        "disable-pan"?: boolean | "";
        "interaction-policy"?: string;
        "auto-rotate"?: boolean | "";
        "auto-rotate-delay"?: string | number;
        "rotation-per-second"?: string;
        "touch-action"?: string;
        "interaction-prompt"?: string;
        "animation-name"?: string;
        autoplay?: boolean | "";
        "camera-orbit"?: string;
        "camera-target"?: string;
        "field-of-view"?: string;
        "min-field-of-view"?: string;
        "max-field-of-view"?: string;
        "min-camera-orbit"?: string;
        "max-camera-orbit"?: string;
        exposure?: string | number;
        "shadow-intensity"?: string | number;
        "shadow-softness"?: string | number;
        "environment-image"?: string;
        "skybox-image"?: string;
        "tone-mapping"?: string;
        loading?: "auto" | "lazy" | "eager";
        reveal?: "auto" | "manual";
        ref?: React.Ref<HTMLElement | null>;
        style?: React.CSSProperties;
        className?: string;
        children?: React.ReactNode;
      };
    }
  }
}
