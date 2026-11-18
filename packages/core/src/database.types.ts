
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
            "audit_log": {
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
                },"book_revisions": {
                  Row: {
                    "book_id": string,"created_at": string,"id": string,"pages": number | null,"preview_percent": number | null,"price_credits": number | null,"published_at": string | null,"revision_no": number,"status": Database["public"]['Enums']["revision_status"],"submitted_at": string | null,"updated_at": string,"words": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"id"?: string,"pages"?: number | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"revision_no": number,"status"?: Database["public"]['Enums']["revision_status"],"submitted_at"?: string | null,"updated_at"?: string,"words"?: number | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"id"?: string,"pages"?: number | null,"preview_percent"?: number | null,"price_credits"?: number | null,"published_at"?: string | null,"revision_no"?: number,"status"?: Database["public"]['Enums']["revision_status"],"submitted_at"?: string | null,"updated_at"?: string,"words"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_revisions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"books": {
                  Row: {
                    "author_id": string,"created_at": string,"current_revision_id": string | null,"description": string | null,"genres": (string)[],"id": string,"new_arrival_until": string | null,"status": Database["public"]['Enums']["book_status"],"subtitle": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"current_revision_id"?: string | null,"description"?: string | null,"genres"?: (string)[],"id"?: string,"new_arrival_until"?: string | null,"status"?: Database["public"]['Enums']["book_status"],"subtitle"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "books_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "books_current_revision_fk"
      columns: ["current_revision_id"]
isOneToOne: false
      referencedRelation: "book_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"chapters": {
                  Row: {
                    "chapter_uid": string,"free_file": string | null,"full_file": string | null,"id": string,"kind": Database["public"]['Enums']["chapter_kind"],"ord": number,"pages": number,"parent_ord": number | null,"price_credits": number,"revision_id": string,"title": string,"words": number,"words_before": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chapter_uid"?: string,"free_file"?: string | null,"full_file"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["chapter_kind"],"ord": number,"pages"?: number,"parent_ord"?: number | null,"price_credits"?: number,"revision_id": string,"title": string,"words"?: number,"words_before"?: number
                  }
                  Update: {
                    "chapter_uid"?: string,"free_file"?: string | null,"full_file"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["chapter_kind"],"ord"?: number,"pages"?: number,"parent_ord"?: number | null,"price_credits"?: number,"revision_id"?: string,"title"?: string,"words"?: number,"words_before"?: number
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
      foreignKeyName: "credit_ledger_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
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
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"full_name": string,"id": string,"interests": (string)[],"is_author": boolean,"is_reader": boolean,"theme": Database["public"]['Enums']["app_theme"],"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"full_name"?: string,"id": string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"full_name"?: string,"id"?: string,"interests"?: (string)[],"is_author"?: boolean,"is_reader"?: boolean,"theme"?: Database["public"]['Enums']["app_theme"],"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"staff_roles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_roles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "credit_balance":
{ Args: { "p_user": string }; Returns: number
                           },
"is_staff":
{ Args: { "p_role"?: Database["public"]['Enums']["staff_role"] }; Returns: boolean
                           },
"is_staff_any":
{ Args: { "p_roles": (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"write_audit":
{ Args: { "p_action": string,"p_after"?: Json,"p_area": string,"p_before"?: Json,"p_object_id"?: string,"p_object_label"?: string,"p_object_type"?: string,"p_reason"?: string,"p_summary"?: string }; Returns: number
                           }
          }
          Enums: {
            "app_theme": "sunflower"|"palm"|"plum"|"night","book_status": "draft"|"live"|"scheduled"|"unpublished"|"taken_down"|"rejected","chapter_kind": "chapter"|"part","entitlement_scope": "book"|"chapter","entitlement_source": "unlock_all"|"chapter"|"chapter_complete"|"gift"|"staff","ledger_bucket": "plan"|"rollover"|"topup"|"promo","ledger_reason": "plan_grant"|"rollover"|"top_up"|"unlock_all"|"chapter"|"undo"|"tip"|"message"|"expiry"|"refund"|"staff_adjust"|"gift_out"|"gift_in"|"promo","revision_status": "draft"|"processing"|"with_desk"|"needs_fixes"|"ready_for_review"|"sent_back"|"scheduled"|"live"|"superseded"|"unpublished"|"taken_down"|"rejected","staff_role": "super_admin"|"operations_admin"|"publisher"|"moderator"|"finance"|"support"|"analyst"
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
            "app_theme": ["sunflower", "palm", "plum", "night"],"book_status": ["draft", "live", "scheduled", "unpublished", "taken_down", "rejected"],"chapter_kind": ["chapter", "part"],"entitlement_scope": ["book", "chapter"],"entitlement_source": ["unlock_all", "chapter", "chapter_complete", "gift", "staff"],"ledger_bucket": ["plan", "rollover", "topup", "promo"],"ledger_reason": ["plan_grant", "rollover", "top_up", "unlock_all", "chapter", "undo", "tip", "message", "expiry", "refund", "staff_adjust", "gift_out", "gift_in", "promo"],"revision_status": ["draft", "processing", "with_desk", "needs_fixes", "ready_for_review", "sent_back", "scheduled", "live", "superseded", "unpublished", "taken_down", "rejected"],"staff_role": ["super_admin", "operations_admin", "publisher", "moderator", "finance", "support", "analyst"]
          }
        }
} as const
