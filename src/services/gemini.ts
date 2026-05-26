import type { MealItem } from '../types';
import { openDB } from './db';
import { logger } from '../utils/logger';

export interface GeminiAnalysisResult {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;   // em g (obrigatório no novo schema)
  sodium: number;  // em mg (obrigatório no novo schema)
  confidenceScale: number;
  confidenceFood: number;
  scaleReadText: string;
  explanation: string;
}

export interface ExistingMealItem {
  foodName: string;
  weightGrams: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

/**
 * Converte um arquivo File/Blob em string Base64 para envio na API do Gemini.
 */
export const fileToGenerativePart = (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Funções de Rate Limit Assíncronas via IndexedDB ---

async function getRateLimitTimestamps(): Promise<number[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get('rate_limit_timestamps');
      req.onsuccess = () => {
        resolve((req.result?.values as number[]) || []);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    logger.error('Erro ao ler timestamps de rate limit do DB', err);
    return [];
  }
}

async function saveRateLimitTimestamps(timestamps: number[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key: 'rate_limit_timestamps', values: timestamps });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logger.error('Erro ao salvar timestamps de rate limit no DB', err);
  }
}

export interface RateLimitStatus {
  isBlocked: boolean;
  remainingCalls: number;
  limit: number;
  resetTimeSeconds: number;
}

/**
 * Retorna o status atual do rate limit local no cliente consultando o IndexedDB.
 */
export async function getRateLimitStatus(): Promise<RateLimitStatus> {
  const limit = 10;
  const windowMs = 60 * 1000;
  const now = Date.now();
  
  let timestamps = await getRateLimitTimestamps();
  
  // Filtra chamadas na janela de 60 segundos
  timestamps = timestamps.filter(t => now - t < windowMs);
  
  const isBlocked = timestamps.length >= limit;
  const remainingCalls = Math.max(0, limit - timestamps.length);
  
  let resetTimeSeconds = 0;
  if (timestamps.length > 0) {
    const oldestTimestamp = timestamps[0];
    const timePassed = now - oldestTimestamp;
    resetTimeSeconds = Math.ceil(Math.max(0, windowMs - timePassed) / 1000);
  }
  
  return {
    isBlocked,
    remainingCalls,
    limit,
    resetTimeSeconds
  };
}

/**
 * Verifica e atualiza o limite de requisições do usuário (Max 10 req/min) via IndexedDB.
 */
async function checkRateLimit(): Promise<void> {
  const status = await getRateLimitStatus();
  if (status.isBlocked) {
    throw new Error(`Limite de segurança excedido. O app bloqueou temporariamente novas chamadas para evitar suspensão da sua chave de API (máximo ${status.limit} requisições por minuto). Aguarde ${status.resetTimeSeconds} segundos.`);
  }
  
  const now = Date.now();
  let timestamps = await getRateLimitTimestamps();
  const windowMs = 60 * 1000;
  timestamps = timestamps.filter(t => now - t < windowMs);
  timestamps.push(now);
  await saveRateLimitTimestamps(timestamps);
}

// --- Tratamento e Parsing Defensivo ---

/**
 * Realiza o parse seguro de respostas JSON do Gemini descartando markdown fences.
 */
function safeParseGeminiJson<T>(raw: string): T {
  // Remove markdown fences se o modelo ignorar e retornar o bloco de código
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // Tenta extrair o primeiro padrão de JSON válido {} caso o modelo escreva texto adicional
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch (innerErr) {
        throw new Error(`Erro ao interpretar o conteúdo JSON extraído: ${raw.substring(0, 100)}`);
      }
    }
    throw new Error(`Falha ao ler os dados estruturados da IA: ${raw.substring(0, 100)}`);
  }
}

/**
 * Trata erros específicos de status da API do Gemini para mensagens amigáveis.
 */
async function handleGeminiError(response: Response): Promise<never> {
  let body: Record<string, any> = {};
  try {
    body = await response.json();
  } catch { /* ignore */ }

  const errorMessage = (body?.error as Record<string, any>)?.message as string || '';

  switch (response.status) {
    case 400:
      throw new Error(`Requisição inválida: ${errorMessage || 'Verifique o formato da imagem ou parâmetros.'}`);
    case 401:
      throw new Error('Chave de API inválida ou expirada. Vá na aba de Ajustes e configure a chave do Gemini.');
    case 403:
      throw new Error('Acesso negado. Sua chave de API não tem permissão para acessar este modelo. Verifique as configurações no Google AI Studio.');
    case 429:
      throw new Error('Limite de requisições excedido na API da Google. Aguarde alguns instantes e tente novamente.');
    case 500:
    case 503:
      throw new Error('O servidor do Gemini está temporariamente indisponível. Aguarde alguns instantes e tente novamente.');
    default:
      throw new Error(`Erro inesperado na API (${response.status}): ${errorMessage || 'Tente novamente.'}`);
  }
}

// --- Funções de Chamada de API ---

/**
 * Envia a imagem e o contexto para o Gemini API e retorna o JSON estruturado.
 */
export async function analyzeFoodImage(
  imageFile: File,
  apiKey: string,
  existingItems: ExistingMealItem[] = [],
  modelName: string = 'gemini-2.5-flash',
  userNotes: string = '',
  customContext: string = ''
): Promise<GeminiAnalysisResult> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  await checkRateLimit();

  // Prepara a imagem em Base64
  const imagePart = await fileToGenerativePart(imageFile);

  // Prepara a lista de itens existentes como contexto em texto
  const existingItemsText = existingItems.length > 0
    ? existingItems.map(item => `- ${item.foodName} (${item.weightGrams}g)`).join('\n')
    : 'Nenhum alimento (este é o primeiro item colocado no prato).';

  const promptText = `
Você é uma inteligência artificial especialista em nutrição e visão computacional integrada a uma balança de cozinha digital.
O usuário está montando um prato de comida passo a passo. A cada passo, ele adiciona um novo alimento ao prato, zera (tare) a balança, e tira uma foto de cima que captura:
1. O prato com as comidas.
2. O visor da balança digital logo abaixo mostrando o peso do alimento recém-adicionado.

Esta foto representa a adição de um novo alimento ao prato.

---
LISTA DE ALIMENTOS JÁ ADICIONADOS ANTERIORMENTE NESTA REFEIÇÃO:
${existingItemsText}
---

---
INSTRUÇÕES/CONTEXTO PERSONALIZADO DO USUÁRIO:
${customContext || 'Nenhuma instrução adicional informada.'}
---

---
COMENTÁRIO DO USUÁRIO SOBRE ESTA FOTO/REFEIÇÃO:
"${userNotes || 'Nenhum comentário enviado.'}"
---

Instruções críticas para a sua análise:
1. IDENTIFICAR O ALIMENTO RECÉM-ADICIONADO: Compare as comidas visíveis no prato com a lista de alimentos já adicionados anteriormente, leve em consideração o COMENTÁRIO DO USUÁRIO. Identifique qual é o NOVO alimento colocado no prato nesta foto.
2. LER O VISOR DA BALANÇA: Localize o visor da balança digital na foto. Extraia o valor numérico em gramas correspondente ao peso do novo alimento adicionado. Se o visor estiver ilegível, borrado ou encoberto, estime o peso visualmente baseado no tamanho do alimento na foto e defina 'confidenceScale' para um valor baixo (< 0.5).
3. CALCULAR VALORES NUTRICIONAIS: Com base no tipo de alimento identificado e seu peso estimado/lido em gramas, calcule a quantidade aproximada de Calorias (kcal), Proteínas (g), Carboidratos (g), Gorduras (g), Fibras (g) e Sódio (mg).
4. RETORNAR EXCLUSIVAMENTE O SCHEMA JSON REQUISITADO.

Responda rigorosamente seguindo o seguinte formato de objeto JSON:
{
  "foodName": "Nome do alimento em português",
  "weightGrams": 150, // número inteiro em gramas
  "calories": 180, // calorias estimadas para essa gramatura
  "protein": 4.5, // proteínas em gramas (pode ser decimal)
  "carbs": 35.0, // carboidratos em gramas (pode ser decimal)
  "fat": 1.2, // gorduras em gramas (pode ser decimal)
  "fiber": 2.5, // fibras em gramas (pode ser decimal)
  "sodium": 15.0, // sódio em mg (inteiro ou decimal)
  "confidenceScale": 0.95, // confiança na leitura do peso da balança (0.0 a 1.0)
  "confidenceFood": 0.90, // confiança na identificação do alimento (0.0 a 1.0)
  "scaleReadText": "150g", // o texto literal do peso lido no visor da balança (ex: "150", "150 g", "0.15")
  "explanation": "Explicação breve em português da detecção"
}
`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: imagePart.inlineData.mimeType,
              data: imagePart.inlineData.data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          foodName: { type: 'STRING' },
          weightGrams: { type: 'NUMBER' },
          calories: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
          fiber: { type: 'NUMBER' },
          sodium: { type: 'NUMBER' },
          confidenceScale: { type: 'NUMBER' },
          confidenceFood: { type: 'NUMBER' },
          scaleReadText: { type: 'STRING' },
          explanation: { type: 'STRING' }
        },
        required: [
          'foodName',
          'weightGrams',
          'calories',
          'protein',
          'carbs',
          'fat',
          'fiber',
          'sodium',
          'confidenceScale',
          'confidenceFood',
          'scaleReadText',
          'explanation'
        ]
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleGeminiError(response);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Resposta vazia da API do Gemini.');
    }

    return safeParseGeminiJson<GeminiAnalysisResult>(textResponse);
  } catch (error) {
    logger.error('Erro ao analisar alimento com Gemini', error);
    throw error;
  }
}

interface ChatMealSummary {
  type: string;
  timestamp: number;
  items: MealItem[];
}

/**
 * Envia o histórico de refeições e a mensagem do usuário para o Gemini responder como nutricionista.
 */
export async function chatWithNutritionist(
  apiKey: string,
  message: string,
  chatHistory: ChatMessage[],
  mealsHistory: ChatMealSummary[],
  targets: { calories: number; carbs: number; protein: number; fat: number; fiber?: number; sodium?: number },
  customContext: string = '',
  modelName: string = 'gemini-2.5-flash'
): Promise<string> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  await checkRateLimit();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  // OTIMIZAÇÃO: Filtra apenas refeições dos últimos 7 dias para evitar sobrecarga de tokens
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentMeals = mealsHistory.filter(meal => meal.timestamp > sevenDaysAgo);

  const mealsText = recentMeals.length > 0
    ? recentMeals.map((meal, index) => {
        const date = new Date(meal.timestamp).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const itemsList = meal.items.map(item => `  - ${item.foodName}: ${item.weightGrams}g (${item.calories} kcal, P:${item.protein}g, C:${item.carbs}g, G:${item.fat}g, Fibras:${item.fiber || 0}g, Sódio:${item.sodium || 0}mg)`).join('\n');
        return `Refeição ${index + 1} [${meal.type}] em ${date}:\n${itemsList}`;
      }).join('\n\n')
    : 'Nenhuma refeição registrada no histórico de 7 dias.';

  // OTIMIZAÇÃO: Limita o histórico de chat enviado para as últimas 20 mensagens
  const recentChatHistory = chatHistory.slice(-20);

  const conversationText = recentChatHistory.map(msg => 
    `${msg.sender === 'user' ? 'Usuário' : 'Nutri (IA)'}: ${msg.text}`
  ).join('\n');

  const systemPrompt = `
Você é o "Nutri (IA)", o nutricionista pessoal e parceiro de dieta inteligente do usuário. Seu objetivo é guiar o usuário em sua alimentação de forma amigável, motivadora, técnica e direta.

Você tem acesso total aos dados de consumo dele inseridos no aplicativo.

METAS DIÁRIAS DO USUÁRIO:
- Calorias: ${targets.calories} kcal
- Proteínas: ${targets.protein}g
- Carboidratos: ${targets.carbs}g
- Gorduras: ${targets.fat}g
- Fibras: ${targets.fiber || 25}g
- Sódio: ${targets.sodium || 2000}mg

INSTRUÇÕES/CONTEXTO PERSONALIZADO DO USUÁRIO:
${customContext || 'Nenhum contexto extra fornecido.'}

HISTÓRICO RECENTE DE REFEIÇÕES DO USUÁRIO (ÚLTIMOS 7 DIAS):
${mealsText}

DATA/HORA ATUAL DO SISTEMA: ${new Date().toLocaleString('pt-BR')}

---
HISTÓRICO DE CHAT RECENTE COM O USUÁRIO (ÚLTIMOS 20 DIÁLOGOS):
${conversationText}

Nova mensagem do Usuário: "${message}"

Responda à pergunta do usuário de forma útil.
Requisitos da resposta:
1. Responda em português de forma concisa e amigável (estilo conversa rápida de WhatsApp/iOS).
2. Se ele perguntar sobre o que comeu hoje ou resumos das metas, use os dados acima para fazer os cálculos e responder exatamente quanto ele consumiu e quanto resta. Inclua cálculo de fibras e sódio.
3. Se o usuário perguntar sobre dados mais antigos que 7 dias, informe que você tem acesso apenas ao histórico recente de 7 dias no contexto atual e peça para ele especificar o período se necessário.
4. Use markdown simples para formatação (ex: negritos).
5. Mantenha a atitude empática de um nutricionista de futebol/esportes.
6. Não invente refeições que não estão na lista de histórico, baseie-se estritamente nos fatos informados.
7. SINCRONIZAÇÃO AUTOMÁTICA DE MACROS (<sync_macros>): Se o usuário descrever alimentos que consumiu HOJE, ou se pedir para sincronizar/atualizar os macros de hoje baseado na conversa ou no histórico/txt importado recentemente, analise o texto e gere a estrutura de refeição correspondente. Você deve anexar esta estrutura no final da sua resposta, delimitada pela tag <sync_macros>...</sync_macros> no seguinte formato exato:

<sync_macros>
{
  "meals": [
    {
      "type": "Almoço", // Deve ser exatamente: "Café da Manhã" | "Almoço" | "Jantar" | "Lanche"
      "timestamp": ${new Date().setHours(12, 30, 0, 0)}, // timestamp em milissegundos correspondente ao horário aproximado da refeição HOJE
      "items": [
        {
          "foodName": "Nome do alimento",
          "weightGrams": 150,
          "calories": 200,
          "protein": 5,
          "carbs": 40,
          "fat": 1,
          "fiber": 2,
          "sodium": 150
        }
      ]
    }
  ]
}
</sync_macros>

Importante:
- Somente anexe a tag <sync_macros> se o usuário relatar consumo de alimentos hoje ou pedir explicitamente para puxar as informações de hoje da conversa/txt.
- Estime gramaturas e valores calóricos realistas caso não detalhado.
- Se a conversa for apenas teórica ou sobre outros assuntos, NÃO inclua a tag <sync_macros>.
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt }
        ]
      }
    ]
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleGeminiError(response);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      throw new Error('Sem resposta do modelo Gemini.');
    }

    return reply.trim();
  } catch (error) {
    logger.error('Erro na chamada de chat com Gemini', error);
    throw error;
  }
}

export interface WorkoutAnalysisResult {
  caloriesBurnedWorkout: number;
  caloriesBurnedCardio: number;
  totalDailyExpenditure: number;
  explanation: string;
}

/**
 * Envia as notas de treino e cardio do usuário, peso e altura, e calcula os gastos calóricos estimados.
 */
export async function calculateWorkoutCalories(
  apiKey: string,
  weightKg: number,
  heightCm: number,
  workoutNotes: string,
  cardioNotes: string,
  modelName: string = 'gemini-2.5-flash'
): Promise<WorkoutAnalysisResult> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  await checkRateLimit();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const promptText = `
Você é uma inteligência artificial especialista em fisiologia do exercício, educação física e nutrição esportiva.
O usuário deseja calcular o gasto calórico estimado do seu treino de força e cardio de hoje, além de projetar o seu Gasto Energético Total Diário (GETD).

DADOS BIOMÉTRICOS:
- Peso corporal: ${weightKg} kg
- Altura corporal: ${heightCm} cm

INFORMAÇÕES DO TREINO DE FORÇA (ACADEMIA / MUSCULAÇÃO):
"${workoutNotes || 'Nenhum treino de força realizado hoje.'}"

INFORMAÇÕES DO CARDIO (AERÓBICO):
"${cardioNotes || 'Nenhum cardio realizado hoje.'}"

Instruções para a sua análise:
1. ESTIMAR GASTO DO TREINO DE FORÇA: Com base nos exercícios, séries, repetições e pesos relatados, estime o gasto calórico aproximado (kcal) desse treino de força, levando em conta o peso corporal do usuário.
2. ESTIMAR GASTO DO CARDIO: Estime o gasto calórico (kcal) do cardio com base na atividade, tempo e intensidade informados.
3. CALCULAR TAXA METABÓLICA BASAL (TMB): Calcule a TMB estimada usando a fórmula de Mifflin-St Jeor (ou Harris-Benedict) assumindo uma idade média padrão de 25-30 anos.
4. ESTIMAR GASTO ENERGÉTICO TOTAL DIÁRIO (GETD): Some TMB + NEAT (gasto por atividades diárias espontâneas, ex: ~350 kcal) + treino + cardio para gerar o gasto total diário estimado.
5. RETORNAR EXCLUSIVAMENTE O SCHEMA JSON REQUISITADO.

Responda rigorosamente seguindo o seguinte formato de objeto JSON:
{
  "caloriesBurnedWorkout": 280, // número inteiro de kcal gastas no treino de força
  "caloriesBurnedCardio": 150, // número inteiro de kcal gastas no cardio
  "totalDailyExpenditure": 2650, // GETD total estimado
  "explanation": "Explicação concisa em português do cálculo, mencionando a TMB aproximada calculada, o esforço/METs dos treinos e as fórmulas usadas."
}
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          caloriesBurnedWorkout: { type: 'NUMBER' },
          caloriesBurnedCardio: { type: 'NUMBER' },
          totalDailyExpenditure: { type: 'NUMBER' },
          explanation: { type: 'STRING' }
        },
        required: [
          'caloriesBurnedWorkout',
          'caloriesBurnedCardio',
          'totalDailyExpenditure',
          'explanation'
        ]
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleGeminiError(response);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Resposta vazia da API do Gemini.');
    }

    return safeParseGeminiJson<WorkoutAnalysisResult>(textResponse);
  } catch (error) {
    logger.error('Erro ao calcular gasto calórico do treino com Gemini', error);
    throw error;
  }
}

export interface ExtractedMealItem {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

export interface ExtractedMeal {
  type: 'Café da Manhã' | 'Almoço' | 'Jantar' | 'Lanche';
  timestamp: number;
  items: ExtractedMealItem[];
}

export interface ExtractedMealsResult {
  meals: ExtractedMeal[];
}

/**
 * Analisa um texto de histórico de chat importado e extrai as refeições relatadas como consumidas HOJE,
 * estimando seus macronutrientes.
 */
export async function extractMealsFromChatHistory(
  apiKey: string,
  chatText: string,
  modelName: string = 'gemini-2.5-flash'
): Promise<ExtractedMealsResult> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  await checkRateLimit();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const today = new Date();
  const todayDateStr = today.toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const todayTimestampStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const promptText = `
Você é uma inteligência artificial especialista em nutrição e análise de dados de alimentação.
O usuário está importando um arquivo de texto com o histórico de uma conversa ou um diário alimentar.
Sua missão é ler este texto e identificar TODAS as refeições que o usuário relatou ter consumido especificamente no dia de HOJE.

A DATA DE HOJE É: ${todayDateStr} (Qualquer menção a 'hoje', 'nesta manhã', 'no café de hoje', etc., no texto refere-se a este dia).

Instruções para análise:
1. IDENTIFICAR CONSUMO DE HOJE: Procure por relatos de alimentos consumidos especificamente no dia de HOJE. Descarte refeições de ontem, de semanas passadas, ou planos de dieta para o futuro que ele ainda não consumiu.
2. ESTIMAR PORÇÃO E MACROS: Se o usuário relatou comer algo sem especificar as gramas (ex: "comi um pão com ovo"), faça uma estimativa padrão realista (ex: pão francês 50g, ovo 50g) e calcule Calorias, Proteínas (g), Carboidratos (g), Gorduras (g), Fibras (g) e Sódio (mg) para cada alimento.
3. CALCULAR TIMESTAMP APROXIMADO: Defina o timestamp de cada refeição identificada no dia de hoje. Use a hora aproximada com base no tipo da refeição:
   - Café da Manhã: hoje às 08:00 (Timestamp: ${todayTimestampStart + 8 * 60 * 60 * 1000})
   - Almoço: hoje às 12:30 (Timestamp: ${todayTimestampStart + 12.5 * 60 * 60 * 1000})
   - Lanche: hoje às 16:30 (Timestamp: ${todayTimestampStart + 16.5 * 60 * 60 * 1000})
   - Jantar: hoje às 20:30 (Timestamp: ${todayTimestampStart + 20.5 * 60 * 60 * 1000})
4. RETORNAR APENAS O JSON ESTRUTURADO. Se nenhuma refeição consumida hoje for encontrada no texto, retorne o campo "meals" como uma lista vazia [].

Siga rigorosamente este formato de retorno JSON:
{
  "meals": [
    {
      "type": "Almoço", // Deve ser exclusivamente um destes: "Café da Manhã", "Almoço", "Jantar", "Lanche"
      "timestamp": ${todayTimestampStart + 12.5 * 60 * 60 * 1000}, // número inteiro em milissegundos
      "items": [
        {
          "foodName": "Arroz branco cozido",
          "weightGrams": 150,
          "calories": 195,
          "protein": 3.75,
          "carbs": 42.0,
          "fat": 0.3,
          "fiber": 2.4,
          "sodium": 150.0
        }
      ]
    }
  ]
}
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          { text: `TEXTO PARA ANÁLISE:\n\n${chatText}` }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          meals: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                type: { type: 'STRING', enum: ['Café da Manhã', 'Almoço', 'Jantar', 'Lanche'] },
                timestamp: { type: 'NUMBER' },
                items: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      foodName: { type: 'STRING' },
                      weightGrams: { type: 'NUMBER' },
                      calories: { type: 'NUMBER' },
                      protein: { type: 'NUMBER' },
                      carbs: { type: 'NUMBER' },
                      fat: { type: 'NUMBER' },
                      fiber: { type: 'NUMBER' },
                      sodium: { type: 'NUMBER' }
                    },
                    required: ['foodName', 'weightGrams', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium']
                  }
                }
              },
              required: ['type', 'timestamp', 'items']
            }
          }
        },
        required: ['meals']
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleGeminiError(response);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Resposta vazia da IA na extração de refeições.');
    }

    return safeParseGeminiJson<ExtractedMealsResult>(textResponse);
  } catch (error) {
    logger.error('Erro ao extrair refeições do histórico do chat', error);
    throw error;
  }
}

