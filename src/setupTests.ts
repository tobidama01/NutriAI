import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock do IndexedDB global para os testes
const mockIDBDatabase = {
  transaction: vi.fn().mockReturnValue({
    objectStore: vi.fn().mockReturnValue({
      clear: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
      put: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
      get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
      getAll: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
      delete: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
    }),
  }),
  close: vi.fn(),
};

const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  result: mockIDBDatabase,
};

(globalThis as any).indexedDB = {
  open: vi.fn().mockReturnValue(mockIDBRequest),
  deleteDatabase: vi.fn(),
  cmp: vi.fn(),
  databases: vi.fn(),
} as any;
