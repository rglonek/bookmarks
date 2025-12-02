# Mobile App Setup Guide

This guide explains how to build and run the Bookmarks app as a native iOS/Android app using Capacitor.

## Prerequisites

### For iOS Development
- macOS with Xcode installed (from App Store)
- CocoaPods: `sudo gem install cocoapods`
- After installing Xcode, run: `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`

### For Android Development
- Android Studio installed
- Android SDK (installed via Android Studio)
- Java JDK 17+ (Android Studio bundles this)

## Quick Start

### Build & Open iOS in Xcode
```bash
npm run cap:ios
```

### Build & Open Android in Android Studio
```bash
npm run cap:android
```

### Just Sync (after web changes)
```bash
npm run cap:sync
```

## Development Workflow

1. **Make changes** to your React app in `src/`
2. **Test in browser** with `npm run dev`
3. **Build & sync** with `npm run cap:sync`
4. **Test on device** using Xcode or Android Studio

## Firebase Authentication

### Current Setup (Works Out of the Box)

The existing Firebase Web SDK authentication works in the Capacitor WebView. Google Sign-in will:
- Open in a popup or redirect
- Work the same as the web version
- Persist auth state in WebView localStorage

**No changes needed** - your auth code works as-is.

### Optional: Native Google Sign-In (Better UX)

For a smoother native sign-in experience (uses the device's Google account), you can add the Capacitor Firebase plugin:

```bash
npm install @capacitor-firebase/authentication
npx cap sync
```

Then follow the plugin setup:
- [iOS Setup](https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-ios.md)
- [Android Setup](https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-android.md)

This requires:
1. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android) from Firebase Console
2. Add them to the native projects
3. Configure URL schemes and SHA certificates

## Building for Release

### iOS (App Store)

1. Open in Xcode: `npm run cap:ios`
2. Select your team in Signing & Capabilities
3. Set bundle identifier to match your Firebase app
4. Product → Archive
5. Distribute via App Store Connect

### Android (Play Store)

1. Open in Android Studio: `npm run cap:android`
2. Build → Generate Signed Bundle / APK
3. Create or use existing keystore
4. Upload to Google Play Console

## App Icons & Splash Screens

### Updating Icons

1. Edit `scripts/generate-icons.cjs` to customize the design
2. Run `npm run generate-icons`
3. For native apps, use tools like:
   - [capacitor-assets](https://github.com/ionic-team/capacitor-assets) - Auto-generates all sizes
   - Or manually replace files in:
     - `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
     - `android/app/src/main/res/mipmap-*/`

### Splash Screens

Edit splash images in:
- `ios/App/App/Assets.xcassets/Splash.imageset/`
- `android/app/src/main/res/drawable*/splash.png`

## Debugging

### iOS
- Use Safari Web Inspector: Develop → [Your Device] → [App WebView]
- Console logs appear in Xcode output

### Android
- Use Chrome DevTools: `chrome://inspect`
- Select your device and inspect the WebView

## Troubleshooting

### iOS: CocoaPods not found
```bash
sudo gem install cocoapods
pod setup
cd ios/App && pod install
```

### iOS: Xcode command line tools error
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

### Android: Gradle sync failed
- Open Android Studio
- Let it download SDK and dependencies
- File → Sync Project with Gradle Files

### Auth not persisting
- Ensure `capacitor.config.ts` allows navigation to Google/Firebase domains
- Check that your Firebase project has the correct authorized domains

## Project Structure

```
/
├── src/                    # React web app source
├── dist/                   # Built web assets (synced to native)
├── ios/                    # Xcode project
│   └── App/
│       ├── App/           # Main app files
│       └── Podfile        # iOS dependencies
├── android/               # Android Studio project
│   └── app/
│       └── src/main/
│           ├── assets/    # Web assets copied here
│           └── res/       # Android resources
└── capacitor.config.ts    # Capacitor configuration
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start web dev server |
| `npm run build` | Build web app |
| `npm run cap:sync` | Build & sync to native |
| `npm run cap:ios` | Build, sync & open Xcode |
| `npm run cap:android` | Build, sync & open Android Studio |
| `npx cap doctor` | Check Capacitor setup |
| `npx cap ls` | List installed plugins |

