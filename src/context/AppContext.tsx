import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import type { Meal, NutritionTargets, TabName, Workout } from '../types';
import { 
  getMeals, 
  getSettingsFromDB, 
  saveSettingsToDB, 
  saveMeal, 
  deleteMealFromDB, 
  clearAllDBData,
  getWorkouts,
  saveWorkout,
  deleteWorkoutFromDB
} from '../services/db';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { extractMealsFromChatHistory, type ExtractedMeal } from '../services/gemini';
import { logger } from '../utils/logger';

interface AppContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  modelName: string;
  setModelName: (name: string) => void;
  customContext: string;
  setCustomContext: (ctx: string) => void;
  targets: NutritionTargets;
  setTargets: (t: NutritionTargets) => void;
  meals: Meal[];
  workouts: Workout[];
  weight: number;
  setWeight: (w: number) => void;
  height: number;
  setHeight: (h: number) => void;
  isLoading: boolean;
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
  handleSaveMeal: (mealType: string, items: Meal['items']) => Promise<void>;
  handleDeleteMeal: (id: string) => Promise<void>;
  handleSaveWorkout: (workoutNotes: string, cardioNotes: string, caloriesWorkout: number, caloriesCardio: number, totalExpenditure: number, explanation: string) => Promise<void>;
  handleDeleteWorkout: (id: string) => Promise<void>;
  handleClearData: () => Promise<void>;
  saveSettings: (key: string, model: string, context: string, targets: NutritionTargets, weight: number, height: number) => Promise<void>;
  handleImportMealsFromText: (text: string) => Promise<number>;
  saveExtractedMeals: (extractedMeals: ExtractedMeal[]) => Promise<number>;
  
  // Supabase Auth Integration
  session: any;
  user: any;
  logout: () => Promise<void>;
  loadAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const savedTab = sessionStorage.getItem('nutri_active_tab') as TabName | null;
  const [activeTab, setActiveTab] = useState<TabName>(savedTab || 'dashboard');
  
  const [apiKey, setApiKey] = useState<string>('');
  const [modelName, setModelName] = useState<string>('gemini-2.0-flash');
  const [customContext, setCustomContext] = useState<string>('');
  const [targets, setTargets] = useState<NutritionTargets>({
    calories: 2000,
    carbs: 200,
    protein: 120,
    fat: 60,
    fiber: 25,
    sodium: 2000
  });
  
  const [weight, setWeight] = useState<number>(75);
  const [height, setHeight] = useState<number>(175);
  
  const [meals, setMeals] = useState<Meal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Estados de Sessão do Supabase
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  const setActiveTabPersisted = (tab: TabName) => {
    setActiveTab(tab);
    sessionStorage.setItem('nutri_active_tab', tab);
  };

  // Mantém uma referência atualizada do estado local na memória para migração
  const stateRef = useRef({ apiKey, weight, height, modelName, customContext, targets, meals, workouts });
  useEffect(() => {
    stateRef.current = { apiKey, weight, height, modelName, customContext, targets, meals, workouts };
  }, [apiKey, weight, height, modelName, customContext, targets, meals, workouts]);

  // Carrega todos os dados do banco de dados (pode ser Supabase ou IndexedDB dependendo da sessão)
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const dbSettings = await getSettingsFromDB();
      if (dbSettings) {
        setApiKey(dbSettings.apiKey || '');
        setModelName(dbSettings.modelName || 'gemini-2.0-flash');
        setCustomContext(dbSettings.customContext || '');
        setWeight(dbSettings.weight ?? 75);
        setHeight(dbSettings.height ?? 175);
        
        if (dbSettings.targets) {
          setTargets({
            calories: dbSettings.targets.calories ?? 2000,
            carbs: dbSettings.targets.carbs ?? 200,
            protein: dbSettings.targets.protein ?? 120,
            fat: dbSettings.targets.fat ?? 60,
            fiber: dbSettings.targets.fiber ?? 25,
            sodium: dbSettings.targets.sodium ?? 2000
          });
        }
      }

      // Carrega refeições
      const dbMeals = await getMeals();
      setMeals(dbMeals || []);

      // Carrega treinos (workouts)
      const dbWorkouts = await getWorkouts();
      setWorkouts(dbWorkouts || []);
    } catch (err) {
      logger.error('Erro ao ler dados do banco no AppProvider:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Inicialização e Monitoramento de Sessão do Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Caso não esteja configurado, apenas carrega do IndexedDB
      loadAllData();
      return;
    }

    // Carrega sessão atual no início
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadAllData();
    });

    // Escuta mudanças de sessão
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session) {
        const userId = session.user.id;
        const localData = stateRef.current;

        // Migração de dados locais caso o usuário logado ainda não tenha dados no Supabase
        try {
          // 1. Migração do Perfil
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
          if (profile && !profile.gemini_api_key && localData.apiKey) {
            await supabase.from('profiles').update({
              gemini_api_key: localData.apiKey,
              weight: localData.weight,
              height: localData.height,
              model_name: localData.modelName,
              custom_context: localData.customContext,
              targets: localData.targets
            }).eq('id', userId);
          }

          // 2. Migração de Refeições
          if (localData.meals.length > 0) {
            const { data: remoteMeals } = await supabase.from('meals').select('id').eq('user_id', userId).limit(1);
            if (!remoteMeals || remoteMeals.length === 0) {
              const mealsToInsert = localData.meals.map(m => ({
                id: m.id,
                user_id: userId,
                timestamp: m.timestamp,
                type: m.type,
                items: m.items
              }));
              await supabase.from('meals').insert(mealsToInsert);
            }
          }

          // 3. Migração de Treinos
          if (localData.workouts.length > 0) {
            const { data: remoteWorkouts } = await supabase.from('workouts').select('id').eq('user_id', userId).limit(1);
            if (!remoteWorkouts || remoteWorkouts.length === 0) {
              const workoutsToInsert = localData.workouts.map(w => ({
                id: w.id,
                user_id: userId,
                timestamp: w.timestamp,
                weight_kg: w.weightKg,
                height_cm: w.heightCm,
                workout_notes: w.workoutNotes,
                cardio_notes: w.cardioNotes,
                calories_burned_workout: w.caloriesBurnedWorkout,
                calories_burned_cardio: w.caloriesBurnedCardio,
                total_daily_expenditure: w.totalDailyExpenditure,
                ia_explanation: w.iaExplanation
              }));
              await supabase.from('workouts').insert(workoutsToInsert);
            }
          }
        } catch (err) {
          logger.error('Erro na migração automática para Supabase:', err);
        }

        // Recarrega todos os dados
        await loadAllData();
      } else {
        // Se deslogar, limpa a memória para segurança do usuário
        setApiKey('');
        setModelName('gemini-2.0-flash');
        setCustomContext('');
        setWeight(75);
        setHeight(175);
        setTargets({
          calories: 2000,
          carbs: 200,
          protein: 120,
          fat: 60,
          fiber: 25,
          sodium: 2000
        });
        setMeals([]);
        setWorkouts([]);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    if (isSupabaseConfigured) {
      setIsLoading(true);
      await supabase.auth.signOut();
    }
  };

  const handleSaveMeal = async (mealType: string, items: Meal['items']) => {
    const newMeal: Meal = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: mealType as any,
      items: items,
    };

    const updatedMeals = [newMeal, ...meals];
    setMeals(updatedMeals);
    
    try {
      await saveMeal(newMeal);
    } catch (e) {
      logger.error('Erro ao salvar refeição', e);
      throw e;
    }
  };

  const handleDeleteMeal = async (id: string) => {
    const updatedMeals = meals.filter(meal => meal.id !== id);
    setMeals(updatedMeals);
    try {
      await deleteMealFromDB(id);
    } catch (e) {
      logger.error('Erro ao deletar refeição', e);
      throw e;
    }
  };

  const handleSaveWorkout = async (
    workoutNotes: string,
    cardioNotes: string,
    caloriesWorkout: number,
    caloriesCardio: number,
    totalExpenditure: number,
    explanation: string
  ) => {
    const newWorkout: Workout = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      weightKg: weight,
      heightCm: height,
      workoutNotes,
      cardioNotes,
      caloriesBurnedWorkout: caloriesWorkout,
      caloriesBurnedCardio: caloriesCardio,
      totalDailyExpenditure: totalExpenditure,
      iaExplanation: explanation
    };

    const updatedWorkouts = [newWorkout, ...workouts];
    setWorkouts(updatedWorkouts);

    try {
      await saveWorkout(newWorkout);
    } catch (e) {
      logger.error('Erro ao salvar treino', e);
      throw e;
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    const updatedWorkouts = workouts.filter(w => w.id !== id);
    setWorkouts(updatedWorkouts);
    try {
      await deleteWorkoutFromDB(id);
    } catch (e) {
      logger.error('Erro ao deletar treino', e);
      throw e;
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllDBData();
    } catch (e) {
      logger.error('Erro ao limpar banco de dados', e);
    }
    localStorage.clear();
    sessionStorage.clear();
    setApiKey('');
    setModelName('gemini-2.0-flash');
    setCustomContext('');
    setWeight(75);
    setHeight(175);
    setTargets({
      calories: 2000,
      carbs: 200,
      protein: 120,
      fat: 60,
      fiber: 25,
      sodium: 2000
    });
    setMeals([]);
    setWorkouts([]);
    setActiveTabPersisted('dashboard');
  };

  const saveSettings = async (
    key: string,
    model: string,
    context: string,
    newTargets: NutritionTargets,
    newWeight: number,
    newHeight: number
  ) => {
    setApiKey(key);
    setModelName(model);
    setCustomContext(context);
    setTargets(newTargets);
    setWeight(newWeight);
    setHeight(newHeight);

    try {
      await saveSettingsToDB({
        apiKey: key,
        modelName: model,
        customContext: context,
        targets: {
          calories: newTargets.calories,
          carbs: newTargets.carbs,
          protein: newTargets.protein,
          fat: newTargets.fat,
          fiber: newTargets.fiber ?? 25,
          sodium: newTargets.sodium ?? 2000
        },
        weight: newWeight,
        height: newHeight
      });
    } catch (err) {
      logger.error('Erro ao salvar configurações', err);
      throw err;
    }

    localStorage.setItem('nutri_model_name', model);
    localStorage.setItem('nutri_custom_context', context);
    localStorage.setItem('nutri_targets', JSON.stringify(newTargets));
    localStorage.setItem('nutri_weight', newWeight.toString());
    localStorage.setItem('nutri_height', newHeight.toString());
  };

  const saveExtractedMeals = async (extractedMeals: ExtractedMeal[]): Promise<number> => {
    if (extractedMeals.length === 0) {
      return 0;
    }

    const importedMeals: Meal[] = extractedMeals.map(extracted => {
      let ts = Number(extracted.timestamp);
      const now = Date.now();
      
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const endOfToday = new Date().setHours(23, 59, 59, 999);
      
      if (isNaN(ts) || ts < startOfToday || ts > endOfToday) {
        ts = now;
      }

      return {
        id: crypto.randomUUID(),
        timestamp: ts,
        type: extracted.type as any,
        items: extracted.items.map(item => ({
          foodName: item.foodName,
          weightGrams: item.weightGrams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber || 0,
          sodium: item.sodium || 0
        }))
      };
    });

    await Promise.all(importedMeals.map(meal => saveMeal(meal)));

    setMeals(prev => {
      const merged = [...importedMeals, ...prev];
      return merged.sort((a, b) => b.timestamp - a.timestamp);
    });

    return importedMeals.length;
  };

  const handleImportMealsFromText = async (chatText: string): Promise<number> => {
    const activeKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
    if (!activeKey) {
      throw new Error('Chave de API do Gemini não configurada.');
    }

    try {
      const result = await extractMealsFromChatHistory(activeKey, chatText, modelName);
      if (!result.meals || result.meals.length === 0) {
        return 0;
      }
      return await saveExtractedMeals(result.meals);
    } catch (err) {
      logger.error('Erro ao importar refeições do chat', err);
      throw err;
    }
  };

  return (
    <AppContext.Provider
      value={{
        apiKey: apiKey || import.meta.env.VITE_GEMINI_API_KEY || '',
        setApiKey,
        modelName,
        setModelName,
        customContext,
        setCustomContext,
        targets,
        setTargets,
        meals,
        workouts,
        weight,
        setWeight,
        height,
        setHeight,
        isLoading,
        activeTab,
        setActiveTab: setActiveTabPersisted,
        handleSaveMeal,
        handleDeleteMeal,
        handleSaveWorkout,
        handleDeleteWorkout,
        handleClearData,
        saveSettings,
        handleImportMealsFromText,
        saveExtractedMeals,
        
        session,
        user,
        logout,
        loadAllData
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser utilizado dentro de AppProvider');
  return ctx;
}
