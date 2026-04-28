-- Optional manual migration when upgrading from enum-based `extra_expenses.category`
-- to FK `category_id` (Postgres). Run with DATABASE_SYNC=false or after backing up.
--
-- 1) Create categories table (matches TypeORM entity `expense_categories`).
-- 2) Seed default slugs if missing.
-- 3) Add `category_id`, backfill from legacy enum text, drop enum column.

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(64) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  color varchar(7) NULL,
  icon_emoji varchar(16) NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO expense_categories (slug, name, color, icon_emoji, sort_order, is_active)
VALUES
  ('fulfillment', 'Фулфилмент', '#3b82f6', '📦', 0, true),
  ('advertising', 'Реклама', '#f97316', '📢', 1, true),
  ('outsourcing', 'Аутсорс', '#8b5cf6', '🛠️', 2, true),
  ('rent', 'Аренда', '#06b6d4', '🏠', 3, true),
  ('self_purchase', 'Самовыкуп', '#22c55e', '🛒', 4, true),
  ('other', 'Прочее', '#6b7280', '📌', 5, true)
ON CONFLICT (slug) DO NOTHING;

-- If `extra_expenses.category` (enum) still exists:
-- ALTER TABLE extra_expenses ADD COLUMN IF NOT EXISTS category_id uuid NULL;
-- UPDATE extra_expenses e
--   SET category_id = c.id
--   FROM expense_categories c
--   WHERE e.category::text = c.slug;
-- ALTER TABLE extra_expenses ALTER COLUMN category_id SET NOT NULL;
-- ALTER TABLE extra_expenses DROP COLUMN category;
-- ALTER TABLE extra_expenses
--   ADD CONSTRAINT fk_extra_expenses_category
--   FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT;
