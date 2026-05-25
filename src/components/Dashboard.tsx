import React from 'react';
import { Sparkles, ArrowRight, Beef, Wheat, Droplets } from 'lucide-react';

interface MealItem {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Meal {
  id: string;
  timestamp: number;
  type: string; // Café da Manhã, Almoço, Jantar, Lanche
  items: MealItem[];
}

interface DashboardProps {
  meals: Meal[];
  targets: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
  };
  onNavigateToCamera: () => void;
  apiKeyMissing: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  meals,
  targets,
  onNavigateToCamera,
  apiKeyMissing,
}) => {
  // Filtra refeições de hoje
  const getTodayMeals = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return meals.filter(meal => {
      const mealDate = new Date(meal.timestamp);
      mealDate.setHours(0, 0, 0, 0);
      return mealDate.getTime() === today.getTime();
    });
  };

  const todayMeals = getTodayMeals();

  // Calcula totais consumidos hoje
  const consumed = todayMeals.reduce(
    (acc, meal) => {
      meal.items.forEach(item => {
        acc.calories += item.calories;
        acc.protein += item.protein;
        acc.carbs += item.carbs;
        acc.fat += item.fat;
      });
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Arredonda valores
  const calories = Math.round(consumed.calories);
  const protein = Math.round(consumed.protein * 10) / 10;
  const carbs = Math.round(consumed.carbs * 10) / 10;
  const fat = Math.round(consumed.fat * 10) / 10;

  // Cálculos do anel de progresso
  const radius = 70;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const percentage = Math.min(100, Math.round((calories / targets.calories) * 100)) || 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const remainingKcal = targets.calories - calories;

  // Agrupamento por categorias
  const categories = [
    { name: 'Café da Manhã', key: 'Café da Manhã', calories: 0 },
    { name: 'Almoço', key: 'Almoço', calories: 0 },
    { name: 'Jantar', key: 'Jantar', calories: 0 },
    { name: 'Lanches', key: 'Lanche', calories: 0 },
  ];

  todayMeals.forEach(meal => {
    const cat = categories.find(c => c.key === meal.type) || categories[3]; // Lanches como fallback
    meal.items.forEach(item => {
      cat.calories += item.calories;
    });
  });

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>NutriScale AI</h1>
          <h3 style={{ marginTop: '2px' }}>Hoje, {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</h3>
        </div>
        {apiKeyMissing && (
          <span className="badge-key-missing">
            Sem Chave Gemini
          </span>
        )}
      </div>

      {/* API Key missing Warning Card */}
      {apiKeyMissing && (
        <div className="card" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ color: 'var(--color-cal)', fontWeight: 600 }}>Chave API não configurada</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Vá até a aba de Configurações e insira sua chave do Gemini para habilitar o escaneamento de alimentos pela balança.
          </p>
        </div>
      )}

      {/* Progress Ring Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '24px' }}>
        <div className="progress-ring-container">
          <svg height={radius * 2} width={radius * 2}>
            {/* Background Circle */}
            <circle
              stroke="rgba(255,255,255,0.04)"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            {/* Progress Circle */}
            <circle
              className="progress-ring-circle"
              stroke="var(--accent-light)"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset }}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeLinecap="round"
            />
          </svg>
          <div className="progress-text">
            <span className="progress-val">{calories}</span>
            <span className="progress-unit">/ {targets.calories} kcal</span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {remainingKcal >= 0 
              ? `Faltam ${remainingKcal} kcal para bater a meta` 
              : `Meta batida! Excedeu ${Math.abs(remainingKcal)} kcal`}
          </span>
        </div>
      </div>

      {/* Macros Section */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 style={{ fontSize: '16px' }}>Divisão de Macronutrientes</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Proteínas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <Beef size={14} style={{ color: 'var(--color-prot)' }} /> Proteínas
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {protein}g / <span style={{ color: 'var(--text-muted)' }}>{targets.protein}g</span>
              </span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'var(--color-prot)', 
                  width: `${Math.min(100, (protein / targets.protein) * 100)}%`,
                  borderRadius: '10px',
                  transition: 'width 0.5s ease-in-out'
                }} 
              />
            </div>
          </div>

          {/* Carboidratos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <Wheat size={14} style={{ color: 'var(--color-carb)' }} /> Carboidratos
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {carbs}g / <span style={{ color: 'var(--text-muted)' }}>{targets.carbs}g</span>
              </span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'var(--color-carb)', 
                  width: `${Math.min(100, (carbs / targets.carbs) * 100)}%`,
                  borderRadius: '10px',
                  transition: 'width 0.5s ease-in-out'
                }} 
              />
            </div>
          </div>

          {/* Gorduras */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <Droplets size={14} style={{ color: 'var(--color-fat)' }} /> Gorduras
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {fat}g / <span style={{ color: 'var(--text-muted)' }}>{targets.fat}g</span>
              </span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'var(--color-fat)', 
                  width: `${Math.min(100, (fat / targets.fat) * 100)}%`,
                  borderRadius: '10px',
                  transition: 'width 0.5s ease-in-out'
                }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Refeições do Dia */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2 style={{ fontSize: '16px' }}>Distribuição de Hoje</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div 
              key={cat.name} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                paddingBottom: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.04)'
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{cat.name}</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: cat.calories > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {Math.round(cat.calories)} kcal
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <button className="btn" onClick={onNavigateToCamera} style={{ marginTop: '10px', padding: '16px' }}>
        <Sparkles size={18} />
        Registrar Nova Comida
        <ArrowRight size={16} />
      </button>
    </div>
  );
};
