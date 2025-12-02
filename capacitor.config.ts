import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bookmarks.app',
  appName: 'Bookmarks Manager',
  webDir: 'dist',
  
  // Server configuration
  server: {
    // Allow navigation to Firebase auth domains
    allowNavigation: [
      'accounts.google.com',
      '*.firebaseapp.com',
      '*.googleapis.com'
    ]
  },
  
  // iOS specific settings
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
    // Use WKWebView (modern, recommended)
    preferredContentMode: 'mobile'
  },
  
  // Android specific settings  
  android: {
    // Allow mixed content for development
    allowMixedContent: true,
    // Capture external links in the app
    captureInput: true,
    // Use hardware back button
    useLegacyBridge: false
  },
  
  // Plugins configuration
  plugins: {
    // Splash screen settings
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  }
};

export default config;
