const DB_NAME = "flowforge-exam-lab";
const DB_VERSION = 1;
const ITERATIONS = 120000;

let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("users")) {
        const users = db.createObjectStore("users", { keyPath: "username" });
        users.createIndex("email", "email", { unique: true });
      }
      if (!db.objectStoreNames.contains("attempts")) {
        const attempts = db.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("username", "username", { unique: false });
        attempts.createIndex("completedAt", "completedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("bookmarks")) {
        const bookmarks = db.createObjectStore("bookmarks", { keyPath: "key" });
        bookmarks.createIndex("username", "username", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  const result = callback(transaction.objectStore(storeName));
  return Promise.resolve(result);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derivePassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    keyMaterial,
    256
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) };
}

export async function createUser({ username, displayName, email, password }) {
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await getUser(normalizedUsername);
  if (existingUser) throw new Error("That username is already in use.");

  const db = await openDatabase();
  const emailMatch = await requestToPromise(db.transaction("users").objectStore("users").index("email").get(normalizedEmail));
  if (emailMatch) throw new Error("An account already uses that email address.");

  const credentials = await derivePassword(password);
  const user = {
    username: normalizedUsername,
    displayName: displayName.trim(),
    email: normalizedEmail,
    ...credentials,
    xp: 0,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
  await withStore("users", "readwrite", (store) => requestToPromise(store.add(user)));
  return sanitizeUser(user);
}

export async function authenticate(username, password) {
  const user = await getUser(username.trim().toLowerCase());
  if (!user) return null;
  const credentials = await derivePassword(password, base64ToBytes(user.salt));
  if (credentials.hash !== user.hash) return null;
  user.lastLoginAt = new Date().toISOString();
  await withStore("users", "readwrite", (store) => requestToPromise(store.put(user)));
  return sanitizeUser(user);
}

export async function ensureDemoUser() {
  const existing = await getUser("architect");
  if (existing) return;
  await createUser({
    username: "architect",
    displayName: "Integration Architect",
    email: "architect@flowforge.local",
    password: "Forge123!"
  });
}

export async function getUser(username) {
  return withStore("users", "readonly", (store) => requestToPromise(store.get(username)));
}

export async function updateUserProgress(username, xp) {
  const user = await getUser(username);
  if (!user) return;
  user.xp = Math.max(user.xp || 0, xp);
  await withStore("users", "readwrite", (store) => requestToPromise(store.put(user)));
}

export async function saveAttempt(attempt) {
  await withStore("attempts", "readwrite", (store) => requestToPromise(store.put(attempt)));
}

export async function getAttempts(username) {
  const attempts = await withStore("attempts", "readonly", (store) =>
    requestToPromise(store.index("username").getAll(username))
  );
  return attempts.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export async function saveBookmark(username, questionId, note = "") {
  const key = `${username}:${questionId}`;
  await withStore("bookmarks", "readwrite", (store) =>
    requestToPromise(store.put({ key, username, questionId, note, createdAt: new Date().toISOString() }))
  );
}

export async function removeBookmark(username, questionId) {
  await withStore("bookmarks", "readwrite", (store) =>
    requestToPromise(store.delete(`${username}:${questionId}`))
  );
}

export async function getBookmarks(username) {
  const records = await withStore("bookmarks", "readonly", (store) =>
    requestToPromise(store.index("username").getAll(username))
  );
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function clearUserData(username) {
  const attempts = await getAttempts(username);
  const bookmarks = await getBookmarks(username);
  const db = await openDatabase();
  const transaction = db.transaction(["attempts", "bookmarks"], "readwrite");
  attempts.forEach((attempt) => transaction.objectStore("attempts").delete(attempt.id));
  bookmarks.forEach((bookmark) => transaction.objectStore("bookmarks").delete(bookmark.key));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function exportUserData(username) {
  const user = await getUser(username);
  const attempts = await getAttempts(username);
  const bookmarks = await getBookmarks(username);
  return {
    exportedAt: new Date().toISOString(),
    profile: sanitizeUser(user),
    attempts,
    bookmarks
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { hash, salt, ...safeUser } = user;
  return safeUser;
}
