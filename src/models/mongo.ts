import mongoose from 'mongoose';

// Schema for tracking crawl jobs
const crawlJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['MOVIE', 'SERIES', 'SEASON', 'EPISODE'],
      required: true,
    },
    targetId: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    priority: {
      type: Number,
      default: 0,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: String,
    lastRunAt: Date,
    nextRunAt: Date,
  },
  {
    timestamps: true,
  },
);

// Schema for storing raw crawled data before processing
const rawDataSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ['TMDB', 'IMDB', 'OTHER'],
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    dataType: {
      type: String,
      enum: ['MOVIE', 'SERIES', 'SEASON', 'EPISODE'],
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processingErrors: [String],
  },
  {
    timestamps: true,
  },
);

// Schema for crawler metrics
const crawlerMetricSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      enum: ['REQUEST', 'PROCESS', 'ERROR'],
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    duration: Number,
    statusCode: Number,
    errorType: String,
    errorMessage: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  },
);

// Create indexes
crawlJobSchema.index({ type: 1, targetId: 1 }, { unique: true });
crawlJobSchema.index({ status: 1, nextRunAt: 1 });
crawlJobSchema.index({ priority: -1, nextRunAt: 1 });

rawDataSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
rawDataSchema.index({ dataType: 1, processed: 1 });
rawDataSchema.index({ createdAt: 1 });

crawlerMetricSchema.index({ timestamp: 1 });
crawlerMetricSchema.index({ type: 1, source: 1 });

// Export models
export const CrawlJob = mongoose.model('CrawlJob', crawlJobSchema);
export const RawData = mongoose.model('RawData', rawDataSchema);
export const CrawlerMetric = mongoose.model('CrawlerMetric', crawlerMetricSchema); 