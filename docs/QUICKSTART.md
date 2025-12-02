# Quick Start Guide

## 🚀 Development Mode (5 minutes)

```bash
# 1. Clone and install
git clone <repo-url>
cd Bookmarks
npm install

# 2. Start development servers
npm run dev
```

Open http://localhost:3000

**That's it!** Both frontend and backend are running.

---

## 🏭 Production Mode (3 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Build the frontend
npm run build

# 3. Start production server
npm start
```

Open http://localhost:3001

**Done!** Your app is running in production mode.

---

## 🧪 Run Tests

```bash
npm test
```

---

## 📖 Need More Details?

- **Development**: See [README.md](./README.md#development-mode)
- **Production**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Testing**: See [TESTING.md](./TESTING.md)
- **Sync Details**: See [SYNC_IMPLEMENTATION.md](./SYNC_IMPLEMENTATION.md)

---

## 🎯 What You Get

✅ **Full-featured bookmarks manager** with:
- Buckets and categories for organization
- Tags, notes, and descriptions
- Search and filter
- Drag-and-drop reordering
- Chrome bookmarks import
- Optional cloud sync with login
- Export/import JSON
- Responsive design (mobile-friendly)

✅ **Auto-sync** when logged in:
- Merges changes from multiple devices
- Syncs on window focus
- Checks for updates every 60 seconds
- Manual refresh button

✅ **Production-ready**:
- Optimized build
- Single server (backend serves frontend)
- Environment variables support
- Docker-ready

---

## 💡 Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development (frontend + backend) |
| `npm run build` | Build for production |
| `npm start` | Run in production |
| `npm test` | Run tests |
| `npm run lint` | Check code quality |

---

## 🆘 Troubleshooting

**Port already in use?**
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9
```

**Dependencies not installing?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Build failing?**
```bash
npm run lint
npm test
```

**Need to reset data?**
- Development: Clear browser localStorage
- Production: Restart server (data is in-memory)

---

## 🎓 First Steps

1. **Create a bucket** (e.g., "Work", "Personal")
2. **Add categories** (e.g., "Development", "Design")
3. **Add bookmarks** - paste URL to auto-extract title/description
4. **Try drag-drop** to reorder bookmarks
5. **Search** using the search bar
6. **Optional: Login** to sync across devices

Enjoy! 🎉

