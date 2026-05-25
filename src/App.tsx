import { useState, useEffect } from 'react';
import { Home, Camera, CalendarRange, Settings as SettingsIcon, MessageSquare } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { MealCreator } from './components/MealCreator';
import { MealHistory } from './components/MealHistory';
import { Settings } from './components/Settings';
import { Chat } from './components/Chat';
import { getMeals, saveMeal, deleteMealFromDB, getSettingsFromDB, saveSettingsToDB, clearAllDBData } from './services/db';

interface MealItem {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: string;
  timestamp: number;
  type: string;
  items: MealItem[];
}

interface Targets {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'camera' | 'history' | 'settings' | 'chat'>('dashboard');
  
  // Estados globais persistidos no IndexedDB
  const [apiKey, setApiKey] = useState<string>('');
  const [modelName, setModelName] = useState<string>('gemini-3.5-flash');
  const [customContext, setCustomContext] = useState<string>('');
  const [targets, setTargets] = useState<Targets>({
    calories: 2000,
    carbs: 200,
    protein: 120,
    fat: 60
  });
  const [meals, setMeals] = useState<Meal[]>([]);

  // Carrega os dados salvos do IndexedDB ao iniciar o app (com fallback para localStorage legado)
  useEffect(() => {
    async function loadData() {
      try {
        const dbSettings = await getSettingsFromDB();
        if (dbSettings) {
          setApiKey(dbSettings.apiKey || '');
          setModelName(dbSettings.modelName || 'gemini-3.5-flash');
          setCustomContext(dbSettings.customContext || '');
          if (dbSettings.targets) {
            setTargets(dbSettings.targets);
          }
        } else {
          // Fallback para localStorage legado no primeiro acesso
          const savedKey = localStorage.getItem('nutri_api_key') || '';
          const savedModel = localStorage.getItem('nutri_model_name') || 'gemini-3.5-flash';
          const savedContext = localStorage.getItem('nutri_custom_context') || '';
          const savedTargets = localStorage.getItem('nutri_targets');

          if (savedKey) setApiKey(savedKey);
          if (savedModel) setModelName(savedModel);
          if (savedContext) setCustomContext(savedContext);
          if (savedTargets) {
            try {
              const parsedTargets = JSON.parse(savedTargets);
              setTargets(parsedTargets);
              // Salva no IndexedDB para migração
              await saveSettingsToDB({
                apiKey: savedKey,
                modelName: savedModel,
                customContext: savedContext,
                targets: parsedTargets
              });
            } catch (e) {
              console.error(e);
            }
          }
        }

        const dbMeals = await getMeals();
        if (dbMeals && dbMeals.length > 0) {
          setMeals(dbMeals);
        } else {
          // Migração do localStorage legado
          const savedMeals = localStorage.getItem('nutri_meals');
          if (savedMeals) {
            try {
              const parsedMeals = JSON.parse(savedMeals);
              setMeals(parsedMeals);
              for (const m of parsedMeals) {
                await saveMeal(m);
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao ler dados do IndexedDB:', err);
      }
    }
    loadData();
  }, []);

  const handleSaveMeal = async (mealType: string, items: MealItem[]) => {
    const newMeal: Meal = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      type: mealType,
      items: items,
    };

    const updatedMeals = [newMeal, ...meals];
    setMeals(updatedMeals);
    
    try {
      await saveMeal(newMeal);
    } catch (e) {
      console.error('Erro ao salvar refeição no IndexedDB:', e);
    }
    
    // Volta para o dashboard após salvar com sucesso
    setActiveTab('dashboard');
  };

  const handleDeleteMeal = async (id: string) => {
    const updatedMeals = meals.filter(meal => meal.id !== id);
    setMeals(updatedMeals);
    try {
      await deleteMealFromDB(id);
    } catch (e) {
      console.error('Erro ao deletar refeição do IndexedDB:', e);
    }
  };

  const handleClearData = async () => {
    try {
      await clearAllDBData();
    } catch (e) {
      console.error('Erro ao apagar banco de dados IndexedDB:', e);
    }
    localStorage.clear();
    setApiKey('');
    setModelName('gemini-3.5-flash');
    setCustomContext('');
    setTargets({
      calories: 2000,
      carbs: 200,
      protein: 120,
      fat: 60
    });
    setMeals([]);
    setActiveTab('dashboard');
  };

  // Renderizador de abas
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            meals={meals}
            targets={targets}
            onNavigateToCamera={() => setActiveTab('camera')}
            apiKeyMissing={!apiKey}
          />
        );
      case 'camera':
        return (
          <MealCreator
            apiKey={apiKey}
            modelName={modelName}
            customContext={customContext}
            onSaveMeal={handleSaveMeal}
            onCancel={() => setActiveTab('dashboard')}
          />
        );
      case 'chat':
        return (
          <Chat
            apiKey={apiKey}
            modelName={modelName}
            meals={meals}
            targets={targets}
            customContext={customContext}
          />
        );
      case 'history':
        return (
          <MealHistory
            meals={meals}
            onDeleteMeal={handleDeleteMeal}
            onNavigateToCamera={() => setActiveTab('camera')}
          />
        );
      case 'settings':
        return (
          <Settings
            apiKey={apiKey}
            setApiKey={setApiKey}
            modelName={modelName}
            setModelName={setModelName}
            targets={targets}
            setTargets={setTargets}
            customContext={customContext}
            setCustomContext={setCustomContext}
            onClearData={handleClearData}
          />
        );
      default:
        return <Dashboard meals={meals} targets={targets} onNavigateToCamera={() => setActiveTab('camera')} apiKeyMissing={!apiKey} />;
    }
  };

  return (
    <div className="app-container">
      {/* Espaçador superior para notches e status bar no iOS */}
      <div className="header-spacer" />
      
      {/* Conteúdo Principal */}
      <main className="main-content">
        {renderTabContent()}
      </main>

      {/* Barra de Navegação iOS Bottom Bar */}
      <nav className="tab-bar">
        <button 
          className={`tab-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="tab-icon-wrapper">
            <Home size={20} />
          </div>
          Dashboard
        </button>

        <button 
          className={`tab-item ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
        >
          <div className="tab-icon-wrapper">
            <Camera size={20} />
          </div>
          Câmera
        </button>

        <button 
          className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <div className="tab-icon-wrapper">
            <MessageSquare size={20} />
          </div>
          Chat
        </button>

        <button 
          className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <div className="tab-icon-wrapper">
            <CalendarRange size={20} />
          </div>
          Histórico
        </button>

        <button 
          className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <div className="tab-icon-wrapper">
            <SettingsIcon size={20} />
          </div>
          Ajustes
        </button>
      </nav>
    </div>
  );
}

export default App;
