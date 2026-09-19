import { Component } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Catches a render error in its subtree so one broken page shows a recoverable
 * message instead of a blank white screen. `resetKey` (the route path) clears
 * the error when the user navigates elsewhere, so a crash on one page doesn't
 * stick to every page after it.
 */
class ErrorBoundary extends Component {
  state = { error: null, copied: false };

  static getDerivedStateFromError(error) {
    return { error, copied: false };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error, info) {
    console.error("Render error caught by ErrorBoundary:", error, info?.componentStack);
  }

  copyDetails = async () => {
    const { error } = this.state;
    const details = [`Page: ${window.location.pathname}`, `Error: ${error?.message}`, `Time: ${new Date().toISOString()}`, error?.stack ? `\n${error.stack}` : ""].join("\n");
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
    } catch {
      // clipboard unavailable — the details are still in the console
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-100 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Something went wrong on this page</h2>
        <p className="mt-2 text-sm text-gray-500">The rest of the app is still working. You can try again, or reload if it keeps happening.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => this.setState({ error: null })} className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90">
            Try again
          </button>
          <button onClick={() => window.location.reload()} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Reload
          </button>
        </div>
        <button onClick={this.copyDetails} className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline">
          {this.state.copied ? "Copied — paste it into a bug report" : "Copy error details"}
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
