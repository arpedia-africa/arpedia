
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
                    "access_removed_at": string | null,"author_id": string,"comments_count": number,"created_at": string,"current_revision_id": string | null,"description": string | null,"genres": (string)[],"id": string,"new_arrival_until": string | null,"preview_override_percent": number | null,"preview_override_reason": string | null,"price_override_credits": number | null,"price_override_reason": string | null,"reads_count": number,"status": Database["public"]['Enums']["book_status"],"subtitle": string | null,"tags": (string)[],"title": string,"unpublish_reason": Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_removed_at"?: string | null,"author_id": string,"comments_count"?: number,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"preview_override_percent"?: number | null,"preview_override_reason"?: string | null,"price_override_credits"?: number | null,"price_override_reason"?: string | null,"reads_count"?: number,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"tags"?: (string)[],"title": string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_removed_at"?: string | null,"author_id"?: string,"comments_count"?: number,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"preview_override_percent"?: number | null,"preview_override_reason"?: string | null,"price_override_credits"?: number | null,"price_override_reason"?: string | null,"reads_count"?: number,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"tags"?: (string)[],"title"?: string,"unpublish_reason"?: Database["public"]['Enums']["unpublish_reason"] | null,"unpublished_at"?: string | null,"updated_at"?: string
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
                    "avatar_url": string | null,"bio": string | null,"country": string,"created_at": string,"date_of_birth": string | null,"deleted_at": string | null,"full_name": string,"id": string,"interests": (string)[],"is_author": boolean,"is_reader": boolean,"onboarding_step": string,"phone": string | null,"privacy_version": number | null,"reader_settings": NonNullable<Json>,"signup_intent": Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at": string | null,"terms_version": number | null,"theme": Database["public"]['Enums']["app_theme"],"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"full_name"?: string,"id": string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"reader_settings"?: NonNullable<Json>,"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"deleted_at"?: string | null,"full_name"?: string,"id"?: string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"onboarding_step"?: string,"phone"?: string | null,"privacy_version"?: number | null,"reader_settings"?: NonNullable<Json>,"signup_intent"?: Database["public"]['Enums']["signup_intent"] | null,"terms_accepted_at"?: string | null,"terms_version"?: number | null,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
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
                },"reading_progress": {
                  Row: {
                    "book_id": string,"chapter_ord": number,"finished_at": string | null,"last_opened_at": string,"max_percent": number,"percent": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"chapter_ord"?: number,"finished_at"?: string | null,"last_opened_at"?: string,"max_percent"?: number,"percent"?: number,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"chapter_ord"?: number,"finished_at"?: string | null,"last_opened_at"?: string,"max_percent"?: number,"percent"?: number,"user_id"?: string
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
                    "created_at": string,"id": string,"note": string | null,"reason": string,"reporter_id": string,"status": string,"target_id": string,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"reason": string,"reporter_id": string,"status"?: string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"reason"?: string,"reporter_id"?: string,"status"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    {
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
"_apply_book_price":
{ Args: { "p_price": number,"p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_apply_counts":
{ Args: { "p_result": Json,"p_rev": string }; Returns: undefined
                           },
"_approval_roles":
{ Args: { "p_decide": boolean,"p_kind": string }; Returns: (Database["public"]['Enums']["staff_role"])[]
                           },
"_audit":
{ Args: { "p_action": string,"p_actor": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id": string,"p_object_label"?: string,"p_object_type": string,"p_reason"?: string,"p_summary"?: string }; Returns: undefined
                           },
"_audit_as":
{ Args: { "p_action": string,"p_actor": string,"p_after": Json,"p_area": string,"p_before": Json,"p_object_id": string,"p_object_label": string,"p_object_type": string,"p_reason": string,"p_summary": string }; Returns: number
                           },
"_balance":
{ Args: { "p_user": string }; Returns: number
                           },
"_book_card":
{ Args: { "p_book": string }; Returns: Json
                           },
"_bucket":
{ Args: { "p_bucket": Database["public"]['Enums']["ledger_bucket"],"p_user": string }; Returns: number
                           },
"_buyable_book":
{ Args: { "p_book": string }; Returns: {
              "access_removed_at": string | null,
"author_id": string,
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
"_chapter_paid":
{ Args: { "p_book": string,"p_user": string }; Returns: number
                           },
"_chapter_prices_ok":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_check_spend_rate":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_check_super_admins":
{ Args: { "p_user": string }; Returns: undefined
                           },
"_config":
{ Args: { "p_key": string }; Returns: Json
                           },
"_consume_stepup":
{ Args: { "p_id": string,"p_scope": string }; Returns: string
                           },
"_event_plan_code":
{ Args: { "n": Json }; Returns: string
                           },
"_event_topup_code":
{ Args: { "n": Json }; Returns: string
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
"_has_staff_role":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[],"p_user": string }; Returns: boolean
                           },
"_insert_flags":
{ Args: { "p_flags": Json,"p_rev": string,"p_source": Database["public"]['Enums']["flag_source"] }; Returns: number
                           },
"_is_revision_author":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_is_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_ledger_add":
{ Args: { "p_actor"?: string,"p_bucket": Database["public"]['Enums']["ledger_bucket"],"p_delta": number,"p_expires"?: string,"p_key": string,"p_meta"?: Json,"p_note"?: string,"p_reason": Database["public"]['Enums']["ledger_reason"],"p_ref_id"?: string,"p_ref_type"?: string,"p_txn": string,"p_user": string }; Returns: number
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
"_mask_pii":
{ Args: { "p": Json }; Returns: Json
                           },
"_mid_paygo":
{ Args: { "p_book": string }; Returns: number
                           },
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
"_owns_book":
{ Args: { "p_book": string,"p_user": string }; Returns: boolean
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
"_publish_now":
{ Args: { "p_actor": string,"p_mode": string,"p_notify": boolean,"p_rev": string }; Returns: Json
                           },
"_raise":
{ Args: { "p_code": string,"p_detail"?: Json }; Returns: undefined
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
"_report":
{ Args: { "p_note": string,"p_reason": string,"p_target": string,"p_type": string }; Returns: string
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
"_require_price_staff":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_service":
{ Args: { "p_fn": string }; Returns: undefined
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
"_route":
{ Args: { "p_rev": string }; Returns: Database["public"]['Enums']["revision_status"]
                           },
"_rules":
{ Args: { "p_at"?: string }; Returns: Json
                           },
"_rules_version":
{ Args: { "p_at"?: string }; Returns: string
                           },
"_send_back":
{ Args: { "p_actor": string,"p_issues": Json,"p_note": string,"p_rev": string,"p_source": Database["public"]['Enums']["send_back_source"] }; Returns: string
                           },
"_set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_spread_price":
{ Args: { "p_price": number,"p_rev": string }; Returns: undefined
                           },
"_step":
{ Args: { "p_rev": string,"p_step": string }; Returns: undefined
                           },
"_threshold":
{ Args: { "p_key": string }; Returns: number
                           },
"_uid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_validate_rules":
{ Args: { "p": Json }; Returns: Json
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
"admin_book_access":
{ Args: { "p_book": string }; Returns: Json
                           },
"admin_book_stats":
{ Args: { "p_book": string }; Returns: Json
                           },
"admin_credits_overview":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"admin_revenue_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"admin_set_book_price":
{ Args: { "p_book": string,"p_price": number,"p_prices": Json,"p_reason": string }; Returns: Json
                           },
"admin_set_preview":
{ Args: { "p_book": string,"p_percent": number,"p_reason": string }; Returns: undefined
                           },
"apply_payment_event":
{ Args: { "p_event": number }; Returns: string
                           },
"apply_pricing_rules":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"audit_fast_lane":
{ Args: { "p_actor"?: string,"p_note": string,"p_result": Database["public"]['Enums']["fast_lane_result"],"p_rev": string }; Returns: undefined
                           },
"author_in_good_standing":
{ Args: { "p_author": string }; Returns: boolean
                           },
"begin_reseal":
{ Args: { "p_actor": string,"p_rev": string }; Returns: Json
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
"cancel_pricing_rules":
{ Args: { "p_id": string }; Returns: undefined
                           },
"change_staff_role":
{ Args: { "p_role": Database["public"]['Enums']["staff_role"],"p_user": string }; Returns: undefined
                           },
"claim_revision":
{ Args: { "p_actor"?: string,"p_rev": string,"p_screen": string,"p_take_over"?: boolean }; Returns: Json
                           },
"clawback_purchase":
{ Args: { "p_credits"?: number,"p_end_sub"?: boolean,"p_reason": string,"p_transaction": string }; Returns: Json
                           },
"clear_staff_signin_failures":
{ Args: Record<PropertyKey, never>; Returns: undefined
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
"confirm_chapters":
{ Args: { "p_actor": string,"p_result": Json,"p_rev": string }; Returns: Json
                           },
"create_promo":
{ Args: { "p_amount": number,"p_campaign_tag": string,"p_code": string,"p_ends_at": string,"p_kind": string,"p_max_uses": number,"p_new_readers_only": boolean,"p_starts_at": string,"p_uses_per_reader": number,"p_web_only": boolean }; Returns: string
                           },
"create_revision":
{ Args: { "p_book"?: string,"p_meta": Json }; Returns: Json
                           },
"create_staff_backup_codes":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"credit_balance":
{ Args: { "p_user": string }; Returns: number
                           },
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
"decide_credit_grant":
{ Args: { "p_approve": boolean,"p_request": string }; Returns: Json
                           },
"decide_refund":
{ Args: { "p_amount_kobo"?: number,"p_note"?: string,"p_refund": boolean,"p_request": string,"p_type"?: string }; Returns: Json
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
"finalize_revision":
{ Args: { "p_actor": string,"p_files": Json,"p_rev": string }; Returns: Json
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
"get_gift_people":
{ Args: { "p_book": string,"p_query"?: string }; Returns: Json
                           },
"get_my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_onboarding_paywall":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"get_pricing_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_reviews":
{ Args: { "p_book": string,"p_limit"?: number,"p_offset"?: number,"p_stars"?: number }; Returns: Json
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
"gift_book":
{ Args: { "p_book": string,"p_expected_price": number,"p_key": string,"p_message": string,"p_recipient": string }; Returns: Json
                           },
"grant_plan_credits":
{ Args: { "p_period_end": string,"p_period_start": string,"p_rollover"?: boolean,"p_sub": string,"p_txn_ref": string,"p_user": string }; Returns: number
                           },
"grant_topup":
{ Args: { "p_code": string,"p_from_webhook"?: boolean,"p_txn_ref": string,"p_user": string }; Returns: number
                           },
"has_blocking_flag":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"has_permission":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"hide_reviewer":
{ Args: { "p_user": string }; Returns: undefined
                           },
"ingest_payment_event":
{ Args: { "p_event_id": string,"p_event_type": string,"p_normalized": Json,"p_occurred_at": string,"p_payload": Json,"p_provider": string }; Returns: Json
                           },
"invite_staff":
{ Args: { "p_actor"?: string,"p_email": string,"p_name": string,"p_role": Database["public"]['Enums']["staff_role"],"p_token_hash": string }; Returns: string
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
"list_audit":
{ Args: { "p_action"?: string,"p_actor"?: string,"p_area"?: string,"p_from"?: string,"p_page"?: number,"p_per"?: number,"p_q"?: string,"p_to"?: string }; Returns: Json
                           },
"list_integrations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_policies":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"email": string,"expires_at": string,"full_name": string,"id": string,"invited_by_name": string,"is_self": boolean,"kind": string,"last_active_at": string,"mfa_on": boolean,"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"make_username":
{ Args: { "p_name": string }; Returns: string
                           },
"migrate_anchors":
{ Args: { "p_base": string,"p_new": string }; Returns: Json
                           },
"my_credit_balance":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"onboarding_step_ord":
{ Args: { "p_step": string }; Returns: number
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
"pipeline_sla":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"post_review":
{ Args: { "p_body": string,"p_book": string,"p_spoiler": boolean,"p_stars": number }; Returns: Json
                           },
"preview_pricing_rules":
{ Args: { "p_rules": Json }; Returns: Json
                           },
"publish_due":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"publish_policy":
{ Args: { "p_accept_again": boolean,"p_change_summary": string,"p_policy": string,"p_stepup": string }; Returns: Json
                           },
"publish_revision":
{ Args: { "p_actor"?: string,"p_notify_followers"?: boolean,"p_rev": string,"p_schedule_at"?: string }; Returns: Json
                           },
"rebuild_book_related":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_flag": string,"p_inverse": Json,"p_op": Json,"p_rev": string }; Returns: Json
                           },
"redeem_promo":
{ Args: { "p_code": string }; Returns: Json
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
"report_book":
{ Args: { "p_book": string,"p_note"?: string,"p_reason": string }; Returns: string
                           },
"report_review":
{ Args: { "p_note"?: string,"p_reason": string,"p_review": string }; Returns: string
                           },
"republish_book":
{ Args: { "p_actor"?: string,"p_book": string }; Returns: Json
                           },
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
"request_integration_check":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"request_refund":
{ Args: { "p_reason": string,"p_transaction": string }; Returns: string
                           },
"require_permission":
{ Args: { "p_permission": string }; Returns: undefined
                           },
"reset_staff_mfa":
{ Args: { "p_user": string }; Returns: undefined
                           },
"resume_subscription":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"roll_over":
{ Args: { "p_key": string,"p_plan": string,"p_txn": string,"p_until": string,"p_user": string }; Returns: Json
                           },
"rollback_ota":
{ Args: { "p_stepup": string }; Returns: Json
                           },
"rotate_integration_key":
{ Args: { "p_service": string,"p_stepup": string }; Returns: number
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
"reader_settings": NonNullable<Json>,
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
"seal_failed":
{ Args: { "p_generation": number,"p_rev": string }; Returns: boolean
                           },
"select_fast_lane_audits":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"send_back_revision":
{ Args: { "p_actor"?: string,"p_issues": Json,"p_note": string,"p_rev": string,"p_source"?: Database["public"]['Enums']["send_back_source"] }; Returns: string
                           },
"sent_back_reminder":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"set_config":
{ Args: { "p_key": string,"p_stepup"?: string,"p_value": Json }; Returns: Json
                           },
"set_copy":
{ Args: { "p_key": string,"p_text": string }; Returns: Json
                           },
"set_flag":
{ Args: { "p_enabled": boolean,"p_key": string,"p_min_version"?: string,"p_rollout"?: number }; Returns: Json
                           },
"set_following":
{ Args: { "p_follow": boolean,"p_user": string }; Returns: boolean
                           },
"set_gifting_frozen":
{ Args: { "p_frozen": boolean }; Returns: boolean
                           },
"set_my_alert_pref":
{ Args: { "p_enabled": boolean,"p_kind": string }; Returns: undefined
                           },
"set_policy_accept_again":
{ Args: { "p_on": boolean,"p_policy": string }; Returns: undefined
                           },
"set_promo_status":
{ Args: { "p_code": string,"p_status": string }; Returns: string
                           },
"set_reader_setting":
{ Args: { "p_key": string,"p_value": Json }; Returns: Json
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
"spend_credits":
{ Args: { "p_amount": number,"p_author": string,"p_book": string,"p_chapter_uid": string,"p_counterparty"?: string,"p_key": string,"p_meta"?: Json,"p_reason": Database["public"]['Enums']["ledger_reason"],"p_user": string }; Returns: Json
                           },
"staff_by_role":
{ Args: Record<PropertyKey, never>; Returns: {
              "invited": (string)[],"names": (string)[],"role": Database["public"]['Enums']["staff_role"]
            }[]
                           },
"staff_extend_subscription":
{ Args: { "p_days": number,"p_reason": string,"p_sub": string }; Returns: Json
                           },
"staff_grant_credits":
{ Args: { "p_credits": number,"p_reason": string,"p_user": string }; Returns: Json
                           },
"staff_mfa_ok":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"staff_mfa_verified_at":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"staff_return_chapter":
{ Args: { "p_charge": number,"p_note"?: string,"p_reason_code": string }; Returns: Json
                           },
"staff_signin_locked":
{ Args: { "p_email": string }; Returns: boolean
                           },
"submit_revision":
{ Args: { "p_rev": string }; Returns: Json
                           },
"tip_author":
{ Args: { "p_book": string,"p_credits": number,"p_key": string,"p_note": string }; Returns: Json
                           },
"toggle_review_like":
{ Args: { "p_review": string }; Returns: boolean
                           },
"undo_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_fix": string }; Returns: Json
                           },
"undo_release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
                           },
"unhide_reviewer":
{ Args: { "p_user": string }; Returns: undefined
                           },
"unlock_book":
{ Args: { "p_book": string,"p_expected_price": number,"p_key": string }; Returns: Json
                           },
"unpublish_book":
{ Args: { "p_actor"?: string,"p_book": string,"p_confirm_title": string,"p_notify_readers": boolean,"p_reason": Database["public"]['Enums']["unpublish_reason"],"p_remove_access": boolean }; Returns: Json
                           },
"unpublish_preview":
{ Args: { "p_book": string }; Returns: Json
                           },
"update_my_staff_profile":
{ Args: { "p_name": string,"p_phone": string }; Returns: undefined
                           },
"use_staff_backup_code":
{ Args: { "p_code": string }; Returns: number
                           },
"verify_stepup":
{ Args: { "p_backup_code"?: string,"p_scope": string }; Returns: string
                           },
"worker_payment_subscription":
{ Args: { "p_sub": string }; Returns: Json
                           },
"worker_set_integration_health":
{ Args: { "p_error_note"?: string,"p_error_rate": number,"p_key_masked"?: string,"p_last_event_at": string,"p_last_event_text": string,"p_service": string,"p_status": string }; Returns: undefined
                           },
"worker_user_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id"?: string,"p_object_label"?: string,"p_object_type"?: string,"p_reason"?: string,"p_summary"?: string }; Returns: number
                           }
          }
          Enums: {
            "anchor_method": "exact"|"fuzzy"|"nearest","app_theme": "sunflower"|"palm"|"plum"|"night","book_status": "draft"|"live"|"scheduled"|"unpublished"|"taken_down"|"rejected","chapter_kind": "chapter"|"part","draft_step": "upload"|"converting"|"checking"|"chapters"|"preview","entitlement_scope": "book"|"chapter","entitlement_source": "unlock_all"|"chapter"|"chapter_complete"|"gift"|"staff","fast_lane_result": "pending"|"ok"|"problem","flag_source": "worker"|"desk"|"staff","flag_status": "open"|"fixed"|"dismissed","ledger_bucket": "plan"|"rollover"|"topup"|"promo","ledger_reason": "plan_grant"|"rollover"|"top_up"|"unlock_all"|"chapter"|"undo"|"tip"|"message"|"expiry"|"refund"|"staff_adjust"|"gift_out"|"gift_in"|"promo","permission_level": "allow"|"limited","revision_origin": "author"|"staff"|"desk","revision_status": "draft"|"processing"|"with_desk"|"needs_fixes"|"ready_for_review"|"sent_back"|"scheduled"|"live"|"superseded"|"unpublished"|"taken_down"|"rejected","send_back_source": "fixer"|"quick_review"|"desk_auto"|"system","signup_intent": "reader"|"author","source_type": "docx"|"epub"|"pdf","staff_role": "super_admin"|"operations_admin"|"publisher"|"moderator"|"finance"|"support"|"analyst","unpublish_reason": "author_request"|"policy_violation"|"quality"
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
            "anchor_method": ["exact", "fuzzy", "nearest"],"app_theme": ["sunflower", "palm", "plum", "night"],"book_status": ["draft", "live", "scheduled", "unpublished", "taken_down", "rejected"],"chapter_kind": ["chapter", "part"],"draft_step": ["upload", "converting", "checking", "chapters", "preview"],"entitlement_scope": ["book", "chapter"],"entitlement_source": ["unlock_all", "chapter", "chapter_complete", "gift", "staff"],"fast_lane_result": ["pending", "ok", "problem"],"flag_source": ["worker", "desk", "staff"],"flag_status": ["open", "fixed", "dismissed"],"ledger_bucket": ["plan", "rollover", "topup", "promo"],"ledger_reason": ["plan_grant", "rollover", "top_up", "unlock_all", "chapter", "undo", "tip", "message", "expiry", "refund", "staff_adjust", "gift_out", "gift_in", "promo"],"permission_level": ["allow", "limited"],"revision_origin": ["author", "staff", "desk"],"revision_status": ["draft", "processing", "with_desk", "needs_fixes", "ready_for_review", "sent_back", "scheduled", "live", "superseded", "unpublished", "taken_down", "rejected"],"send_back_source": ["fixer", "quick_review", "desk_auto", "system"],"signup_intent": ["reader", "author"],"source_type": ["docx", "epub", "pdf"],"staff_role": ["super_admin", "operations_admin", "publisher", "moderator", "finance", "support", "analyst"],"unpublish_reason": ["author_request", "policy_violation", "quality"]
          }
        }
} as const
