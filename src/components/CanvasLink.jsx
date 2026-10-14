import { useEffect, useRef } from 'react';
import { canvasLink, scheduleCanvasFallback } from '../utils/canvasLinks';

export function CanvasLink({ url, className, children }) {
  const destination = canvasLink(url);
  const cancelFallback = useRef(null);
  useEffect(() => () => cancelFallback.current?.(), []);
  if (!destination) return <span className={className}>{children}</span>;
  return <a className={className} href={destination.href}
    target={destination.mobile ? undefined : '_blank'} rel="noopener noreferrer" title="Open in Canvas"
    onClick={event => {
      if (!destination.ios || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      cancelFallback.current?.();
      cancelFallback.current = scheduleCanvasFallback(destination.web);
    }}>{children}</a>;
}
