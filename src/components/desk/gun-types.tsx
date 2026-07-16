/** Visual gun-type picks for guided identify (Desk maps these to evaluate categories). */

export type GunVisualType =
  | "pistol"
  | "revolver"
  | "pcc"
  | "tactical_rifle"
  | "shotgun"
  | "rifle";

export interface GunTypeOption {
  id: GunVisualType;
  label: string;
  /** Desk evaluate category */
  category: "handgun" | "rifle" | "shotgun";
  /** Hint sent to Gemini */
  gunTypeHint: string;
}

export const GUN_TYPE_OPTIONS: GunTypeOption[] = [
  { id: "pistol", label: "Pistol", category: "handgun", gunTypeHint: "semi-auto pistol handgun" },
  { id: "revolver", label: "Revolver", category: "handgun", gunTypeHint: "revolver handgun" },
  { id: "pcc", label: "PCC", category: "rifle", gunTypeHint: "pistol caliber carbine" },
  {
    id: "tactical_rifle",
    label: "Tactical rifle",
    category: "rifle",
    gunTypeHint: "AR-style or tactical rifle",
  },
  { id: "shotgun", label: "Shotgun", category: "shotgun", gunTypeHint: "shotgun" },
  { id: "rifle", label: "Rifle", category: "rifle", gunTypeHint: "bolt or hunting rifle" },
];

export function GunSilhouette({ type, className = "" }: { type: GunVisualType; className?: string }) {
  const common = "fill-desk-text";
  switch (type) {
    case "pistol":
      return (
        <svg viewBox="0 0 120 64" className={className} aria-hidden>
          <path
            className={common}
            d="M18 38h52l6-14h10l4 8h8v6H78l-4 12H40c-2 6-8 10-16 10-10 0-16-6-16-14 0-4 2-8 6-8z"
          />
        </svg>
      );
    case "revolver":
      return (
        <svg viewBox="0 0 120 64" className={className} aria-hidden>
          <path
            className={common}
            d="M14 40c0-8 6-14 14-14h8l4-10h36l6 10h12v8H78l-2 8H42c0 8-6 14-14 14s-14-6-14-14zm20-6a8 8 0 1 0 0.1 0z"
          />
        </svg>
      );
    case "pcc":
      return (
        <svg viewBox="0 0 140 48" className={className} aria-hidden>
          <path
            className={common}
            d="M8 28h18l4-8h22l6 8h40l8-4h16v8H96l-4 8H52l-6 6H28c-6 0-12-4-14-10H8z"
          />
        </svg>
      );
    case "tactical_rifle":
      return (
        <svg viewBox="0 0 160 48" className={className} aria-hidden>
          <path
            className={common}
            d="M4 30h20l3-6h30l4 6h50l10-6h22v6h-18l-4 8H60l-6 6H28c-8 0-14-4-18-10H4zm40-14h36v4H44z"
          />
        </svg>
      );
    case "shotgun":
      return (
        <svg viewBox="0 0 160 48" className={className} aria-hidden>
          <path
            className={common}
            d="M6 28h24l2-4h70l20-2h20v6H120l-6 8H48l-4 6H22c-6 0-12-4-14-10H6z"
          />
        </svg>
      );
    case "rifle":
      return (
        <svg viewBox="0 0 160 48" className={className} aria-hidden>
          <path
            className={common}
            d="M4 30h18l4-8h28l6 8h58l14-4h16v6h-14l-4 8H58l-8 6H26c-8 0-14-4-18-10H4zm36-16h40l2 4H42z"
          />
        </svg>
      );
  }
}

export interface CaptureStep {
  id: string;
  title: string;
  hint: string;
}

export const CAPTURE_STEPS: CaptureStep[] = [
  { id: "serial", title: "Serial number", hint: "Close-up of the serial number" },
  { id: "left", title: "Left side", hint: "Full left profile of the firearm" },
  { id: "right", title: "Right side", hint: "Full right profile of the firearm" },
  { id: "markings", title: "Receiver markings", hint: "Make, model, and roll marks" },
  { id: "muzzle", title: "Muzzle / barrel", hint: "Front end and barrel details" },
  { id: "overall", title: "Overall", hint: "Whole firearm in frame" },
];
