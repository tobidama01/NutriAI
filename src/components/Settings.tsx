import React, { useState } from 'react';
import { Key, Target, RefreshCw, Trash2, Sparkles, MessageSquare, HelpCircle, AlertCircle, Scale, LogOut } from 'lucide-react';
import type { ChatMessage } from '../services/gemini';
import { saveChatHistory } from '../services/db';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from './ui/ConfirmModal';

interface SettingsProps {
  onSaveSuccess: () => void;
  onClearSuccess: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  onSaveSuccess,
  onClearSuccess
}) => {
  const {
    apiKey,
    modelName,
    customContext,
    targets,
    weight,
    height,
    saveSettings,
    handleClearData,
    handleImportMealsFromText,
    user,
    logout
  } = useApp();

  const [localKey, setLocalKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(modelName);
  const [localContext, setLocalContext] = useState(customContext);
  
  const [cal, setCal] = useState(targets.calories.toString());
  const [carb, setCarb] = useState(targets.carbs.toString());
  const [prot, setProt] = useState(targets.protein.toString());
  const [fat, setFat] = useState(targets.fat.toString());
  const [fib, setFib] = useState((targets.fiber ?? 25).toString());
  const [sod, setSod] = useState((targets.sodium ?? 2000).toString());

  const [localWeight, setLocalWeight] = useState(weight.toString());
  const [localHeight, setLocalHeight] = useState(height.toString());

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Estado para importador de chat
  const [pastedChat, setPastedChat] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Estados dos Modais de Confirmação customizados (Substituindo confirm/alert bloqueantes)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const validateTargets = () => {
    const errors: string[] = [];
    const caloriesNum = parseInt(cal);
    const proteinNum = parseInt(prot);
    const carbsNum = parseInt(carb);
    const fatNum = parseInt(fat);
    const fiberNum = parseInt(fib);
    const sodiumNum = parseInt(sod);
    const weightNum = parseFloat(localWeight);
    const heightNum = parseFloat(localHeight);

    if (isNaN(caloriesNum) || caloriesNum < 500 || caloriesNum > 10000) {
      errors.push('Calorias devem estar entre 500 e 10.000 kcal.');
    }
    if (isNaN(proteinNum) || proteinNum < 10 || proteinNum > 500) {
      errors.push('Proteínas devem estar entre 10g e 500g.');
    }
    if (isNaN(carbsNum) || carbsNum < 10 || carbsNum > 1000) {
      errors.push('Carboidratos devem estar entre 10g e 1.000g.');
    }
    if (isNaN(fatNum) || fatNum < 10 || fatNum > 500) {
      errors.push('Gorduras devem estar entre 10g e 500g.');
    }
    if (isNaN(fiberNum) || fiberNum < 5 || fiberNum > 150) {
      errors.push('Fibras devem estar entre 5g e 150g.');
    }
    if (isNaN(sodiumNum) || sodiumNum < 100 || sodiumNum > 10000) {
      errors.push('Sódio deve estar entre 100mg e 10.000mg.');
    }
    if (isNaN(weightNum) || weightNum < 30 || weightNum > 300) {
      errors.push('Peso corporal deve estar entre 30 kg e 300 kg.');
    }
    if (isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
      errors.push('Altura deve estar entre 100 cm e 250 cm.');
    }

    return errors;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    const errors = validateTargets();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const newTargets = {
      calories: parseInt(cal),
      carbs: parseInt(carb),
      protein: parseInt(prot),
      fat: parseInt(fat),
      fiber: parseInt(fib),
      sodium: parseInt(sod)
    };

    try {
      await saveSettings(
        localKey,
        localModel,
        localContext,
        newTargets,
        parseFloat(localWeight) || 75,
        parseFloat(localHeight) || 175
      );
      onSaveSuccess();
    } catch (err) {
      setAlertConfig({
        title: 'Falha ao Salvar',
        message: 'Ocorreu um erro no IndexedDB ao tentar gravar as configurações.'
      });
      setIsAlertModalOpen(true);
    }
  };

  const triggerClearModal = () => {
    setIsClearModalOpen(true);
  };

  const handleConfirmedClear = async () => {
    setIsClearModalOpen(false);
    await handleClearData();
    
    // Reseta states locais
    setLocalKey('');
    setLocalContext('');
    setPastedChat('');
    setCal('2000');
    setCarb('200');
    setProt('120');
    setFat('60');
    setFib('25');
    setSod('2000');
    
    onClearSuccess();
  };

  // Parser inteligente para importar conversas do Gemini
  const handleImportChat = async () => {
    if (!pastedChat.trim()) {
      setImportStatus('Por favor, insira o histórico para importar.');
      return;
    }

    let parsedMessages: ChatMessage[] = [];
    const rawInput = pastedChat.trim();

    // Caso o input seja um JSON exportado do Gemini (suporte nativo JSON - item 3.8)
    if (rawInput.startsWith('{') || rawInput.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawInput);
        const list = Array.isArray(parsed) ? parsed : (parsed.messages || parsed.history || []);
        
        if (Array.isArray(list) && list.length > 0) {
          parsedMessages = list.map((m: any, idx: number) => {
            const sender: 'user' | 'ai' = (m.sender === 'user' || m.role === 'user') ? 'user' : 'ai';
            const text = m.text || m.content || m.message || '';
            return {
              id: crypto.randomUUID(),
              sender,
              text,
              timestamp: m.timestamp || (Date.now() - (list.length - idx) * 1000)
            };
          }).filter(m => m.text);
        }
      } catch (err) {
        // Ignora e tenta via parser de texto como fallback
      }
    }

    // Parser por texto
    if (parsedMessages.length === 0) {
      const lines = rawInput.split('\n');
      let currentSender: 'user' | 'ai' | null = null;
      let currentTextLines: string[] = [];

      const commitMessage = () => {
        if (currentSender && currentTextLines.length > 0) {
          const messageText = currentTextLines.join('\n').trim();
          if (messageText) {
            parsedMessages.push({
              id: crypto.randomUUID(),
              sender: currentSender,
              text: messageText,
              timestamp: Date.now() - (parsedMessages.length * 1000)
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

      // Fallback simples se não encontrar cabeçalhos definidos
      if (parsedMessages.length === 0) {
        const paragraphs = rawInput.split('\n\n').filter(p => p.trim());
        paragraphs.forEach((p, idx) => {
          parsedMessages.push({
            id: crypto.randomUUID(),
            sender: (idx % 2 === 0 ? 'user' : 'ai') as 'user' | 'ai',
            text: p.trim(),
            timestamp: Date.now() - (paragraphs.length - idx) * 1000
          });
        });
      }
    }

    if (parsedMessages.length > 0) {
      // Mensagem de boas-vindas genérica sem referenciar nome privado (item 3.8)
      const systemWelcome: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: `Histórico importado com sucesso (${parsedMessages.length} mensagens). Agora tenho o contexto da sua conversa anterior. Como posso ajudar hoje?`,
        timestamp: Date.now() - (parsedMessages.length + 1) * 1000
      };

      const finalChat = [systemWelcome, ...parsedMessages];
      finalChat.sort((a, b) => a.timestamp - b.timestamp);

      try {
        await saveChatHistory(finalChat);
        setImportStatus('Histórico importado! Analisando refeições de hoje no texto...');
        
        let mealsImportedCount = 0;
        let importMealsFailed = false;
        let mealsErrorMessage = '';
        try {
          mealsImportedCount = await handleImportMealsFromText(rawInput);
        } catch (mealsErr: any) {
          console.error('Erro ao extrair refeições do histórico do chat', mealsErr);
          importMealsFailed = true;
          mealsErrorMessage = mealsErr.message || 'Erro de conexão/limite';
        }

        if (mealsImportedCount > 0) {
          setImportStatus(`Sucesso! Chat importado e ${mealsImportedCount} refeição(ões) de hoje cadastrada(s) automaticamente.`);
          setAlertConfig({
            title: 'Chat e Macros Sincronizados',
            message: `O histórico foi importado com sucesso! Além disso, a Nutri IA identificou ${mealsImportedCount} refeição(ões) de hoje no texto e atualizou seus macros consumidos no Dashboard automaticamente.`
          });
        } else if (importMealsFailed) {
          setImportStatus(`Importado (com erro na extração de macros).`);
          setAlertConfig({
            title: 'Importado com Alertas',
            message: `O histórico foi importado com sucesso. Contudo, a sincronização automática de macros falhou: ${mealsErrorMessage}.`
          });
        } else {
          setImportStatus(`Sucesso! ${parsedMessages.length} mensagens importadas.`);
          setAlertConfig({
            title: 'Histórico Importado',
            message: 'O histórico foi importado com sucesso. Nenhuma refeição consumida hoje foi identificada no texto para atualizar os macros.'
          });
        }
        
        setPastedChat('');
        setIsAlertModalOpen(true);
      } catch (err) {
        setImportStatus('Falha ao gravar mensagens importadas no IndexedDB.');
      }
    } else {
      setImportStatus('Não foi possível identificar o formato das mensagens. Cole ou anexe um texto válido.');
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
        setImportStatus(`Arquivo "${file.name}" carregado. Clique em 'Importar e Mesclar Histórico'.`);
      }
    };
    reader.onerror = () => {
      setImportStatus('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1>Ajustes</h1>
        <h3 style={{ marginTop: '4px' }}>Configure suas chaves, metas e histórico</h3>
      </div>

      {validationErrors.length > 0 && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-cal)', fontWeight: 700 }}>
            <AlertCircle size={18} />
            <span>Erros de Validação</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Gemini API Key Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '17px' }}>Chave da API do Gemini</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Insira sua chave para habilitar a análise de imagens. <strong style={{ color: 'var(--color-prot)' }}>Armazenada apenas no banco local seguro do seu dispositivo (IndexedDB).</strong>
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="api-key-input">Chave de API (Gemini)</label>
            <input
              id="api-key-input"
              type="password"
              className="form-input"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="AIzaSy..."
              autoComplete="off"
              autoCorrect="off"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="model-select">Modelo de IA</label>
            <select
              id="model-select"
              className="form-input"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Rápido - Recomendado)</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (Nova Geração)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash (Legado)</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Estável)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (Alta Precisão)</option>
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
            <label className="form-label" htmlFor="custom-context-area">Regras e Atalhos alimentares</label>
            <textarea
              id="custom-context-area"
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
            <h2 style={{ fontSize: '17px' }}>Importar Histórico de Conversa</h2>
          </div>
          
          <div style={{ background: 'rgba(16, 185, 129, 0.04)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
            <HelpCircle size={18} style={{ color: 'var(--accent-light)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Para conectar histórico anterior:<br />
              1. Acesse sua conversa no app do Gemini Web.<br />
              2. Selecione e copie o texto ou exporte o histórico (JSON).<br />
              3. Cole os dados na caixa ou anexe o arquivo .txt/.json.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="chat-paste-area">Colar Conversa do Gemini</label>
            <textarea
              id="chat-paste-area"
              className="form-input"
              rows={4}
              value={pastedChat}
              onChange={(e) => setPastedChat(e.target.value)}
              placeholder="Cole o texto ou JSON exportado aqui..."
              style={{ resize: 'vertical', userSelect: 'text', fontFamily: 'inherit', fontSize: '13px' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="chat-file-input">Ou Anexar arquivo com a conversa (.txt ou .json)</label>
            <input
              id="chat-file-input"
              type="file"
              accept=".txt,.json"
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

        {/* Physiological Profile Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '17px' }}>Perfil Fisiológico</h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Usado pela IA para estimar a Taxa Metabólica Basal e o gasto calórico dos treinos.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="user-weight">Peso Corporal (kg)</label>
              <input
                id="user-weight"
                type="number"
                step="0.1"
                className="form-input"
                value={localWeight}
                onChange={(e) => setLocalWeight(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="user-height">Altura (cm)</label>
              <input
                id="user-height"
                type="number"
                className="form-input"
                value={localHeight}
                onChange={(e) => setLocalHeight(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Nutritional Targets Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={20} className="tab-icon-wrapper" style={{ color: 'var(--color-prot)' }} />
            <h2 style={{ fontSize: '17px' }}>Metas Nutricionais Diárias</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="target-calories">Calorias (kcal)</label>
              <input
                id="target-calories"
                type="number"
                className="form-input"
                value={cal}
                onChange={(e) => setCal(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-protein">Proteínas (g)</label>
              <input
                id="target-protein"
                type="number"
                className="form-input"
                value={prot}
                onChange={(e) => setProt(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-carbs">Carboidratos (g)</label>
              <input
                id="target-carbs"
                type="number"
                className="form-input"
                value={carb}
                onChange={(e) => setCarb(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-fat">Gorduras (g)</label>
              <input
                id="target-fat"
                type="number"
                className="form-input"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-fiber">Fibras (g)</label>
              <input
                id="target-fiber"
                type="number"
                className="form-input"
                value={fib}
                onChange={(e) => setFib(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="target-sodium">Sódio (mg)</label>
              <input
                id="target-sodium"
                type="number"
                className="form-input"
                value={sod}
                onChange={(e) => setSod(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn">
          <RefreshCw size={18} />
          Salvar Alterações
        </button>
      </form>

      {/* Conta do Usuário */}
      {user && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogOut size={18} style={{ color: 'var(--accent-light)' }} /> Conta do Usuário
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Você está conectado como: <strong style={{ color: 'white' }}>{user.email}</strong>
          </p>
          <button 
            className="btn btn-secondary" 
            onClick={logout} 
            style={{ display: 'flex', gap: '8px', padding: '12px', justifyContent: 'center' }}
          >
            Sair da Conta
          </button>
        </div>
      )}

      {/* Danger Zone */}
      <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--color-cal)' }}>Zona de Perigo</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Apagar o banco local removerá todas as refeições do seu histórico e as chaves cadastradas.
        </p>
        <button 
          className="btn btn-secondary btn-danger" 
          onClick={triggerClearModal} 
          style={{ display: 'flex', gap: '8px', padding: '12px' }}
        >
          <Trash2 size={16} />
          Limpar Todos os Dados
        </button>
      </div>

      {/* Modais de Confirmação customizados (iOS Safe) */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Apagar todos os dados?"
        message="Esta ação é definitiva e apagará permanentemente todas as suas refeições do IndexedDB, histórico do chat e as metas cadastradas. Deseja continuar?"
        confirmLabel="Sim, Apagar Tudo"
        cancelLabel="Cancelar"
        danger={true}
        onConfirm={handleConfirmedClear}
        onCancel={() => setIsClearModalOpen(false)}
      />

      <ConfirmModal
        isOpen={isAlertModalOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmLabel="Entendido"
        cancelLabel="Fechar"
        onConfirm={() => setIsAlertModalOpen(false)}
        onCancel={() => setIsAlertModalOpen(false)}
      />
    </div>
  );
};
