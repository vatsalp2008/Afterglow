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

export const RibbonIcon = () => (
  <Icon>
    <path d="M3 13.5c2.5-6 5-6 7-1.5s4.5 4.5 7-1.5" />
    <path d="M3 8.5c2.5-6 5-6 7-1.5s4.5 4.5 7-1.5" opacity="0.55" />
  </Icon>
);

export const InkIcon = () => (
  <Icon>
    <path d="M10 3c3 4 5 6.3 5 8.8a5 5 0 0 1-10 0C5 9.3 7 7 10 3z" />
  </Icon>
);

export const EraserIcon = () => (
  <Icon>
    <path d="M8.4 16.5 3.9 12a1.6 1.6 0 0 1 0-2.3l6.1-6.1a1.6 1.6 0 0 1 2.3 0l4.1 4.1a1.6 1.6 0 0 1 0 2.3l-6.8 6.5z" />
    <path d="M6.6 7.1l6.3 6.3M8.4 16.5h8.1" />
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

export const MoreIcon = () => (
  <Icon>
    <circle cx="5" cy="10" r="1.3" fill="currentColor" />
    <circle cx="10" cy="10" r="1.3" fill="currentColor" />
    <circle cx="15" cy="10" r="1.3" fill="currentColor" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7" />
    <path d="M8 8.1a2 2 0 1 1 2.9 1.8c-.6.3-.9.8-.9 1.4v.3" />
    <circle cx="10" cy="14" r="0.6" fill="currentColor" />
  </Icon>
);

export const KeepIcon = () => (
  <Icon>
    <path d="M5 10.5l3.2 3.2L15 7" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9" />
    <path d="M4 14.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Icon>
);

export const VectorIcon = () => (
  <Icon>
    <path d="M4.5 15.5C6 9 9 5.5 15.5 4.5" />
    <rect x="2.75" y="13.75" width="3.5" height="3.5" rx="0.6" />
    <rect x="13.75" y="2.75" width="3.5" height="3.5" rx="0.6" />
    <path d="M8 8.5 15.5 4.5" opacity="0.55" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M5.5 3h6l3.5 3.5V16a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M11.5 3v3.5H15" />
    <path d="M7 12.5c1.2-2.4 2.4-2.4 3 0s1.8 2.4 3 0" />
  </Icon>
);

export const OpenIcon = () => (
  <Icon>
    <path d="M10 13V4.5M6.5 8 10 4.5 13.5 8" />
    <path d="M4 14.5v1a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Icon>
);

export const SnapIcon = () => (
  <Icon>
    <path d="M3.5 12.5c1.2-3.6 2.6-1.4 3.8-4.6" opacity="0.55" />
    <circle cx="13" cy="7.5" r="3.5" />
    <rect x="9" y="12" width="7" height="5" rx="0.6" />
  </Icon>
);

export const RefineIcon = () => (
  <Icon>
    <path d="M3.5 15.5c2-1 3-4.5 5-4.5s2.5 2.5 4.5 2.5 2.5-4 3.5-5.5" opacity="0.5" />
    <path d="M13 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />
    <path d="M6 4.5l.45 1.05 1.05.45-1.05.45L6 7.5l-.45-1.05L4.5 6l1.05-.45z" />
  </Icon>
);
