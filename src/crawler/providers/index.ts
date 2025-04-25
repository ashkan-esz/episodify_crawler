export interface MediaProvider {
  name: string;
  baseUrl: string;
  fetchMovie(id: string | number): Promise<any>;
  fetchSeries(id: string | number): Promise<any>;
  searchMedia(query: string): Promise<any>;
  getRateLimit(): { requests: number; interval: number };
}

export * from './tvmaze.provider';
export * from './imdb.provider';
export * from './tmdb.provider'; 