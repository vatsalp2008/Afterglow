import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const NeonIcon = () => (
  <Icon>
    <path d="M3 13c2.5-7 5-7 7 0s4.5 7 7 0" />
  </Icon>
);

export const SparksIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="1.6" fill="currentColor" />
    <path d="M10 3v3M10 14v3M3 10h3M14 10h3M5 5l2 2M13 13l2 2M15 5l-2 2M7 13l-2 2" />
  </Icon>
);

export const InkIcon = () => (
  <Icon>
    <path d="M10 3c3 4 5 6.3 5 8.8a5 5 0 0 1-10 0C5 9.3 7 7 10 3z" />
  </Icon>
);

export const FadeIcon = () => (
  <Icon>
    <path d="M10 3a7 7 0 0 0 0 14" />
    <path d="M10 3a7 7 0 0 1 0 14" strokeDasharray="1.5 2.5" />
  </Icon>
);

export const FixIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7" />
    <circle cx="10" cy="10" r="2.5" fill="currentColor" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M7.5 5 4 8.5 7.5 12" />
    <path d="M4 8.5h8a4 4 0 0 1 0 8H9" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M12.5 5 16 8.5 12.5 12" />
    <path d="M16 8.5H8a4 4 0 0 0 0 8h3" />
  </Icon>
);

export const ClearIcon = () => (
  <Icon>
    <path d="M4.5 6h11M8 6V4h4v2M6 6l.8 10.5h6.4L14 6" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5 15.5 10 7 15.5z" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
  </Icon>
);

export const StillIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="14" height="11" rx="2" />
    <path d="m3.5 13.5 4-4 3 3 2-2 4 4" />
  </Icon>
);

export const RecordIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7" />
    <circle cx="10" cy="10" r="3" fill="currentColor" />
  </Icon>
);

export const StatsIcon = () => (
  <Icon>
    <path d="M5 15V10M10 15V5M15 15v-3" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Icon>
);
