// Word: the few ways every screen builds and finds the page's elements.

export const $ = (id) => document.getElementById(id);

// A new element with `props` (textContent, className, …) set on it
export const create = (tag, props = {}) => Object.assign(document.createElement(tag), props);

// A word as tiles, one <b> a letter
export const tiles = (word) => [...word].map((letter) => create("b", { textContent: letter }));
