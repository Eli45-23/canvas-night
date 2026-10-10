declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CANVAS_MODE?: string;
    BUCKET?: R2Bucket;
  }
}
