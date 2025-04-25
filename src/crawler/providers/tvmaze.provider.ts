import axios, { AxiosInstance } from 'axios';
import { MediaProvider } from './index';
import logger from '@/utils/logger';

export class TVMazeProvider implements MediaProvider {
  public readonly name = 'TVMaze';
  public readonly baseUrl = 'https://api.tvmaze.com';
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  public getRateLimit(): { requests: number; interval: number } {
    // TVMaze allows 20 requests per 10 seconds
    return { requests: 20, interval: 10000 };
  }

  public async fetchMovie(): Promise<any> {
    // TVMaze doesn't provide movie data
    throw new Error('TVMaze does not support movie data');
  }

  public async fetchSeries(id: number): Promise<any> {
    try {
      const [seriesResponse, episodesResponse] = await Promise.all([
        this.client.get(`/shows/${id}?embed[]=seasons&embed[]=cast`),
        this.client.get(`/shows/${id}/episodes`),
      ]);

      return {
        ...seriesResponse.data,
        episodes: episodesResponse.data,
      };
    } catch (error) {
      logger.error('Error fetching series from TVMaze:', { error, id });
      throw error;
    }
  }

  public async searchMedia(query: string): Promise<any> {
    try {
      const response = await this.client.get('/search/shows', {
        params: { q: query },
      });

      return response.data.map((item: any) => item.show);
    } catch (error) {
      logger.error('Error searching media on TVMaze:', { error, query });
      throw error;
    }
  }
} 