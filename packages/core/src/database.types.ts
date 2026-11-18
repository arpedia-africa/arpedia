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
      book_revisions: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          pages: number | null;
          preview_percent: number | null;
          price_credits: number | null;
          published_at: string | null;
          revision_no: number;
          status: Database['public']['Enums']['revision_status'];
          submitted_at: string | null;
          updated_at: string;
          words: number | null;
        };
        ComputedFields: never;
        Insert: {
          book_id: string;
          created_at?: string;
          id?: string;
          pages?: number | null;
          preview_percent?: number | null;
          price_credits?: number | null;
          published_at?: string | null;
          revision_no: number;
          status?: Database['public']['Enums']['revision_status'];
          submitted_at?: string | null;
          updated_at?: string;
          words?: number | null;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          id?: string;
          pages?: number | null;
          preview_percent?: number | null;
          price_credits?: number | null;
          published_at?: string | null;
          revision_no?: number;
          status?: Database['public']['Enums']['revision_status'];
          submitted_at?: string | null;
          updated_at?: string;
          words?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'book_revisions_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
        ];
      };
      books: {
        Row: {
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
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
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
          updated_at?: string;
        };
        Update: {
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
            foreignKeyName: 'books_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
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
      chapters: {
        Row: {
          chapter_uid: string;
          free_file: string | null;
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
            foreignKeyName: 'credit_ledger_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
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
            foreignKeyName: 'credit_ledger_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
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
          {
            foreignKeyName: 'credit_ledger_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
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
          {
            foreignKeyName: 'entitlements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      genres: {
        Row: {
          created_at: string;
          id: string;
          merged_into: string | null;
          name: string;
          position: number;
          slug: string;
          visible: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          merged_into?: string | null;
          name: string;
          position: number;
          slug: string;
          visible?: boolean;
        };
        Update: {
          created_at?: string;
          id?: string;
          merged_into?: string | null;
          name?: string;
          position?: number;
          slug?: string;
          visible?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'genres_merged_into_fkey';
            columns: ['merged_into'];
            isOneToOne: false;
            referencedRelation: 'genres';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          banned_at: string | null;
          cost_ack_at: string | null;
          group_id: string;
          joined_at: string;
          last_read_at: string;
          last_seen_at: string | null;
          muted_by: string | null;
          muted_until: string | null;
          notify_muted_until: string | null;
          role: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          banned_at?: string | null;
          cost_ack_at?: string | null;
          group_id: string;
          joined_at?: string;
          last_read_at?: string;
          last_seen_at?: string | null;
          muted_by?: string | null;
          muted_until?: string | null;
          notify_muted_until?: string | null;
          role?: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        Update: {
          banned_at?: string | null;
          cost_ack_at?: string | null;
          group_id?: string;
          joined_at?: string;
          last_read_at?: string;
          last_seen_at?: string | null;
          muted_by?: string | null;
          muted_until?: string | null;
          notify_muted_until?: string | null;
          role?: Database['public']['Enums']['group_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_muted_by_fkey';
            columns: ['muted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_muted_by_fkey';
            columns: ['muted_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          archived_at: string | null;
          avatar_url: string | null;
          book_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          kind: Database['public']['Enums']['group_kind'];
          last_message_at: string | null;
          live_at: string | null;
          live_count: number;
          locked_until: string | null;
          member_count: number;
          muted_until: string | null;
          muted_words: string[];
          name: string;
          owner_id: string | null;
          slow_mode_seconds: number;
          updated_at: string;
          visibility: Database['public']['Enums']['group_visibility'];
          weekly_book_id: string | null;
          weekly_from_chapter: number | null;
          weekly_note: string | null;
          weekly_to_chapter: number | null;
          who_can_post: Database['public']['Enums']['group_who_can_post'];
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          avatar_url?: string | null;
          book_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: Database['public']['Enums']['group_kind'];
          last_message_at?: string | null;
          live_at?: string | null;
          live_count?: number;
          locked_until?: string | null;
          member_count?: number;
          muted_until?: string | null;
          muted_words?: string[];
          name: string;
          owner_id?: string | null;
          slow_mode_seconds?: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['group_visibility'];
          weekly_book_id?: string | null;
          weekly_from_chapter?: number | null;
          weekly_note?: string | null;
          weekly_to_chapter?: number | null;
          who_can_post?: Database['public']['Enums']['group_who_can_post'];
        };
        Update: {
          archived_at?: string | null;
          avatar_url?: string | null;
          book_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['group_kind'];
          last_message_at?: string | null;
          live_at?: string | null;
          live_count?: number;
          locked_until?: string | null;
          member_count?: number;
          muted_until?: string | null;
          muted_words?: string[];
          name?: string;
          owner_id?: string | null;
          slow_mode_seconds?: number;
          updated_at?: string;
          visibility?: Database['public']['Enums']['group_visibility'];
          weekly_book_id?: string | null;
          weekly_from_chapter?: number | null;
          weekly_note?: string | null;
          weekly_to_chapter?: number | null;
          who_can_post?: Database['public']['Enums']['group_who_can_post'];
        };
        Relationships: [
          {
            foreignKeyName: 'groups_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'groups_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'groups_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'groups_weekly_book_id_fkey';
            columns: ['weekly_book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
        ];
      };
      message_pins: {
        Row: {
          group_id: string;
          message_id: string;
          pinned_at: string;
          pinned_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          message_id: string;
          pinned_at?: string;
          pinned_by?: string | null;
        };
        Update: {
          group_id?: string;
          message_id?: string;
          pinned_at?: string;
          pinned_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_pins_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_pins_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_pins_pinned_by_fkey';
            columns: ['pinned_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_pins_pinned_by_fkey';
            columns: ['pinned_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          message_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          emoji: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_retained: {
        Row: {
          body: string;
          message_id: string;
          purge_at: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          message_id: string;
          purge_at?: string;
        };
        Update: {
          body?: string;
          message_id?: string;
          purge_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_retained_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: true;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string | null;
          client_id: string;
          cost_credits: number;
          created_at: string;
          group_id: string;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          ledger_id: number | null;
          quote: Json | null;
          reply_to_id: string | null;
          sender_id: string | null;
          spoiler_chapter: number | null;
          state: Database['public']['Enums']['message_state'];
          state_changed_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          client_id: string;
          cost_credits?: number;
          created_at?: string;
          group_id: string;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          ledger_id?: number | null;
          quote?: Json | null;
          reply_to_id?: string | null;
          sender_id?: string | null;
          spoiler_chapter?: number | null;
          state?: Database['public']['Enums']['message_state'];
          state_changed_at?: string | null;
        };
        Update: {
          body?: string | null;
          client_id?: string;
          cost_credits?: number;
          created_at?: string;
          group_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['message_kind'];
          ledger_id?: number | null;
          quote?: Json | null;
          reply_to_id?: string | null;
          sender_id?: string | null;
          spoiler_chapter?: number | null;
          state?: Database['public']['Enums']['message_state'];
          state_changed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_ledger_id_fkey';
            columns: ['ledger_id'];
            isOneToOne: false;
            referencedRelation: 'credit_ledger';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          key: string;
          label: string;
          matrix_order: number | null;
          more: boolean;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          label: string;
          matrix_order?: number | null;
          more?: boolean;
        };
        Update: {
          key?: string;
          label?: string;
          matrix_order?: number | null;
          more?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          country: string;
          created_at: string;
          date_of_birth: string | null;
          deleted_at: string | null;
          full_name: string;
          id: string;
          interests: string[];
          is_author: boolean;
          is_reader: boolean;
          onboarding_step: string;
          phone: string | null;
          privacy_version: number | null;
          signup_intent: Database['public']['Enums']['signup_intent'] | null;
          terms_accepted_at: string | null;
          terms_version: number | null;
          theme: Database['public']['Enums']['app_theme'];
          updated_at: string;
          username: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          full_name?: string;
          id: string;
          interests?: string[];
          is_author?: boolean;
          is_reader?: boolean;
          onboarding_step?: string;
          phone?: string | null;
          privacy_version?: number | null;
          signup_intent?: Database['public']['Enums']['signup_intent'] | null;
          terms_accepted_at?: string | null;
          terms_version?: number | null;
          theme?: Database['public']['Enums']['app_theme'];
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          full_name?: string;
          id?: string;
          interests?: string[];
          is_author?: boolean;
          is_reader?: boolean;
          onboarding_step?: string;
          phone?: string | null;
          privacy_version?: number | null;
          signup_intent?: Database['public']['Enums']['signup_intent'] | null;
          terms_accepted_at?: string | null;
          terms_version?: number | null;
          theme?: Database['public']['Enums']['app_theme'];
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          assignee_id: string | null;
          book_id: string | null;
          content_id: string;
          content_type: Database['public']['Enums']['report_content_type'];
          created_at: string;
          details: string | null;
          due_at: string;
          escalated_at: string | null;
          first_action_at: string | null;
          group_id: string | null;
          id: string;
          outcome: Database['public']['Enums']['report_outcome'] | null;
          reason: Database['public']['Enums']['report_reason'];
          ref: string;
          reported_user_id: string | null;
          reporter_id: string | null;
          resolved_at: string | null;
          severity: Database['public']['Enums']['report_severity'];
          snapshot: Json | null;
          status: Database['public']['Enums']['report_status'];
        };
        ComputedFields: never;
        Insert: {
          assignee_id?: string | null;
          book_id?: string | null;
          content_id: string;
          content_type: Database['public']['Enums']['report_content_type'];
          created_at?: string;
          details?: string | null;
          due_at: string;
          escalated_at?: string | null;
          first_action_at?: string | null;
          group_id?: string | null;
          id?: string;
          outcome?: Database['public']['Enums']['report_outcome'] | null;
          reason: Database['public']['Enums']['report_reason'];
          ref?: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          resolved_at?: string | null;
          severity: Database['public']['Enums']['report_severity'];
          snapshot?: Json | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Update: {
          assignee_id?: string | null;
          book_id?: string | null;
          content_id?: string;
          content_type?: Database['public']['Enums']['report_content_type'];
          created_at?: string;
          details?: string | null;
          due_at?: string;
          escalated_at?: string | null;
          first_action_at?: string | null;
          group_id?: string | null;
          id?: string;
          outcome?: Database['public']['Enums']['report_outcome'] | null;
          reason?: Database['public']['Enums']['report_reason'];
          ref?: string;
          reported_user_id?: string | null;
          reporter_id?: string | null;
          resolved_at?: string | null;
          severity?: Database['public']['Enums']['report_severity'];
          snapshot?: Json | null;
          status?: Database['public']['Enums']['report_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'reports_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          level: Database['public']['Enums']['permission_level'];
          limit_note: string | null;
          permission: string;
          role: Database['public']['Enums']['staff_role'];
          second_person: boolean;
        };
        ComputedFields: never;
        Insert: {
          level?: Database['public']['Enums']['permission_level'];
          limit_note?: string | null;
          permission: string;
          role: Database['public']['Enums']['staff_role'];
          second_person?: boolean;
        };
        Update: {
          level?: Database['public']['Enums']['permission_level'];
          limit_note?: string | null;
          permission?: string;
          role?: Database['public']['Enums']['staff_role'];
          second_person?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_fkey';
            columns: ['permission'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['key'];
          },
        ];
      };
      staff_auth_failures: {
        Row: {
          at: string;
          email: string | null;
          id: number;
          kind: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          email?: string | null;
          id?: never;
          kind: string;
          user_id?: string | null;
        };
        Update: {
          at?: string;
          email?: string | null;
          id?: never;
          kind?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      staff_backup_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          used_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          code_hash: string;
          created_at?: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_backup_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_backup_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_backup_sessions: {
        Row: {
          session_id: string;
          user_id: string;
          verified_at: string;
        };
        ComputedFields: never;
        Insert: {
          session_id: string;
          user_id: string;
          verified_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_backup_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_backup_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_invites: {
        Row: {
          accepted_at: string | null;
          accepted_user_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          full_name: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database['public']['Enums']['staff_role'];
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_user_id?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          full_name: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database['public']['Enums']['staff_role'];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_user_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          full_name?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database['public']['Enums']['staff_role'];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_invites_accepted_user_id_fkey';
            columns: ['accepted_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_invites_accepted_user_id_fkey';
            columns: ['accepted_user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_roles: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          disabled_at: string | null;
          disabled_by: string | null;
          last_active_at: string | null;
          phone: string | null;
          role: Database['public']['Enums']['staff_role'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          disabled_at?: string | null;
          disabled_by?: string | null;
          last_active_at?: string | null;
          phone?: string | null;
          role: Database['public']['Enums']['staff_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          disabled_at?: string | null;
          disabled_by?: string | null;
          last_active_at?: string | null;
          phone?: string | null;
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
            foreignKeyName: 'staff_roles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_roles_disabled_by_fkey';
            columns: ['disabled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_roles_disabled_by_fkey';
            columns: ['disabled_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'staff_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          source_group_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          source_group_id?: string | null;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          source_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_source_group_id_fkey';
            columns: ['source_group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_devices: {
        Row: {
          app_version: string | null;
          created_at: string;
          device_key: string;
          download_enabled: boolean;
          id: string;
          last_city: string | null;
          last_seen_at: string;
          model: string | null;
          os: string | null;
          push_token: string | null;
          revoked_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          app_version?: string | null;
          created_at?: string;
          device_key: string;
          download_enabled?: boolean;
          id?: string;
          last_city?: string | null;
          last_seen_at?: string;
          model?: string | null;
          os?: string | null;
          push_token?: string | null;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          device_key?: string;
          download_enabled?: boolean;
          id?: string;
          last_city?: string | null;
          last_seen_at?: string;
          model?: string | null;
          os?: string | null;
          push_token?: string | null;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_genres: {
        Row: {
          created_at: string;
          genre_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          genre_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          genre_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_genres_genre_id_fkey';
            columns: ['genre_id'];
            isOneToOne: false;
            referencedRelation: 'genres';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_genres_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_genres_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          full_name: string;
          id: string;
          is_author: boolean;
          username: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          full_name?: string | null;
          id?: string | null;
          is_author?: boolean | null;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          full_name?: string | null;
          id?: string | null;
          is_author?: boolean | null;
          username?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _audit_as: {
        Args: {
          p_action: string;
          p_actor: string;
          p_after: Json;
          p_area: string;
          p_before: Json;
          p_object_id: string;
          p_object_label: string;
          p_object_type: string;
          p_reason: string;
          p_summary: string;
        };
        Returns: number;
      };
      _check_super_admins: { Args: { p_user: string }; Returns: undefined };
      accept_staff_invite: {
        Args: { p_token_hash: string; p_user: string };
        Returns: Database['public']['Enums']['staff_role'];
      };
      admin_create_official_channel: {
        Args: {
          p_description: string;
          p_name: string;
          p_visibility?: Database['public']['Enums']['group_visibility'];
          p_who_can_post?: Database['public']['Enums']['group_who_can_post'];
        };
        Returns: string;
      };
      admin_get_channel: { Args: { p_group: string }; Returns: Json };
      admin_list_channels: {
        Args: { p_kind?: string; p_q?: string; p_reports?: boolean; p_status?: string };
        Returns: {
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['group_kind'];
          locked_until: string;
          member_count: number;
          messages_7d: number;
          muted_until: string;
          name: string;
          open_reports: number;
          owner_id: string;
          owner_name: string;
          status: string;
          visibility: Database['public']['Enums']['group_visibility'];
          who_can_post: Database['public']['Enums']['group_who_can_post'];
        }[];
      };
      admin_mute_member: {
        Args: { p_group: string; p_reason?: string; p_until: string; p_user: string };
        Returns: undefined;
      };
      admin_set_channel_state: {
        Args: { p_group: string; p_lock_until: string; p_mute_until: string; p_reason?: string };
        Returns: undefined;
      };
      admin_update_channel: {
        Args: { p_group: string; p_patch: Json; p_reason?: string };
        Returns: undefined;
      };
      block_user: { Args: { p_at?: string; p_source_group?: string; p_user: string }; Returns: string };
      can_quote: { Args: { p_book: string; p_chapter: number; p_user: string }; Returns: boolean };
      change_staff_role: {
        Args: { p_role: Database['public']['Enums']['staff_role']; p_user: string };
        Returns: undefined;
      };
      clear_staff_signin_failures: { Args: Record<PropertyKey, never>; Returns: undefined };
      community_admin: { Args: { p_edit: boolean }; Returns: boolean };
      create_staff_backup_codes: { Args: Record<PropertyKey, never>; Returns: string[] };
      credit_balance: { Args: { p_user: string }; Returns: number };
      delete_message: { Args: { p_message: string }; Returns: Json };
      get_all_set: { Args: Record<PropertyKey, never>; Returns: Json };
      get_blocked: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_url: string;
          created_at: string;
          full_name: string;
          source_group_id: string;
          source_kind: Database['public']['Enums']['group_kind'];
          source_name: string;
          user_id: string;
        }[];
      };
      get_group: { Args: { p_group: string }; Returns: Json };
      get_group_access: { Args: { p_group: string; p_user: string }; Returns: Json };
      get_inbox: {
        Args: { p_cursor?: string; p_filter?: string; p_limit?: number };
        Returns: {
          avatar_url: string;
          group_id: string;
          is_author: boolean;
          kind: Database['public']['Enums']['group_kind'];
          last_at: string;
          last_body: string;
          last_from_author: boolean;
          last_kind: Database['public']['Enums']['message_kind'];
          last_sender: string;
          last_state: Database['public']['Enums']['message_state'];
          live: boolean;
          member_count: number;
          muted: boolean;
          name: string;
          other_user_id: string;
          role: Database['public']['Enums']['group_role'];
          unread_count: number;
        }[];
      };
      get_inbox_counts: { Args: Record<PropertyKey, never>; Returns: Json };
      get_messages: {
        Args: { p_before?: string; p_before_id?: string; p_group: string; p_limit?: number };
        Returns: {
          body: string;
          created_at: string;
          group_id: string;
          id: string;
          kind: Database['public']['Enums']['message_kind'];
          my_reaction: string;
          pinned: boolean;
          quote: Json;
          reactions: Json;
          reply_to: Json;
          reply_to_id: string;
          sender_avatar: string;
          sender_id: string;
          sender_is_author: boolean;
          sender_name: string;
          state: Database['public']['Enums']['message_state'];
        }[];
      };
      get_onboarding_paywall: { Args: Record<PropertyKey, never>; Returns: Json };
      get_staff_context: { Args: Record<PropertyKey, never>; Returns: Json };
      get_staff_invite: { Args: { p_token_hash: string }; Returns: Json };
      has_blocked: { Args: { p_user: string; p_viewer: string }; Returns: boolean };
      has_permission: { Args: { p_permission: string }; Returns: boolean };
      inbox_rows_for: {
        Args: { p_user: string };
        Returns: {
          avatar_url: string;
          group_id: string;
          is_author: boolean;
          kind: Database['public']['Enums']['group_kind'];
          last_at: string;
          last_body: string;
          last_from_author: boolean;
          last_kind: Database['public']['Enums']['message_kind'];
          last_sender: string;
          last_state: Database['public']['Enums']['message_state'];
          live: boolean;
          member_count: number;
          muted: boolean;
          name: string;
          other_user_id: string;
          role: Database['public']['Enums']['group_role'];
          unread_count: number;
        }[];
      };
      invite_staff: {
        Args: {
          p_actor?: string;
          p_email: string;
          p_name: string;
          p_role: Database['public']['Enums']['staff_role'];
          p_token_hash: string;
        };
        Returns: string;
      };
      is_community_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_group_member: { Args: { p_group: string; p_user?: string }; Returns: boolean };
      is_group_mod: { Args: { p_group: string; p_user?: string }; Returns: boolean };
      is_minor: { Args: { p_user: string }; Returns: boolean };
      is_staff: { Args: { p_role?: Database['public']['Enums']['staff_role'] }; Returns: boolean };
      is_staff_any: { Args: { p_roles: Database['public']['Enums']['staff_role'][] }; Returns: boolean };
      join_group: { Args: { p_group: string }; Returns: undefined };
      leave_group: { Args: { p_group: string }; Returns: undefined };
      list_staff: {
        Args: Record<PropertyKey, never>;
        Returns: {
          active: boolean;
          email: string;
          expires_at: string;
          full_name: string;
          id: string;
          invited_by_name: string;
          is_self: boolean;
          kind: string;
          last_active_at: string;
          mfa_on: boolean;
          role: Database['public']['Enums']['staff_role'];
        }[];
      };
      make_username: { Args: { p_name: string }; Returns: string };
      mark_all_read: { Args: Record<PropertyKey, never>; Returns: number };
      mark_read: { Args: { p_group: string; p_up_to?: string }; Returns: undefined };
      note_staff_code_failure: { Args: Record<PropertyKey, never>; Returns: undefined };
      note_staff_signin_failure: { Args: { p_email: string }; Returns: undefined };
      onboarding_step_ord: { Args: { p_step: string }; Returns: number };
      persist_messages: { Args: { p_batch: Json }; Returns: Json };
      pin_message: { Args: { p_group: string; p_message: string }; Returns: undefined };
      post_block_for: {
        Args: { p_group: string; p_user: string };
        Returns: {
          reason: string;
          until: string;
        }[];
      };
      purge_deleted_messages: { Args: Record<PropertyKey, never>; Returns: undefined };
      react: { Args: { p_emoji: string; p_message: string }; Returns: Json };
      refresh_member_counts: { Args: Record<PropertyKey, never>; Returns: undefined };
      register_device: {
        Args: {
          p_app_version?: string;
          p_device_key: string;
          p_model?: string;
          p_os?: string;
          p_push_token?: string;
        };
        Returns: boolean;
      };
      report_message: {
        Args: {
          p_also_block?: boolean;
          p_details?: string;
          p_message: string;
          p_reason: Database['public']['Enums']['report_reason'];
        };
        Returns: string;
      };
      report_severity_for: {
        Args: { p_reason: Database['public']['Enums']['report_reason'] };
        Returns: Database['public']['Enums']['report_severity'];
      };
      require_community_admin: { Args: { p_edit: boolean }; Returns: undefined };
      require_permission: { Args: { p_permission: string }; Returns: undefined };
      reset_staff_mfa: { Args: { p_user: string }; Returns: undefined };
      revoke_staff_invite: { Args: { p_invite: string }; Returns: undefined };
      save_onboarding_step: {
        Args: { p_payload?: Json; p_step: string };
        Returns: {
          avatar_url: string | null;
          bio: string | null;
          country: string;
          created_at: string;
          date_of_birth: string | null;
          deleted_at: string | null;
          full_name: string;
          id: string;
          interests: string[];
          is_author: boolean;
          is_reader: boolean;
          onboarding_step: string;
          phone: string | null;
          privacy_version: number | null;
          signup_intent: Database['public']['Enums']['signup_intent'] | null;
          terms_accepted_at: string | null;
          terms_version: number | null;
          theme: Database['public']['Enums']['app_theme'];
          updated_at: string;
          username: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      search_communities: {
        Args: { p_limit?: number; p_offset?: number; p_q?: string; p_type?: string };
        Returns: {
          avatar_url: string;
          description: string;
          id: string;
          joined: boolean;
          kind: Database['public']['Enums']['group_kind'];
          live: boolean;
          member_count: number;
          name: string;
        }[];
      };
      sender_name: { Args: { p_user: string }; Returns: string };
      set_group_mute: { Args: { p_group: string; p_until: string }; Returns: undefined };
      set_live_count: { Args: { p_count: number; p_group: string }; Returns: undefined };
      set_staff_status: { Args: { p_active: boolean; p_user: string }; Returns: undefined };
      set_user_genres: { Args: { p_genre_ids: string[] }; Returns: undefined };
      staff_by_role: {
        Args: Record<PropertyKey, never>;
        Returns: {
          invited: string[];
          names: string[];
          role: Database['public']['Enums']['staff_role'];
        }[];
      };
      staff_mfa_ok: { Args: Record<PropertyKey, never>; Returns: boolean };
      staff_mfa_verified_at: { Args: Record<PropertyKey, never>; Returns: string };
      staff_signin_locked: { Args: { p_email: string }; Returns: boolean };
      touch_last_seen: { Args: { p_group: string; p_user: string }; Returns: undefined };
      unblock_user: { Args: { p_user: string }; Returns: Json };
      unpin_message: { Args: { p_group: string; p_message: string }; Returns: undefined };
      use_staff_backup_code: { Args: { p_code: string }; Returns: number };
      uuid7: { Args: { p_at?: string }; Returns: string };
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
      app_theme: 'sunflower' | 'palm' | 'plum' | 'night';
      book_status: 'draft' | 'live' | 'scheduled' | 'unpublished' | 'taken_down' | 'rejected';
      chapter_kind: 'chapter' | 'part';
      entitlement_scope: 'book' | 'chapter';
      entitlement_source: 'unlock_all' | 'chapter' | 'chapter_complete' | 'gift' | 'staff';
      group_kind: 'official' | 'club' | 'author' | 'readalong' | 'room' | 'dm';
      group_role: 'owner' | 'moderator' | 'member';
      group_visibility: 'public' | 'followers' | 'private';
      group_who_can_post: 'members' | 'staff' | 'owner_and_followers';
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
      message_kind: 'text' | 'quote' | 'system';
      message_state: 'visible' | 'auto_hidden' | 'removed' | 'deleted';
      permission_level: 'allow' | 'limited';
      report_content_type:
        | 'message'
        | 'discussion_comment'
        | 'review'
        | 'post_comment'
        | 'author_post'
        | 'profile'
        | 'book'
        | 'dm';
      report_outcome: 'keep' | 'removed' | 'spoiler' | 'actioned' | 'dismissed';
      report_reason:
        | 'spam'
        | 'harassment'
        | 'hate'
        | 'sexual'
        | 'violence'
        | 'self_harm'
        | 'copyright'
        | 'spoilers'
        | 'impersonation'
        | 'other';
      report_severity: 'high' | 'medium' | 'low';
      report_status: 'open' | 'auto_hidden' | 'resolved';
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
      signup_intent: 'reader' | 'author';
      staff_role:
        'super_admin' | 'operations_admin' | 'publisher' | 'moderator' | 'finance' | 'support' | 'analyst';
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
      app_theme: ['sunflower', 'palm', 'plum', 'night'],
      book_status: ['draft', 'live', 'scheduled', 'unpublished', 'taken_down', 'rejected'],
      chapter_kind: ['chapter', 'part'],
      entitlement_scope: ['book', 'chapter'],
      entitlement_source: ['unlock_all', 'chapter', 'chapter_complete', 'gift', 'staff'],
      group_kind: ['official', 'club', 'author', 'readalong', 'room', 'dm'],
      group_role: ['owner', 'moderator', 'member'],
      group_visibility: ['public', 'followers', 'private'],
      group_who_can_post: ['members', 'staff', 'owner_and_followers'],
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
      message_kind: ['text', 'quote', 'system'],
      message_state: ['visible', 'auto_hidden', 'removed', 'deleted'],
      permission_level: ['allow', 'limited'],
      report_content_type: [
        'message',
        'discussion_comment',
        'review',
        'post_comment',
        'author_post',
        'profile',
        'book',
        'dm',
      ],
      report_outcome: ['keep', 'removed', 'spoiler', 'actioned', 'dismissed'],
      report_reason: [
        'spam',
        'harassment',
        'hate',
        'sexual',
        'violence',
        'self_harm',
        'copyright',
        'spoilers',
        'impersonation',
        'other',
      ],
      report_severity: ['high', 'medium', 'low'],
      report_status: ['open', 'auto_hidden', 'resolved'],
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
      signup_intent: ['reader', 'author'],
      staff_role: [
        'super_admin',
        'operations_admin',
        'publisher',
        'moderator',
        'finance',
        'support',
        'analyst',
      ],
    },
  },
} as const;
