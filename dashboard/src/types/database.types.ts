export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      application_events: {
        Row: {
          application_id: string
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          new_value: string | null
          previous_value: string | null
          user_id: string | null
        }
        Insert: {
          application_id: string
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          calendar_event_id: string | null
          company: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          cover_letter: string | null
          date_applied: string | null
          date_found: string | null
          date_response: string | null
          follow_up_date: string | null
          id: string
          interview_date: string | null
          interview_prep: Json | null
          job_description: string | null
          job_type: string | null
          location: string | null
          notes: string | null
          posted_date: string | null
          profile_id: string | null
          salary_range: string | null
          source: string | null
          status: string
          tailored_resume: string | null
          title: string
          updated_at: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          company: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          cover_letter?: string | null
          date_applied?: string | null
          date_found?: string | null
          date_response?: string | null
          follow_up_date?: string | null
          id?: string
          interview_date?: string | null
          interview_prep?: Json | null
          job_description?: string | null
          job_type?: string | null
          location?: string | null
          notes?: string | null
          posted_date?: string | null
          profile_id?: string | null
          salary_range?: string | null
          source?: string | null
          status?: string
          tailored_resume?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          company?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          cover_letter?: string | null
          date_applied?: string | null
          date_found?: string | null
          date_response?: string | null
          follow_up_date?: string | null
          id?: string
          interview_date?: string | null
          interview_prep?: Json | null
          job_description?: string | null
          job_type?: string | null
          location?: string | null
          notes?: string | null
          posted_date?: string | null
          profile_id?: string | null
          salary_range?: string | null
          source?: string | null
          status?: string
          tailored_resume?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_apply_log: {
        Row: {
          action: string
          application_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          queue_id: string | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          action: string
          application_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          queue_id?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          action?: string
          application_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          queue_id?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_apply_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_apply_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "auto_apply_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_apply_queue: {
        Row: {
          application_id: string | null
          company: string
          cover_letter_url: string | null
          created_at: string | null
          easy_apply: boolean | null
          error_message: string | null
          fit_score: number | null
          id: string
          job_title: string
          job_url: string | null
          location: string | null
          priority: string | null
          salary: string | null
          score_breakdown: Json | null
          source: string | null
          source_scan_id: string | null
          status: string | null
          tailored_resume_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          company: string
          cover_letter_url?: string | null
          created_at?: string | null
          easy_apply?: boolean | null
          error_message?: string | null
          fit_score?: number | null
          id?: string
          job_title: string
          job_url?: string | null
          location?: string | null
          priority?: string | null
          salary?: string | null
          score_breakdown?: Json | null
          source?: string | null
          source_scan_id?: string | null
          status?: string | null
          tailored_resume_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          company?: string
          cover_letter_url?: string | null
          created_at?: string | null
          easy_apply?: boolean | null
          error_message?: string | null
          fit_score?: number | null
          id?: string
          job_title?: string
          job_url?: string | null
          location?: string | null
          priority?: string | null
          salary?: string | null
          score_breakdown?: Json | null
          source?: string | null
          source_scan_id?: string | null
          status?: string | null
          tailored_resume_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_apply_queue_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_apply_settings: {
        Row: {
          auto_approve_threshold: number | null
          auto_generate_materials: boolean | null
          created_at: string | null
          easy_apply_only: boolean | null
          enabled: boolean | null
          excluded_companies: string[] | null
          id: string
          manual_review_threshold: number | null
          max_batch_size: number | null
          max_daily_applications: number | null
          min_salary: number | null
          preferred_sources: string[] | null
          require_cover_letter: boolean | null
          scheduled_apply_enabled: boolean | null
          scheduled_apply_interval: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_approve_threshold?: number | null
          auto_generate_materials?: boolean | null
          created_at?: string | null
          easy_apply_only?: boolean | null
          enabled?: boolean | null
          excluded_companies?: string[] | null
          id?: string
          manual_review_threshold?: number | null
          max_batch_size?: number | null
          max_daily_applications?: number | null
          min_salary?: number | null
          preferred_sources?: string[] | null
          require_cover_letter?: boolean | null
          scheduled_apply_enabled?: boolean | null
          scheduled_apply_interval?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_approve_threshold?: number | null
          auto_generate_materials?: boolean | null
          created_at?: string | null
          easy_apply_only?: boolean | null
          enabled?: boolean | null
          excluded_companies?: string[] | null
          id?: string
          manual_review_threshold?: number | null
          max_batch_size?: number | null
          max_daily_applications?: number | null
          min_salary?: number | null
          preferred_sources?: string[] | null
          require_cover_letter?: boolean | null
          scheduled_apply_enabled?: boolean | null
          scheduled_apply_interval?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      career_context: {
        Row: {
          created_at: string | null
          extracted_at: string
          id: string
          profile: Json
          source_notes: string[] | null
          updated_at: string | null
          user_id: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          extracted_at: string
          id?: string
          profile: Json
          source_notes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          extracted_at?: string
          id?: string
          profile?: Json
          source_notes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
        }
        Relationships: []
      }
      company_briefs: {
        Row: {
          application_id: string
          brief_data: Json
          company_name: string
          created_at: string
          generated_at: string
          generation_cost_cents: number
          id: string
          model_used: string
          user_id: string
        }
        Insert: {
          application_id: string
          brief_data?: Json
          company_name: string
          created_at?: string
          generated_at?: string
          generation_cost_cents?: number
          id?: string
          model_used: string
          user_id: string
        }
        Update: {
          application_id?: string
          brief_data?: Json
          company_name?: string
          created_at?: string
          generated_at?: string
          generation_cost_cents?: number
          id?: string
          model_used?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_briefs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_application_links: {
        Row: {
          application_id: string
          contact_id: string
          created_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          application_id: string
          contact_id: string
          created_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          application_id?: string
          contact_id?: string
          created_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_application_links_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_application_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          last_contact_date: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          action_items: Json | null
          ai_analysis: Json | null
          application_id: string | null
          conversation_type: string
          created_at: string | null
          date: string
          duration_minutes: number | null
          id: string
          notes: string | null
          people: Json | null
          questions_asked: Json | null
          questions_you_asked: Json | null
          sentiment: number | null
          title: string | null
          topics: string[] | null
          transcript_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action_items?: Json | null
          ai_analysis?: Json | null
          application_id?: string | null
          conversation_type: string
          created_at?: string | null
          date: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          people?: Json | null
          questions_asked?: Json | null
          questions_you_asked?: Json | null
          sentiment?: number | null
          title?: string | null
          topics?: string[] | null
          transcript_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_items?: Json | null
          ai_analysis?: Json | null
          application_id?: string | null
          conversation_type?: string
          created_at?: string | null
          date?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          people?: Json | null
          questions_asked?: Json | null
          questions_you_asked?: Json | null
          sentiment?: number | null
          title?: string | null
          topics?: string[] | null
          transcript_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefs: {
        Row: {
          ai_analysis: Json | null
          application_id: string
          created_at: string
          do_differently: string | null
          generation_cost_cents: number
          id: string
          interviewer_names: string[] | null
          key_takeaways: string[] | null
          model_used: string | null
          overall_rating: number | null
          stage: string
          topics_covered: string[] | null
          user_id: string
          was_hard: string | null
          went_well: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          application_id: string
          created_at?: string
          do_differently?: string | null
          generation_cost_cents?: number
          id?: string
          interviewer_names?: string[] | null
          key_takeaways?: string[] | null
          model_used?: string | null
          overall_rating?: number | null
          stage: string
          topics_covered?: string[] | null
          user_id: string
          was_hard?: string | null
          went_well?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          application_id?: string
          created_at?: string
          do_differently?: string | null
          generation_cost_cents?: number
          id?: string
          interviewer_names?: string[] | null
          key_takeaways?: string[] | null
          model_used?: string | null
          overall_rating?: number | null
          stage?: string
          topics_covered?: string[] | null
          user_id?: string
          was_hard?: string | null
          went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debriefs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      email_application_links: {
        Row: {
          application_id: string
          email_id: string
          linked_at: string | null
          linked_by: string | null
          user_id: string | null
        }
        Insert: {
          application_id: string
          email_id: string
          linked_at?: string | null
          linked_by?: string | null
          user_id?: string | null
        }
        Update: {
          application_id?: string
          email_id?: string
          linked_at?: string | null
          linked_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_application_links_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_application_links_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_job_suggestions: {
        Row: {
          company: string
          created_at: string
          description: string | null
          email_id: string | null
          id: string
          job_url: string | null
          location: string | null
          relevance_score: number | null
          salary: string | null
          source: string | null
          status: string
          title: string
        }
        Insert: {
          company: string
          created_at?: string
          description?: string | null
          email_id?: string | null
          id?: string
          job_url?: string | null
          location?: string | null
          relevance_score?: number | null
          salary?: string | null
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          company?: string
          created_at?: string
          description?: string | null
          email_id?: string | null
          id?: string
          job_url?: string | null
          location?: string | null
          relevance_score?: number | null
          salary?: string | null
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_job_suggestions_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          auto_track_data: Json | null
          auto_track_status: string | null
          body_preview: string | null
          category: string
          classification_json: Json | null
          created_at: string | null
          dismissed: boolean | null
          from_domain: string | null
          from_email: string
          from_name: string | null
          gmail_id: string
          id: string
          is_read: boolean | null
          received_at: string
          replied_at: string | null
          subject: string | null
          suggested_application_id: string | null
          suggestions_extracted: boolean | null
          thread_id: string | null
          to_email: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_track_data?: Json | null
          auto_track_status?: string | null
          body_preview?: string | null
          category?: string
          classification_json?: Json | null
          created_at?: string | null
          dismissed?: boolean | null
          from_domain?: string | null
          from_email: string
          from_name?: string | null
          gmail_id: string
          id?: string
          is_read?: boolean | null
          received_at: string
          replied_at?: string | null
          subject?: string | null
          suggested_application_id?: string | null
          suggestions_extracted?: boolean | null
          thread_id?: string | null
          to_email?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_track_data?: Json | null
          auto_track_status?: string | null
          body_preview?: string | null
          category?: string
          classification_json?: Json | null
          created_at?: string | null
          dismissed?: boolean | null
          from_domain?: string | null
          from_email?: string
          from_name?: string | null
          gmail_id?: string
          id?: string
          is_read?: boolean | null
          received_at?: string
          replied_at?: string | null
          subject?: string | null
          suggested_application_id?: string | null
          suggestions_extracted?: boolean | null
          thread_id?: string | null
          to_email?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_suggested_application_id_fkey"
            columns: ["suggested_application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_coaching: {
        Row: {
          ai_analysis: Json | null
          application_id: string | null
          created_at: string | null
          id: string
          improvements: Json | null
          overall_score: number | null
          patterns_detected: Json | null
          raw_input: string | null
          session_type: string
          strong_points: Json | null
          user_id: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          application_id?: string | null
          created_at?: string | null
          id?: string
          improvements?: Json | null
          overall_score?: number | null
          patterns_detected?: Json | null
          raw_input?: string | null
          session_type: string
          strong_points?: Json | null
          user_id?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          application_id?: string | null
          created_at?: string | null
          id?: string
          improvements?: Json | null
          overall_score?: number | null
          patterns_detected?: Json | null
          raw_input?: string | null
          session_type?: string
          strong_points?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_coaching_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_prep: {
        Row: {
          application_id: string
          created_at: string
          generated_at: string
          generation_cost_cents: number
          id: string
          model_used: string
          prep_data: Json
          stage: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          generated_at?: string
          generation_cost_cents?: number
          id?: string
          model_used: string
          prep_data?: Json
          stage: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          generated_at?: string
          generation_cost_cents?: number
          id?: string
          model_used?: string
          prep_data?: Json
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_prep_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_details_cache: {
        Row: {
          details: Json
          fetched_at: string | null
          id: string
          job_id: string | null
          job_url: string
          source: string
          user_id: string | null
        }
        Insert: {
          details: Json
          fetched_at?: string | null
          id?: string
          job_id?: string | null
          job_url: string
          source: string
          user_id?: string | null
        }
        Update: {
          details?: Json
          fetched_at?: string | null
          id?: string
          job_id?: string | null
          job_url?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scan_metadata: {
        Row: {
          auto_queued: number | null
          completed_at: string | null
          created_at: string | null
          duplicates_skipped: number | null
          errors: Json | null
          id: string
          new_results: number | null
          profiles_scanned: number | null
          scan_date: string | null
          started_at: string | null
          status: string | null
          total_results: number | null
          user_id: string | null
        }
        Insert: {
          auto_queued?: number | null
          completed_at?: string | null
          created_at?: string | null
          duplicates_skipped?: number | null
          errors?: Json | null
          id?: string
          new_results?: number | null
          profiles_scanned?: number | null
          scan_date?: string | null
          started_at?: string | null
          status?: string | null
          total_results?: number | null
          user_id?: string | null
        }
        Update: {
          auto_queued?: number | null
          completed_at?: string | null
          created_at?: string | null
          duplicates_skipped?: number | null
          errors?: Json | null
          id?: string
          new_results?: number | null
          profiles_scanned?: number | null
          scan_date?: string | null
          started_at?: string | null
          status?: string | null
          total_results?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          company: string
          created_at: string | null
          dismissed: boolean | null
          easy_apply: boolean | null
          fit_score: number | null
          id: string
          job_type: string | null
          job_url: string | null
          location: string | null
          posted_date: string | null
          profile_id: string | null
          profile_name: string | null
          queued: boolean | null
          salary: string | null
          scan_date: string | null
          score_breakdown: Json | null
          source: string | null
          title: string
          user_id: string | null
          viewed: boolean | null
        }
        Insert: {
          company: string
          created_at?: string | null
          dismissed?: boolean | null
          easy_apply?: boolean | null
          fit_score?: number | null
          id?: string
          job_type?: string | null
          job_url?: string | null
          location?: string | null
          posted_date?: string | null
          profile_id?: string | null
          profile_name?: string | null
          queued?: boolean | null
          salary?: string | null
          scan_date?: string | null
          score_breakdown?: Json | null
          source?: string | null
          title: string
          user_id?: string | null
          viewed?: boolean | null
        }
        Update: {
          company?: string
          created_at?: string | null
          dismissed?: boolean | null
          easy_apply?: boolean | null
          fit_score?: number | null
          id?: string
          job_type?: string | null
          job_url?: string | null
          location?: string | null
          posted_date?: string | null
          profile_id?: string | null
          profile_name?: string | null
          queued?: boolean | null
          salary?: string | null
          scan_date?: string | null
          score_breakdown?: Json | null
          source?: string | null
          title?: string
          user_id?: string | null
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "search_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_answers: {
        Row: {
          answer_type: string | null
          answer_value: string
          category: string | null
          created_at: string | null
          id: string
          priority: number | null
          question_pattern: string
          user_id: string | null
        }
        Insert: {
          answer_type?: string | null
          answer_value: string
          category?: string | null
          created_at?: string | null
          id?: string
          priority?: number | null
          question_pattern: string
          user_id?: string | null
        }
        Update: {
          answer_type?: string | null
          answer_value?: string
          category?: string | null
          created_at?: string | null
          id?: string
          priority?: number | null
          question_pattern?: string
          user_id?: string | null
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          id: string
          profile_id: string
          result_count: number | null
          results: Json
          search_run_id: string | null
          searched_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          result_count?: number | null
          results: Json
          search_run_id?: string | null
          searched_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          result_count?: number | null
          results?: Json
          search_run_id?: string | null
          searched_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_cache_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_profiles: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_default: boolean
          keyword: string
          location: string
          name: string
          sort_order: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          keyword: string
          location: string
          name: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          keyword?: string
          location?: string
          name?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_runs: {
        Row: {
          created_at: string | null
          dice_count: number
          id: string
          indeed_count: number
          new_count: number
          profiles_used: string[]
          total_results: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          dice_count?: number
          id?: string
          indeed_count?: number
          new_count?: number
          profiles_used?: string[]
          total_results?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          dice_count?: number
          id?: string
          indeed_count?: number
          new_count?: number
          profiles_used?: string[]
          total_results?: number
          user_id?: string | null
        }
        Relationships: []
      }
      skill_mentions: {
        Row: {
          application_ids: string[] | null
          id: string
          in_resume: boolean
          last_updated: string
          mention_count: number
          skill_name: string
          user_id: string
        }
        Insert: {
          application_ids?: string[] | null
          id?: string
          in_resume?: boolean
          last_updated?: string
          mention_count?: number
          skill_name: string
          user_id: string
        }
        Update: {
          application_ids?: string[] | null
          id?: string
          in_resume?: boolean
          last_updated?: string
          mention_count?: number
          skill_name?: string
          user_id?: string
        }
        Relationships: []
      }
      skills_inventory: {
        Row: {
          aliases: string[] | null
          category: string
          created_at: string | null
          id: string
          skill_name: string
          user_id: string | null
          weight: number | null
          years_experience: number | null
        }
        Insert: {
          aliases?: string[] | null
          category: string
          created_at?: string | null
          id?: string
          skill_name: string
          user_id?: string | null
          weight?: number | null
          years_experience?: number | null
        }
        Update: {
          aliases?: string[] | null
          category?: string
          created_at?: string | null
          id?: string
          skill_name?: string
          user_id?: string | null
          weight?: number | null
          years_experience?: number | null
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          completed_at: string | null
          completed_sections: number | null
          course_code: string
          course_name: string
          created_at: string | null
          domain: string | null
          id: string
          metadata: Json | null
          overall_progress: number | null
          provider: string | null
          started_at: string | null
          status: string
          target_exam_date: string | null
          total_modules: number | null
          total_sections: number | null
          updated_at: string | null
          user_id: string
          vault_path: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_sections?: number | null
          course_code: string
          course_name: string
          created_at?: string | null
          domain?: string | null
          id?: string
          metadata?: Json | null
          overall_progress?: number | null
          provider?: string | null
          started_at?: string | null
          status?: string
          target_exam_date?: string | null
          total_modules?: number | null
          total_sections?: number | null
          updated_at?: string | null
          user_id?: string
          vault_path?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_sections?: number | null
          course_code?: string
          course_name?: string
          created_at?: string | null
          domain?: string | null
          id?: string
          metadata?: Json | null
          overall_progress?: number | null
          provider?: string | null
          started_at?: string | null
          status?: string
          target_exam_date?: string | null
          total_modules?: number | null
          total_sections?: number | null
          updated_at?: string | null
          user_id?: string
          vault_path?: string | null
        }
        Relationships: []
      }
      training_progress: {
        Row: {
          best_score: number | null
          completed: boolean | null
          completed_at: string | null
          course_id: string
          created_at: string | null
          exam_weight: string | null
          id: string
          module_number: number
          module_title: string | null
          next_review_at: string | null
          quiz_attempts: number | null
          quiz_score: number | null
          review_count: number | null
          section_number: string
          section_title: string | null
          session_links: Json | null
          updated_at: string | null
          user_id: string
          weak_areas: Json | null
        }
        Insert: {
          best_score?: number | null
          completed?: boolean | null
          completed_at?: string | null
          course_id: string
          created_at?: string | null
          exam_weight?: string | null
          id?: string
          module_number: number
          module_title?: string | null
          next_review_at?: string | null
          quiz_attempts?: number | null
          quiz_score?: number | null
          review_count?: number | null
          section_number: string
          section_title?: string | null
          session_links?: Json | null
          updated_at?: string | null
          user_id?: string
          weak_areas?: Json | null
        }
        Update: {
          best_score?: number | null
          completed?: boolean | null
          completed_at?: string | null
          course_id?: string
          created_at?: string | null
          exam_weight?: string | null
          id?: string
          module_number?: number
          module_title?: string | null
          next_review_at?: string | null
          quiz_attempts?: number | null
          quiz_score?: number | null
          review_count?: number | null
          section_number?: string
          section_title?: string | null
          session_links?: Json | null
          updated_at?: string | null
          user_id?: string
          weak_areas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_resources: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          course_id: string
          created_at: string | null
          id: string
          notes: string | null
          resource_type: string | null
          section_number: string | null
          title: string
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          course_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          resource_type?: string | null
          section_number?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          course_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          resource_type?: string | null
          section_number?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_resources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          course_id: string
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          notes: string | null
          quiz_results: Json | null
          sections_covered: Json | null
          session_mode: string
          started_at: string
          topics_covered: Json | null
          user_id: string
          vault_path: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          quiz_results?: Json | null
          sections_covered?: Json | null
          session_mode: string
          started_at: string
          topics_covered?: Json | null
          user_id?: string
          vault_path?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          quiz_results?: Json | null
          sections_covered?: Json | null
          session_mode?: string
          started_at?: string
          topics_covered?: Json | null
          user_id?: string
          vault_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string | null
          last_email_scan: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          last_email_scan?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          last_email_scan?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
