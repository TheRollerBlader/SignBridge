import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Robust Error Boundary catching camera permissions, WebGL context loss,
 * WASM memory allocation limits, and ONNX Runtime execution failures.
 */
export class InferenceErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected inference pipeline error occurred.'
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('InferenceErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 my-4 border border-red-500/30 bg-red-950/20 backdrop-blur-md rounded-2xl text-white">
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 mb-3 text-xl font-bold">
            !
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-red-200">
            {this.props.fallbackTitle || 'Vision Inference Paused'}
          </h3>
          <p className="text-sm text-red-300/80 text-center max-w-md mt-1 mb-4 font-mono">
            {this.state.errorMessage}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all rounded-lg shadow-lg shadow-red-950/50"
          >
            Restart Vision Session
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
