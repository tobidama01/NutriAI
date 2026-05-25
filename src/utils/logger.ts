// Centralized logger utility for NutriScale AI

const isDev = import.meta.env.DEV;

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDev) {
      console.error(`[NutriAI] ${message}`, error);
    } else {
      // Em produção, loga apenas a mensagem amigável sem expor stack traces ou chaves
      console.error(`[NutriAI] ${message}`);
    }
  },
  warn: (message: string) => {
    if (isDev) {
      console.warn(`[NutriAI] ${message}`);
    }
  },
  info: (message: string) => {
    if (isDev) {
      console.info(`[NutriAI] ${message}`);
    }
  }
};
