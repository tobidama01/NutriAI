export interface GeminiAnalysisResult {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidenceScale: number;
  confidenceFood: number;
  scaleReadText: string;
  explanation: string;
}

export interface ExistingMealItem {
  foodName: string;
  weightGrams: number;
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

export interface RateLimitStatus {
  isBlocked: boolean;
  remainingCalls: number;
  limit: number;
  resetTimeSeconds: number;
}

/**
 * Retorna o status atual do rate limit local no cliente.
 */
export function getRateLimitStatus(): RateLimitStatus {
  const limit = 10;
  const windowMs = 60 * 1000;
  const now = Date.now();
  
  const savedCalls = localStorage.getItem('nutri_api_call_timestamps');
  let timestamps: number[] = [];
  
  if (savedCalls) {
    try {
      timestamps = JSON.parse(savedCalls);
    } catch (e) {
      timestamps = [];
    }
  }
  
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
 * Verifica e atualiza o limite de requisições do usuário (Max 10 req/min)
 * para evitar rate limiting ou suspensão de chaves gratuitas na Google.
 */
function checkRateLimit(): void {
  const status = getRateLimitStatus();
  if (status.isBlocked) {
    throw new Error(`Limite de segurança excedido. O app bloqueou temporariamente novas chamadas para evitar suspensão da sua chave de API (máximo ${status.limit} requisições por minuto). Aguarde ${status.resetTimeSeconds} segundos.`);
  }
  
  const now = Date.now();
  const savedCalls = localStorage.getItem('nutri_api_call_timestamps');
  let timestamps: number[] = [];
  
  if (savedCalls) {
    try {
      timestamps = JSON.parse(savedCalls);
    } catch (e) {
      timestamps = [];
    }
  }
  
  const windowMs = 60 * 1000;
  timestamps = timestamps.filter(t => now - t < windowMs);
  timestamps.push(now);
  localStorage.setItem('nutri_api_call_timestamps', JSON.stringify(timestamps));
}

/**
 * Envia a imagem e o contexto para o Gemini API e retorna o JSON estruturado.
 */
export async function analyzeFoodImage(
  imageFile: File,
  apiKey: string,
  existingItems: ExistingMealItem[] = [],
  modelName: string = 'gemini-3.5-flash',
  userNotes: string = '',
  customContext: string = ''
): Promise<GeminiAnalysisResult> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  checkRateLimit();

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
1. IDENTIFICAR O ALIMENTO RECÉM-ADICIONADO: Compare as comidas visíveis no prato com a lista de alimentos já adicionados anteriormente, leve em consideração o COMENTÁRIO DO USUÁRIO (ex: se ele disser "café padrão" e estiver definido no contexto dele que o café padrão dele é "pão integral e queijo prato", ou se ele disser "couve refogada", use isso para guiar a identificação precisa). Identifique qual é o NOVO alimento colocado no prato nesta foto.
2. LER O VISOR DA BALANÇA: Localize o visor da balança digital na foto. Extraia o valor numérico em gramas correspondente ao peso do novo alimento adicionado. Se o visor estiver com sinal de menos (-) ou unidade diferente, tente converter para gramas positivas. Se o visor estiver ilegível, borrado ou encoberto, estime o peso visualmente baseado no tamanho do alimento na foto e defina 'confidenceScale' para um valor baixo (< 0.5).
3. CALCULAR VALORES NUTRICIONAIS: Com base no tipo de alimento identificado e seu peso estimado/lido em gramas, calcule a quantidade aproximada de Calorias (kcal), Proteínas (g), Carboidratos (g) e Gorduras (g).
4. RETORNAR EXCLUSIVAMENTE O SCHEMA JSON REQUISITADO.

Responda rigorosamente seguindo o seguinte formato de objeto JSON:
{
  "foodName": "Nome do alimento em português",
  "weightGrams": 150, // número inteiro em gramas
  "calories": 180, // calorias estimadas para essa gramatura
  "protein": 4.5, // proteínas em gramas (pode ser decimal)
  "carbs": 35.0, // carboidratos em gramas (pode ser decimal)
  "fat": 1.2, // gorduras em gramas (pode ser decimal)
  "confidenceScale": 0.95, // confiança na leitura do peso da balança (0.0 a 1.0)
  "confidenceFood": 0.90, // confiança na identificação do alimento (0.0 a 1.0)
  "scaleReadText": "150g", // o texto literal do peso lido no visor da balança (ex: "150", "150 g", "0.15")
  "explanation": "Explicação breve em português da detecção"
}
`;

  // Construção do payload da API do Gemini
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
      console.error('Erro na chamada da API do Gemini (status:', response.status, ')');
      throw new Error(`Erro na API (${response.status}): Ocorreu uma falha na análise. Verifique sua chave de API.`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Resposta vazia da API do Gemini.');
    }

    const parsedResult: GeminiAnalysisResult = JSON.parse(textResponse.trim());
    return parsedResult;
  } catch (error) {
    console.error('Erro ao analisar alimento com Gemini:', error);
    throw error;
  }
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface ChatMealSummary {
  type: string;
  timestamp: number;
  items: {
    foodName: string;
    weightGrams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
}

/**
 * Envia o histórico de refeições e a mensagem do usuário para o Gemini responder como nutricionista.
 */
export async function chatWithNutritionist(
  apiKey: string,
  message: string,
  chatHistory: ChatMessage[],
  mealsHistory: ChatMealSummary[],
  targets: { calories: number; carbs: number; protein: number; fat: number },
  customContext: string = '',
  modelName: string = 'gemini-3.5-flash'
): Promise<string> {
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  checkRateLimit();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  // Formata o histórico de refeições do usuário de forma legível para a IA
  const mealsText = mealsHistory.length > 0
    ? mealsHistory.map((meal, index) => {
        const date = new Date(meal.timestamp).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const itemsList = meal.items.map(item => `  - ${item.foodName}: ${item.weightGrams}g (${item.calories} kcal, P:${item.protein}g, C:${item.carbs}g, G:${item.fat}g)`).join('\n');
        return `Refeição ${index + 1} [${meal.type}] em ${date}:\n${itemsList}`;
      }).join('\n\n')
    : 'Nenhuma refeição registrada no histórico ainda.';

  // Formata a conversa recente
  const conversationText = chatHistory.map(msg => 
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

INSTRUÇÕES/CONTEXTO PERSONALIZADO DO USUÁRIO (Lembre-se disso ao responder e ao mapear atalhos como 'café padrão' se ele perguntar):
${customContext || 'Nenhum contexto extra fornecido.'}

HISTÓRICO COMPLETO DE REFEIÇÕES DO USUÁRIO:
${mealsText}

DATA/HORA ATUAL DO SISTEMA: ${new Date().toLocaleString('pt-BR')}

---
HISTÓRICO DE CHAT RECENTE COM O USUÁRIO:
${conversationText}

Nova mensagem do Usuário: "${message}"

Responda à pergunta do usuário de forma útil.
Requisitos da resposta:
1. Responda em português de forma concisa e amigável (estilo conversa rápida de WhatsApp/iOS).
2. Se ele perguntar sobre o que comeu hoje ou resumos das metas, use os dados acima para fazer os cálculos e responder exatamente quanto ele consumiu e quanto resta.
3. Use markdown simples para formatação (ex: negritos).
4. Mantenha a atitude empática de um nutricionista de futebol/esportes.
5. Não invente refeições que não estão na lista de histórico, baseie-se estritamente nos fatos informados.
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
      console.error('Erro na chamada de chat com Gemini (status:', response.status, ')');
      throw new Error(`Erro na API (${response.status}): Ocorreu uma falha no chat. Verifique sua conexão e chave de API.`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      throw new Error('Sem resposta do modelo Gemini.');
    }

    return reply.trim();
  } catch (error) {
    console.error('Erro na chamada de chat com Gemini:', error);
    throw error;
  }
}
