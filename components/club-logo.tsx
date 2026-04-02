export function ClubLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        width="120"
        height="120"
        rx="24"
        className="fill-foreground/10 stroke-border"
        strokeWidth="1"
      />
      <path
        d="M78 28v52c0 8.8-7.2 16-16 16s-16-7.2-16-16 7.2-16 16-16c2.2 0 4.3.4 6.2 1.2V44l-28 8v36c0 8.8-7.2 16-16 16S24 96.8 24 88s7.2-16 16-16c2.2 0 4.3.4 6.2 1.2V36l32-8z"
        className="fill-foreground"
      />
    </svg>
  );
}
