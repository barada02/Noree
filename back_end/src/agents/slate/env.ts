/** Read lazily, so values from the .env file loaded at startup are always seen. */
export const env = {
  get metaKey() {
    return process.env.META_API || process.env.MODEL_API_KEY || '';
  },
  get basetenKey() {
    return process.env.BASETEN_API_KEY || '';
  },
  get metaModel() {
    return process.env.INK_META_MODEL || 'muse-spark-1.3';
  },
  get basetenModel() {
    return process.env.INK_BASETEN_MODEL || 'meta-models/muse-spark-open-1026';
  },
  get metaEffort() {
    return process.env.INK_META_EFFORT || 'low';
  },
};
