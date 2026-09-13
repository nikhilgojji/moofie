import { Component } from 'react';
import { reportIssue } from '../utils/issueReporting';

export class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { reportIssue({ area: 'app', code: 'render' }); }
  render() {
    if (this.state.failed) return <main className="app-recovery" role="alert"><h1>Moofie could not display this page.</h1><p>Reload to try again. Unsaved what-if changes may be lost.</p><button type="button" onClick={() => window.location.reload()}>Reload Moofie</button></main>;
    return this.props.children;
  }
}
