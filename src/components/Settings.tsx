import React, { useState } from 'react';
import { Key, Target, RefreshCw, Trash2, CheckCircle2, Sparkles, MessageSquare, HelpCircle } from 'lucide-react';
import type { ChatMessage } from '../services/gemini';
import { saveSettingsToDB, saveChatHistory } from '../services/db';

interface SettingsProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  modelName: string;
  setModelName: (name: string) => void;
  targets: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
  };
  setTargets: (targets: { calories: number; carbs: number; protein: number; fat: number }) => void;
  customContext: string;
  setCustomContext: (context: string) => void;
  onClearData: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  apiKey,
  setApiKey,
  modelName,
  setModelName,
  targets,
  setTargets,
  customContext,
  setCustomContext,
  onClearData,
}) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(modelName);
  const [localContext, setLocalContext] = useState(customContext);
  const [cal, setCal] = useState(targets.calories.toString());
  const [carb, setCarb] = useState(targets.carbs.toString());
  const [prot, setProt] = useState(targets.protein.toString());
  const [fat, setFat] = useState(targets.fat.toString());
  const [showSaved, setShowSaved] = useState(false);
  
  // Estado para importador de chat
  const [pastedChat, setPastedChat] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiKey(localKey);
    setModelName(localModel);
    setCustomContext(localContext);
    
    const newTargets = {
      calories: parseInt(cal) || 2000,
      carbs: parseInt(carb) || 200,
      protein: parseInt(prot) || 120,
      fat: parseInt(fat) || 60,
    };
    setTargets(newTargets);

    // Salva no IndexedDB
    try {
      await saveSettingsToDB({
        apiKey: localKey,
        modelName: localModel,
        customContext: localContext,
        targets: newTargets
      });
    } catch (err) {
      console.error('Erro ao salvar configurações no IndexedDB:', err);
    }

    // Salva no localStorage como redundância/compatibilidade
    localStorage.setItem('nutri_api_key', localKey);
    localStorage.setItem('nutri_model_name', localModel);
    localStorage.setItem('nutri_custom_context', localContext);
    localStorage.setItem('nutri_targets', JSON.stringify(newTargets));

    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const handleClear = () => {
    if (confirm('Tem certeza que deseja apagar todo o histórico de refeições e chaves salvas?')) {
      onClearData();
      setLocalKey('');
      setLocalContext('');
      setPastedChat('');
      setCal('2000');
      setCarb('200');
      setProt('120');
      setFat('60');
      alert('Todos os dados foram resetados.');
    }
  };

  // Parser inteligente para colar conversas do Gemini Web
  const handleImportChat = async () => {
    if (!pastedChat.trim()) {
      setImportStatus('Cole o histórico primeiro.');
      return;
    }

    const lines = pastedChat.split('\n');
    const parsedMessages: ChatMessage[] = [];
    let currentSender: 'user' | 'ai' | null = null;
    let currentTextLines: string[] = [];

    const commitMessage = () => {
      if (currentSender && currentTextLines.length > 0) {
        const messageText = currentTextLines.join('\n').trim();
        if (messageText) {
          parsedMessages.push({
            id: 'imported-' + Math.random().toString(36).substring(2, 11),
            sender: currentSender,
            text: messageText,
            timestamp: Date.now() - (parsedMessages.length * 1000), // diferencia ligeiramente no tempo
          });
        }
      }
      currentTextLines = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      
      if (trimmed === 'Você' || lower === 'user' || lower === 'usuário') {
        commitMessage();
        currentSender = 'user';
      } else if (trimmed === 'Gemini' || lower === 'ia' || lower === 'ai' || lower === 'model' || lower === 'antigravity') {
        commitMessage();
        currentSender = 'ai';
      } else {
        if (currentSender) {
          currentTextLines.push(line);
        }
      }
    }
    commitMessage(); // Salva a última mensagem

    // Fallback: se o parser não encontrar tags de emissor, faz um split simples por blocos
    if (parsedMessages.length === 0) {
      const paragraphs = pastedChat.split('\n\n').filter(p => p.trim());
      paragraphs.forEach((p, idx) => {
        parsedMessages.push({
          id: 'imported-fb-' + idx,
          sender: idx % 2 === 0 ? 'user' : 'ai', // assume alternado iniciando pelo usuário
          text: p.trim(),
          timestamp: Date.now() - (paragraphs.length - idx) * 1000,
        });
      });
    }

    if (parsedMessages.length > 0) {
      // Adiciona uma mensagem de sistema no topo notificando a importação
      const systemWelcome: ChatMessage = {
        id: 'welcome-imported',
        sender: 'ai',
        text: `Histórico da conversa "Otimizando Treino e Futebol" importada com sucesso (${parsedMessages.length} mensagens). Agora tenho o contexto anterior da sua dieta e treinos! Como deseja continuar hoje?`,
        timestamp: Date.now() - (parsedMessages.length + 1) * 1000,
      };

      const finalChat = [systemWelcome, ...parsedMessages];
      // Inverte para manter ordem cronológica se o tempo decrescente foi usado
      finalChat.sort((a, b) => a.timestamp - b.timestamp);

      try {
        await saveChatHistory(finalChat);
      } catch (err) {
        console.error('Erro ao salvar chat importado no IndexedDB:', err);
      }

      localStorage.setItem('nutri_chat_history', JSON.stringify(finalChat));
      setImportStatus(`Sucesso! ${parsedMessages.length} mensagens importadas.`);
      setPastedChat('');
      
      // Notifica as regras personalizadas caso contenha atalhos no chat
      alert('Conversa importada com sucesso! Vá na aba de Chat para continuar.');
    } else {
      setImportStatus('Falha ao processar o formato. Tente copiar novamente.');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPastedChat(text);
        setImportStatus(`Arquivo "${file.name}" carregado. Clique em 'Importar e Mesclar Histórico' para processar.`);
      }
    };
    reader.onerror = () => {
      setImportStatus('Falha ao ler o arquivo txt.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1>Configurações</h1>
        <h3 style={{ marginTop: '4px' }}>Configure suas chaves, metas e histórico</h3>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Gemini API Key Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '17px' }}>Chave da API do Gemini</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Insira sua chave para habilitar a análise de imagens. A chave é armazenada de forma segura e local no seu celular.
          </p>
          <div className="form-group">
            <label className="form-label">Chave de API (Gemini)</label>
            <input
              type="password"
              className="form-input"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Modelo de IA</label>
            <select
              className="form-input"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'white' }}
            >
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (Rápido e Preciso - Recomendado)</option>
              <option value="gemini-3.5-pro">Gemini 3.5 Pro (Extrema Precisão)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </select>
          </div>
        </div>

        {/* Custom Context/Instructions Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '17px' }}>Instruções de Contexto (IA)</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Defina atalhos como "café padrão" ou preferências que a IA usará ao identificar pratos e responder no Chat.
          </p>
          <div className="form-group">
            <label className="form-label">Regras e Atalhos alimentares</label>
            <textarea
              className="form-input"
              rows={4}
              value={localContext}
              onChange={(e) => setLocalContext(e.target.value)}
              placeholder="Ex: Meu café da manhã padrão consiste em: 2 fatias de pão integral (50g), 1 ovo mexido (50g) e 1 xícara de café preto sem açúcar."
              style={{ resize: 'vertical', userSelect: 'text', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* Import Gemini Chat Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '17px' }}>Importar "Otimizando Treino e Futebol"</h2>
          </div>
          
          <div style={{ background: 'rgba(16, 185, 129, 0.04)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
            <HelpCircle size={18} style={{ color: 'var(--accent-light)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Para conectar o histórico do Gemini Web:<br />
              1. Acesse o chat <strong>"Otimizando Treino e Futebol"</strong> no app do Gemini Web.<br />
              2. Selecione e copie o texto das mensagens que deseja trazer.<br />
              3. Cole o texto na caixa abaixo e clique em importar. O app mapeará a conversa!
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Colar Conversa do Gemini</label>
            <textarea
              className="form-input"
              rows={4}
              value={pastedChat}
              onChange={(e) => setPastedChat(e.target.value)}
              placeholder="Cole o texto copiado do chat aqui..."
              style={{ resize: 'vertical', userSelect: 'text', fontFamily: 'inherit', fontSize: '13px' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ou Anexar arquivo .txt com a conversa</label>
            <input
              type="file"
              accept=".txt"
              onChange={handleFileImport}
              className="form-input"
              style={{ fontSize: '13px', padding: '8px 12px', background: 'var(--bg-surface)' }}
            />
          </div>

          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleImportChat}
            style={{ padding: '10px', fontSize: '13px', borderColor: 'var(--accent-light)' }}
          >
            Importar e Mesclar Histórico
          </button>
          
          {importStatus && (
            <span style={{ fontSize: '12px', color: 'var(--accent-light)', fontWeight: 600, textAlign: 'center' }}>
              {importStatus}
            </span>
          )}
        </div>

        {/* Nutritional Targets Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={20} className="tab-icon-wrapper" style={{ color: 'var(--color-prot)' }} />
            <h2 style={{ fontSize: '17px' }}>Metas Nutricionais Diárias</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Calorias (kcal)</label>
              <input
                type="number"
                className="form-input"
                value={cal}
                onChange={(e) => setCal(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Proteínas (g)</label>
              <input
                type="number"
                className="form-input"
                value={prot}
                onChange={(e) => setProt(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Carboidratos (g)</label>
              <input
                type="number"
                className="form-input"
                value={carb}
                onChange={(e) => setCarb(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Gorduras (g)</label>
              <input
                type="number"
                className="form-input"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn">
          {showSaved ? (
            <>
              <CheckCircle2 size={18} />
              Configurações Salvas!
            </>
          ) : (
            <>
              <RefreshCw size={18} />
              Salvar Alterações
            </>
          )}
        </button>
      </form>

      {/* Danger Zone */}
      <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--color-cal)' }}>Zona de Perigo</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Apagar o cache local removerá todas as refeições do seu histórico e as configurações salvas.
        </p>
        <button className="btn btn-secondary btn-danger" onClick={handleClear} style={{ display: 'flex', gap: '8px', padding: '12px' }}>
          <Trash2 size={16} />
          Limpar Todos os Dados
        </button>
      </div>
    </div>
  );
};
