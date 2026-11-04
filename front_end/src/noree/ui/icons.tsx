import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const UndoIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>;
export const RedoIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></Icon>;
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Icon>;
export const ShareIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></Icon>;
export const SendIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>;
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" /><path d="M19 17v4M17 19h4" /></Icon>;
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 11 12 4l8 7M6 10v9h12v-9" /></Icon>;
export const BoardIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="4" y="5" width="7" height="6" rx="1.5" /><rect x="13" y="13" width="7" height="6" rx="1.5" /><path d="M11 8h2a3 3 0 0 1 3 3v2" /></Icon>;
export const PenIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 20c3-1 4-5 7-9s5-6 7-5-1 5-3 8-3 5-1 5 3-1 6-3" /></Icon>;
export const TextIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M5 6h14M12 6v13M9 19h6" /></Icon>;
export const StickyIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M5 5h14v9l-5 5H5zM14 19v-5h5" /></Icon>;
export const CubeIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" /></Icon>;
export const FrameIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /></Icon>;
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m5 12 5 5 9-10" /></Icon>;
export const SunIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>;
export const UserIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></Icon>;
