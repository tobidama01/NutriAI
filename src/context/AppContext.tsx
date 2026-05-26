import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
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
  
  // Dados de peso e altura (item 4.1)
  const [weight, setWeight] = useState<number>(75);
  const [height, setHeight] = useState<number>(175);
  
  const [meals, setMeals] = useState<Meal[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveTabPersisted = (tab: TabName) => {
    setActiveTab(tab);
    sessionStorage.setItem('nutri_active_tab', tab);
  };

  // Carrega os dados salvos do IndexedDB ao iniciar o app (com fallback para localStorage)
  useEffect(() => {
    async function loadData() {
      try {
        const dbSettings = await getSettingsFromDB();
        let currentWeight = 75;
        let currentHeight = 175;
        
        if (dbSettings) {
          setApiKey(dbSettings.apiKey || '');
          setModelName(dbSettings.modelName || 'gemini-2.0-flash');
          setCustomContext(dbSettings.customContext || '');
          currentWeight = dbSettings.weight ?? 75;
          currentHeight = dbSettings.height ?? 175;
          setWeight(currentWeight);
          setHeight(currentHeight);
          
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
        } else {
          // Fallback para localStorage legado no primeiro acesso
          const savedKey = localStorage.getItem('nutri_api_key') || '';
          const savedModel = localStorage.getItem('nutri_model_name') || 'gemini-2.0-flash';
          const savedContext = localStorage.getItem('nutri_custom_context') || '';
          const savedTargets = localStorage.getItem('nutri_targets');
          const savedWeight = localStorage.getItem('nutri_weight');
          const savedHeight = localStorage.getItem('nutri_height');

          if (savedWeight) {
            currentWeight = parseFloat(savedWeight) || 75;
            setWeight(currentWeight);
          }
          if (savedHeight) {
            currentHeight = parseFloat(savedHeight) || 175;
            setHeight(currentHeight);
          }

          let loadedTargets = { calories: 2000, carbs: 200, protein: 120, fat: 60, fiber: 25, sodium: 2000 };

          if (savedKey) setApiKey(savedKey);
          if (savedModel) setModelName(savedModel);
          if (savedContext) setCustomContext(savedContext);
          if (savedTargets) {
            try {
              const parsedTargets = JSON.parse(savedTargets);
              loadedTargets = {
                calories: parsedTargets.calories ?? 2000,
                carbs: parsedTargets.carbs ?? 200,
                protein: parsedTargets.protein ?? 120,
                fat: parsedTargets.fat ?? 60,
                fiber: parsedTargets.fiber ?? 25,
                sodium: parsedTargets.sodium ?? 2000
              };
              setTargets(loadedTargets);
            } catch (e) {
              logger.error('Falha ao interpretar metas do localStorage', e);
            }
          }

          // Salva no IndexedDB para migração segura
          await saveSettingsToDB({
            apiKey: savedKey,
            modelName: savedModel,
            customContext: savedContext,
            targets: loadedTargets,
            weight: currentWeight,
            height: currentHeight
          });

          // Remove chave da API do localStorage por motivos de segurança
          localStorage.removeItem('nutri_api_key');
        }

        // Carrega refeições
        const dbMeals = await getMeals();
        if (dbMeals && dbMeals.length > 0) {
          setMeals(dbMeals);
        } else {
          // Migração do localStorage de refeições legadas
          const savedMeals = localStorage.getItem('nutri_meals');
          if (savedMeals) {
            try {
              const parsedMeals = JSON.parse(savedMeals);
              setMeals(parsedMeals);
              for (const m of parsedMeals) {
                await saveMeal(m);
              }
            } catch (e) {
              logger.error('Falha ao migrar refeições do localStorage', e);
            }
          }
        }

        // Carrega treinos (workouts)
        const dbWorkouts = await getWorkouts();
        if (dbWorkouts && dbWorkouts.length > 0) {
          setWorkouts(dbWorkouts);
        }
      } catch (err) {
        logger.error('Erro no carregamento inicial do banco IndexedDB', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

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
      logger.error('Erro ao salvar refeição no IndexedDB', e);
      throw e;
    }
  };

  const handleDeleteMeal = async (id: string) => {
    const updatedMeals = meals.filter(meal => meal.id !== id);
    setMeals(updatedMeals);
    try {
      await deleteMealFromDB(id);
    } catch (e) {
      logger.error('Erro ao deletar refeição no IndexedDB', e);
      throw e;
    }
  };

  // Operações de Treinos
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
      logger.error('Erro ao salvar treino no IndexedDB', e);
      throw e;
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    const updatedWorkouts = workouts.filter(w => w.id !== id);
    setWorkouts(updatedWorkouts);
    try {
      await deleteWorkoutFromDB(id);
    } catch (e) {
      logger.error('Erro ao deletar treino no IndexedDB', e);
      throw e;
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllDBData();
    } catch (e) {
      logger.error('Erro ao limpar banco de dados IndexedDB', e);
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
      logger.error('Erro ao salvar configurações no IndexedDB', err);
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
      
      // Valida se o timestamp é um número válido e está na janela de hoje (meia-noite de hoje até 23:59:59)
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const endOfToday = new Date().setHours(23, 59, 59, 999);
      
      if (isNaN(ts) || ts < startOfToday || ts > endOfToday) {
        // Fallback: se o timestamp não for de hoje, define para o momento atual (que é hoje)
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

    // Salva no IndexedDB de forma segura concorrente
    await Promise.all(importedMeals.map(meal => saveMeal(meal)));

    // Atualiza o estado das refeições localmente
    setMeals(prev => {
      const merged = [...importedMeals, ...prev];
      return merged.sort((a, b) => b.timestamp - a.timestamp);
    });

    return importedMeals.length;
  };

  const handleImportMealsFromText = async (chatText: string): Promise<number> => {
    if (!apiKey) {
      throw new Error('Chave de API do Gemini não configurada.');
    }

    try {
      const result = await extractMealsFromChatHistory(apiKey, chatText, modelName);
      if (!result.meals || result.meals.length === 0) {
        return 0;
      }
      return await saveExtractedMeals(result.meals);
    } catch (err) {
      logger.error('Erro ao importar refeições automáticas do texto', err);
      throw err;
    }
  };

  return (
    <AppContext.Provider
      value={{
        apiKey,
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
        saveExtractedMeals
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
