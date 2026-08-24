"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  statementId?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Class component — required by React's error boundary API.
// Shows the last valid render on error and auto-recovers when a new node arrives.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  private lastGood: ReactNode = null;

  static getDerivedStateFromError(_error: unknown): State {
    return { hasError: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Error is silently swallowed — last good render is shown instead.
  }

  componentDidUpdate(prevProps: Props) {
    // New valid node arrived — clear the error and allow re-render.
    if (this.state.hasError && prevProps.statementId !== this.props.statementId) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.lastGood;
    }
    // Cache the current valid children before returning.
    this.lastGood = this.props.children;
    return this.props.children;
  }
}
