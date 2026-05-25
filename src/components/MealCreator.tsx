import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Check, Trash2, ArrowLeft, Loader2, Sparkles, Scale, AlertCircle, Edit3 } from 'lucide-react';
import { analyzeFoodImage, getRateLimitStatus, type RateLimitStatus, type GeminiAnalysisResult, type ExistingMealItem } from '../services/gemini';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from './ui/ConfirmModal';

interface MealCreatorProps {
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export const MealCreator: React.FC<MealCreatorProps> = ({
  onSaveSuccess,
  onCancel,
}) => {
  const { apiKey, modelName, customContext, handleSaveMeal } = useApp();

  const [mealType, setMealType] = useState('Almoço');
  const [items, setItems] = useState<GeminiAnalysisResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState('');
  
  // Entrada Manual (item 3.3)
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualWeight, setManualWeight] = useState('');
  const [manualKcal, setManualKcal] = useState('');
  const [manualProt, setManualProt] = useState('');
  const [manualCarb, setManualCarb] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualFib, setManualFib] = useState('');
  const [manualSod, setManualSod] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Estados do processo de análise
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [originalAnalysis, setOriginalAnalysis] = useState<GeminiAnalysisResult | null>(null);
  
  // Rate-limiting local por estado (item 1.6)
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>({
    isBlocked: false,
    remainingCalls: 10,
    limit: 10,
    resetTimeSeconds: 0,
  });

  // Modal de Confirmação customizado
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      analyzePhoto(file);
    }
  };

  const triggerCamera = () => {
    if (isAnalyzing) return;
    
    if (rateLimitStatus.isBlocked) {
      setErrorMsg(`Limite de segurança excedido. O app bloqueou novas requisições temporariamente. Aguarde ${rateLimitStatus.resetTimeSeconds} segundos.`);
      return;
    }
    
    fileInputRef.current?.click();
  };

  const analyzePhoto = async (file: File) => {
    if (!apiKey) {
      setErrorMsg('Por favor, configure sua chave de API nas configurações primeiro.');
      return;
    }

    if (rateLimitStatus.isBlocked) {
      setErrorMsg(`Limite de segurança excedido. Aguarde ${rateLimitStatus.resetTimeSeconds} segundos para enviar novas chamadas de API.`);
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    const existingItems: ExistingMealItem[] = items.map(item => ({
      foodName: item.foodName,
      weightGrams: item.weightGrams,
    }));

    try {
      const result = await analyzeFoodImage(file, apiKey, existingItems, modelName, userNotes, customContext);
      setCurrentAnalysis(result);
      setOriginalAnalysis({ ...result });
    } catch (err: any) {
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
        fiber: 0,
        sodium: 0,
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
      fiber: Math.round((originalAnalysis.fiber || 0) * factor * 10) / 10,
      sodium: Math.round((originalAnalysis.sodium || 0) * factor),
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
    
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    
    setSelectedFile(null);
    setImagePreview(null);
    setCurrentAnalysis(null);
    setOriginalAnalysis(null);
    setUserNotes('');
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const handleSaveMealClick = async () => {
    if (items.length === 0) return;
    try {
      await handleSaveMeal(mealType, items);
      onSaveSuccess();
    } catch (err) {
      setErrorMsg('Falha ao gravar a refeição no banco de dados local.');
    }
  };

  // Trata a adição manual (sem foto)
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const name = manualName.trim();
    const weight = parseFloat(manualWeight);
    const kcal = parseFloat(manualKcal);
    const prot = parseFloat(manualProt);
    const carb = parseFloat(manualCarb);
    const fat = parseFloat(manualFat);
    const fib = parseFloat(manualFib) || 0;
    const sod = parseFloat(manualSod) || 0;

    if (!name) {
      setManualError('Por favor, informe o nome do alimento.');
      return;
    }
    if (isNaN(weight) || weight <= 0) {
      setManualError('Peso deve ser um número maior que zero.');
      return;
    }
    if (isNaN(kcal) || kcal < 0) {
      setManualError('Calorias inválidas.');
      return;
    }
    if (isNaN(prot) || prot < 0 || isNaN(carb) || carb < 0 || isNaN(fat) || fat < 0) {
      setManualError('Os macronutrientes não podem ser negativos.');
      return;
    }

    const manualResult: GeminiAnalysisResult = {
      foodName: name,
      weightGrams: weight,
      calories: kcal,
      protein: prot,
      carbs: carb,
      fat: fat,
      fiber: fib,
      sodium: sod,
      confidenceScale: 1.0, // Usuário inseriu manualmente
      confidenceFood: 1.0,
      scaleReadText: `${weight}g (manual)`,
      explanation: 'Inserido manualmente pelo usuário.'
    };

    setItems([...items, manualResult]);
    
    // Reseta form manual
    setManualName('');
    setManualWeight('');
    setManualKcal('');
    setManualProt('');
    setManualCarb('');
    setManualFat('');
    setManualFib('');
    setManualSod('');
    setIsManualMode(false);
  };

  // Retorna o badge com base na confiança do Gemini (item 3.9)
  const getConfidenceInfo = (confidence: number) => {
    if (confidence >= 0.85) {
      return { 
        label: 'Alta confiança', 
        color: 'var(--color-prot)', 
        tip: 'Peso lido com clareza a partir do visor da balança.' 
      };
    }
    if (confidence >= 0.60) {
      return { 
        label: 'Confiança média', 
        color: 'var(--color-fat)', 
        tip: 'Leitura aproximada. Verifique o peso manualmente antes de confirmar.' 
      };
    }
    return { 
      label: 'Baixa confiança', 
      color: 'var(--color-cal)', 
      tip: 'A IA falhou ao ler a balança. Corrija o peso manualmente antes de confirmar.' 
    };
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={() => {
            if (items.length > 0) {
              setIsCancelModalOpen(true);
            } else {
              onCancel();
            }
          }} 
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          aria-label="Voltar"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div>
          <h1>Nova Refeição</h1>
          <h3 style={{ marginTop: '2px' }}>Análise automática ou manual</h3>
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
                    <div className="plate-item-weight">{item.weightGrams}g • P:{item.protein}g C:{item.carbs}g G:{item.fat}g F:{item.fiber || 0}g</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="plate-item-kcal">{Math.round(item.calories)} kcal</span>
                  <button 
                    onClick={() => handleDeleteItem(index)} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    aria-label="Excluir item do prato"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode Selectors (Foto vs Manual) */}
      {!selectedFile && !isManualMode && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button 
            className="btn" 
            onClick={triggerCamera}
            disabled={rateLimitStatus.isBlocked}
            style={{ padding: '16px', opacity: rateLimitStatus.isBlocked ? 0.6 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
          >
            <Camera size={24} aria-hidden="true" />
            <span>Tirar Foto</span>
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsManualMode(true)}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}
          >
            <Edit3 size={24} aria-hidden="true" />
            <span>Inserir Manual</span>
          </button>
        </div>
      )}

      {/* Form Manual (item 3.3) */}
      {isManualMode && (
        <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px' }}>Entrada Manual de Alimento</h2>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setIsManualMode(false);
                setManualError(null);
              }}
              style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '8px' }}
            >
              Cancelar
            </button>
          </div>

          {manualError && (
            <div style={{ color: 'var(--color-cal)', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <AlertCircle size={14} />
              <span>{manualError}</span>
            </div>
          )}

          <form onSubmit={handleAddManualItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="manual-food-name">Nome do Alimento</label>
              <input 
                id="manual-food-name"
                type="text" 
                className="form-input" 
                value={manualName} 
                onChange={e => setManualName(e.target.value)} 
                placeholder="Ex: Arroz Branco Cozido"
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-weight">Peso (g)</label>
                <input 
                  id="manual-weight"
                  type="number" 
                  className="form-input" 
                  value={manualWeight} 
                  onChange={e => setManualWeight(e.target.value)} 
                  placeholder="100"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-calories">Calorias (kcal)</label>
                <input 
                  id="manual-calories"
                  type="number" 
                  className="form-input" 
                  value={manualKcal} 
                  onChange={e => setManualKcal(e.target.value)} 
                  placeholder="130"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-protein">Proteína (g)</label>
                <input 
                  id="manual-protein"
                  type="number" 
                  step="0.1" 
                  className="form-input" 
                  value={manualProt} 
                  onChange={e => setManualProt(e.target.value)} 
                  placeholder="2.5"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-carbs">Carbos (g)</label>
                <input 
                  id="manual-carbs"
                  type="number" 
                  step="0.1" 
                  className="form-input" 
                  value={manualCarb} 
                  onChange={e => setManualCarb(e.target.value)} 
                  placeholder="28"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-fat">Gordura (g)</label>
                <input 
                  id="manual-fat"
                  type="number" 
                  step="0.1" 
                  className="form-input" 
                  value={manualFat} 
                  onChange={e => setManualFat(e.target.value)} 
                  placeholder="0.2"
                />
              </div>
            </div>

            {/* Suporte a Fibras e Sódio Manual */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-fiber">Fibras (g)</label>
                <input 
                  id="manual-fiber"
                  type="number" 
                  step="0.1" 
                  className="form-input" 
                  value={manualFib} 
                  onChange={e => setManualFib(e.target.value)} 
                  placeholder="1.0"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="manual-sodium">Sódio (mg)</label>
                <input 
                  id="manual-sodium"
                  type="number" 
                  className="form-input" 
                  value={manualSod} 
                  onChange={e => setManualSod(e.target.value)} 
                  placeholder="2"
                />
              </div>
            </div>

            <button type="submit" className="btn" style={{ marginTop: '4px' }}>
              Adicionar ao Prato
            </button>
          </form>
        </div>
      )}

      {/* Hidden Native File Capture Input */}
      <input
        type="file"
        id="camera-file-input"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Comment/Note input */}
      {!selectedFile && !isManualMode && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
          <label className="form-label" htmlFor="user-notes-input" style={{ fontSize: '11px' }}>Observação / Atalho para a IA</label>
          <input
            id="user-notes-input"
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
      {!selectedFile ? null : (
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
              title={getConfidenceInfo(currentAnalysis.confidenceScale).tip}
            >
              {getConfidenceInfo(currentAnalysis.confidenceScale).label}
            </span>
          </div>

          {/* Dica de Confiança para guiar o usuário (item 3.9) */}
          {currentAnalysis.confidenceScale < 0.60 && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.18)', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', color: 'var(--color-cal)' }}>
              <AlertCircle size={14} />
              <span>{getConfidenceInfo(currentAnalysis.confidenceScale).tip}</span>
            </div>
          )}

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '2px solid var(--accent-light)', paddingLeft: '8px' }}>
            "{currentAnalysis.explanation}"
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="result-food-name">Alimento Identificado</label>
              <input
                id="result-food-name"
                type="text"
                className="form-input"
                value={currentAnalysis.foodName}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="result-weight" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Scale size={12} /> Peso (g)
              </label>
              <input
                id="result-weight"
                type="number"
                className="form-input"
                value={currentAnalysis.weightGrams === 0 ? '' : currentAnalysis.weightGrams}
                onChange={(e) => handleWeightChange(e.target.value)}
              />
            </div>
          </div>

          {/* Macros Display + Fibra e Sódio */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '4px' }}>
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
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-fat)', fontWeight: 600 }}>GORD</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.fat}g</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: 'var(--accent-light)', fontWeight: 600 }}>FIBRA</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.fiber || 0}g</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', color: '#fb923c', fontWeight: 600 }}>SÓDIO</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{currentAnalysis.sodium || 0}mg</div>
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
      {items.length > 0 && !selectedFile && !isManualMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <button className="btn btn-secondary" onClick={triggerCamera} style={{ padding: '14px' }}>
            <Plus size={16} />
            Adicionar Mais Alimentos (Zerar Balança)
          </button>
          <button className="btn" onClick={handleSaveMealClick} style={{ background: 'var(--color-prot)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)', padding: '16px' }}>
            <Check size={18} />
            Concluir e Salvar Refeição
          </button>
        </div>
      )}

      {/* Modais de Confirmação customizados (iOS Safe) */}
      <ConfirmModal
        isOpen={isCancelModalOpen}
        title="Cancelar refeição?"
        message="Você já adicionou itens ao prato nesta sessão. Deseja mesmo cancelar? Os alimentos pendentes no prato serão descartados."
        confirmLabel="Sim, Descartar"
        cancelLabel="Voltar"
        danger={true}
        onConfirm={() => {
          setIsCancelModalOpen(false);
          onCancel();
        }}
        onCancel={() => setIsCancelModalOpen(false)}
      />
    </div>
  );
};
