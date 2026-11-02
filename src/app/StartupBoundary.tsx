import { Component, useEffect, type ReactNode } from 'react';

function ready(state: 'ready' | 'error') {
  window.dispatchEvent(new Event('misaki-ui-ready'));
  void window.misakiDesktop?.reportInterface?.(state).catch(() => {});
}

function StartupFailure() {
  useEffect(() => { ready('error'); }, []);
  return <div style={{ padding: 48, color: '#e9dfc7', background: '#171e1b', minHeight: '100vh', fontFamily: 'system-ui' }} role="alert"><h1>Misaki’s interface encountered an error</h1><p>Reload the interface to try again. Your saved preferences will be kept.</p><button onClick={() => location.reload()}>Reload interface</button><p>Startup code: UI_RENDER_ERROR</p></div>;
}

export function InterfaceReady({ children }: { children: ReactNode }) {
  useEffect(() => { ready('ready'); }, []);
  return children;
}

export default class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StartupFailure /> : this.props.children; }
}
