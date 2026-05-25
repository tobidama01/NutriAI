import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Meal, NutritionTargets, TabName } from '../types';
import { getMeals, getSettingsFromDB, saveSettingsToDB, saveMeal, deleteMealFromDB, clearAllDBData } from '../services/db';
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
  isLoading: boolean;
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
  handleSaveMeal: (mealType: string, items: Meal['items']) => Promise<void>;
  handleDeleteMeal: (id: string) => Promise<void>;
  handleClearData: () => Promise<void>;
  saveSettings: (key: string, model: string, context: string, targets: NutritionTargets) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Inicialização de aba ativa a partir do sessionStorage (item 3.7)
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
    fiber: 25,    // default de fibra (item 3.10)
    sodium: 2000  // default de sódio (item 3.10)
  });
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveTabPersisted = (tab: TabName) => {
    setActiveTab(tab);
    sessionStorage.setItem('nutri_active_tab', tab);
  };

  // Carrega os dados salvos do IndexedDB ao iniciar o app (com fallback para localStorage legado)
  useEffect(() => {
    async function loadData() {
      try {
        const dbSettings = await getSettingsFromDB();
        if (dbSettings) {
          setApiKey(dbSettings.apiKey || '');
          setModelName(dbSettings.modelName || 'gemini-2.0-flash');
          setCustomContext(dbSettings.customContext || '');
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
          // Fallback para localStorage legado no primeiro acesso (removendo API Key de localStorage por segurança - item 4.1)
          const savedKey = localStorage.getItem('nutri_api_key') || '';
          const savedModel = localStorage.getItem('nutri_model_name') || 'gemini-2.0-flash';
          const savedContext = localStorage.getItem('nutri_custom_context') || '';
          const savedTargets = localStorage.getItem('nutri_targets');

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

          // Salva imediatamente no IndexedDB para migração segura
          await saveSettingsToDB({
            apiKey: savedKey,
            modelName: savedModel,
            customContext: savedContext,
            targets: loadedTargets
          });

          // Remove chave da API do localStorage por motivos de segurança (item 4.1)
          localStorage.removeItem('nutri_api_key');
        }

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
      id: crypto.randomUUID(), // Corrigido IDs duplicados usando UUID
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
    setTargets({
      calories: 2000,
      carbs: 200,
      protein: 120,
      fat: 60,
      fiber: 25,
      sodium: 2000
    });
    setMeals([]);
    setActiveTabPersisted('dashboard');
  };

  const saveSettings = async (
    key: string,
    model: string,
    context: string,
    newTargets: NutritionTargets
  ) => {
    setApiKey(key);
    setModelName(model);
    setCustomContext(context);
    setTargets(newTargets);

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
        }
      });
    } catch (err) {
      logger.error('Erro ao salvar configurações no IndexedDB', err);
      throw err;
    }

    // Mantém itens secundários em localStorage, mas NUNCA a API key (item 4.1)
    localStorage.setItem('nutri_model_name', model);
    localStorage.setItem('nutri_custom_context', context);
    localStorage.setItem('nutri_targets', JSON.stringify(newTargets));
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
        isLoading,
        activeTab,
        setActiveTab: setActiveTabPersisted,
        handleSaveMeal,
        handleDeleteMeal,
        handleClearData,
        saveSettings
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
