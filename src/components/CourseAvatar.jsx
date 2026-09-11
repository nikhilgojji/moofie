import { useEffect, useState } from "react";

export function CourseAvatar({ className = "", name, src, eager = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [src]);
  return src && !imageFailed ? <img className={className} src={src} alt="" loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span className={className} aria-hidden="true">{(name || "Participant").trim().slice(0, 1).toUpperCase()}</span>;
}
