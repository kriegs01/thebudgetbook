CREATE TABLE goals (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid,
  name text,
  description text,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE goals
  ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

ALTER TABLE goals
  ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE CASCADE;
