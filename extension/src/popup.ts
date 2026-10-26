import { onAuthStateChanged } from 'firebase/auth/web-extension';
import type { User } from 'firebase/auth';
import { createBookmark } from '../../src/storage';
import { isWebUrl } from '../../src/url';
import { friendlyAuthError, oauthClientConfigured, requestSignIn, signOutOfExtension } from './auth';
import { auth, firebaseConfigProblem } from './firebase';
import { friendlySaveError, loadLibrary, saveBookmark, saveSharedBookmark } from './library';
import {
  activeCategories,
  allBuckets,
  destinationBuckets,
  emptyLibrary,
  filterBookmarks,
  findDuplicate,
  isSharedDestination,
  listBookmarks,
  type Library,
  type ListedBookmark,
  type SaveInput,
} from './mutate';

const PREFS_KEY = 'lastDestination';
const LIST_LIMIT = 50;

interface Prefs {
  bucketId?: string;
  categoryId?: string;
}

interface PageInfo {
  url: string;
  title: string;
  description: string;
  saveable: boolean;
  reason?: string;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const loading = required<HTMLElement>('loading');
const signedOut = required<HTMLElement>('signed-out');
const signedIn = required<HTMLElement>('signed-in');
const intro = required<HTMLElement>('intro');
const configHelp = required<HTMLElement>('config-help');
const oauthHelp = required<HTMLElement>('oauth-help');
const extensionIdRow = required<HTMLElement>('extension-id-row');
const extensionId = required<HTMLElement>('extension-id');
const signInButton = required<HTMLButtonElement>('sign-in');
const signOutButton = required<HTMLButtonElement>('sign-out');
const authError = required<HTMLElement>('auth-error');
const account = required<HTMLElement>('account');
const pageTitle = required<HTMLElement>('page-title');
const pageUrl = required<HTMLElement>('page-url');
const pageReason = required<HTMLElement>('page-reason');
const destination = required<HTMLElement>('destination');
const bucketField = required<HTMLElement>('bucket-field');
const bucketSelect = required<HTMLSelectElement>('bucket');
const newBucketField = required<HTMLElement>('new-bucket-field');
const newBucketInput = required<HTMLInputElement>('new-bucket');
const categoryField = required<HTMLElement>('category-field');
const categorySelect = required<HTMLSelectElement>('category');
const newCategoryField = required<HTMLElement>('new-category-field');
const newCategoryInput = required<HTMLInputElement>('new-category');
const saveButton = required<HTMLButtonElement>('save');
const saveStatus = required<HTMLElement>('save-status');
const searchInput = required<HTMLInputElement>('search');
const count = required<HTMLElement>('count');
const list = required<HTMLUListElement>('list');
const listEmpty = required<HTMLElement>('list-empty');
const listMore = required<HTMLElement>('list-more');

let viewToken = 0;
let saving = false;
let currentUser: User | null = null;
let library: Library = emptyLibrary();
// False when the library couldn't be loaded; saving is blocked then, since
// the popup can't tell which buckets exist
let libraryLoaded = false;
let page: PageInfo | null = null;

function init(): void {
  signInButton.addEventListener('click', () => { void onSignIn(); });
  signOutButton.addEventListener('click', () => { void onSignOut(); });
  saveButton.addEventListener('click', () => { void onSave(); });
  searchInput.addEventListener('input', () => { renderList(); });
  bucketSelect.addEventListener('change', () => { onBucketChange(); });
  categorySelect.addEventListener('change', () => { void persistDestination(); });

  if (!auth) {
    showSignedOut();
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (user) void showSignedIn(user);
    else showSignedOut();
  });
}

async function onSignIn(): Promise<void> {
  authError.textContent = '';
  signInButton.disabled = true;
  signInButton.textContent = 'Signing in…';
  try {
    const result = await requestSignIn();
    if (!result.ok) {
      authError.textContent = result.message;
      return;
    }
    // The background worker signed in. This popup's Firebase Auth notices the
    // session in shared storage on its own; reload if it hasn't shortly.
    window.setTimeout(() => {
      if (!auth?.currentUser) location.reload();
    }, 1500);
  } catch (error) {
    authError.textContent = friendlyAuthError(error);
  } finally {
    signInButton.disabled = false;
    signInButton.textContent = 'Sign in with Google';
  }
}

async function onSignOut(): Promise<void> {
  signOutButton.disabled = true;
  try {
    await signOutOfExtension();
  } catch (error) {
    setStatus(friendlyAuthError(error), 'error');
  } finally {
    signOutButton.disabled = false;
  }
}

function showSignedOut(): void {
  viewToken += 1;
  currentUser = null;
  library = emptyLibrary();
  libraryLoaded = false;
  loading.hidden = true;
  signedIn.hidden = true;
  signedOut.hidden = false;
  signOutButton.hidden = true;
  account.textContent = '';
  authError.textContent = '';

  const configProblem = firebaseConfigProblem();
  const oauthReady = oauthClientConfigured();
  const ready = !configProblem && oauthReady;

  configHelp.hidden = !configProblem;
  configHelp.textContent = configProblem ?? '';
  oauthHelp.hidden = oauthReady;
  oauthHelp.textContent = oauthReady
    ? ''
    : 'Create a Chrome extension OAuth client for this extension ID in the same Google Cloud project as Firebase. Set VITE_EXTENSION_OAUTH_CLIENT_ID in .env, run npm run build:extension, and reload.';
  extensionIdRow.hidden = oauthReady;
  extensionId.textContent = chrome.runtime.id;
  intro.hidden = !ready;
  intro.textContent = ready
    ? 'Use the same Google account as the website. Chrome asks you to choose when more than one account is signed in.'
    : '';
  signInButton.hidden = !ready;
}

async function showSignedIn(user: User): Promise<void> {
  const token = ++viewToken;
  currentUser = user;
  loading.hidden = true;
  signedOut.hidden = true;
  signedIn.hidden = false;
  signOutButton.hidden = false;
  account.textContent = user.email || user.displayName || 'Signed in';
  setStatus('', '');

  const [prefsResult, pageResult, libraryResult] = await Promise.allSettled([
    loadPrefs(),
    readPage(),
    loadLibrary(user.uid),
  ]);
  if (token !== viewToken) return;

  page = pageResult.status === 'fulfilled'
    ? pageResult.value
    : { url: '', title: 'This page', description: '', saveable: false, reason: 'Could not read the current tab.' };
  library = libraryResult.status === 'fulfilled' ? libraryResult.value : emptyLibrary();
  libraryLoaded = libraryResult.status === 'fulfilled';
  const prefs = prefsResult.status === 'fulfilled' ? prefsResult.value : {};

  renderPage();
  renderDestination(prefs);
  renderList();
  if (libraryResult.status === 'rejected') {
    setStatus(`Couldn't load your library: ${friendlySaveError(libraryResult.reason)} Close and reopen the popup to try again.`, 'error');
  }
}

function renderPage(): void {
  if (!page) return;
  pageTitle.textContent = page.saveable ? page.title : 'This page';
  pageUrl.textContent = page.url;
  pageUrl.hidden = !page.url;
  pageReason.hidden = page.saveable;
  pageReason.textContent = page.reason ?? '';
  destination.hidden = !page.saveable || !libraryLoaded;
  saveButton.disabled = !page.saveable || !libraryLoaded || saving;
}

function renderDestination(prefs: Prefs): void {
  const buckets = destinationBuckets(library);
  if (buckets.length === 0) {
    bucketField.hidden = true;
    newBucketField.hidden = false;
    categoryField.hidden = true;
    newCategoryField.hidden = false;
    return;
  }

  newBucketField.hidden = true;
  bucketField.hidden = false;
  const bucketId = prefs.bucketId && buckets.some((bucket) => bucket.id === prefs.bucketId)
    ? prefs.bucketId
    : buckets[0].id;
  fillSelect(
    bucketSelect,
    buckets.map((bucket) => ({ id: bucket.id, name: bucket.isShared ? `${bucket.name} (shared)` : bucket.name })),
    bucketId,
  );
  renderCategories(prefs.categoryId);
}

function renderCategories(preferredCategoryId?: string): void {
  const bucket = destinationBuckets(library).find((item) => item.id === bucketSelect.value);
  const categories = bucket ? activeCategories(bucket) : [];
  if (categories.length === 0) {
    categoryField.hidden = true;
    newCategoryField.hidden = false;
    return;
  }
  newCategoryField.hidden = true;
  categoryField.hidden = false;
  const categoryId = preferredCategoryId && categories.some((category) => category.id === preferredCategoryId)
    ? preferredCategoryId
    : categories[0].id;
  fillSelect(categorySelect, categories, categoryId);
}

function onBucketChange(): void {
  newCategoryInput.value = '';
  renderCategories();
  void persistDestination();
}

function renderList(): void {
  const listed = listBookmarks(allBuckets(library));
  const filtered = filterBookmarks(listed, searchInput.value);
  const shown = filtered.slice(0, LIST_LIMIT);
  count.textContent = String(listed.length);
  list.replaceChildren(...shown.map(bookmarkRow));
  listEmpty.hidden = filtered.length > 0;
  listEmpty.textContent = listed.length === 0 ? 'Saved pages will show up here.' : 'No matches.';
  listMore.hidden = filtered.length <= LIST_LIMIT;
  listMore.textContent = filtered.length > LIST_LIMIT ? `Showing ${LIST_LIMIT} of ${filtered.length}.` : '';
}

function bookmarkRow(item: ListedBookmark): HTMLLIElement {
  const row = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row';
  button.title = item.url;

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.title || item.url;

  const meta = document.createElement('span');
  meta.className = 'row-meta';
  meta.textContent = `${item.bucketName}${item.shared ? ' (shared)' : ''} · ${item.categoryName}`;

  const url = document.createElement('span');
  url.className = 'row-url';
  url.textContent = item.url;

  button.append(title, meta, url);
  button.addEventListener('click', () => {
    // The library can hold entries added on the website; open web links only
    if (isWebUrl(item.url)) void chrome.tabs.create({ url: item.url });
  });
  row.append(button);
  return row;
}

async function onSave(): Promise<void> {
  if (saving || !currentUser || !page?.saveable || !libraryLoaded) return;
  const input = readDestination();
  if (!input) {
    setStatus('Choose a bucket and category.', 'error');
    return;
  }

  // Shared buckets are separate documents, so the save itself only checks its
  // own; check everything the popup knows about first.
  const duplicate = findDuplicate(allBuckets(library).buckets, input.bookmark.url);
  if (duplicate) {
    setStatus(`Already saved in ${duplicate.bucketName} / ${duplicate.categoryName}.`, 'info');
    return;
  }

  saving = true;
  saveButton.disabled = true;
  setStatus('Saving…', '');
  try {
    const toShared = input.mode !== 'new-bucket' && isSharedDestination(library, input.bucketId);
    const result = input.mode !== 'new-bucket' && toShared
      ? await saveSharedBookmark(currentUser.uid, input)
      : await saveBookmark(currentUser.uid, input);
    if (result.status === 'duplicate') {
      setStatus(`Already saved in ${result.bucketName} / ${result.categoryName}.`, 'info');
      return;
    }
    if (result.status === 'missing') {
      library = await loadLibrary(currentUser.uid);
      renderDestination(await loadPrefs());
      renderList();
      setStatus('That bucket changed. Choose it again.', 'error');
      return;
    }
    const saved = result.data;
    library = toShared
      ? { ...library, shared: library.shared.map((bucket) => (bucket.id === result.bucketId ? saved.buckets[0] : bucket)) }
      : { ...library, personal: saved };
    const prefs = { bucketId: result.bucketId, categoryId: result.categoryId };
    try {
      await savePrefs(prefs);
    } catch {
      // The bookmark is already saved if remembering the folder fails.
    }
    renderDestination(prefs);
    renderList();
    setStatus(`Saved to ${result.bucketName} / ${result.categoryName}.`, 'ok');
  } catch (error) {
    setStatus(friendlySaveError(error), 'error');
  } finally {
    saving = false;
    saveButton.disabled = !page?.saveable || !libraryLoaded;
  }
}

function readDestination(): SaveInput | null {
  if (!page?.saveable) return null;
  const bookmark = createBookmark({
    title: page.title,
    url: page.url,
    description: page.description,
    tags: [],
    notes: '',
  });
  const buckets = destinationBuckets(library);
  if (buckets.length === 0) {
    return {
      mode: 'new-bucket',
      bucketName: newBucketInput.value,
      categoryName: newCategoryInput.value,
      bookmark,
    };
  }
  const bucket = buckets.find((item) => item.id === bucketSelect.value);
  if (!bucket) return null;
  const categories = activeCategories(bucket);
  if (categories.length === 0) {
    return {
      mode: 'new-category',
      bucketId: bucket.id,
      categoryName: newCategoryInput.value,
      bookmark,
    };
  }
  const category = categories.find((item) => item.id === categorySelect.value);
  if (!category) return null;
  return { mode: 'existing', bucketId: bucket.id, categoryId: category.id, bookmark };
}

function setStatus(text: string, kind: '' | 'ok' | 'info' | 'error'): void {
  saveStatus.textContent = text;
  saveStatus.className = kind ? `message ${kind}` : 'message';
}

async function persistDestination(): Promise<void> {
  if (bucketField.hidden) return;
  const categoryId = categoryField.hidden ? undefined : categorySelect.value;
  try {
    await savePrefs({ bucketId: bucketSelect.value, categoryId });
  } catch {
    // The choice still applies to the next save.
  }
}

async function loadPrefs(): Promise<Prefs> {
  const stored = await chrome.storage.local.get(PREFS_KEY);
  const value = stored[PREFS_KEY];
  if (!value || typeof value !== 'object') return {};
  const record = value as Prefs;
  return {
    bucketId: typeof record.bucketId === 'string' ? record.bucketId : undefined,
    categoryId: typeof record.categoryId === 'string' ? record.categoryId : undefined,
  };
}

async function savePrefs(prefs: Prefs): Promise<void> {
  const stored: Prefs = {};
  if (prefs.bucketId) stored.bucketId = prefs.bucketId;
  if (prefs.categoryId) stored.categoryId = prefs.categoryId;
  await chrome.storage.local.set({ [PREFS_KEY]: stored });
}

async function readPage(): Promise<PageInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!url || tab?.id == null) {
    return {
      url,
      title: 'This page',
      description: '',
      saveable: false,
      reason: 'Open a web page, then click the bookmark icon again.',
    };
  }
  if (!/^https?:/i.test(url)) {
    return {
      url,
      title: tab.title || url,
      description: '',
      saveable: false,
      reason: 'Only http and https pages can be saved.',
    };
  }

  let description = '';
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPageDescription,
    });
    if (typeof injected?.result === 'string') {
      description = injected.result.replace(/\s+/g, ' ').trim().slice(0, 2000);
    }
  } catch {
    description = '';
  }

  const title = (tab.title ?? '').trim() || hostnameOf(url);
  return { url, title: title.slice(0, 500), description, saveable: true };
}

function readPageDescription(): string {
  const element = document.querySelector('meta[name="description"]')
    ?? document.querySelector('meta[property="og:description"]');
  return element?.getAttribute('content')?.trim() ?? '';
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function fillSelect(select: HTMLSelectElement, options: { id: string; name: string }[], selectedId: string): void {
  select.replaceChildren();
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.name;
    select.append(element);
  }
  select.value = selectedId;
}

init();
