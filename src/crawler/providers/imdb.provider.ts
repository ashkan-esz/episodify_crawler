import axios, { AxiosInstance } from 'axios';
import { MediaProvider } from './index';
import logger from '@/utils/logger';
import config from '@/config';

export class IMDBProvider implements MediaProvider {
  public readonly name = 'IMDB';
  public readonly baseUrl = 'https://imdb-api.com/API';
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = config.IMDB_API_KEY;
    if (!this.apiKey) {
      throw new Error('IMDB API key is required');
    }

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
    // IMDB API allows 100 requests per day for free tier
    return { requests: 100, interval: 86400000 }; // 24 hours in milliseconds
  }

  public async fetchMovie(id: string): Promise<any> {
    try {
      const response = await this.client.get(`/Title/${this.apiKey}/${id}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching movie from IMDB:', { error, id });
      throw error;
    }
  }

  public async fetchSeries(id: string): Promise<any> {
    try {
      const [seriesResponse, episodesResponse] = await Promise.all([
        this.client.get(`/Title/${this.apiKey}/${id}`),
        this.client.get(`/SeasonEpisodes/${this.apiKey}/${id}`),
      ]);

      return {
        ...seriesResponse.data,
        episodes: episodesResponse.data,
      };
    } catch (error) {
      logger.error('Error fetching series from IMDB:', { error, id });
      throw error;
    }
  }

  public async searchMedia(query: string): Promise<any> {
    try {
      const response = await this.client.get(`/SearchAll/${this.apiKey}/${query}`);
      return response.data.results;
    } catch (error) {
      logger.error('Error searching media on IMDB:', { error, query });
      throw error;
    }
  }
} 