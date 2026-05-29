CREATE TABLE goal_items (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  goal_id uuid,
  name text,
  price numeric,
  image_url text,
  item_url text,
  purchased_at timestamp with time zone,
  purchased_transaction_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE goal_items
  ADD CONSTRAINT goal_items_pkey PRIMARY KEY (id);

ALTER TABLE goal_items
  ADD CONSTRAINT goal_items_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE;

ALTER TABLE goal_items
  ADD CONSTRAINT goal_items_purchased_transaction_id_fkey FOREIGN KEY (purchased_transaction_id) REFERENCES transactions (id) ON DELETE SET NULL;
