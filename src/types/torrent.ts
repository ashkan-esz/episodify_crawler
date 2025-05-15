import { DownloadLink } from '@/types/downloadLink';
import {  MovieType } from './source';

export type TorrentTitle = {
    title: string;
    type: MovieType;
    year: string;
    links: DownloadLink[];
};
