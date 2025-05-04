import { CrawlerLink, MovieType } from './source';

export type TorrentTitle = {
    title: string;
    type: MovieType;
    year: string;
    links: CrawlerLink[];
};
