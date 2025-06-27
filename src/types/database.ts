import type { MovieSqlTable } from '@/types/movie';
import type { CharacterTable, CreditTable, StaffTable } from '@/types/staff';

export interface Database {
    movies: MovieSqlTable;
    staffs: StaffTable;
    characters: CharacterTable;
    credits: CreditTable;
}
