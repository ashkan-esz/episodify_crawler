import type { MovieSqlTable, RelatedMoviesSqlTable } from '@/types/movie';
import type { CharacterTable, CreditTable, StaffTable } from '@/types/staff';

export interface Database {
    movies: MovieSqlTable;
    related_movies: RelatedMoviesSqlTable;
    staffs: StaffTable;
    characters: CharacterTable;
    credits: CreditTable;
}
