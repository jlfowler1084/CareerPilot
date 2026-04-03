export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          created_at?: string | null
        }
        Relationships: []
      }
      application_events: {
        Row: {
          id: string
          application_id: string
          user_id: string | null
          event_type: string
          previous_value: string | null
          new_value: string | null
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          application_id: string
          user_id?: string | null
          event_type: string
          previous_value?: string | null
          new_value?: string | null
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          application_id?: string
          user_id?: string | null
          event_type?: string
          previous_value?: string | null
          new_value?: string | null
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          id: string
          user_id: string | null
          title: string
          company: string
          location: string | null
          url: string | null
          source: string | null
          salary_range: string | null
          status: string
          job_type: string | null
          posted_date: string | null
          date_found: string | null
          date_applied: string | null
          date_response: string | null
          notes: string | null
          profile_id: string | null
          updated_at: string | null
          tailored_resume: string | null
          interview_date: string | null
          follow_up_date: string | null
          calendar_event_id: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_role: string | null
          job_description: string | null
          interview_prep: Json | null
          cover_letter: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          title: string
          company: string
          location?: string | null
          url?: string | null
          source?: string | null
          salary_range?: string | null
          status?: string
          job_type?: string | null
          posted_date?: string | null
          date_found?: string | null
          date_applied?: string | null
          date_response?: string | null
          notes?: string | null
          profile_id?: string | null
          updated_at?: string | null
          tailored_resume?: string | null
          interview_date?: string | null
          follow_up_date?: string | null
          calendar_event_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          job_description?: string | null
          interview_prep?: Json | null
          cover_letter?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          title?: string
          company?: string
          location?: string | null
          url?: string | null
          source?: string | null
          salary_range?: string | null
          status?: string
          job_type?: string | null
          posted_date?: string | null
          date_found?: string | null
          date_applied?: string | null
          date_response?: string | null
          notes?: string | null
          profile_id?: string | null
          updated_at?: string | null
          tailored_resume?: string | null
          interview_date?: string | null
          follow_up_date?: string | null
          calendar_event_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          job_description?: string | null
          interview_prep?: Json | null
          cover_letter?: string | null
        }
        Relationships: []
      }
      auto_apply_log: {
        Row: {
          id: string
          user_id: string | null
          queue_id: string | null
          application_id: string | null
          action: string
          details: Json | null
          success: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          queue_id?: string | null
          application_id?: string | null
          action: string
          details?: Json | null
          success?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          queue_id?: string | null
          application_id?: string | null
          action?: string
          details?: Json | null
          success?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      auto_apply_queue: {
        Row: {
          id: string
          user_id: string | null
          job_title: string
          company: string
          location: string | null
          salary: string | null
          job_url: string | null
          source: string | null
          easy_apply: boolean | null
          fit_score: number | null
          score_breakdown: Json | null
          status: string | null
          tailored_resume_url: string | null
          cover_letter_url: string | null
          application_id: string | null
          error_message: string | null
          created_at: string | null
          updated_at: string | null
          source_scan_id: string | null
          priority: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          job_title: string
          company: string
          location?: string | null
          salary?: string | null
          job_url?: string | null
          source?: string | null
          easy_apply?: boolean | null
          fit_score?: number | null
          score_breakdown?: Json | null
          status?: string | null
          tailored_resume_url?: string | null
          cover_letter_url?: string | null
          application_id?: string | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
          source_scan_id?: string | null
          priority?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          job_title?: string
          company?: string
          location?: string | null
          salary?: string | null
          job_url?: string | null
          source?: string | null
          easy_apply?: boolean | null
          fit_score?: number | null
          score_breakdown?: Json | null
          status?: string | null
          tailored_resume_url?: string | null
          cover_letter_url?: string | null
          application_id?: string | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
          source_scan_id?: string | null
          priority?: string | null
        }
        Relationships: []
      }
      auto_apply_settings: {
        Row: {
          id: string
          user_id: string | null
          enabled: boolean | null
          auto_approve_threshold: number | null
          manual_review_threshold: number | null
          max_daily_applications: number | null
          max_batch_size: number | null
          easy_apply_only: boolean | null
          preferred_sources: string[] | null
          excluded_companies: string[] | null
          min_salary: number | null
          require_cover_letter: boolean | null
          auto_generate_materials: boolean | null
          created_at: string | null
          updated_at: string | null
          scheduled_apply_enabled: boolean | null
          scheduled_apply_interval: number | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          enabled?: boolean | null
          auto_approve_threshold?: number | null
          manual_review_threshold?: number | null
          max_daily_applications?: number | null
          max_batch_size?: number | null
          easy_apply_only?: boolean | null
          preferred_sources?: string[] | null
          excluded_companies?: string[] | null
          min_salary?: number | null
          require_cover_letter?: boolean | null
          auto_generate_materials?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          scheduled_apply_enabled?: boolean | null
          scheduled_apply_interval?: number | null
        }
        Update: {
          id?: string
          user_id?: string | null
          enabled?: boolean | null
          auto_approve_threshold?: number | null
          manual_review_threshold?: number | null
          max_daily_applications?: number | null
          max_batch_size?: number | null
          easy_apply_only?: boolean | null
          preferred_sources?: string[] | null
          excluded_companies?: string[] | null
          min_salary?: number | null
          require_cover_letter?: boolean | null
          auto_generate_materials?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          scheduled_apply_enabled?: boolean | null
          scheduled_apply_interval?: number | null
        }
        Relationships: []
      }
      career_context: {
        Row: {
          id: string
          user_id: string | null
          profile: Json
          version: number | null
          extracted_at: string
          source_notes: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          profile: Json
          version?: number | null
          extracted_at: string
          source_notes?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          profile?: Json
          version?: number | null
          extracted_at?: string
          source_notes?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_briefs: {
        Row: {
          id: string
          application_id: string
          user_id: string
          company_name: string
          brief_data: Json
          generated_at: string
          model_used: string
          generation_cost_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          user_id: string
          company_name: string
          brief_data?: Json
          generated_at?: string
          model_used: string
          generation_cost_cents?: number
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          company_name?: string
          brief_data?: Json
          generated_at?: string
          model_used?: string
          generation_cost_cents?: number
          created_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          application_id: string | null
          user_id: string | null
          conversation_type: string
          title: string | null
          people: Json | null
          date: string
          duration_minutes: number | null
          notes: string | null
          questions_asked: Json | null
          questions_you_asked: Json | null
          action_items: Json | null
          topics: string[] | null
          sentiment: number | null
          transcript_url: string | null
          ai_analysis: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          application_id?: string | null
          user_id?: string | null
          conversation_type: string
          title?: string | null
          people?: Json | null
          date: string
          duration_minutes?: number | null
          notes?: string | null
          questions_asked?: Json | null
          questions_you_asked?: Json | null
          action_items?: Json | null
          topics?: string[] | null
          sentiment?: number | null
          transcript_url?: string | null
          ai_analysis?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          application_id?: string | null
          user_id?: string | null
          conversation_type?: string
          title?: string | null
          people?: Json | null
          date?: string
          duration_minutes?: number | null
          notes?: string | null
          questions_asked?: Json | null
          questions_you_asked?: Json | null
          action_items?: Json | null
          topics?: string[] | null
          sentiment?: number | null
          transcript_url?: string | null
          ai_analysis?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debriefs: {
        Row: {
          id: string
          application_id: string
          user_id: string
          stage: string
          went_well: string | null
          was_hard: string | null
          do_differently: string | null
          key_takeaways: string[] | null
          interviewer_names: string[] | null
          topics_covered: string[] | null
          ai_analysis: Json | null
          model_used: string | null
          generation_cost_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          user_id: string
          stage: string
          went_well?: string | null
          was_hard?: string | null
          do_differently?: string | null
          key_takeaways?: string[] | null
          interviewer_names?: string[] | null
          topics_covered?: string[] | null
          ai_analysis?: Json | null
          model_used?: string | null
          generation_cost_cents?: number
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          stage?: string
          went_well?: string | null
          was_hard?: string | null
          do_differently?: string | null
          key_takeaways?: string[] | null
          interviewer_names?: string[] | null
          topics_covered?: string[] | null
          ai_analysis?: Json | null
          model_used?: string | null
          generation_cost_cents?: number
          created_at?: string
        }
        Relationships: []
      }
      email_application_links: {
        Row: {
          email_id: string
          application_id: string
          user_id: string | null
          linked_by: string | null
          linked_at: string | null
        }
        Insert: {
          email_id: string
          application_id: string
          user_id?: string | null
          linked_by?: string | null
          linked_at?: string | null
        }
        Update: {
          email_id?: string
          application_id?: string
          user_id?: string | null
          linked_by?: string | null
          linked_at?: string | null
        }
        Relationships: []
      }
      email_job_suggestions: {
        Row: {
          id: string
          email_id: string | null
          title: string
          company: string
          location: string | null
          salary: string | null
          source: string | null
          job_url: string | null
          description: string | null
          relevance_score: number | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          email_id?: string | null
          title: string
          company: string
          location?: string | null
          salary?: string | null
          source?: string | null
          job_url?: string | null
          description?: string | null
          relevance_score?: number | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          email_id?: string | null
          title?: string
          company?: string
          location?: string | null
          salary?: string | null
          source?: string | null
          job_url?: string | null
          description?: string | null
          relevance_score?: number | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          id: string
          user_id: string | null
          gmail_id: string
          thread_id: string | null
          from_email: string
          from_name: string | null
          from_domain: string | null
          to_email: string | null
          subject: string | null
          body_preview: string | null
          received_at: string
          category: string
          classification_json: Json | null
          suggested_application_id: string | null
          is_read: boolean | null
          dismissed: boolean | null
          created_at: string | null
          updated_at: string | null
          replied_at: string | null
          auto_track_status: string | null
          auto_track_data: Json | null
          suggestions_extracted: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          gmail_id: string
          thread_id?: string | null
          from_email: string
          from_name?: string | null
          from_domain?: string | null
          to_email?: string | null
          subject?: string | null
          body_preview?: string | null
          received_at: string
          category?: string
          classification_json?: Json | null
          suggested_application_id?: string | null
          is_read?: boolean | null
          dismissed?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          replied_at?: string | null
          auto_track_status?: string | null
          auto_track_data?: Json | null
          suggestions_extracted?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          gmail_id?: string
          thread_id?: string | null
          from_email?: string
          from_name?: string | null
          from_domain?: string | null
          to_email?: string | null
          subject?: string | null
          body_preview?: string | null
          received_at?: string
          category?: string
          classification_json?: Json | null
          suggested_application_id?: string | null
          is_read?: boolean | null
          dismissed?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          replied_at?: string | null
          auto_track_status?: string | null
          auto_track_data?: Json | null
          suggestions_extracted?: boolean | null
        }
        Relationships: []
      }
      interview_coaching: {
        Row: {
          id: string
          application_id: string | null
          user_id: string | null
          session_type: string
          raw_input: string | null
          ai_analysis: Json | null
          overall_score: number | null
          strong_points: Json | null
          improvements: Json | null
          patterns_detected: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          application_id?: string | null
          user_id?: string | null
          session_type: string
          raw_input?: string | null
          ai_analysis?: Json | null
          overall_score?: number | null
          strong_points?: Json | null
          improvements?: Json | null
          patterns_detected?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          application_id?: string | null
          user_id?: string | null
          session_type?: string
          raw_input?: string | null
          ai_analysis?: Json | null
          overall_score?: number | null
          strong_points?: Json | null
          improvements?: Json | null
          patterns_detected?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      interview_prep: {
        Row: {
          id: string
          application_id: string
          user_id: string
          stage: string
          prep_data: Json
          generated_at: string
          model_used: string
          generation_cost_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          user_id: string
          stage: string
          prep_data?: Json
          generated_at?: string
          model_used: string
          generation_cost_cents?: number
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          user_id?: string
          stage?: string
          prep_data?: Json
          generated_at?: string
          model_used?: string
          generation_cost_cents?: number
          created_at?: string
        }
        Relationships: []
      }
      job_details_cache: {
        Row: {
          id: string
          user_id: string | null
          job_url: string
          source: string
          job_id: string | null
          details: Json
          fetched_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          job_url: string
          source: string
          job_id?: string | null
          details: Json
          fetched_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          job_url?: string
          source?: string
          job_id?: string | null
          details?: Json
          fetched_at?: string | null
        }
        Relationships: []
      }
      scan_metadata: {
        Row: {
          id: string
          user_id: string | null
          scan_date: string | null
          started_at: string | null
          completed_at: string | null
          profiles_scanned: number | null
          total_results: number | null
          new_results: number | null
          duplicates_skipped: number | null
          auto_queued: number | null
          errors: Json | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          scan_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          profiles_scanned?: number | null
          total_results?: number | null
          new_results?: number | null
          duplicates_skipped?: number | null
          auto_queued?: number | null
          errors?: Json | null
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          scan_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          profiles_scanned?: number | null
          total_results?: number | null
          new_results?: number | null
          duplicates_skipped?: number | null
          auto_queued?: number | null
          errors?: Json | null
          status?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          id: string
          user_id: string | null
          profile_id: string | null
          profile_name: string | null
          title: string
          company: string
          location: string | null
          salary: string | null
          job_url: string | null
          source: string | null
          job_type: string | null
          posted_date: string | null
          easy_apply: boolean | null
          fit_score: number | null
          score_breakdown: Json | null
          scan_date: string | null
          viewed: boolean | null
          queued: boolean | null
          dismissed: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          profile_id?: string | null
          profile_name?: string | null
          title: string
          company: string
          location?: string | null
          salary?: string | null
          job_url?: string | null
          source?: string | null
          job_type?: string | null
          posted_date?: string | null
          easy_apply?: boolean | null
          fit_score?: number | null
          score_breakdown?: Json | null
          scan_date?: string | null
          viewed?: boolean | null
          queued?: boolean | null
          dismissed?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          profile_id?: string | null
          profile_name?: string | null
          title?: string
          company?: string
          location?: string | null
          salary?: string | null
          job_url?: string | null
          source?: string | null
          job_type?: string | null
          posted_date?: string | null
          easy_apply?: boolean | null
          fit_score?: number | null
          score_breakdown?: Json | null
          scan_date?: string | null
          viewed?: boolean | null
          queued?: boolean | null
          dismissed?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      screening_answers: {
        Row: {
          id: string
          user_id: string | null
          question_pattern: string
          answer_value: string
          answer_type: string | null
          category: string | null
          priority: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          question_pattern: string
          answer_value: string
          answer_type?: string | null
          category?: string | null
          priority?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          question_pattern?: string
          answer_value?: string
          answer_type?: string | null
          category?: string | null
          priority?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          id: string
          user_id: string | null
          profile_id: string
          results: Json
          result_count: number | null
          searched_at: string | null
          search_run_id: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          profile_id: string
          results: Json
          result_count?: number | null
          searched_at?: string | null
          search_run_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          profile_id?: string
          results?: Json
          result_count?: number | null
          searched_at?: string | null
          search_run_id?: string | null
        }
        Relationships: []
      }
      search_profiles: {
        Row: {
          id: string
          name: string
          keyword: string
          location: string
          source: string
          icon: string
          is_default: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          keyword: string
          location: string
          source?: string
          icon?: string
          is_default?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          keyword?: string
          location?: string
          source?: string
          icon?: string
          is_default?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_runs: {
        Row: {
          id: string
          user_id: string | null
          profiles_used: string[]
          total_results: number
          indeed_count: number
          dice_count: number
          new_count: number
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          profiles_used?: string[]
          total_results?: number
          indeed_count?: number
          dice_count?: number
          new_count?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          profiles_used?: string[]
          total_results?: number
          indeed_count?: number
          dice_count?: number
          new_count?: number
          created_at?: string | null
        }
        Relationships: []
      }
      skill_mentions: {
        Row: {
          id: string
          user_id: string
          skill_name: string
          mention_count: number
          application_ids: string[] | null
          in_resume: boolean
          last_updated: string
        }
        Insert: {
          id?: string
          user_id: string
          skill_name: string
          mention_count?: number
          application_ids?: string[] | null
          in_resume?: boolean
          last_updated?: string
        }
        Update: {
          id?: string
          user_id?: string
          skill_name?: string
          mention_count?: number
          application_ids?: string[] | null
          in_resume?: boolean
          last_updated?: string
        }
        Relationships: []
      }
      skills_inventory: {
        Row: {
          id: string
          user_id: string | null
          skill_name: string
          category: string
          weight: number | null
          years_experience: number | null
          aliases: string[] | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          skill_name: string
          category: string
          weight?: number | null
          years_experience?: number | null
          aliases?: string[] | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          skill_name?: string
          category?: string
          weight?: number | null
          years_experience?: number | null
          aliases?: string[] | null
          created_at?: string | null
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          id: string
          user_id: string
          course_code: string
          course_name: string
          domain: string | null
          provider: string | null
          status: string
          started_at: string | null
          target_exam_date: string | null
          completed_at: string | null
          total_modules: number | null
          total_sections: number | null
          completed_sections: number | null
          overall_progress: number | null
          vault_path: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string
          course_code: string
          course_name: string
          domain?: string | null
          provider?: string | null
          status?: string
          started_at?: string | null
          target_exam_date?: string | null
          completed_at?: string | null
          total_modules?: number | null
          total_sections?: number | null
          completed_sections?: number | null
          overall_progress?: number | null
          vault_path?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          course_code?: string
          course_name?: string
          domain?: string | null
          provider?: string | null
          status?: string
          started_at?: string | null
          target_exam_date?: string | null
          completed_at?: string | null
          total_modules?: number | null
          total_sections?: number | null
          completed_sections?: number | null
          overall_progress?: number | null
          vault_path?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      training_progress: {
        Row: {
          id: string
          course_id: string
          user_id: string
          module_number: number
          module_title: string | null
          section_number: string
          section_title: string | null
          exam_weight: string | null
          completed: boolean | null
          completed_at: string | null
          quiz_score: number | null
          quiz_attempts: number | null
          best_score: number | null
          weak_areas: Json | null
          session_links: Json | null
          next_review_at: string | null
          review_count: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          user_id?: string
          module_number: number
          module_title?: string | null
          section_number: string
          section_title?: string | null
          exam_weight?: string | null
          completed?: boolean | null
          completed_at?: string | null
          quiz_score?: number | null
          quiz_attempts?: number | null
          best_score?: number | null
          weak_areas?: Json | null
          session_links?: Json | null
          next_review_at?: string | null
          review_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          user_id?: string
          module_number?: number
          module_title?: string | null
          section_number?: string
          section_title?: string | null
          exam_weight?: string | null
          completed?: boolean | null
          completed_at?: string | null
          quiz_score?: number | null
          quiz_attempts?: number | null
          best_score?: number | null
          weak_areas?: Json | null
          session_links?: Json | null
          next_review_at?: string | null
          review_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      training_resources: {
        Row: {
          id: string
          course_id: string
          user_id: string
          title: string
          url: string | null
          resource_type: string | null
          section_number: string | null
          completed: boolean | null
          completed_at: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          user_id?: string
          title: string
          url?: string | null
          resource_type?: string | null
          section_number?: string | null
          completed?: boolean | null
          completed_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          user_id?: string
          title?: string
          url?: string | null
          resource_type?: string | null
          section_number?: string | null
          completed?: boolean | null
          completed_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          id: string
          course_id: string
          user_id: string
          session_mode: string
          started_at: string
          ended_at: string | null
          duration_minutes: number | null
          sections_covered: Json | null
          topics_covered: Json | null
          quiz_results: Json | null
          vault_path: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          user_id?: string
          session_mode: string
          started_at: string
          ended_at?: string | null
          duration_minutes?: number | null
          sections_covered?: Json | null
          topics_covered?: Json | null
          quiz_results?: Json | null
          vault_path?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          course_id?: string
          user_id?: string
          session_mode?: string
          started_at?: string
          ended_at?: string | null
          duration_minutes?: number | null
          sections_covered?: Json | null
          topics_covered?: Json | null
          quiz_results?: Json | null
          vault_path?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          user_id: string
          last_email_scan: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          last_email_scan?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          last_email_scan?: string | null
          created_at?: string | null
          updated_at?: string | null
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
