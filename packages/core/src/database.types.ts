
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
            "anchor_migrations": {
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
                },"book_revisions": {
                  Row: {
                    "anchors_moved": Json | null,"artifact_prefix": string | null,"assigned_to": string | null,"base_revision_id": string | null,"book_id": string,"chapters_confirmed_at": string | null,"converted_key": string | null,"converted_sha256": string | null,"cover_key": string | null,"cover_sha256": string | null,"created_at": string,"created_via": Database["public"]['Enums']["revision_origin"],"desk_claimed_by": string | null,"desk_lease_until": string | null,"desk_reason": string | null,"draft_step": Database["public"]['Enums']["draft_step"] | null,"due_at": string | null,"fast_lane": boolean,"file_bytes": number | null,"free_through_ord": number,"generation": number,"id": string,"last_activity_at": string | null,"late_alerted_at": string | null,"manifest_key": string | null,"meta": NonNullable<Json>,"notify_followers": boolean,"pages": number | null,"preview_cut_chapter_uid": string | null,"preview_cut_para_id": string | null,"preview_percent": number | null,"price_credits": number | null,"published_at": string | null,"published_by": string | null,"readiness": number,"review_opened_at": string | null,"revision_no": number,"routed_at": string | null,"schedule_at": string | null,"sealed_generation": number | null,"sealed_work_version": number | null,"sent_back_note": string | null,"source_key": string | null,"source_sha256": string | null,"source_type": Database["public"]['Enums']["source_type"] | null,"status": Database["public"]['Enums']["revision_status"],"status_reason": string | null,"steps": NonNullable<Json>,"submitted_at": string | null,"updated_at": string,"uploaded_by": string | null,"words": number | null,"work_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anchors_moved"?: Json | null,"artifact_prefix"?: string | null,"assigned_to"?: string | null,"base_revision_id"?: string | null,"book_id": string,"chapters_confirmed_at"?: string | null,"converted_key"?: string | null,"converted_sha256"?: string | null,"cover_key"?: string | null,"cover_sha256"?: string | null,"created_at"?: string,"created_via"?: Database["public"]['Enums']["revision_origin"],"desk_claimed_by"?: string | null,"desk_lease_until"?: string | null,"desk_reason"?: string | null,"draft_step"?: Database["public"]['Enums']["draft_step"] | null,"due_at"?: string | null,"fast_lane"?: boolean,"file_bytes"?: number | null,"free_through_ord"?: number,"generation"?: number,"id"?: string,"last_activity_at"?: string | null,"late_alerted_at"?: string | null,"manifest_key"?: string | null,"meta"?: NonNullable<Json>,"notify_followers"?: boolean,"pages"?: number | null,"preview_cut_chapter_uid"?: string | null,"preview_cut_para_id"?: string | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"published_by"?: string | null,"readiness"?: number,"review_opened_at"?: string | null,"revision_no": number,"routed_at"?: string | null,"schedule_at"?: string | null,"sealed_generation"?: number | null,"sealed_work_version"?: number | null,"sent_back_note"?: string | null,"source_key"?: string | null,"source_sha256"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"status"?: Database["public"]['Enums']["revision_status"],"status_reason"?: string | null,"steps"?: NonNullable<Json>,"submitted_at"?: string | null,"updated_at"?: string,"uploaded_by"?: string | null,"words"?: number | null,"work_version"?: number
                  }
                  Update: {
                    "anchors_moved"?: Json | null,"artifact_prefix"?: string | null,"assigned_to"?: string | null,"base_revision_id"?: string | null,"book_id"?: string,"chapters_confirmed_at"?: string | null,"converted_key"?: string | null,"converted_sha256"?: string | null,"cover_key"?: string | null,"cover_sha256"?: string | null,"created_at"?: string,"created_via"?: Database["public"]['Enums']["revision_origin"],"desk_claimed_by"?: string | null,"desk_lease_until"?: string | null,"desk_reason"?: string | null,"draft_step"?: Database["public"]['Enums']["draft_step"] | null,"due_at"?: string | null,"fast_lane"?: boolean,"file_bytes"?: number | null,"free_through_ord"?: number,"generation"?: number,"id"?: string,"last_activity_at"?: string | null,"late_alerted_at"?: string | null,"manifest_key"?: string | null,"meta"?: NonNullable<Json>,"notify_followers"?: boolean,"pages"?: number | null,"preview_cut_chapter_uid"?: string | null,"preview_cut_para_id"?: string | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"published_by"?: string | null,"readiness"?: number,"review_opened_at"?: string | null,"revision_no"?: number,"routed_at"?: string | null,"schedule_at"?: string | null,"sealed_generation"?: number | null,"sealed_work_version"?: number | null,"sent_back_note"?: string | null,"source_key"?: string | null,"source_sha256"?: string | null,"source_type"?: Database["public"]['Enums']["source_type"] | null,"status"?: Database["public"]['Enums']["revision_status"],"status_reason"?: string | null,"steps"?: NonNullable<Json>,"submitted_at"?: string | null,"updated_at"?: string,"uploaded_by"?: string | null,"words"?: number | null,"work_version"?: number
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
      referencedRelation: "books"
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
                },"books": {
                  Row: {
                    "access_removed_at": string | null,"author_id": string,"claim_hold_at": string | null,"created_at": string,"current_revision_id": string | null,"description": string | null,"genres": (string)[],"id": string,"new_arrival_until": string | null,"status": Database["public"]['Enums']["book_status"],"subtitle": string | null,"title": string,"unpublish_reason": Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_removed_at"?: string | null,"author_id": string,"claim_hold_at"?: string | null,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"title": string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_removed_at"?: string | null,"author_id"?: string,"claim_hold_at"?: string | null,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"title"?: string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
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
      referencedRelation: "books"
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
                },"credit_ledger": {
                  Row: {
                    "actor_id": string | null,"author_earning_kobo": number,"author_id": string | null,"book_id": string | null,"bucket": Database["public"]['Enums']["ledger_bucket"],"chapter_id": string | null,"created_at": string,"delta": number,"expires_at": string | null,"id": number,"idempotency_key": string | null,"note": string | null,"reason": Database["public"]['Enums']["ledger_reason"],"ref_id": string | null,"ref_type": string | null,"txn_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"author_earning_kobo"?: number,"author_id"?: string | null,"book_id"?: string | null,"bucket": Database["public"]['Enums']["ledger_bucket"],"chapter_id"?: string | null,"created_at"?: string,"delta": number,"expires_at"?: string | null,"id"?: never,"idempotency_key"?: string | null,"note"?: string | null,"reason": Database["public"]['Enums']["ledger_reason"],"ref_id"?: string | null,"ref_type"?: string | null,"txn_id"?: string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"author_earning_kobo"?: number,"author_id"?: string | null,"book_id"?: string | null,"bucket"?: Database["public"]['Enums']["ledger_bucket"],"chapter_id"?: string | null,"created_at"?: string,"delta"?: number,"expires_at"?: string | null,"id"?: never,"idempotency_key"?: string | null,"note"?: string | null,"reason"?: Database["public"]['Enums']["ledger_reason"],"ref_id"?: string | null,"ref_type"?: string | null,"txn_id"?: string,"user_id"?: string
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
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_ledger_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
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
      referencedRelation: "books"
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
      referencedRelation: "books"
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
      referencedRelation: "genres"
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
      referencedRelation: "books"
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
      referencedRelation: "books"
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
                    "category": Database["public"]['Enums']["help_category"],"created_at": string,"current_version_id": string | null,"id": string,"related": (string)[],"shows_in": (string)[],"slug": string,"state": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["help_category"],"created_at"?: string,"current_version_id"?: string | null,"id"?: string,"related"?: (string)[],"shows_in"?: (string)[],"slug": string,"state"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["help_category"],"created_at"?: string,"current_version_id"?: string | null,"id"?: string,"related"?: (string)[],"shows_in"?: (string)[],"slug"?: string,"state"?: string,"updated_at"?: string
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
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"country": string,"created_at": string,"date_of_birth": string | null,"deleted_at": string | null,"full_name": string,"id": string,"interests": (string)[],"is_author": boolean,"is_reader": boolean,"onboarding_step": string,"phone": string | null,"privacy_version": number | null,"signup_intent": Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at": string | null,"terms_version": number | null,"theme": Database["public"]['Enums']["app_theme"],"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"full_name"?: string,"id": string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"full_name"?: string,"id"?: string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    
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
      referencedRelation: "books"
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
      referencedRelation: "books"
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
                    "app_version": string | null,"created_at": string,"device_key": string,"download_enabled": boolean,"id": string,"last_city": string | null,"last_seen_at": string,"model": string | null,"os": string | null,"push_token": string | null,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"device_key": string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_token"?: string | null,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"device_key"?: string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_token"?: string | null,"revoked_at"?: string | null,"user_id"?: string
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
            "public_profiles": {
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
"_apply_counts":
{ Args: { "p_result": Json,"p_rev": string }; Returns: undefined
                           },
"_apply_sanction":
{ Args: { "p_action": string,"p_days": number,"p_kind": Database["public"]['Enums']["sanction_kind"],"p_pending"?: boolean,"p_user": string }; Returns: string
                           },
"_audit":
{ Args: { "p_action": string,"p_actor": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id": string,"p_object_label"?: string,"p_object_type": string,"p_reason"?: string,"p_summary"?: string }; Returns: undefined
                           },
"_audit_as":
{ Args: { "p_action": string,"p_actor": string,"p_after": Json,"p_area": string,"p_before": Json,"p_object_id": string,"p_object_label": string,"p_object_type": string,"p_reason": string,"p_summary": string }; Returns: number
                           },
"_can_claims":
{ Args: { "p_decide": boolean }; Returns: boolean
                           },
"_can_help":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_chapter_charge":
{ Args: { "p_ledger": number }; Returns: {
              "book_id": string,"chapter_id": string,"charged_at": string,"credits": number,"kobo": number,"txn_id": string,"user_id": string
            }[]
                           },
"_chapter_prices_ok":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_charge_undone":
{ Args: { "p_at": string,"p_chapter": string,"p_user": string }; Returns: boolean
                           },
"_check_super_admins":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_do_credit_return":
{ Args: { "p_actor": string,"p_return": string }; Returns: string
                           },
"_fast_lane_check":
{ Args: { "p_rev": string }; Returns: (string)[]
                           },
"_has_staff_role":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[],"p_user": string }; Returns: boolean
                           },
"_insert_flags":
{ Args: { "p_flags": Json,"p_rev": string,"p_source": Database["public"]['Enums']["flag_source"] }; Returns: number
                           },
"_is_active_staff":
{ Args: { "p_user": string }; Returns: boolean
                           },
"_is_revision_author":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_is_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_lock_revision":
{ Args: { "p_rev": string }; Returns: {
              "anchors_moved": Json | null,
"artifact_prefix": string | null,
"assigned_to": string | null,
"base_revision_id": string | null,
"book_id": string,
"chapters_confirmed_at": string | null,
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
"last_activity_at": string | null,
"late_alerted_at": string | null,
"manifest_key": string | null,
"meta": NonNullable<Json>,
"notify_followers": boolean,
"pages": number | null,
"preview_cut_chapter_uid": string | null,
"preview_cut_para_id": string | null,
"preview_percent": number | null,
"price_credits": number | null,
"published_at": string | null,
"published_by": string | null,
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
"_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_pipeline_defaults":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"_pipeline_setting":
{ Args: { "p_section": string }; Returns: Json
                           },
"_publish_now":
{ Args: { "p_actor": string,"p_mode": string,"p_notify": boolean,"p_rev": string }; Returns: Json
                           },
"_replace_chapters":
{ Args: { "p_chapters": Json,"p_rev": string }; Returns: undefined
                           },
"_report_target":
{ Args: { "p_id": string,"p_type": Database["public"]['Enums']["report_content_type"],"p_viewer": string }; Returns: {
              "book_id": string,"group_id": string,"reported_user": string,"snapshot": Json
            }[]
                           },
"_report_visible_to_me":
{ Args: { "r": Omit<Database["public"]['Tables']["reports"]['Row'], Database["public"]['Tables']["reports"]['ComputedFields']> }; Returns: boolean
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
"_route":
{ Args: { "p_rev": string }; Returns: Database["public"]['Enums']["revision_status"]
                           },
"_send_back":
{ Args: { "p_actor": string,"p_issues": Json,"p_note": string,"p_rev": string,"p_source": Database["public"]['Enums']["send_back_source"] }; Returns: string
                           },
"_set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_set_content_state":
{ Args: { "p_id": string,"p_state": string,"p_type": Database["public"]['Enums']["report_content_type"] }; Returns: undefined
                           },
"_staff_name":
{ Args: { "p_user": string }; Returns: string
                           },
"_step":
{ Args: { "p_rev": string,"p_step": string }; Returns: undefined
                           },
"_sync_auth_ban":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_threshold":
{ Args: { "p_key": string }; Returns: number
                           },
"_trust_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_trust_staff":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"accept_staff_invite":
{ Args: { "p_token_hash": string,"p_user": string }; Returns: Database["public"]['Enums']["staff_role"]
                           },
"active_sanction":
{ Args: { "p_user": string }; Returns: {
              "ends_at": string,"kind": Database["public"]['Enums']["sanction_kind"]
            }[]
                           },
"add_ticket_note":
{ Args: { "p_body": string,"p_ticket": string }; Returns: string
                           },
"admin_community_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_create_official_channel":
{ Args: { "p_description": string,"p_name": string,"p_visibility"?: Database["public"]['Enums']["group_visibility"],"p_who_can_post"?: Database["public"]['Enums']["group_who_can_post"] }; Returns: string
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
"admin_list_tickets":
{ Args: { "p_category"?: Database["public"]['Enums']["ticket_category"],"p_channel"?: Database["public"]['Enums']["ticket_channel"],"p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_tab"?: string }; Returns: {
              "assignee_id": string,"assignee_name": string,"category": Database["public"]['Enums']["ticket_category"],"channel": Database["public"]['Enums']["ticket_channel"],"created_at": string,"email": string,"first_replied_at": string,"first_reply_due_at": string,"id": string,"last_message_at": string,"reader_name": string,"ref": string,"status": Database["public"]['Enums']["ticket_status"],"subject": string,"total": number,"user_id": string
            }[]
                           },
"admin_mute_member":
{ Args: { "p_group": string,"p_reason"?: string,"p_until": string,"p_user": string }; Returns: undefined
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
"admin_set_channel_state":
{ Args: { "p_field": string,"p_group": string,"p_reason"?: string,"p_until": string }; Returns: undefined
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
"approve_credit_return":
{ Args: { "p_approve": boolean,"p_return": string }; Returns: undefined
                           },
"assign_report":
{ Args: { "p_report": string,"p_user"?: string }; Returns: undefined
                           },
"audit_fast_lane":
{ Args: { "p_actor"?: string,"p_note": string,"p_result": Database["public"]['Enums']["fast_lane_result"],"p_rev": string }; Returns: undefined
                           },
"author_in_good_standing":
{ Args: { "p_author": string }; Returns: boolean
                           },
"automod_value":
{ Args: { "p_key": string }; Returns: Json
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
"can_moderate":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_quote":
{ Args: { "p_book": string,"p_chapter": number,"p_user": string }; Returns: boolean
                           },
"can_read_reports":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_support":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"change_staff_role":
{ Args: { "p_role": Database["public"]['Enums']["staff_role"],"p_user": string }; Returns: undefined
                           },
"claim_ask_author":
{ Args: { "p_claim": string,"p_days"?: number,"p_note"?: string }; Returns: undefined
                           },
"claim_revision":
{ Args: { "p_actor"?: string,"p_rev": string,"p_screen": string,"p_take_over"?: boolean }; Returns: Json
                           },
"clear_staff_signin_failures":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"community_admin":
{ Args: { "p_edit": boolean }; Returns: boolean
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
"create_appeal":
{ Args: { "p_subject_id": string,"p_subject_type": Database["public"]['Enums']["appeal_subject"],"p_text": string }; Returns: string
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
"decide_claim":
{ Args: { "p_claim": string,"p_decision": string,"p_note": string }; Returns: undefined
                           },
"delete_automod_word":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_message":
{ Args: { "p_group"?: string,"p_message": string }; Returns: Json
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
"escalate_report":
{ Args: { "p_note"?: string,"p_report": string }; Returns: undefined
                           },
"finalize_revision":
{ Args: { "p_actor": string,"p_files": Json,"p_rev": string }; Returns: Json
                           },
"get_all_set":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_blocked":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"created_at": string,"full_name": string,"source_group_id": string,"source_kind": Database["public"]['Enums']["group_kind"],"source_name": string,"user_id": string
            }[]
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
"get_inbox":
{ Args: { "p_cursor"?: string,"p_cursor_id"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "avatar_url": string,"group_id": string,"is_author": boolean,"kind": Database["public"]['Enums']["group_kind"],"last_at": string,"last_body": string,"last_from_author": boolean,"last_kind": Database["public"]['Enums']["message_kind"],"last_sender": string,"last_state": Database["public"]['Enums']["message_state"],"live": boolean,"member_count": number,"muted": boolean,"name": string,"other_user_id": string,"role": Database["public"]['Enums']["group_role"],"unread_count": number
            }[]
                           },
"get_inbox_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_messages":
{ Args: { "p_before"?: string,"p_before_id"?: string,"p_group": string,"p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["message_kind"],"my_reaction": string,"pinned": boolean,"quote": Json,"reactions": Json,"reply_to": Json,"reply_to_id": string,"sender_avatar": string,"sender_id": string,"sender_is_author": boolean,"sender_name": string,"state": Database["public"]['Enums']["message_state"]
            }[]
                           },
"get_moderation_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_moderation":
{ Args: Record<PropertyKey, never>; Returns: {
              "action": Database["public"]['Enums']["moderation_action_kind"],"action_id": string,"appeal_status": Database["public"]['Enums']["appeal_status"],"can_appeal": boolean,"created_at": string,"ends_at": string,"message": string,"sanction_id": string
            }[]
                           },
"get_onboarding_paywall":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_revision_status":
{ Args: { "p_rev": string }; Returns: Json
                           },
"get_staff_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_staff_invite":
{ Args: { "p_token_hash": string }; Returns: Json
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
"i_blocked":
{ Args: { "p_user": string }; Returns: boolean
                           },
"inbox_rows_for":
{ Args: { "p_user": string }; Returns: {
              "avatar_url": string,"group_id": string,"is_author": boolean,"kind": Database["public"]['Enums']["group_kind"],"last_at": string,"last_body": string,"last_from_author": boolean,"last_kind": Database["public"]['Enums']["message_kind"],"last_sender": string,"last_state": Database["public"]['Enums']["message_state"],"live": boolean,"member_count": number,"muted": boolean,"name": string,"other_user_id": string,"role": Database["public"]['Enums']["group_role"],"unread_count": number
            }[]
                           },
"ingest_support_email":
{ Args: { "p_attachments"?: Json,"p_body": string,"p_from": string,"p_in_reply_to"?: string,"p_message_id": string,"p_subject": string }; Returns: Json
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
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"is_staff_any":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"join_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"leave_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"list_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"email": string,"expires_at": string,"full_name": string,"id": string,"invited_by_name": string,"is_self": boolean,"kind": string,"last_active_at": string,"mfa_on": boolean,"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"make_username":
{ Args: { "p_name": string }; Returns: string
                           },
"mark_all_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_read":
{ Args: { "p_group": string,"p_up_to"?: string }; Returns: undefined
                           },
"migrate_anchors":
{ Args: { "p_base": string,"p_new": string }; Returns: Json
                           },
"note_staff_code_failure":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"note_staff_signin_failure":
{ Args: { "p_email": string }; Returns: undefined
                           },
"onboarding_step_ord":
{ Args: { "p_step": string }; Returns: number
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
"publish_due":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"publish_help_article":
{ Args: { "p_article": string,"p_version"?: string }; Returns: undefined
                           },
"publish_revision":
{ Args: { "p_actor"?: string,"p_notify_followers"?: boolean,"p_rev": string,"p_schedule_at"?: string }; Returns: Json
                           },
"purge_deleted_messages":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"purge_snapshots":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"react":
{ Args: { "p_emoji": string,"p_group"?: string,"p_message": string }; Returns: Json
                           },
"reader_reply_ticket":
{ Args: { "p_body": string,"p_ticket": string }; Returns: undefined
                           },
"record_automod_hits":
{ Args: { "p_word_ids": (string)[] }; Returns: undefined
                           },
"record_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_flag": string,"p_inverse": Json,"p_op": Json,"p_rev": string }; Returns: Json
                           },
"refresh_member_counts":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"register_device":
{ Args: { "p_app_version"?: string,"p_device_key": string,"p_model"?: string,"p_os"?: string,"p_push_token"?: string }; Returns: boolean
                           },
"reject_revision":
{ Args: { "p_actor"?: string,"p_reason": string,"p_rev": string }; Returns: undefined
                           },
"release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
                           },
"remind_author":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: undefined
                           },
"reply_ticket":
{ Args: { "p_body": string,"p_macro"?: string,"p_solve"?: boolean,"p_ticket": string }; Returns: string
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
"report_severity_for":
{ Args: { "p_reason": Database["public"]['Enums']["report_reason"] }; Returns: Database["public"]['Enums']["report_severity"]
                           },
"report_severity_setting":
{ Args: { "p_reason": Database["public"]['Enums']["report_reason"] }; Returns: Database["public"]['Enums']["report_severity"]
                           },
"republish_book":
{ Args: { "p_actor"?: string,"p_book": string }; Returns: Json
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
"respond_to_claim":
{ Args: { "p_claim": string,"p_response": string }; Returns: undefined
                           },
"revert_to_revision":
{ Args: { "p_actor"?: string,"p_reason": string,"p_rev": string }; Returns: Json
                           },
"revision_links":
{ Args: { "p_rev": string }; Returns: Json
                           },
"revision_score":
{ Args: { "p_rev": string }; Returns: number
                           },
"revoke_staff_invite":
{ Args: { "p_invite": string }; Returns: undefined
                           },
"sanction_expiry":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"save_automod_word":
{ Args: { "p_action": string,"p_category": string,"p_id"?: string,"p_is_phrase": boolean,"p_scope": string,"p_text": string }; Returns: string
                           },
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
"full_name": string,
"id": string,
"interests": (string)[],
"is_author": boolean,
"is_reader": boolean,
"onboarding_step": string,
"phone": string | null,
"privacy_version": number | null,
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
"save_support_macro":
{ Args: { "p_body": string,"p_category"?: Database["public"]['Enums']["ticket_category"],"p_id"?: string,"p_title": string }; Returns: string
                           },
"seal_failed":
{ Args: { "p_generation": number,"p_rev": string }; Returns: boolean
                           },
"search_communities":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_q"?: string,"p_type"?: string }; Returns: {
              "avatar_url": string,"description": string,"id": string,"joined": boolean,"kind": Database["public"]['Enums']["group_kind"],"live": boolean,"member_count": number,"name": string
            }[]
                           },
"select_fast_lane_audits":
{ Args: Record<PropertyKey, never>; Returns: number
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
"set_automod_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: undefined
                           },
"set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"set_group_mute":
{ Args: { "p_group": string,"p_until": string }; Returns: undefined
                           },
"set_live_count":
{ Args: { "p_count": number,"p_group": string }; Returns: undefined
                           },
"set_report_severity":
{ Args: { "p_report": string,"p_severity": Database["public"]['Enums']["report_severity"] }; Returns: undefined
                           },
"set_staff_status":
{ Args: { "p_active": boolean,"p_user": string }; Returns: undefined
                           },
"set_user_genres":
{ Args: { "p_genre_ids": (string)[] }; Returns: undefined
                           },
"sla_watch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"staff_by_role":
{ Args: Record<PropertyKey, never>; Returns: {
              "invited": (string)[],"names": (string)[],"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"staff_decide_report":
{ Args: { "p_action"?: string,"p_decision": string,"p_duration_days"?: number,"p_internal_note"?: string,"p_message_to_user"?: string,"p_notify_reporters"?: boolean,"p_reason"?: string,"p_report": string }; Returns: Json
                           },
"staff_mfa_ok":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"staff_mfa_verified_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"staff_return_chapter_charge":
{ Args: { "p_ledger": number,"p_reason": Database["public"]['Enums']["credit_return_reason"] }; Returns: Json
                           },
"staff_signin_locked":
{ Args: { "p_email": string }; Returns: boolean
                           },
"submit_revision":
{ Args: { "p_rev": string }; Returns: Json
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
"undo_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_fix": string }; Returns: Json
                           },
"undo_release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
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
"update_ticket":
{ Args: { "p_assignee"?: string,"p_category"?: Database["public"]['Enums']["ticket_category"],"p_status"?: Database["public"]['Enums']["ticket_status"],"p_ticket": string,"p_unassign"?: boolean }; Returns: undefined
                           },
"use_staff_backup_code":
{ Args: { "p_code": string }; Returns: number
                           },
"uuid7":
{ Args: { "p_at"?: string }; Returns: string
                           },
"vote_help":
{ Args: { "p_article": string,"p_helpful": boolean }; Returns: undefined
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id"?: string,"p_object_label"?: string,"p_object_type"?: string,"p_reason"?: string,"p_summary"?: string }; Returns: number
                           }
          }
          Enums: {
            "anchor_method": "exact"|"fuzzy"|"nearest","app_theme": "sunflower"|"palm"|"plum"|"night","appeal_status": "new"|"in_review"|"upheld"|"reduced"|"overturned","appeal_subject": "sanction"|"application"|"book_rejection"|"content_removal","book_status": "draft"|"live"|"scheduled"|"unpublished"|"taken_down"|"rejected","chapter_kind": "chapter"|"part","claim_status": "new"|"waiting_on_author"|"upheld"|"rejected","claim_type": "copyright"|"plagiarism"|"impersonation","credit_return_reason": "skipped_ahead"|"did_not_open"|"wrong_book","credit_return_state": "done"|"pending_approval"|"declined","draft_step": "upload"|"converting"|"checking"|"chapters"|"preview","entitlement_scope": "book"|"chapter","entitlement_source": "unlock_all"|"chapter"|"chapter_complete"|"gift"|"staff","fast_lane_result": "pending"|"ok"|"problem","flag_source": "worker"|"desk"|"staff","flag_status": "open"|"fixed"|"dismissed","group_kind": "official"|"club"|"author"|"readalong"|"room"|"dm","group_role": "owner"|"moderator"|"member","group_visibility": "public"|"followers"|"private","group_who_can_post": "members"|"staff"|"owner_and_followers","help_category": "getting_started"|"credits_plans"|"reading"|"community"|"authors"|"account_privacy","ledger_bucket": "plan"|"rollover"|"topup"|"promo","ledger_reason": "plan_grant"|"rollover"|"top_up"|"unlock_all"|"chapter"|"undo"|"tip"|"message"|"expiry"|"refund"|"staff_adjust"|"gift_out"|"gift_in"|"promo","message_kind": "text"|"quote"|"system","message_state": "visible"|"auto_hidden"|"removed"|"deleted","moderation_action_kind": "keep"|"remove"|"mark_spoiler"|"warn"|"mute"|"suspend"|"ban"|"lock_chat"|"restore","permission_level": "allow"|"limited","report_content_type": "message"|"discussion_comment"|"review"|"post_comment"|"author_post"|"profile"|"book"|"dm","report_outcome": "keep"|"removed"|"spoiler"|"actioned"|"dismissed","report_reason": "spam"|"harassment"|"hate"|"sexual"|"violence"|"self_harm"|"copyright"|"spoilers"|"impersonation"|"other","report_severity": "high"|"medium"|"low","report_status": "open"|"auto_hidden"|"resolved","revision_origin": "author"|"staff"|"desk","revision_status": "draft"|"processing"|"with_desk"|"needs_fixes"|"ready_for_review"|"sent_back"|"scheduled"|"live"|"superseded"|"unpublished"|"taken_down"|"rejected","sanction_kind": "warn"|"mute"|"suspend"|"ban","sanction_state": "pending"|"active"|"ended"|"overturned","send_back_source": "fixer"|"quick_review"|"desk_auto"|"system","signup_intent": "reader"|"author","source_type": "docx"|"epub"|"pdf","staff_role": "super_admin"|"operations_admin"|"publisher"|"moderator"|"finance"|"support"|"analyst","ticket_category": "billing"|"book_access"|"account"|"author_help"|"bug"|"other","ticket_channel": "email"|"app","ticket_message_kind": "reader"|"staff"|"note","ticket_status": "open"|"waiting_on_reader"|"solved","unpublish_reason": "author_request"|"policy_violation"|"quality"
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
            "anchor_method": ["exact", "fuzzy", "nearest"],"app_theme": ["sunflower", "palm", "plum", "night"],"appeal_status": ["new", "in_review", "upheld", "reduced", "overturned"],"appeal_subject": ["sanction", "application", "book_rejection", "content_removal"],"book_status": ["draft", "live", "scheduled", "unpublished", "taken_down", "rejected"],"chapter_kind": ["chapter", "part"],"claim_status": ["new", "waiting_on_author", "upheld", "rejected"],"claim_type": ["copyright", "plagiarism", "impersonation"],"credit_return_reason": ["skipped_ahead", "did_not_open", "wrong_book"],"credit_return_state": ["done", "pending_approval", "declined"],"draft_step": ["upload", "converting", "checking", "chapters", "preview"],"entitlement_scope": ["book", "chapter"],"entitlement_source": ["unlock_all", "chapter", "chapter_complete", "gift", "staff"],"fast_lane_result": ["pending", "ok", "problem"],"flag_source": ["worker", "desk", "staff"],"flag_status": ["open", "fixed", "dismissed"],"group_kind": ["official", "club", "author", "readalong", "room", "dm"],"group_role": ["owner", "moderator", "member"],"group_visibility": ["public", "followers", "private"],"group_who_can_post": ["members", "staff", "owner_and_followers"],"help_category": ["getting_started", "credits_plans", "reading", "community", "authors", "account_privacy"],"ledger_bucket": ["plan", "rollover", "topup", "promo"],"ledger_reason": ["plan_grant", "rollover", "top_up", "unlock_all", "chapter", "undo", "tip", "message", "expiry", "refund", "staff_adjust", "gift_out", "gift_in", "promo"],"message_kind": ["text", "quote", "system"],"message_state": ["visible", "auto_hidden", "removed", "deleted"],"moderation_action_kind": ["keep", "remove", "mark_spoiler", "warn", "mute", "suspend", "ban", "lock_chat", "restore"],"permission_level": ["allow", "limited"],"report_content_type": ["message", "discussion_comment", "review", "post_comment", "author_post", "profile", "book", "dm"],"report_outcome": ["keep", "removed", "spoiler", "actioned", "dismissed"],"report_reason": ["spam", "harassment", "hate", "sexual", "violence", "self_harm", "copyright", "spoilers", "impersonation", "other"],"report_severity": ["high", "medium", "low"],"report_status": ["open", "auto_hidden", "resolved"],"revision_origin": ["author", "staff", "desk"],"revision_status": ["draft", "processing", "with_desk", "needs_fixes", "ready_for_review", "sent_back", "scheduled", "live", "superseded", "unpublished", "taken_down", "rejected"],"sanction_kind": ["warn", "mute", "suspend", "ban"],"sanction_state": ["pending", "active", "ended", "overturned"],"send_back_source": ["fixer", "quick_review", "desk_auto", "system"],"signup_intent": ["reader", "author"],"source_type": ["docx", "epub", "pdf"],"staff_role": ["super_admin", "operations_admin", "publisher", "moderator", "finance", "support", "analyst"],"ticket_category": ["billing", "book_access", "account", "author_help", "bug", "other"],"ticket_channel": ["email", "app"],"ticket_message_kind": ["reader", "staff", "note"],"ticket_status": ["open", "waiting_on_reader", "solved"],"unpublish_reason": ["author_request", "policy_violation", "quality"]
          }
        }
} as const
