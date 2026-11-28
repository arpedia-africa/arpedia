import {
  constructTable,
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';

/**
 * Table data and sorting logic for the console's `.tbl` lists (flow 00 rule 13: TanStack Table for
 * logic only; the markup stays the prototype's). Pure, so it runs in server and client components.
 */

type Value = string | number | boolean | null | undefined;

/** One sort key, most significant first. Strings compare with `localeCompare`; null sorts last. */
export interface SortKey<T extends RowData> {
  id: string;
  value: (row: T) => Value;
  desc?: boolean;
}

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const compare = (a: Value, b: Value) => {
  const x = typeof a === 'boolean' ? Number(a) : a;
  const y = typeof b === 'boolean' ? Number(b) : b;
  if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y);
  return Number(x) < Number(y) ? -1 : Number(x) > Number(y) ? 1 : 0;
};

/** Returns a new array sorted by `keys` (stable: equal rows keep their order). */
export function sortRows<T extends RowData>(rows: readonly T[], keys: readonly SortKey<T>[]): T[] {
  if (rows.length < 2 || keys.length === 0) return [...rows];
  type F = typeof features;
  const columns: ColumnDef<F, T>[] = keys.map(k => ({
    id: k.id,
    accessorFn: (row: T) => k.value(row) ?? undefined,
    sortUndefined: 'last',
    sortFn: (a, b, id) => compare(a.getValue(id) as Value, b.getValue(id) as Value),
  }));
  const table = constructTable<F, T>({
    features,
    columns,
    data: rows as T[],
    initialState: { sorting: keys.map(k => ({ id: k.id, desc: !!k.desc })) },
  });
  return table.getRowModel().rows.map(r => r.original);
}
