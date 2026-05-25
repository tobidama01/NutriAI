import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { chatWithNutritionist, getRateLimitStatus, type RateLimitStatus, type ChatMessage } from '../services/gemini';
import { getChatHistory, saveChatHistory } from '../services/db';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from './ui/ConfirmModal';

// Parser seguro de markdown para negritos e quebras de linha sem injeção perigosa de HTML (XSS Safe)
function formatMessageText(text: string): React.ReactNode {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = [];
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let match;
    let lastIndex = 0;
    let partKey = 0;

    while ((match = boldRegex.exec(line)) !== null) {
      const matchIndex = match.index;
      const boldText = match[1];

      if (matchIndex > lastIndex) {
        parts.push(<span key={`t-${partKey++}`}>{line.substring(lastIndex, matchIndex)}</span>);
      }
      parts.push(<strong key={`b-${partKey++}`} style={{ fontWeight: 700, color: 'inherit' }}>{boldText}</strong>);
      lastIndex = boldRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(<span key={`t-${partKey++}`}>{line.substring(lastIndex)}</span>);
    }

    return (
      <div key={lineIdx} style={{ minHeight: '18px' }}>
        {parts.length > 0 ? parts : <br />}
      </div>
    );
  });
}

export const Chat: React.FC = () => {
  const { apiKey, modelName, meals, targets, customContext } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Controle de Rate-limiting local por estado (item 1.6)
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>({
    isBlocked: false,
    remainingCalls: 10,
    limit: 10,
    resetTimeSeconds: 0,
  });

  // Modal de Confirmação customizado (substitui o confirm nativo)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Atualiza rate-limit local a cada segundo
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const refreshStatus = async () => {
      const status = await getRateLimitStatus();
      setRateLimitStatus(status);
    };
    
    refreshStatus();
    interval = setInterval(refreshStatus, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Carrega mensagens do IndexedDB ao iniciar
  useEffect(() => {
    async function loadChat() {
      try {
        const dbHistory = await getChatHistory();
        if (dbHistory && dbHistory.length > 0) {
          setMessages(dbHistory);
        } else {
          // Mensagem inicial de boas-vindas se não houver dados
          const welcomeMsg: ChatMessage = {
            id: 'welcome',
            sender: 'ai',
            text: 'Olá! Sou o seu Nutricionista IA. Tenho acesso ao seu diário de refeições e metas cadastradas neste aplicativo. Pode me fazer perguntas sobre o seu dia, pedir conselhos de receitas ou tirar dúvidas sobre o seu consumo!',
            timestamp: Date.now(),
          };
          setMessages([welcomeMsg]);
          await saveChatHistory([welcomeMsg]);
        }
      } catch (e) {
        console.error('Erro ao ler histórico de chat do IndexedDB:', e);
      }
    }
    loadChat();
  }, []);

  // Rola até o final sempre que novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    if (!apiKey) {
      alert('Por favor, configure sua chave de API nas Configurações antes de conversar.');
      return;
    }

    // Validação preventiva do Rate Limit no Chat
    if (rateLimitStatus.isBlocked) {
      alert(`Limite de segurança excedido. O app bloqueou temporariamente novas chamadas de API. Aguarde ${rateLimitStatus.resetTimeSeconds} segundos antes de tentar novamente.`);
      return;
    }

    const userText = input.trim();
    setInput('');
    
    const newUserMsg: ChatMessage = {
      id: crypto.randomUUID(), // Corrigido bug de IDs duplicados
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    
    try {
      await saveChatHistory(updatedMessages);
    } catch (err) {
      console.error('Erro ao salvar mensagem no IndexedDB:', err);
    }

    setIsSending(true);

    try {
      // Chama o Gemini para responder (enviando metas incluindo fibras e sódio)
      const reply = await chatWithNutritionist(
        apiKey,
        userText,
        messages,
        meals,
        targets,
        customContext,
        modelName
      );

      const newAiMsg: ChatMessage = {
        id: crypto.randomUUID(), // Corrigido bug de IDs duplicados
        sender: 'ai',
        text: reply,
        timestamp: Date.now(),
      };

      const finalMessages = [...updatedMessages, newAiMsg];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: `Erro ao conectar com o Gemini: ${error.message || 'Erro desconhecido. Verifique sua chave de API e internet.'}`,
        timestamp: Date.now(),
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmedClear = async () => {
    setIsClearModalOpen(false);
    
    const welcomeMsg: ChatMessage = {
      id: 'welcome',
      sender: 'ai',
      text: 'Histórico limpo! Como posso ajudar você com a sua nutrição hoje?',
      timestamp: Date.now(),
    };
    setMessages([welcomeMsg]);
    try {
      await saveChatHistory([welcomeMsg]);
    } catch (err) {
      console.error('Erro ao limpar chat no IndexedDB:', err);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--tabbar-height) - var(--safe-area-top) - 24px)' }}>
      {/* Chat Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={24} style={{ color: 'var(--accent-light)' }} /> Nutri IA
          </h1>
          <h3 style={{ marginTop: '2px' }}>Tire dúvidas sobre seu dia</h3>
        </div>
        <button 
          onClick={() => setIsClearModalOpen(true)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '6px' }}
          aria-label="Limpar histórico do chat"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Messages Window */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '16px 0', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px' 
        }}
      >
        {messages.map(msg => (
          <div 
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              width: '100%',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: msg.sender === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                backgroundColor: msg.sender === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                border: msg.sender === 'user' ? 'none' : '1px solid var(--border-color)',
                color: 'white',
                fontSize: '14px',
                lineHeight: '1.4',
                userSelect: 'text',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {formatMessageText(msg.text)}
            </div>
          </div>
        ))}
        {isSending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '18px 18px 18px 2px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              <Loader2 size={14} style={{ animation: 'spin 1.5s linear infinite' }} />
              Nutri está pensando...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Rate Limit Warning Box */}
      {rateLimitStatus.isBlocked && (
        <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.18)', padding: '8px 12px', borderRadius: '10px', color: 'var(--color-fat)', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, marginBottom: '6px' }}>
          <AlertCircle size={14} />
          <span>Rate limit ativo. Envio de novas mensagens liberado em {rateLimitStatus.resetTimeSeconds} segundos.</span>
        </div>
      )}

      {/* Input Form Box */}
      <form 
        onSubmit={handleSend}
        style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '10px 0', 
          borderTop: '1px solid var(--border-color)',
          flexShrink: 0
        }}
      >
        <input
          type="text"
          className="form-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={rateLimitStatus.isBlocked ? "Aguardando liberação de taxa..." : "Ex: Quantas kcal comi hoje? Faltam quantos g de proteína?"}
          style={{ flex: 1, padding: '12px 16px', fontSize: '14px', borderRadius: '24px', userSelect: 'text', opacity: rateLimitStatus.isBlocked ? 0.6 : 1 }}
          disabled={isSending || rateLimitStatus.isBlocked}
        />
        <button 
          type="submit" 
          className="btn" 
          style={{ 
            width: '42px', 
            height: '42px', 
            borderRadius: '50%', 
            padding: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: (input.trim() && !rateLimitStatus.isBlocked) ? 'var(--accent)' : 'var(--bg-card)',
            color: (input.trim() && !rateLimitStatus.isBlocked) ? 'white' : 'var(--text-muted)',
            boxShadow: 'none',
            border: (input.trim() && !rateLimitStatus.isBlocked) ? 'none' : '1px solid var(--border-color)',
          }}
          disabled={!input.trim() || isSending || rateLimitStatus.isBlocked}
          aria-label="Enviar mensagem"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>

      {/* ConfirmModal customizado (iOS Safe) */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Limpar conversa?"
        message="Todo o histórico local de diálogo com o Nutricionista IA nesta tela será removido permanentemente. Refeições no diário não serão alteradas."
        confirmLabel="Limpar Histórico"
        cancelLabel="Voltar"
        danger={true}
        onConfirm={handleConfirmedClear}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </div>
  );
};
