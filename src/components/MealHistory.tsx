import React, { useState } from 'react';
import { Trash2, Calendar, Clock, ChevronDown, ChevronUp, Search, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Meal } from '../types';
import { ConfirmModal } from './ui/ConfirmModal';

interface MealHistoryProps {
  onDeleteSuccess: () => void;
  onNavigateToCamera: () => void;
}

export const MealHistory: React.FC<MealHistoryProps> = ({
  onDeleteSuccess,
  onNavigateToCamera,
}) => {
  const { meals, handleDeleteMeal } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({});

  // Controle do Modal de Confirmação customizado ( iOS Safe)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedMeals(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const triggerDeleteModal = (id: string) => {
    setSelectedMealId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteMeal = async () => {
    if (selectedMealId) {
      await handleDeleteMeal(selectedMealId);
      onDeleteSuccess();
    }
    setIsDeleteModalOpen(false);
    setSelectedMealId(null);
  };

  // Filtra as refeições com base na query de busca (item 3.4)
  const filteredMeals = searchQuery.trim()
    ? meals.filter(meal =>
        meal.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meal.items.some(item => 
          item.foodName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : meals;

  // Agrupa refeições por data local
  const groupMealsByDate = () => {
    const groups: Record<string, Meal[]> = {};
    
    filteredMeals.forEach(meal => {
      const dateStr = new Date(meal.timestamp).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      
      // Capitaliza dia da semana
      const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      
      if (!groups[formattedDate]) {
        groups[formattedDate] = [];
      }
      groups[formattedDate].push(meal);
    });

    return groups;
  };

  const groupedMeals = groupMealsByDate();
  const dateKeys = Object.keys(groupedMeals);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - var(--tabbar-height) - var(--safe-area-top) - 24px)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <h1>Histórico</h1>
        <h3 style={{ marginTop: '2px' }}>Suas refeições registradas</h3>
      </div>

      {/* Barra de Pesquisa (item 3.4) */}
      <div style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por alimento ou tipo de refeição..."
          style={{ paddingLeft: '40px', borderRadius: '16px', userSelect: 'text', fontSize: '13px' }}
        />
        <Search size={16} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
      </div>

      {/* Lista de Refeições */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px' }}>
        {dateKeys.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', padding: '40px 0' }}>
            <Calendar size={36} style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
              {searchQuery ? 'Nenhum resultado encontrado para a busca.' : 'Nenhuma refeição registrada no histórico.'}
            </p>
            {!searchQuery && (
              <button className="btn" onClick={onNavigateToCamera} style={{ padding: '10px 16px', fontSize: '13px', display: 'flex', gap: '6px', width: 'auto', marginTop: '4px' }}>
                <Plus size={14} /> Registrar Refeição
              </button>
            )}
          </div>
        ) : (
          dateKeys.map(dateKey => (
            <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Date Separator */}
              <div style={{ fontSize: '12px', color: 'var(--accent-light)', fontWeight: 600, paddingLeft: '4px', textTransform: 'capitalize' }}>
                {dateKey}
              </div>

              {/* Meals cards on that date */}
              {groupedMeals[dateKey]!.map(meal => {
                const isExpanded = !!expandedMeals[meal.id];
                const totalCals = Math.round(meal.items.reduce((sum, item) => sum + item.calories, 0));
                const totalProt = Math.round(meal.items.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;
                const totalCarbs = Math.round(meal.items.reduce((sum, item) => sum + item.carbs, 0) * 10) / 10;
                const totalFat = Math.round(meal.items.reduce((sum, item) => sum + item.fat, 0) * 10) / 10;
                const totalFiber = Math.round(meal.items.reduce((sum, item) => sum + (item.fiber || 0), 0) * 10) / 10;
                const totalSodium = Math.round(meal.items.reduce((sum, item) => sum + (item.sodium || 0), 0));

                const timeStr = new Date(meal.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div key={meal.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    {/* Header Card (resumo) */}
                    <div 
                      onClick={() => toggleExpand(meal.id)}
                      style={{ 
                        padding: '16px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '15px' }}>{meal.type}</span>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={10} />
                            {timeStr}
                          </div>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {meal.items.length} {meal.items.length === 1 ? 'alimento' : 'alimentos'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-cal)', fontSize: '14px' }}>
                          {totalCals} kcal
                        </span>
                        {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </div>

                    {/* Expanded Body Details (com fibra e sódio) */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* Food Items List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                          {meal.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '13px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 600, color: 'white' }}>{item.foodName}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {item.weightGrams}g • P: {item.protein}g | C: {item.carbs}g | G: {item.fat}g | F: {item.fiber || 0}g | S: {item.sodium || 0}mg
                                </span>
                              </div>
                              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {Math.round(item.calories)} kcal
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Macros Totals Section */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', marginTop: '4px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: '8px', color: 'var(--color-prot)', fontWeight: 700 }}>PROT</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{totalProt}g</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '8px', color: 'var(--color-carb)', fontWeight: 700 }}>CARB</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{totalCarbs}g</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '8px', color: 'var(--color-fat)', fontWeight: 700 }}>GORD</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{totalFat}g</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '8px', color: 'var(--accent-light)', fontWeight: 700 }}>FIBRA</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{totalFiber}g</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '8px', color: '#fb923c', fontWeight: 700 }}>SÓDIO</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginTop: '2px' }}>{totalSodium}mg</div>
                          </div>
                        </div>

                        {/* Delete Meal Button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button 
                            onClick={() => triggerDeleteModal(meal.id)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: 'var(--color-cal)', 
                              fontSize: '11px', 
                              fontWeight: 600, 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px'
                            }}
                            aria-label="Deletar refeição"
                          >
                            <Trash2 size={12} aria-hidden="true" />
                            Excluir Refeição
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* ConfirmModal customizado (iOS Safe) */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Excluir esta refeição?"
        message="Os alimentos correspondentes e seus macronutrientes serão desconsiderados do seu dashboard diário. Esta ação não pode ser desfeita."
        confirmLabel="Confirmar Exclusão"
        cancelLabel="Cancelar"
        danger={true}
        onConfirm={confirmDeleteMeal}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setSelectedMealId(null);
        }}
      />
    </div>
  );
};
