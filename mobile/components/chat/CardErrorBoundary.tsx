import { Component, type ReactNode } from "react";

/** A proposal card that fails to render disappears; the message text and the rest of the chat stay usable. */
export class CardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
