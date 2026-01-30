/**
 * Categories Service
 * 
 * Provides CRUD operations for the categories table in Supabase.
 * Handles budget categories and their subcategories.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/supabase';

/**
 * Get all categories
 */
export const getAllCategories = async () => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching categories:', error);
    return { data: null, error };
  }
};

/**
 * Get a single category by ID
 */
export const getCategoryById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching category:', error);
    return { data: null, error };
  }
};

/**
 * Get a single category by name
 */
export const getCategoryByName = async (name: string) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('name', name)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching category by name:', error);
    return { data: null, error };
  }
};

/**
 * Create a new category
 */
export const createCategory = async (category: CreateCategoryInput) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .insert([category])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating category:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing category
 */
export const updateCategory = async (id: string, updates: UpdateCategoryInput) => {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating category:', error);
    return { data: null, error };
  }
};

/**
 * Delete a category
 */
export const deleteCategory = async (id: string) => {
  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting category:', error);
    return { error };
  }
};

/**
 * Add a subcategory to an existing category
 */
export const addSubcategory = async (categoryId: string, subcategoryName: string) => {
  try {
    // First, get the current category
    const { data: category, error: fetchError } = await getCategoryById(categoryId);
    if (fetchError || !category) {
      return { data: null, error: fetchError || new Error('Category not found') };
    }

    // Add the new subcategory if it doesn't already exist
    const subcategories = category.subcategories || [];
    if (!subcategories.includes(subcategoryName)) {
      subcategories.push(subcategoryName);
    }

    // Update the category
    return updateCategory(categoryId, { subcategories });
  } catch (error) {
    console.error('Error adding subcategory:', error);
    return { data: null, error };
  }
};

/**
 * Remove a subcategory from an existing category
 */
export const removeSubcategory = async (categoryId: string, subcategoryName: string) => {
  try {
    // First, get the current category
    const { data: category, error: fetchError } = await getCategoryById(categoryId);
    if (fetchError || !category) {
      return { data: null, error: fetchError || new Error('Category not found') };
    }

    // Remove the subcategory
    const subcategories = (category.subcategories || []).filter(
      (sub: string) => sub !== subcategoryName
    );

    // Update the category
    return updateCategory(categoryId, { subcategories });
  } catch (error) {
    console.error('Error removing subcategory:', error);
    return { data: null, error };
  }
};

/**
 * Initialize default categories
 * This function should be called once to populate the categories table with defaults
 */
export const initializeDefaultCategories = async (defaultCategories: Array<{ name: string; subcategories: string[] }>) => {
  try {
    const results = [];
    
    for (const category of defaultCategories) {
      // Check if category already exists
      const { data: existing } = await getCategoryByName(category.name);
      
      if (!existing) {
        // Create new category if it doesn't exist
        const result = await createCategory({
          name: category.name,
          subcategories: category.subcategories
        });
        results.push(result);
      } else {
        console.log(`Category "${category.name}" already exists, skipping...`);
        results.push({ data: existing, error: null });
      }
    }

    return { data: results, error: null };
  } catch (error) {
    console.error('Error initializing default categories:', error);
    return { data: null, error };
  }
};
