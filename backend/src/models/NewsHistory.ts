import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const newsHistorySchema = new Schema({
  date: {
    type: String,
    required: true,
    index: true,
  },
  query: {
    type: String,
    required: true,
    default: "default",
  },
  articles: [
    {
      title: { type: String, default: "No title available" },
      link: { type: String, default: "#" },
      summary: { type: String, default: "No summary available" },
      date: { type: String, default: () => new Date().toISOString() },
      source: { type: String, default: "Unknown" },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

newsHistorySchema.index({ date: 1, query: 1 }, { unique: true });
// TTL: news cache entries older than 14 days self-evict so the collection
// can't grow unbounded over the lifetime of the deployment.
newsHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

export type NewsHistoryDocument = InferSchemaType<typeof newsHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NewsHistoryModel: Model<NewsHistoryDocument> =
  (mongoose.models.NewsHistory as Model<NewsHistoryDocument>) ||
  mongoose.model<NewsHistoryDocument>("NewsHistory", newsHistorySchema);

export default NewsHistoryModel;
