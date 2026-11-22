
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
            "analytics_daily": {
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
                },"pricing_rule_versions": {
                  Row: {
                    "approved_by": string | null,"changed_by": string | null,"created_at": string,"effective_at": string,"id": string,"note": string | null,"rules": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_by"?: string | null,"changed_by"?: string | null,"created_at"?: string,"effective_at": string,"id"?: string,"note"?: string | null,"rules": NonNullable<Json>
                  }
                  Update: {
                    "approved_by"?: string | null,"changed_by"?: string | null,"created_at"?: string,"effective_at"?: string,"id"?: string,"note"?: string | null,"rules"?: NonNullable<Json>
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
                },"reports": {
                  Row: {
                    "assignee_id": string | null,"book_id": string | null,"content_id": string,"content_type": Database["public"]['Enums']["report_content_type"],"created_at": string,"details": string | null,"due_at": string,"escalated_at": string | null,"first_action_at": string | null,"group_id": string | null,"id": string,"outcome": Database["public"]['Enums']["report_outcome"] | null,"reason": Database["public"]['Enums']["report_reason"],"ref": string,"reported_user_id": string | null,"reporter_id": string | null,"resolved_at": string | null,"severity": Database["public"]['Enums']["report_severity"],"snapshot": Json | null,"status": Database["public"]['Enums']["report_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"content_id": string,"content_type": Database["public"]['Enums']["report_content_type"],"created_at"?: string,"details"?: string | null,"due_at": string,"escalated_at"?: string | null,"first_action_at"?: string | null,"group_id"?: string | null,"id"?: string,"outcome"?: Database["public"]['Enums']["report_outcome"] | null,"reason": Database["public"]['Enums']["report_reason"],"ref"?: string,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolved_at"?: string | null,"severity": Database["public"]['Enums']["report_severity"],"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "assignee_id"?: string | null,"book_id"?: string | null,"content_id"?: string,"content_type"?: Database["public"]['Enums']["report_content_type"],"created_at"?: string,"details"?: string | null,"due_at"?: string,"escalated_at"?: string | null,"first_action_at"?: string | null,"group_id"?: string | null,"id"?: string,"outcome"?: Database["public"]['Enums']["report_outcome"] | null,"reason"?: Database["public"]['Enums']["report_reason"],"ref"?: string,"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolved_at"?: string | null,"severity"?: Database["public"]['Enums']["report_severity"],"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["report_status"]
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
                    "app_version": string | null,"created_at": string,"device_key": string,"download_enabled": boolean,"id": string,"last_city": string | null,"last_seen_at": string,"model": string | null,"os": string | null,"push_disabled_at": string | null,"push_platform": string,"push_token": string | null,"push_token_at": string | null,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"device_key": string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_disabled_at"?: string | null,"push_platform"?: string,"push_token"?: string | null,"push_token_at"?: string | null,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"device_key"?: string,"download_enabled"?: boolean,"id"?: string,"last_city"?: string | null,"last_seen_at"?: string,"model"?: string | null,"os"?: string | null,"push_disabled_at"?: string | null,"push_platform"?: string,"push_token"?: string | null,"push_token_at"?: string | null,"revoked_at"?: string | null,"user_id"?: string
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
"_audit":
{ Args: { "p_action": string,"p_actor": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id": string,"p_object_label"?: string,"p_object_type": string,"p_reason"?: string,"p_summary"?: string }; Returns: undefined
                           },
"_audit_as":
{ Args: { "p_action": string,"p_actor": string,"p_after": Json,"p_area": string,"p_before": Json,"p_object_id": string,"p_object_label": string,"p_object_type": string,"p_reason": string,"p_summary": string }; Returns: number
                           },
"_author_earning_rows":
{ Args: { "p_author": string,"p_from": string,"p_to": string }; Returns: {
              "at": string,"book_id": string,"credits": number,"earned_kobo": number,"reason": Database["public"]['Enums']["ledger_reason"]
            }[]
                           },
"_author_month":
{ Args: { "p_author": string,"p_month": string }; Returns: Json
                           },
"_author_notify":
{ Args: { "p_kind": string,"p_payload": Json }; Returns: undefined
                           },
"_balance":
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
"_can_draft_push":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_chapter_access":
{ Args: { "p_book": string,"p_rev": string,"p_user": string }; Returns: {
              "access": string,"chapter_uid": string,"ord": number
            }[]
                           },
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
"_create_club":
{ Args: { "p_name": string,"p_owner": string }; Returns: string
                           },
"_create_notification":
{ Args: { "p_actor"?: string,"p_body"?: string,"p_book"?: string,"p_category": string,"p_kind": string,"p_target_id"?: string,"p_target_type"?: string,"p_title": string,"p_user": string }; Returns: string
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
"_has_staff_role":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[],"p_user": string }; Returns: boolean
                           },
"_in_bands":
{ Args: { "p_bands": (string)[],"p_price": number }; Returns: boolean
                           },
"_insert_flags":
{ Args: { "p_flags": Json,"p_rev": string,"p_source": Database["public"]['Enums']["flag_source"] }; Returns: number
                           },
"_insights_guard":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"_is_revision_author":
{ Args: { "p_rev": string }; Returns: boolean
                           },
"_is_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_latest_hourly":
{ Args: Record<PropertyKey, never>; Returns: string
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
"_match":
{ Args: { "p_q": string,"p_text": string,"p_typo": number }; Returns: number
                           },
"_mid_paygo":
{ Args: { "p_book": string }; Returns: number
                           },
"_month_start":
{ Args: { "p_month": string }; Returns: string
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
"_report":
{ Args: { "p_book": string,"p_details": string,"p_reason": Database["public"]['Enums']["report_reason"],"p_snapshot": Json,"p_target": string,"p_type": Database["public"]['Enums']["report_content_type"],"p_user": string }; Returns: string
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
"_set_chapter_prices":
{ Args: { "p_prices": Json,"p_rev": string }; Returns: undefined
                           },
"_small":
{ Args: { "p": number }; Returns: number
                           },
"_snippet":
{ Args: { "p_text": string,"p_word": string }; Returns: string
                           },
"_step":
{ Args: { "p_rev": string,"p_step": string }; Returns: undefined
                           },
"_story_hits":
{ Args: { "p_q": string }; Returns: {
              "book_id": string,"snippet": string
            }[]
                           },
"_threshold":
{ Args: { "p_key": string }; Returns: number
                           },
"_uid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_undo_chapter":
{ Args: { "p_key": string,"p_ledger": number,"p_staff": boolean,"p_user": string }; Returns: Json
                           },
"_validate_rules":
{ Args: { "p": Json }; Returns: Json
                           },
"_validate_target":
{ Args: { "p_allow_web": boolean,"p_target": Json }; Returns: undefined
                           },
"accept_staff_invite":
{ Args: { "p_token_hash": string,"p_user": string }; Returns: Database["public"]['Enums']["staff_role"]
                           },
"admin_application_checks":
{ Args: { "p_app": string }; Returns: Json
                           },
"admin_author":
{ Args: { "p_user": string }; Returns: Json
                           },
"admin_authors":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"admin_get_channel":
{ Args: { "p_group": string }; Returns: Json
                           },
"admin_list_channels":
{ Args: { "p_kind"?: string,"p_q"?: string,"p_reports"?: boolean,"p_status"?: string }; Returns: {
              "created_at": string,"id": string,"kind": Database["public"]['Enums']["group_kind"],"locked_until": string,"member_count": number,"messages_7d": number,"muted_until": string,"name": string,"open_reports": number,"owner_id": string,"owner_name": string,"slow_mode_seconds": number,"status": string,"visibility": Database["public"]['Enums']["group_visibility"],"who_can_post": Database["public"]['Enums']["group_who_can_post"]
            }[]
                           },
"admin_mute_member":
{ Args: { "p_group": string,"p_reason"?: string,"p_until": string,"p_user": string }; Returns: undefined
                           },
"admin_revenue_summary":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
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
"apply_push_receipts":
{ Args: { "p_rows": Json }; Returns: number
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
"can_quote":
{ Args: { "p_book": string,"p_chapter": number,"p_user": string }; Returns: boolean
                           },
"change_staff_role":
{ Args: { "p_role": Database["public"]['Enums']["staff_role"],"p_user": string }; Returns: undefined
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
"confirm_chapters":
{ Args: { "p_actor": string,"p_result": Json,"p_rev": string }; Returns: Json
                           },
"count_books":
{ Args: { "p_genre"?: string,"p_length_bands"?: (string)[] }; Returns: number
                           },
"create_notification":
{ Args: { "p_actor"?: string,"p_body"?: string,"p_book"?: string,"p_category": string,"p_kind": string,"p_target_id"?: string,"p_target_type"?: string,"p_title": string,"p_user": string }; Returns: string
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
"decide_credit_grant":
{ Args: { "p_approve": boolean,"p_request": string }; Returns: Json
                           },
"decide_refund":
{ Args: { "p_amount_kobo"?: number,"p_note"?: string,"p_refund": boolean,"p_request": string,"p_type"?: string }; Returns: Json
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
"email_template_latest":
{ Args: { "p_key": string }; Returns: Json
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
"get_credits_screen":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: Json
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
"get_messages":
{ Args: { "p_before"?: string,"p_before_id"?: string,"p_group": string,"p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["message_kind"],"my_reaction": string,"pinned": boolean,"quote": Json,"reactions": Json,"reply_to": Json,"reply_to_id": string,"sender_avatar": string,"sender_id": string,"sender_is_author": boolean,"sender_name": string,"state": Database["public"]['Enums']["message_state"]
            }[]
                           },
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
"get_plan_screen":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_plans":
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
"leave_group":
{ Args: { "p_group": string }; Returns: undefined
                           },
"link_book_request":
{ Args: { "p_book": string,"p_ids": (string)[] }; Returns: number
                           },
"list_books":
{ Args: { "p_cursor"?: Json,"p_genre"?: string,"p_length_bands"?: (string)[],"p_limit"?: number,"p_sort"?: string }; Returns: Json
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
"my_credit_balance":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"norm_query":
{ Args: { "p": string }; Returns: string
                           },
"norm_words":
{ Args: { "p": string }; Returns: (string)[]
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
"preview_pricing_rules":
{ Args: { "p_rules": Json }; Returns: Json
                           },
"publish_due":
{ Args: Record<PropertyKey, never>; Returns: number
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
"rebuild_book_related":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_email_event":
{ Args: { "p_kind": string,"p_resend_id": string }; Returns: undefined
                           },
"record_fix":
{ Args: { "p_actor": string,"p_expected_version": number,"p_flag": string,"p_inverse": Json,"p_op": Json,"p_rev": string }; Returns: Json
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
"release_to_review":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: Json
                           },
"remind_author":
{ Args: { "p_actor"?: string,"p_rev": string }; Returns: undefined
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
"report_book":
{ Args: { "p_book": string,"p_note"?: string,"p_reason": string }; Returns: string
                           },
"report_book_problem":
{ Args: { "p_book": string,"p_cfi": string,"p_chapter_uid": string,"p_note"?: string,"p_revision": string }; Returns: string
                           },
"report_message":
{ Args: { "p_also_block"?: boolean,"p_details"?: string,"p_message": string,"p_reason": Database["public"]['Enums']["report_reason"] }; Returns: string
                           },
"report_review":
{ Args: { "p_note"?: string,"p_reason": string,"p_review": string }; Returns: string
                           },
"report_severity_for":
{ Args: { "p_reason": Database["public"]['Enums']["report_reason"] }; Returns: Database["public"]['Enums']["report_severity"]
                           },
"republish_book":
{ Args: { "p_actor"?: string,"p_book": string }; Returns: Json
                           },
"request_book":
{ Args: { "p_q": string }; Returns: number
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
"rotate_trending":
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
"save_pricing_rules":
{ Args: { "p_note"?: string,"p_rules": Json }; Returns: Json
                           },
"save_search_tuning":
{ Args: { "p": Json }; Returns: undefined
                           },
"save_shelf_draft":
{ Args: { "p_items": Json,"p_section": string }; Returns: number
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
"set_export_status":
{ Args: { "p_error"?: string,"p_file_key"?: string,"p_id": string,"p_row_count"?: number,"p_status": Database["public"]['Enums']["export_status"] }; Returns: undefined
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
"set_live_count":
{ Args: { "p_count": number,"p_group": string }; Returns: undefined
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
"spend_credits":
{ Args: { "p_amount": number,"p_author": string,"p_book": string,"p_chapter_uid": string,"p_counterparty"?: string,"p_key": string,"p_meta"?: Json,"p_reason": Database["public"]['Enums']["ledger_reason"],"p_user": string }; Returns: Json
                           },
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
"staff_create_export":
{ Args: { "p_columns": (string)[],"p_kind": Database["public"]['Enums']["export_kind"],"p_params": Json,"p_reason"?: string }; Returns: string
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
"staff_set_export_schedule":
{ Args: { "p_enabled": boolean,"p_kind": string }; Returns: undefined
                           },
"staff_set_push_type":
{ Args: { "p_body"?: string,"p_enabled"?: boolean,"p_key": string,"p_title"?: string }; Returns: undefined
                           },
"staff_signin_locked":
{ Args: { "p_email": string }; Returns: boolean
                           },
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
"unpublish_preview":
{ Args: { "p_book": string }; Returns: Json
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
"upsert_annotations":
{ Args: { "p_batch": Json }; Returns: Json
                           },
"use_staff_backup_code":
{ Args: { "p_code": string }; Returns: number
                           },
"uuid7":
{ Args: { "p_at"?: string }; Returns: string
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
"worker_payment_subscription":
{ Args: { "p_sub": string }; Returns: Json
                           },
"worker_record_license":
{ Args: { "p_book": string,"p_device": string,"p_revision": string,"p_user": string,"p_valid_until": string }; Returns: undefined
                           },
"worker_register_device":
{ Args: { "p_name": string,"p_public_key": string,"p_user": string }; Returns: string
                           },
"worker_user_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id"?: string,"p_object_label"?: string,"p_object_type"?: string,"p_reason"?: string,"p_summary"?: string }; Returns: number
                           }
          }
          Enums: {
            "anchor_method": "exact"|"fuzzy"|"nearest","app_theme": "sunflower"|"palm"|"plum"|"night","application_event_kind": "submitted"|"assigned"|"info_asked"|"info_given"|"approved"|"rejected","application_status": "draft"|"new"|"needs_info"|"approved"|"rejected"|"withdrawn","author_status": "active"|"suspended","author_visibility": "public"|"private","banner_placement": "home_top"|"credits"|"launch_modal","banner_state": "draft"|"scheduled"|"live"|"ended","book_status": "draft"|"live"|"scheduled"|"unpublished"|"taken_down"|"rejected","campaign_status": "draft"|"in_review"|"scheduled"|"sending"|"sent"|"paused"|"cancelled","chapter_kind": "chapter"|"part","draft_step": "upload"|"converting"|"checking"|"chapters"|"preview","entitlement_scope": "book"|"chapter","entitlement_source": "unlock_all"|"chapter"|"chapter_complete"|"gift"|"staff","export_kind": "readers"|"subscriptions"|"transactions"|"author_earnings"|"books"|"reports","export_status": "counting"|"building"|"ready"|"failed"|"expired","fast_lane_result": "pending"|"ok"|"problem","flag_source": "worker"|"desk"|"staff","flag_status": "open"|"fixed"|"dismissed","group_kind": "official"|"club"|"author"|"readalong"|"room"|"dm","group_role": "owner"|"moderator"|"member","group_visibility": "public"|"followers"|"private","group_who_can_post": "members"|"staff"|"owner_and_followers","ledger_bucket": "plan"|"rollover"|"topup"|"promo","ledger_reason": "plan_grant"|"rollover"|"top_up"|"unlock_all"|"chapter"|"undo"|"tip"|"message"|"expiry"|"refund"|"staff_adjust"|"gift_out"|"gift_in"|"promo","message_kind": "text"|"quote"|"system","message_state": "visible"|"auto_hidden"|"removed"|"deleted","payee_type": "individual"|"company","permission_level": "allow"|"limited","push_category": "messages"|"authors"|"reminders"|"marketing"|"account","push_quiet_action": "hold"|"deliver"|"drop"|"none","push_status": "queued"|"sent"|"delivered"|"opened"|"skipped_cap"|"skipped_quiet"|"skipped_pref"|"failed","report_content_type": "message"|"discussion_comment"|"review"|"post_comment"|"author_post"|"profile"|"book"|"dm"|"book_content","report_outcome": "keep"|"removed"|"spoiler"|"actioned"|"dismissed","report_reason": "spam"|"harassment"|"hate"|"sexual"|"violence"|"self_harm"|"copyright"|"spoilers"|"impersonation"|"other","report_severity": "high"|"medium"|"low","report_status": "open"|"auto_hidden"|"resolved","revision_origin": "author"|"staff"|"desk","revision_status": "draft"|"processing"|"with_desk"|"needs_fixes"|"ready_for_review"|"sent_back"|"scheduled"|"live"|"superseded"|"unpublished"|"taken_down"|"rejected","send_back_source": "fixer"|"quick_review"|"desk_auto"|"system","signup_intent": "reader"|"author","source_type": "docx"|"epub"|"pdf","staff_role": "super_admin"|"operations_admin"|"publisher"|"moderator"|"finance"|"support"|"analyst","unpublish_reason": "author_request"|"policy_violation"|"quality"
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
            "anchor_method": ["exact", "fuzzy", "nearest"],"app_theme": ["sunflower", "palm", "plum", "night"],"application_event_kind": ["submitted", "assigned", "info_asked", "info_given", "approved", "rejected"],"application_status": ["draft", "new", "needs_info", "approved", "rejected", "withdrawn"],"author_status": ["active", "suspended"],"author_visibility": ["public", "private"],"banner_placement": ["home_top", "credits", "launch_modal"],"banner_state": ["draft", "scheduled", "live", "ended"],"book_status": ["draft", "live", "scheduled", "unpublished", "taken_down", "rejected"],"campaign_status": ["draft", "in_review", "scheduled", "sending", "sent", "paused", "cancelled"],"chapter_kind": ["chapter", "part"],"draft_step": ["upload", "converting", "checking", "chapters", "preview"],"entitlement_scope": ["book", "chapter"],"entitlement_source": ["unlock_all", "chapter", "chapter_complete", "gift", "staff"],"export_kind": ["readers", "subscriptions", "transactions", "author_earnings", "books", "reports"],"export_status": ["counting", "building", "ready", "failed", "expired"],"fast_lane_result": ["pending", "ok", "problem"],"flag_source": ["worker", "desk", "staff"],"flag_status": ["open", "fixed", "dismissed"],"group_kind": ["official", "club", "author", "readalong", "room", "dm"],"group_role": ["owner", "moderator", "member"],"group_visibility": ["public", "followers", "private"],"group_who_can_post": ["members", "staff", "owner_and_followers"],"ledger_bucket": ["plan", "rollover", "topup", "promo"],"ledger_reason": ["plan_grant", "rollover", "top_up", "unlock_all", "chapter", "undo", "tip", "message", "expiry", "refund", "staff_adjust", "gift_out", "gift_in", "promo"],"message_kind": ["text", "quote", "system"],"message_state": ["visible", "auto_hidden", "removed", "deleted"],"payee_type": ["individual", "company"],"permission_level": ["allow", "limited"],"push_category": ["messages", "authors", "reminders", "marketing", "account"],"push_quiet_action": ["hold", "deliver", "drop", "none"],"push_status": ["queued", "sent", "delivered", "opened", "skipped_cap", "skipped_quiet", "skipped_pref", "failed"],"report_content_type": ["message", "discussion_comment", "review", "post_comment", "author_post", "profile", "book", "dm", "book_content"],"report_outcome": ["keep", "removed", "spoiler", "actioned", "dismissed"],"report_reason": ["spam", "harassment", "hate", "sexual", "violence", "self_harm", "copyright", "spoilers", "impersonation", "other"],"report_severity": ["high", "medium", "low"],"report_status": ["open", "auto_hidden", "resolved"],"revision_origin": ["author", "staff", "desk"],"revision_status": ["draft", "processing", "with_desk", "needs_fixes", "ready_for_review", "sent_back", "scheduled", "live", "superseded", "unpublished", "taken_down", "rejected"],"send_back_source": ["fixer", "quick_review", "desk_auto", "system"],"signup_intent": ["reader", "author"],"source_type": ["docx", "epub", "pdf"],"staff_role": ["super_admin", "operations_admin", "publisher", "moderator", "finance", "support", "analyst"],"unpublish_reason": ["author_request", "policy_violation", "quality"]
          }
        }
} as const
