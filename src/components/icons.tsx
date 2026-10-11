import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export function ChatIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9 9 0 0 1-3.4-.7L4 21l1.6-4.4A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function SmileIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.2 4.2 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

export function ImageIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 21" />
    </svg>
  );
}

export function PaperclipIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M21 11.5 12.6 20a5 5 0 0 1-7.1-7.1l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />
    </svg>
  );
}

export function SendIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M4.5 12 20 4l-5 16-4.2-6.4L4.5 12Z" />
    </svg>
  );
}

export function UsersIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  );
}

export function HashIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M9 4 7.5 20M16.5 4 15 20M4 9h16M3 15h16" />
    </svg>
  );
}

export function CloseIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function LoginIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20H14" />
      <path d="M10 8l4 4-4 4M14 12H4" />
    </svg>
  );
}

export function LogoutIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
      <path d="m16 8-4 4 4 4M12 12h8" />
    </svg>
  );
}

export function FileIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function DownloadIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
    </svg>
  );
}

export function PlusIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function AlertIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M10.3 4.3 2.8 17.2A1.9 1.9 0 0 0 4.5 20h15a1.9 1.9 0 0 0 1.7-2.8L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function ArrowDownIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function RefreshIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 4v4.5h4.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </svg>
  );
}

export function SpinnerIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function LockIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function GearIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function MicIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export function StopIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PhoneIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M6.6 3.5h2.2l1.5 3.7-1.9 1.3a11.5 11.5 0 0 0 5.1 5.1l1.3-1.9 3.7 1.5v2.2a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

export function PhoneOffIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M10.7 6.6 9.6 4.4H7.4a2 2 0 0 0-2 2.2c.2 1.6.7 3.1 1.4 4.5" />
      <path d="M13.3 17.4a15.6 15.6 0 0 1-4.6-1.4" />
      <path d="m14.9 12.4 1.3-1.9 3.7 1.5v2.2a2 2 0 0 1-2.2 2 15.4 15.4 0 0 1-3-.5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function TrashIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...rest}>
      <path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" />
      <path d="M6.5 7l.8 12.1A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

export function DotIcon({ className = "h-5 w-5", ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}
