# NutriAI 🥑🥗 — Nutrição Inteligente com Inteligência Artificial

O **NutriAI** é um ecossistema inteligente de controle nutricional e monitoramento físico. Ele combina **visão computacional**, **modelos de linguagem de última geração (Google Gemini)** e uma arquitetura robusta de banco de dados relacional e distribuído (**Supabase + IndexedDB**) para oferecer uma experiência de auto-monitoramento de alta performance, focada em praticidade e privacidade.

---

## 🚀 Principais Funcionalidades

### 1. 📸 Visão Computacional para Análise de Pratos (NutriScale)
*   **Reconhecimento Visual**: Identifique alimentos a partir de fotos tiradas de cima.
*   **Leitura Automatizada de Balança**: A IA localiza e lê o visor de balanças de cozinha digitais para extrair o peso exato do alimento em gramas.
*   **Estimativa de Macros e Micros**: Receba de volta dados estruturados detalhando Calorias (kcal), Proteínas (g), Carboidratos (g), Gorduras (g), Fibras (g) e Sódio (mg) com base na porção pesada.

### 2. 💬 Chat com Nutricionista Pessoal (IA)
*   **Contexto Integrado**: O chat tem acesso ao seu histórico alimentar recente (últimos 7 dias) e metas diárias.
*   **Sincronização de Macros via Diálogo (`<sync_macros>`)**: Se você relatar o consumo de algum alimento por texto no chat, a IA detecta, calcula as informações nutricionais e sincroniza a refeição diretamente no seu diário com um clique.

### 3. 🏋️ Gasto Calórico de Exercícios (Workouts)
*   **Cálculo Fisiológico com IA**: Descreva seus treinos de musculação (exercícios, séries, cargas) e cardio (aeróbicos, ritmo, duração).
*   **Gasto Energético Total Diário (GETD)**: O app calcula sua Taxa Metabolica Basal (TMB) pelo método de Mifflin-St Jeor e adiciona os gastos estimados de força, cardio e NEAT para projetar seu gasto calórico total diário.

### 4. 🔒 Arquitetura Híbrida e Segurança Robusta
*   **Autenticação Completa**: Fluxos de login, cadastro com validações de senha forte e redefinição de senha segura via link de e-mail integrado.
*   **Offline-First com Cache Local (IndexedDB)**: A aplicação continua funcionando offline. Suas refeições e treinos são cacheados e sincronizados com a nuvem quando houver conexão.
*   **Políticas de Segurança Supabase (RLS)**: Cada usuário possui isolamento total de seus dados usando *Row Level Security* nativo no PostgreSQL. Seus dados nunca são visíveis para outros usuários.
*   **Migração Automática**: Se você usar o app deslogado e criar uma conta depois, seus dados locais são migrados de forma transparente para a nuvem.

---

## 🛠️ Stack Tecnológica

*   **Front-end**: React, TypeScript, Vite
*   **Banco de Dados & Auth**: Supabase (PostgreSQL, Row Level Security)
*   **Banco de Dados Local**: IndexedDB
*   **Inteligência Artificial**: Google Gemini API (`gemini-2.5-flash` e `gemini-3.5-flash`)
*   **Estilização**: CSS Customizado (Premium Dark Green Organic, Glassmorphism, Micro-animações)
*   **Testes**: Vitest, React Testing Library, JSDom
*   **Ícones**: Lucide React

---

## ⚙️ Configuração do Ambiente de Desenvolvimento

Para rodar o projeto localmente, siga os passos abaixo:

### 1. Clonar o Repositório e Instalar Dependências
```bash
git clone https://github.com/tobidama01/NutriAI.git
cd NutriAI
npm install
```

### 2. Configurar Variáveis de Ambiente
Crie um arquivo `.env.local` na raiz do projeto e configure as chaves a seguir (utilize o arquivo `.env.example` como base):

```env
VITE_SUPABASE_URL=https://sua-url-do-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica-do-supabase
VITE_GEMINI_API_KEY=sua-chave-de-api-do-google-gemini
```
> [!IMPORTANT]  
> Nunca comite o arquivo `.env.local` no Git. Ele já está listado no `.gitignore` para garantir a proteção das suas credenciais.

### 3. Executar o Script do Banco de Dados
Acesse o console do seu projeto no **Supabase**, abra o **SQL Editor**, cole o conteúdo contido em `supabase_schema.sql` e clique em **Run**. Isso criará as tabelas, índices e triggers de criação de perfil automática no cadastro.

### 4. Executar os Testes Unitários
Para rodar a suíte de testes unitários integrados:
```bash
npm run test:run
```

### 5. Iniciar o Servidor Local
```bash
npm run dev
```

---

## 📦 Deploy (Produção na Vercel)

Para realizar o deploy na **Vercel**:
1. Conecte o repositório GitHub ao painel da Vercel.
2. Nas configurações do projeto na Vercel (**Settings** > **Environment Variables**), adicione as chaves:
   * `VITE_SUPABASE_URL`
   * `VITE_SUPABASE_ANON_KEY`
   * `VITE_GEMINI_API_KEY`
3. Execute um novo build/deploy para injetar as variáveis.
