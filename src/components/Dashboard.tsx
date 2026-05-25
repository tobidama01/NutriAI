import React from 'react';
import { Camera, AlertCircle, TrendingUp, Calendar, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DashboardProps {
  onNavigateToCamera: () => void;
  apiKeyMissing: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigateToCamera,
  apiKeyMissing,
}) => {
  const { meals, targets } = useApp();

  // Filtra refeições do dia de hoje (meia-noite local até agora)
  const getTodayMeals = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endOfToday = tomorrow.getTime();

    return meals.filter(meal => meal.timestamp >= startOfToday && meal.timestamp < endOfToday);
  };

  const todayMeals = getTodayMeals();

  // Totais do dia
  const totals = todayMeals.reduce((acc, meal) => {
    meal.items.forEach(item => {
      acc.calories += item.calories;
      acc.protein += item.protein;
      acc.carbs += item.carbs;
      acc.fat += item.fat;
      acc.fiber += item.fiber || 0;
      acc.sodium += item.sodium || 0;
    });
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 });

  // Valores padrão de metas caso estejam nulos (retrocompatibilidade)
  const targetFiber = targets.fiber ?? 25;
  const targetSodium = targets.sodium ?? 2000;

  // Cálculos do progresso calórico
  const caloriesPercentage = Math.min(100, Math.round((totals.calories / targets.calories) * 100));
  const radius = 70;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (caloriesPercentage / 100) * circumference;

  // Lógica para Resumo da Semana (itens 3.5)
  const getWeeklyStats = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const endOfToday = today.getTime();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const startOfRange = sevenDaysAgo.getTime();

    // Filtra refeições dos últimos 7 dias
    const weekMeals = meals.filter(m => m.timestamp >= startOfRange && m.timestamp <= endOfToday);

    // Mapeia totais de calorias agrupando por dia ('YYYY-MM-DD')
    const caloriesByDay: Record<string, number> = {};
    
    // Inicializa a lista de dias para garantir consistência
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (key) {
        caloriesByDay[key] = 0;
      }
    }

    weekMeals.forEach(meal => {
      const dayKey = new Date(meal.timestamp).toISOString().split('T')[0];
      if (dayKey in caloriesByDay) {
        const mealCal = meal.items.reduce((sum, item) => sum + item.calories, 0);
        caloriesByDay[dayKey] += mealCal;
      }
    });

    const dayTotals = Object.values(caloriesByDay);
    const activeDays = dayTotals.filter(c => c > 0).length;
    
    const avgCalories = activeDays > 0 
      ? Math.round(dayTotals.reduce((a, b) => a + b, 0) / activeDays) 
      : 0;

    // Dias dentro da meta (+-15% das metas de calorias)
    const minTarget = targets.calories * 0.85;
    const maxTarget = targets.calories * 1.15;
    const daysOnTrack = dayTotals.filter(c => c >= minTarget && c <= maxTarget).length;

    // Cálculo do Streak de dias consecutivos com registro (hoje, ontem, antes de ontem...)
    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    while (true) {
      const checkKey = checkDate.toISOString().split('T')[0];
      // Verifica se houve refeições nesse dia
      const hasMeals = meals.some(m => {
        const mealKey = new Date(m.timestamp).toISOString().split('T')[0];
        return mealKey === checkKey;
      });

      if (hasMeals) {
        streak++;
        // Retrocede um dia
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // Se for hoje e não tiver registro ainda, podemos verificar ontem para não quebrar a corrente imediatamente
        const isToday = checkDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
        if (isToday) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterdayKey = checkDate.toISOString().split('T')[0];
          const hasMealsYesterday = meals.some(m => {
            const mealKey = new Date(m.timestamp).toISOString().split('T')[0];
            return mealKey === yesterdayKey;
          });
          if (hasMealsYesterday) {
            checkDate.setDate(checkDate.getDate() - 1);
            streak++;
            continue;
          }
        }
        break;
      }
    }

    return { avgCalories, daysOnTrack, streak };
  };

  const { avgCalories, daysOnTrack, streak } = getWeeklyStats();

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner IA Key Missing */}
      {apiKeyMissing && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '14px', borderRadius: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertCircle size={20} style={{ color: 'var(--color-fat)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>Chave da API Ausente</h4>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
              Insira a chave da API do Gemini nas Configurações para habilitar o escaneamento de pratos e a leitura da balança.
            </p>
          </div>
        </div>
      )}

      {/* Greeting Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>NutriScale AI</h1>
          <h3 style={{ marginTop: '2px' }}>Acompanhe sua nutrição diária</h3>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-prot)', padding: '8px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} style={{ fill: 'var(--color-prot)' }} />
          <span>{streak} Dias Seguidos</span>
        </div>
      </div>

      {/* Main Ring Card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoje</span>
          <span style={{ fontSize: '32px', fontWeight: 800, color: 'white' }}>{Math.round(totals.calories)}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>de {targets.calories} kcal</span>
        </div>

        {/* Progresso circular com acessibilidade aria-label */}
        <div style={{ position: 'relative', width: radius * 2, height: radius * 2 }}>
          <svg
            height={radius * 2}
            width={radius * 2}
            role="img"
            aria-label={`Progresso calórico: ${caloriesPercentage}% da meta diária de ${targets.calories} kcal`}
          >
            <circle
              stroke="var(--border-color)"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke="var(--accent)"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset, strokeLinecap: 'round', transition: 'stroke-dashoffset 0.35s', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '18px', fontWeight: 700, color: 'white' }}>
            {caloriesPercentage}%
          </div>
        </div>
      </div>

      {/* Macros Progress Bar Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Macronutrientes do Dia</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          {/* Proteínas */}
          <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-prot)', fontWeight: 600 }}>Proteínas</span>
            <span style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(totals.protein)}g / {targets.protein}g</span>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--color-prot)', width: `${Math.min(100, (totals.protein / targets.protein) * 100)}%` }} />
            </div>
          </div>
          
          {/* Carboidratos */}
          <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-carb)', fontWeight: 600 }}>Carboidratos</span>
            <span style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(totals.carbs)}g / {targets.carbs}g</span>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--color-carb)', width: `${Math.min(100, (totals.carbs / targets.carbs) * 100)}%` }} />
            </div>
          </div>

          {/* Gorduras */}
          <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-fat)', fontWeight: 600 }}>Gorduras</span>
            <span style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(totals.fat)}g / {targets.fat}g</span>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--color-fat)', width: `${Math.min(100, (totals.fat / targets.fat) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Fibras e Sódio Secundários (item 3.10) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {/* Fibras */}
          <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--accent-light)', fontWeight: 600 }}>Fibras alimentares</span>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>{Math.round(totals.fiber)}g / {targetFiber}g</span>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent-light)', width: `${Math.min(100, (totals.fiber / targetFiber) * 100)}%` }} />
            </div>
          </div>

          {/* Sódio */}
          <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#fb923c', fontWeight: 600 }}>Sódio</span>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>{Math.round(totals.sodium)}mg / {targetSodium}mg</span>
            <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#fb923c', width: `${Math.min(100, (totals.sodium / targetSodium) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Seção Resumo Semanal (item 3.5) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Resumo da Semana</h2>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                <TrendingUp size={14} aria-hidden="true" />
                Média Diária
              </div>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>{avgCalories} kcal</span>
            </div>
            
            <div style={{ width: '1px', height: '30px', backgroundColor: 'var(--border-color)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                <Calendar size={14} aria-hidden="true" />
                Dias na Meta
              </div>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-prot)' }}>{daysOnTrack} / 7 dias</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Aderência à Meta Calórica Diária</span>
              <span>{Math.round((daysOnTrack / 7) * 100)}%</span>
            </div>
            <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--color-prot)', width: `${(daysOnTrack / 7) * 100}%`, borderRadius: '3px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access Actions */}
      <button className="btn" onClick={onNavigateToCamera} style={{ marginTop: '10px', padding: '16px', display: 'flex', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }}>
        <Camera size={18} aria-hidden="true" />
        Escanear Novo Alimento
      </button>
    </div>
  );
};
