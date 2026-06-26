import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Node 22+ has a built-in localStorage that may lack .clear() or differ from
// jsdom's implementation. Ensure the global localStorage has all required methods.
if (typeof localStorage !== 'undefined' && typeof localStorage.clear !== 'function') {
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });
}

// Mock global objects that might be needed in tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver and ResizeObserver as real classes so they are
// constructable with `new` (e.g. MUI's Tabs does `new ResizeObserver(...)`).
// Vitest 4 no longer allows `new` on a vi.fn() backed by an arrow-function
// implementation ("X is not a constructor"), so a class is required.
global.IntersectionObserver = class IntersectionObserver {
  root = null
  rootMargin = ''
  thresholds: ReadonlyArray<number> = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
} as unknown as typeof IntersectionObserver

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver