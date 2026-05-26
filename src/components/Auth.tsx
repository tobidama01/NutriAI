import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Lock, Mail, RefreshCw, AlertCircle, CheckCircle, Database } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: () => void;
  isRecoveryMode?: boolean;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess, isRecoveryMode = false }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    isRecoveryMode ? 'reset' : 'login'
  );
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Exibe instruções caso o Supabase não esteja configurado
  if (!isSupabaseConfigured) {
    return (
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', maxWidth: '420px', margin: '40px auto' }}>
        <div className="card" style={{ border: '1px solid rgba(245, 158, 11, 0.25)', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Database size={48} style={{ color: 'var(--color-fat)' }} />
          </div>
          <h2>Conexão Necessária</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Para ativar a persistência na nuvem e o sistema de login, configure as chaves do Supabase.
          </p>
          <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: '12px', textAlign: 'left', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase' }}>Como Configurar:</span>
            <ol style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Crie um arquivo chamado <strong>.env.local</strong> na raiz do projeto.</li>
              <li>Adicione as chaves abaixo no arquivo:</li>
            </ol>
            <pre style={{ fontSize: '10px', color: 'white', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', overflowX: 'auto', fontFamily: 'monospace' }}>
{`VITE_SUPABASE_URL=https://sua-url.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica`}
            </pre>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Após criar o arquivo, reinicie o servidor de desenvolvimento.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    
    // Validações básicas de e-mail e senha
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim()) && mode !== 'reset') {
      setErrorMsg('Por favor, insira um e-mail válido.');
      return;
    }

    if (password.length < 6 && mode !== 'forgot') {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onAuthSuccess();
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setErrorMsg('As senhas não coincidem.');
          setIsLoading(false);
          return;
        }
        
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;

        // Se o Supabase exigir confirmação por e-mail
        if (data.session === null) {
          setSuccessMsg('Cadastro realizado! Verifique sua caixa de entrada para confirmar o e-mail.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        } else {
          onAuthSuccess();
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setSuccessMsg('Link de redefinição enviado! Verifique seu e-mail.');
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setErrorMsg('As senhas não coincidem.');
          setIsLoading(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({
          password: password,
        });
        if (error) throw error;
        setSuccessMsg('Senha atualizada com sucesso! Você já pode fazer login.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      // Mensagens de erro amigáveis
      let msg = err.message || 'Ocorreu um erro inesperado.';
      if (msg.includes('Invalid login credentials')) {
        msg = 'E-mail ou senha incorretos.';
      } else if (msg.includes('User already registered')) {
        msg = 'Este e-mail já está cadastrado.';
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px', maxWidth: '420px', width: '100%', margin: '40px auto' }}>
      
      {/* Logo / Header */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 800 }}>NutriScale AI</h1>
        <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          {mode === 'login' && 'Faça login para salvar seus dados'}
          {mode === 'register' && 'Crie uma conta para começar'}
          {mode === 'forgot' && 'Recupere o acesso à sua conta'}
          {mode === 'reset' && 'Defina sua nova senha de acesso'}
        </h3>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '16px', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-cal)', fontSize: '13px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '16px', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-prot)', fontSize: '13px' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Card Principal */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
        
        {/* Abas Alternadoras (Apenas para Login / Registro) */}
        {(mode === 'login' || mode === 'register') && (
          <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <button 
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(null); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: mode === 'login' ? 'var(--bg-card)' : 'transparent', color: mode === 'login' ? 'white' : 'var(--text-secondary)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Entrar
            </button>
            <button 
              type="button"
              onClick={() => { setMode('register'); setErrorMsg(null); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: mode === 'register' ? 'var(--bg-card)' : 'transparent', color: mode === 'register' ? 'white' : 'var(--text-secondary)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Criar Conta
            </button>
          </div>
        )}

        <form onSubmit={handleAuth} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Campo E-mail */}
          {mode !== 'reset' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">E-mail</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="auth-email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@email.com"
                  required
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <Mail size={16} style={{ position: 'absolute', left: '14px', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {/* Campo Senha */}
          {mode !== 'forgot' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">
                {mode === 'reset' ? 'Nova Senha' : 'Senha'}
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="auth-password"
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '14px', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {/* Campo Confirmar Senha */}
          {(mode === 'register' || mode === 'reset') && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-confirm-password">Confirmar Senha</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="auth-confirm-password"
                  type="password"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '14px', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {/* Link Esqueci Minha Senha */}
          {mode === 'login' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setErrorMsg(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
              >
                Esqueceu a senha?
              </button>
            </div>
          )}

          {/* Botão de Envio */}
          <button 
            type="submit" 
            className="btn" 
            disabled={isLoading}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '14px', marginTop: '4px' }}
          >
            {isLoading ? (
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                {mode === 'login' && 'Entrar na Conta'}
                {mode === 'register' && 'Registrar Conta'}
                {mode === 'forgot' && 'Enviar Link de Redefinição'}
                {mode === 'reset' && 'Salvar Nova Senha'}
              </>
            )}
          </button>
        </form>

        {/* Link para voltar ao Login */}
        {(mode === 'forgot' || mode === 'reset') && (
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Voltar para o Login
          </button>
        )}
      </div>
    </div>
  );
};
