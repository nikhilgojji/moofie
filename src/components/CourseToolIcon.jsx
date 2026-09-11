import { useState } from "react";

export function CourseToolIcon({ index, src }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img className="course-tool-icon" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return <svg className="course-tool-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {index === 0 ? <><path d="M24 12c-6-5-13-5-19-3v29c7-2 13-2 19 3 6-5 12-5 19-3V9c-6-2-13-2-19 3Z" /><path d="M24 12v29M11 17h7m-7 7h7m12-7h7m-7 7h7" /></> : index === 1 ? <><path d="M10 7H6v12a11 11 0 0 0 22 0V7h-4M17 30v4a10 10 0 0 0 20 0v-5" /><circle cx="37" cy="24" r="5" /><path d="M10 5v5m14-5v5" /></> : index === 2 ? <><path d="M7 25v-5a17 17 0 0 1 34 0v13c0 7-6 10-14 10" /><rect x="4" y="22" width="8" height="14" rx="4" /><rect x="36" y="22" width="8" height="14" rx="4" /><path d="M23 43h5" /></> : <><circle cx="24" cy="15" r="9" /><path d="M7 42v-5a17 13 0 0 1 34 0v5Z" /></>}
  </svg>;
}
