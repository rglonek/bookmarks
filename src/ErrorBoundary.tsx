import { Component, type ErrorInfo, type ReactNode } from 'react';

// Last line of defence: if rendering throws, show a way out instead of a
// blank page, including a copy of what this device has stored.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
  }

  private downloadBackup = () => {
    const backup: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('bookmarks-app')) {
        try {
          backup[key] = JSON.parse(localStorage.getItem(key) || 'null');
        } catch {
          backup[key] = localStorage.getItem(key);
        }
      }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookmarks-device-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-600">
            The app hit an error it couldn&apos;t recover from. Your bookmarks are still stored.
            Reloading usually fixes this; if it doesn&apos;t, download a backup of what this device has saved.
          </p>
          <p className="text-xs text-gray-400 break-words">{this.state.error.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              Reload
            </button>
            <button
              onClick={this.downloadBackup}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Download backup
            </button>
          </div>
        </div>
      </div>
    );
  }
}
