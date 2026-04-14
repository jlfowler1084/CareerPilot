


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_training_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_training_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."application_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "previous_value" "text",
    "new_value" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."application_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text",
    "url" "text",
    "source" "text",
    "salary_range" "text",
    "status" "text" DEFAULT 'found'::"text" NOT NULL,
    "job_type" "text",
    "posted_date" "text",
    "date_found" timestamp with time zone DEFAULT "now"(),
    "date_applied" timestamp with time zone,
    "date_response" timestamp with time zone,
    "notes" "text" DEFAULT ''::"text",
    "profile_id" "text" DEFAULT ''::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tailored_resume" "text",
    "interview_date" timestamp with time zone,
    "follow_up_date" timestamp with time zone,
    "calendar_event_id" "text",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "contact_role" "text",
    "job_description" "text",
    "interview_prep" "jsonb" DEFAULT '{}'::"jsonb",
    "cover_letter" "text"
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_apply_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "queue_id" "uuid",
    "application_id" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "success" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auto_apply_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_apply_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "job_title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text",
    "salary" "text",
    "job_url" "text",
    "source" "text",
    "easy_apply" boolean DEFAULT false,
    "fit_score" integer,
    "score_breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "tailored_resume_url" "text",
    "cover_letter_url" "text",
    "application_id" "uuid",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_scan_id" "uuid",
    "priority" "text" DEFAULT 'normal'::"text",
    CONSTRAINT "auto_apply_queue_fit_score_check" CHECK ((("fit_score" >= 0) AND ("fit_score" <= 100))),
    CONSTRAINT "auto_apply_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'generating'::"text", 'ready'::"text", 'applying'::"text", 'applied'::"text", 'failed'::"text", 'skipped'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."auto_apply_queue" OWNER TO "postgres";


COMMENT ON COLUMN "public"."auto_apply_queue"."source_scan_id" IS 'Reference to scan_results.id that originated this queue entry';



COMMENT ON COLUMN "public"."auto_apply_queue"."priority" IS 'high (score 80+) or normal (score 60-79)';



CREATE TABLE IF NOT EXISTS "public"."auto_apply_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "enabled" boolean DEFAULT false,
    "auto_approve_threshold" integer DEFAULT 85,
    "manual_review_threshold" integer DEFAULT 60,
    "max_daily_applications" integer DEFAULT 10,
    "max_batch_size" integer DEFAULT 5,
    "easy_apply_only" boolean DEFAULT true,
    "preferred_sources" "text"[] DEFAULT ARRAY['indeed'::"text", 'dice'::"text"],
    "excluded_companies" "text"[] DEFAULT '{}'::"text"[],
    "min_salary" integer DEFAULT 0,
    "require_cover_letter" boolean DEFAULT true,
    "auto_generate_materials" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "scheduled_apply_enabled" boolean DEFAULT false,
    "scheduled_apply_interval" integer DEFAULT 30,
    CONSTRAINT "auto_apply_settings_auto_approve_threshold_check" CHECK ((("auto_approve_threshold" >= 50) AND ("auto_approve_threshold" <= 100))),
    CONSTRAINT "auto_apply_settings_manual_review_threshold_check" CHECK ((("manual_review_threshold" >= 30) AND ("manual_review_threshold" <= 100))),
    CONSTRAINT "auto_apply_settings_max_batch_size_check" CHECK ((("max_batch_size" >= 1) AND ("max_batch_size" <= 20))),
    CONSTRAINT "auto_apply_settings_max_daily_applications_check" CHECK ((("max_daily_applications" >= 1) AND ("max_daily_applications" <= 50)))
);


ALTER TABLE "public"."auto_apply_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."career_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "profile" "jsonb" NOT NULL,
    "version" integer DEFAULT 1,
    "extracted_at" timestamp with time zone NOT NULL,
    "source_notes" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."career_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_briefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "brief_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model_used" "text" NOT NULL,
    "generation_cost_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_briefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid",
    "user_id" "uuid",
    "conversation_type" "text" NOT NULL,
    "title" "text",
    "people" "jsonb" DEFAULT '[]'::"jsonb",
    "date" timestamp with time zone NOT NULL,
    "duration_minutes" integer,
    "notes" "text",
    "questions_asked" "jsonb" DEFAULT '[]'::"jsonb",
    "questions_you_asked" "jsonb" DEFAULT '[]'::"jsonb",
    "action_items" "jsonb" DEFAULT '[]'::"jsonb",
    "topics" "text"[] DEFAULT '{}'::"text"[],
    "sentiment" integer,
    "transcript_url" "text",
    "ai_analysis" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversations_sentiment_check" CHECK ((("sentiment" >= 1) AND ("sentiment" <= 5)))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debriefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "went_well" "text",
    "was_hard" "text",
    "do_differently" "text",
    "key_takeaways" "text"[] DEFAULT '{}'::"text"[],
    "interviewer_names" "text"[] DEFAULT '{}'::"text"[],
    "topics_covered" "text"[] DEFAULT '{}'::"text"[],
    "ai_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "model_used" "text",
    "generation_cost_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "overall_rating" integer,
    CONSTRAINT "debriefs_overall_rating_check" CHECK ((("overall_rating" >= 1) AND ("overall_rating" <= 5))),
    CONSTRAINT "debriefs_stage_check" CHECK (("stage" = ANY (ARRAY['phone_screen'::"text", 'technical'::"text", 'hiring_manager'::"text", 'final_round'::"text", 'offer'::"text"])))
);


ALTER TABLE "public"."debriefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_application_links" (
    "email_id" "uuid" NOT NULL,
    "application_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "linked_by" "text" DEFAULT 'manual'::"text",
    "linked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_application_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_job_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid",
    "title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text",
    "salary" "text",
    "source" "text",
    "job_url" "text",
    "description" "text",
    "relevance_score" double precision,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_job_suggestions_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'interested'::"text", 'applied'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."email_job_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "gmail_id" "text" NOT NULL,
    "thread_id" "text",
    "from_email" "text" NOT NULL,
    "from_name" "text",
    "from_domain" "text",
    "to_email" "text",
    "subject" "text",
    "body_preview" "text",
    "received_at" timestamp with time zone NOT NULL,
    "category" "text" DEFAULT 'unclassified'::"text" NOT NULL,
    "classification_json" "jsonb",
    "suggested_application_id" "uuid",
    "is_read" boolean DEFAULT false,
    "dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "replied_at" timestamp with time zone,
    "auto_track_status" "text",
    "auto_track_data" "jsonb",
    "suggestions_extracted" boolean DEFAULT false
);


ALTER TABLE "public"."emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interview_coaching" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid",
    "user_id" "uuid",
    "session_type" "text" NOT NULL,
    "raw_input" "text",
    "ai_analysis" "jsonb",
    "overall_score" integer,
    "strong_points" "jsonb",
    "improvements" "jsonb",
    "patterns_detected" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "interview_coaching_overall_score_check" CHECK ((("overall_score" >= 1) AND ("overall_score" <= 10))),
    CONSTRAINT "interview_coaching_session_type_check" CHECK (("session_type" = ANY (ARRAY['debrief'::"text", 'transcript'::"text", 'practice'::"text"])))
);


ALTER TABLE "public"."interview_coaching" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interview_prep" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "prep_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model_used" "text" NOT NULL,
    "generation_cost_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "interview_prep_stage_check" CHECK (("stage" = ANY (ARRAY['phone_screen'::"text", 'technical'::"text", 'hiring_manager'::"text", 'final_round'::"text", 'offer'::"text"])))
);


ALTER TABLE "public"."interview_prep" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_details_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "job_url" "text" NOT NULL,
    "source" "text" NOT NULL,
    "job_id" "text",
    "details" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_details_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_metadata" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "scan_date" "date" DEFAULT CURRENT_DATE,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "profiles_scanned" integer DEFAULT 0,
    "total_results" integer DEFAULT 0,
    "new_results" integer DEFAULT 0,
    "duplicates_skipped" integer DEFAULT 0,
    "auto_queued" integer DEFAULT 0,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'running'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scan_metadata_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."scan_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "profile_id" "uuid",
    "profile_name" "text",
    "title" "text" NOT NULL,
    "company" "text" NOT NULL,
    "location" "text",
    "salary" "text",
    "job_url" "text",
    "source" "text",
    "job_type" "text",
    "posted_date" "text",
    "easy_apply" boolean DEFAULT false,
    "fit_score" integer DEFAULT 0,
    "score_breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "scan_date" "date" DEFAULT CURRENT_DATE,
    "viewed" boolean DEFAULT false,
    "queued" boolean DEFAULT false,
    "dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scan_results_source_check" CHECK (("source" = ANY (ARRAY['indeed'::"text", 'dice'::"text"])))
);


ALTER TABLE "public"."scan_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."screening_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "question_pattern" "text" NOT NULL,
    "answer_value" "text" NOT NULL,
    "answer_type" "text" DEFAULT 'text'::"text",
    "category" "text" DEFAULT 'general'::"text",
    "priority" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "screening_answers_answer_type_check" CHECK (("answer_type" = ANY (ARRAY['text'::"text", 'boolean'::"text", 'number'::"text", 'select'::"text"])))
);


ALTER TABLE "public"."screening_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "profile_id" "text" NOT NULL,
    "results" "jsonb" NOT NULL,
    "result_count" integer DEFAULT 0,
    "searched_at" timestamp with time zone DEFAULT "now"(),
    "search_run_id" "uuid"
);


ALTER TABLE "public"."search_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "keyword" "text" NOT NULL,
    "location" "text" NOT NULL,
    "source" "text" DEFAULT 'both'::"text" NOT NULL,
    "icon" "text" DEFAULT '🔍'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "search_profiles_source_check" CHECK (("source" = ANY (ARRAY['dice'::"text", 'indeed'::"text", 'both'::"text", 'dice_contract'::"text"])))
);


ALTER TABLE "public"."search_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "profiles_used" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "total_results" integer DEFAULT 0 NOT NULL,
    "indeed_count" integer DEFAULT 0 NOT NULL,
    "dice_count" integer DEFAULT 0 NOT NULL,
    "new_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."search_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "skill_name" "text" NOT NULL,
    "mention_count" integer DEFAULT 1 NOT NULL,
    "application_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "in_resume" boolean DEFAULT false NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."skill_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skills_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "skill_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "weight" double precision DEFAULT 1.0,
    "years_experience" integer,
    "aliases" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "skills_inventory_category_check" CHECK (("category" = ANY (ARRAY['core'::"text", 'strong'::"text", 'growing'::"text", 'familiar'::"text"])))
);


ALTER TABLE "public"."skills_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "course_code" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "domain" "text",
    "provider" "text",
    "status" "text" DEFAULT 'not-started'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "target_exam_date" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "total_modules" integer DEFAULT 0,
    "total_sections" integer DEFAULT 0,
    "completed_sections" integer DEFAULT 0,
    "overall_progress" numeric(5,2) DEFAULT 0,
    "vault_path" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_courses_status_check" CHECK (("status" = ANY (ARRAY['not-started'::"text", 'in-progress'::"text", 'complete'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."training_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "module_number" integer NOT NULL,
    "module_title" "text",
    "section_number" "text" NOT NULL,
    "section_title" "text",
    "exam_weight" "text",
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "quiz_score" integer,
    "quiz_attempts" integer DEFAULT 0,
    "best_score" integer,
    "weak_areas" "jsonb" DEFAULT '[]'::"jsonb",
    "session_links" "jsonb" DEFAULT '[]'::"jsonb",
    "next_review_at" timestamp with time zone,
    "review_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "url" "text",
    "resource_type" "text",
    "section_number" "text",
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_resources_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['book'::"text", 'video'::"text", 'article'::"text", 'lab'::"text", 'ms-learn'::"text", 'vault-note'::"text", 'pdf'::"text", 'course'::"text"])))
);


ALTER TABLE "public"."training_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "session_mode" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_minutes" integer,
    "sections_covered" "jsonb" DEFAULT '[]'::"jsonb",
    "topics_covered" "jsonb" DEFAULT '[]'::"jsonb",
    "quiz_results" "jsonb",
    "vault_path" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_sessions_session_mode_check" CHECK (("session_mode" = ANY (ARRAY['study'::"text", 'quiz'::"text", 'lab'::"text", 'review'::"text"])))
);


ALTER TABLE "public"."training_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "last_email_scan" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_events"
    ADD CONSTRAINT "application_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_apply_log"
    ADD CONSTRAINT "auto_apply_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_apply_queue"
    ADD CONSTRAINT "auto_apply_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_apply_settings"
    ADD CONSTRAINT "auto_apply_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_apply_settings"
    ADD CONSTRAINT "auto_apply_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."career_context"
    ADD CONSTRAINT "career_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_briefs"
    ADD CONSTRAINT "company_briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debriefs"
    ADD CONSTRAINT "debriefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_application_links"
    ADD CONSTRAINT "email_application_links_pkey" PRIMARY KEY ("email_id", "application_id");



ALTER TABLE ONLY "public"."email_job_suggestions"
    ADD CONSTRAINT "email_job_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interview_coaching"
    ADD CONSTRAINT "interview_coaching_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interview_prep"
    ADD CONSTRAINT "interview_prep_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_details_cache"
    ADD CONSTRAINT "job_details_cache_job_url_key" UNIQUE ("job_url");



ALTER TABLE ONLY "public"."job_details_cache"
    ADD CONSTRAINT "job_details_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_metadata"
    ADD CONSTRAINT "scan_metadata_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scan_results"
    ADD CONSTRAINT "scan_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screening_answers"
    ADD CONSTRAINT "screening_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_cache"
    ADD CONSTRAINT "search_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_profiles"
    ADD CONSTRAINT "search_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_runs"
    ADD CONSTRAINT "search_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_mentions"
    ADD CONSTRAINT "skill_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_mentions"
    ADD CONSTRAINT "skill_mentions_user_id_skill_name_key" UNIQUE ("user_id", "skill_name");



ALTER TABLE ONLY "public"."skills_inventory"
    ADD CONSTRAINT "skills_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_courses"
    ADD CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_courses"
    ADD CONSTRAINT "training_courses_user_id_course_code_key" UNIQUE ("user_id", "course_code");



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_course_id_section_number_key" UNIQUE ("course_id", "section_number");



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_resources"
    ADD CONSTRAINT "training_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_activity_user" ON "public"."activity_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_application_events_app_id" ON "public"."application_events" USING "btree" ("application_id");



CREATE INDEX "idx_application_events_created" ON "public"."application_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_apps_date" ON "public"."applications" USING "btree" ("date_found" DESC);



CREATE INDEX "idx_apps_status" ON "public"."applications" USING "btree" ("status");



CREATE INDEX "idx_apps_user" ON "public"."applications" USING "btree" ("user_id");



CREATE INDEX "idx_auto_apply_log_created" ON "public"."auto_apply_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_auto_apply_log_queue" ON "public"."auto_apply_log" USING "btree" ("queue_id");



CREATE INDEX "idx_auto_apply_queue_score" ON "public"."auto_apply_queue" USING "btree" ("fit_score" DESC);



CREATE INDEX "idx_auto_apply_queue_user_status" ON "public"."auto_apply_queue" USING "btree" ("user_id", "status");



CREATE INDEX "idx_cache_user" ON "public"."search_cache" USING "btree" ("user_id", "searched_at" DESC);



CREATE INDEX "idx_career_context_user_id" ON "public"."career_context" USING "btree" ("user_id");



CREATE INDEX "idx_coaching_application" ON "public"."interview_coaching" USING "btree" ("application_id");



CREATE INDEX "idx_coaching_user" ON "public"."interview_coaching" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_company_briefs_application" ON "public"."company_briefs" USING "btree" ("application_id");



CREATE INDEX "idx_company_briefs_user" ON "public"."company_briefs" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_application" ON "public"."conversations" USING "btree" ("application_id");



CREATE INDEX "idx_conversations_date" ON "public"."conversations" USING "btree" ("date" DESC);



CREATE INDEX "idx_conversations_type" ON "public"."conversations" USING "btree" ("conversation_type");



CREATE INDEX "idx_conversations_user" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_debriefs_application" ON "public"."debriefs" USING "btree" ("application_id");



CREATE INDEX "idx_debriefs_user" ON "public"."debriefs" USING "btree" ("user_id");



CREATE INDEX "idx_eal_application_id" ON "public"."email_application_links" USING "btree" ("application_id");



CREATE INDEX "idx_emails_auto_track_status" ON "public"."emails" USING "btree" ("auto_track_status") WHERE ("auto_track_status" IS NULL);



CREATE INDEX "idx_emails_category" ON "public"."emails" USING "btree" ("category");



CREATE INDEX "idx_emails_from_domain" ON "public"."emails" USING "btree" ("from_domain");



CREATE INDEX "idx_emails_from_email" ON "public"."emails" USING "btree" ("from_email");



CREATE INDEX "idx_emails_received_at" ON "public"."emails" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_emails_suggestions" ON "public"."emails" USING "btree" ("suggestions_extracted") WHERE ("suggestions_extracted" = false);



CREATE INDEX "idx_emails_thread_id" ON "public"."emails" USING "btree" ("thread_id");



CREATE UNIQUE INDEX "idx_emails_user_gmail" ON "public"."emails" USING "btree" ("user_id", "gmail_id");



CREATE INDEX "idx_emails_user_id" ON "public"."emails" USING "btree" ("user_id");



CREATE INDEX "idx_interview_prep_application" ON "public"."interview_prep" USING "btree" ("application_id");



CREATE UNIQUE INDEX "idx_interview_prep_stage" ON "public"."interview_prep" USING "btree" ("application_id", "stage");



CREATE INDEX "idx_interview_prep_user" ON "public"."interview_prep" USING "btree" ("user_id");



CREATE INDEX "idx_job_details_cache_url" ON "public"."job_details_cache" USING "btree" ("job_url");



CREATE INDEX "idx_job_details_cache_user" ON "public"."job_details_cache" USING "btree" ("user_id");



CREATE INDEX "idx_scan_results_date" ON "public"."scan_results" USING "btree" ("scan_date" DESC);



CREATE UNIQUE INDEX "idx_scan_results_dedup" ON "public"."scan_results" USING "btree" (COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"("title"), "lower"("company"), "scan_date");



CREATE INDEX "idx_scan_results_user_date" ON "public"."scan_results" USING "btree" ("user_id", "scan_date" DESC);



CREATE INDEX "idx_search_cache_run_id" ON "public"."search_cache" USING "btree" ("search_run_id");



CREATE INDEX "idx_search_profiles_sort" ON "public"."search_profiles" USING "btree" ("sort_order");



CREATE INDEX "idx_search_runs_user_created" ON "public"."search_runs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_skill_mentions_count" ON "public"."skill_mentions" USING "btree" ("user_id", "mention_count" DESC);



CREATE INDEX "idx_skill_mentions_user" ON "public"."skill_mentions" USING "btree" ("user_id");



CREATE INDEX "idx_skills_inventory_category" ON "public"."skills_inventory" USING "btree" ("category");



CREATE INDEX "idx_skills_inventory_user" ON "public"."skills_inventory" USING "btree" ("user_id");



CREATE INDEX "idx_suggestions_created" ON "public"."email_job_suggestions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_suggestions_email_id" ON "public"."email_job_suggestions" USING "btree" ("email_id");



CREATE INDEX "idx_suggestions_status" ON "public"."email_job_suggestions" USING "btree" ("status");



CREATE INDEX "idx_training_progress_course" ON "public"."training_progress" USING "btree" ("course_id");



CREATE INDEX "idx_training_progress_review" ON "public"."training_progress" USING "btree" ("next_review_at") WHERE ("next_review_at" IS NOT NULL);



CREATE INDEX "idx_training_resources_course" ON "public"."training_resources" USING "btree" ("course_id");



CREATE INDEX "idx_training_sessions_course" ON "public"."training_sessions" USING "btree" ("course_id");



CREATE INDEX "idx_training_sessions_date" ON "public"."training_sessions" USING "btree" ("started_at" DESC);



CREATE OR REPLACE TRIGGER "applications_updated" BEFORE UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_updated" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "emails_updated" BEFORE UPDATE ON "public"."emails" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "training_courses_updated_at" BEFORE UPDATE ON "public"."training_courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_training_updated_at"();



CREATE OR REPLACE TRIGGER "training_progress_updated_at" BEFORE UPDATE ON "public"."training_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_training_updated_at"();



CREATE OR REPLACE TRIGGER "training_resources_updated_at" BEFORE UPDATE ON "public"."training_resources" FOR EACH ROW EXECUTE FUNCTION "public"."update_training_updated_at"();



CREATE OR REPLACE TRIGGER "user_settings_updated" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_events"
    ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_events"
    ADD CONSTRAINT "application_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auto_apply_log"
    ADD CONSTRAINT "auto_apply_log_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."auto_apply_log"
    ADD CONSTRAINT "auto_apply_log_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."auto_apply_queue"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."auto_apply_log"
    ADD CONSTRAINT "auto_apply_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auto_apply_queue"
    ADD CONSTRAINT "auto_apply_queue_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id");



ALTER TABLE ONLY "public"."auto_apply_queue"
    ADD CONSTRAINT "auto_apply_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auto_apply_settings"
    ADD CONSTRAINT "auto_apply_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."career_context"
    ADD CONSTRAINT "career_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_briefs"
    ADD CONSTRAINT "company_briefs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_briefs"
    ADD CONSTRAINT "company_briefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."debriefs"
    ADD CONSTRAINT "debriefs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debriefs"
    ADD CONSTRAINT "debriefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_application_links"
    ADD CONSTRAINT "email_application_links_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_application_links"
    ADD CONSTRAINT "email_application_links_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_application_links"
    ADD CONSTRAINT "email_application_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_job_suggestions"
    ADD CONSTRAINT "email_job_suggestions_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_suggested_application_id_fkey" FOREIGN KEY ("suggested_application_id") REFERENCES "public"."applications"("id");



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_coaching"
    ADD CONSTRAINT "interview_coaching_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_coaching"
    ADD CONSTRAINT "interview_coaching_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."interview_prep"
    ADD CONSTRAINT "interview_prep_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_prep"
    ADD CONSTRAINT "interview_prep_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_details_cache"
    ADD CONSTRAINT "job_details_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_metadata"
    ADD CONSTRAINT "scan_metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."scan_results"
    ADD CONSTRAINT "scan_results_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."search_profiles"("id");



ALTER TABLE ONLY "public"."scan_results"
    ADD CONSTRAINT "scan_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."screening_answers"
    ADD CONSTRAINT "screening_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_cache"
    ADD CONSTRAINT "search_cache_search_run_id_fkey" FOREIGN KEY ("search_run_id") REFERENCES "public"."search_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."search_cache"
    ADD CONSTRAINT "search_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_runs"
    ADD CONSTRAINT "search_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skill_mentions"
    ADD CONSTRAINT "skill_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."skills_inventory"
    ADD CONSTRAINT "skills_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_progress"
    ADD CONSTRAINT "training_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_resources"
    ADD CONSTRAINT "training_resources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Service role full access" ON "public"."scan_results" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access courses" ON "public"."training_courses" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on metadata" ON "public"."scan_metadata" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access progress" ON "public"."training_progress" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access resources" ON "public"."training_resources" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access sessions" ON "public"."training_sessions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can delete own runs" ON "public"."search_runs" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own events" ON "public"."application_events" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own runs" ON "public"."search_runs" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert own scan results" ON "public"."scan_results" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own coaching" ON "public"."interview_coaching" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage own courses" ON "public"."training_courses" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own progress" ON "public"."training_progress" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own resources" ON "public"."training_resources" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own sessions" ON "public"."training_sessions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own answers" ON "public"."screening_answers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own settings" ON "public"."auto_apply_settings" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage their own skills" ON "public"."skills_inventory" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own scan results" ON "public"."scan_results" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own events" ON "public"."application_events" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own runs" ON "public"."search_runs" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own scan metadata" ON "public"."scan_metadata" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own scan results" ON "public"."scan_results" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own logs" ON "public"."auto_apply_log" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own activity" ON "public"."activity_log" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own applications" ON "public"."applications" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own briefs" ON "public"."company_briefs" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own cache" ON "public"."search_cache" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own conversations" ON "public"."conversations" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own debriefs" ON "public"."debriefs" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own email links" ON "public"."email_application_links" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own emails" ON "public"."emails" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own prep" ON "public"."interview_prep" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own queue items" ON "public"."auto_apply_queue" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own settings" ON "public"."user_settings" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own skill mentions" ON "public"."skill_mentions" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users own suggestions" ON "public"."email_job_suggestions" USING (("email_id" IN ( SELECT "emails"."id"
   FROM "public"."emails"
  WHERE ("emails"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("email_id" IN ( SELECT "emails"."id"
   FROM "public"."emails"
  WHERE ("emails"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users read own context" ON "public"."career_context" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own cache" ON "public"."job_details_cache" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users update own context" ON "public"."career_context" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users write own context" ON "public"."career_context" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."application_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_apply_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_apply_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_apply_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."career_context" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_briefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debriefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_application_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_job_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interview_coaching" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interview_prep" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_details_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scan_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."screening_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "search_profiles_delete" ON "public"."search_profiles" FOR DELETE USING (("is_default" = false));



CREATE POLICY "search_profiles_insert" ON "public"."search_profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "search_profiles_select" ON "public"."search_profiles" FOR SELECT USING (true);



CREATE POLICY "search_profiles_update" ON "public"."search_profiles" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."search_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skill_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skills_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."applications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."auto_apply_queue";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."career_context";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_training_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_training_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_training_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."application_events" TO "anon";
GRANT ALL ON TABLE "public"."application_events" TO "authenticated";
GRANT ALL ON TABLE "public"."application_events" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."auto_apply_log" TO "anon";
GRANT ALL ON TABLE "public"."auto_apply_log" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_apply_log" TO "service_role";



GRANT ALL ON TABLE "public"."auto_apply_queue" TO "anon";
GRANT ALL ON TABLE "public"."auto_apply_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_apply_queue" TO "service_role";



GRANT ALL ON TABLE "public"."auto_apply_settings" TO "anon";
GRANT ALL ON TABLE "public"."auto_apply_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_apply_settings" TO "service_role";



GRANT ALL ON TABLE "public"."career_context" TO "anon";
GRANT ALL ON TABLE "public"."career_context" TO "authenticated";
GRANT ALL ON TABLE "public"."career_context" TO "service_role";



GRANT ALL ON TABLE "public"."company_briefs" TO "anon";
GRANT ALL ON TABLE "public"."company_briefs" TO "authenticated";
GRANT ALL ON TABLE "public"."company_briefs" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."debriefs" TO "anon";
GRANT ALL ON TABLE "public"."debriefs" TO "authenticated";
GRANT ALL ON TABLE "public"."debriefs" TO "service_role";



GRANT ALL ON TABLE "public"."email_application_links" TO "anon";
GRANT ALL ON TABLE "public"."email_application_links" TO "authenticated";
GRANT ALL ON TABLE "public"."email_application_links" TO "service_role";



GRANT ALL ON TABLE "public"."email_job_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."email_job_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."email_job_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."emails" TO "anon";
GRANT ALL ON TABLE "public"."emails" TO "authenticated";
GRANT ALL ON TABLE "public"."emails" TO "service_role";



GRANT ALL ON TABLE "public"."interview_coaching" TO "anon";
GRANT ALL ON TABLE "public"."interview_coaching" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_coaching" TO "service_role";



GRANT ALL ON TABLE "public"."interview_prep" TO "anon";
GRANT ALL ON TABLE "public"."interview_prep" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_prep" TO "service_role";



GRANT ALL ON TABLE "public"."job_details_cache" TO "anon";
GRANT ALL ON TABLE "public"."job_details_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."job_details_cache" TO "service_role";



GRANT ALL ON TABLE "public"."scan_metadata" TO "anon";
GRANT ALL ON TABLE "public"."scan_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."scan_results" TO "anon";
GRANT ALL ON TABLE "public"."scan_results" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_results" TO "service_role";



GRANT ALL ON TABLE "public"."screening_answers" TO "anon";
GRANT ALL ON TABLE "public"."screening_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."screening_answers" TO "service_role";



GRANT ALL ON TABLE "public"."search_cache" TO "anon";
GRANT ALL ON TABLE "public"."search_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."search_cache" TO "service_role";



GRANT ALL ON TABLE "public"."search_profiles" TO "anon";
GRANT ALL ON TABLE "public"."search_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."search_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."search_runs" TO "anon";
GRANT ALL ON TABLE "public"."search_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."search_runs" TO "service_role";



GRANT ALL ON TABLE "public"."skill_mentions" TO "anon";
GRANT ALL ON TABLE "public"."skill_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."skills_inventory" TO "anon";
GRANT ALL ON TABLE "public"."skills_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."skills_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."training_courses" TO "anon";
GRANT ALL ON TABLE "public"."training_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."training_courses" TO "service_role";



GRANT ALL ON TABLE "public"."training_progress" TO "anon";
GRANT ALL ON TABLE "public"."training_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."training_progress" TO "service_role";



GRANT ALL ON TABLE "public"."training_resources" TO "anon";
GRANT ALL ON TABLE "public"."training_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."training_resources" TO "service_role";



GRANT ALL ON TABLE "public"."training_sessions" TO "anon";
GRANT ALL ON TABLE "public"."training_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


  create policy "Users can delete their own cover letters"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'cover-letters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can delete their own resumes"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'resumes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can read their own cover letters"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'cover-letters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can read their own resumes"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'resumes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload their own cover letters"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'cover-letters'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload their own resumes"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'resumes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



