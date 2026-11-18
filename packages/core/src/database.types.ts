export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      anchor_migrations: {
        Row: {
          base_revision_id: string;
          method: Database['public']['Enums']['anchor_method'];
          nearest_para_id: string | null;
          new_para_id: string | null;
          new_revision_id: string;
          old_para_id: string;
        };
        ComputedFields: never;
        Insert: {
          base_revision_id: string;
          method: Database['public']['Enums']['anchor_method'];
          nearest_para_id?: string | null;
          new_para_id?: string | null;
          new_revision_id: string;
          old_para_id: string;
        };
        Update: {
          base_revision_id?: string;
          method?: Database['public']['Enums']['anchor_method'];
          nearest_para_id?: string | null;
          new_para_id?: string | null;
          new_revision_id?: string;
          old_para_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'anchor_migrations_base_revision_id_fkey';
            columns: ['base_revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'anchor_migrations_new_revision_id_fkey';
            columns: ['new_revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          actor_role: Database['public']['Enums']['staff_role'] | null;
          after: Json | null;
          area: string;
          at: string;
          before: Json | null;
          device: string | null;
          id: number;
          ip: unknown;
          mfa_verified_at: string | null;
          object_id: string | null;
          object_label: string | null;
          object_type: string | null;
          reason: string | null;
          request_id: string | null;
          retain_until: string;
          summary: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: Database['public']['Enums']['staff_role'] | null;
          after?: Json | null;
          area: string;
          at?: string;
          before?: Json | null;
          device?: string | null;
          id?: never;
          ip?: unknown;
          mfa_verified_at?: string | null;
          object_id?: string | null;
          object_label?: string | null;
          object_type?: string | null;
          reason?: string | null;
          request_id?: string | null;
          retain_until?: string;
          summary?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: Database['public']['Enums']['staff_role'] | null;
          after?: Json | null;
          area?: string;
          at?: string;
          before?: Json | null;
          device?: string | null;
          id?: never;
          ip?: unknown;
          mfa_verified_at?: string | null;
          object_id?: string | null;
          object_label?: string | null;
          object_type?: string | null;
          reason?: string | null;
          request_id?: string | null;
          retain_until?: string;
          summary?: string | null;
        };
        Relationships: [];
      };
      book_fixes: {
        Row: {
          created_at: string;
          flag_id: string | null;
          id: string;
          inverse: NonNullable<Json>;
          op: NonNullable<Json>;
          revision_id: string;
          staff_id: string | null;
          undone_at: string | null;
          work_version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          flag_id?: string | null;
          id?: string;
          inverse: NonNullable<Json>;
          op: NonNullable<Json>;
          revision_id: string;
          staff_id?: string | null;
          undone_at?: string | null;
          work_version: number;
        };
        Update: {
          created_at?: string;
          flag_id?: string | null;
          id?: string;
          inverse?: NonNullable<Json>;
          op?: NonNullable<Json>;
          revision_id?: string;
          staff_id?: string | null;
          undone_at?: string | null;
          work_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'book_fixes_flag_id_fkey';
            columns: ['flag_id'];
            isOneToOne: false;
            referencedRelation: 'book_flags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_fixes_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_fixes_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      book_flags: {
        Row: {
          auto_fixable: boolean;
          blocking: boolean;
          check_key: string;
          created_at: string;
          dismiss_reason: string | null;
          fix_op: Json | null;
          fixed_by: string | null;
          id: string;
          location: NonNullable<Json>;
          message: string;
          revision_id: string;
          severity: string;
          source: Database['public']['Enums']['flag_source'];
          status: Database['public']['Enums']['flag_status'];
          suggestion: string | null;
          updated_at: string;
          weight: number;
        };
        ComputedFields: never;
        Insert: {
          auto_fixable?: boolean;
          blocking?: boolean;
          check_key: string;
          created_at?: string;
          dismiss_reason?: string | null;
          fix_op?: Json | null;
          fixed_by?: string | null;
          id?: string;
          location?: NonNullable<Json>;
          message: string;
          revision_id: string;
          severity?: string;
          source?: Database['public']['Enums']['flag_source'];
          status?: Database['public']['Enums']['flag_status'];
          suggestion?: string | null;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          auto_fixable?: boolean;
          blocking?: boolean;
          check_key?: string;
          created_at?: string;
          dismiss_reason?: string | null;
          fix_op?: Json | null;
          fixed_by?: string | null;
          id?: string;
          location?: NonNullable<Json>;
          message?: string;
          revision_id?: string;
          severity?: string;
          source?: Database['public']['Enums']['flag_source'];
          status?: Database['public']['Enums']['flag_status'];
          suggestion?: string | null;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'book_flags_fixed_by_fkey';
            columns: ['fixed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_flags_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      book_revisions: {
        Row: {
          anchors_moved: Json | null;
          artifact_prefix: string | null;
          assigned_to: string | null;
          base_revision_id: string | null;
          book_id: string;
          chapters_confirmed_at: string | null;
          converted_key: string | null;
          converted_sha256: string | null;
          cover_key: string | null;
          cover_sha256: string | null;
          created_at: string;
          created_via: Database['public']['Enums']['revision_origin'];
          desk_claimed_by: string | null;
          desk_lease_until: string | null;
          desk_reason: string | null;
          draft_step: Database['public']['Enums']['draft_step'] | null;
          due_at: string | null;
          fast_lane: boolean;
          file_bytes: number | null;
          free_through_ord: number;
          generation: number;
          id: string;
          last_activity_at: string | null;
          late_alerted_at: string | null;
          manifest_key: string | null;
          meta: NonNullable<Json>;
          notify_followers: boolean;
          pages: number | null;
          preview_cut_chapter_uid: string | null;
          preview_cut_para_id: string | null;
          preview_percent: number | null;
          price_credits: number | null;
          published_at: string | null;
          published_by: string | null;
          readiness: number;
          review_opened_at: string | null;
          revision_no: number;
          routed_at: string | null;
          schedule_at: string | null;
          sealed_generation: number | null;
          sealed_work_version: number | null;
          sent_back_note: string | null;
          source_key: string | null;
          source_sha256: string | null;
          source_type: Database['public']['Enums']['source_type'] | null;
          status: Database['public']['Enums']['revision_status'];
          status_reason: string | null;
          steps: NonNullable<Json>;
          submitted_at: string | null;
          updated_at: string;
          uploaded_by: string | null;
          words: number | null;
          work_version: number;
        };
        ComputedFields: never;
        Insert: {
          anchors_moved?: Json | null;
          artifact_prefix?: string | null;
          assigned_to?: string | null;
          base_revision_id?: string | null;
          book_id: string;
          chapters_confirmed_at?: string | null;
          converted_key?: string | null;
          converted_sha256?: string | null;
          cover_key?: string | null;
          cover_sha256?: string | null;
          created_at?: string;
          created_via?: Database['public']['Enums']['revision_origin'];
          desk_claimed_by?: string | null;
          desk_lease_until?: string | null;
          desk_reason?: string | null;
          draft_step?: Database['public']['Enums']['draft_step'] | null;
          due_at?: string | null;
          fast_lane?: boolean;
          file_bytes?: number | null;
          free_through_ord?: number;
          generation?: number;
          id?: string;
          last_activity_at?: string | null;
          late_alerted_at?: string | null;
          manifest_key?: string | null;
          meta?: NonNullable<Json>;
          notify_followers?: boolean;
          pages?: number | null;
          preview_cut_chapter_uid?: string | null;
          preview_cut_para_id?: string | null;
          preview_percent?: number | null;
          price_credits?: number | null;
          published_at?: string | null;
          published_by?: string | null;
          readiness?: number;
          review_opened_at?: string | null;
          revision_no: number;
          routed_at?: string | null;
          schedule_at?: string | null;
          sealed_generation?: number | null;
          sealed_work_version?: number | null;
          sent_back_note?: string | null;
          source_key?: string | null;
          source_sha256?: string | null;
          source_type?: Database['public']['Enums']['source_type'] | null;
          status?: Database['public']['Enums']['revision_status'];
          status_reason?: string | null;
          steps?: NonNullable<Json>;
          submitted_at?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
          words?: number | null;
          work_version?: number;
        };
        Update: {
          anchors_moved?: Json | null;
          artifact_prefix?: string | null;
          assigned_to?: string | null;
          base_revision_id?: string | null;
          book_id?: string;
          chapters_confirmed_at?: string | null;
          converted_key?: string | null;
          converted_sha256?: string | null;
          cover_key?: string | null;
          cover_sha256?: string | null;
          created_at?: string;
          created_via?: Database['public']['Enums']['revision_origin'];
          desk_claimed_by?: string | null;
          desk_lease_until?: string | null;
          desk_reason?: string | null;
          draft_step?: Database['public']['Enums']['draft_step'] | null;
          due_at?: string | null;
          fast_lane?: boolean;
          file_bytes?: number | null;
          free_through_ord?: number;
          generation?: number;
          id?: string;
          last_activity_at?: string | null;
          late_alerted_at?: string | null;
          manifest_key?: string | null;
          meta?: NonNullable<Json>;
          notify_followers?: boolean;
          pages?: number | null;
          preview_cut_chapter_uid?: string | null;
          preview_cut_para_id?: string | null;
          preview_percent?: number | null;
          price_credits?: number | null;
          published_at?: string | null;
          published_by?: string | null;
          readiness?: number;
          review_opened_at?: string | null;
          revision_no?: number;
          routed_at?: string | null;
          schedule_at?: string | null;
          sealed_generation?: number | null;
          sealed_work_version?: number | null;
          sent_back_note?: string | null;
          source_key?: string | null;
          source_sha256?: string | null;
          source_type?: Database['public']['Enums']['source_type'] | null;
          status?: Database['public']['Enums']['revision_status'];
          status_reason?: string | null;
          steps?: NonNullable<Json>;
          submitted_at?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
          words?: number | null;
          work_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'book_revisions_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_revisions_base_revision_id_fkey';
            columns: ['base_revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_revisions_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_revisions_desk_claimed_by_fkey';
            columns: ['desk_claimed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_revisions_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'book_revisions_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      books: {
        Row: {
          access_removed_at: string | null;
          author_id: string;
          created_at: string;
          current_revision_id: string | null;
          description: string | null;
          genres: string[];
          id: string;
          new_arrival_until: string | null;
          status: Database['public']['Enums']['book_status'];
          subtitle: string | null;
          title: string;
          unpublish_reason: Database['public']['Enums']['unpublish_reason'] | null;
          unpublished_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          access_removed_at?: string | null;
          author_id: string;
          created_at?: string;
          current_revision_id?: string | null;
          description?: string | null;
          genres?: string[];
          id?: string;
          new_arrival_until?: string | null;
          status?: Database['public']['Enums']['book_status'];
          subtitle?: string | null;
          title: string;
          unpublish_reason?: Database['public']['Enums']['unpublish_reason'] | null;
          unpublished_at?: string | null;
          updated_at?: string;
        };
        Update: {
          access_removed_at?: string | null;
          author_id?: string;
          created_at?: string;
          current_revision_id?: string | null;
          description?: string | null;
          genres?: string[];
          id?: string;
          new_arrival_until?: string | null;
          status?: Database['public']['Enums']['book_status'];
          subtitle?: string | null;
          title?: string;
          unpublish_reason?: Database['public']['Enums']['unpublish_reason'] | null;
          unpublished_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'books_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'books_current_revision_fk';
            columns: ['current_revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      chapter_keys: {
        Row: {
          chapter_uid: string | null;
          created_at: string;
          generation: number;
          id: number;
          key_version: number;
          revision_id: string;
          revoked_at: string | null;
          wrapped_key: string;
        };
        ComputedFields: never;
        Insert: {
          chapter_uid?: string | null;
          created_at?: string;
          generation: number;
          id?: never;
          key_version?: number;
          revision_id: string;
          revoked_at?: string | null;
          wrapped_key: string;
        };
        Update: {
          chapter_uid?: string | null;
          created_at?: string;
          generation?: number;
          id?: never;
          key_version?: number;
          revision_id?: string;
          revoked_at?: string | null;
          wrapped_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chapter_keys_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      chapters: {
        Row: {
          chapter_uid: string;
          free_file: string | null;
          front: string | null;
          full_file: string | null;
          id: string;
          kind: Database['public']['Enums']['chapter_kind'];
          ord: number;
          pages: number;
          parent_ord: number | null;
          price_credits: number;
          revision_id: string;
          title: string;
          words: number;
          words_before: number;
        };
        ComputedFields: never;
        Insert: {
          chapter_uid?: string;
          free_file?: string | null;
          front?: string | null;
          full_file?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['chapter_kind'];
          ord: number;
          pages?: number;
          parent_ord?: number | null;
          price_credits?: number;
          revision_id: string;
          title: string;
          words?: number;
          words_before?: number;
        };
        Update: {
          chapter_uid?: string;
          free_file?: string | null;
          front?: string | null;
          full_file?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['chapter_kind'];
          ord?: number;
          pages?: number;
          parent_ord?: number | null;
          price_credits?: number;
          revision_id?: string;
          title?: string;
          words?: number;
          words_before?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'chapters_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_ledger: {
        Row: {
          actor_id: string | null;
          author_earning_kobo: number;
          author_id: string | null;
          book_id: string | null;
          bucket: Database['public']['Enums']['ledger_bucket'];
          chapter_id: string | null;
          created_at: string;
          delta: number;
          expires_at: string | null;
          id: number;
          idempotency_key: string | null;
          note: string | null;
          reason: Database['public']['Enums']['ledger_reason'];
          ref_id: string | null;
          ref_type: string | null;
          txn_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          author_earning_kobo?: number;
          author_id?: string | null;
          book_id?: string | null;
          bucket: Database['public']['Enums']['ledger_bucket'];
          chapter_id?: string | null;
          created_at?: string;
          delta: number;
          expires_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          note?: string | null;
          reason: Database['public']['Enums']['ledger_reason'];
          ref_id?: string | null;
          ref_type?: string | null;
          txn_id?: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          author_earning_kobo?: number;
          author_id?: string | null;
          book_id?: string | null;
          bucket?: Database['public']['Enums']['ledger_bucket'];
          chapter_id?: string | null;
          created_at?: string;
          delta?: number;
          expires_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          note?: string | null;
          reason?: Database['public']['Enums']['ledger_reason'];
          ref_id?: string | null;
          ref_type?: string | null;
          txn_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_chapter_id_fkey';
            columns: ['chapter_id'];
            isOneToOne: false;
            referencedRelation: 'chapters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      entitlements: {
        Row: {
          book_id: string;
          chapter_uid: string | null;
          created_at: string;
          id: string;
          ledger_id: number | null;
          revoked_at: string | null;
          revoked_reason: string | null;
          scope: Database['public']['Enums']['entitlement_scope'];
          source: Database['public']['Enums']['entitlement_source'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          book_id: string;
          chapter_uid?: string | null;
          created_at?: string;
          id?: string;
          ledger_id?: number | null;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          scope: Database['public']['Enums']['entitlement_scope'];
          source: Database['public']['Enums']['entitlement_source'];
          user_id: string;
        };
        Update: {
          book_id?: string;
          chapter_uid?: string | null;
          created_at?: string;
          id?: string;
          ledger_id?: number | null;
          revoked_at?: string | null;
          revoked_reason?: string | null;
          scope?: Database['public']['Enums']['entitlement_scope'];
          source?: Database['public']['Enums']['entitlement_source'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entitlements_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entitlements_ledger_id_fkey';
            columns: ['ledger_id'];
            isOneToOne: false;
            referencedRelation: 'credit_ledger';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entitlements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      fast_lane_audits: {
        Row: {
          audited_at: string | null;
          audited_by: string | null;
          note: string | null;
          picked_at: string;
          revision_id: string;
          status: Database['public']['Enums']['fast_lane_result'];
        };
        ComputedFields: never;
        Insert: {
          audited_at?: string | null;
          audited_by?: string | null;
          note?: string | null;
          picked_at?: string;
          revision_id: string;
          status?: Database['public']['Enums']['fast_lane_result'];
        };
        Update: {
          audited_at?: string | null;
          audited_by?: string | null;
          note?: string | null;
          picked_at?: string;
          revision_id?: string;
          status?: Database['public']['Enums']['fast_lane_result'];
        };
        Relationships: [
          {
            foreignKeyName: 'fast_lane_audits_audited_by_fkey';
            columns: ['audited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fast_lane_audits_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: true;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      paragraph_anchors: {
        Row: {
          chapter_uid: string;
          fingerprint: string;
          ord: number;
          para_id: string;
          revision_id: string;
          words: number;
          words_before: number;
        };
        ComputedFields: never;
        Insert: {
          chapter_uid: string;
          fingerprint: string;
          ord: number;
          para_id: string;
          revision_id: string;
          words?: number;
          words_before?: number;
        };
        Update: {
          chapter_uid?: string;
          fingerprint?: string;
          ord?: number;
          para_id?: string;
          revision_id?: string;
          words?: number;
          words_before?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'paragraph_anchors_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      pipeline_config: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_config_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          full_name: string;
          id: string;
          interests: string[];
          is_author: boolean;
          is_reader: boolean;
          theme: Database['public']['Enums']['app_theme'];
          updated_at: string;
          username: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          interests?: string[];
          is_author?: boolean;
          is_reader?: boolean;
          theme?: Database['public']['Enums']['app_theme'];
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          interests?: string[];
          is_author?: boolean;
          is_reader?: boolean;
          theme?: Database['public']['Enums']['app_theme'];
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      revision_diffs: {
        Row: {
          added_chapter_uids: string[];
          author_in_good_standing: boolean;
          base_revision_id: string;
          changed_chapter_uids: string[];
          changed_pct: number;
          chapters_added: number;
          chapters_removed: number;
          cover_changed: boolean;
          created_at: string;
          deleted_words: number;
          diff_key: string | null;
          fast_lane_eligible: boolean;
          inserted_words: number;
          metadata_changed: boolean;
          reasons: string[];
          revision_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_chapter_uids?: string[];
          author_in_good_standing?: boolean;
          base_revision_id: string;
          changed_chapter_uids?: string[];
          changed_pct?: number;
          chapters_added?: number;
          chapters_removed?: number;
          cover_changed?: boolean;
          created_at?: string;
          deleted_words?: number;
          diff_key?: string | null;
          fast_lane_eligible?: boolean;
          inserted_words?: number;
          metadata_changed?: boolean;
          reasons?: string[];
          revision_id: string;
        };
        Update: {
          added_chapter_uids?: string[];
          author_in_good_standing?: boolean;
          base_revision_id?: string;
          changed_chapter_uids?: string[];
          changed_pct?: number;
          chapters_added?: number;
          chapters_removed?: number;
          cover_changed?: boolean;
          created_at?: string;
          deleted_words?: number;
          diff_key?: string | null;
          fast_lane_eligible?: boolean;
          inserted_words?: number;
          metadata_changed?: boolean;
          reasons?: string[];
          revision_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'revision_diffs_base_revision_id_fkey';
            columns: ['base_revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'revision_diffs_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: true;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      send_backs: {
        Row: {
          id: string;
          issues: NonNullable<Json>;
          note: string | null;
          reminded_at: string | null;
          revision_id: string;
          sent_at: string;
          sent_by: string | null;
          source: Database['public']['Enums']['send_back_source'];
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          issues?: NonNullable<Json>;
          note?: string | null;
          reminded_at?: string | null;
          revision_id: string;
          sent_at?: string;
          sent_by?: string | null;
          source: Database['public']['Enums']['send_back_source'];
        };
        Update: {
          id?: string;
          issues?: NonNullable<Json>;
          note?: string | null;
          reminded_at?: string | null;
          revision_id?: string;
          sent_at?: string;
          sent_by?: string | null;
          source?: Database['public']['Enums']['send_back_source'];
        };
        Relationships: [
          {
            foreignKeyName: 'send_backs_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'book_revisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'send_backs_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_roles: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          role: Database['public']['Enums']['staff_role'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          role: Database['public']['Enums']['staff_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          role?: Database['public']['Enums']['staff_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_roles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _actor: {
        Args: {
          p_actor: string;
          p_allow_system?: boolean;
          p_fn: string;
          p_roles: Database['public']['Enums']['staff_role'][];
        };
        Returns: string;
      };
      _apply_counts: { Args: { p_result: Json; p_rev: string }; Returns: undefined };
      _audit: {
        Args: {
          p_action: string;
          p_actor: string;
          p_after?: Json;
          p_area: string;
          p_before?: Json;
          p_object_id: string;
          p_object_label?: string;
          p_object_type: string;
          p_reason?: string;
          p_summary?: string;
        };
        Returns: undefined;
      };
      _chapter_prices_ok: { Args: { p_rev: string }; Returns: boolean };
      _fast_lane_check: { Args: { p_rev: string }; Returns: string[] };
      _has_staff_role: {
        Args: { p_roles: Database['public']['Enums']['staff_role'][]; p_user: string };
        Returns: boolean;
      };
      _insert_flags: {
        Args: { p_flags: Json; p_rev: string; p_source: Database['public']['Enums']['flag_source'] };
        Returns: number;
      };
      _is_revision_author: { Args: { p_rev: string }; Returns: boolean };
      _is_service: { Args: Record<PropertyKey, never>; Returns: boolean };
      _lock_revision: {
        Args: { p_rev: string };
        Returns: {
          anchors_moved: Json | null;
          artifact_prefix: string | null;
          assigned_to: string | null;
          base_revision_id: string | null;
          book_id: string;
          chapters_confirmed_at: string | null;
          converted_key: string | null;
          converted_sha256: string | null;
          cover_key: string | null;
          cover_sha256: string | null;
          created_at: string;
          created_via: Database['public']['Enums']['revision_origin'];
          desk_claimed_by: string | null;
          desk_lease_until: string | null;
          desk_reason: string | null;
          draft_step: Database['public']['Enums']['draft_step'] | null;
          due_at: string | null;
          fast_lane: boolean;
          file_bytes: number | null;
          free_through_ord: number;
          generation: number;
          id: string;
          last_activity_at: string | null;
          late_alerted_at: string | null;
          manifest_key: string | null;
          meta: NonNullable<Json>;
          notify_followers: boolean;
          pages: number | null;
          preview_cut_chapter_uid: string | null;
          preview_cut_para_id: string | null;
          preview_percent: number | null;
          price_credits: number | null;
          published_at: string | null;
          published_by: string | null;
          readiness: number;
          review_opened_at: string | null;
          revision_no: number;
          routed_at: string | null;
          schedule_at: string | null;
          sealed_generation: number | null;
          sealed_work_version: number | null;
          sent_back_note: string | null;
          source_key: string | null;
          source_sha256: string | null;
          source_type: Database['public']['Enums']['source_type'] | null;
          status: Database['public']['Enums']['revision_status'];
          status_reason: string | null;
          steps: NonNullable<Json>;
          submitted_at: string | null;
          updated_at: string;
          uploaded_by: string | null;
          words: number | null;
          work_version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'book_revisions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      _notify: { Args: { p_kind: string; p_payload: Json }; Returns: undefined };
      _pipeline_defaults: { Args: Record<PropertyKey, never>; Returns: Json };
      _pipeline_setting: { Args: { p_section: string }; Returns: Json };
      _publish_now: {
        Args: { p_actor: string; p_mode: string; p_notify: boolean; p_rev: string };
        Returns: Json;
      };
      _replace_chapters: { Args: { p_chapters: Json; p_rev: string }; Returns: undefined };
      _require_service: { Args: { p_fn: string }; Returns: undefined };
      _rescore: { Args: { p_rev: string }; Returns: number };
      _route: { Args: { p_rev: string }; Returns: Database['public']['Enums']['revision_status'] };
      _send_back: {
        Args: {
          p_actor: string;
          p_issues: Json;
          p_note: string;
          p_rev: string;
          p_source: Database['public']['Enums']['send_back_source'];
        };
        Returns: string;
      };
      _set_chapter_prices: { Args: { p_prices: Json; p_rev: string }; Returns: undefined };
      _step: { Args: { p_rev: string; p_step: string }; Returns: undefined };
      _threshold: { Args: { p_key: string }; Returns: number };
      audit_fast_lane: {
        Args: {
          p_actor?: string;
          p_note: string;
          p_result: Database['public']['Enums']['fast_lane_result'];
          p_rev: string;
        };
        Returns: undefined;
      };
      author_in_good_standing: { Args: { p_author: string }; Returns: boolean };
      begin_reseal: { Args: { p_actor: string; p_rev: string }; Returns: Json };
      book_queue_ack: { Args: { p_archive?: boolean; p_msg_id: number; p_queue: string }; Returns: boolean };
      book_queue_read: {
        Args: { p_qty?: number; p_queue: string; p_vt?: number };
        Returns: unknown[];
        SetofOptions: {
          from: '*';
          to: 'message_record';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_revision: {
        Args: { p_actor?: string; p_rev: string; p_screen: string; p_take_over?: boolean };
        Returns: Json;
      };
      complete_rescore: {
        Args: {
          p_chapter_uids: string[];
          p_check_keys?: string[];
          p_flags: Json;
          p_result?: Json;
          p_rev: string;
          p_work_version: number;
        };
        Returns: Json;
      };
      complete_seal: { Args: { p_generation: number; p_rev: string; p_seal: Json }; Returns: Json };
      complete_verify: { Args: { p_generation: number; p_result: Json; p_rev: string }; Returns: Json };
      confirm_chapters: { Args: { p_actor: string; p_result: Json; p_rev: string }; Returns: Json };
      create_revision: { Args: { p_book?: string; p_meta: Json }; Returns: Json };
      credit_balance: { Args: { p_user: string }; Returns: number };
      desk_claim: { Args: { p_actor?: string; p_rev?: string }; Returns: Json };
      desk_heartbeat: { Args: { p_actor?: string; p_rev: string }; Returns: string };
      desk_lease_reaper: { Args: Record<PropertyKey, never>; Returns: number };
      desk_reject_unreadable: {
        Args: { p_actor?: string; p_reason?: string; p_rev: string };
        Returns: string;
      };
      finalize_revision: { Args: { p_actor: string; p_files: Json; p_rev: string }; Returns: Json };
      get_revision_status: { Args: { p_rev: string }; Returns: Json };
      has_blocking_flag: { Args: { p_rev: string }; Returns: boolean };
      is_staff: { Args: { p_role?: Database['public']['Enums']['staff_role'] }; Returns: boolean };
      is_staff_any: { Args: { p_roles: Database['public']['Enums']['staff_role'][] }; Returns: boolean };
      migrate_anchors: { Args: { p_base: string; p_new: string }; Returns: Json };
      pipeline_sla: { Args: Record<PropertyKey, never>; Returns: number };
      publish_due: { Args: Record<PropertyKey, never>; Returns: number };
      publish_revision: {
        Args: { p_actor?: string; p_notify_followers?: boolean; p_rev: string; p_schedule_at?: string };
        Returns: Json;
      };
      record_fix: {
        Args: {
          p_actor: string;
          p_expected_version: number;
          p_flag: string;
          p_inverse: Json;
          p_op: Json;
          p_rev: string;
        };
        Returns: Json;
      };
      reject_revision: { Args: { p_actor?: string; p_reason: string; p_rev: string }; Returns: undefined };
      release_to_review: { Args: { p_actor?: string; p_rev: string }; Returns: Json };
      remind_author: { Args: { p_actor?: string; p_rev: string }; Returns: undefined };
      republish_book: { Args: { p_actor?: string; p_book: string }; Returns: Json };
      revert_to_revision: { Args: { p_actor?: string; p_reason: string; p_rev: string }; Returns: Json };
      revision_links: { Args: { p_rev: string }; Returns: Json };
      revision_score: { Args: { p_rev: string }; Returns: number };
      seal_failed: { Args: { p_generation: number; p_rev: string }; Returns: boolean };
      select_fast_lane_audits: { Args: Record<PropertyKey, never>; Returns: number };
      send_back_revision: {
        Args: {
          p_actor?: string;
          p_issues: Json;
          p_note: string;
          p_rev: string;
          p_source?: Database['public']['Enums']['send_back_source'];
        };
        Returns: string;
      };
      sent_back_reminder: { Args: Record<PropertyKey, never>; Returns: number };
      set_chapter_prices: { Args: { p_prices: Json; p_rev: string }; Returns: undefined };
      submit_revision: { Args: { p_rev: string }; Returns: Json };
      undo_fix: { Args: { p_actor: string; p_expected_version: number; p_fix: string }; Returns: Json };
      undo_release_to_review: { Args: { p_actor?: string; p_rev: string }; Returns: Json };
      unpublish_book: {
        Args: {
          p_actor?: string;
          p_book: string;
          p_confirm_title: string;
          p_notify_readers: boolean;
          p_reason: Database['public']['Enums']['unpublish_reason'];
          p_remove_access: boolean;
        };
        Returns: Json;
      };
      unpublish_preview: { Args: { p_book: string }; Returns: Json };
      write_audit: {
        Args: {
          p_action: string;
          p_after?: Json;
          p_area: string;
          p_before?: Json;
          p_object_id?: string;
          p_object_label?: string;
          p_object_type?: string;
          p_reason?: string;
          p_summary?: string;
        };
        Returns: number;
      };
    };
    Enums: {
      anchor_method: 'exact' | 'fuzzy' | 'nearest';
      app_theme: 'sunflower' | 'palm' | 'plum' | 'night';
      book_status: 'draft' | 'live' | 'scheduled' | 'unpublished' | 'taken_down' | 'rejected';
      chapter_kind: 'chapter' | 'part';
      draft_step: 'upload' | 'converting' | 'checking' | 'chapters' | 'preview';
      entitlement_scope: 'book' | 'chapter';
      entitlement_source: 'unlock_all' | 'chapter' | 'chapter_complete' | 'gift' | 'staff';
      fast_lane_result: 'pending' | 'ok' | 'problem';
      flag_source: 'worker' | 'desk' | 'staff';
      flag_status: 'open' | 'fixed' | 'dismissed';
      ledger_bucket: 'plan' | 'rollover' | 'topup' | 'promo';
      ledger_reason:
        | 'plan_grant'
        | 'rollover'
        | 'top_up'
        | 'unlock_all'
        | 'chapter'
        | 'undo'
        | 'tip'
        | 'message'
        | 'expiry'
        | 'refund'
        | 'staff_adjust'
        | 'gift_out'
        | 'gift_in'
        | 'promo';
      revision_origin: 'author' | 'staff' | 'desk';
      revision_status:
        | 'draft'
        | 'processing'
        | 'with_desk'
        | 'needs_fixes'
        | 'ready_for_review'
        | 'sent_back'
        | 'scheduled'
        | 'live'
        | 'superseded'
        | 'unpublished'
        | 'taken_down'
        | 'rejected';
      send_back_source: 'fixer' | 'quick_review' | 'desk_auto' | 'system';
      source_type: 'docx' | 'epub' | 'pdf';
      staff_role:
        'super_admin' | 'operations_admin' | 'publisher' | 'moderator' | 'finance' | 'support' | 'analyst';
      unpublish_reason: 'author_request' | 'policy_violation' | 'quality';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      anchor_method: ['exact', 'fuzzy', 'nearest'],
      app_theme: ['sunflower', 'palm', 'plum', 'night'],
      book_status: ['draft', 'live', 'scheduled', 'unpublished', 'taken_down', 'rejected'],
      chapter_kind: ['chapter', 'part'],
      draft_step: ['upload', 'converting', 'checking', 'chapters', 'preview'],
      entitlement_scope: ['book', 'chapter'],
      entitlement_source: ['unlock_all', 'chapter', 'chapter_complete', 'gift', 'staff'],
      fast_lane_result: ['pending', 'ok', 'problem'],
      flag_source: ['worker', 'desk', 'staff'],
      flag_status: ['open', 'fixed', 'dismissed'],
      ledger_bucket: ['plan', 'rollover', 'topup', 'promo'],
      ledger_reason: [
        'plan_grant',
        'rollover',
        'top_up',
        'unlock_all',
        'chapter',
        'undo',
        'tip',
        'message',
        'expiry',
        'refund',
        'staff_adjust',
        'gift_out',
        'gift_in',
        'promo',
      ],
      revision_origin: ['author', 'staff', 'desk'],
      revision_status: [
        'draft',
        'processing',
        'with_desk',
        'needs_fixes',
        'ready_for_review',
        'sent_back',
        'scheduled',
        'live',
        'superseded',
        'unpublished',
        'taken_down',
        'rejected',
      ],
      send_back_source: ['fixer', 'quick_review', 'desk_auto', 'system'],
      source_type: ['docx', 'epub', 'pdf'],
      staff_role: [
        'super_admin',
        'operations_admin',
        'publisher',
        'moderator',
        'finance',
        'support',
        'analyst',
      ],
      unpublish_reason: ['author_request', 'policy_violation', 'quality'],
    },
  },
} as const;
