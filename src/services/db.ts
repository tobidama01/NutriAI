// IndexedDB database manager for NutriScale AI
import type { Meal, Workout } from '../types';

const DB_NAME = 'nutriscale_db';
const DB_VERSION = 3; // Incrementado de 2 para 3 para suportar a store de workouts (treinos)

export interface DBChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface DBSettings {
  apiKey: string;
  modelName: string;
  customContext: string;
  targets: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    fiber?: number;
    sodium?: number;
  };
  weight?: number;  // Salvo para cálculo de gasto calórico (item 4.1)
  height?: number;  // Salvo para cálculo de gasto calórico (item 4.1)
}

let dbInstance: IDBDatabase | null = null;

/**
 * Fecha a conexão ativa do singleton com o IndexedDB.
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Abre a conexão com o banco de dados IndexedDB de forma segura com Singleton.
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      
      // Versão 1: Inicialização básica
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('meals')) {
          db.createObjectStore('meals', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chat_history')) {
          db.createObjectStore('chat_history', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
      
      // Versão 2: Adiciona o índice 'timestamp' para a tabela meals
      if (oldVersion < 2) {
        const mealsStore = request.transaction!.objectStore('meals');
        if (!mealsStore.indexNames.contains('timestamp')) {
          mealsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      }

      // Versão 3: Adiciona a tabela de treinos (workouts)
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('workouts')) {
          db.createObjectStore('workouts', { keyPath: 'id' });
        }
      }
    };
  });
}

// --- Operações de Refeições ---

export async function saveMeal(meal: Meal): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readwrite');
    const store = transaction.objectStore('meals');
    const request = store.put(meal);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMeals(): Promise<Meal[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readonly');
    const store = transaction.objectStore('meals');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const meals = request.result as Meal[];
      resolve(meals.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Consulta refeições dentro de um período específico utilizando o index de timestamp (altamente performático).
 */
export async function getMealsByDateRange(
  startTimestamp: number,
  endTimestamp: number
): Promise<Meal[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readonly');
    const store = transaction.objectStore('meals');
    const index = store.index('timestamp');
    const range = IDBKeyRange.bound(startTimestamp, endTimestamp);
    const request = index.getAll(range);
    
    request.onsuccess = () => {
      const meals = request.result as Meal[];
      resolve(meals.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retorna as refeições mais recentes (padrão 30 dias) para economizar memória em mobile.
 */
export async function getRecentMeals(days: number = 30): Promise<Meal[]> {
  const startTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
  return getMealsByDateRange(startTimestamp, Date.now());
}

export async function deleteMealFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readwrite');
    const store = transaction.objectStore('meals');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Operações de Chat ---

export async function saveChatHistory(history: DBChatMessage[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chat_history', 'readwrite');
    const store = transaction.objectStore('chat_history');
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    
    store.clear();
    for (const msg of history) {
      store.put(msg);
    }
  });
}

export async function getChatHistory(): Promise<DBChatMessage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chat_history', 'readonly');
    const store = transaction.objectStore('chat_history');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const history = request.result as DBChatMessage[];
      resolve(history.sort((a, b) => a.timestamp - b.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

// --- Operações de Configurações ---

export async function saveSettingsToDB(settings: DBSettings): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key: 'app_config', ...settings });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSettingsFromDB(): Promise<DBSettings | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get('app_config');
    
    request.onsuccess = () => {
      if (request.result) {
        const { key, ...settings } = request.result;
        resolve(settings as DBSettings);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// --- Operações de Treinos (Workouts) ---

export async function saveWorkout(workout: Workout): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workouts', 'readwrite');
    const store = transaction.objectStore('workouts');
    const request = store.put(workout);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getWorkouts(): Promise<Workout[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workouts', 'readonly');
    const store = transaction.objectStore('workouts');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const workouts = request.result as Workout[];
      resolve(workouts.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteWorkoutFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workouts', 'readwrite');
    const store = transaction.objectStore('workouts');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Reset Global ---

export async function clearAllDBData(): Promise<void> {
  closeDB();
  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores = ['meals', 'chat_history', 'settings', 'workouts'].filter(name => db.objectStoreNames.contains(name));
    const transaction = db.transaction(stores, 'readwrite');
    
    stores.forEach(name => {
      transaction.objectStore(name).clear();
    });
    
    transaction.oncomplete = () => {
      closeDB();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
