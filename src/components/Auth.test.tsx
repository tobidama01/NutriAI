import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Auth } from './Auth';
import { supabase } from '../services/supabaseClient';

// Mock do supabaseClient para isolar testes do componente de UI
vi.mock('../services/supabaseClient', () => {
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
      },
    },
  };
});

describe('Componente Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve renderizar a tela de login por padrão', () => {
    render(<Auth onAuthSuccess={() => {}} />);
    
    expect(screen.getByRole('heading', { name: 'NutriScale AI' })).toBeInTheDocument();
    expect(screen.getByText('Faça login para salvar seus dados')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirmar Senha')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar na Conta' })).toBeInTheDocument();
  });

  it('deve alternar para a aba de cadastro ao clicar no botão correspondente', () => {
    render(<Auth onAuthSuccess={() => {}} />);
    
    const registerTab = screen.getByRole('button', { name: 'Criar Conta' });
    fireEvent.click(registerTab);

    expect(screen.getByText('Crie uma conta para começar')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar Conta' })).toBeInTheDocument();
  });

  it('deve exibir formulário de recuperação de senha ao clicar em "Esqueceu a senha?"', () => {
    render(<Auth onAuthSuccess={() => {}} />);
    
    const forgotLink = screen.getByRole('button', { name: 'Esqueceu a senha?' });
    fireEvent.click(forgotLink);

    expect(screen.getByText('Recupere o acesso à sua conta')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar Link de Redefinição' })).toBeInTheDocument();
  });

  it('deve mostrar mensagem de erro ao submeter e-mail inválido', async () => {
    render(<Auth onAuthSuccess={() => {}} />);
    
    const emailInput = screen.getByLabelText('E-mail');
    fireEvent.change(emailInput, { target: { value: 'emailinvalido' } });
    
    const submitBtn = screen.getByRole('button', { name: 'Entrar na Conta' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Por favor, insira um e-mail válido.')).toBeInTheDocument();
    });
  });

  it('deve chamar supabase signInWithPassword ao realizar login correto', async () => {
    const onAuthSuccessMock = vi.fn();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({ data: {} as any, error: null });

    render(<Auth onAuthSuccess={onAuthSuccessMock} />);
    
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@email.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha123' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na Conta' }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'teste@email.com',
        password: 'senha123',
      });
      expect(onAuthSuccessMock).toHaveBeenCalled();
    });
  });

  it('deve renderizar tela de redefinição se o prop isRecoveryMode for ativo', () => {
    render(<Auth onAuthSuccess={() => {}} isRecoveryMode={true} />);
    
    expect(screen.getByText('Defina sua nova senha de acesso')).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar Nova Senha' })).toBeInTheDocument();
  });
});
