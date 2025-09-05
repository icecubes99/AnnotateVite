import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      comments: {
        Row: {
          id: number
          unique_comment_id: string
          context_title: string
          text: string
          likes: number
          post_url: string | null
          created_at: string
        }
        Insert: {
          id?: number
          unique_comment_id: string
          context_title: string
          text: string
          likes?: number
          post_url?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          unique_comment_id?: string
          context_title?: string
          text?: string
          likes?: number
          post_url?: string | null
          created_at?: string
        }
      }
      annotations: {
        Row: {
          id: number
          comment_id: number
          annotator_role: 'annotator1' | 'annotator2'
          sentiment: 'positive' | 'negative' | 'neutral'
          discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
          created_at: string
        }
        Insert: {
          id?: number
          comment_id: number
          annotator_role: 'annotator1' | 'annotator2'
          sentiment: 'positive' | 'negative' | 'neutral'
          discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
          created_at?: string
        }
        Update: {
          id?: number
          comment_id?: number
          annotator_role?: 'annotator1' | 'annotator2'
          sentiment?: 'positive' | 'negative' | 'neutral'
          discourse_polarization?: 'partisan' | 'objective' | 'non_polarized'
          created_at?: string
        }
      }
      final_annotations: {
        Row: {
          id: number
          comment_id: number
          final_sentiment: 'positive' | 'negative' | 'neutral'
          final_discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
          created_at: string
        }
        Insert: {
          id?: number
          comment_id: number
          final_sentiment: 'positive' | 'negative' | 'neutral'
          final_discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
          created_at?: string
        }
        Update: {
          id?: number
          comment_id?: number
          final_sentiment?: 'positive' | 'negative' | 'neutral'
          final_discourse_polarization?: 'partisan' | 'objective' | 'non_polarized'
          created_at?: string
        }
      }
    }
  }
}