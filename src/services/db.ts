// IndexedDB database manager for NutriScale AI - with Supabase Sync
import type { Meal, Workout } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const DB_NAME = 'nutriscale_db';
const DB_VERSION = 3; 

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
  weight?: number; 
  height?: number; 
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
      
      if (oldVersion < 2) {
        const mealsStore = request.transaction!.objectStore('meals');
        if (!mealsStore.indexNames.contains('timestamp')) {
          mealsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('workouts')) {
          db.createObjectStore('workouts', { keyPath: 'id' });
        }
      }
    };
  });
}

/**
 * Retorna o ID do usuário atualmente logado no Supabase de forma assíncrona.
 */
async function getActiveUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch (err) {
    console.warn('Erro ao obter sessão do Supabase:', err);
    return null;
  }
}

// --- Operações de Refeições ---

export async function saveMeal(meal: Meal): Promise<void> {
  // 1. Salva no IndexedDB local
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('meals', 'readwrite');
    const store = transaction.objectStore('meals');
    const request = store.put(meal);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Salva no Supabase se logado
  const userId = await getActiveUserId();
  if (userId) {
    const { error } = await supabase
      .from('meals')
      .upsert({
        id: meal.id,
        user_id: userId,
        timestamp: meal.timestamp,
        type: meal.type,
        items: meal.items
      });
    if (error) {
      console.error('Erro ao sincronizar saveMeal no Supabase:', error);
      throw error;
    }
  }
}

export async function getMeals(): Promise<Meal[]> {
  const userId = await getActiveUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });
      
      if (error) throw error;

      if (data) {
        const meals: Meal[] = data.map((item: any) => ({
          id: item.id,
          timestamp: Number(item.timestamp),
          type: item.type as any,
          items: item.items
        }));
        
        // Sobrescreve local para sincronização de cache offline
        const db = await openDB();
        const transaction = db.transaction('meals', 'readwrite');
        const store = transaction.objectStore('meals');
        
        await new Promise<void>((resolve, reject) => {
          const clearReq = store.clear();
          clearReq.onsuccess = () => {
            if (meals.length === 0) {
              resolve();
              return;
            }
            let count = 0;
            meals.forEach(m => {
              const req = store.put(m);
              req.onsuccess = () => {
                count++;
                if (count === meals.length) resolve();
              };
              req.onerror = () => reject(req.error);
            });
          };
          clearReq.onerror = () => reject(clearReq.error);
        });
        
        return meals;
      }
    } catch (err) {
      console.warn('Erro ao buscar refeições do Supabase, fallback para IndexedDB local:', err);
    }
  }

  // Fallback local
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

export async function getMealsByDateRange(
  startTimestamp: number,
  endTimestamp: number
): Promise<Meal[]> {
  // Como temos RLS e cache no local, podemos simplesmente ler localmente ou
  // consultar no local após a sincronização inicial.
  // Para fins de performance e suporte offline, filtramos do IndexedDB local sincronizado.
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

export async function getRecentMeals(days: number = 30): Promise<Meal[]> {
  const startTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
  return getMealsByDateRange(startTimestamp, Date.now());
}

export async function deleteMealFromDB(id: string): Promise<void> {
  // 1. Deleta localmente
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('meals', 'readwrite');
    const store = transaction.objectStore('meals');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Deleta no Supabase se logado
  const userId = await getActiveUserId();
  if (userId) {
    const { error } = await supabase
      .from('meals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.error('Erro ao sincronizar deleteMeal no Supabase:', error);
      throw error;
    }
  }
}

// --- Operações de Chat ---

export async function saveChatHistory(history: DBChatMessage[]): Promise<void> {
  // 1. Salva localmente
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
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

  // 2. Sincroniza com Supabase se logado (deleta antigas e insere novas de forma simples)
  const userId = await getActiveUserId();
  if (userId) {
    try {
      const { error: deleteError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) throw deleteError;

      if (history.length > 0) {
        const messagesToInsert = history.map(msg => ({
          id: msg.id,
          user_id: userId,
          sender: msg.sender,
          text: msg.text,
          timestamp: msg.timestamp
        }));
        
        const { error: insertError } = await supabase
          .from('chat_messages')
          .insert(messagesToInsert);
          
        if (insertError) throw insertError;
      }
    } catch (err) {
      console.error('Erro ao sincronizar chat_history no Supabase:', err);
    }
  }
}

export async function getChatHistory(): Promise<DBChatMessage[]> {
  const userId = await getActiveUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: true });
      
      if (error) throw error;

      if (data) {
        const history: DBChatMessage[] = data.map((item: any) => ({
          id: item.id,
          sender: item.sender as 'user' | 'ai',
          text: item.text,
          timestamp: Number(item.timestamp)
        }));
        
        // Cache no IndexedDB
        const db = await openDB();
        const transaction = db.transaction('chat_history', 'readwrite');
        const store = transaction.objectStore('chat_history');
        
        await new Promise<void>((resolve, reject) => {
          store.clear();
          if (history.length === 0) {
            resolve();
            return;
          }
          let count = 0;
          history.forEach(msg => {
            const req = store.put(msg);
            req.onsuccess = () => {
              count++;
              if (count === history.length) resolve();
            };
            req.onerror = () => reject(req.error);
          });
        });
        
        return history;
      }
    } catch (err) {
      console.warn('Erro ao carregar chat do Supabase, fallback para IndexedDB local:', err);
    }
  }

  // Fallback local
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
  // 1. Salva localmente
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({ key: 'app_config', ...settings });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Salva no Supabase se logado
  const userId = await getActiveUserId();
  if (userId) {
    const { error } = await supabase
      .from('profiles')
      .update({
        weight: settings.weight,
        height: settings.height,
        gemini_api_key: settings.apiKey,
        model_name: settings.modelName,
        custom_context: settings.customContext,
        targets: settings.targets
      })
      .eq('id', userId);
      
    if (error) {
      console.error('Erro ao sincronizar perfis no Supabase:', error);
      throw error;
    }
  }
}

export async function getSettingsFromDB(): Promise<DBSettings | null> {
  const userId = await getActiveUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Cria perfil padrão no primeiro acesso caso o trigger atrase
        const defaultSettings = {
          weight: 75.0,
          height: 175.0,
          gemini_api_key: null,
          model_name: 'gemini-2.5-flash',
          custom_context: '',
          targets: { calories: 2000, carbs: 200, protein: 120, fat: 60, fiber: 25, sodium: 2000 }
        };
        await supabase.from('profiles').insert({ id: userId, ...defaultSettings });
        
        return {
          apiKey: '',
          modelName: 'gemini-2.5-flash',
          customContext: '',
          targets: defaultSettings.targets,
          weight: 75,
          height: 175
        };
      } else if (error) {
        throw error;
      }

      if (data) {
        const settings: DBSettings = {
          apiKey: data.gemini_api_key || '',
          modelName: data.model_name || 'gemini-2.5-flash',
          customContext: data.custom_context || '',
          targets: data.targets || { calories: 2000, carbs: 200, protein: 120, fat: 60, fiber: 25, sodium: 2000 },
          weight: data.weight ? Number(data.weight) : 75,
          height: data.height ? Number(data.height) : 175
        };

        // Cache local
        const db = await openDB();
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        await new Promise<void>((resolve, reject) => {
          const request = store.put({ key: 'app_config', ...settings });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });

        return settings;
      }
    } catch (err) {
      console.warn('Erro ao carregar perfil do Supabase, fallback para IndexedDB local:', err);
    }
  }

  // Fallback local
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
  // 1. Salva no IndexedDB local
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('workouts', 'readwrite');
    const store = transaction.objectStore('workouts');
    const request = store.put(workout);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Salva no Supabase se logado
  const userId = await getActiveUserId();
  if (userId) {
    const { error } = await supabase
      .from('workouts')
      .upsert({
        id: workout.id,
        user_id: userId,
        timestamp: workout.timestamp,
        weight_kg: workout.weightKg,
        height_cm: workout.heightCm,
        workout_notes: workout.workoutNotes,
        cardio_notes: workout.cardioNotes,
        calories_burned_workout: workout.caloriesBurnedWorkout,
        calories_burned_cardio: workout.caloriesBurnedCardio,
        total_daily_expenditure: workout.totalDailyExpenditure,
        ia_explanation: workout.iaExplanation
      });
    if (error) {
      console.error('Erro ao sincronizar saveWorkout no Supabase:', error);
      throw error;
    }
  }
}

export async function getWorkouts(): Promise<Workout[]> {
  const userId = await getActiveUserId();
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });
      
      if (error) throw error;

      if (data) {
        const workouts: Workout[] = data.map((item: any) => ({
          id: item.id,
          timestamp: Number(item.timestamp),
          weightKg: Number(item.weight_kg),
          heightCm: Number(item.height_cm),
          workoutNotes: item.workout_notes,
          cardioNotes: item.cardio_notes,
          caloriesBurnedWorkout: Number(item.calories_burned_workout),
          caloriesBurnedCardio: Number(item.calories_burned_cardio),
          totalDailyExpenditure: Number(item.total_daily_expenditure),
          iaExplanation: item.ia_explanation
        }));
        
        // Cache no IndexedDB
        const db = await openDB();
        const transaction = db.transaction('workouts', 'readwrite');
        const store = transaction.objectStore('workouts');
        await new Promise<void>((resolve, reject) => {
          const clearReq = store.clear();
          clearReq.onsuccess = () => {
            if (workouts.length === 0) {
              resolve();
              return;
            }
            let count = 0;
            workouts.forEach(w => {
              const req = store.put(w);
              req.onsuccess = () => {
                count++;
                if (count === workouts.length) resolve();
              };
              req.onerror = () => reject(req.error);
            });
          };
          clearReq.onerror = () => reject(clearReq.error);
        });
        
        return workouts;
      }
    } catch (err) {
      console.warn('Erro ao buscar treinos do Supabase, fallback para IndexedDB local:', err);
    }
  }

  // Fallback local
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
  // 1. Deleta localmente
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('workouts', 'readwrite');
    const store = transaction.objectStore('workouts');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Deleta no Supabase se logado
  const userId = await getActiveUserId();
  if (userId) {
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.error('Erro ao sincronizar deleteWorkout no Supabase:', error);
      throw error;
    }
  }
}

// --- Reset Global ---

export async function clearAllDBData(): Promise<void> {
  const userId = await getActiveUserId();
  if (userId) {
    try {
      await Promise.all([
        supabase.from('meals').delete().eq('user_id', userId),
        supabase.from('workouts').delete().eq('user_id', userId),
        supabase.from('chat_messages').delete().eq('user_id', userId),
        supabase.from('profiles').update({
          weight: 75.0,
          height: 175.0,
          gemini_api_key: null,
          model_name: 'gemini-2.5-flash',
          custom_context: '',
          targets: { calories: 2000, carbs: 200, protein: 120, fat: 60, fiber: 25, sodium: 2000 }
        }).eq('id', userId)
      ]);
    } catch (err) {
      console.error('Erro ao limpar dados do usuário no Supabase:', err);
    }
  }

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
