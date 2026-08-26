"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  statementId?: string;
  resetKey: unknown;
  children: ReactNode;
}

interface State {
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      errorMessage: error instanceof Error ? error.message : "Render failed",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[morphic-render] Component render failed", {
      statementId: this.props.statementId,
      error,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previousProps: Props) {
    if (
      this.state.errorMessage !== null &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ errorMessage: null });
    }
  }

  render(): ReactNode {
    if (this.state.errorMessage !== null) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          This component could not be rendered: {this.state.errorMessage}
        </div>
      );
    }
    return this.props.children;
  }
}
