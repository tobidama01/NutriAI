// Unified types for NutriScale AI

export interface MealItem {
  foodName: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;   // em gramas
  sodium?: number;  // em mg
}

export type MealType = 'Café da Manhã' | 'Almoço' | 'Jantar' | 'Lanche';

export interface Meal {
  id: string;
  timestamp: number;
  type: MealType;
  items: MealItem[];
}

export type TabName = 'dashboard' | 'camera' | 'workout' | 'chat' | 'history' | 'settings';

export interface NutritionTargets {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;   // opcional, meta em gramas
  sodium?: number;  // opcional, meta em mg
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

export interface Workout {
  id: string;
  timestamp: number;
  weightKg: number;
  heightCm: number;
  workoutNotes: string;
  cardioNotes: string;
  caloriesBurnedWorkout: number;
  caloriesBurnedCardio: number;
  totalDailyExpenditure: number;
  iaExplanation: string;
}
