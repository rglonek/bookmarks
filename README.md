# Bookmarks Manager

A modern, beautiful web application for managing your bookmarks with intelligent organization and powerful search capabilities.

**New here? Check out the [Quick Start Guide](./docs/QUICKSTART.md)** - Get running in 5 minutes!

## What's new

Added PWA support. Now mobile users can hit the "share" button, and then "Add To Home Screen". The home screen icon will behave like a full-flown app.

How to Install the PWA:
* On iPhone/iPad (Safari):
  1. Visit your deployed app
  2. Tap the Share button
  3. Select "Add to Home Screen"
* On Android (Chrome):
  1. Visit your deployed app
  2. Chrome will show an install banner, or
  3. Tap the menu (⋮) → "Add to Home Screen" or "Install App"

## Features

### Core Features
- **Storage Buckets**: Organize bookmarks into multiple buckets (e.g., "Work", "Personal")
  - Automatically sorted alphabetically (A-Z)
  - Rename buckets inline with a single click
  - Delete buckets with confirmation
- **Categories**: Create categories within each bucket for fine-grained organization
  - Automatically sorted alphabetically (A-Z)
  - Rename categories inline with a single click
  - Delete categories with confirmation
- **Rich Bookmarks**: Store comprehensive bookmark information including:
  - Title
  - URL
  - Description
  - Tags (multiple per bookmark)
  - Notes
  - Timestamps (created/updated)
- **Bookmark Ordering**: Manually reorder bookmarks within categories using drag-and-drop
  - Simply drag and drop bookmarks to reorder them
  - Drop directly on bookmarks or in the spaces between them
  - Visual feedback shows which bookmark is being dragged
  - Smooth animation when bookmarks settle into place
  - Auto-scroll when dragging near the top or bottom (within 10% of screen height)
  - Maintain your preferred order independent of sort

### User Experience
- **Responsive Design**: Beautiful UI that works seamlessly on desktop, tablet, and mobile devices
- **Auto-Extraction**: Automatically extracts title and description when you paste a URL
- **Instant Search**: Fast, case-insensitive search across all bookmark fields
- **Smart Filters**: Filter by bucket, category, and tags
- **Modern UI**: Clean, intuitive interface with smooth transitions and hover effects
- **Multiple View Modes**: Switch between List, Grid, and Card views
  - **List View**: Compact view showing essentials
  - **Grid View**: Dense grid for maximum bookmarks visible
  - **Card View**: Detailed cards with full information
- **Inline Editing**: Click the edit icon on buckets and categories to rename them instantly
- **Data Portability**: Export all data to JSON and import from JSON files

### Search Capabilities
- Search by title, description, tags, notes, or URL
- Filter by specific bucket, category, or tag
- Instant results as you type
- Case-insensitive matching
- Search everywhere or narrow down to specific locations
- View mode applies to search results too

### Authentication & Cloud Storage
- **Google Sign-In**: Simple one-click authentication with your Google account
- **Cloud Storage**: Your bookmarks are stored securely in Firebase Cloud Firestore
- **Local First**: Continue using the app offline with localStorage, syncs when you reconnect
- **Multi-Device Access**: Access your bookmarks from any device when signed in
- **Automatic Sync**: Changes sync automatically across devices
- **Conflict Resolution**: Intelligent merging prevents data loss

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase
  - Firebase Authentication (Google Sign-In)
  - Cloud Firestore (database)
  - Cloud Functions (URL metadata extraction)
  - Firebase Hosting
- **Storage**: 
  - Browser LocalStorage (offline-first)
  - Cloud Firestore (cloud sync)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Bookmarks
```

2. Install dependencies:
```bash
npm install
```

## Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" (or "Add project")
3. Enter a project name (e.g., "my-bookmarks")
4. Follow the setup wizard (you can disable Google Analytics if you prefer)
5. Click "Create project"

### 2. Upgrade to Blaze Plan

Cloud Functions require the Blaze (pay-as-you-go) plan for external network access:

1. In Firebase Console, click the "Spark" label in the bottom-left
2. Select "Upgrade" and choose "Blaze"
3. Enter billing information (you won't be charged unless you exceed free tier limits)

**Note**: The free tier is generous enough for personal use - you likely won't pay anything.

### 3. Enable Authentication

1. In Firebase Console, go to **Build → Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Click "Google" and enable it
5. Set a support email and click "Save"

### 4. Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click "Create database"
3. Choose "Start in production mode"
4. Select a location close to your users
5. Click "Enable"

### 5. Get Firebase Configuration

1. Go to **Project Settings** (gear icon) → **General**
2. Scroll down to "Your apps" and click the web icon (`</>`)
3. Register your app with a nickname (e.g., "bookmarks-web")
4. Copy the Firebase configuration object

### 6. Configure Environment Variables

Copy the example environment file and fill in your Firebase values:

```bash
cp .env.example .env
```

Then edit `.env` with your Firebase configuration:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Your Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (usually `your_project_id.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket (usually `your_project_id.appspot.com`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Your Firebase app ID |

> **Note**: Never commit your `.env` file to version control. It's already in `.gitignore`.

### 7. Deploy Cloud Functions

Install Firebase CLI globally (if not already installed):

```bash
npm install -g firebase-tools
```

Login and initialize Firebase:

```bash
firebase login
firebase init
```

During init, select:
- **Firestore**: Yes
- **Functions**: Yes (JavaScript)
- **Hosting**: Yes
- Use existing project: Select your project

Deploy:

```bash
firebase deploy
```

## Usage

### Development Mode

Start the development server:

```bash
npm run dev
```

This starts the frontend at http://localhost:5173

### Production Build

Build the application for production:

```bash
npm run build
```

This creates optimized static files in the `dist/` directory.

### Deploy to Firebase

Deploy everything (hosting, functions, rules):

```bash
npm run deploy
```

Or deploy individually:

```bash
npm run deploy:hosting   # Just the web app
npm run deploy:functions # Just Cloud Functions
npm run deploy:rules     # Just Firestore rules
```

### Testing

Run the comprehensive test suite:

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-runs on changes)
npm run test:ui       # Interactive browser UI
npm run test:coverage # Generate coverage report
```

### Linting

Check and fix code quality:

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

## Application Structure

```
Bookmarks/
├── src/
│   ├── App.tsx           # Main application component
│   ├── types.ts          # TypeScript type definitions
│   ├── storage.ts        # LocalStorage management
│   ├── api.ts            # Firebase API client
│   ├── firebase.ts       # Firebase initialization
│   ├── main.tsx          # Application entry point
│   └── index.css         # Global styles
├── functions/
│   ├── index.js          # Cloud Functions (metadata extraction)
│   └── package.json      # Functions dependencies
├── firebase.json         # Firebase configuration
├── firestore.rules       # Firestore security rules
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── tailwind.config.js    # Tailwind CSS configuration
```

## How to Use

### Authentication

#### Using Without Sign-In (Local Mode)
- The app works without signing in
- All bookmarks are stored in your browser's localStorage
- Data persists across browser sessions
- No account needed

#### Signing In with Google
1. Click the "Sign in with Google" button in the header
2. Select your Google account
3. Your existing local bookmarks will be synced to the cloud

#### Benefits of Signing In
- **Cloud Backup**: Your bookmarks are stored in Firebase
- **Multi-Device Sync**: Access bookmarks from any device with intelligent merge
- **Data Recovery**: Don't lose bookmarks if you clear browser storage
- **Dual Storage**: Still stored locally for offline access
- **Automatic Sync**: Changes sync automatically when focused
- **Conflict Resolution**: Timestamp-based merging prevents data loss

#### Syncing & Merge Strategy
When signed in, the app uses an intelligent merge strategy:

- **Automatic Sync**: 
  - Syncs immediately when window gains focus
  - Checks for cloud updates every 60 seconds when focused
  - Stops polling when window loses focus (saves resources)
  
- **Manual Refresh**: 
  - Click the "Refresh" button to manually sync with cloud
  
- **Merge Logic**:
  - Bookmarks from both local and cloud are combined
  - For duplicate bookmarks, the one with the latest `updatedAt` timestamp wins
  - New bookmarks from either side are preserved
  - No data is lost - multiple devices can add bookmarks simultaneously

#### Signing Out
- Click your name/avatar to sign out
- Local bookmarks remain in your browser
- Cloud bookmarks are preserved and will sync when you sign in again

### Creating Buckets
1. Click the "+ New Bucket" button in the header
2. Enter a name (e.g., "Work", "Personal", "Research")
3. Click "Create"

### Creating Categories
1. Select a bucket from the sidebar
2. Click "+ Add Category"
3. Enter a category name (e.g., "Project A", "To Read")
4. Click "Create"

### Adding Bookmarks
1. Select a bucket and category
2. Click "+ Add Bookmark"
3. Paste the URL (title and description will auto-populate if signed in)
4. Edit or add additional information:
   - Title (required)
   - Description
   - Tags (comma-separated)
   - Notes
5. Click "Create"

### Searching Bookmarks
1. Use the search bar at the top to search across all bookmarks
2. Use the dropdown filters to narrow by:
   - Bucket
   - Category
   - Tag
3. Results update instantly as you type

### Managing Bookmarks
- **Edit**: Hover over a bookmark and click the edit icon
  - Update any bookmark fields
  - Move to a different bucket or category using the dropdown selectors
- **Delete**: Hover over a bookmark and click the delete icon
- **Reorder**: Click and drag a bookmark to reposition it
- **Change View**: Use the view mode buttons (List, Grid, Card) to switch layouts

### Import & Export
- **Export Data**: Click the "Export" button to download all your data as a JSON file
- **Import JSON**: Click the "Import JSON" button and select a previously exported JSON file
- **Import Chrome Bookmarks**: Click the "Import Chrome" button to import bookmarks from Chrome
  - First, export your Chrome bookmarks (Chrome menu → Bookmarks → Bookmark Manager → Export bookmarks)
  - Select which bucket you want to import into
  - Chrome folders will be imported as categories

## Data Storage

Data is stored in two places:

1. **LocalStorage** (always): For offline access and instant loading
2. **Cloud Firestore** (when signed in): For backup and sync across devices

Privacy: Your data is associated with your Google account and secured by Firebase security rules.

## Browser Compatibility

Works on all modern browsers that support:
- ES2020+
- LocalStorage
- Fetch API

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Cost Estimation

With the Firebase Blaze plan, you get generous free tier limits:

| Service | Free Tier | Expected Usage |
|---------|-----------|----------------|
| Authentication | Unlimited | Free |
| Firestore Reads | 50K/day | ~100-500/day |
| Firestore Writes | 20K/day | ~10-50/day |
| Cloud Functions | 2M/month | ~100/month |
| Hosting | 10GB/month | ~100MB/month |

**Expected cost for personal use: $0/month**

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
