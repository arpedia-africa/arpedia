
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "account_deletions": {
                  Row: {
                    "blocked_reason": string | null,"completed_at": string | null,"erase_after": string,"grace_until": string | null,"id": string,"reason": string | null,"requested_at": string,"requested_by": string | null,"requested_via": string,"status": Database["public"]['Enums']["deletion_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_reason"?: string | null,"completed_at"?: string | null,"erase_after"?: string,"grace_until"?: string | null,"id"?: string,"reason"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"requested_via": string,"status"?: Database["public"]['Enums']["deletion_status"],"user_id": string
                  }
                  Update: {
                    "blocked_reason"?: string | null,"completed_at"?: string | null,"erase_after"?: string,"grace_until"?: string | null,"id"?: string,"reason"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"requested_via"?: string,"status"?: Database["public"]['Enums']["deletion_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_deletions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_deletions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"analytics_daily": {
                  Row: {
                    "day": string,"dim": NonNullable<Json>,"metric": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"dim"?: NonNullable<Json>,"metric": string,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "day"?: string,"dim"?: NonNullable<Json>,"metric"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"anchor_migrations": {
                  Row: {
                    "base_revision_id": string,"method": Database["public"]['Enums']["anchor_method"],"nearest_para_id": string | null,"new_para_id": string | null,"new_revision_id": string,"old_para_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_revision_id": string,"method": Database["public"]['Enums']["anchor_method"],"nearest_para_id"?: string | null,"new_para_id"?: string | null,"new_revision_id": string,"old_para_id": string
                  }
                  Update: {
                    "base_revision_id"?: string,"method"?: Database["public"]['Enums']["anchor_method"],"nearest_para_id"?: string | null,"new_para_id"?: string | null,"new_revision_id"?: string,"old_para_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "anchor_migrations_base_revision_id_fkey"
      columns: ["base_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "anchor_migrations_new_revision_id_fkey"
      columns: ["new_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"annotations": {
                  Row: {
                    "book_id": string,"cfi_range": string,"chapter_uid": string | null,"client_id": string,"color": string | null,"created_at": string,"deleted_at": string | null,"end_char": number,"end_para_id": string | null,"id": string,"kind": string,"moved": boolean,"note_text": string | null,"quote": string | null,"revision_id": string | null,"shared_group_id": string | null,"start_char": number,"start_para_id": string | null,"updated_at": string,"user_id": string,"visibility": string,"_annotation_json": Json | null
                  }
                  ComputedFields: "_annotation_json"
                  Insert: {
                    "book_id": string,"cfi_range": string,"chapter_uid"?: string | null,"client_id": string,"color"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"end_char"?: number,"end_para_id"?: string | null,"id"?: string,"kind": string,"moved"?: boolean,"note_text"?: string | null,"quote"?: string | null,"revision_id"?: string | null,"shared_group_id"?: string | null,"start_char"?: number,"start_para_id"?: string | null,"updated_at"?: string,"user_id": string,"visibility"?: string
                  }
                  Update: {
                    "book_id"?: string,"cfi_range"?: string,"chapter_uid"?: string | null,"client_id"?: string,"color"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"end_char"?: number,"end_para_id"?: string | null,"id"?: string,"kind"?: string,"moved"?: boolean,"note_text"?: string | null,"quote"?: string | null,"revision_id"?: string | null,"shared_group_id"?: string | null,"start_char"?: number,"start_para_id"?: string | null,"updated_at"?: string,"user_id"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "annotations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "annotations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "annotations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "annotations_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "annotations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "annotations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_config_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_config_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"appeals": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"due_at": string,"id": string,"original_decider": string | null,"reduce_to_days": number | null,"status": Database["public"]['Enums']["appeal_status"],"subject_id": string,"subject_type": Database["public"]['Enums']["appeal_subject"],"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"due_at"?: string,"id"?: string,"original_decider"?: string | null,"reduce_to_days"?: number | null,"status"?: Database["public"]['Enums']["appeal_status"],"subject_id": string,"subject_type": Database["public"]['Enums']["appeal_subject"],"text": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"due_at"?: string,"id"?: string,"original_decider"?: string | null,"reduce_to_days"?: number | null,"status"?: Database["public"]['Enums']["appeal_status"],"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["appeal_subject"],"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appeals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_original_decider_fkey"
      columns: ["original_decider"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_original_decider_fkey"
      columns: ["original_decider"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_requests": {
                  Row: {
                    "approver_id": string | null,"created_at": string,"decided_at": string | null,"expires_at": string,"id": string,"kind": string,"payload": NonNullable<Json>,"reason": string | null,"requested_by": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"expires_at"?: string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"reason"?: string | null,"requested_by": string,"status"?: string
                  }
                  Update: {
                    "approver_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"expires_at"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"reason"?: string | null,"requested_by"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_name": string | null,"actor_role": Database["public"]['Enums']["staff_role"] | null,"after": Json | null,"area": string,"at": string,"before": Json | null,"device": string | null,"id": number,"ip": unknown,"mfa_verified_at": string | null,"object_id": string | null,"object_label": string | null,"object_type": string | null,"reason": string | null,"request_id": string | null,"retain_until": string,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_name"?: string | null,"actor_role"?: Database["public"]['Enums']["staff_role"] | null,"after"?: Json | null,"area": string,"at"?: string,"before"?: Json | null,"device"?: string | null,"id"?: never,"ip"?: unknown,"mfa_verified_at"?: string | null,"object_id"?: string | null,"object_label"?: string | null,"object_type"?: string | null,"reason"?: string | null,"request_id"?: string | null,"retain_until"?: string,"summary"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_name"?: string | null,"actor_role"?: Database["public"]['Enums']["staff_role"] | null,"after"?: Json | null,"area"?: string,"at"?: string,"before"?: Json | null,"device"?: string | null,"id"?: never,"ip"?: unknown,"mfa_verified_at"?: string | null,"object_id"?: string | null,"object_label"?: string | null,"object_type"?: string | null,"reason"?: string | null,"request_id"?: string | null,"retain_until"?: string,"summary"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"author_application_events": {
                  Row: {
                    "actor_id": string | null,"application_id": string,"created_at": string,"id": number,"kind": Database["public"]['Enums']["application_event_kind"],"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"application_id": string,"created_at"?: string,"id"?: never,"kind": Database["public"]['Enums']["application_event_kind"],"note"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"application_id"?: string,"created_at"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["application_event_kind"],"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_application_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_application_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "author_applications"
      referencedColumns: ["id"]
    }
                  ]
                },"author_applications": {
                  Row: {
                    "agreement_accepted_at": string | null,"agreement_version": number | null,"assigned_to": string | null,"bio": string,"categories": (string)[],"checks": NonNullable<Json>,"created_at": string,"date_of_birth": string | null,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"email": string,"experience": string,"id": string,"info_request": string | null,"info_step": number | null,"legacy": boolean,"legal_name": string,"pen_name": string | null,"phone": string | null,"reapply_after": string | null,"sample_excerpt": string | null,"sample_file_key": string | null,"sample_file_name": string | null,"sample_pages": number | null,"sample_text": string | null,"sla_alerted_at": string | null,"social_handle": string | null,"state": string | null,"status": Database["public"]['Enums']["application_status"],"step_reached": number,"submitted_at": string | null,"updated_at": string,"user_id": string,"_applicant_view": {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            } | null
                  }
                  ComputedFields: "_applicant_view"
                  Insert: {
                    "agreement_accepted_at"?: string | null,"agreement_version"?: number | null,"assigned_to"?: string | null,"bio"?: string,"categories"?: (string)[],"checks"?: NonNullable<Json>,"created_at"?: string,"date_of_birth"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"email"?: string,"experience"?: string,"id"?: string,"info_request"?: string | null,"info_step"?: number | null,"legacy"?: boolean,"legal_name"?: string,"pen_name"?: string | null,"phone"?: string | null,"reapply_after"?: string | null,"sample_excerpt"?: string | null,"sample_file_key"?: string | null,"sample_file_name"?: string | null,"sample_pages"?: number | null,"sample_text"?: string | null,"sla_alerted_at"?: string | null,"social_handle"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"step_reached"?: number,"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "agreement_accepted_at"?: string | null,"agreement_version"?: number | null,"assigned_to"?: string | null,"bio"?: string,"categories"?: (string)[],"checks"?: NonNullable<Json>,"created_at"?: string,"date_of_birth"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"email"?: string,"experience"?: string,"id"?: string,"info_request"?: string | null,"info_step"?: number | null,"legacy"?: boolean,"legal_name"?: string,"pen_name"?: string | null,"phone"?: string | null,"reapply_after"?: string | null,"sample_excerpt"?: string | null,"sample_file_key"?: string | null,"sample_file_name"?: string | null,"sample_pages"?: number | null,"sample_text"?: string | null,"sla_alerted_at"?: string | null,"social_handle"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"step_reached"?: number,"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_applications_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_applications_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_applications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_applications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_applications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_applications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_bank_accounts": {
                  Row: {
                    "account_last4": string,"account_number_enc": string,"author_id": string,"bank_account_name": string,"bank_code": string,"bank_name": string,"created_at": string,"document_requested_at": string | null,"id": string,"id_document_key": string | null,"legal_name": string,"match_score": number,"payouts_resume_at": string,"rejected_reason": string | null,"status": Database["public"]['Enums']["bank_account_status"],"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_last4": string,"account_number_enc": string,"author_id": string,"bank_account_name": string,"bank_code": string,"bank_name": string,"created_at"?: string,"document_requested_at"?: string | null,"id"?: string,"id_document_key"?: string | null,"legal_name"?: string,"match_score": number,"payouts_resume_at": string,"rejected_reason"?: string | null,"status": Database["public"]['Enums']["bank_account_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "account_last4"?: string,"account_number_enc"?: string,"author_id"?: string,"bank_account_name"?: string,"bank_code"?: string,"bank_name"?: string,"created_at"?: string,"document_requested_at"?: string | null,"id"?: string,"id_document_key"?: string | null,"legal_name"?: string,"match_score"?: number,"payouts_resume_at"?: string,"rejected_reason"?: string | null,"status"?: Database["public"]['Enums']["bank_account_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_bank_accounts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_bank_accounts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_bank_accounts_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_bank_accounts_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_earnings": {
                  Row: {
                    "adjustment_kobo": number,"amount_kobo": number,"author_id": string,"book_credits": number,"carried_to": string | null,"carry_in_kobo": number,"created_at": string,"cycle_id": string,"excluded_credits": number,"held_reason": string | null,"id": string,"payable_kobo": number,"status": Database["public"]['Enums']["author_earning_status"],"tip_message_credits": number
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_kobo"?: number,"amount_kobo"?: number,"author_id": string,"book_credits"?: number,"carried_to"?: string | null,"carry_in_kobo"?: number,"created_at"?: string,"cycle_id": string,"excluded_credits"?: number,"held_reason"?: string | null,"id"?: string,"payable_kobo"?: number,"status": Database["public"]['Enums']["author_earning_status"],"tip_message_credits"?: number
                  }
                  Update: {
                    "adjustment_kobo"?: number,"amount_kobo"?: number,"author_id"?: string,"book_credits"?: number,"carried_to"?: string | null,"carry_in_kobo"?: number,"created_at"?: string,"cycle_id"?: string,"excluded_credits"?: number,"held_reason"?: string | null,"id"?: string,"payable_kobo"?: number,"status"?: Database["public"]['Enums']["author_earning_status"],"tip_message_credits"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_earnings_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_earnings_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_earnings_carried_to_fkey"
      columns: ["carried_to"]
isOneToOne: false
      referencedRelation: "author_earnings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_earnings_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "earning_cycles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_posts": {
                  Row: {
                    "author_id": string,"body": string,"comment_count": number,"created_at": string,"id": string,"like_count": number,"published_at": string | null,"state": Database["public"]['Enums']["post_state"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"comment_count"?: number,"created_at"?: string,"id"?: string,"like_count"?: number,"published_at"?: string | null,"state"?: Database["public"]['Enums']["post_state"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"comment_count"?: number,"created_at"?: string,"id"?: string,"like_count"?: number,"published_at"?: string | null,"state"?: Database["public"]['Enums']["post_state"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_profiles": {
                  Row: {
                    "application_id": string | null,"approved_at": string,"bio": string,"club_group_id": string | null,"created_at": string,"legal_name": string,"location": string | null,"payee_type": Database["public"]['Enums']["payee_type"],"payouts_paused": boolean,"payouts_paused_reason": string | null,"pen_name": string,"photo_url": string | null,"status": Database["public"]['Enums']["author_status"],"suspended_reason": string | null,"updated_at": string,"user_id": string,"visibility": Database["public"]['Enums']["author_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"approved_at"?: string,"bio"?: string,"club_group_id"?: string | null,"created_at"?: string,"legal_name"?: string,"location"?: string | null,"payee_type"?: Database["public"]['Enums']["payee_type"],"payouts_paused"?: boolean,"payouts_paused_reason"?: string | null,"pen_name": string,"photo_url"?: string | null,"status"?: Database["public"]['Enums']["author_status"],"suspended_reason"?: string | null,"updated_at"?: string,"user_id": string,"visibility"?: Database["public"]['Enums']["author_visibility"]
                  }
                  Update: {
                    "application_id"?: string | null,"approved_at"?: string,"bio"?: string,"club_group_id"?: string | null,"created_at"?: string,"legal_name"?: string,"location"?: string | null,"payee_type"?: Database["public"]['Enums']["payee_type"],"payouts_paused"?: boolean,"payouts_paused_reason"?: string | null,"pen_name"?: string,"photo_url"?: string | null,"status"?: Database["public"]['Enums']["author_status"],"suspended_reason"?: string | null,"updated_at"?: string,"user_id"?: string,"visibility"?: Database["public"]['Enums']["author_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_profiles_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "author_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_profiles_club_group_id_fkey"
      columns: ["club_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_statements": {
                  Row: {
                    "author_id": string,"created_at": string,"cycle_id": string | null,"file_key": string,"id": string,"kind": Database["public"]['Enums']["statement_kind"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"created_at"?: string,"cycle_id"?: string | null,"file_key": string,"id"?: string,"kind": Database["public"]['Enums']["statement_kind"]
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"cycle_id"?: string | null,"file_key"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["statement_kind"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_statements_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_statements_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_statements_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "earning_cycles"
      referencedColumns: ["id"]
    }
                  ]
                },"author_stats": {
                  Row: {
                    "author_id": string,"avg_rating": number | null,"follower_count": number,"median_reply_hours": number | null,"rating_count": number,"reader_count": number,"reply_sample_size": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"avg_rating"?: number | null,"follower_count"?: number,"median_reply_hours"?: number | null,"rating_count"?: number,"reader_count"?: number,"reply_sample_size"?: number,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"avg_rating"?: number | null,"follower_count"?: number,"median_reply_hours"?: number | null,"rating_count"?: number,"reader_count"?: number,"reply_sample_size"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "author_stats_author_id_fkey"
      columns: ["author_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "author_stats_author_id_fkey"
      columns: ["author_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"automod_hits": {
                  Row: {
                    "at": string,"word_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"word_id": string
                  }
                  Update: {
                    "at"?: string,"word_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automod_hits_word_id_fkey"
      columns: ["word_id"]
isOneToOne: false
      referencedRelation: "automod_words"
      referencedColumns: ["id"]
    }
                  ]
                },"automod_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "automod_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automod_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"automod_words": {
                  Row: {
                    "action": string,"category": string,"created_at": string,"created_by": string | null,"id": string,"is_phrase": boolean,"scope": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_phrase"?: boolean,"scope"?: string,"text": string
                  }
                  Update: {
                    "action"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_phrase"?: boolean,"scope"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automod_words_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automod_words_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"banned_tags": {
                  Row: {
                    "created_at": string,"created_by": string | null,"word": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"word": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "banned_tags_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banned_tags_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"banner_daily": {
                  Row: {
                    "banner_id": string,"day": string,"shown": number,"taps": number
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_id": string,"day": string,"shown"?: number,"taps"?: number
                  }
                  Update: {
                    "banner_id"?: string,"day"?: string,"shown"?: number,"taps"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "banner_daily_banner_id_fkey"
      columns: ["banner_id"]
isOneToOne: false
      referencedRelation: "banners"
      referencedColumns: ["id"]
    }
                  ]
                },"banner_dismissals": {
                  Row: {
                    "banner_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "banner_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "banner_dismissals_banner_id_fkey"
      columns: ["banner_id"]
isOneToOne: false
      referencedRelation: "banners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banner_dismissals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banner_dismissals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"banner_modal_seen": {
                  Row: {
                    "banner_id": string,"day": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_id": string,"day": string,"user_id": string
                  }
                  Update: {
                    "banner_id"?: string,"day"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "banner_modal_seen_banner_id_fkey"
      columns: ["banner_id"]
isOneToOne: false
      referencedRelation: "banners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banner_modal_seen_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banner_modal_seen_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"banners": {
                  Row: {
                    "audience": NonNullable<Json>,"body": string,"button_label": string,"created_at": string,"created_by": string | null,"dismissible": boolean,"ends_at": string | null,"headline": string,"id": string,"image_url": string | null,"placement": Database["public"]['Enums']["banner_placement"],"priority": number,"starts_at": string | null,"state": Database["public"]['Enums']["banner_state"],"target": Json | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: NonNullable<Json>,"body"?: string,"button_label"?: string,"created_at"?: string,"created_by"?: string | null,"dismissible"?: boolean,"ends_at"?: string | null,"headline"?: string,"id"?: string,"image_url"?: string | null,"placement": Database["public"]['Enums']["banner_placement"],"priority"?: number,"starts_at"?: string | null,"state"?: Database["public"]['Enums']["banner_state"],"target"?: Json | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "audience"?: NonNullable<Json>,"body"?: string,"button_label"?: string,"created_at"?: string,"created_by"?: string | null,"dismissible"?: boolean,"ends_at"?: string | null,"headline"?: string,"id"?: string,"image_url"?: string | null,"placement"?: Database["public"]['Enums']["banner_placement"],"priority"?: number,"starts_at"?: string | null,"state"?: Database["public"]['Enums']["banner_state"],"target"?: Json | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "banners_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banners_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banners_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banners_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_fixes": {
                  Row: {
                    "created_at": string,"flag_id": string | null,"id": string,"inverse": NonNullable<Json>,"op": NonNullable<Json>,"revision_id": string,"staff_id": string | null,"undone_at": string | null,"work_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"flag_id"?: string | null,"id"?: string,"inverse": NonNullable<Json>,"op": NonNullable<Json>,"revision_id": string,"staff_id"?: string | null,"undone_at"?: string | null,"work_version": number
                  }
                  Update: {
                    "created_at"?: string,"flag_id"?: string | null,"id"?: string,"inverse"?: NonNullable<Json>,"op"?: NonNullable<Json>,"revision_id"?: string,"staff_id"?: string | null,"undone_at"?: string | null,"work_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_fixes_flag_id_fkey"
      columns: ["flag_id"]
isOneToOne: false
      referencedRelation: "book_flags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_fixes_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_fixes_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_fixes_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_flags": {
                  Row: {
                    "auto_fixable": boolean,"blocking": boolean,"check_key": string,"created_at": string,"dismiss_reason": string | null,"fix_op": Json | null,"fixed_by": string | null,"id": string,"location": NonNullable<Json>,"message": string,"revision_id": string,"severity": string,"source": Database["public"]['Enums']["flag_source"],"status": Database["public"]['Enums']["flag_status"],"suggestion": string | null,"updated_at": string,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_fixable"?: boolean,"blocking"?: boolean,"check_key": string,"created_at"?: string,"dismiss_reason"?: string | null,"fix_op"?: Json | null,"fixed_by"?: string | null,"id"?: string,"location"?: NonNullable<Json>,"message": string,"revision_id": string,"severity"?: string,"source"?: Database["public"]['Enums']["flag_source"],"status"?: Database["public"]['Enums']["flag_status"],"suggestion"?: string | null,"updated_at"?: string,"weight"?: number
                  }
                  Update: {
                    "auto_fixable"?: boolean,"blocking"?: boolean,"check_key"?: string,"created_at"?: string,"dismiss_reason"?: string | null,"fix_op"?: Json | null,"fixed_by"?: string | null,"id"?: string,"location"?: NonNullable<Json>,"message"?: string,"revision_id"?: string,"severity"?: string,"source"?: Database["public"]['Enums']["flag_source"],"status"?: Database["public"]['Enums']["flag_status"],"suggestion"?: string | null,"updated_at"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_flags_fixed_by_fkey"
      columns: ["fixed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_flags_fixed_by_fkey"
      columns: ["fixed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_flags_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"book_price_history": {
                  Row: {
                    "book_id": string,"created_at": string,"id": number,"kind": string,"new_credits": number | null,"old_credits": number | null,"reason": string | null,"revision_id": string | null,"staff_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: never,"kind": string,"new_credits"?: number | null,"old_credits"?: number | null,"reason"?: string | null,"revision_id"?: string | null,"staff_id"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: never,"kind"?: string,"new_credits"?: number | null,"old_credits"?: number | null,"reason"?: string | null,"revision_id"?: string | null,"staff_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_price_history_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_price_history_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_price_history_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_price_history_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_price_history_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_price_history_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_rankings": {
                  Row: {
                    "book_id": string,"kind": string,"rank": number,"readers_7d": number,"snapshot_at": string,"unlocks_7d": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"kind": string,"rank": number,"readers_7d"?: number,"snapshot_at": string,"unlocks_7d"?: number
                  }
                  Update: {
                    "book_id"?: string,"kind"?: string,"rank"?: number,"readers_7d"?: number,"snapshot_at"?: string,"unlocks_7d"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_rankings_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_rankings_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_rankings_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    }
                  ]
                },"book_rating_stats": {
                  Row: {
                    "avg": number,"book_id": string,"count": number,"h1": number,"h2": number,"h3": number,"h4": number,"h5": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avg"?: number,"book_id": string,"count"?: number,"h1"?: number,"h2"?: number,"h3"?: number,"h4"?: number,"h5"?: number
                  }
                  Update: {
                    "avg"?: number,"book_id"?: string,"count"?: number,"h1"?: number,"h2"?: number,"h3"?: number,"h4"?: number,"h5"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_rating_stats_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_rating_stats_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_rating_stats_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    }
                  ]
                },"book_related": {
                  Row: {
                    "book_id": string,"related_book_id": string,"score": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"related_book_id": string,"score": number
                  }
                  Update: {
                    "book_id"?: string,"related_book_id"?: string,"score"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_related_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_related_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_related_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_related_related_book_id_fkey"
      columns: ["related_book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_related_related_book_id_fkey"
      columns: ["related_book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_related_related_book_id_fkey"
      columns: ["related_book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    }
                  ]
                },"book_requests": {
                  Row: {
                    "book_id": string | null,"created_at": string,"fulfilled_at": string | null,"id": string,"query_norm": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id"?: string | null,"created_at"?: string,"fulfilled_at"?: string | null,"id"?: string,"query_norm": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string | null,"created_at"?: string,"fulfilled_at"?: string | null,"id"?: string,"query_norm"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_requests_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_requests_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_requests_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_revisions": {
                  Row: {
                    "age_rating": string | null,"anchors_moved": Json | null,"artifact_prefix": string | null,"assigned_to": string | null,"base_revision_id": string | null,"book_id": string,"chapters_confirmed_at": string | null,"content_notes": (string)[],"converted_key": string | null,"converted_sha256": string | null,"cover_key": string | null,"cover_sha256": string | null,"created_at": string,"created_via": Database["public"]['Enums']["revision_origin"],"desk_claimed_by": string | null,"desk_lease_until": string | null,"desk_reason": string | null,"draft_step": Database["public"]['Enums']["draft_step"] | null,"due_at": string | null,"fast_lane": boolean,"file_bytes": number | null,"free_through_ord": number,"generation": number,"id": string,"isbn": string | null,"language": string | null,"last_activity_at": string | null,"late_alerted_at": string | null,"manifest_key": string | null,"meta": NonNullable<Json>,"no_explicit": boolean,"notify_followers": boolean,"pages": number | null,"preview_cut_chapter_uid": string | null,"preview_cut_para_id": string | null,"preview_percent": number | null,"price_credits": number | null,"published_at": string | null,"published_by": string | null,"publisher": string | null,"readiness": number,"review_opened_at": string | null,"revision_no": number,"routed_at": string | null,"schedule_at": string | null,"sealed_generation": number | null,"sealed_work_version": number | null,"sent_back_note": string | null,"source_key": string | null,"source_sha256": string | null,"source_type": Database["public"]['Enums']["source_type"] | null,"status": Database["public"]['Enums']["revision_status"],"status_reason": string | null,"steps": NonNullable<Json>,"submitted_at": string | null,"updated_at": string,"uploaded_by": string | null,"words": number | null,"work_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "age_rating"?: string | null,"anchors_moved"?: Json | null,"artifact_prefix"?: string | null,"assigned_to"?: string | null,"base_revision_id"?: string | null,"book_id": string,"chapters_confirmed_at"?: string | null,"content_notes"?: (string)[],"converted_key"?: string | null,"converted_sha256"?: string | null,"cover_key"?: string | null,"cover_sha256"?: string | null,"created_at"?: string,"created_via"?: Database["public"]['Enums']["revision_origin"],"desk_claimed_by"?: string | null,"desk_lease_until"?: string | null,"desk_reason"?: string | null,"draft_step"?: Database["public"]['Enums']["draft_step"] | null,"due_at"?: string | null,"fast_lane"?: boolean,"file_bytes"?: number | null,"free_through_ord"?: number,"generation"?: number,"id"?: string,"isbn"?: string | null,"language"?: string | null,"last_activity_at"?: string | null,"late_alerted_at"?: string | null,"manifest_key"?: string | null,"meta"?: NonNullable<Json>,"no_explicit"?: boolean,"notify_followers"?: boolean,"pages"?: number | null,"preview_cut_chapter_uid"?: string | null,"preview_cut_para_id"?: string | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"published_by"?: string | null,"publisher"?: string | null,"readiness"?: number,"review_opened_at"?: string | null,"revision_no": number,"routed_at"?: string | null,"schedule_at"?: string | null,"sealed_generation"?: number | null,"sealed_work_version"?: number | null,"sent_back_note"?: string | null,"source_key"?: string | null,"source_sha256"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"status"?: Database["public"]['Enums']["revision_status"],"status_reason"?: string | null,"steps"?: NonNullable<Json>,"submitted_at"?: string | null,"updated_at"?: string,"uploaded_by"?: string | null,"words"?: number | null,"work_version"?: number
                  }
                  Update: {
                    "age_rating"?: string | null,"anchors_moved"?: Json | null,"artifact_prefix"?: string | null,"assigned_to"?: string | null,"base_revision_id"?: string | null,"book_id"?: string,"chapters_confirmed_at"?: string | null,"content_notes"?: (string)[],"converted_key"?: string | null,"converted_sha256"?: string | null,"cover_key"?: string | null,"cover_sha256"?: string | null,"created_at"?: string,"created_via"?: Database["public"]['Enums']["revision_origin"],"desk_claimed_by"?: string | null,"desk_lease_until"?: string | null,"desk_reason"?: string | null,"draft_step"?: Database["public"]['Enums']["draft_step"] | null,"due_at"?: string | null,"fast_lane"?: boolean,"file_bytes"?: number | null,"free_through_ord"?: number,"generation"?: number,"id"?: string,"isbn"?: string | null,"language"?: string | null,"last_activity_at"?: string | null,"late_alerted_at"?: string | null,"manifest_key"?: string | null,"meta"?: NonNullable<Json>,"no_explicit"?: boolean,"notify_followers"?: boolean,"pages"?: number | null,"preview_cut_chapter_uid"?: string | null,"preview_cut_para_id"?: string | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"published_by"?: string | null,"publisher"?: string | null,"readiness"?: number,"review_opened_at"?: string | null,"revision_no"?: number,"routed_at"?: string | null,"schedule_at"?: string | null,"sealed_generation"?: number | null,"sealed_work_version"?: number | null,"sent_back_note"?: string | null,"source_key"?: string | null,"source_sha256"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"status"?: Database["public"]['Enums']["revision_status"],"status_reason"?: string | null,"steps"?: NonNullable<Json>,"submitted_at"?: string | null,"updated_at"?: string,"uploaded_by"?: string | null,"words"?: number | null,"work_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_revisions_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_base_revision_id_fkey"
      columns: ["base_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_revisions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_desk_claimed_by_fkey"
      columns: ["desk_claimed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_desk_claimed_by_fkey"
      columns: ["desk_claimed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_revisions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"book_search_text": {
                  Row: {
                    "book_revision_id": string,"chapter_id": string | null,"id": number,"offset": number,"text": string,"tsv": unknown
                  }
                  ComputedFields: never
                  Insert: {
                    "book_revision_id": string,"chapter_id"?: string | null,"id"?: never,"offset"?: number,"text": string,"tsv"?: never
                  }
                  Update: {
                    "book_revision_id"?: string,"chapter_id"?: string | null,"id"?: never,"offset"?: number,"text"?: string,"tsv"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_search_text_book_revision_id_fkey"
      columns: ["book_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_search_text_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    }
                  ]
                },"book_tags": {
                  Row: {
                    "book_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"tag_id": string
                  }
                  Update: {
                    "book_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_tags_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "book_tags_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_tags_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "book_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"books": {
                  Row: {
                    "access_removed_at": string | null,"author_id": string,"claim_hold_at": string | null,"comments_count": number,"created_at": string,"current_revision_id": string | null,"description": string | null,"genres": (string)[],"id": string,"new_arrival_until": string | null,"preview_override_percent": number | null,"preview_override_reason": string | null,"price_override_credits": number | null,"price_override_reason": string | null,"reads_count": number,"status": Database["public"]['Enums']["book_status"],"subtitle": string | null,"tags": (string)[],"title": string,"unpublish_reason": Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_removed_at"?: string | null,"author_id": string,"claim_hold_at"?: string | null,"comments_count"?: number,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"preview_override_percent"?: number | null,"preview_override_reason"?: string | null,"price_override_credits"?: number | null,"price_override_reason"?: string | null,"reads_count"?: number,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"tags"?: (string)[],"title": string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_removed_at"?: string | null,"author_id"?: string,"claim_hold_at"?: string | null,"comments_count"?: number,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"preview_override_percent"?: number | null,"preview_override_reason"?: string | null,"price_override_credits"?: number | null,"price_override_reason"?: string | null,"reads_count"?: number,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"tags"?: (string)[],"title"?: string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "books_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "books_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "books_current_revision_fk"
      columns: ["current_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "ab_test": Json | null,"audience": NonNullable<Json>,"body": string,"confirmed_reach": number | null,"counts": NonNullable<Json>,"created_at": string,"created_by": string | null,"id": string,"is_service": boolean,"moved_from": string | null,"open_target": NonNullable<Json>,"quiet_override_reason": string | null,"reach": number | null,"resend_unopened": boolean,"respect_quiet": boolean,"review_requested_at": string | null,"reviewed_by": string | null,"send_at": string | null,"sent_at": string | null,"skip_capped": boolean,"source_campaign_id": string | null,"status": Database["public"]['Enums']["campaign_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ab_test"?: Json | null,"audience"?: NonNullable<Json>,"body"?: string,"confirmed_reach"?: number | null,"counts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_service"?: boolean,"moved_from"?: string | null,"open_target"?: NonNullable<Json>,"quiet_override_reason"?: string | null,"reach"?: number | null,"resend_unopened"?: boolean,"respect_quiet"?: boolean,"review_requested_at"?: string | null,"reviewed_by"?: string | null,"send_at"?: string | null,"sent_at"?: string | null,"skip_capped"?: boolean,"source_campaign_id"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ab_test"?: Json | null,"audience"?: NonNullable<Json>,"body"?: string,"confirmed_reach"?: number | null,"counts"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_service"?: boolean,"moved_from"?: string | null,"open_target"?: NonNullable<Json>,"quiet_override_reason"?: string | null,"reach"?: number | null,"resend_unopened"?: boolean,"respect_quiet"?: boolean,"review_requested_at"?: string | null,"reviewed_by"?: string | null,"send_at"?: string | null,"sent_at"?: string | null,"skip_capped"?: boolean,"source_campaign_id"?: string | null,"status"?: Database["public"]['Enums']["campaign_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_source_campaign_id_fkey"
      columns: ["source_campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"chapter_keys": {
                  Row: {
                    "chapter_uid": string | null,"created_at": string,"generation": number,"id": number,"key_version": number,"revision_id": string,"revoked_at": string | null,"wrapped_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chapter_uid"?: string | null,"created_at"?: string,"generation": number,"id"?: never,"key_version"?: number,"revision_id": string,"revoked_at"?: string | null,"wrapped_key": string
                  }
                  Update: {
                    "chapter_uid"?: string | null,"created_at"?: string,"generation"?: number,"id"?: never,"key_version"?: number,"revision_id"?: string,"revoked_at"?: string | null,"wrapped_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chapter_keys_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"chapters": {
                  Row: {
                    "chapter_uid": string,"free_file": string | null,"front": string | null,"full_file": string | null,"id": string,"kind": Database["public"]['Enums']["chapter_kind"],"ord": number,"pages": number,"parent_ord": number | null,"price_credits": number,"revision_id": string,"title": string,"words": number,"words_before": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chapter_uid"?: string,"free_file"?: string | null,"front"?: string | null,"full_file"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["chapter_kind"],"ord": number,"pages"?: number,"parent_ord"?: number | null,"price_credits"?: number,"revision_id": string,"title": string,"words"?: number,"words_before"?: number
                  }
                  Update: {
                    "chapter_uid"?: string,"free_file"?: string | null,"front"?: string | null,"full_file"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["chapter_kind"],"ord"?: number,"pages"?: number,"parent_ord"?: number | null,"price_credits"?: number,"revision_id"?: string,"title"?: string,"words"?: number,"words_before"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "chapters_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"coming_soon_entries": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"notify_count": number,"release_at": string | null,"teaser": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"notify_count"?: number,"release_at"?: string | null,"teaser"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"notify_count"?: number,"release_at"?: string | null,"teaser"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "coming_soon_entries_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "coming_soon_entries_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coming_soon_entries_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coming_soon_entries_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coming_soon_entries_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coming_soon_notify": {
                  Row: {
                    "created_at": string,"entry_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entry_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"entry_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coming_soon_notify_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "coming_soon_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coming_soon_notify_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coming_soon_notify_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_log": {
                  Row: {
                    "at": string,"granted": boolean,"id": number,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"granted": boolean,"id"?: never,"kind": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"granted"?: boolean,"id"?: never,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"copyright_claims": {
                  Row: {
                    "author_due_at": string | null,"author_response": string | null,"book_id": string,"claimant_contact": string | null,"claimant_id": string | null,"claimant_name": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"details": string | null,"due_at": string,"evidence": NonNullable<Json>,"id": string,"ref": string,"report_id": string | null,"similarity": Json | null,"status": Database["public"]['Enums']["claim_status"],"type": Database["public"]['Enums']["claim_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_due_at"?: string | null,"author_response"?: string | null,"book_id": string,"claimant_contact"?: string | null,"claimant_id"?: string | null,"claimant_name": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"details"?: string | null,"due_at"?: string,"evidence"?: NonNullable<Json>,"id"?: string,"ref"?: string,"report_id"?: string | null,"similarity"?: Json | null,"status"?: Database["public"]['Enums']["claim_status"],"type"?: Database["public"]['Enums']["claim_type"]
                  }
                  Update: {
                    "author_due_at"?: string | null,"author_response"?: string | null,"book_id"?: string,"claimant_contact"?: string | null,"claimant_id"?: string | null,"claimant_name"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"details"?: string | null,"due_at"?: string,"evidence"?: NonNullable<Json>,"id"?: string,"ref"?: string,"report_id"?: string | null,"similarity"?: Json | null,"status"?: Database["public"]['Enums']["claim_status"],"type"?: Database["public"]['Enums']["claim_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "copyright_claims_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "copyright_claims_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_claimant_id_fkey"
      columns: ["claimant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_claimant_id_fkey"
      columns: ["claimant_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "copyright_claims_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_alerts": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"resolved_at": string | null,"resolved_by": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_alerts_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_alerts_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_alerts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_alerts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_balances": {
                  Row: {
                    "plan": number,"promo": number,"rollover": number,"topup": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "plan"?: number,"promo"?: number,"rollover"?: number,"topup"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "plan"?: number,"promo"?: number,"rollover"?: number,"topup"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_balances_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_balances_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_daily_snapshot": {
                  Row: {
                    "created_at": string,"day": string,"expired": number,"issued": number,"spent": number,"unspent_by_bucket": NonNullable<Json>,"unspent_total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day": string,"expired": number,"issued": number,"spent": number,"unspent_by_bucket": NonNullable<Json>,"unspent_total": number
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"expired"?: number,"issued"?: number,"spent"?: number,"unspent_by_bucket"?: NonNullable<Json>,"unspent_total"?: number
                  }
                  Relationships: [
                    
                  ]
                },"credit_grant_requests": {
                  Row: {
                    "approved_by": string | null,"created_at": string,"credits": number,"decided_at": string | null,"id": string,"ledger_id": number | null,"reason": string,"requested_by": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"created_at"?: string,"credits": number,"decided_at"?: string | null,"id"?: string,"ledger_id"?: number | null,"reason": string,"requested_by": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "approved_by"?: string | null,"created_at"?: string,"credits"?: number,"decided_at"?: string | null,"id"?: string,"ledger_id"?: number | null,"reason"?: string,"requested_by"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_grant_requests_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_grant_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_ledger": {
                  Row: {
                    "actor_id": string | null,"author_earning_kobo": number,"author_id": string | null,"balance_after": number | null,"book_id": string | null,"bucket": Database["public"]['Enums']["ledger_bucket"],"chapter_id": string | null,"chapter_uid": string | null,"counterparty_user_id": string | null,"created_at": string,"delta": number,"expires_at": string | null,"id": number,"idempotency_key": string | null,"meta": NonNullable<Json>,"note": string | null,"rate_version": string | null,"reason": Database["public"]['Enums']["ledger_reason"],"ref_id": string | null,"ref_ledger_id": number | null,"ref_type": string | null,"txn_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"author_earning_kobo"?: number,"author_id"?: string | null,"balance_after"?: number | null,"book_id"?: string | null,"bucket": Database["public"]['Enums']["ledger_bucket"],"chapter_id"?: string | null,"chapter_uid"?: string | null,"counterparty_user_id"?: string | null,"created_at"?: string,"delta": number,"expires_at"?: string | null,"id"?: never,"idempotency_key"?: string | null,"meta"?: NonNullable<Json>,"note"?: string | null,"rate_version"?: string | null,"reason": Database["public"]['Enums']["ledger_reason"],"ref_id"?: string | null,"ref_ledger_id"?: number | null,"ref_type"?: string | null,"txn_id"?: string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"author_earning_kobo"?: number,"author_id"?: string | null,"balance_after"?: number | null,"book_id"?: string | null,"bucket"?: Database["public"]['Enums']["ledger_bucket"],"chapter_id"?: string | null,"chapter_uid"?: string | null,"counterparty_user_id"?: string | null,"created_at"?: string,"delta"?: number,"expires_at"?: string | null,"id"?: never,"idempotency_key"?: string | null,"meta"?: NonNullable<Json>,"note"?: string | null,"rate_version"?: string | null,"reason"?: Database["public"]['Enums']["ledger_reason"],"ref_id"?: string | null,"ref_ledger_id"?: number | null,"ref_type"?: string | null,"txn_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_ledger_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "credit_ledger_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_counterparty_user_id_fkey"
      columns: ["counterparty_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_counterparty_user_id_fkey"
      columns: ["counterparty_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_rate_version_fkey"
      columns: ["rate_version"]
isOneToOne: false
      referencedRelation: "pricing_rule_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_ref_ledger_id_fkey"
      columns: ["ref_ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_returns": {
                  Row: {
                    "approved_by": string | null,"book_id": string | null,"chapter_id": string | null,"created_at": string,"credits": number,"decided_at": string | null,"id": string,"ledger_id": number,"reason": Database["public"]['Enums']["credit_return_reason"],"requested_by": string,"return_txn_id": string | null,"state": Database["public"]['Enums']["credit_return_state"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"book_id"?: string | null,"chapter_id"?: string | null,"created_at"?: string,"credits": number,"decided_at"?: string | null,"id"?: string,"ledger_id": number,"reason": Database["public"]['Enums']["credit_return_reason"],"requested_by": string,"return_txn_id"?: string | null,"state": Database["public"]['Enums']["credit_return_state"],"user_id": string
                  }
                  Update: {
                    "approved_by"?: string | null,"book_id"?: string | null,"chapter_id"?: string | null,"created_at"?: string,"credits"?: number,"decided_at"?: string | null,"id"?: string,"ledger_id"?: number,"reason"?: Database["public"]['Enums']["credit_return_reason"],"requested_by"?: string,"return_txn_id"?: string | null,"state"?: Database["public"]['Enums']["credit_return_state"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_returns_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "credit_returns_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: true
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_returns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"devices": {
                  Row: {
                    "created_at": string,"id": string,"last_seen_at": string,"name": string,"public_key": string,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"name": string,"public_key": string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"name"?: string,"public_key"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"earning_cycles": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"checks": Json | null,"closed_at": string | null,"created_at": string,"credits_books": number,"credits_tips_messages": number,"earnings_kobo": number,"hold_days": number | null,"id": string,"ledger_check": Json | null,"legacy": boolean,"min_payout_kobo": number | null,"month": string,"net_revenue_kobo": number | null,"payout_date": string | null,"prepared_at": string | null,"prepared_by": string | null,"status": Database["public"]['Enums']["earning_cycle_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"checks"?: Json | null,"closed_at"?: string | null,"created_at"?: string,"credits_books"?: number,"credits_tips_messages"?: number,"earnings_kobo"?: number,"hold_days"?: number | null,"id"?: string,"ledger_check"?: Json | null,"legacy"?: boolean,"min_payout_kobo"?: number | null,"month": string,"net_revenue_kobo"?: number | null,"payout_date"?: string | null,"prepared_at"?: string | null,"prepared_by"?: string | null,"status"?: Database["public"]['Enums']["earning_cycle_status"]
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"checks"?: Json | null,"closed_at"?: string | null,"created_at"?: string,"credits_books"?: number,"credits_tips_messages"?: number,"earnings_kobo"?: number,"hold_days"?: number | null,"id"?: string,"ledger_check"?: Json | null,"legacy"?: boolean,"min_payout_kobo"?: number | null,"month"?: string,"net_revenue_kobo"?: number | null,"payout_date"?: string | null,"prepared_at"?: string | null,"prepared_by"?: string | null,"status"?: Database["public"]['Enums']["earning_cycle_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "earning_cycles_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_cycles_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_cycles_prepared_by_fkey"
      columns: ["prepared_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_cycles_prepared_by_fkey"
      columns: ["prepared_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"earning_exclusions": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"credits": number,"cycle_id": string | null,"id": number,"kobo": number,"ledger_id": number,"reason": Database["public"]['Enums']["earning_exclusion_reason"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"credits": number,"cycle_id"?: string | null,"id"?: never,"kobo": number,"ledger_id": number,"reason": Database["public"]['Enums']["earning_exclusion_reason"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"credits"?: number,"cycle_id"?: string | null,"id"?: never,"kobo"?: number,"ledger_id"?: number,"reason"?: Database["public"]['Enums']["earning_exclusion_reason"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "earning_exclusions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_exclusions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_exclusions_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "earning_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_exclusions_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    }
                  ]
                },"earning_settings": {
                  Row: {
                    "changed_by": string | null,"effective_from": string,"gift_loop_detection": boolean,"hold_days": number,"id": number,"min_payout_kobo": number,"note": string | null,"payout_day": number
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"effective_from"?: string,"gift_loop_detection"?: boolean,"hold_days": number,"id"?: never,"min_payout_kobo": number,"note"?: string | null,"payout_day": number
                  }
                  Update: {
                    "changed_by"?: string | null,"effective_from"?: string,"gift_loop_detection"?: boolean,"hold_days"?: number,"id"?: never,"min_payout_kobo"?: number,"note"?: string | null,"payout_day"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "earning_settings_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earning_settings_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_sender": {
                  Row: {
                    "footer": string,"from_address": string,"id": boolean,"reply_to": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "footer"?: string,"from_address"?: string,"id"?: boolean,"reply_to"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "footer"?: string,"from_address"?: string,"id"?: boolean,"reply_to"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_sender_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_sender_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_sends": {
                  Row: {
                    "bounced_at": string | null,"id": number,"opened_at": string | null,"resend_id": string | null,"sent_at": string,"template_key": string,"user_id": string | null,"version_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bounced_at"?: string | null,"id"?: never,"opened_at"?: string | null,"resend_id"?: string | null,"sent_at"?: string,"template_key": string,"user_id"?: string | null,"version_id"?: string | null
                  }
                  Update: {
                    "bounced_at"?: string | null,"id"?: never,"opened_at"?: string | null,"resend_id"?: string | null,"sent_at"?: string,"template_key"?: string,"user_id"?: string | null,"version_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_sends_template_key_fkey"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "email_templates"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "email_sends_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_sends_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_sends_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "email_template_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"email_template_versions": {
                  Row: {
                    "body": string,"created_at": string,"edited_by": string | null,"id": string,"number": number,"preheader": string,"subject": string,"template_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"number": number,"preheader"?: string,"subject": string,"template_key": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"number"?: number,"preheader"?: string,"subject"?: string,"template_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_template_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_template_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "email_template_versions_template_key_fkey"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "email_templates"
      referencedColumns: ["key"]
    }
                  ]
                },"email_templates": {
                  Row: {
                    "can_disable": boolean,"enabled": boolean,"finance_review": boolean,"key": string,"name": string,"position": number,"trigger": string,"variables": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "can_disable"?: boolean,"enabled"?: boolean,"finance_review"?: boolean,"key": string,"name": string,"position"?: number,"trigger": string,"variables"?: (string)[]
                  }
                  Update: {
                    "can_disable"?: boolean,"enabled"?: boolean,"finance_review"?: boolean,"key"?: string,"name"?: string,"position"?: number,"trigger"?: string,"variables"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"entitlements": {
                  Row: {
                    "book_id": string,"chapter_uid": string | null,"created_at": string,"id": string,"ledger_id": number | null,"revoked_at": string | null,"revoked_reason": string | null,"scope": Database["public"]['Enums']["entitlement_scope"],"source": Database["public"]['Enums']["entitlement_source"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"chapter_uid"?: string | null,"created_at"?: string,"id"?: string,"ledger_id"?: number | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"scope": Database["public"]['Enums']["entitlement_scope"],"source": Database["public"]['Enums']["entitlement_source"],"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"chapter_uid"?: string | null,"created_at"?: string,"id"?: string,"ledger_id"?: number | null,"revoked_at"?: string | null,"revoked_reason"?: string | null,"scope"?: Database["public"]['Enums']["entitlement_scope"],"source"?: Database["public"]['Enums']["entitlement_source"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "entitlements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"export_schedules": {
                  Row: {
                    "cron": string,"enabled": boolean,"id": string,"last_sent_at": string | null,"recipients": (string)[],"report_kind": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cron": string,"enabled"?: boolean,"id"?: string,"last_sent_at"?: string | null,"recipients"?: (string)[],"report_kind": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "cron"?: string,"enabled"?: boolean,"id"?: string,"last_sent_at"?: string | null,"recipients"?: (string)[],"report_kind"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "export_schedules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "export_schedules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"exports": {
                  Row: {
                    "columns": (string)[],"created_at": string,"created_by": string,"error": string | null,"expires_at": string,"file_key": string | null,"finished_at": string | null,"id": string,"includes_pii": boolean,"kind": Database["public"]['Enums']["export_kind"],"params": NonNullable<Json>,"reason": string | null,"row_count": number | null,"status": Database["public"]['Enums']["export_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "columns"?: (string)[],"created_at"?: string,"created_by": string,"error"?: string | null,"expires_at"?: string,"file_key"?: string | null,"finished_at"?: string | null,"id"?: string,"includes_pii"?: boolean,"kind": Database["public"]['Enums']["export_kind"],"params"?: NonNullable<Json>,"reason"?: string | null,"row_count"?: number | null,"status"?: Database["public"]['Enums']["export_status"]
                  }
                  Update: {
                    "columns"?: (string)[],"created_at"?: string,"created_by"?: string,"error"?: string | null,"expires_at"?: string,"file_key"?: string | null,"finished_at"?: string | null,"id"?: string,"includes_pii"?: boolean,"kind"?: Database["public"]['Enums']["export_kind"],"params"?: NonNullable<Json>,"reason"?: string | null,"row_count"?: number | null,"status"?: Database["public"]['Enums']["export_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "exports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"fast_lane_audits": {
                  Row: {
                    "audited_at": string | null,"audited_by": string | null,"note": string | null,"picked_at": string,"revision_id": string,"status": Database["public"]['Enums']["fast_lane_result"]
                  }
                  ComputedFields: never
                  Insert: {
                    "audited_at"?: string | null,"audited_by"?: string | null,"note"?: string | null,"picked_at"?: string,"revision_id": string,"status"?: Database["public"]['Enums']["fast_lane_result"]
                  }
                  Update: {
                    "audited_at"?: string | null,"audited_by"?: string | null,"note"?: string | null,"picked_at"?: string,"revision_id"?: string,"status"?: Database["public"]['Enums']["fast_lane_result"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "fast_lane_audits_audited_by_fkey"
      columns: ["audited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fast_lane_audits_audited_by_fkey"
      columns: ["audited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fast_lane_audits_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: true
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"feature_flags": {
                  Row: {
                    "enabled": boolean,"group": string,"key": string,"label": string,"min_app_version": string | null,"note": string | null,"rollout_percent": number,"sort": number,"updated_at": string,"updated_by": string | null,"warning": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"group": string,"key": string,"label": string,"min_app_version"?: string | null,"note"?: string | null,"rollout_percent"?: number,"sort"?: number,"updated_at"?: string,"updated_by"?: string | null,"warning"?: string | null
                  }
                  Update: {
                    "enabled"?: boolean,"group"?: string,"key"?: string,"label"?: string,"min_app_version"?: string | null,"note"?: string | null,"rollout_percent"?: number,"sort"?: number,"updated_at"?: string,"updated_by"?: string | null,"warning"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feature_flags_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feature_flags_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"genres": {
                  Row: {
                    "created_at": string,"id": string,"merged_into": string | null,"name": string,"position": number,"slug": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"merged_into"?: string | null,"name": string,"position": number,"slug": string,"visible"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"merged_into"?: string | null,"name"?: string,"position"?: number,"slug"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "genres_merged_into_fkey"
      columns: ["merged_into"]
isOneToOne: false
      referencedRelation: "genre_book_counts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "genres_merged_into_fkey"
      columns: ["merged_into"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["id"]
    }
                  ]
                },"gifts": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"ledger_id": number,"message": string | null,"recipient_id": string,"seen_at": string | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"ledger_id": number,"message"?: string | null,"recipient_id": string,"seen_at"?: string | null,"sender_id": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"ledger_id"?: number,"message"?: string | null,"recipient_id"?: string,"seen_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gifts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "gifts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "banned_at": string | null,"cost_ack_at": string | null,"group_id": string,"joined_at": string,"last_read_at": string,"last_seen_at": string | null,"muted_by": string | null,"muted_until": string | null,"notify_muted_until": string | null,"role": Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banned_at"?: string | null,"cost_ack_at"?: string | null,"group_id": string,"joined_at"?: string,"last_read_at"?: string,"last_seen_at"?: string | null,"muted_by"?: string | null,"muted_until"?: string | null,"notify_muted_until"?: string | null,"role"?: Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  Update: {
                    "banned_at"?: string | null,"cost_ack_at"?: string | null,"group_id"?: string,"joined_at"?: string,"last_read_at"?: string,"last_seen_at"?: string | null,"muted_by"?: string | null,"muted_until"?: string | null,"notify_muted_until"?: string | null,"role"?: Database["public"]['Enums']["group_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_mute_carry": {
                  Row: {
                    "group_id": string,"muted_by": string | null,"muted_until": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"muted_by"?: string | null,"muted_until": string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"muted_by"?: string | null,"muted_until"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_mute_carry_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_mute_carry_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_mute_carry_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_mute_carry_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_mute_carry_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"avatar_url": string | null,"book_id": string | null,"created_at": string,"description": string | null,"id": string,"kind": Database["public"]['Enums']["group_kind"],"last_message_at": string | null,"live_at": string | null,"live_count": number,"locked_until": string | null,"member_count": number,"muted_until": string | null,"muted_words": (string)[],"name": string,"owner_id": string | null,"slow_mode_seconds": number,"updated_at": string,"visibility": Database["public"]['Enums']["group_visibility"],"weekly_book_id": string | null,"weekly_from_chapter": number | null,"weekly_note": string | null,"weekly_to_chapter": number | null,"who_can_post": Database["public"]['Enums']["group_who_can_post"]
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"avatar_url"?: string | null,"book_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["group_kind"],"last_message_at"?: string | null,"live_at"?: string | null,"live_count"?: number,"locked_until"?: string | null,"member_count"?: number,"muted_until"?: string | null,"muted_words"?: (string)[],"name": string,"owner_id"?: string | null,"slow_mode_seconds"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["group_visibility"],"weekly_book_id"?: string | null,"weekly_from_chapter"?: number | null,"weekly_note"?: string | null,"weekly_to_chapter"?: number | null,"who_can_post"?: Database["public"]['Enums']["group_who_can_post"]
                  }
                  Update: {
                    "archived_at"?: string | null,"avatar_url"?: string | null,"book_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["group_kind"],"last_message_at"?: string | null,"live_at"?: string | null,"live_count"?: number,"locked_until"?: string | null,"member_count"?: number,"muted_until"?: string | null,"muted_words"?: (string)[],"name"?: string,"owner_id"?: string | null,"slow_mode_seconds"?: number,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["group_visibility"],"weekly_book_id"?: string | null,"weekly_from_chapter"?: number | null,"weekly_note"?: string | null,"weekly_to_chapter"?: number | null,"who_can_post"?: Database["public"]['Enums']["group_who_can_post"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "groups_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_weekly_book_id_fkey"
      columns: ["weekly_book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "groups_weekly_book_id_fkey"
      columns: ["weekly_book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_weekly_book_id_fkey"
      columns: ["weekly_book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    }
                  ]
                },"help_article_versions": {
                  Row: {
                    "article_id": string,"body": string,"created_at": string,"edited_by": string | null,"id": string,"number": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"body": string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"number": number,"title": string
                  }
                  Update: {
                    "article_id"?: string,"body"?: string,"created_at"?: string,"edited_by"?: string | null,"id"?: string,"number"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "help_article_versions_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "help_articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "help_article_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "help_article_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"help_articles": {
                  Row: {
                    "category": Database["public"]['Enums']["help_category"],"created_at": string,"current_version_id": string | null,"id": string,"in_search": boolean,"related": (string)[],"shows_in": (string)[],"slug": string,"state": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["help_category"],"created_at"?: string,"current_version_id"?: string | null,"id"?: string,"in_search"?: boolean,"related"?: (string)[],"shows_in"?: (string)[],"slug": string,"state"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["help_category"],"created_at"?: string,"current_version_id"?: string | null,"id"?: string,"in_search"?: boolean,"related"?: (string)[],"shows_in"?: (string)[],"slug"?: string,"state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "help_articles_current_version_id_fkey"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "help_article_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"help_views": {
                  Row: {
                    "article_id": string,"at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"at"?: string
                  }
                  Update: {
                    "article_id"?: string,"at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "help_views_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "help_articles"
      referencedColumns: ["id"]
    }
                  ]
                },"help_votes": {
                  Row: {
                    "article_id": string,"at": string,"helpful": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"at"?: string,"helpful": boolean,"user_id": string
                  }
                  Update: {
                    "article_id"?: string,"at"?: string,"helpful"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "help_votes_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "help_articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "help_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "help_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"hidden_reviewers": {
                  Row: {
                    "created_at": string,"hidden_user_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hidden_user_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"hidden_user_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hidden_reviewers_hidden_user_id_fkey"
      columns: ["hidden_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hidden_reviewers_hidden_user_id_fkey"
      columns: ["hidden_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hidden_reviewers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hidden_reviewers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"home_sections": {
                  Row: {
                    "config": NonNullable<Json>,"id": string,"key": string,"kind": string,"position": number,"title": string,"updated_at": string,"updated_by": string | null,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"id"?: string,"key": string,"kind": string,"position": number,"title": string,"updated_at"?: string,"updated_by"?: string | null,"visible"?: boolean
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"id"?: string,"key"?: string,"kind"?: string,"position"?: number,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "home_sections_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "home_sections_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_health": {
                  Row: {
                    "address": string | null,"checked_at": string | null,"description": string | null,"error_note": string | null,"error_rate_24h": number | null,"key_masked": string | null,"key_owner": string | null,"key_rotated_at": string | null,"label": string,"last_event_at": string | null,"last_event_text": string | null,"old_key_valid_until": string | null,"service": string,"sort": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"checked_at"?: string | null,"description"?: string | null,"error_note"?: string | null,"error_rate_24h"?: number | null,"key_masked"?: string | null,"key_owner"?: string | null,"key_rotated_at"?: string | null,"label": string,"last_event_at"?: string | null,"last_event_text"?: string | null,"old_key_valid_until"?: string | null,"service": string,"sort"?: number,"status"?: string
                  }
                  Update: {
                    "address"?: string | null,"checked_at"?: string | null,"description"?: string | null,"error_note"?: string | null,"error_rate_24h"?: number | null,"key_masked"?: string | null,"key_owner"?: string | null,"key_rotated_at"?: string | null,"label"?: string,"last_event_at"?: string | null,"last_event_text"?: string | null,"old_key_valid_until"?: string | null,"service"?: string,"sort"?: number,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"library_hidden": {
                  Row: {
                    "book_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_hidden_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "library_hidden_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_hidden_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_hidden_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_hidden_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_pins": {
                  Row: {
                    "group_id": string,"message_id": string,"pinned_at": string,"pinned_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"message_id": string,"pinned_at"?: string,"pinned_by"?: string | null
                  }
                  Update: {
                    "group_id"?: string,"message_id"?: string,"pinned_at"?: string,"pinned_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_pins_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_pins_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_pins_pinned_by_fkey"
      columns: ["pinned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_pins_pinned_by_fkey"
      columns: ["pinned_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_reactions": {
                  Row: {
                    "created_at": string,"emoji": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emoji": string,"message_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"emoji"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_retained": {
                  Row: {
                    "body": string,"message_id": string,"purge_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"message_id": string,"purge_at"?: string
                  }
                  Update: {
                    "body"?: string,"message_id"?: string,"purge_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_retained_message_id_fkey"
      columns: ["message_id"]
isOneToOne: true
      referencedRelation: "messages"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string | null,"client_id": string,"cost_credits": number,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["message_kind"],"ledger_id": number | null,"quote": Json | null,"reply_to_id": string | null,"sender_id": string | null,"spoiler_chapter": number | null,"state": Database["public"]['Enums']["message_state"],"state_changed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"client_id": string,"cost_credits"?: number,"created_at"?: string,"group_id": string,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"ledger_id"?: number | null,"quote"?: Json | null,"reply_to_id"?: string | null,"sender_id"?: string | null,"spoiler_chapter"?: number | null,"state"?: Database["public"]['Enums']["message_state"],"state_changed_at"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"client_id"?: string,"cost_credits"?: number,"created_at"?: string,"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["message_kind"],"ledger_id"?: number | null,"quote"?: Json | null,"reply_to_id"?: string | null,"sender_id"?: string | null,"spoiler_chapter"?: number | null,"state"?: Database["public"]['Enums']["message_state"],"state_changed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_actions": {
                  Row: {
                    "action": Database["public"]['Enums']["moderation_action_kind"],"confirmed_by": string | null,"content_ref": Json | null,"created_at": string,"decided_by": string | null,"duration_days": number | null,"expires_at": string | null,"id": string,"internal_note": string | null,"message_to_user": string | null,"reason": string,"report_id": string | null,"target_user_id": string | null,"undone_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["moderation_action_kind"],"confirmed_by"?: string | null,"content_ref"?: Json | null,"created_at"?: string,"decided_by"?: string | null,"duration_days"?: number | null,"expires_at"?: string | null,"id"?: string,"internal_note"?: string | null,"message_to_user"?: string | null,"reason": string,"report_id"?: string | null,"target_user_id"?: string | null,"undone_at"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["moderation_action_kind"],"confirmed_by"?: string | null,"content_ref"?: Json | null,"created_at"?: string,"decided_by"?: string | null,"duration_days"?: number | null,"expires_at"?: string | null,"id"?: string,"internal_note"?: string | null,"message_to_user"?: string | null,"reason"?: string,"report_id"?: string | null,"target_user_id"?: string | null,"undone_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_actions_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "authors": boolean,"clubs": boolean,"note_replies": boolean,"offers": boolean,"quiet_enabled": boolean,"quiet_end": string,"quiet_start": string,"reminders": boolean,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authors"?: boolean,"clubs"?: boolean,"note_replies"?: boolean,"offers"?: boolean,"quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"reminders"?: boolean,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "authors"?: boolean,"clubs"?: boolean,"note_replies"?: boolean,"offers"?: boolean,"quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"reminders"?: boolean,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string,"book_id": string | null,"category": string,"created_at": string,"id": string,"kind": string,"read_at": string | null,"target_id": string | null,"target_type": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"body"?: string,"book_id"?: string | null,"category": string,"created_at"?: string,"id"?: string,"kind": string,"read_at"?: string | null,"target_id"?: string | null,"target_type"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"book_id"?: string | null,"category"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"read_at"?: string | null,"target_id"?: string | null,"target_type"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "notifications_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offline_licenses": {
                  Row: {
                    "book_id": string,"device_id": string,"issued_at": string,"revision_id": string,"user_id": string,"valid_until": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"device_id": string,"issued_at"?: string,"revision_id": string,"user_id": string,"valid_until": string
                  }
                  Update: {
                    "book_id"?: string,"device_id"?: string,"issued_at"?: string,"revision_id"?: string,"user_id"?: string,"valid_until"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offline_licenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "offline_licenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_licenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_licenses_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_licenses_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_licenses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offline_licenses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"paragraph_anchors": {
                  Row: {
                    "chapter_uid": string,"fingerprint": string,"ord": number,"para_id": string,"revision_id": string,"words": number,"words_before": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chapter_uid": string,"fingerprint": string,"ord": number,"para_id": string,"revision_id": string,"words"?: number,"words_before"?: number
                  }
                  Update: {
                    "chapter_uid"?: string,"fingerprint"?: string,"ord"?: number,"para_id"?: string,"revision_id"?: string,"words"?: number,"words_before"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "paragraph_anchors_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"passage_comment_reactions": {
                  Row: {
                    "comment_id": string,"created_at": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id": string,"created_at"?: string,"kind": string,"user_id": string
                  }
                  Update: {
                    "comment_id"?: string,"created_at"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "passage_comment_reactions_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "passage_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comment_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comment_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"passage_comments": {
                  Row: {
                    "body": string,"book_id": string,"created_at": string,"id": string,"para_id": string,"quote": string | null,"reveal_at_chapter_ord": number | null,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"book_id": string,"created_at"?: string,"id"?: string,"para_id": string,"quote"?: string | null,"reveal_at_chapter_ord"?: number | null,"status"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"book_id"?: string,"created_at"?: string,"id"?: string,"para_id"?: string,"quote"?: string | null,"reveal_at_chapter_ord"?: number | null,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"paygo_accounts": {
                  Row: {
                    "book_id": string,"created_at": string,"snapshot_price": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"snapshot_price": number,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"snapshot_price"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "paygo_accounts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "paygo_accounts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paygo_accounts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paygo_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "paygo_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "error": string | null,"event_id": string,"event_type": string,"id": number,"normalized": NonNullable<Json>,"occurred_at": string,"outcome": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"provider": string,"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"event_id": string,"event_type": string,"id"?: never,"normalized": NonNullable<Json>,"occurred_at": string,"outcome"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"provider": string,"received_at"?: string
                  }
                  Update: {
                    "error"?: string | null,"event_id"?: string,"event_type"?: string,"id"?: never,"normalized"?: NonNullable<Json>,"occurred_at"?: string,"outcome"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payout_events": {
                  Row: {
                    "applied": boolean,"event_id": string,"payout_id": string | null,"received_at": string,"status": Database["public"]['Enums']["payout_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "applied": boolean,"event_id": string,"payout_id"?: string | null,"received_at"?: string,"status": Database["public"]['Enums']["payout_status"]
                  }
                  Update: {
                    "applied"?: boolean,"event_id"?: string,"payout_id"?: string | null,"received_at"?: string,"status"?: Database["public"]['Enums']["payout_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_events_payout_id_fkey"
      columns: ["payout_id"]
isOneToOne: false
      referencedRelation: "payouts"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_holds": {
                  Row: {
                    "author_id": string,"id": string,"lifted_at": string | null,"lifted_by": string | null,"note": string | null,"reason": string,"set_at": string,"set_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"id"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"note"?: string | null,"reason": string,"set_at"?: string,"set_by"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"id"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"note"?: string | null,"reason"?: string,"set_at"?: string,"set_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_holds_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_holds_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_holds_lifted_by_fkey"
      columns: ["lifted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_holds_lifted_by_fkey"
      columns: ["lifted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_holds_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_holds_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_runs": {
                  Row: {
                    "approved_by": string | null,"authors": number,"created_at": string,"cycle_id": string,"id": string,"started_by": string | null,"status": Database["public"]['Enums']["payout_run_status"],"total_kobo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"authors"?: number,"created_at"?: string,"cycle_id": string,"id"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["payout_run_status"],"total_kobo"?: number
                  }
                  Update: {
                    "approved_by"?: string | null,"authors"?: number,"created_at"?: string,"cycle_id"?: string,"id"?: string,"started_by"?: string | null,"status"?: Database["public"]['Enums']["payout_run_status"],"total_kobo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_runs_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_runs_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_runs_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "earning_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_runs_started_by_fkey"
      columns: ["started_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payouts": {
                  Row: {
                    "amount_kobo": number,"api_errors": number,"attempt": number,"author_earning_id": string,"author_id": string,"bank_account_id": string | null,"failure_reason": string | null,"flutterwave_transfer_id": string | null,"id": string,"not_before": string,"queued_at": string,"raised_at": string | null,"reference": string,"retry_of": string | null,"run_id": string,"sent_at": string | null,"settled_at": string | null,"status": Database["public"]['Enums']["payout_status"],"waiting_for_account": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo": number,"api_errors"?: number,"attempt": number,"author_earning_id": string,"author_id": string,"bank_account_id"?: string | null,"failure_reason"?: string | null,"flutterwave_transfer_id"?: string | null,"id"?: string,"not_before"?: string,"queued_at"?: string,"raised_at"?: string | null,"reference": string,"retry_of"?: string | null,"run_id": string,"sent_at"?: string | null,"settled_at"?: string | null,"status"?: Database["public"]['Enums']["payout_status"],"waiting_for_account"?: boolean
                  }
                  Update: {
                    "amount_kobo"?: number,"api_errors"?: number,"attempt"?: number,"author_earning_id"?: string,"author_id"?: string,"bank_account_id"?: string | null,"failure_reason"?: string | null,"flutterwave_transfer_id"?: string | null,"id"?: string,"not_before"?: string,"queued_at"?: string,"raised_at"?: string | null,"reference"?: string,"retry_of"?: string | null,"run_id"?: string,"sent_at"?: string | null,"settled_at"?: string | null,"status"?: Database["public"]['Enums']["payout_status"],"waiting_for_account"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "payouts_author_earning_id_fkey"
      columns: ["author_earning_id"]
isOneToOne: false
      referencedRelation: "author_earnings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_bank_account_id_fkey"
      columns: ["bank_account_id"]
isOneToOne: false
      referencedRelation: "author_bank_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_retry_of_fkey"
      columns: ["retry_of"]
isOneToOne: false
      referencedRelation: "payouts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payouts_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "payout_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "key": string,"label": string,"matrix_order": number | null,"more": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"label": string,"matrix_order"?: number | null,"more"?: boolean
                  }
                  Update: {
                    "key"?: string,"label"?: string,"matrix_order"?: number | null,"more"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"pipeline_config": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "pipeline_config_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pipeline_config_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_price_versions": {
                  Row: {
                    "badge": string | null,"bonus_credits": number,"changed_by": string | null,"created_at": string,"credits": number,"effective_from": string,"id": number,"name": string,"note": string | null,"plan_code": string,"price_web_kobo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "badge"?: string | null,"bonus_credits"?: number,"changed_by"?: string | null,"created_at"?: string,"credits": number,"effective_from": string,"id"?: never,"name": string,"note"?: string | null,"plan_code": string,"price_web_kobo": number
                  }
                  Update: {
                    "badge"?: string | null,"bonus_credits"?: number,"changed_by"?: string | null,"created_at"?: string,"credits"?: number,"effective_from"?: string,"id"?: never,"name"?: string,"note"?: string | null,"plan_code"?: string,"price_web_kobo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_price_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_price_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_price_versions_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"plans": {
                  Row: {
                    "active": boolean,"badge": string | null,"bonus_credits": number,"code": string,"credits": number,"effective_from": string,"months": number,"name": string,"play_product_id": string,"price_play_kobo": number,"price_web_kobo": number,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"badge"?: string | null,"bonus_credits"?: number,"code": string,"credits": number,"effective_from"?: string,"months": number,"name": string,"play_product_id": string,"price_play_kobo": number,"price_web_kobo": number,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"badge"?: string | null,"bonus_credits"?: number,"code"?: string,"credits"?: number,"effective_from"?: string,"months"?: number,"name"?: string,"play_product_id"?: string,"price_play_kobo"?: number,"price_web_kobo"?: number,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"policies": {
                  Row: {
                    "accept_again": boolean,"always_live": boolean,"audience": string,"id": string,"slug": string,"sort": number,"subtitle": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accept_again"?: boolean,"always_live"?: boolean,"audience": string,"id"?: string,"slug": string,"sort"?: number,"subtitle"?: string | null,"title": string
                  }
                  Update: {
                    "accept_again"?: boolean,"always_live"?: boolean,"audience"?: string,"id"?: string,"slug"?: string,"sort"?: number,"subtitle"?: string | null,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"policy_acceptances": {
                  Row: {
                    "accepted_at": string,"policy_version_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"policy_version_id": string,"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string,"policy_version_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_acceptances_policy_version_id_fkey"
      columns: ["policy_version_id"]
isOneToOne: false
      referencedRelation: "policy_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_acceptances_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_acceptances_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"policy_versions": {
                  Row: {
                    "accept_again": boolean,"body": string,"change_summary": string | null,"edited_at": string,"edited_by": string | null,"id": string,"policy_id": string,"published_at": string | null,"published_by": string | null,"status": string,"version": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accept_again"?: boolean,"body"?: string,"change_summary"?: string | null,"edited_at"?: string,"edited_by"?: string | null,"id"?: string,"policy_id": string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"version"?: number | null
                  }
                  Update: {
                    "accept_again"?: boolean,"body"?: string,"change_summary"?: string | null,"edited_at"?: string,"edited_by"?: string | null,"id"?: string,"policy_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"version"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_edited_by_fkey"
      columns: ["edited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"post_comments": {
                  Row: {
                    "body": string,"client_id": string,"created_at": string,"id": string,"parent_id": string | null,"post_id": string,"state": Database["public"]['Enums']["comment_state"],"state_changed_at": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"client_id": string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"post_id": string,"state"?: Database["public"]['Enums']["comment_state"],"state_changed_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"client_id"?: string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"post_id"?: string,"state"?: Database["public"]['Enums']["comment_state"],"state_changed_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "post_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "author_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"post_likes": {
                  Row: {
                    "created_at": string,"post_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_likes_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "author_posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "post_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pricing_rule_versions": {
                  Row: {
                    "applied_at": string | null,"approved_by": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"changed_by": string | null,"created_at": string,"effective_at": string,"id": string,"note": string | null,"plan_check": Json | null,"rules": NonNullable<Json>,"step_up_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string | null,"approved_by"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"changed_by"?: string | null,"created_at"?: string,"effective_at": string,"id"?: string,"note"?: string | null,"plan_check"?: Json | null,"rules": NonNullable<Json>,"step_up_id"?: string | null,"version": number
                  }
                  Update: {
                    "applied_at"?: string | null,"approved_by"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"changed_by"?: string | null,"created_at"?: string,"effective_at"?: string,"id"?: string,"note"?: string | null,"plan_check"?: Json | null,"rules"?: NonNullable<Json>,"step_up_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_rule_versions_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_step_up_id_fkey"
      columns: ["step_up_id"]
isOneToOne: false
      referencedRelation: "staff_stepups"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"country": string,"created_at": string,"date_of_birth": string | null,"deleted_at": string | null,"deletion_requested_at": string | null,"erased_at": string | null,"full_name": string,"id": string,"interests": (string)[],"is_author": boolean,"is_reader": boolean,"library_view": string,"name_changes": (string)[],"onboarding_step": string,"phone": string | null,"privacy_version": number | null,"reader_settings": NonNullable<Json>,"reader_theme": Database["public"]['Enums']["reader_theme"],"signup_intent": Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at": string | null,"terms_version": number | null,"theme": Database["public"]['Enums']["app_theme"],"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"deletion_requested_at"?: string | null,"erased_at"?: string | null,"full_name"?: string,"id": string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"library_view"?: string,"name_changes"?: (string)[],"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"reader_settings"?: NonNullable<Json>,"reader_theme"?: Database["public"]['Enums']["reader_theme"],"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"deletion_requested_at"?: string | null,"erased_at"?: string | null,"full_name"?: string,"id"?: string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"library_view"?: string,"name_changes"?: (string)[],"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"reader_settings"?: NonNullable<Json>,"reader_theme"?: Database["public"]['Enums']["reader_theme"],"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"promo_codes": {
                  Row: {
                    "amount": number,"campaign_tag": string | null,"code": string,"created_at": string,"created_by": string | null,"ends_at": string | null,"kind": string,"locked_at": string | null,"max_uses": number | null,"new_readers_only": boolean,"starts_at": string,"status": string,"uses": number,"uses_per_reader": number,"web_only": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"campaign_tag"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"kind": string,"locked_at"?: string | null,"max_uses"?: number | null,"new_readers_only"?: boolean,"starts_at"?: string,"status"?: string,"uses"?: number,"uses_per_reader"?: number,"web_only"?: boolean
                  }
                  Update: {
                    "amount"?: number,"campaign_tag"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"kind"?: string,"locked_at"?: string | null,"max_uses"?: number | null,"new_readers_only"?: boolean,"starts_at"?: string,"status"?: string,"uses"?: number,"uses_per_reader"?: number,"web_only"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_codes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"promo_redemptions": {
                  Row: {
                    "code": string,"id": number,"ledger_id": number | null,"redeemed_at": string,"transaction_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"id"?: never,"ledger_id"?: number | null,"redeemed_at"?: string,"transaction_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "code"?: string,"id"?: never,"ledger_id"?: number | null,"redeemed_at"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_redemptions_code_fkey"
      columns: ["code"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "promo_redemptions_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_redemptions_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_redemptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_redemptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_author_daily": {
                  Row: {
                    "author_id": string,"day": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"day": string,"user_id": string
                  }
                  Update: {
                    "author_id"?: string,"day"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_author_daily_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_author_daily_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_author_daily_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_author_daily_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_held": {
                  Row: {
                    "created_at": string,"drop_if_older": boolean,"id": number,"payload": NonNullable<Json>,"release_at": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"drop_if_older"?: boolean,"id"?: never,"payload": NonNullable<Json>,"release_at": string,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"drop_if_older"?: boolean,"id"?: never,"payload"?: NonNullable<Json>,"release_at"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_held_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "push_types"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "push_held_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_held_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_log": {
                  Row: {
                    "campaign_id": string | null,"category": Database["public"]['Enums']["push_category"],"collapse_key": string | null,"created_at": string,"data": NonNullable<Json>,"delivered_at": string | null,"id": number,"opened_at": string | null,"sent_at": string | null,"skip_reason": string | null,"status": Database["public"]['Enums']["push_status"],"ticket_ids": (string)[],"type": string,"user_id": string,"variant": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id"?: string | null,"category": Database["public"]['Enums']["push_category"],"collapse_key"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"delivered_at"?: string | null,"id"?: never,"opened_at"?: string | null,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["push_status"],"ticket_ids"?: (string)[],"type": string,"user_id": string,"variant"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string | null,"category"?: Database["public"]['Enums']["push_category"],"collapse_key"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"delivered_at"?: string | null,"id"?: never,"opened_at"?: string | null,"sent_at"?: string | null,"skip_reason"?: string | null,"status"?: Database["public"]['Enums']["push_status"],"ticket_ids"?: (string)[],"type"?: string,"user_id"?: string,"variant"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_log_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_log_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "push_types"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "push_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_log_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_types": {
                  Row: {
                    "automatic": boolean,"body_template": string,"can_reader_disable": boolean,"can_switch_off": boolean,"capped": boolean,"category": Database["public"]['Enums']["push_category"],"collapse_key": string | null,"enabled": boolean,"key": string,"label": string,"quiet_action": Database["public"]['Enums']["push_quiet_action"],"switched_at": string | null,"switched_by": string | null,"title_template": string,"ttl_seconds": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "automatic"?: boolean,"body_template"?: string,"can_reader_disable"?: boolean,"can_switch_off"?: boolean,"capped"?: boolean,"category": Database["public"]['Enums']["push_category"],"collapse_key"?: string | null,"enabled"?: boolean,"key": string,"label": string,"quiet_action"?: Database["public"]['Enums']["push_quiet_action"],"switched_at"?: string | null,"switched_by"?: string | null,"title_template"?: string,"ttl_seconds"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "automatic"?: boolean,"body_template"?: string,"can_reader_disable"?: boolean,"can_switch_off"?: boolean,"capped"?: boolean,"category"?: Database["public"]['Enums']["push_category"],"collapse_key"?: string | null,"enabled"?: boolean,"key"?: string,"label"?: string,"quiet_action"?: Database["public"]['Enums']["push_quiet_action"],"switched_at"?: string | null,"switched_by"?: string | null,"title_template"?: string,"ttl_seconds"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_types_switched_by_fkey"
      columns: ["switched_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_types_switched_by_fkey"
      columns: ["switched_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_types_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_types_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reading_goals": {
                  Row: {
                    "target_books": number,"updated_at": string,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "target_books": number,"updated_at"?: string,"user_id": string,"year": number
                  }
                  Update: {
                    "target_books"?: number,"updated_at"?: string,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reading_progress": {
                  Row: {
                    "book_id": string,"cfi": string | null,"chapter_ord": number,"chapter_uid": string | null,"char_offset": number,"device_id": string | null,"device_name": string | null,"finished_at": string | null,"first_opened_at": string,"last_opened_at": string,"max_chapter_ord": number,"max_percent": number,"para_id": string | null,"percent": number,"revision_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cfi"?: string | null,"chapter_ord"?: number,"chapter_uid"?: string | null,"char_offset"?: number,"device_id"?: string | null,"device_name"?: string | null,"finished_at"?: string | null,"first_opened_at"?: string,"last_opened_at"?: string,"max_chapter_ord"?: number,"max_percent"?: number,"para_id"?: string | null,"percent"?: number,"revision_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"cfi"?: string | null,"chapter_ord"?: number,"chapter_uid"?: string | null,"char_offset"?: number,"device_id"?: string | null,"device_name"?: string | null,"finished_at"?: string | null,"first_opened_at"?: string,"last_opened_at"?: string,"max_chapter_ord"?: number,"max_percent"?: number,"para_id"?: string | null,"percent"?: number,"revision_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_progress_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "reading_progress_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_progress_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_progress_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reading_rooms": {
                  Row: {
                    "book_id": string,"code": string,"created_at": string,"ended_at": string | null,"ended_by": string | null,"group_id": string,"host_id": string | null,"join_policy": Database["public"]['Enums']["room_join_policy"],"last_activity_at": string,"locked_before_end": string | null,"locked_by_staff": boolean,"max_members": number,"pace": Database["public"]['Enums']["room_pace"],"starts_at": string,"state": Database["public"]['Enums']["room_state"],"transcript_purge_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"code": string,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"group_id": string,"host_id"?: string | null,"join_policy"?: Database["public"]['Enums']["room_join_policy"],"last_activity_at"?: string,"locked_before_end"?: string | null,"locked_by_staff"?: boolean,"max_members"?: number,"pace"?: Database["public"]['Enums']["room_pace"],"starts_at"?: string,"state"?: Database["public"]['Enums']["room_state"],"transcript_purge_at"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"code"?: string,"created_at"?: string,"ended_at"?: string | null,"ended_by"?: string | null,"group_id"?: string,"host_id"?: string | null,"join_policy"?: Database["public"]['Enums']["room_join_policy"],"last_activity_at"?: string,"locked_before_end"?: string | null,"locked_by_staff"?: boolean,"max_members"?: number,"pace"?: Database["public"]['Enums']["room_pace"],"starts_at"?: string,"state"?: Database["public"]['Enums']["room_state"],"transcript_purge_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_rooms_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "reading_rooms_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_group_id_fkey"
      columns: ["group_id"]
isOneToOne: true
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_host_id_fkey"
      columns: ["host_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_rooms_host_id_fkey"
      columns: ["host_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reading_sessions": {
                  Row: {
                    "active_seconds": number,"book_id": string,"client_id": string,"created_at": string,"device_id": string | null,"ended_at": string,"id": string,"started_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_seconds": number,"book_id": string,"client_id": string,"created_at"?: string,"device_id"?: string | null,"ended_at": string,"id"?: string,"started_at": string,"user_id": string
                  }
                  Update: {
                    "active_seconds"?: number,"book_id"?: string,"client_id"?: string,"created_at"?: string,"device_id"?: string | null,"ended_at"?: string,"id"?: string,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_sessions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "reading_sessions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_sessions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendation_cache": {
                  Row: {
                    "book_ids": (string)[],"computed_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_ids"?: (string)[],"computed_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_ids"?: (string)[],"computed_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendation_cache_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendation_cache_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"refund_requests": {
                  Row: {
                    "amount_kobo": number | null,"credits_granted": number,"credits_used": number,"decided_at": string | null,"decided_by": string | null,"flutterwave_refund_id": string | null,"id": string,"note": string | null,"reason": string,"recommendation": string,"requested_at": string,"status": string,"transaction_id": string,"type": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_kobo"?: number | null,"credits_granted"?: number,"credits_used"?: number,"decided_at"?: string | null,"decided_by"?: string | null,"flutterwave_refund_id"?: string | null,"id"?: string,"note"?: string | null,"reason": string,"recommendation": string,"requested_at"?: string,"status"?: string,"transaction_id": string,"type"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount_kobo"?: number | null,"credits_granted"?: number,"credits_used"?: number,"decided_at"?: string | null,"decided_by"?: string | null,"flutterwave_refund_id"?: string | null,"id"?: string,"note"?: string | null,"reason"?: string,"recommendation"?: string,"requested_at"?: string,"status"?: string,"transaction_id"?: string,"type"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refund_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refund_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"remote_copy": {
                  Row: {
                    "key": string,"required_placeholders": (string)[],"text": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"required_placeholders"?: (string)[],"text": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "key"?: string,"required_placeholders"?: (string)[],"text"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "remote_copy_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "remote_copy_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "assignee_id": string | null,"book_id": string | null,"brigading": boolean,"content_id": string,"content_type": Database["public"]['Enums']["report_content_type"],"created_at": string,"decided_by": string | null,"details": string | null,"due_at": string,"eligible": boolean,"escalated_at": string | null,"first_action_at": string | null,"group_id": string | null,"id": string,"late_alerted_at": string | null,"outcome": Database["public"]['Enums']["report_outcome"] | null,"reason": Database["public"]['Enums']["report_reason"],"ref": string,"reported_at": string | null,"reported_user_id": string | null,"reporter_id": string | null,"resolved_at": string | null,"severity": Database["public"]['Enums']["report_severity"],"snapshot": Json | null,"staff_only": boolean,"status": Database["public"]['Enums']["report_status"],"_report_visible_to_me": boolean | null
                  }
                  ComputedFields: "_report_visible_to_me"
                  Insert: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"brigading"?: boolean,"content_id": string,"content_type": Database["public"]['Enums']["report_content_type"],"created_at"?: string,"decided_by"?: string | null,"details"?: string | null,"due_at": string,"eligible"?: boolean,"escalated_at"?: string | null,"first_action_at"?: string | null,"group_id"?: string | null,"id"?: string,"late_alerted_at"?: string | null,"outcome"?: Database["public"]['Enums']["report_outcome"] | null,"reason": Database["public"]['Enums']["report_reason"],"ref"?: string,"reported_at"?: string | null,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolved_at"?: string | null,"severity": Database["public"]['Enums']["report_severity"],"snapshot"?: Json | null,"staff_only"?: boolean,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"brigading"?: boolean,"content_id"?: string,"content_type"?: Database["public"]['Enums']["report_content_type"],"created_at"?: string,"decided_by"?: string | null,"details"?: string | null,"due_at"?: string,"eligible"?: boolean,"escalated_at"?: string | null,"first_action_at"?: string | null,"group_id"?: string | null,"id"?: string,"late_alerted_at"?: string | null,"outcome"?: Database["public"]['Enums']["report_outcome"] | null,"reason"?: Database["public"]['Enums']["report_reason"],"ref"?: string,"reported_at"?: string | null,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolved_at"?: string | null,"severity"?: Database["public"]['Enums']["report_severity"],"snapshot"?: Json | null,"staff_only"?: boolean,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "reports_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"review_likes": {
                  Row: {
                    "created_at": string,"review_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"review_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_likes_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"book_id": string,"created_at": string,"edited_at": string | null,"id": string,"likes_count": number,"spoiler": boolean,"stars": number,"status": string,"user_id": string,"_review_json": Json | null
                  }
                  ComputedFields: "_review_json"
                  Insert: {
                    "body"?: string | null,"book_id": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"likes_count"?: number,"spoiler"?: boolean,"stars": number,"status"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"book_id"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"likes_count"?: number,"spoiler"?: boolean,"stars"?: number,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "reviews_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"revision_diffs": {
                  Row: {
                    "added_chapter_uids": (string)[],"author_in_good_standing": boolean,"base_revision_id": string,"changed_chapter_uids": (string)[],"changed_pct": number,"chapters_added": number,"chapters_removed": number,"cover_changed": boolean,"created_at": string,"deleted_words": number,"diff_key": string | null,"fast_lane_eligible": boolean,"inserted_words": number,"metadata_changed": boolean,"reasons": (string)[],"revision_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_chapter_uids"?: (string)[],"author_in_good_standing"?: boolean,"base_revision_id": string,"changed_chapter_uids"?: (string)[],"changed_pct"?: number,"chapters_added"?: number,"chapters_removed"?: number,"cover_changed"?: boolean,"created_at"?: string,"deleted_words"?: number,"diff_key"?: string | null,"fast_lane_eligible"?: boolean,"inserted_words"?: number,"metadata_changed"?: boolean,"reasons"?: (string)[],"revision_id": string
                  }
                  Update: {
                    "added_chapter_uids"?: (string)[],"author_in_good_standing"?: boolean,"base_revision_id"?: string,"changed_chapter_uids"?: (string)[],"changed_pct"?: number,"chapters_added"?: number,"chapters_removed"?: number,"cover_changed"?: boolean,"created_at"?: string,"deleted_words"?: number,"diff_key"?: string | null,"fast_lane_eligible"?: boolean,"inserted_words"?: number,"metadata_changed"?: boolean,"reasons"?: (string)[],"revision_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "revision_diffs_base_revision_id_fkey"
      columns: ["base_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "revision_diffs_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: true
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "level": Database["public"]['Enums']["permission_level"],"limit_note": string | null,"permission": string,"role": Database["public"]['Enums']["staff_role"],"second_person": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "level"?: Database["public"]['Enums']["permission_level"],"limit_note"?: string | null,"permission": string,"role": Database["public"]['Enums']["staff_role"],"second_person"?: boolean
                  }
                  Update: {
                    "level"?: Database["public"]['Enums']["permission_level"],"limit_note"?: string | null,"permission"?: string,"role"?: Database["public"]['Enums']["staff_role"],"second_person"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_fkey"
      columns: ["permission"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    }
                  ]
                },"room_code_attempts": {
                  Row: {
                    "attempted_at": string,"id": number,"success": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"id"?: never,"success": boolean,"user_id": string
                  }
                  Update: {
                    "attempted_at"?: string,"id"?: never,"success"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_code_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_code_attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"room_member_progress": {
                  Row: {
                    "chapter_index": number,"finished_at": string | null,"percent": number,"room_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chapter_index"?: number,"finished_at"?: string | null,"percent"?: number,"room_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "chapter_index"?: number,"finished_at"?: string | null,"percent"?: number,"room_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_member_progress_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "reading_rooms"
      referencedColumns: ["group_id"]
    },{
      foreignKeyName: "room_member_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_member_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"room_members_muted": {
                  Row: {
                    "created_at": string,"muted_by": string | null,"room_id": string,"until": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"muted_by"?: string | null,"room_id": string,"until": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"muted_by"?: string | null,"room_id"?: string,"until"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_members_muted_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_muted_muted_by_fkey"
      columns: ["muted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_muted_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "reading_rooms"
      referencedColumns: ["group_id"]
    },{
      foreignKeyName: "room_members_muted_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_members_muted_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_books": {
                  Row: {
                    "book_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_books_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "saved_books_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_books_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_books_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_books_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"search_events": {
                  Row: {
                    "created_at": string,"id": number,"query_norm": string,"result_count": number,"tapped_id": string | null,"tapped_type": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"query_norm": string,"result_count"?: number,"tapped_id"?: string | null,"tapped_type"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"query_norm"?: string,"result_count"?: number,"tapped_id"?: string | null,"tapped_type"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"search_promotions": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"position": number,"query_norm": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"position": number,"query_norm": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"position"?: number,"query_norm"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_promotions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "search_promotions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_promotions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_promotions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_promotions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"search_settings": {
                  Row: {
                    "id": boolean,"include_authors": boolean,"show_unreleased": boolean,"typo_distance": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"include_authors"?: boolean,"show_unreleased"?: boolean,"typo_distance"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "id"?: boolean,"include_authors"?: boolean,"show_unreleased"?: boolean,"typo_distance"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"search_synonyms": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"terms": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"terms": (string)[]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"terms"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_synonyms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_synonyms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"send_backs": {
                  Row: {
                    "id": string,"issues": NonNullable<Json>,"note": string | null,"reminded_at": string | null,"revision_id": string,"sent_at": string,"sent_by": string | null,"source": Database["public"]['Enums']["send_back_source"]
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"issues"?: NonNullable<Json>,"note"?: string | null,"reminded_at"?: string | null,"revision_id": string,"sent_at"?: string,"sent_by"?: string | null,"source": Database["public"]['Enums']["send_back_source"]
                  }
                  Update: {
                    "id"?: string,"issues"?: NonNullable<Json>,"note"?: string | null,"reminded_at"?: string | null,"revision_id"?: string,"sent_at"?: string,"sent_by"?: string | null,"source"?: Database["public"]['Enums']["send_back_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "send_backs_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "send_backs_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "send_backs_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shelf_drafts": {
                  Row: {
                    "editor_id": string | null,"excluded": boolean,"item_id": string,"item_type": string,"pinned": boolean,"position": number,"section_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "editor_id"?: string | null,"excluded"?: boolean,"item_id": string,"item_type": string,"pinned"?: boolean,"position"?: number,"section_id": string,"updated_at"?: string
                  }
                  Update: {
                    "editor_id"?: string | null,"excluded"?: boolean,"item_id"?: string,"item_type"?: string,"pinned"?: boolean,"position"?: number,"section_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shelf_drafts_editor_id_fkey"
      columns: ["editor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shelf_drafts_editor_id_fkey"
      columns: ["editor_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shelf_drafts_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "home_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"shelf_items": {
                  Row: {
                    "excluded": boolean,"item_id": string,"item_type": string,"pinned": boolean,"position": number,"section_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "excluded"?: boolean,"item_id": string,"item_type": string,"pinned"?: boolean,"position"?: number,"section_id": string
                  }
                  Update: {
                    "excluded"?: boolean,"item_id"?: string,"item_type"?: string,"pinned"?: boolean,"position"?: number,"section_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shelf_items_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "home_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"shelf_tap_counts": {
                  Row: {
                    "position": number,"section_key": string,"taps": number,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "position": number,"section_key": string,"taps"?: number,"week_start": string
                  }
                  Update: {
                    "position"?: number,"section_key"?: string,"taps"?: number,"week_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_alert_prefs": {
                  Row: {
                    "enabled": boolean,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"kind": string,"user_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_alert_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_alert_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_auth_failures": {
                  Row: {
                    "at": string,"email": string | null,"id": number,"kind": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"email"?: string | null,"id"?: never,"kind": string,"user_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"email"?: string | null,"id"?: never,"kind"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"staff_backup_codes": {
                  Row: {
                    "code_hash": string,"created_at": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_backup_codes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_backup_codes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_backup_sessions": {
                  Row: {
                    "session_id": string,"user_id": string,"verified_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "session_id": string,"user_id": string,"verified_at"?: string
                  }
                  Update: {
                    "session_id"?: string,"user_id"?: string,"verified_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_backup_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_backup_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_user_id": string | null,"created_at": string,"email": string,"expires_at": string,"full_name": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["staff_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"full_name": string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["staff_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_user_id"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"full_name"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_invites_accepted_user_id_fkey"
      columns: ["accepted_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_invites_accepted_user_id_fkey"
      columns: ["accepted_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_notes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_notes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_roles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"disabled_at": string | null,"disabled_by": string | null,"last_active_at": string | null,"phone": string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disabled_at"?: string | null,"disabled_by"?: string | null,"last_active_at"?: string | null,"phone"?: string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"disabled_at"?: string | null,"disabled_by"?: string | null,"last_active_at"?: string | null,"phone"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_roles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_disabled_by_fkey"
      columns: ["disabled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_disabled_by_fkey"
      columns: ["disabled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_stepups": {
                  Row: {
                    "consumed_at": string | null,"id": string,"method": string,"proof_at": string,"scope": string,"user_id": string,"verified_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string | null,"id"?: string,"method": string,"proof_at": string,"scope": string,"user_id": string,"verified_at"?: string
                  }
                  Update: {
                    "consumed_at"?: string | null,"id"?: string,"method"?: string,"proof_at"?: string,"scope"?: string,"user_id"?: string,"verified_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_stepups_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_stepups_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "auto_renew": boolean,"created_at": string,"ended_at": string | null,"flutterwave_plan_id": string | null,"id": string,"last_event_at": string,"pause_until": string | null,"pending_plan_code": string | null,"period_end": string,"period_start": string,"plan_code": string,"reminder_sent_for": string | null,"status": string,"store": string,"store_original_txn_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_renew"?: boolean,"created_at"?: string,"ended_at"?: string | null,"flutterwave_plan_id"?: string | null,"id"?: string,"last_event_at"?: string,"pause_until"?: string | null,"pending_plan_code"?: string | null,"period_end": string,"period_start"?: string,"plan_code": string,"reminder_sent_for"?: string | null,"status": string,"store"?: string,"store_original_txn_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auto_renew"?: boolean,"created_at"?: string,"ended_at"?: string | null,"flutterwave_plan_id"?: string | null,"id"?: string,"last_event_at"?: string,"pause_until"?: string | null,"pending_plan_code"?: string | null,"period_end"?: string,"period_start"?: string,"plan_code"?: string,"reminder_sent_for"?: string | null,"status"?: string,"store"?: string,"store_original_txn_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_pending_plan_code_fkey"
      columns: ["pending_plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "subscriptions_plan_fk"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_macros": {
                  Row: {
                    "body": string,"category": Database["public"]['Enums']["ticket_category"] | null,"created_at": string,"created_by": string | null,"id": string,"title": string,"variables": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"category"?: Database["public"]['Enums']["ticket_category"] | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"title": string,"variables"?: (string)[]
                  }
                  Update: {
                    "body"?: string,"category"?: Database["public"]['Enums']["ticket_category"] | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"title"?: string,"variables"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_macros_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_macros_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "assignee_id": string | null,"book_id": string | null,"category": Database["public"]['Enums']["ticket_category"],"channel": Database["public"]['Enums']["ticket_channel"],"context": Json | null,"created_at": string,"email": string | null,"first_replied_at": string | null,"first_reply_due_at": string,"id": string,"last_message_at": string,"linked_ticket_id": string | null,"ref": string,"reopen_until": string | null,"solved_at": string | null,"status": Database["public"]['Enums']["ticket_status"],"subject": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"category"?: Database["public"]['Enums']["ticket_category"],"channel": Database["public"]['Enums']["ticket_channel"],"context"?: Json | null,"created_at"?: string,"email"?: string | null,"first_replied_at"?: string | null,"first_reply_due_at"?: string,"id"?: string,"last_message_at"?: string,"linked_ticket_id"?: string | null,"ref"?: string,"reopen_until"?: string | null,"solved_at"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"subject": string,"user_id"?: string | null
                  }
                  Update: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"category"?: Database["public"]['Enums']["ticket_category"],"channel"?: Database["public"]['Enums']["ticket_channel"],"context"?: Json | null,"created_at"?: string,"email"?: string | null,"first_replied_at"?: string | null,"first_reply_due_at"?: string,"id"?: string,"last_message_at"?: string,"linked_ticket_id"?: string | null,"ref"?: string,"reopen_until"?: string | null,"solved_at"?: string | null,"status"?: Database["public"]['Enums']["ticket_status"],"subject"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "support_tickets_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_linked_ticket_id_fkey"
      columns: ["linked_ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "created_at": string,"id": string,"merged_into": string | null,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"merged_into"?: string | null,"name": string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"merged_into"?: string | null,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_merged_into_fkey"
      columns: ["merged_into"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_messages": {
                  Row: {
                    "attachments": NonNullable<Json>,"author_id": string | null,"body": string,"created_at": string,"email_message_id": string | null,"id": string,"kind": Database["public"]['Enums']["ticket_message_kind"],"macro_id": string | null,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: NonNullable<Json>,"author_id"?: string | null,"body": string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["ticket_message_kind"],"macro_id"?: string | null,"ticket_id": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"author_id"?: string | null,"body"?: string,"created_at"?: string,"email_message_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["ticket_message_kind"],"macro_id"?: string | null,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_messages_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_messages_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_messages_macro_id_fkey"
      columns: ["macro_id"]
isOneToOne: false
      referencedRelation: "support_macros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"tips": {
                  Row: {
                    "author_id": string,"book_id": string | null,"created_at": string,"credits": number,"from_user_id": string,"id": string,"ledger_id": number,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"book_id"?: string | null,"created_at"?: string,"credits": number,"from_user_id": string,"id"?: string,"ledger_id": number,"note"?: string | null
                  }
                  Update: {
                    "author_id"?: string,"book_id"?: string | null,"created_at"?: string,"credits"?: number,"from_user_id"?: string,"id"?: string,"ledger_id"?: number,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tips_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "tips_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_from_user_id_fkey"
      columns: ["from_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_from_user_id_fkey"
      columns: ["from_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_ledger_id_fkey"
      columns: ["ledger_id"]
isOneToOne: false
      referencedRelation: "credit_ledger"
      referencedColumns: ["id"]
    }
                  ]
                },"topup_products": {
                  Row: {
                    "active": boolean,"code": string,"credits": number,"play_product_id": string,"price_kobo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"credits": number,"play_product_id": string,"price_kobo": number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"credits"?: number,"play_product_id"?: string,"price_kobo"?: number
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "created_at": string,"credits_granted": number,"fee_kobo": number,"flag": string | null,"gross_kobo": number,"id": string,"kind": string,"net_kobo": number | null,"period_start": string | null,"plan_code": string | null,"refunded_kobo": number,"status": string,"store": string,"store_txn_id": string,"subscription_id": string | null,"topup_code": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credits_granted"?: number,"fee_kobo"?: number,"flag"?: string | null,"gross_kobo"?: number,"id"?: string,"kind": string,"net_kobo"?: never,"period_start"?: string | null,"plan_code"?: string | null,"refunded_kobo"?: number,"status"?: string,"store": string,"store_txn_id": string,"subscription_id"?: string | null,"topup_code"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"credits_granted"?: number,"fee_kobo"?: number,"flag"?: string | null,"gross_kobo"?: number,"id"?: string,"kind"?: string,"net_kobo"?: never,"period_start"?: string | null,"plan_code"?: string | null,"refunded_kobo"?: number,"status"?: string,"store"?: string,"store_txn_id"?: string,"subscription_id"?: string | null,"topup_code"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "transactions_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_topup_code_fkey"
      columns: ["topup_code"]
isOneToOne: false
      referencedRelation: "topup_products"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"unmatched_store_events": {
                  Row: {
                    "app_user_id": string | null,"event_id": string,"id": number,"note": string | null,"product_id": string | null,"provider": string,"received_at": string,"resolved_at": string | null,"resolved_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "app_user_id"?: string | null,"event_id": string,"id"?: never,"note"?: string | null,"product_id"?: string | null,"provider": string,"received_at"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null
                  }
                  Update: {
                    "app_user_id"?: string | null,"event_id"?: string,"id"?: never,"note"?: string | null,"product_id"?: string | null,"provider"?: string,"received_at"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string,"source_group_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string,"source_group_id"?: string | null
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string,"source_group_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_source_group_id_fkey"
      columns: ["source_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"user_devices": {
                  Row: {
                    "app_version": string | null,"created_at": string,"device_key": string,"download_enabled": boolean,"id": string,"last_city": string | null,"last_seen_at": string,"model": string | null,"os": string | null,"push_disabled_at": string | null,"push_platform": string,"push_token": string | null,"push_token_at": string | null,"revoked_at": string | null,"revoked_by": string | null,"session_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"device_key": string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_disabled_at"?: string | null,"push_platform"?: string,"push_token"?: string | null,"push_token_at"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"session_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"device_key"?: string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_disabled_at"?: string | null,"push_platform"?: string,"push_token"?: string | null,"push_token_at"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"session_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_genres": {
                  Row: {
                    "created_at": string,"genre_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"genre_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"genre_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_genres_genre_id_fkey"
      columns: ["genre_id"]
isOneToOne: false
      referencedRelation: "genre_book_counts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_genres_genre_id_fkey"
      columns: ["genre_id"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_genres_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_genres_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_sanctions": {
                  Row: {
                    "action_id": string | null,"created_at": string,"ends_at": string | null,"id": string,"kind": Database["public"]['Enums']["sanction_kind"],"starts_at": string,"state": Database["public"]['Enums']["sanction_state"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_id"?: string | null,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["sanction_kind"],"starts_at"?: string,"state"?: Database["public"]['Enums']["sanction_state"],"user_id": string
                  }
                  Update: {
                    "action_id"?: string | null,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["sanction_kind"],"starts_at"?: string,"state"?: Database["public"]['Enums']["sanction_state"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_sanctions_action_id_fkey"
      columns: ["action_id"]
isOneToOne: false
      referencedRelation: "moderation_actions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_sanctions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_sanctions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "book_effective": {
                  Row: {
                    "book_id": string,"effective_preview_percent": number | null,"effective_price": number | null,"revision_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "books_current_revision_fk"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_books": {
                  Row: {
                    "author_avatar": string | null,"author_id": string,"author_name": string,"author_norm": string | null,"cover_key": string | null,"genre": string | null,"genres": (string)[],"id": string,"pages": number | null,"price_credits": number | null,"published_at": string | null,"subtitle": string | null,"title": string,"title_norm": string | null,"words": number | null,"_book_json": Json | null
                  }
                  ComputedFields: "_book_json"
                  Relationships: [
                    {
      foreignKeyName: "books_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "books_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"genre_book_counts": {
                  Row: {
                    "book_count": number | null,"id": string,"name": string,"position": number,"slug": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                           "book_count"?: never,"id"?: string | null,"name"?: string | null,"position"?: number | null,"slug"?: string | null,"visible"?: boolean | null
                         }
                        Update: {
                           "book_count"?: never,"id"?: string | null,"name"?: string | null,"position"?: number | null,"slug"?: string | null,"visible"?: boolean | null
                         }
                        Relationships: [
                    
                  ]
                },"library_items": {
                  Row: {
                    "book_id": string | null,"chapter_uid": string | null,"finished": boolean | null,"finished_at": string | null,"gift_from_id": string | null,"hidden": boolean | null,"last_opened_at": string | null,"max_percent": number | null,"my_stars": number | null,"opened": boolean | null,"owns_book": boolean | null,"percent": number | null,"reading": boolean | null,"revision_id": string | null,"saved_at": string | null,"saved_row": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "reading_progress_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"passage_counts": {
                  Row: {
                    "book_id": string,"count": number | null,"para_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "book_effective"
      referencedColumns: ["book_id"]
    },{
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passage_comments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "catalog_books"
      referencedColumns: ["id"]
    }
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"full_name": string,"id": string,"is_author": boolean,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"bio"?: string | null,"full_name"?: string | null,"id"?: string | null,"is_author"?: boolean | null,"username"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"bio"?: string | null,"full_name"?: string | null,"id"?: string | null,"is_author"?: boolean | null,"username"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_actor":
{ Args: { "p_actor": string,"p_allow_system"?: boolean,"p_fn": string,"p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: string
                           },
"_agreement_version":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_annotation_counts":
{ Args: { "p_user": string }; Returns: Json
                           },
"_annotation_json":
{ Args: { "a": Omit<Database["public"]['Tables']["annotations"]['Row'], Database["public"]['Tables']["annotations"]['ComputedFields']> }; Returns: Json
                           },
"_app_event":
{ Args: { "p_actor": string,"p_app": string,"p_kind": Database["public"]['Enums']["application_event_kind"],"p_note"?: string }; Returns: undefined
                           },
"_applicant_view":
{ Args: { "v": Omit<Database["public"]['Tables']["author_applications"]['Row'], Database["public"]['Tables']["author_applications"]['ComputedFields']> }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "author_applications"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"_application_checks":
{ Args: { "p_app": string }; Returns: Json
                           },
"_apply_book_price":
{ Args: { "p_price": number,"p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_apply_counts":
{ Args: { "p_result": Json,"p_rev": string }; Returns: undefined
                           },
"_apply_sanction":
{ Args: { "p_action": string,"p_days": number,"p_kind": Database["public"]['Enums']["sanction_kind"],"p_pending"?: boolean,"p_user": string }; Returns: string
                           },
"_approval_roles":
{ Args: { "p_decide": boolean,"p_kind": string }; Returns: (Database["public"]['Enums']["staff_role"])[]
                           },
"_attach_waiting_payouts":
{ Args: { "p_account": string }; Returns: number
                           },
"_audit":
{ Args: { "p_action": string,"p_actor": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id": string,"p_object_label"?: string,"p_object_type": string,"p_reason"?: string,"p_summary"?: string }; Returns: undefined
                           },
"_audit_as":
{ Args: { "p_action": string,"p_actor": string,"p_after": Json,"p_area": string,"p_before": Json,"p_object_id": string,"p_object_label": string,"p_object_type": string,"p_reason": string,"p_summary": string }; Returns: number
                           },
"_author_dm":
{ Args: { "p_author": string,"p_reader": string }; Returns: string
                           },
"_author_earning_rows":
{ Args: { "p_author": string,"p_from": string,"p_to": string }; Returns: {
              "at": string,"book_id": string,"credits": number,"earned_kobo": number,"reason": Database["public"]['Enums']["ledger_reason"]
            }[]
                           },
"_author_extra":
{ Args: { "p_author": string }; Returns: Json
                           },
"_author_month":
{ Args: { "p_author": string,"p_month": string }; Returns: Json
                           },
"_author_name":
{ Args: { "p_author": string }; Returns: string
                           },
"_author_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_author_pen_name":
{ Args: { "p_author": string }; Returns: string
                           },
"_author_state":
{ Args: { "p_author": string }; Returns: string
                           },
"_balance":
{ Args: { "p_user": string }; Returns: number
                           },
"_balance_of":
{ Args: { "p_user": string }; Returns: number
                           },
"_banner_target_ok":
{ Args: { "p_target": Json }; Returns: boolean
                           },
"_book_card":
{ Args: { "p_book": string }; Returns: Json
                           },
"_book_json":
{ Args: { "c": Omit<Database["public"]['Views']["catalog_books"]['Row'], Database["public"]['Views']["catalog_books"]['ComputedFields']> }; Returns: Json
                           },
"_book_progress":
{ Args: { "p_book": string,"p_user": string }; Returns: Record<string, unknown>
                           },
"_books_finished":
{ Args: { "p_user": string,"p_year"?: number }; Returns: number
                           },
"_bucket":
{ Args: { "p_bucket": Database["public"]['Enums']["ledger_bucket"],"p_user": string }; Returns: number
                           },
"_buyable_book":
{ Args: { "p_book": string }; Returns: {
              "access_removed_at": string | null,
"author_id": string,
"claim_hold_at": string | null,
"comments_count": number,
"created_at": string,
"current_revision_id": string | null,
"description": string | null,
"genres": (string)[],
"id": string,
"new_arrival_until": string | null,
"preview_override_percent": number | null,
"preview_override_reason": string | null,
"price_override_credits": number | null,
"price_override_reason": string | null,
"reads_count": number,
"status": Database["public"]['Enums']["book_status"],
"subtitle": string | null,
"tags": (string)[],
"title": string,
"unpublish_reason": Database["public"]['Enums']["unpublish_reason"] | null,
"unpublished_at": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "books"
        isOneToOne: true
        isSetofReturn: false
      } },
"_can_claims":
{ Args: { "p_decide": boolean }; Returns: boolean
                           },
"_can_draft_push":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_can_help":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_chapter_access":
{ Args: { "p_book": string,"p_rev": string,"p_user": string }; Returns: {
              "access": string,"chapter_uid": string,"ord": number
            }[]
                           },
"_chapter_charge":
{ Args: { "p_ledger": number }; Returns: {
              "book_id": string,"chapter_id": string,"charged_at": string,"credits": number,"kobo": number,"txn_id": string,"user_id": string
            }[]
                           },
"_chapter_paid":
{ Args: { "p_book": string,"p_user": string }; Returns: number
                           },
"_chapter_prices_ok":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_charge_undone":
{ Args: { "p_at": string,"p_chapter": string,"p_user": string }; Returns: boolean
                           },
"_check_spend_rate":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_check_super_admins":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_close_cycle":
{ Args: { "p_month": string }; Returns: Json
                           },
"_comment_row":
{ Args: { "c": Omit<Database["public"]['Tables']["post_comments"]['Row'], Database["public"]['Tables']["post_comments"]['ComputedFields']>,"p_post_author": string,"p_viewer": string }; Returns: Json
                           },
"_config":
{ Args: { "p_key": string }; Returns: Json
                           },
"_consume_stepup":
{ Args: { "p_id": string,"p_scope": string }; Returns: string
                           },
"_create_club":
{ Args: { "p_name": string,"p_owner": string }; Returns: string
                           },
"_create_notification":
{ Args: { "p_actor"?: string,"p_body"?: string,"p_book"?: string,"p_category": string,"p_kind": string,"p_target_id"?: string,"p_target_type"?: string,"p_title": string,"p_user": string }; Returns: string
                           },
"_cycle_end":
{ Args: { "p_month": string }; Returns: string
                           },
"_cycle_ledger":
{ Args: { "p_month": string }; Returns: Json
                           },
"_cycle_start":
{ Args: { "p_month": string }; Returns: string
                           },
"_dm_block":
{ Args: { "p_author": string,"p_reader": string }; Returns: string
                           },
"_do_credit_return":
{ Args: { "p_actor": string,"p_return": string }; Returns: string
                           },
"_earning_settings":
{ Args: Record<PropertyKey, never>; Returns: {
              "changed_by": string | null,
"effective_from": string,
"gift_loop_detection": boolean,
"hold_days": number,
"id": number,
"min_payout_kobo": number,
"note": string | null,
"payout_day": number
            }
                          SetofOptions: {
        from: "*"
        to: "earning_settings"
        isOneToOne: true
        isSetofReturn: false
      } },
"_end_room":
{ Args: { "p_room": string }; Returns: undefined
                           },
"_erase_account_base":
{ Args: { "p_deletion": string }; Returns: boolean
                           },
"_event_plan_code":
{ Args: { "n": Json }; Returns: string
                           },
"_event_topup_code":
{ Args: { "n": Json }; Returns: string
                           },
"_expand":
{ Args: { "p_words": (string)[] }; Returns: (string)[]
                           },
"_expire_subscription":
{ Args: { "p_status"?: string,"p_sub": string }; Returns: number
                           },
"_fast_lane_check":
{ Args: { "p_rev": string }; Returns: (string)[]
                           },
"_finished":
{ Args: { "p_book": string,"p_user": string }; Returns: boolean
                           },
"_fulfil_requests":
{ Args: { "p_book": string }; Returns: undefined
                           },
"_genre_name":
{ Args: { "p_slug": string }; Returns: string
                           },
"_has_link_or_phone":
{ Args: { "p_text": string }; Returns: boolean
                           },
"_has_staff_role":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[],"p_user": string }; Returns: boolean
                           },
"_in_bands":
{ Args: { "p_bands": (string)[],"p_price": number }; Returns: boolean
                           },
"_in_library":
{ Args: { "p_book": string,"p_user": string }; Returns: boolean
                           },
"_insert_flags":
{ Args: { "p_flags": Json,"p_rev": string,"p_source": Database["public"]['Enums']["flag_source"] }; Returns: number
                           },
"_insights_guard":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"_is_active_staff":
{ Args: { "p_user": string }; Returns: boolean
                           },
"_is_new_account":
{ Args: { "p_user": string }; Returns: boolean
                           },
"_is_revision_author":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_is_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_join_room":
{ Args: { "p_confirm": boolean,"r": Omit<Database["public"]['Tables']["reading_rooms"]['Row'], Database["public"]['Tables']["reading_rooms"]['ComputedFields']> }; Returns: Json
                           },
"_lagos_year":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_latest_hourly":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_ledger_add":
{ Args: { "p_actor"?: string,"p_bucket": Database["public"]['Enums']["ledger_bucket"],"p_delta": number,"p_expires"?: string,"p_key": string,"p_meta"?: Json,"p_note"?: string,"p_reason": Database["public"]['Enums']["ledger_reason"],"p_ref_id"?: string,"p_ref_type"?: string,"p_txn": string,"p_user": string }; Returns: number
                           },
"_line_status":
{ Args: { "p_author": string,"p_min": number,"p_payable": number }; Returns: {
              "held_reason": string,"status": Database["public"]['Enums']["author_earning_status"]
            }[]
                           },
"_lock_revision":
{ Args: { "p_rev": string }; Returns: {
              "age_rating": string | null,
"anchors_moved": Json | null,
"artifact_prefix": string | null,
"assigned_to": string | null,
"base_revision_id": string | null,
"book_id": string,
"chapters_confirmed_at": string | null,
"content_notes": (string)[],
"converted_key": string | null,
"converted_sha256": string | null,
"cover_key": string | null,
"cover_sha256": string | null,
"created_at": string,
"created_via": Database["public"]['Enums']["revision_origin"],
"desk_claimed_by": string | null,
"desk_lease_until": string | null,
"desk_reason": string | null,
"draft_step": Database["public"]['Enums']["draft_step"] | null,
"due_at": string | null,
"fast_lane": boolean,
"file_bytes": number | null,
"free_through_ord": number,
"generation": number,
"id": string,
"isbn": string | null,
"language": string | null,
"last_activity_at": string | null,
"late_alerted_at": string | null,
"manifest_key": string | null,
"meta": NonNullable<Json>,
"no_explicit": boolean,
"notify_followers": boolean,
"pages": number | null,
"preview_cut_chapter_uid": string | null,
"preview_cut_para_id": string | null,
"preview_percent": number | null,
"price_credits": number | null,
"published_at": string | null,
"published_by": string | null,
"publisher": string | null,
"readiness": number,
"review_opened_at": string | null,
"revision_no": number,
"routed_at": string | null,
"schedule_at": string | null,
"sealed_generation": number | null,
"sealed_work_version": number | null,
"sent_back_note": string | null,
"source_key": string | null,
"source_sha256": string | null,
"source_type": Database["public"]['Enums']["source_type"] | null,
"status": Database["public"]['Enums']["revision_status"],
"status_reason": string | null,
"steps": NonNullable<Json>,
"submitted_at": string | null,
"updated_at": string,
"uploaded_by": string | null,
"words": number | null,
"work_version": number
            }
                          SetofOptions: {
        from: "*"
        to: "book_revisions"
        isOneToOne: true
        isSetofReturn: false
      } },
"_mask_phone":
{ Args: { "p": string }; Returns: string
                           },
"_mask_pii":
{ Args: { "p": Json }; Returns: Json
                           },
"_match":
{ Args: { "p_q": string,"p_text": string,"p_typo": number }; Returns: number
                           },
"_me":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_mid_paygo":
{ Args: { "p_book": string }; Returns: number
                           },
"_month_start":
{ Args: { "p_month": string }; Returns: string
                           },
"_mute_room_member":
{ Args: { "p_room": string,"p_until": string,"p_user": string }; Returns: undefined
                           },
"_my_open_application":
{ Args: Record<PropertyKey, never>; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"_my_subscription":
{ Args: { "p_user": string }; Returns: {
              "auto_renew": boolean,
"created_at": string,
"ended_at": string | null,
"flutterwave_plan_id": string | null,
"id": string,
"last_event_at": string,
"pause_until": string | null,
"pending_plan_code": string | null,
"period_end": string,
"period_start": string,
"plan_code": string,
"reminder_sent_for": string | null,
"status": string,
"store": string,
"store_original_txn_id": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "subscriptions"
        isOneToOne: true
        isSetofReturn: false
      } },
"_next_wat_midnight":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_open_failures":
{ Args: { "p_cycle": string }; Returns: {
              "amount_kobo": number,
"api_errors": number,
"attempt": number,
"author_earning_id": string,
"author_id": string,
"bank_account_id": string | null,
"failure_reason": string | null,
"flutterwave_transfer_id": string | null,
"id": string,
"not_before": string,
"queued_at": string,
"raised_at": string | null,
"reference": string,
"retry_of": string | null,
"run_id": string,
"sent_at": string | null,
"settled_at": string | null,
"status": Database["public"]['Enums']["payout_status"],
"waiting_for_account": boolean
            }[]
                          SetofOptions: {
        from: "*"
        to: "payouts"
        isOneToOne: false
        isSetofReturn: true
      } },
"_owns_book":
{ Args: { "p_book": string,"p_user": string }; Returns: boolean
                           },
"_para_percent":
{ Args: { "p_para": string,"p_rev": string }; Returns: number
                           },
"_para_readable":
{ Args: { "p_book": string,"p_chapter": string,"p_para": string,"p_rev": string,"p_user": string }; Returns: boolean
                           },
"_passage_comment_json":
{ Args: { "p_author": string,"p_max_ord": number,"p_user": string,"pc": Omit<Database["public"]['Tables']["passage_comments"]['Row'], Database["public"]['Tables']["passage_comments"]['ComputedFields']> }; Returns: Json
                           },
"_passage_reached":
{ Args: { "p_book": string,"p_para": string,"p_user": string }; Returns: boolean
                           },
"_payable_account":
{ Args: { "p_author": string }; Returns: string
                           },
"_payout_date":
{ Args: { "p_closed_at": string,"p_hold_days": number,"p_payout_day": number }; Returns: string
                           },
"_payout_reference":
{ Args: { "p_attempt": number,"p_author": string,"p_month": string }; Returns: string
                           },
"_perm_level":
{ Args: { "p_permission": string }; Returns: Database["public"]['Enums']["permission_level"]
                           },
"_pipeline_defaults":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"_pipeline_setting":
{ Args: { "p_section": string }; Returns: Json
                           },
"_plan":
{ Args: { "p_code": string }; Returns: Json
                           },
"_plan_check":
{ Args: { "p_plans"?: Json,"p_rules": Json }; Returns: Json
                           },
"_plan_state":
{ Args: { "p_user": string }; Returns: Json
                           },
"_policy_latest":
{ Args: { "p_policy": string }; Returns: {
              "accept_again": boolean,
"body": string,
"change_summary": string | null,
"edited_at": string,
"edited_by": string | null,
"id": string,
"policy_id": string,
"published_at": string | null,
"published_by": string | null,
"status": string,
"version": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "policy_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"_post_block_for_base":
{ Args: { "p_group": string,"p_user": string }; Returns: {
              "reason": string,"until": string
            }[]
                           },
"_publish_now":
{ Args: { "p_actor": string,"p_mode": string,"p_notify": boolean,"p_rev": string }; Returns: Json
                           },
"_raise":
{ Args: { "p_code": string,"p_detail"?: Json }; Returns: undefined
                           },
"_readable_revision":
{ Args: { "p_book": string,"p_user": string }; Returns: {
              "age_rating": string | null,
"anchors_moved": Json | null,
"artifact_prefix": string | null,
"assigned_to": string | null,
"base_revision_id": string | null,
"book_id": string,
"chapters_confirmed_at": string | null,
"content_notes": (string)[],
"converted_key": string | null,
"converted_sha256": string | null,
"cover_key": string | null,
"cover_sha256": string | null,
"created_at": string,
"created_via": Database["public"]['Enums']["revision_origin"],
"desk_claimed_by": string | null,
"desk_lease_until": string | null,
"desk_reason": string | null,
"draft_step": Database["public"]['Enums']["draft_step"] | null,
"due_at": string | null,
"fast_lane": boolean,
"file_bytes": number | null,
"free_through_ord": number,
"generation": number,
"id": string,
"isbn": string | null,
"language": string | null,
"last_activity_at": string | null,
"late_alerted_at": string | null,
"manifest_key": string | null,
"meta": NonNullable<Json>,
"no_explicit": boolean,
"notify_followers": boolean,
"pages": number | null,
"preview_cut_chapter_uid": string | null,
"preview_cut_para_id": string | null,
"preview_percent": number | null,
"price_credits": number | null,
"published_at": string | null,
"published_by": string | null,
"publisher": string | null,
"readiness": number,
"review_opened_at": string | null,
"revision_no": number,
"routed_at": string | null,
"schedule_at": string | null,
"sealed_generation": number | null,
"sealed_work_version": number | null,
"sent_back_note": string | null,
"source_key": string | null,
"source_sha256": string | null,
"source_type": Database["public"]['Enums']["source_type"] | null,
"status": Database["public"]['Enums']["revision_status"],
"status_reason": string | null,
"steps": NonNullable<Json>,
"submitted_at": string | null,
"updated_at": string,
"uploaded_by": string | null,
"words": number | null,
"work_version": number
            }
                          SetofOptions: {
        from: "*"
        to: "book_revisions"
        isOneToOne: true
        isSetofReturn: false
      } },
"_reader_plan":
{ Args: { "p_user": string }; Returns: Json
                           },
"_reader_tab":
{ Args: { "p_deleted": boolean,"p_plan": Json }; Returns: string
                           },
"_readers_7d":
{ Args: Record<PropertyKey, never>; Returns: {
              "book_id": string,"readers": number,"unlocks": number
            }[]
                           },
"_refresh_rating_stats":
{ Args: { "p_book": string }; Returns: undefined
                           },
"_remaining":
{ Args: { "p_book": string,"p_user": string }; Returns: number
                           },
"_replace_chapters":
{ Args: { "p_chapters": Json,"p_rev": string }; Returns: undefined
                           },
"_reply_label":
{ Args: { "p_author": string }; Returns: string
                           },
"_report":
{ Args: { "p_book": string,"p_details": string,"p_reason": Database["public"]['Enums']["report_reason"],"p_snapshot": Json,"p_target": string,"p_type": Database["public"]['Enums']["report_content_type"],"p_user": string }; Returns: string
                           },
"_report_target":
{ Args: { "p_id": string,"p_type": Database["public"]['Enums']["report_content_type"],"p_viewer": string }; Returns: {
              "book_id": string,"group_id": string,"reported_user": string,"snapshot": Json
            }[]
                           },
"_report_visible_to_me":
{ Args: { "r": Omit<Database["public"]['Tables']["reports"]['Row'], Database["public"]['Tables']["reports"]['ComputedFields']> }; Returns: boolean
                           },
"_repriced":
{ Args: { "p_new": Json,"p_old": Json,"p_pages": number }; Returns: {
              "pages": number,"price": number
            }[]
                           },
"_require_full":
{ Args: { "p_permission": string }; Returns: undefined
                           },
"_require_money_staff":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_payout_staff":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_payout_super":
{ Args: { "p_fresh"?: boolean }; Returns: undefined
                           },
"_require_price_staff":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_service":
{ Args: { "p_fn": string }; Returns: undefined
                           },
"_require_trust_staff":
{ Args: { "p_fn": string,"p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: string
                           },
"_rescore":
{ Args: { "p_rev": string }; Returns: number
                           },
"_review_json":
{ Args: { "r": Omit<Database["public"]['Tables']["reviews"]['Row'], Database["public"]['Tables']["reviews"]['ComputedFields']> }; Returns: Json
                           },
"_rollout_bucket":
{ Args: { "p_key": string,"p_user": string }; Returns: number
                           },
"_room_behind":
{ Args: { "p_chapter": number,"r": Omit<Database["public"]['Tables']["reading_rooms"]['Row'], Database["public"]['Tables']["reading_rooms"]['ComputedFields']> }; Returns: number
                           },
"_room_book_card":
{ Args: { "p_book": string }; Returns: Json
                           },
"_room_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_route":
{ Args: { "p_rev": string }; Returns: Database["public"]['Enums']["revision_status"]
                           },
"_rules":
{ Args: { "p_at"?: string }; Returns: Json
                           },
"_rules_version":
{ Args: { "p_at"?: string }; Returns: string
                           },
"_search_authors":
{ Args: { "p_q": string }; Returns: {
              "avatar_url": string,"books": number,"id": string,"name": string,"score": number
            }[]
                           },
"_search_books":
{ Args: { "p_q": string }; Returns: {
              "id": string,"promoted": boolean,"score": number,"snippet": string
            }[]
                           },
"_section":
{ Args: { "p_id": string }; Returns: {
              "config": NonNullable<Json>,
"id": string,
"key": string,
"kind": string,
"position": number,
"title": string,
"updated_at": string,
"updated_by": string | null,
"visible": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "home_sections"
        isOneToOne: true
        isSetofReturn: false
      } },
"_section_items":
{ Args: { "h": Omit<Database["public"]['Tables']["home_sections"]['Row'], Database["public"]['Tables']["home_sections"]['ComputedFields']>,"p_uid": string }; Returns: Json
                           },
"_send_back":
{ Args: { "p_actor": string,"p_issues": Json,"p_note": string,"p_rev": string,"p_source": Database["public"]['Enums']["send_back_source"] }; Returns: string
                           },
"_set_author_follow":
{ Args: { "p_author": string,"p_follow": boolean }; Returns: Json
                           },
"_set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_set_content_state":
{ Args: { "p_id": string,"p_state": string,"p_type": Database["public"]['Enums']["report_content_type"] }; Returns: undefined
                           },
"_settle_payout":
{ Args: { "p_payout": string,"p_reason": string,"p_status": Database["public"]['Enums']["payout_status"] }; Returns: boolean
                           },
"_small":
{ Args: { "p": number }; Returns: number
                           },
"_snippet":
{ Args: { "p_text": string,"p_word": string }; Returns: string
                           },
"_spread_price":
{ Args: { "p_price": number,"p_rev": string }; Returns: undefined
                           },
"_staff_acts_on_readers":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_staff_name":
{ Args: { "p_user": string }; Returns: string
                           },
"_staff_support":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_start_deletion":
{ Args: { "p_by": string,"p_erase_after": string,"p_grace_until": string,"p_reason": string,"p_user": string,"p_via": string }; Returns: {
              "blocked_reason": string | null,
"completed_at": string | null,
"erase_after": string,
"grace_until": string | null,
"id": string,
"reason": string | null,
"requested_at": string,
"requested_by": string | null,
"requested_via": string,
"status": Database["public"]['Enums']["deletion_status"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "account_deletions"
        isOneToOne: true
        isSetofReturn: false
      } },
"_step":
{ Args: { "p_rev": string,"p_step": string }; Returns: undefined
                           },
"_story_hits":
{ Args: { "p_q": string }; Returns: {
              "book_id": string,"snippet": string
            }[]
                           },
"_sync_auth_ban":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_sync_room_progress":
{ Args: { "p_book": string,"p_chapter": number,"p_finished_at"?: string,"p_percent": number,"p_user": string }; Returns: Json
                           },
"_threshold":
{ Args: { "p_key": string }; Returns: number
                           },
"_transfer_status_applies":
{ Args: { "p_current": Database["public"]['Enums']["payout_status"],"p_next": Database["public"]['Enums']["payout_status"] }; Returns: boolean
                           },
"_trust_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_trust_staff":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"_try_inet":
{ Args: { "p": string }; Returns: unknown
                           },
"_uid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_undo_chapter":
{ Args: { "p_key": string,"p_ledger": number,"p_staff": boolean,"p_user": string }; Returns: Json
                           },
"_unpaid_earnings_kobo":
{ Args: { "p_user": string }; Returns: number
                           },
"_validate_rules":
{ Args: { "p": Json }; Returns: Json
                           },
"_validate_target":
{ Args: { "p_allow_web": boolean,"p_target": Json }; Returns: undefined
                           },
"_version_cmp":
{ Args: { "a": string,"b": string }; Returns: number
                           },
"accept_policy":
{ Args: { "p_version": string }; Returns: undefined
                           },
"accept_staff_invite":
{ Args: { "p_token_hash": string,"p_user": string }; Returns: Database["public"]['Enums']["staff_role"]
                           },
"ack_dm_cost":
{ Args: { "p_author": string }; Returns: Json
                           },
"active_sanction":
{ Args: { "p_user": string }; Returns: {
              "ends_at": string,"kind": Database["public"]['Enums']["sanction_kind"]
            }[]
                           },
"add_comment":
{ Args: { "p_body": string,"p_client_id": string,"p_parent": string,"p_post": string }; Returns: Json
                           },
"add_ticket_note":
{ Args: { "p_body": string,"p_ticket": string }; Returns: string
                           },
"admin_application_checks":
{ Args: { "p_app": string }; Returns: Json
                           },
"admin_author":
{ Args: { "p_user": string }; Returns: Json
                           },
"admin_author_payout":
{ Args: { "p_author": string }; Returns: Json
                           },
"admin_author_social":
{ Args: { "p_user": string }; Returns: Json
                           },
"admin_authors":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_bank_account":
{ Args: { "p_account": string }; Returns: Json
                           },
"admin_bank_accounts":
{ Args: { "p_status"?: string }; Returns: Json
                           },
"admin_book_access":
{ Args: { "p_book": string }; Returns: Json
                           },
"admin_book_stats":
{ Args: { "p_book": string }; Returns: Json
                           },
"admin_community_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_create_official_channel":
{ Args: { "p_description": string,"p_name": string,"p_visibility"?: Database["public"]['Enums']["group_visibility"],"p_who_can_post"?: Database["public"]['Enums']["group_who_can_post"] }; Returns: string
                           },
"admin_credits_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"admin_earning_cycle":
{ Args: { "p_cycle": string }; Returns: Json
                           },
"admin_earning_cycles":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_earning_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_appeal":
{ Args: { "p_appeal": string }; Returns: Json
                           },
"admin_get_automod":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_get_channel":
{ Args: { "p_group": string }; Returns: Json
                           },
"admin_get_claim":
{ Args: { "p_claim": string }; Returns: Json
                           },
"admin_get_help":
{ Args: { "p_article": string }; Returns: Json
                           },
"admin_get_report":
{ Args: { "p_report": string }; Returns: Json
                           },
"admin_get_room":
{ Args: { "p_room": string }; Returns: Json
                           },
"admin_get_ticket":
{ Args: { "p_ticket": string }; Returns: Json
                           },
"admin_list_appeals":
{ Args: { "p_status"?: string }; Returns: {
              "created_at": string,"due_at": string,"id": string,"late": boolean,"original_decider_name": string,"original_decision": string,"status": Database["public"]['Enums']["appeal_status"],"subject_id": string,"subject_type": Database["public"]['Enums']["appeal_subject"],"summary": string,"user_id": string,"user_name": string
            }[]
                           },
"admin_list_channels":
{ Args: { "p_kind"?: string,"p_q"?: string,"p_reports"?: boolean,"p_status"?: string }; Returns: {
              "created_at": string,"id": string,"kind": Database["public"]['Enums']["group_kind"],"locked_until": string,"member_count": number,"messages_7d": number,"muted_until": string,"name": string,"open_reports": number,"owner_id": string,"owner_name": string,"slow_mode_seconds": number,"status": string,"visibility": Database["public"]['Enums']["group_visibility"],"who_can_post": Database["public"]['Enums']["group_who_can_post"]
            }[]
                           },
"admin_list_claims":
{ Args: { "p_status"?: string }; Returns: {
              "author_due_at": string,"author_name": string,"book_id": string,"book_title": string,"claimant_name": string,"created_at": string,"due_at": string,"held": boolean,"id": string,"late": boolean,"ref": string,"status": Database["public"]['Enums']["claim_status"],"type": Database["public"]['Enums']["claim_type"]
            }[]
                           },
"admin_list_credit_returns":
{ Args: { "p_state"?: Database["public"]['Enums']["credit_return_state"] }; Returns: {
              "book_title": string,"chapter_title": string,"created_at": string,"credits": number,"id": string,"reason": Database["public"]['Enums']["credit_return_reason"],"requested_by_name": string,"state": Database["public"]['Enums']["credit_return_state"],"user_id": string,"user_name": string
            }[]
                           },
"admin_list_help":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": Database["public"]['Enums']["help_category"],"has_draft": boolean,"helpful_pct": number,"id": string,"needs_rewrite": boolean,"shows_in": (string)[],"slug": string,"state": string,"title": string,"updated_at": string,"views_30d": number,"votes_30d": number
            }[]
                           },
"admin_list_reports":
{ Args: { "p_assignee"?: string,"p_limit"?: number,"p_offset"?: number,"p_reason"?: Database["public"]['Enums']["report_reason"],"p_severity"?: Database["public"]['Enums']["report_severity"],"p_tab"?: string,"p_type"?: string }; Returns: {
              "assignee_id": string,"assignee_name": string,"author_name": string,"brigading": boolean,"content_id": string,"content_type": Database["public"]['Enums']["report_content_type"],"created_at": string,"due_at": string,"escalated": boolean,"id": string,"late": boolean,"outcome": Database["public"]['Enums']["report_outcome"],"place": string,"quote": string,"reason": Database["public"]['Enums']["report_reason"],"ref": string,"reporters": number,"severity": Database["public"]['Enums']["report_severity"],"status": Database["public"]['Enums']["report_status"],"total": number
            }[]
                           },
"admin_list_rooms":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_tab"?: string }; Returns: {
              "book_title": string,"code": string,"ended_at": string,"host_name": string,"live_count": number,"member_count": number,"name": string,"open_reports": number,"room_id": string,"starts_at": string,"state": Database["public"]['Enums']["room_state"],"total": number
            }[]
                           },
"admin_list_tickets":
{ Args: { "p_category"?: Database["public"]['Enums']["ticket_category"],"p_channel"?: Database["public"]['Enums']["ticket_channel"],"p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_tab"?: string }; Returns: {
              "assignee_id": string,"assignee_name": string,"category": Database["public"]['Enums']["ticket_category"],"channel": Database["public"]['Enums']["ticket_channel"],"created_at": string,"email": string,"first_replied_at": string,"first_reply_due_at": string,"id": string,"last_message_at": string,"reader_name": string,"ref": string,"status": Database["public"]['Enums']["ticket_status"],"subject": string,"total": number,"user_id": string
            }[]
                           },
"admin_mute_member":
{ Args: { "p_group": string,"p_reason"?: string,"p_until": string,"p_user": string }; Returns: undefined
                           },
"admin_payout":
{ Args: { "p_payout": string }; Returns: Json
                           },
"admin_payouts":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_status"?: string }; Returns: Json
                           },
"admin_pending_bans":
{ Args: Record<PropertyKey, never>; Returns: {
              "action_id": string,"created_at": string,"decided_by_name": string,"is_minor": boolean,"reason": string,"user_id": string,"user_name": string
            }[]
                           },
"admin_report_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_return_preview":
{ Args: { "p_ledger": number }; Returns: Json
                           },
"admin_revenue_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"admin_room_action":
{ Args: { "p_action": string,"p_reason"?: string,"p_room": string,"p_until"?: string,"p_user"?: string }; Returns: Json
                           },
"admin_room_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_set_book_price":
{ Args: { "p_book": string,"p_price": number,"p_prices": Json,"p_reason": string }; Returns: Json
                           },
"admin_set_channel_state":
{ Args: { "p_field": string,"p_group": string,"p_reason"?: string,"p_until": string }; Returns: undefined
                           },
"admin_set_preview":
{ Args: { "p_book": string,"p_percent": number,"p_reason": string }; Returns: undefined
                           },
"admin_ticket_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_update_channel":
{ Args: { "p_group": string,"p_patch": Json,"p_reason"?: string }; Returns: undefined
                           },
"am_group_member":
{ Args: { "p_group": string }; Returns: boolean
                           },
"analytics_rollup":
{ Args: { "p_from": string,"p_to": string }; Returns: number
                           },
"analytics_rollup_recent":
{ Args: { "p_days"?: number }; Returns: number
                           },
"application_similarity_corpus":
{ Args: { "p_app": string }; Returns: {
              "body": string,"id": string,"mine": boolean
            }[]
                           },
"application_sla":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"apply_payment_event":
{ Args: { "p_event": number }; Returns: string
                           },
"apply_pricing_rules":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"apply_push_receipts":
{ Args: { "p_rows": Json }; Returns: number
                           },
"approve_credit_return":
{ Args: { "p_approve": boolean,"p_return": string }; Returns: undefined
                           },
"assign_application":
{ Args: { "p_actor"?: string,"p_app": string,"p_staff"?: string }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"assign_report":
{ Args: { "p_report": string,"p_user"?: string }; Returns: undefined
                           },
"at_marketing_cap":
{ Args: { "p_at"?: string,"p_user": string }; Returns: boolean
                           },
"audience_members":
{ Args: { "p_audience": Json }; Returns: string[]
                           },
"audit_fast_lane":
{ Args: { "p_actor"?: string,"p_note": string,"p_result": Database["public"]['Enums']["fast_lane_result"],"p_rev": string }; Returns: undefined
                           },
"author_in_good_standing":
{ Args: { "p_author": string }; Returns: boolean
                           },
"author_queue_ack":
{ Args: { "p_msg_id": number,"p_queue": string }; Returns: boolean
                           },
"author_queue_read":
{ Args: { "p_qty"?: number,"p_queue": string,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"author_stats_refresh":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"automod_value":
{ Args: { "p_key": string }; Returns: Json
                           },
"ban_tag":
{ Args: { "p_word": string }; Returns: undefined
                           },
"banner_event":
{ Args: { "p_banner": string,"p_kind": string }; Returns: undefined
                           },
"banner_live_state":
{ Args: { "b": Omit<Database["public"]['Tables']["banners"]['Row'], Database["public"]['Tables']["banners"]['ComputedFields']>,"p_at"?: string }; Returns: Database["public"]['Enums']["banner_state"]
                           },
"begin_reseal":
{ Args: { "p_actor": string,"p_rev": string }; Returns: Json
                           },
"block_user":
{ Args: { "p_at"?: string,"p_source_group"?: string,"p_user": string }; Returns: string
                           },
"book_queue_ack":
{ Args: { "p_archive"?: boolean,"p_msg_id": number,"p_queue": string }; Returns: boolean
                           },
"book_queue_read":
{ Args: { "p_qty"?: number,"p_queue": string,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"campaign_ab_wait":
{ Args: { "p_ab": Json,"p_counts": Json,"p_id": string }; Returns: undefined
                           },
"campaign_audience":
{ Args: { "p_campaign": string }; Returns: {
              "reason": string,"user_id": string
            }[]
                           },
"campaign_reach":
{ Args: { "p_audience": Json,"p_is_service"?: boolean,"p_skip_capped"?: boolean }; Returns: Json
                           },
"campaign_recipients":
{ Args: { "p_at"?: string,"p_audience": Json,"p_is_service": boolean,"p_skip_capped": boolean }; Returns: {
              "reason": string,"user_id": string
            }[]
                           },
"campaign_set_ab":
{ Args: { "p_ab": Json,"p_id": string }; Returns: undefined
                           },
"campaign_variant_stats":
{ Args: { "p_id": string }; Returns: Json
                           },
"can_moderate":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_quote":
{ Args: { "p_book": string,"p_chapter": number,"p_user": string }; Returns: boolean
                           },
"can_read_reports":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_read_room_annotation":
{ Args: { "p_room": string }; Returns: boolean
                           },
"can_support":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"cancel_pricing_rules":
{ Args: { "p_id": string }; Returns: undefined
                           },
"change_staff_role":
{ Args: { "p_role": Database["public"]['Enums']["staff_role"],"p_user": string }; Returns: undefined
                           },
"claim_ask_author":
{ Args: { "p_claim": string,"p_days"?: number,"p_note"?: string }; Returns: undefined
                           },
"claim_download_slot":
{ Args: { "p_device_key": string }; Returns: boolean
                           },
"claim_due_campaigns":
{ Args: { "p_limit"?: number }; Returns: {
              "ab_test": Json | null,
"audience": NonNullable<Json>,
"body": string,
"confirmed_reach": number | null,
"counts": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"id": string,
"is_service": boolean,
"moved_from": string | null,
"open_target": NonNullable<Json>,
"quiet_override_reason": string | null,
"reach": number | null,
"resend_unopened": boolean,
"respect_quiet": boolean,
"review_requested_at": string | null,
"reviewed_by": string | null,
"send_at": string | null,
"sent_at": string | null,
"skip_capped": boolean,
"source_campaign_id": string | null,
"status": Database["public"]['Enums']["campaign_status"],
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "campaigns"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_revision":
{ Args: { "p_actor"?: string,"p_rev": string,"p_screen": string,"p_take_over"?: boolean }; Returns: Json
                           },
"clawback_purchase":
{ Args: { "p_credits"?: number,"p_end_sub"?: boolean,"p_reason": string,"p_transaction": string }; Returns: Json
                           },
"clear_staff_signin_failures":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"close_cycle":
{ Args: { "p_month": string }; Returns: Json
                           },
"close_cycle_due":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"community_admin":
{ Args: { "p_edit": boolean }; Returns: boolean
                           },
"complete_application_checks":
{ Args: { "p_app": string,"p_checks": Json }; Returns: undefined
                           },
"complete_refund":
{ Args: { "p_flutterwave_refund_id"?: string,"p_ok": boolean,"p_request": string }; Returns: Json
                           },
"complete_rescore":
{ Args: { "p_chapter_uids": (string)[],"p_check_keys"?: (string)[],"p_flags": Json,"p_result"?: Json,"p_rev": string,"p_work_version": number }; Returns: Json
                           },
"complete_seal":
{ Args: { "p_generation": number,"p_rev": string,"p_seal": Json }; Returns: Json
                           },
"complete_verify":
{ Args: { "p_generation": number,"p_result": Json,"p_rev": string }; Returns: Json
                           },
"confirm_ban":
{ Args: { "p_action": string,"p_confirm"?: boolean }; Returns: undefined
                           },
"confirm_chapters":
{ Args: { "p_actor": string,"p_result": Json,"p_rev": string }; Returns: Json
                           },
"count_books":
{ Args: { "p_genre"?: string,"p_length_bands"?: (string)[] }; Returns: number
                           },
"create_appeal":
{ Args: { "p_subject_id": string,"p_subject_type": Database["public"]['Enums']["appeal_subject"],"p_text": string }; Returns: string
                           },
"create_notification":
{ Args: { "p_actor"?: string,"p_body"?: string,"p_book"?: string,"p_category": string,"p_kind": string,"p_target_id"?: string,"p_target_type"?: string,"p_title": string,"p_user": string }; Returns: string
                           },
"create_promo":
{ Args: { "p_amount": number,"p_campaign_tag": string,"p_code": string,"p_ends_at": string,"p_kind": string,"p_max_uses": number,"p_new_readers_only": boolean,"p_starts_at": string,"p_uses_per_reader": number,"p_web_only": boolean }; Returns: string
                           },
"create_reading_room":
{ Args: { "p_book": string,"p_join_policy"?: Database["public"]['Enums']["room_join_policy"],"p_name": string,"p_pace"?: Database["public"]['Enums']["room_pace"],"p_starts_at"?: string }; Returns: Json
                           },
"create_report":
{ Args: { "p_also_block"?: boolean,"p_at"?: string,"p_content_id": string,"p_content_type": Database["public"]['Enums']["report_content_type"],"p_details"?: string,"p_reason": Database["public"]['Enums']["report_reason"] }; Returns: string
                           },
"create_revision":
{ Args: { "p_book"?: string,"p_meta": Json }; Returns: Json
                           },
"create_staff_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"create_support_ticket":
{ Args: { "p_body": string,"p_book"?: string,"p_category": Database["public"]['Enums']["ticket_category"],"p_context"?: Json,"p_subject": string }; Returns: string
                           },
"credit_balance":
{ Args: { "p_user": string }; Returns: number
                           },
"decide_appeal":
{ Args: { "p_appeal": string,"p_outcome": Database["public"]['Enums']["appeal_status"],"p_reduce_to_days"?: number,"p_reply"?: string }; Returns: undefined
                           },
"decide_application":
{ Args: { "p_actor"?: string,"p_allow_reapply"?: boolean,"p_app": string,"p_decision": string,"p_info_request"?: string,"p_info_step"?: number,"p_reason"?: string }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"decide_approval":
{ Args: { "p_approve": boolean,"p_id": string,"p_reason"?: string }; Returns: {
              "approver_id": string | null,
"created_at": string,
"decided_at": string | null,
"expires_at": string,
"id": string,
"kind": string,
"payload": NonNullable<Json>,
"reason": string | null,
"requested_by": string,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "approval_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"decide_claim":
{ Args: { "p_claim": string,"p_decision": string,"p_note": string }; Returns: undefined
                           },
"decide_credit_grant":
{ Args: { "p_approve": boolean,"p_request": string }; Returns: Json
                           },
"decide_refund":
{ Args: { "p_amount_kobo"?: number,"p_note"?: string,"p_refund": boolean,"p_request": string,"p_type"?: string }; Returns: Json
                           },
"delete_annotation":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_automod_word":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_comment":
{ Args: { "p_comment": string }; Returns: Json
                           },
"delete_message":
{ Args: { "p_group"?: string,"p_message": string }; Returns: Json
                           },
"delete_review":
{ Args: { "p_review": string }; Returns: undefined
                           },
"desk_claim":
{ Args: { "p_actor"?: string,"p_rev"?: string }; Returns: Json
                           },
"desk_heartbeat":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: string
                           },
"desk_lease_reaper":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"desk_reject_unreadable":
{ Args: { "p_actor"?: string,"p_reason"?: string,"p_rev": string }; Returns: string
                           },
"disable_push_tokens":
{ Args: { "p_tokens": (string)[] }; Returns: number
                           },
"discard_shelf_draft":
{ Args: { "p_section": string }; Returns: undefined
                           },
"dismiss_banner":
{ Args: { "p_banner": string }; Returns: undefined
                           },
"draft_cleanup":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"due_account_deletions":
{ Args: { "p_limit"?: number }; Returns: string[]
                           },
"email_template_latest":
{ Args: { "p_key": string }; Returns: Json
                           },
"end_reading_room":
{ Args: { "p_room": string }; Returns: undefined
                           },
"engage_queue_done":
{ Args: { "p_msg_id": number,"p_queue": string }; Returns: boolean
                           },
"engage_queue_read":
{ Args: { "p_qty"?: number,"p_queue": string,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"enqueue_push":
{ Args: { "p_data"?: Json,"p_type": string,"p_user_ids": (string)[] }; Returns: number
                           },
"enqueue_reading_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"entitled_chapters":
{ Args: { "p_book": string,"p_revision"?: string }; Returns: Json
                           },
"erase_account":
{ Args: { "p_deletion": string }; Returns: boolean
                           },
"escalate_report":
{ Args: { "p_note"?: string,"p_report": string }; Returns: undefined
                           },
"exclude_gift_loop":
{ Args: { "p_ledger_ids": (number)[],"p_note"?: string }; Returns: number
                           },
"expire_exports":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"export_download_key":
{ Args: { "p_id": string }; Returns: string
                           },
"export_job":
{ Args: { "p_id": string }; Returns: Json
                           },
"export_pii_columns":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"export_rows":
{ Args: { "p_id": string,"p_limit": number,"p_offset": number }; Returns: Json
                           },
"finalize_revision":
{ Args: { "p_actor": string,"p_files": Json,"p_rev": string }; Returns: Json
                           },
"finish_campaign":
{ Args: { "p_counts": Json,"p_id": string }; Returns: undefined
                           },
"follow_author":
{ Args: { "p_author": string }; Returns: Json
                           },
"genre_pick_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "genre_id": string,"readers": number
            }[]
                           },
"get_active_banners":
{ Args: { "p_app_version"?: string,"p_placement": Database["public"]['Enums']["banner_placement"] }; Returns: Json
                           },
"get_all_set":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_app_config":
{ Args: { "p_app_version"?: string,"p_user"?: string }; Returns: Json
                           },
"get_audit_entry":
{ Args: { "p_id": number }; Returns: Json
                           },
"get_author_books":
{ Args: { "p_author": string }; Returns: {
              "avg_rating": number,"genres": (string)[],"id": string,"price_credits": number,"rating_count": number,"title": string
            }[]
                           },
"get_author_dm_costs":
{ Args: { "p_group": string,"p_limit"?: number }; Returns: {
              "cost_credits": number,"id": string
            }[]
                           },
"get_author_posts":
{ Args: { "p_author": string,"p_before"?: string,"p_limit"?: number }; Returns: {
              "comment_count": number,"excerpt": string,"id": string,"like_count": number,"liked": boolean,"published_at": string,"title": string
            }[]
                           },
"get_author_profile":
{ Args: { "p_author": string }; Returns: Json
                           },
"get_author_thread":
{ Args: { "p_author": string }; Returns: Json
                           },
"get_blocked":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"created_at": string,"full_name": string,"source_group_id": string,"source_kind": Database["public"]['Enums']["group_kind"],"source_name": string,"user_id": string
            }[]
                           },
"get_book_about":
{ Args: { "p_book": string }; Returns: Json
                           },
"get_book_discussion":
{ Args: { "p_book": string }; Returns: Json
                           },
"get_book_page":
{ Args: { "p_book": string }; Returns: Json
                           },
"get_config_screen":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_credits_screen":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: Json
                           },
"get_dm_reader":
{ Args: { "p_group": string }; Returns: Json
                           },
"get_gift_people":
{ Args: { "p_book": string,"p_query"?: string }; Returns: Json
                           },
"get_group":
{ Args: { "p_group": string }; Returns: Json
                           },
"get_group_access":
{ Args: { "p_group": string,"p_user": string }; Returns: Json
                           },
"get_help_article":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_help_articles":
{ Args: { "p_category"?: Database["public"]['Enums']["help_category"],"p_q"?: string }; Returns: {
              "category": Database["public"]['Enums']["help_category"],"excerpt": string,"id": string,"slug": string,"title": string
            }[]
                           },
"get_home":
{ Args: { "p_app_version"?: string }; Returns: Json
                           },
"get_inbox":
{ Args: { "p_cursor"?: string,"p_cursor_id"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "avatar_url": string,"group_id": string,"is_author": boolean,"kind": Database["public"]['Enums']["group_kind"],"last_at": string,"last_body": string,"last_from_author": boolean,"last_kind": Database["public"]['Enums']["message_kind"],"last_sender": string,"last_state": Database["public"]['Enums']["message_state"],"live": boolean,"member_count": number,"muted": boolean,"name": string,"other_user_id": string,"role": Database["public"]['Enums']["group_role"],"unread_count": number
            }[]
                           },
"get_inbox_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_library":
{ Args: { "p_after"?: Json,"p_limit"?: number,"p_shelf": string,"p_sort"?: string }; Returns: Json
                           },
"get_messages":
{ Args: { "p_before"?: string,"p_before_id"?: string,"p_group": string,"p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["message_kind"],"my_reaction": string,"pinned": boolean,"quote": Json,"reactions": Json,"reply_to": Json,"reply_to_id": string,"sender_avatar": string,"sender_id": string,"sender_is_author": boolean,"sender_name": string,"state": Database["public"]['Enums']["message_state"]
            }[]
                           },
"get_moderation_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_moderation":
{ Args: Record<PropertyKey, never>; Returns: {
              "action": Database["public"]['Enums']["moderation_action_kind"],"action_id": string,"appeal_status": Database["public"]['Enums']["appeal_status"],"can_appeal": boolean,"created_at": string,"ends_at": string,"message": string,"sanction_id": string
            }[]
                           },
"get_my_rooms":
{ Args: Record<PropertyKey, never>; Returns: {
              "book": Json,"finished_count": number,"is_host": boolean,"last_activity_at": string,"member_count": number,"my_percent": number,"name": string,"room_id": string,"starts_at": string,"state": Database["public"]['Enums']["room_state"],"unread": boolean
            }[]
                           },
"get_notification_preferences":
{ Args: Record<PropertyKey, never>; Returns: {
              "authors": boolean,
"clubs": boolean,
"note_replies": boolean,
"offers": boolean,
"quiet_enabled": boolean,
"quiet_end": string,
"quiet_start": string,
"reminders": boolean,
"timezone": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "notification_preferences"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_notifications":
{ Args: { "p_before"?: string,"p_category"?: string }; Returns: Json
                           },
"get_onboarding_paywall":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_passage_counts":
{ Args: { "p_book": string,"p_chapter_uids": (string)[] }; Returns: Json
                           },
"get_passage_thread":
{ Args: { "p_book": string,"p_para": string }; Returns: Json
                           },
"get_pending_policies":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_plan_screen":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_plans":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_post":
{ Args: { "p_post": string }; Returns: Json
                           },
"get_post_comments":
{ Args: { "p_after"?: string,"p_after_id"?: string,"p_limit"?: number,"p_post": string }; Returns: Json
                           },
"get_pricing_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_profile_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_reader_state":
{ Args: { "p_book": string }; Returns: Json
                           },
"get_recommendations":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"get_reviews":
{ Args: { "p_book": string,"p_limit"?: number,"p_offset"?: number,"p_stars"?: number }; Returns: Json
                           },
"get_revision_status":
{ Args: { "p_rev": string }; Returns: Json
                           },
"get_room":
{ Args: { "p_room": string }; Returns: Json
                           },
"get_room_annotations":
{ Args: { "p_room": string }; Returns: Json
                           },
"get_room_members":
{ Args: { "p_offset"?: number,"p_room": string }; Returns: {
              "avatar_url": string,"finished_at": string,"is_host": boolean,"is_me": boolean,"muted_until": string,"name": string,"percent": number,"user_id": string
            }[]
                           },
"get_room_messages":
{ Args: { "p_before"?: string,"p_before_id"?: string,"p_limit"?: number,"p_room": string }; Returns: {
              "body": string,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["message_kind"],"my_reaction": string,"pinned": boolean,"quote": Json,"reactions": Json,"reply_to": Json,"reply_to_id": string,"sender_avatar": string,"sender_id": string,"sender_is_author": boolean,"sender_name": string,"spoiler_chapter": number,"state": Database["public"]['Enums']["message_state"]
            }[]
                           },
"get_search_home":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_staff_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_staff_invite":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"get_top10":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"gift_book":
{ Args: { "p_book": string,"p_expected_price": number,"p_key": string,"p_message": string,"p_recipient": string }; Returns: Json
                           },
"grant_plan_credits":
{ Args: { "p_period_end": string,"p_period_start": string,"p_rollover"?: boolean,"p_sub": string,"p_txn_ref": string,"p_user": string }; Returns: number
                           },
"grant_topup":
{ Args: { "p_code": string,"p_from_webhook"?: boolean,"p_txn_ref": string,"p_user": string }; Returns: number
                           },
"has_blocked":
{ Args: { "p_user": string,"p_viewer": string }; Returns: boolean
                           },
"has_blocking_flag":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"has_permission":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"has_push_token":
{ Args: { "p_user": string }; Returns: boolean
                           },
"hide_reviewer":
{ Args: { "p_user": string }; Returns: undefined
                           },
"hold_push":
{ Args: { "p_drop_if_older"?: boolean,"p_payload": Json,"p_release_at": string,"p_type": string,"p_user": string }; Returns: number
                           },
"i_blocked":
{ Args: { "p_user": string }; Returns: boolean
                           },
"in_marketing_block":
{ Args: { "p_at"?: string }; Returns: boolean
                           },
"in_quiet_window":
{ Args: { "p_at": string,"p_end": string,"p_start": string,"p_tz": string }; Returns: boolean
                           },
"inbox_rows_for":
{ Args: { "p_user": string }; Returns: {
              "avatar_url": string,"group_id": string,"is_author": boolean,"kind": Database["public"]['Enums']["group_kind"],"last_at": string,"last_body": string,"last_from_author": boolean,"last_kind": Database["public"]['Enums']["message_kind"],"last_sender": string,"last_state": Database["public"]['Enums']["message_state"],"live": boolean,"member_count": number,"muted": boolean,"name": string,"other_user_id": string,"role": Database["public"]['Enums']["group_role"],"unread_count": number
            }[]
                           },
"ingest_payment_event":
{ Args: { "p_event_id": string,"p_event_type": string,"p_normalized": Json,"p_occurred_at": string,"p_payload": Json,"p_provider": string }; Returns: Json
                           },
"ingest_support_email":
{ Args: { "p_attachments"?: Json,"p_body": string,"p_from": string,"p_in_reply_to"?: string,"p_message_id": string,"p_subject": string }; Returns: Json
                           },
"invite_first_super_admin":
{ Args: { "p_email": string,"p_name": string,"p_token_hash": string }; Returns: string
                           },
"invite_staff":
{ Args: { "p_actor"?: string,"p_email": string,"p_name": string,"p_role": Database["public"]['Enums']["staff_role"],"p_token_hash": string }; Returns: string
                           },
"is_community_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_group_member":
{ Args: { "p_group": string,"p_user"?: string }; Returns: boolean
                           },
"is_group_mod":
{ Args: { "p_group": string,"p_user"?: string }; Returns: boolean
                           },
"is_minor":
{ Args: { "p_user": string }; Returns: boolean
                           },
"is_room_host":
{ Args: { "p_room": string,"p_user"?: string }; Returns: boolean
                           },
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"is_staff_any":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"job_credit_daily_snapshot":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"job_expire_ended_subscriptions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"job_ledger_reconcile":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"job_renewal_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"job_resume_paused_web":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"join_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"join_open_room":
{ Args: { "p_confirm"?: boolean,"p_room": string }; Returns: Json
                           },
"join_reading_room":
{ Args: { "p_code": string,"p_confirm"?: boolean }; Returns: Json
                           },
"launch_check":
{ Args: { "p_live_target"?: number }; Returns: Json
                           },
"leave_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"leave_reading_room":
{ Args: { "p_room": string }; Returns: undefined
                           },
"lift_pause":
{ Args: { "p_author": string,"p_note"?: string }; Returns: undefined
                           },
"like_post":
{ Args: { "p_liked": boolean,"p_post": string }; Returns: Json
                           },
"link_book_request":
{ Args: { "p_book": string,"p_ids": (string)[] }; Returns: number
                           },
"list_audit":
{ Args: { "p_action"?: string,"p_actor"?: string,"p_area"?: string,"p_from"?: string,"p_page"?: number,"p_per"?: number,"p_q"?: string,"p_to"?: string }; Returns: Json
                           },
"list_books":
{ Args: { "p_cursor"?: Json,"p_genre"?: string,"p_length_bands"?: (string)[],"p_limit"?: number,"p_sort"?: string }; Returns: Json
                           },
"list_collection":
{ Args: { "p_cursor"?: string,"p_kind": string,"p_limit"?: number,"p_query"?: string }; Returns: Json
                           },
"list_integrations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_my_devices":
{ Args: { "p_device_key"?: string }; Returns: Json
                           },
"list_open_rooms":
{ Args: { "p_book"?: string,"p_limit"?: number,"p_offset"?: number }; Returns: {
              "book": Json,"finished_count": number,"joined": boolean,"member_count": number,"name": string,"room_id": string,"starts_at": string,"state": Database["public"]['Enums']["room_state"]
            }[]
                           },
"list_policies":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"email": string,"expires_at": string,"full_name": string,"id": string,"invited_by_name": string,"is_self": boolean,"kind": string,"last_active_at": string,"mfa_on": boolean,"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"log_pushes":
{ Args: { "p_rows": Json }; Returns: (number)[]
                           },
"log_reading_session":
{ Args: { "p_active_seconds": number,"p_book": string,"p_client_id": string,"p_device_id": string,"p_ended_at": string,"p_started_at": string }; Returns: undefined
                           },
"log_search":
{ Args: { "p_q": string,"p_result_count": number,"p_tapped_id"?: string,"p_tapped_type"?: string }; Returns: undefined
                           },
"log_shelf_taps":
{ Args: { "p_taps": Json }; Returns: undefined
                           },
"log_unmatched_store_event":
{ Args: { "p_app_user_id": string,"p_event_id": string,"p_product_id": string,"p_provider": string }; Returns: boolean
                           },
"make_username":
{ Args: { "p_name": string }; Returns: string
                           },
"mark_all_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_all_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_notification_read":
{ Args: { "p_id": string }; Returns: number
                           },
"mark_pushes_sent":
{ Args: { "p_rows": Json }; Returns: number
                           },
"mark_read":
{ Args: { "p_group": string,"p_up_to"?: string }; Returns: undefined
                           },
"marketing_pushes_7d":
{ Args: { "p_at"?: string,"p_user": string }; Returns: number
                           },
"merge_tags":
{ Args: { "p_from": (string)[],"p_into": string }; Returns: number
                           },
"migrate_anchors":
{ Args: { "p_base": string,"p_new": string }; Returns: Json
                           },
"moderate_passage_comment":
{ Args: { "p_comment": string,"p_reason": string,"p_status": string }; Returns: undefined
                           },
"mute_room_member":
{ Args: { "p_room": string,"p_until": string,"p_user": string }; Returns: undefined
                           },
"my_credit_balance":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_earning_cycles":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"month": string,"payout_date": string,"status": Database["public"]['Enums']["earning_cycle_status"]
            }[]
                           },
"norm_query":
{ Args: { "p": string }; Returns: string
                           },
"norm_words":
{ Args: { "p": string }; Returns: (string)[]
                           },
"normalise_room_code":
{ Args: { "p_code": string }; Returns: string
                           },
"note_audit_export":
{ Args: { "p_filters": Json,"p_rows": number }; Returns: undefined
                           },
"note_staff_code_failure":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"note_staff_signin_failure":
{ Args: { "p_email": string }; Returns: undefined
                           },
"notification_allowed":
{ Args: { "p_kind": string,"p_user": string }; Returns: boolean
                           },
"notification_pref":
{ Args: { "p_pref": string,"p_user": string }; Returns: boolean
                           },
"notify_lookup":
{ Args: { "p_books"?: (string)[],"p_follow_authors"?: (string)[],"p_roles"?: (string)[],"p_users"?: (string)[] }; Returns: Json
                           },
"notify_queue_done":
{ Args: { "p_msg_id": number,"p_queue": string }; Returns: boolean
                           },
"notify_queue_read":
{ Args: { "p_qty"?: number,"p_queue": string,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"onboarding_step_ord":
{ Args: { "p_step": string }; Returns: number
                           },
"pause_author_payouts":
{ Args: { "p_author": string,"p_note"?: string,"p_reason": string }; Returns: undefined
                           },
"pause_subscription":
{ Args: { "p_months": number }; Returns: Json
                           },
"payments_queue_ack":
{ Args: { "p_msg_id": number }; Returns: boolean
                           },
"payments_queue_read":
{ Args: { "p_qty"?: number,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"payout_apply_event":
{ Args: { "p_event_id": string,"p_reason"?: string,"p_reference": string,"p_status": Database["public"]['Enums']["payout_status"],"p_transient"?: boolean }; Returns: Json
                           },
"payout_for_transfer":
{ Args: { "p_payout": string }; Returns: Json
                           },
"payout_queue_ack":
{ Args: { "p_msg_id": number }; Returns: boolean
                           },
"payout_queue_read":
{ Args: { "p_qty"?: number,"p_vt"?: number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"payout_transfer_created":
{ Args: { "p_payout": string,"p_transfer_id": string }; Returns: undefined
                           },
"payout_transfer_error":
{ Args: { "p_message": string,"p_payout": string }; Returns: number
                           },
"payouts_pending_over":
{ Args: { "p_hours"?: number }; Returns: Json
                           },
"persist_messages":
{ Args: { "p_batch": Json }; Returns: Json
                           },
"pin_message":
{ Args: { "p_group": string,"p_message": string }; Returns: undefined
                           },
"pipeline_sla":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"post_block_for":
{ Args: { "p_group": string,"p_user": string }; Returns: {
              "reason": string,"until": string
            }[]
                           },
"post_passage_comment":
{ Args: { "p_body": string,"p_book": string,"p_para": string,"p_quote"?: string,"p_reveal_at_chapter_ord"?: number }; Returns: Json
                           },
"post_review":
{ Args: { "p_body": string,"p_book": string,"p_spoiler": boolean,"p_stars": number }; Returns: Json
                           },
"prepare_cycle":
{ Args: { "p_cycle": string,"p_flutterwave_balance_kobo"?: number }; Returns: Json
                           },
"preview_pricing_rules":
{ Args: { "p_rules": Json }; Returns: Json
                           },
"publish_due":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"publish_help_article":
{ Args: { "p_article": string,"p_version"?: string }; Returns: undefined
                           },
"publish_policy":
{ Args: { "p_accept_again": boolean,"p_change_summary": string,"p_policy": string,"p_stepup": string }; Returns: Json
                           },
"publish_revision":
{ Args: { "p_actor"?: string,"p_notify_followers"?: boolean,"p_rev": string,"p_schedule_at"?: string }; Returns: Json
                           },
"publish_shelf":
{ Args: { "p_section": string }; Returns: number
                           },
"pull_annotations":
{ Args: { "p_book": string,"p_since"?: string }; Returns: Json
                           },
"purge_deleted_messages":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"purge_discovery":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"purge_push_log":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"purge_room_transcripts":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"purge_snapshots":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"push_opened":
{ Args: { "p_push_id": number }; Returns: undefined
                           },
"push_prefs":
{ Args: { "p_user": string }; Returns: Json
                           },
"push_recipients":
{ Args: { "p_actor"?: string,"p_at"?: string,"p_group"?: string,"p_type": string,"p_user_ids": (string)[] }; Returns: {
              "author_pushed_today": boolean,"blocked": boolean,"group_muted": boolean,"is_minor": boolean,"marketing_7d": number,"prefs": Json,"tokens": (string)[],"user_id": string
            }[]
                           },
"push_status_rank":
{ Args: { "p": Database["public"]['Enums']["push_status"] }; Returns: number
                           },
"quiet_window_end":
{ Args: { "p_at": string,"p_end": string,"p_start": string,"p_tz": string }; Returns: string
                           },
"react":
{ Args: { "p_emoji": string,"p_group"?: string,"p_message": string }; Returns: Json
                           },
"react_passage_comment":
{ Args: { "p_comment": string,"p_kind": string,"p_on": boolean }; Returns: boolean
                           },
"reader_reply_ticket":
{ Args: { "p_body": string,"p_ticket": string }; Returns: undefined
                           },
"rebuild_book_related":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"recheck_cycle":
{ Args: { "p_cycle": string }; Returns: Json
                           },
"record_automod_hits":
{ Args: { "p_word_ids": (string)[] }; Returns: undefined
                           },
"record_email_event":
{ Args: { "p_kind": string,"p_resend_id": string }; Returns: undefined
                           },
"record_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_flag": string,"p_inverse": Json,"p_op": Json,"p_rev": string }; Returns: Json
                           },
"record_statement":
{ Args: { "p_author": string,"p_cycle": string,"p_file_key": string,"p_kind": Database["public"]['Enums']["statement_kind"] }; Returns: string
                           },
"redeem_promo":
{ Args: { "p_code": string }; Returns: Json
                           },
"refresh_member_counts":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"refresh_rankings":
{ Args: { "p_weekly"?: boolean }; Returns: undefined
                           },
"register_device":
{ Args: { "p_app_version"?: string,"p_device_key": string,"p_model"?: string,"p_os"?: string,"p_push_token"?: string }; Returns: boolean
                           },
"register_push_token":
{ Args: { "p_app_version"?: string,"p_device_id": string,"p_platform"?: string,"p_token": string }; Returns: undefined
                           },
"reinstate_author":
{ Args: { "p_actor"?: string,"p_reason"?: string,"p_user": string }; Returns: undefined
                           },
"reject_revision":
{ Args: { "p_actor"?: string,"p_reason": string,"p_rev": string }; Returns: undefined
                           },
"release_cycle":
{ Args: { "p_cycle": string }; Returns: Json
                           },
"release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
                           },
"remind_author":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: undefined
                           },
"remove_device":
{ Args: { "p_current_device_key"?: string,"p_device_id": string }; Returns: undefined
                           },
"remove_push_token":
{ Args: { "p_device_id": string }; Returns: undefined
                           },
"reorder_genres":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reorder_home_sections":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"reply_ticket":
{ Args: { "p_body": string,"p_macro"?: string,"p_solve"?: boolean,"p_ticket": string }; Returns: string
                           },
"report_book":
{ Args: { "p_book": string,"p_note"?: string,"p_reason": string }; Returns: string
                           },
"report_book_problem":
{ Args: { "p_book": string,"p_cfi": string,"p_chapter_uid": string,"p_note"?: string,"p_revision": string }; Returns: string
                           },
"report_due_at":
{ Args: { "p_from"?: string,"p_severity": Database["public"]['Enums']["report_severity"] }; Returns: string
                           },
"report_message":
{ Args: { "p_also_block"?: boolean,"p_details"?: string,"p_message": string,"p_reason": Database["public"]['Enums']["report_reason"] }; Returns: string
                           },
"report_reasons_for":
{ Args: { "p_type": Database["public"]['Enums']["report_content_type"] }; Returns: (Database["public"]['Enums']["report_reason"])[]
                           },
"report_review":
{ Args: { "p_note"?: string,"p_reason": string,"p_review": string }; Returns: string
                           },
"report_severity_for":
{ Args: { "p_reason": Database["public"]['Enums']["report_reason"] }; Returns: Database["public"]['Enums']["report_severity"]
                           },
"report_severity_setting":
{ Args: { "p_reason": Database["public"]['Enums']["report_reason"] }; Returns: Database["public"]['Enums']["report_severity"]
                           },
"republish_book":
{ Args: { "p_actor"?: string,"p_book": string }; Returns: Json
                           },
"request_account_deletion":
{ Args: { "p_confirm_text": string }; Returns: {
              "blocked_reason": string | null,
"completed_at": string | null,
"erase_after": string,
"grace_until": string | null,
"id": string,
"reason": string | null,
"requested_at": string,
"requested_by": string | null,
"requested_via": string,
"status": Database["public"]['Enums']["deletion_status"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "account_deletions"
        isOneToOne: true
        isSetofReturn: false
      } },
"request_approval":
{ Args: { "p_kind": string,"p_payload": Json,"p_reason"?: string }; Returns: {
              "approver_id": string | null,
"created_at": string,
"decided_at": string | null,
"expires_at": string,
"id": string,
"kind": string,
"payload": NonNullable<Json>,
"reason": string | null,
"requested_by": string,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "approval_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"request_book":
{ Args: { "p_q": string }; Returns: number
                           },
"request_integration_check":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"request_refund":
{ Args: { "p_reason": string,"p_transaction": string }; Returns: string
                           },
"require_community_admin":
{ Args: { "p_edit": boolean }; Returns: undefined
                           },
"require_permission":
{ Args: { "p_permission": string }; Returns: undefined
                           },
"reset_staff_mfa":
{ Args: { "p_user": string }; Returns: undefined
                           },
"resolve_audience":
{ Args: { "p_campaign": string }; Returns: string[]
                           },
"resolve_unmatched_store_event":
{ Args: { "p_id": number,"p_note": string }; Returns: undefined
                           },
"respond_to_claim":
{ Args: { "p_claim": string,"p_response": string }; Returns: undefined
                           },
"restore_annotation":
{ Args: { "p_id": string }; Returns: undefined
                           },
"restore_my_account":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"resume_subscription":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"retry_payout":
{ Args: { "p_confirmed"?: boolean,"p_mode": string,"p_payout": string }; Returns: Json
                           },
"revert_to_revision":
{ Args: { "p_actor"?: string,"p_reason": string,"p_rev": string }; Returns: Json
                           },
"review_bank_account":
{ Args: { "p_account": string,"p_decision": string,"p_reason"?: string }; Returns: Json
                           },
"revision_links":
{ Args: { "p_rev": string }; Returns: Json
                           },
"revision_score":
{ Args: { "p_rev": string }; Returns: number
                           },
"revisions_needing_search_text":
{ Args: { "p_limit"?: number }; Returns: {
              "revision_id": string,"work_version": number
            }[]
                           },
"revoke_staff_invite":
{ Args: { "p_invite": string }; Returns: undefined
                           },
"roll_over":
{ Args: { "p_key": string,"p_plan": string,"p_txn": string,"p_until": string,"p_user": string }; Returns: Json
                           },
"rollback_ota":
{ Args: { "p_stepup": string }; Returns: Json
                           },
"room_lifecycle":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"room_staff":
{ Args: { "p_edit": boolean }; Returns: boolean
                           },
"rotate_integration_key":
{ Args: { "p_service": string,"p_stepup": string }; Returns: number
                           },
"rotate_trending":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"sanction_expiry":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"save_application_draft":
{ Args: { "p_patch": Json }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_automod_word":
{ Args: { "p_action": string,"p_category": string,"p_id"?: string,"p_is_phrase": boolean,"p_scope": string,"p_text": string }; Returns: string
                           },
"save_book":
{ Args: { "p_book": string }; Returns: undefined
                           },
"save_coming_soon":
{ Args: { "p_book": string,"p_release_at"?: string,"p_teaser": string }; Returns: {
              "book_id": string,
"created_at": string,
"id": string,
"notify_count": number,
"release_at": string | null,
"teaser": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "coming_soon_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_earning_settings":
{ Args: { "p_gift_loop_detection": boolean,"p_hold_days": number,"p_min_payout_kobo": number,"p_note"?: string,"p_payout_day": number }; Returns: {
              "changed_by": string | null,
"effective_from": string,
"gift_loop_detection": boolean,
"hold_days": number,
"id": number,
"min_payout_kobo": number,
"note": string | null,
"payout_day": number
            }
                          SetofOptions: {
        from: "*"
        to: "earning_settings"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_help_draft":
{ Args: { "p_article": string,"p_body": string,"p_category": Database["public"]['Enums']["help_category"],"p_shows_in": (string)[],"p_slug": string,"p_title": string }; Returns: Json
                           },
"save_onboarding_step":
{ Args: { "p_payload"?: Json,"p_step": string }; Returns: {
              "avatar_url": string | null,
"bio": string | null,
"country": string,
"created_at": string,
"date_of_birth": string | null,
"deleted_at": string | null,
"deletion_requested_at": string | null,
"erased_at": string | null,
"full_name": string,
"id": string,
"interests": (string)[],
"is_author": boolean,
"is_reader": boolean,
"library_view": string,
"name_changes": (string)[],
"onboarding_step": string,
"phone": string | null,
"privacy_version": number | null,
"reader_settings": NonNullable<Json>,
"reader_theme": Database["public"]['Enums']["reader_theme"],
"signup_intent": Database["public"]['Enums']["signup_intent"] | null,
"terms_accepted_at": string | null,
"terms_version": number | null,
"theme": Database["public"]['Enums']["app_theme"],
"updated_at": string,
"username": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_plan":
{ Args: { "p_badge": string,"p_bonus": number,"p_code": string,"p_credits": number,"p_effective_from": string,"p_name": string,"p_note"?: string,"p_price_web_kobo": number }; Returns: Json
                           },
"save_policy_draft":
{ Args: { "p_body": string,"p_change_summary"?: string,"p_policy": string }; Returns: string
                           },
"save_pricing_rules":
{ Args: { "p_expected_version": number,"p_note"?: string,"p_rules": Json,"p_stepup": string }; Returns: Json
                           },
"save_search_tuning":
{ Args: { "p": Json }; Returns: undefined
                           },
"save_shelf_draft":
{ Args: { "p_items": Json,"p_section": string }; Returns: number
                           },
"save_support_macro":
{ Args: { "p_body": string,"p_category"?: Database["public"]['Enums']["ticket_category"],"p_id"?: string,"p_title": string }; Returns: string
                           },
"seal_failed":
{ Args: { "p_generation": number,"p_rev": string }; Returns: boolean
                           },
"search":
{ Args: { "p_genre"?: string,"p_length_bands"?: (string)[],"p_q": string,"p_scope"?: string }; Returns: Json
                           },
"search_communities":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_type"?: string }; Returns: {
              "avatar_url": string,"description": string,"id": string,"joined": boolean,"kind": Database["public"]['Enums']["group_kind"],"live": boolean,"member_count": number,"name": string
            }[]
                           },
"select_fast_lane_audits":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"send_author_message":
{ Args: { "p_author": string,"p_body": string,"p_client_id": string }; Returns: Json
                           },
"send_back_revision":
{ Args: { "p_actor"?: string,"p_issues": Json,"p_note": string,"p_rev": string,"p_source"?: Database["public"]['Enums']["send_back_source"] }; Returns: string
                           },
"sender_name":
{ Args: { "p_user": string }; Returns: string
                           },
"sent_back_reminder":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_application_sample":
{ Args: { "p_excerpt"?: string,"p_key": string,"p_name": string,"p_pages": number,"p_user": string }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_automod_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: undefined
                           },
"set_book_request_status":
{ Args: { "p_query": string,"p_status": string }; Returns: number
                           },
"set_book_search_text":
{ Args: { "p_rev": string,"p_rows": Json }; Returns: undefined
                           },
"set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"set_club_settings":
{ Args: { "p_slow_mode_seconds": number,"p_who_can_post": string }; Returns: undefined
                           },
"set_config":
{ Args: { "p_key": string,"p_stepup"?: string,"p_value": Json }; Returns: Json
                           },
"set_copy":
{ Args: { "p_key": string,"p_text": string }; Returns: Json
                           },
"set_export_status":
{ Args: { "p_error"?: string,"p_file_key"?: string,"p_id": string,"p_row_count"?: number,"p_status": Database["public"]['Enums']["export_status"] }; Returns: undefined
                           },
"set_flag":
{ Args: { "p_enabled": boolean,"p_key": string,"p_min_version"?: string,"p_rollout"?: number }; Returns: Json
                           },
"set_following":
{ Args: { "p_follow": boolean,"p_user": string }; Returns: boolean
                           },
"set_genre_visibility":
{ Args: { "p_genre": string,"p_visible": boolean }; Returns: undefined
                           },
"set_gifting_frozen":
{ Args: { "p_frozen": boolean }; Returns: boolean
                           },
"set_group_mute":
{ Args: { "p_group": string,"p_until": string }; Returns: undefined
                           },
"set_help_extras":
{ Args: { "p_article": string,"p_in_search": boolean,"p_related": (string)[] }; Returns: undefined
                           },
"set_library_view":
{ Args: { "p_view": string }; Returns: undefined
                           },
"set_live_count":
{ Args: { "p_count": number,"p_group": string }; Returns: undefined
                           },
"set_my_alert_pref":
{ Args: { "p_enabled": boolean,"p_kind": string }; Returns: undefined
                           },
"set_notification_preferences":
{ Args: { "p_patch": Json }; Returns: {
              "authors": boolean,
"clubs": boolean,
"note_replies": boolean,
"offers": boolean,
"quiet_enabled": boolean,
"quiet_end": string,
"quiet_start": string,
"reminders": boolean,
"timezone": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "notification_preferences"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_policy_accept_again":
{ Args: { "p_on": boolean,"p_policy": string }; Returns: undefined
                           },
"set_promo_status":
{ Args: { "p_code": string,"p_status": string }; Returns: string
                           },
"set_reader_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: Json
                           },
"set_reading_goal":
{ Args: { "p_target": number,"p_year": number }; Returns: {
              "target_books": number,
"updated_at": string,
"user_id": string,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "reading_goals"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_report_severity":
{ Args: { "p_report": string,"p_severity": Database["public"]['Enums']["report_severity"] }; Returns: undefined
                           },
"set_room_lock":
{ Args: { "p_locked": boolean,"p_room": string }; Returns: undefined
                           },
"set_staff_status":
{ Args: { "p_active": boolean,"p_user": string }; Returns: undefined
                           },
"set_user_genres":
{ Args: { "p_genre_ids": (string)[] }; Returns: undefined
                           },
"sign_out_my_sessions":
{ Args: { "p_session"?: string }; Returns: number
                           },
"sla_watch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"spend_credits":
{ Args: { "p_amount": number,"p_author": string,"p_book": string,"p_chapter_uid": string,"p_counterparty"?: string,"p_key": string,"p_meta"?: Json,"p_reason": Database["public"]['Enums']["ledger_reason"],"p_user": string }; Returns: Json
                           },
"staff_add_note":
{ Args: { "p_body": string,"p_user": string }; Returns: {
              "author_id": string | null,
"body": string,
"created_at": string,
"id": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "staff_notes"
        isOneToOne: true
        isSetofReturn: false
      } },
"staff_analytics":
{ Args: { "p_from": string,"p_metrics": (string)[],"p_to": string }; Returns: Json
                           },
"staff_analytics_books":
{ Args: { "p_from": string,"p_limit"?: number,"p_to": string }; Returns: Json
                           },
"staff_analytics_funnel":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"staff_by_role":
{ Args: Record<PropertyKey, never>; Returns: {
              "invited": (string)[],"names": (string)[],"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"staff_cancel_campaign":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_cancel_deletion":
{ Args: { "p_reason": string,"p_user": string }; Returns: undefined
                           },
"staff_create_export":
{ Args: { "p_columns": (string)[],"p_kind": Database["public"]['Enums']["export_kind"],"p_params": Json,"p_reason"?: string }; Returns: string
                           },
"staff_decide_report":
{ Args: { "p_action"?: string,"p_decision": string,"p_duration_days"?: number,"p_internal_note"?: string,"p_message_to_user"?: string,"p_notify_reporters"?: boolean,"p_reason"?: string,"p_report": string }; Returns: Json
                           },
"staff_delete_campaign_draft":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_duplicate_campaign":
{ Args: { "p_id": string,"p_unopened"?: boolean }; Returns: string
                           },
"staff_email_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_email_versions":
{ Args: { "p_key": string }; Returns: Json
                           },
"staff_end_banner":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_extend_subscription":
{ Args: { "p_days": number,"p_reason": string,"p_sub": string }; Returns: Json
                           },
"staff_get_campaign":
{ Args: { "p_id": string }; Returns: Json
                           },
"staff_get_reader":
{ Args: { "p_user": string }; Returns: Json
                           },
"staff_grant_credits":
{ Args: { "p_credits": number,"p_reason": string,"p_user": string }; Returns: Json
                           },
"staff_list_banners":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_list_campaigns":
{ Args: { "p_tab"?: string }; Returns: Json
                           },
"staff_list_email_templates":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_list_exports":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_list_readers":
{ Args: { "p_filters"?: Json,"p_page"?: number,"p_query"?: string,"p_tab"?: string }; Returns: Json
                           },
"staff_mfa_ok":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"staff_mfa_verified_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"staff_pause_campaign":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_request_campaign_review":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_restore_campaign":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_return_chapter":
{ Args: { "p_charge": number,"p_note"?: string,"p_reason_code": string }; Returns: Json
                           },
"staff_return_chapter_charge":
{ Args: { "p_ledger": number,"p_reason": Database["public"]['Enums']["credit_return_reason"] }; Returns: Json
                           },
"staff_reveal_contact":
{ Args: { "p_reason": string,"p_user": string }; Returns: Json
                           },
"staff_review_campaign":
{ Args: { "p_id": string }; Returns: undefined
                           },
"staff_save_banner":
{ Args: { "p_fields": Json,"p_id": string }; Returns: string
                           },
"staff_save_campaign":
{ Args: { "p_fields": Json,"p_id": string }; Returns: string
                           },
"staff_save_email_sender":
{ Args: { "p_footer": string,"p_from": string,"p_reply_to": string }; Returns: undefined
                           },
"staff_save_email_template":
{ Args: { "p_body": string,"p_enabled"?: boolean,"p_key": string,"p_preheader": string,"p_subject": string }; Returns: number
                           },
"staff_schedule_campaign":
{ Args: { "p_confirm"?: boolean,"p_id": string,"p_send_at"?: string }; Returns: Json
                           },
"staff_send_password_reset":
{ Args: { "p_user": string }; Returns: string
                           },
"staff_set_export_schedule":
{ Args: { "p_enabled": boolean,"p_kind": string }; Returns: undefined
                           },
"staff_set_push_type":
{ Args: { "p_body"?: string,"p_enabled"?: boolean,"p_key": string,"p_title"?: string }; Returns: undefined
                           },
"staff_set_reader_role":
{ Args: { "p_role": string,"p_user": string }; Returns: undefined
                           },
"staff_sign_out_all":
{ Args: { "p_user": string }; Returns: number
                           },
"staff_sign_out_device":
{ Args: { "p_device": string,"p_user": string }; Returns: undefined
                           },
"staff_signin_locked":
{ Args: { "p_email": string }; Returns: boolean
                           },
"staff_start_deletion":
{ Args: { "p_confirm"?: string,"p_mode": string,"p_reason": string,"p_user": string }; Returns: {
              "blocked_reason": string | null,
"completed_at": string | null,
"erase_after": string,
"grace_until": string | null,
"id": string,
"reason": string | null,
"requested_at": string,
"requested_by": string | null,
"requested_via": string,
"status": Database["public"]['Enums']["deletion_status"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "account_deletions"
        isOneToOne: true
        isSetofReturn: false
      } },
"staff_test_push":
{ Args: { "p_id": string }; Returns: boolean
                           },
"start_application":
{ Args: Record<PropertyKey, never>; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"start_author_dm":
{ Args: { "p_author": string }; Returns: Json
                           },
"studio_books":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"studio_earnings":
{ Args: { "p_month"?: string }; Returns: Json
                           },
"studio_home":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"submit_application":
{ Args: { "p_accept_terms": boolean }; Returns: {
              "agreement_accepted_at": string | null,
"agreement_version": number | null,
"assigned_to": string | null,
"bio": string,
"categories": (string)[],
"checks": NonNullable<Json>,
"created_at": string,
"date_of_birth": string | null,
"decided_at": string | null,
"decided_by": string | null,
"decision_reason": string | null,
"email": string,
"experience": string,
"id": string,
"info_request": string | null,
"info_step": number | null,
"legacy": boolean,
"legal_name": string,
"pen_name": string | null,
"phone": string | null,
"reapply_after": string | null,
"sample_excerpt": string | null,
"sample_file_key": string | null,
"sample_file_name": string | null,
"sample_pages": number | null,
"sample_text": string | null,
"sla_alerted_at": string | null,
"social_handle": string | null,
"state": string | null,
"status": Database["public"]['Enums']["application_status"],
"step_reached": number,
"submitted_at": string | null,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "author_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"submit_bank_account":
{ Args: { "p_author": string,"p_bank_code": string,"p_bank_name": string,"p_last4": string,"p_match_score": number,"p_number_enc": string,"p_resolved_name": string }; Returns: Json
                           },
"submit_revision":
{ Args: { "p_rev": string }; Returns: Json
                           },
"suggest":
{ Args: { "p_q": string }; Returns: Json
                           },
"suspend_author":
{ Args: { "p_actor"?: string,"p_reason": string,"p_user": string }; Returns: undefined
                           },
"sync_reading_progress":
{ Args: { "p_at": string,"p_book": string,"p_cfi": string,"p_chapter_uid": string,"p_char_offset": number,"p_device_id": string,"p_device_name": string,"p_para_id": string,"p_percent": number,"p_revision": string }; Returns: Json
                           },
"take_held_pushes":
{ Args: { "p_limit"?: number }; Returns: {
              "held_at": string,"payload": Json,"type": string,"user_id": string
            }[]
                           },
"tip_author":
{ Args: { "p_book": string,"p_credits": number,"p_key": string,"p_note": string }; Returns: Json
                           },
"toggle_review_like":
{ Args: { "p_review": string }; Returns: boolean
                           },
"touch_last_seen":
{ Args: { "p_group": string,"p_user": string }; Returns: undefined
                           },
"trust_queue_ack":
{ Args: { "p_ids": (number)[] }; Returns: undefined
                           },
"trust_queue_read":
{ Args: { "p_qty"?: number,"p_vt"?: number }; Returns: {
              "message": Json,"msg_id": number
            }[]
                           },
"unblock_user":
{ Args: { "p_user": string }; Returns: Json
                           },
"undo_chapter_unlock":
{ Args: { "p_key": string,"p_ledger": number }; Returns: Json
                           },
"undo_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_fix": string }; Returns: Json
                           },
"undo_release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
                           },
"unfollow_author":
{ Args: { "p_author": string }; Returns: Json
                           },
"unhide_reviewer":
{ Args: { "p_user": string }; Returns: undefined
                           },
"unlock_book":
{ Args: { "p_book": string,"p_expected_price": number,"p_key": string }; Returns: Json
                           },
"unlock_chapter":
{ Args: { "p_book": string,"p_chapter_uid": string,"p_key": string,"p_source": string }; Returns: Json
                           },
"unpin_message":
{ Args: { "p_group": string,"p_message": string }; Returns: undefined
                           },
"unpublish_book":
{ Args: { "p_actor"?: string,"p_book": string,"p_confirm_title": string,"p_notify_readers": boolean,"p_reason": Database["public"]['Enums']["unpublish_reason"],"p_remove_access": boolean }; Returns: Json
                           },
"unpublish_help_article":
{ Args: { "p_article": string }; Returns: undefined
                           },
"unpublish_preview":
{ Args: { "p_book": string }; Returns: Json
                           },
"unsave_book":
{ Args: { "p_book": string }; Returns: undefined
                           },
"update_home_section":
{ Args: { "p_config"?: Json,"p_id": string,"p_visible"?: boolean }; Returns: {
              "config": NonNullable<Json>,
"id": string,
"key": string,
"kind": string,
"position": number,
"title": string,
"updated_at": string,
"updated_by": string | null,
"visible": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "home_sections"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_my_staff_profile":
{ Args: { "p_name": string,"p_phone": string }; Returns: undefined
                           },
"update_profile":
{ Args: { "p": Json }; Returns: {
              "avatar_url": string | null,
"bio": string | null,
"country": string,
"created_at": string,
"date_of_birth": string | null,
"deleted_at": string | null,
"deletion_requested_at": string | null,
"erased_at": string | null,
"full_name": string,
"id": string,
"interests": (string)[],
"is_author": boolean,
"is_reader": boolean,
"library_view": string,
"name_changes": (string)[],
"onboarding_step": string,
"phone": string | null,
"privacy_version": number | null,
"reader_settings": NonNullable<Json>,
"reader_theme": Database["public"]['Enums']["reader_theme"],
"signup_intent": Database["public"]['Enums']["signup_intent"] | null,
"terms_accepted_at": string | null,
"terms_version": number | null,
"theme": Database["public"]['Enums']["app_theme"],
"updated_at": string,
"username": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_room_progress":
{ Args: { "p_book": string,"p_chapter": number,"p_percent": number }; Returns: Json
                           },
"update_ticket":
{ Args: { "p_assignee"?: string,"p_category"?: Database["public"]['Enums']["ticket_category"],"p_status"?: Database["public"]['Enums']["ticket_status"],"p_ticket": string,"p_unassign"?: boolean }; Returns: undefined
                           },
"upsert_annotations":
{ Args: { "p_batch": Json }; Returns: Json
                           },
"use_staff_backup_code":
{ Args: { "p_code": string }; Returns: number
                           },
"uuid7":
{ Args: { "p_at"?: string }; Returns: string
                           },
"verify_stepup":
{ Args: { "p_backup_code"?: string,"p_scope": string }; Returns: string
                           },
"vote_help":
{ Args: { "p_article": string,"p_helpful": boolean }; Returns: undefined
                           },
"withdraw_application":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"word_hits":
{ Args: { "p_q": string,"p_typo": number,"p_w": string }; Returns: boolean
                           },
"worker_key_bundle":
{ Args: { "p_chapter_uids": (string)[],"p_revision": string }; Returns: Json
                           },
"worker_payment_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"worker_payment_subscription":
{ Args: { "p_sub": string }; Returns: Json
                           },
"worker_record_license":
{ Args: { "p_book": string,"p_device": string,"p_revision": string,"p_user": string,"p_valid_until": string }; Returns: undefined
                           },
"worker_register_device":
{ Args: { "p_name": string,"p_public_key": string,"p_user": string }; Returns: string
                           },
"worker_set_integration_health":
{ Args: { "p_error_note"?: string,"p_error_rate"?: number,"p_key_masked"?: string,"p_last_event_at"?: string,"p_last_event_text"?: string,"p_service": string,"p_status": string }; Returns: undefined
                           },
"worker_user_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id"?: string,"p_object_label"?: string,"p_object_type"?: string,"p_reason"?: string,"p_summary"?: string }; Returns: number
                           }
          }
          Enums: {
            "anchor_method": "exact"|"fuzzy"|"nearest","app_theme": "sunflower"|"palm"|"plum"|"night","appeal_status": "new"|"in_review"|"upheld"|"reduced"|"overturned","appeal_subject": "sanction"|"application"|"book_rejection"|"content_removal","application_event_kind": "submitted"|"assigned"|"info_asked"|"info_given"|"approved"|"rejected","application_status": "draft"|"new"|"needs_info"|"approved"|"rejected"|"withdrawn","author_earning_status": "payable"|"carried"|"held_unverified"|"held_paused"|"held_dispute"|"queued"|"paid"|"partly_failed","author_status": "active"|"suspended","author_visibility": "public"|"private","bank_account_status": "needs_review"|"verified"|"rejected"|"replaced","banner_placement": "home_top"|"credits"|"launch_modal","banner_state": "draft"|"scheduled"|"live"|"ended","book_status": "draft"|"live"|"scheduled"|"unpublished"|"taken_down"|"rejected","campaign_status": "draft"|"in_review"|"scheduled"|"sending"|"sent"|"paused"|"cancelled","chapter_kind": "chapter"|"part","claim_status": "new"|"waiting_on_author"|"upheld"|"rejected","claim_type": "copyright"|"plagiarism"|"impersonation","comment_state": "visible"|"auto_hidden"|"removed"|"deleted","credit_return_reason": "skipped_ahead"|"did_not_open"|"wrong_book","credit_return_state": "done"|"pending_approval"|"declined","deletion_status": "pending"|"erasing"|"done"|"blocked"|"cancelled","draft_step": "upload"|"converting"|"checking"|"chapters"|"preview","earning_cycle_status": "open"|"closed"|"prepared"|"approved"|"releasing"|"paid"|"paid_with_failures","earning_exclusion_reason": "undone"|"staff_return"|"refund_clawback"|"gift_loop"|"self_read"|"takedown","entitlement_scope": "book"|"chapter","entitlement_source": "unlock_all"|"chapter"|"chapter_complete"|"gift"|"staff","export_kind": "readers"|"subscriptions"|"transactions"|"author_earnings"|"books"|"reports","export_status": "counting"|"building"|"ready"|"failed"|"expired","fast_lane_result": "pending"|"ok"|"problem","flag_source": "worker"|"desk"|"staff","flag_status": "open"|"fixed"|"dismissed","group_kind": "official"|"club"|"author"|"readalong"|"room"|"dm","group_role": "owner"|"moderator"|"member","group_visibility": "public"|"followers"|"private","group_who_can_post": "members"|"staff"|"owner_and_followers","help_category": "getting_started"|"credits_plans"|"reading"|"community"|"authors"|"account_privacy","ledger_bucket": "plan"|"rollover"|"topup"|"promo","ledger_reason": "plan_grant"|"rollover"|"top_up"|"unlock_all"|"chapter"|"undo"|"tip"|"message"|"expiry"|"refund"|"staff_adjust"|"gift_out"|"gift_in"|"promo","message_kind": "text"|"quote"|"system","message_state": "visible"|"auto_hidden"|"removed"|"deleted","moderation_action_kind": "keep"|"remove"|"mark_spoiler"|"warn"|"mute"|"suspend"|"ban"|"lock_chat"|"restore","payee_type": "individual"|"company","payout_run_status": "queued"|"sending"|"done"|"done_with_failures","payout_status": "queued"|"pending"|"successful"|"failed"|"reversed","permission_level": "allow"|"limited","post_state": "draft"|"published"|"removed","push_category": "messages"|"authors"|"reminders"|"marketing"|"account","push_quiet_action": "hold"|"deliver"|"drop"|"none","push_status": "queued"|"sent"|"delivered"|"opened"|"skipped_cap"|"skipped_quiet"|"skipped_pref"|"failed","reader_theme": "light"|"sepia"|"dark","report_content_type": "message"|"discussion_comment"|"review"|"post_comment"|"author_post"|"profile"|"book"|"dm"|"book_content","report_outcome": "keep"|"removed"|"spoiler"|"actioned"|"dismissed","report_reason": "spam"|"harassment"|"hate"|"sexual"|"violence"|"self_harm"|"copyright"|"spoilers"|"impersonation"|"other","report_severity": "high"|"medium"|"low","report_status": "open"|"auto_hidden"|"resolved","revision_origin": "author"|"staff"|"desk","revision_status": "draft"|"processing"|"with_desk"|"needs_fixes"|"ready_for_review"|"sent_back"|"scheduled"|"live"|"superseded"|"unpublished"|"taken_down"|"rejected","room_join_policy": "code"|"anyone","room_pace": "free"|"three_week"|"one_day","room_state": "scheduled"|"live"|"ended","sanction_kind": "warn"|"mute"|"suspend"|"ban","sanction_state": "pending"|"active"|"ended"|"overturned","send_back_source": "fixer"|"quick_review"|"desk_auto"|"system","signup_intent": "reader"|"author","source_type": "docx"|"epub"|"pdf","staff_role": "super_admin"|"operations_admin"|"publisher"|"moderator"|"finance"|"support"|"analyst","statement_kind": "cycle"|"year_to_date","ticket_category": "billing"|"book_access"|"account"|"author_help"|"bug"|"other","ticket_channel": "email"|"app","ticket_message_kind": "reader"|"staff"|"note","ticket_status": "open"|"waiting_on_reader"|"solved","unpublish_reason": "author_request"|"policy_violation"|"quality"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "anchor_method": ["exact", "fuzzy", "nearest"],"app_theme": ["sunflower", "palm", "plum", "night"],"appeal_status": ["new", "in_review", "upheld", "reduced", "overturned"],"appeal_subject": ["sanction", "application", "book_rejection", "content_removal"],"application_event_kind": ["submitted", "assigned", "info_asked", "info_given", "approved", "rejected"],"application_status": ["draft", "new", "needs_info", "approved", "rejected", "withdrawn"],"author_earning_status": ["payable", "carried", "held_unverified", "held_paused", "held_dispute", "queued", "paid", "partly_failed"],"author_status": ["active", "suspended"],"author_visibility": ["public", "private"],"bank_account_status": ["needs_review", "verified", "rejected", "replaced"],"banner_placement": ["home_top", "credits", "launch_modal"],"banner_state": ["draft", "scheduled", "live", "ended"],"book_status": ["draft", "live", "scheduled", "unpublished", "taken_down", "rejected"],"campaign_status": ["draft", "in_review", "scheduled", "sending", "sent", "paused", "cancelled"],"chapter_kind": ["chapter", "part"],"claim_status": ["new", "waiting_on_author", "upheld", "rejected"],"claim_type": ["copyright", "plagiarism", "impersonation"],"comment_state": ["visible", "auto_hidden", "removed", "deleted"],"credit_return_reason": ["skipped_ahead", "did_not_open", "wrong_book"],"credit_return_state": ["done", "pending_approval", "declined"],"deletion_status": ["pending", "erasing", "done", "blocked", "cancelled"],"draft_step": ["upload", "converting", "checking", "chapters", "preview"],"earning_cycle_status": ["open", "closed", "prepared", "approved", "releasing", "paid", "paid_with_failures"],"earning_exclusion_reason": ["undone", "staff_return", "refund_clawback", "gift_loop", "self_read", "takedown"],"entitlement_scope": ["book", "chapter"],"entitlement_source": ["unlock_all", "chapter", "chapter_complete", "gift", "staff"],"export_kind": ["readers", "subscriptions", "transactions", "author_earnings", "books", "reports"],"export_status": ["counting", "building", "ready", "failed", "expired"],"fast_lane_result": ["pending", "ok", "problem"],"flag_source": ["worker", "desk", "staff"],"flag_status": ["open", "fixed", "dismissed"],"group_kind": ["official", "club", "author", "readalong", "room", "dm"],"group_role": ["owner", "moderator", "member"],"group_visibility": ["public", "followers", "private"],"group_who_can_post": ["members", "staff", "owner_and_followers"],"help_category": ["getting_started", "credits_plans", "reading", "community", "authors", "account_privacy"],"ledger_bucket": ["plan", "rollover", "topup", "promo"],"ledger_reason": ["plan_grant", "rollover", "top_up", "unlock_all", "chapter", "undo", "tip", "message", "expiry", "refund", "staff_adjust", "gift_out", "gift_in", "promo"],"message_kind": ["text", "quote", "system"],"message_state": ["visible", "auto_hidden", "removed", "deleted"],"moderation_action_kind": ["keep", "remove", "mark_spoiler", "warn", "mute", "suspend", "ban", "lock_chat", "restore"],"payee_type": ["individual", "company"],"payout_run_status": ["queued", "sending", "done", "done_with_failures"],"payout_status": ["queued", "pending", "successful", "failed", "reversed"],"permission_level": ["allow", "limited"],"post_state": ["draft", "published", "removed"],"push_category": ["messages", "authors", "reminders", "marketing", "account"],"push_quiet_action": ["hold", "deliver", "drop", "none"],"push_status": ["queued", "sent", "delivered", "opened", "skipped_cap", "skipped_quiet", "skipped_pref", "failed"],"reader_theme": ["light", "sepia", "dark"],"report_content_type": ["message", "discussion_comment", "review", "post_comment", "author_post", "profile", "book", "dm", "book_content"],"report_outcome": ["keep", "removed", "spoiler", "actioned", "dismissed"],"report_reason": ["spam", "harassment", "hate", "sexual", "violence", "self_harm", "copyright", "spoilers", "impersonation", "other"],"report_severity": ["high", "medium", "low"],"report_status": ["open", "auto_hidden", "resolved"],"revision_origin": ["author", "staff", "desk"],"revision_status": ["draft", "processing", "with_desk", "needs_fixes", "ready_for_review", "sent_back", "scheduled", "live", "superseded", "unpublished", "taken_down", "rejected"],"room_join_policy": ["code", "anyone"],"room_pace": ["free", "three_week", "one_day"],"room_state": ["scheduled", "live", "ended"],"sanction_kind": ["warn", "mute", "suspend", "ban"],"sanction_state": ["pending", "active", "ended", "overturned"],"send_back_source": ["fixer", "quick_review", "desk_auto", "system"],"signup_intent": ["reader", "author"],"source_type": ["docx", "epub", "pdf"],"staff_role": ["super_admin", "operations_admin", "publisher", "moderator", "finance", "support", "analyst"],"statement_kind": ["cycle", "year_to_date"],"ticket_category": ["billing", "book_access", "account", "author_help", "bug", "other"],"ticket_channel": ["email", "app"],"ticket_message_kind": ["reader", "staff", "note"],"ticket_status": ["open", "waiting_on_reader", "solved"],"unpublish_reason": ["author_request", "policy_violation", "quality"]
          }
        }
} as const
