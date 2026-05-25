import React, { useState, useEffect } from 'react';
import { Dumbbell, Flame, Scale, Calculator, Loader2, Sparkles, Trash2, Calendar, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateWorkoutCalories } from '../services/gemini';
import { ConfirmModal } from './ui/ConfirmModal';

export const WorkoutCalculator: React.FC = () => {
  const {
    apiKey,
    modelName,
    weight,
    height,
    workouts,
    handleSaveWorkout,
    handleDeleteWorkout,
    saveSettings,
    customContext,
    targets
  } = useApp();

  // Estados dos inputs locais
  const [localWeight, setLocalWeight] = useState(weight.toString());
  const [localHeight, setLocalHeight] = useState(height.toString());
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');

  // Estados de processamento
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estados de UI (histórico expandido)
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  
  // Estado para exclusão
  const [workoutIdToDelete, setWorkoutIdToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Sincroniza inputs locais quando o context for carregado (ex: recarregamento de página)
  useEffect(() => {
    setLocalWeight(weight.toString());
    setLocalHeight(height.toString());
  }, [weight, height]);

  const validateInputs = () => {
    const w = parseFloat(localWeight);
    const h = parseFloat(localHeight);

    if (isNaN(w) || w < 30 || w > 300) {
      return 'Peso corporal deve ser um número válido entre 30 e 300 kg.';
    }
    if (isNaN(h) || h < 100 || h > 250) {
      return 'Altura deve ser um número válido entre 100 e 250 cm.';
    }
    if (!workoutNotes.trim() && !cardioNotes.trim()) {
      return 'Por favor, descreva pelo menos o seu treino de musculação ou o seu cardio de hoje.';
    }
    return null;
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!apiKey) {
      setErrorMsg('Chave de API do Gemini não configurada. Vá na aba "Ajustes" para configurá-la antes de calcular.');
      return;
    }

    const validationError = validateInputs();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsCalculating(true);

    const weightNum = parseFloat(localWeight);
    const heightNum = parseFloat(localHeight);

    try {
      // 1. Salva/Atualiza o peso e altura nos Ajustes (IndexedDB e Context) de forma persistente
      await saveSettings(
        apiKey,
        modelName,
        customContext,
        targets,
        weightNum,
        heightNum
      );

      // 2. Chama a IA do Gemini para calcular o gasto baseado nos dados fisiológicos e descrição do exercício
      const analysis = await calculateWorkoutCalories(
        apiKey,
        weightNum,
        heightNum,
        workoutNotes,
        cardioNotes,
        modelName
      );

      // 3. Persiste o treino no histórico do IndexedDB
      await handleSaveWorkout(
        workoutNotes,
        cardioNotes,
        analysis.caloriesBurnedWorkout,
        analysis.caloriesBurnedCardio,
        analysis.totalDailyExpenditure,
        analysis.explanation
      );

      setSuccessMsg('Gasto calórico calculado e salvo com sucesso!');
      
      // Limpa os campos do formulário para novo input
      setWorkoutNotes('');
      setCardioNotes('');
      
      // Auto-expande o treino mais recente adicionado
      if (workouts.length > 0) {
        setExpandedWorkoutId(workouts[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro ao calcular o treino com a IA. Verifique sua conexão e a chave de API.');
    } finally {
      setIsCalculating(false);
    }
  };

  const triggerDelete = (id: string) => {
    setWorkoutIdToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (workoutIdToDelete) {
      try {
        await handleDeleteWorkout(workoutIdToDelete);
        setSuccessMsg('Registro de treino removido.');
        if (expandedWorkoutId === workoutIdToDelete) {
          setExpandedWorkoutId(null);
        }
      } catch (err) {
        setErrorMsg('Erro ao deletar treino do banco local.');
      }
    }
    setIsDeleteModalOpen(false);
    setWorkoutIdToDelete(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedWorkoutId(prev => (prev === id ? null : id));
  };

  // Formata o timestamp de forma amigável
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1>Gasto Calórico</h1>
        <h3 style={{ marginTop: '4px' }}>Calcule o gasto dos treinos e seu gasto diário com IA</h3>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '16px', padding: '16px', display: 'flex', gap: '10px', color: 'var(--color-cal)', fontSize: '14px', alignItems: 'flex-start' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '16px', padding: '12px 16px', color: 'var(--color-prot)', fontSize: '14px', textAlign: 'center' }}>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Card de Informações Fisiológicas */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={20} className="tab-icon-wrapper" style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ fontSize: '16px' }}>Seus Dados Fisiológicos</h2>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Essas informações ficarão salvas para os próximos cálculos calóricos.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="workout-weight">Peso (kg)</label>
              <input
                id="workout-weight"
                type="number"
                step="0.1"
                className="form-input"
                value={localWeight}
                onChange={(e) => setLocalWeight(e.target.value)}
                placeholder="Ex: 75"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="workout-height">Altura (cm)</label>
              <input
                id="workout-height"
                type="number"
                className="form-input"
                value={localHeight}
                onChange={(e) => setLocalHeight(e.target.value)}
                placeholder="Ex: 175"
                required
              />
            </div>
          </div>
        </div>

        {/* Card do Treino de Academia */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Dumbbell size={20} className="tab-icon-wrapper" style={{ color: 'var(--color-carb)' }} />
            <h2 style={{ fontSize: '16px' }}>Treino de Força / Academia</h2>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="workout-notes">O que você treinou hoje e as cargas?</label>
            <textarea
              id="workout-notes"
              className="form-input"
              rows={4}
              value={workoutNotes}
              onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="Ex: Treino de Peito e Tríceps:&#10;- Supino Reto: 4x10 com 30kg de cada lado&#10;- Supino Inclinado com Halteres: 3x12 de 24kg&#10;- Tríceps Corda: 4x12 com 25kg"
              style={{ resize: 'vertical', userSelect: 'text', fontFamily: 'inherit', fontSize: '14px' }}
            />
          </div>
        </div>

        {/* Card do Cardio */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame size={20} className="tab-icon-wrapper" style={{ color: 'var(--color-cal)' }} />
            <h2 style={{ fontSize: '16px' }}>Atividade Cardiorrespiratória (Cardio)</h2>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cardio-notes">Qual aeróbico você fez e por quanto tempo?</label>
            <textarea
              id="cardio-notes"
              className="form-input"
              rows={3}
              value={cardioNotes}
              onChange={(e) => setCardioNotes(e.target.value)}
              placeholder="Ex: Corrida na esteira por 30 minutos a 9.5 km/h de média ou jogo de futebol com os amigos por 1 hora em intensidade média."
              style={{ resize: 'vertical', userSelect: 'text', fontFamily: 'inherit', fontSize: '14px' }}
            />
          </div>
        </div>

        <button type="submit" className="btn" disabled={isCalculating}>
          {isCalculating ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1.5s linear infinite' }} />
              Calculando Gasto com IA...
            </>
          ) : (
            <>
              <Calculator size={18} />
              Calcular Gasto com IA
            </>
          )}
        </button>
      </form>

      {/* Histórico e Últimos Resultados */}
      {workouts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          <h2 style={{ fontSize: '18px' }}>Histórico de Gasto Calórico</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {workouts.map((wk, index) => {
              const isExpanded = expandedWorkoutId === wk.id;
              
              return (
                <div 
                  key={wk.id} 
                  className="card" 
                  style={{ 
                    padding: '16px',
                    borderColor: index === 0 ? 'var(--accent-light)' : 'var(--border-color)',
                    background: index === 0 ? 'rgba(16, 185, 129, 0.03)' : 'var(--bg-card)'
                  }}
                >
                  {/* Cabeçalho do Card de Treino */}
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => toggleExpand(wk.id)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        {formatDate(wk.timestamp)}
                        {index === 0 && (
                          <span style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, marginLeft: '6px' }}>
                            Mais recente
                          </span>
                        )}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>
                        Gasto Total: <span style={{ color: 'var(--accent-light)' }}>{wk.totalDailyExpenditure} kcal</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); triggerDelete(wk.id); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px' }}
                        className="btn-icon"
                        aria-label="Deletar registro de treino"
                      >
                        <Trash2 size={16} />
                      </button>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Bento Grid Simples dos Resultados Rápidos */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                    <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Dumbbell size={16} style={{ color: 'var(--color-carb)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Musculação</span>
                        <strong style={{ fontSize: '13px' }}>{wk.caloriesBurnedWorkout} kcal</strong>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Flame size={16} style={{ color: 'var(--color-cal)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Cardio</span>
                        <strong style={{ fontSize: '13px' }}>{wk.caloriesBurnedCardio} kcal</strong>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes Expandidos (Explicação da IA e dados originais) */}
                  {isExpanded && (
                    <div 
                      className="fade-in" 
                      style={{ 
                        marginTop: '16px', 
                        paddingTop: '16px', 
                        borderTop: '1px dashed var(--border-color)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px' 
                      }}
                    >
                      {/* Dados Biométricos no momento */}
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '8px' }}>
                        <span>Peso registrado: <strong>{wk.weightKg} kg</strong></span>
                        <span>Altura registrada: <strong>{wk.heightCm} cm</strong></span>
                      </div>

                      {wk.workoutNotes.trim() && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Notas de Musculação:</span>
                          <div style={{ fontSize: '13px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '10px', whiteSpace: 'pre-line', color: 'var(--text-primary)' }}>
                            {wk.workoutNotes}
                          </div>
                        </div>
                      )}

                      {wk.cardioNotes.trim() && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Notas de Cardio:</span>
                          <div style={{ fontSize: '13px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '10px', whiteSpace: 'pre-line', color: 'var(--text-primary)' }}>
                            {wk.cardioNotes}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles size={12} />
                          Cálculo da IA (Análise de Fisiologia):
                        </span>
                        <div 
                          style={{ 
                            fontSize: '13px', 
                            lineHeight: '1.6', 
                            color: 'var(--text-primary)', 
                            background: 'rgba(5, 150, 105, 0.05)', 
                            border: '1px solid rgba(5, 150, 105, 0.15)',
                            padding: '12px', 
                            borderRadius: '12px' 
                          }}
                        >
                          {wk.iaExplanation}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Confirmação para deletar treino do histórico */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Remover treino do histórico?"
        message="Esta ação é definitiva e removerá este registro de gasto calórico de forma permanente do seu banco local."
        confirmLabel="Sim, Remover"
        cancelLabel="Cancelar"
        danger={true}
        onConfirm={confirmDelete}
        onCancel={() => { setIsDeleteModalOpen(false); setWorkoutIdToDelete(null); }}
      />
    </div>
  );
};
