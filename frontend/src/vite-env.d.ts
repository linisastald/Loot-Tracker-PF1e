/// <reference types="node" />
/// <reference types="vite/client" />

// Explicitly pull in Node global types (process, global). @types/node 26 is no
// longer auto-included as a global type package under this tsconfig, so the
// reference is required for the few Node globals the app touches
// (process.env in api.ts / ErrorBoundary, global in setupTests).
