# Chrome extension

Toolbar button for the bookmarks app. It saves the current page into one of your buckets and lists the pages already in your library.

The extension reads and writes the same Firestore document as the website: `users/{uid}/data/bookmarks` in the `bookmarks` database. A save runs inside a transaction, so it picks up a change that landed after the popup opened.

## Build

From the `bookmarks` directory, with the same Firebase web config the site uses in `.env`:

```bash
npm run build:extension
```

The build prints a stable extension ID. `extension/public-key.txt` pins that ID, so moving this folder does not change it. Load the unpacked extension from `extension/dist` after every rebuild. Publishing this ID to the Chrome Web Store would need a new key pair and a new OAuth client.

## Sign-in setup

Do this once. The OAuth client has to live in the same Google Cloud project as Firebase.

1. Open Google Cloud Console → APIs & Services → Credentials.
2. Create an OAuth client ID.
3. Application type: **Chrome extension**.
4. Item ID: `emldoalioaoegilfkjddcobbjhfjdckk`
5. Add the client ID to `.env`:

```bash
VITE_EXTENSION_OAUTH_CLIENT_ID=your-id.apps.googleusercontent.com
```

6. Run `npm run build:extension` again and click Reload on the extension card.

Google sign-in must already be enabled in Firebase Authentication. Sign in with the same Google account you use on the website. When Chrome has more than one account, it asks you to pick one.

If Firebase rejects the token, add `chrome-extension://emldoalioaoegilfkjddcobbjhfjdckk` under Authentication → Settings → Authorized domains.

## Use

Open a normal http or https page and click the toolbar icon.

- **Save bookmark** stores the page title, URL, and meta description in the bucket and category you pick. The popup remembers that choice. The first save can create an Inbox bucket and an Unsorted category.
- The library lists your pages, newest first. Search covers title, URL, description, notes, tags, bucket, and category. Click a row to open it.
- A page that is already saved is left as it is.
