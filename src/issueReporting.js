import { supabase } from './supabase';
import { classifyIssue, createIssueReporter, setIssueReporter } from './utils/issueReporting';

export function startIssueReporting() {
  if (!supabase) return () => {};
  const reporter = createIssueReporter({
    viewport: () => window.innerWidth,
    online: () => navigator.onLine !== false,
    send: async reports => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const { error } = await supabase.rpc('report_client_issues', { reports }).abortSignal(controller.signal);
        if (error) throw error;
      } finally { clearTimeout(timer); }
    },
  });
  setIssueReporter(reporter);
  let userId, disposed = false, authRevision = 0;
  const updateSession = session => {
    if (disposed || userId === session?.user?.id) return;
    userId = session?.user?.id; reporter.session(Boolean(userId));
  };
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { authRevision++; updateSession(session); });
  const revision = authRevision;
  supabase.auth.getSession().then(({ data }) => { if (revision === authRevision) updateSession(data.session); }).catch(() => {});
  const onError = () => reporter.report({ area: 'app', code: 'render' });
  const onRejection = event => reporter.report({ area: 'app', code: classifyIssue(event.reason) });
  const onOnline = () => { void reporter.flush(); };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('online', onOnline);
  return () => {
    disposed = true; subscription.unsubscribe(); reporter.dispose(); setIssueReporter(undefined);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('online', onOnline);
  };
}
