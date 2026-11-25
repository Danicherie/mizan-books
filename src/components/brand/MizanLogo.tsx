import React from "react";

/**
 * Hand-built mark: an amber rounded square and a cream M
 * whose middle is a balance scale. Matches the owner's logo.
 */
export function MizanMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  const labelled = Boolean(title);
  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      aria-label={title}
    >
      <rect width="128" height="128" rx="31" fill="#E0973A" />
      <g style={{ filter: "drop-shadow(0px 1.4px 0px rgba(140, 82, 24, 0.45))" }}>
        <g fill="none" stroke="#F7E9CF" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 78 V46" strokeWidth="12" />
          <path d="M88 78 V46" strokeWidth="12" />
          <path d="M44 48.5 C53 52 58 55.5 64 55.5 C70 55.5 75 52 84 48.5" strokeWidth="12" />
          <path d="M34.5 76 L24 93" strokeWidth="2.5" />
          <path d="M45.5 76 L56 93" strokeWidth="2.5" />
          <path d="M82.5 76 L72 93" strokeWidth="2.5" />
          <path d="M93.5 76 L104 93" strokeWidth="2.5" />
          <path d="M64 59 V77" strokeWidth="3.2" />
        </g>
        <g fill="#F7E9CF">
          <path d="M56.8 76.2h14.4l-1.8 5.6c-.28.8-1.02 1.3-1.82 1.3h-7.16c-.8 0-1.54-.5-1.82-1.3z" />
          <path d="M20 93.2h40c1.05 0 1.6 1.2 1.05 2.15-2.5 5.5-9 8.7-21.05 8.7S22.45 100.85 20 95.35c-.55-.95 0-2.15 1.05-2.15z" />
          <rect x="36.2" y="102.6" width="7.6" height="5.2" rx="2.6" />
          <path d="M68 93.2h40c1.05 0 1.6 1.2 1.05 2.15-2.5 5.5-9 8.7-21.05 8.7S70.45 100.85 68 95.35c-.55-.95 0-2.15 1.05-2.15z" />
          <rect x="84.2" y="102.6" width="7.6" height="5.2" rx="2.6" />
        </g>
      </g>
    </svg>
  );
}

export function MizanLockup({
  name,
  tagline,
  markClassName = "h-10 w-10",
  nameClassName = "text-lg",
  href,
}: {
  name: string;
  tagline?: string;
  markClassName?: string;
  nameClassName?: string;
  href?: string;
}) {
  const inner = (
    <>
      <MizanMark className={`${markClassName} shrink-0`} />
      <span className="min-w-0 text-start">
        <span className={`block truncate font-bold tracking-tight text-mb-cocoa leading-tight ${nameClassName}`}>{name}</span>
        {tagline ? <span className="mt-0.5 block truncate text-xs text-mb-ink">{tagline}</span> : null}
      </span>
    </>
  );

  const className = "inline-flex min-w-0 items-center gap-2.5 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mb-cocoa";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return <span className={className}>{inner}</span>;
}
