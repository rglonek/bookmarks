# 📚 Bookmarks Manager

A modern, beautiful web application for managing your bookmarks with intelligent organization and powerful search capabilities.

**🚀 New here? Check out the [Quick Start Guide](./docs/QUICKSTART.md)** - Get running in 5 minutes!

## Features

### ✨ Core Features
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

### 🎨 User Experience
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

### 🔍 Search Capabilities
- Search by title, description, tags, notes, or URL
- Filter by specific bucket, category, or tag
- Instant results as you type
- Case-insensitive matching
- Search everywhere or narrow down to specific locations
- View mode applies to search results too

### 🔐 Authentication & Server Storage
- **Optional Login**: Use the app locally without an account, or login for server-side storage
- **Dual Storage**: When logged in, bookmarks are stored both locally and on the server
- **Account Creation**: Register directly from the login screen
- **Session Management**: Stay logged in across browser sessions
- **Data Sync**: Your bookmarks automatically sync to the server when authenticated
- **Multi-Device Access**: Access your bookmarks from any device when logged in
- **Local First**: Continue using the app offline with localStorage, syncs when you reconnect

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Express.js (for URL metadata extraction and data storage)
- **Storage**: 
  - Browser LocalStorage (offline-first)
  - File-based server storage (persistent across restarts)
  - See [STORAGE.md](./docs/STORAGE.md) for details
- **Security**: bcrypt password hashing
- **Authentication**: Session-based with secure tokens
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

## Usage

### Development Mode

Start both the frontend and backend servers:

```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Production Build

Build the application for production:

```bash
npm run build
```

This creates optimized static files in the `dist/` directory.

### Production Deployment

Run the application in production mode:

**Linux/macOS:**
```bash
npm start
```

**Windows:**
```bash
npm run start:windows
```

The server will:
- Serve the built React app
- Handle API requests
- Run on port 3001 (configurable via `PORT` env variable)

**📖 For detailed deployment instructions**, see [DEPLOYMENT.md](./docs/DEPLOYMENT.md) which covers:
- Building and running in production
- Environment variables
- Docker deployment
- Cloud platform deployment (Heroku, Railway, Render, etc.)
- Security best practices
- Monitoring and troubleshooting

### Testing

Run the comprehensive test suite:

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-runs on changes)
npm run test:ui       # Interactive browser UI
npm run test:coverage # Generate coverage report
```

**Test Coverage**: 33 tests covering storage, merge logic, and API functions. See [TESTING.md](./docs/TESTING.md) for details.

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
│   ├── api.ts            # API client for backend
│   ├── main.tsx          # Application entry point
│   └── index.css         # Global styles
├── backend/
│   └── server.js         # Express server for URL metadata extraction
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── tailwind.config.js    # Tailwind CSS configuration
```

## How to Use

### Authentication (Optional)

#### Using Without Login (Local Mode)
- The app works perfectly without logging in
- All bookmarks are stored in your browser's localStorage
- Data persists across browser sessions
- No account needed

#### Creating an Account & Logging In
1. Click the "🔒 Login" button in the header
2. Click "Need an account? Register"
3. Enter a username and password
4. Click "Register & Login"
5. Your existing local bookmarks will be synced to the server

#### Benefits of Logging In
- **Server Backup**: Your bookmarks are stored on the server
- **Multi-Device Sync**: Access bookmarks from any device with intelligent merge
- **Data Recovery**: Don't lose bookmarks if you clear browser storage
- **Dual Storage**: Still stored locally for offline access
- **Automatic Sync**: Changes sync automatically when focused
- **Conflict Resolution**: Timestamp-based merging prevents data loss

#### Syncing & Merge Strategy
When logged in, the app uses an intelligent merge strategy to keep your bookmarks in sync:

- **Automatic Sync**: 
  - Syncs immediately when window gains focus
  - Checks for server updates every 60 seconds when focused
  - Stops polling when window loses focus (saves resources)
  
- **Manual Refresh**: 
  - Click the "🔄 Refresh" button to manually sync with server
  
- **Merge Logic**:
  - Bookmarks from both local and server are combined
  - For duplicate bookmarks, the one with the latest `updatedAt` timestamp wins
  - New bookmarks from either side are preserved
  - No data is lost - both browsers can add bookmarks simultaneously
  
- **Multi-Device Use**:
  - Add bookmarks on Browser A and Browser B at the same time
  - When you refresh or switch focus, changes merge automatically
  - The most recent edit to any bookmark takes precedence
  - All unique bookmarks from both devices are preserved

#### Logging Out
- Click the "👤 Logout (username)" button to sign out
- Local bookmarks remain in your browser
- Server bookmarks are preserved and will sync when you login again

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
3. Paste the URL (title and description will auto-populate)
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
- **Edit**: Hover over a bookmark and click the ✏️ icon
  - Update any bookmark fields
  - Move to a different bucket or category using the dropdown selectors
- **Delete**: Hover over a bookmark and click the 🗑️ icon
- **Reorder**: Click and drag a bookmark to reposition it
  - Drop on another bookmark to place it at that position
  - Drop in spaces between bookmarks for precise placement
- **Change View**: Use the view mode buttons (☰ List, ⊞ Grid, ▦ Card) to switch layouts

### Managing Buckets & Categories
- **Rename Bucket**: Hover over a bucket and click the ✏️ icon, then type the new name
- **Rename Category**: Hover over a category and click the ✏️ icon, then type the new name
- **Delete Bucket**: Hover over the bucket and click the × button
- **Delete Category**: Hover over the category and click the × button

### Import & Export
- **Export Data**: Click the "📥 Export" button in the header to download all your data as a JSON file
- **Import JSON**: Click the "📤 Import JSON" button and select a previously exported JSON file
  - Warning: Import will replace all existing data (you'll be asked to confirm)
- **Import Chrome Bookmarks**: Click the "🌐 Import Chrome" button to import bookmarks from Chrome
  - First, export your Chrome bookmarks (Chrome menu → Bookmarks → Bookmark Manager → Export bookmarks)
  - Select which bucket you want to import into
  - Chrome folders will be imported as categories
  - Imports are additive (won't replace existing bookmarks)

## Data Storage

All data is stored locally in your browser's LocalStorage. This means:
- ✅ No server required for data storage
- ✅ Fast, instant access
- ✅ Privacy - your data never leaves your browser
- ⚠️ Data is tied to your browser/domain
- ⚠️ Clearing browser data will delete bookmarks

To backup your data, you can export the LocalStorage key `bookmarks-app-data` from your browser's developer tools.

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

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

