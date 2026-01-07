import React from "react";

type Props = { children: React.ReactNode };

export class ErrorBoundary extends React.Component<Props, { hasError: boolean; error?: any }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "1rem", color: "var(--danger, #f87171)" }}>
          <strong>Plot failed to render.</strong>
          <div style={{ fontSize: 12, marginTop: 8 }}>{String(this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
