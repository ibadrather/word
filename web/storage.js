// Word's saves in this browser, one key for each part of the page (each file keeps its own STORAGE_KEY). Storage can be
// missing, full or turned off (a private window), and a save can be from an older version or damaged, so reading never
// throws and a write that fails only means the next load starts afresh.

// The text saved under `key`, or null when there's none or it can't be read
export function readText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key, text) {
  try {
    localStorage.setItem(key, text);
  } catch {}
}

// The object saved under `key` as JSON, or {} when there's none, it can't be read or it isn't an object
export function readObject(key) {
  try {
    const value = JSON.parse(readText(key));
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// A plain object: not null, not an array
export const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
