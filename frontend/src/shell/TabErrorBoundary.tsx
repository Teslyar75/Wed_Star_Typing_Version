import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { err: string | null };

/** Чтобы сбой lazy-чанка не оставлял чёрный экран без сообщения. */
export default class TabErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(e: Error): State {
    return { err: e?.message || String(e) };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("[tab]", this.props.label, e, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.children !== this.props.children && this.state.err) {
      this.setState({ err: null });
    }
  }

  render() {
    if (this.state.err) {
      return (
        <div className="tab-error" role="alert" style={{ padding: "1.5rem", color: "#f5f7fa" }}>
          <p>Не удалось открыть раздел{this.props.label ? ` «${this.props.label}»` : ""}.</p>
          <p className="muted" style={{ opacity: 0.8, fontSize: "0.9rem" }}>
            {this.state.err}
          </p>
          <p className="muted" style={{ opacity: 0.8, fontSize: "0.9rem" }}>
            В Chrome: Ctrl+Shift+R (сброс кэша) или DevTools → Application → Unregister service worker.
          </p>
          <button type="button" onClick={() => this.setState({ err: null })}>
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
