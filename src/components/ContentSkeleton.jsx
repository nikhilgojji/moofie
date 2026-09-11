export function ContentSkeleton({ label = "Loading content", variant = "list", rows = 4 }) {
  return <div className={`content-skeleton content-skeleton-${variant}`} role="status" aria-label={label}>
    <span className="skeleton-accessible-label">{label}</span>
    <div aria-hidden="true">
      <div className="skeleton content-skeleton-heading" />
      {Array.from({ length: rows }, (_, index) => <div className="content-skeleton-row" key={index}>
        {variant === "list" && <div className="skeleton content-skeleton-icon" />}
        <div className="content-skeleton-copy"><div className="skeleton content-skeleton-line" /><div className="skeleton content-skeleton-line content-skeleton-short" /></div>
      </div>)}
    </div>
  </div>;
}
