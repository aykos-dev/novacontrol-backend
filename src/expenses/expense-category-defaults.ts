/** Initial rows when the `expense_categories` table is empty. */
export const DEFAULT_EXPENSE_CATEGORY_SEED: {
  slug: string;
  name: string;
  color: string | null;
  icon_emoji: string | null;
  sort_order: number;
}[] = [
  {
    slug: 'fulfillment',
    name: 'Фулфилмент',
    color: '#3b82f6',
    icon_emoji: '📦',
    sort_order: 0,
  },
  {
    slug: 'advertising',
    name: 'Реклама',
    color: '#f97316',
    icon_emoji: '📢',
    sort_order: 1,
  },
  {
    slug: 'outsourcing',
    name: 'Аутсорс',
    color: '#8b5cf6',
    icon_emoji: '🛠️',
    sort_order: 2,
  },
  {
    slug: 'rent',
    name: 'Аренда',
    color: '#06b6d4',
    icon_emoji: '🏠',
    sort_order: 3,
  },
  {
    slug: 'self_purchase',
    name: 'Самовыкуп',
    color: '#22c55e',
    icon_emoji: '🛒',
    sort_order: 4,
  },
  {
    slug: 'other',
    name: 'Прочее',
    color: '#6b7280',
    icon_emoji: '📌',
    sort_order: 5,
  },
];
