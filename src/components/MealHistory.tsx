import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Trash2, Clock, PlusCircle } from 'lucide-react';

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

interface MealHistoryProps {
  meals: Meal[];
  onDeleteMeal: (id: string) => void;
  onNavigateToCamera: () => void;
}

export const MealHistory: React.FC<MealHistoryProps> = ({
  meals,
  onDeleteMeal,
  onNavigateToCamera,
}) => {
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedMealId(expandedMealId === id ? null : id);
  };

  // Agrupa as refeições por data (ex: "Hoje", "Ontem", "24 de mai.")
  const groupMealsByDate = () => {
    const groups: { [key: string]: Meal[] } = {};
    
    // Ordena da mais recente para a mais antiga
    const sortedMeals = [...meals].sort((a, b) => b.timestamp - a.timestamp);

    sortedMeals.forEach(meal => {
      const date = new Date(meal.timestamp);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.getTime().toString();
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(meal);
    });

    return groups;
  };

  const formatDateLabel = (timestampStr: string) => {
    const timestamp = parseInt(timestampStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (timestamp === today.getTime()) {
      return 'Hoje';
    } else if (timestamp === yesterday.getTime()) {
      return 'Ontem';
    } else {
      return new Date(timestamp).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  };

  const mealGroups = groupMealsByDate();
  const dateKeys = Object.keys(mealGroups).sort((a, b) => parseInt(b) - parseInt(a));

  if (meals.length === 0) {
    return (
      <div 
        className="fade-in" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '16px',
          minHeight: '60vh',
          textAlign: 'center',
          padding: '20px'
        }}
      >
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '50%', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
          <Calendar size={48} />
        </div>
        <div>
          <h2>Nenhum registro ainda</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px', maxWidth: '280px' }}>
            Suas refeições diárias e o histórico de calorias aparecerão aqui após começar a registrar.
          </p>
        </div>
        <button className="btn" onClick={onNavigateToCamera} style={{ marginTop: '10px' }}>
          <PlusCircle size={18} />
          Registrar Primeira Refeição
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1>Histórico</h1>
        <h3 style={{ marginTop: '2px' }}>Suas refeições salvas</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {dateKeys.map(dateKey => {
          const dayMeals = mealGroups[dateKey];
          // Calcula total de calorias do dia
          const dayCalories = Math.round(
            dayMeals.reduce(
              (sum, meal) => sum + meal.items.reduce((itemSum, item) => itemSum + item.calories, 0),
              0
            )
          );

          return (
            <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Date Header Card */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border-color)'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                  {formatDateLabel(dateKey)}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-cal)' }}>
                  {dayCalories} kcal totais
                </span>
              </div>

              {/* Meals List for this day */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dayMeals.map(meal => {
                  const mealCalories = Math.round(meal.items.reduce((sum, item) => sum + item.calories, 0));
                  const mealProt = Math.round(meal.items.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;
                  const mealCarb = Math.round(meal.items.reduce((sum, item) => sum + item.carbs, 0) * 10) / 10;
                  const mealFat = Math.round(meal.items.reduce((sum, item) => sum + item.fat, 0) * 10) / 10;
                  const isExpanded = expandedMealId === meal.id;

                  const timeStr = new Date(meal.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div 
                      key={meal.id} 
                      className="card history-meal-card" 
                      style={{ 
                        borderColor: isExpanded ? 'var(--accent-light)' : 'var(--border-color)',
                        cursor: 'pointer' 
                      }}
                      onClick={() => toggleExpand(meal.id)}
                    >
                      {/* Card Header */}
                      <div className="history-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '16px' }}>{meal.type}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {timeStr}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-cal)', fontSize: '15px' }}>
                            {mealCalories} kcal
                          </span>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>

                      {/* Macros Summary always visible */}
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span>P: <strong style={{ color: 'white' }}>{mealProt}g</strong></span>
                        <span>C: <strong style={{ color: 'white' }}>{mealCarb}g</strong></span>
                        <span>G: <strong style={{ color: 'white' }}>{mealFat}g</strong></span>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="history-details" onClick={(e) => e.stopPropagation()}>
                          {meal.items.map((item, idx) => (
                            <div 
                              key={idx} 
                              className="history-item" 
                              style={{ 
                                padding: '8px 0', 
                                borderBottom: idx < meal.items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' 
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.foodName}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                                  ({item.weightGrams}g)
                                </span>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                                {Math.round(item.calories)} kcal
                              </span>
                            </div>
                          ))}

                          {/* Delete Meal Action */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button
                              className="btn btn-secondary btn-danger"
                              onClick={() => {
                                if (confirm('Excluir esta refeição permanentemente do histórico?')) {
                                  onDeleteMeal(meal.id);
                                }
                              }}
                              style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '11px' }}
                            >
                              <Trash2 size={13} />
                              Excluir Registro
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
