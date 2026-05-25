// IndexedDB database manager for NutriScale AI

const DB_NAME = 'nutriscale_db';
const DB_VERSION = 1;

export interface DBMealItem {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DBMeal {
  id: string;
  timestamp: number;
  type: string;
  items: DBMealItem[];
}

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
  };
}

/**
 * Abre a conexão com o banco de dados IndexedDB.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      
      // Store de Refeições
      if (!db.objectStoreNames.contains('meals')) {
        db.createObjectStore('meals', { keyPath: 'id' });
      }
      
      // Store de Chat
      if (!db.objectStoreNames.contains('chat_history')) {
        db.createObjectStore('chat_history', { keyPath: 'id' });
      }
      
      // Store de Configurações
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// --- Operações de Refeições ---

export async function saveMeal(meal: DBMeal): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readwrite');
    const store = transaction.objectStore(transaction.objectStoreNames[0] || 'meals');
    const request = store.put(meal);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMeals(): Promise<DBMeal[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meals', 'readonly');
    const store = transaction.objectStore('meals');
    const request = store.getAll();
    
    request.onsuccess = () => {
      // Ordena por timestamp desc (mais recentes primeiro)
      const meals = request.result as DBMeal[];
      resolve(meals.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
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
    
    // Limpa o store antigo antes de salvar a nova lista completa
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      let count = 0;
      if (history.length === 0) {
        resolve();
        return;
      }
      
      for (const msg of history) {
        const req = store.put(msg);
        req.onsuccess = () => {
          count++;
          if (count === history.length) {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      }
    };
    clearRequest.onerror = () => reject(clearRequest.error);
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

// --- Reset Global ---

export async function clearAllDBData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['meals', 'chat_history', 'settings'], 'readwrite');
    
    transaction.objectStore('meals').clear();
    transaction.objectStore('chat_history').clear();
    transaction.objectStore('settings').clear();
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
