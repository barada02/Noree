import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback: (reset: () => void) => ReactNode };

/**
 * Any peer can write to a shared document, so one bad block must not take down the whole board.
 * Keeps the failure contained to what's inside it.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Display error:", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback(() => this.setState({ failed: false }));
    return this.props.children;
  }
}
