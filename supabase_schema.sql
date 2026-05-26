-- Script de Inicialização de Banco de Dados para o NutriScale AI no Supabase
-- Copie e cole este script no SQL Editor do painel do seu Supabase para criar as tabelas e políticas de segurança necessárias.

-- ==========================================
-- 1. TABELA DE PERFIS DE USUÁRIOS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  weight NUMERIC DEFAULT 75.0,
  height NUMERIC DEFAULT 175.0,
  gemini_api_key TEXT,
  model_name TEXT DEFAULT 'gemini-2.0-flash',
  custom_context TEXT DEFAULT '',
  targets JSONB DEFAULT '{"calories": 2000, "carbs": 200, "protein": 120, "fat": 60, "fiber": 25, "sodium": 2000}'::jsonb
);

-- Ativa Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
CREATE POLICY "Usuários podem ver o próprio perfil" 
  ON public.profiles FOR SELECT 
  TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar o próprio perfil" 
  ON public.profiles FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem inserir o próprio perfil" 
  ON public.profiles FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = id);

-- Trigger e Função para criar perfil automaticamente no cadastro do usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, weight, height, gemini_api_key, model_name, custom_context, targets)
  VALUES (
    new.id,
    75.0,
    175.0,
    NULL,
    'gemini-2.0-flash',
    '',
    '{"calories": 2000, "carbs": 200, "protein": 120, "fat": 60, "fiber": 25, "sodium": 2000}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger se já existir para evitar erros de re-execução
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 2. TABELA DE REFEIÇÕES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  timestamp BIGINT NOT NULL,
  type TEXT NOT NULL,
  items JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ativa Row Level Security (RLS)
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
CREATE POLICY "Usuários podem gerenciar suas próprias refeições"
  ON public.meals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cria índice no timestamp para melhor performance de buscas por período
CREATE INDEX IF NOT EXISTS idx_meals_timestamp ON public.meals (timestamp);
CREATE INDEX IF NOT EXISTS idx_meals_user_timestamp ON public.meals (user_id, timestamp);

-- ==========================================
-- 3. TABELA DE TREINOS (WORKOUTS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  timestamp BIGINT NOT NULL,
  weight_kg NUMERIC NOT NULL,
  height_cm NUMERIC NOT NULL,
  workout_notes TEXT,
  cardio_notes TEXT,
  calories_burned_workout NUMERIC DEFAULT 0,
  calories_burned_cardio NUMERIC DEFAULT 0,
  total_daily_expenditure NUMERIC DEFAULT 0,
  ia_explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ativa Row Level Security (RLS)
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
CREATE POLICY "Usuários podem gerenciar seus próprios treinos"
  ON public.workouts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_workouts_user_timestamp ON public.workouts (user_id, timestamp);

-- ==========================================
-- 4. TABELA DE HISTÓRICO DE CHAT
-- ==========================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  sender TEXT CHECK (sender IN ('user', 'ai')) NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ativa Row Level Security (RLS)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
CREATE POLICY "Usuários podem gerenciar suas próprias mensagens"
  ON public.chat_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_user_timestamp ON public.chat_messages (user_id, timestamp);
