-- Reviews Table Schema
-- 口コミデータを保存するテーブル

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liver_id TEXT NOT NULL,           -- ライバーのoriginalId
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at INTEGER NOT NULL,       -- Unix timestamp (milliseconds)
  ip_hash TEXT NOT NULL              -- スパム対策用（IPアドレスのSHA-256ハッシュ）
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_liver_id ON reviews(liver_id);
CREATE INDEX IF NOT EXISTS idx_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_ip_hash_created ON reviews(ip_hash, created_at);

-- サンプルデータ確認用クエリ（コメント）
-- SELECT * FROM reviews WHERE liver_id = '158' ORDER BY rating DESC, created_at DESC;
-- SELECT liver_id, AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews GROUP BY liver_id;