import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Check, Trash2, ArrowLeft, Loader2, Sparkles, Scale, AlertCircle } from 'lucide-react';
import { analyzeFoodImage, getRateLimitStatus } from '../services/gemini';
import type { GeminiAnalysisResult, ExistingMealItem } from '../services/gemini';

interface MealCreatorProps {
  apiKey: string;
  modelName: string;
  customContext: string;
  onSaveMeal: (mealType: string, items: { foodName: string; weightGrams: number; calories: number; protein: number; carbs: number; fat: number }[]) => void;
  onCancel: () => void;
}

export const MealCreator: React.FC<MealCreatorProps> = ({
  apiKey,
  modelName,
  customContext,
  onSaveMeal,
  onCancel,
}) => {
  const [mealType, setMealType] = useState('Almoço');
  const [items, setItems] = useState<GeminiAnalysisResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState('');
  
  // Estados do processo de análise
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<GeminiAnalysisResult | null>(null);
  
  // Estado para armazenar os valores originais da análise para permitir recálculo proporcional
  const [originalAnalysis, setOriginalAnalysis] = useState<GeminiAnalysisResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Libera a URL do preview ao desmontar ou trocar a imagem para evitar Memory Leaks
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validações de segurança contra falhas de upload e arquivos gigantes
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Por favor, selecione apenas arquivos de imagem válidos.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('A imagem é muito grande. O limite máximo é de 10 MB para evitar lentidão e falhas.');
        return;
      }

      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }

      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
      setErrorMsg(null);
      // Inicia a análise automaticamente após escolher a foto
      analyzePhoto(file);
    }
  };

  const triggerCamera = () => {
    if (isAnalyzing) return; // impede clique duplo/simultâneo
    
    // Verifica rate limit antes de abrir câmera
    const rateStatus = getRateLimitStatus();
    if (rateStatus.isBlocked) {
      setErrorMsg(`Limite de segurança excedido. O app bloqueou novas requisições temporariamente. Aguarde ${rateStatus.resetTimeSeconds} segundos.`);
      return;
    }
    
    fileInputRef.current?.click();
  };

  const analyzePhoto = async (file: File) => {
    if (!apiKey) {
      setErrorMsg('Por favor, configure sua chave de API nas configurações primeiro.');
      return;
    }

    // Validação preventiva do Rate Limit
    const rateStatus = getRateLimitStatus();
    if (rateStatus.isBlocked) {
      setErrorMsg(`Limite de segurança excedido. Aguarde ${rateStatus.resetTimeSeconds} segundos para enviar novas chamadas de API.`);
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    // Mapeia os alimentos já colocados no prato nesta sessão de pesagem
    const existingItems: ExistingMealItem[] = items.map(item => ({
      foodName: item.foodName,
      weightGrams: item.weightGrams,
    }));

    try {
      const result = await analyzeFoodImage(file, apiKey, existingItems, modelName, userNotes, customContext);
      setCurrentAnalysis(result);
      setOriginalAnalysis({ ...result }); // Armazena cópia profunda dos valores iniciais
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao analisar a foto. Tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Recalcula macros proporcionalmente se o usuário editar o peso manual
  const handleWeightChange = (newWeightStr: string) => {
    if (!currentAnalysis || !originalAnalysis) return;
    
    const newWeight = parseFloat(newWeightStr) || 0;
    const oldWeight = originalAnalysis.weightGrams;
    
    if (oldWeight <= 0 || newWeight <= 0) {
      setCurrentAnalysis({
        ...currentAnalysis,
        weightGrams: newWeight,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
      return;
    }

    const factor = newWeight / oldWeight;
    setCurrentAnalysis({
      ...currentAnalysis,
      weightGrams: newWeight,
      calories: Math.round(originalAnalysis.calories * factor),
      protein: Math.round(originalAnalysis.protein * factor * 10) / 10,
      carbs: Math.round(originalAnalysis.carbs * factor * 10) / 10,
      fat: Math.round(originalAnalysis.fat * factor * 10) / 10,
    });
  };

  const handleNameChange = (newName: string) => {
    if (!currentAnalysis) return;
    setCurrentAnalysis({
      ...currentAnalysis,
      foodName: newName,
    });
  };

  const handleConfirmItem = () => {
    if (!currentAnalysis) return;
    
    setItems([...items, currentAnalysis]);
    
    // Libera a URL antiga do preview de imagem da memória RAM do iOS
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    
    // Reseta o estado para a próxima pesagem
    setSelectedFile(null);
    setImagePreview(null);
    setCurrentAnalysis(null);
    setOriginalAnalysis(null);
    setUserNotes(''); // Limpa o comentário para o próximo item
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const handleSaveMeal = () => {
    if (items.length === 0) return;
    onSaveMeal(mealType, items);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1>Nova Refeição</h1>
          <h3 style={{ marginTop: '2px' }}>Análise automática por foto</h3>
        </div>
      </div>

      {/* Select Meal Type */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
        <span className="form-label" style={{ fontSize: '11px' }}>Tipo de Refeição</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['Café da Manhã', 'Almoço', 'Jantar', 'Lanche'].map((type) => (
            <button
              key={type}
              className={`btn btn-secondary ${mealType === type ? 'active' : ''}`}
              onClick={() => setMealType(type)}
              style={{
                flex: 1,
                padding: '10px 4px',
                fontSize: '12px',
                borderRadius: '12px',
                backgroundColor: mealType === type ? 'var(--accent)' : 'var(--bg-surface)',
                borderColor: mealType === type ? 'var(--accent-light)' : 'var(--border-color)',
                color: 'white',
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Plate Content Summary */}
      {items.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px' }}>Alimentos no Prato</h2>
            <span style={{ fontSize: '13px', color: 'var(--color-cal)', fontWeight: 600 }}>
              Total: {Math.round(items.reduce((sum, item) => sum + item.calories, 0))} kcal
            </span>
          </div>
          <div className="plate-list">
            {items.map((item, index) => (
              <div key={index} className="plate-item">
                <div className="plate-item-info">
                  <span className="plate-item-dot" style={{ backgroundColor: `hsl(${135 + index * 40}, 75%, 45%)` }} />
                  <div>
                    <div className="plate-item-name">{item.foodName}</div>
                    <div className="plate-item-weight">{item.weightGrams}g • P:{item.protein}g C:{item.carbs}g G:{item.fat}g</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="plate-item-kcal">{Math.round(item.calories)} kcal</span>
                  <button 
                    onClick={() => handleDeleteItem(index)} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden Native File Capture Input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Comment/Note input */}
      {!selectedFile && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
          <span className="form-label" style={{ fontSize: '11px' }}>Observação / Atalho para a IA</span>
          <input
            type="text"
            className="form-input"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            placeholder="Ex: 'café padrão', 'moranga assada com casca'..."
            style={{ userSelect: 'text' }}
          />
        </div>
      )}

      {/* Image Uploader Interface */}
      {getRateLimitStatus().isBlocked && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '12px', borderRadius: '12px', color: 'var(--color-fat)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertCircle size={16} />
          <span>Limite de requisições ativo. Aguarde {getRateLimitStatus().resetTimeSeconds}s para a liberação.</span>
        </div>
      )}
      
      {!selectedFile ? (
        <div className="photo-uploader" onClick={triggerCamera} style={{ opacity: getRateLimitStatus().isBlocked ? 0.6 : 1, cursor: getRateLimitStatus().isBlocked ? 'not-allowed' : 'pointer' }}>
          <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '16px', borderRadius: '50%', color: 'var(--accent-light)' }}>
            <Camera size={32} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: 'white', fontSize: '15px' }}>Bater foto da comida + balança</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{getRateLimitStatus().isBlocked ? 'Aguarde o rate-limit para liberar' : 'A IA lerá o peso da balança e identificará o alimento'}</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '0', overflow: 'hidden', borderRadius: '24px', position: 'relative' }}>
          <img src={imagePreview!} alt="Comida na Balança" className="uploaded-image" style={{ aspectRatio: '4/3' }} />
          
          {/* Scan UI Overlay */}
          {isAnalyzing && (
            <div className="scanner-overlay">
              <div className="scan-bar" />
              <Loader2 size={36} className="pulse-glow" style={{ animation: 'spin 2s linear infinite, pulse-glow 1s ease-in-out infinite alternate', color: 'var(--accent-light)' }} />
              <p className="pulse-glow" style={{ color: 'white', fontWeight: 600, fontSize: '15px' }}>
                Analisando peso e alimento com IA...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertCircle size={20} style={{ color: 'var(--color-cal)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>Erro na Análise</p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{errorMsg}</p>
            <button className="btn btn-secondary" onClick={() => selectedFile && analyzePhoto(selectedFile)} style={{ padding: '8px 12px', fontSize: '11px', marginTop: '10px', borderRadius: '8px' }}>
              Tentar Novamente
            </button>
          </div>
        </div>
      )}

      {/* AI Analysis Result / Edit Form */}
      {currentAnalysis && !isAnalyzing && (
        <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
              <h2 style={{ fontSize: '16px' }}>Resultado do Escaneamento</h2>
            </div>
            
            {/* Confidence Badge */}
            <span 
              style={{ 
                fontSize: '11px', 
                fontWeight: 600, 
                padding: '4px 8px', 
                borderRadius: '10px',
                backgroundColor: currentAnalysis.confidenceScale > 0.7 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: currentAnalysis.confidenceScale > 0.7 ? 'var(--color-prot)' : 'var(--color-fat)'
              }}
            >
              Leitura: {Math.round(currentAnalysis.confidenceScale * 100)}% conf.
            </span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '2px solid var(--accent-light)', paddingLeft: '8px' }}>
            "{currentAnalysis.explanation}"
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Alimento Identificado</label>
              <input
                type="text"
                className="form-input"
                value={currentAnalysis.foodName}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Scale size={12} /> Peso (g)
              </label>
              <input
                type="number"
                className="form-input"
                value={currentAnalysis.weightGrams === 0 ? '' : currentAnalysis.weightGrams}
                onChange={(e) => handleWeightChange(e.target.value)}
              />
            </div>
          </div>

          {/* Macros Display */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '4px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-cal)', fontWeight: 600 }}>KCAL</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.calories}</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-prot)', fontWeight: 600 }}>PROT</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.protein}g</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-carb)', fontWeight: 600 }}>CARB</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.carbs}g</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-fat)', fontWeight: 600 }}>GORD</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.fat}g</div>
            </div>
          </div>

          {/* Action buttons for current item */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                if (imagePreview) {
                  URL.revokeObjectURL(imagePreview);
                }
                setSelectedFile(null);
                setImagePreview(null);
                setCurrentAnalysis(null);
                setOriginalAnalysis(null);
              }}
              style={{ flex: 1, padding: '12px' }}
            >
              Recusar
            </button>
            <button className="btn" onClick={handleConfirmItem} style={{ flex: 2, padding: '12px' }}>
              <Check size={16} />
              Confirmar & Zerar (TARE)
            </button>
          </div>
        </div>
      )}

      {/* Save Entire Meal Actions */}
      {items.length > 0 && !selectedFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <button className="btn btn-secondary" onClick={triggerCamera} style={{ padding: '14px' }}>
            <Plus size={16} />
            Adicionar Mais Alimentos (Zerar Balança)
          </button>
          <button className="btn" onClick={handleSaveMeal} style={{ background: 'var(--color-prot)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', padding: '16px' }}>
            <Check size={18} />
            Concluir e Salvar Refeição
          </button>
        </div>
      )}
    </div>
  );
};
