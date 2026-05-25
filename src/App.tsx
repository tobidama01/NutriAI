import { useApp } from './context/AppContext';
import { Home, Camera, CalendarRange, Settings as SettingsIcon, MessageSquare, Loader2 } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { MealCreator } from './components/MealCreator';
import { MealHistory } from './components/MealHistory';
import { Settings } from './components/Settings';
import { Chat } from './components/Chat';
import { Toast } from './components/ui/Toast';
import { useState } from 'react';

function App() {
  const { activeTab, setActiveTab, isLoading, apiKey } = useApp();
  
  // Sistema de Toast Global (item 3.6)
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isToastVisible, setIsToastVisible] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setIsToastVisible(true);
  };

  // Renderizador de abas
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToCamera={() => setActiveTab('camera')}
            apiKeyMissing={!apiKey}
          />
        );
      case 'camera':
        return (
          <MealCreator
            onSaveSuccess={() => {
              showToast('Refeição salva com sucesso!', 'success');
              setActiveTab('dashboard');
            }}
            onCancel={() => setActiveTab('dashboard')}
          />
        );
      case 'chat':
        return <Chat />;
      case 'history':
        return (
          <MealHistory
            onDeleteSuccess={() => showToast('Refeição removida.', 'info')}
            onNavigateToCamera={() => setActiveTab('camera')}
          />
        );
      case 'settings':
        return (
          <Settings
            onSaveSuccess={() => showToast('Configurações atualizadas.', 'success')}
            onClearSuccess={() => showToast('Todos os dados foram resetados.', 'info')}
          />
        );
      default:
        return <Dashboard onNavigateToCamera={() => setActiveTab('camera')} apiKeyMissing={!apiKey} />;
    }
  };

  if (isLoading) {
    return (
      <div 
        className="app-container" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'white'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={40} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-light)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Carregando seus dados...</p>
        </div>
      </div>
    );
  }

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
          aria-label="Ir para Dashboard"
        >
          <div className="tab-icon-wrapper">
            <Home size={20} aria-hidden="true" />
          </div>
          Dashboard
        </button>

        <button 
          className={`tab-item ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
          aria-label="Adicionar Refeição (Câmera)"
        >
          <div className="tab-icon-wrapper">
            <Camera size={20} aria-hidden="true" />
          </div>
          Câmera
        </button>

        <button 
          className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-label="Abrir Chat com Nutri IA"
        >
          <div className="tab-icon-wrapper">
            <MessageSquare size={20} aria-hidden="true" />
          </div>
          Chat
        </button>

        <button 
          className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          aria-label="Ver Histórico de Refeições"
        >
          <div className="tab-icon-wrapper">
            <CalendarRange size={20} aria-hidden="true" />
          </div>
          Histórico
        </button>

        <button 
          className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          aria-label="Ajustes e Configurações"
        >
          <div className="tab-icon-wrapper">
            <SettingsIcon size={20} aria-hidden="true" />
          </div>
          Ajustes
        </button>
      </nav>

      {/* Sistema de Toast Unificado */}
      <Toast
        message={toastMessage}
        type={toastType}
        isVisible={isToastVisible}
        onClose={() => setIsToastVisible(false)}
      />
    </div>
  );
}

export default App;
