// Reviews API Implementation
// 口コミ機能のAPIエンドポイント実装

/**
 * IPアドレスをSHA-256でハッシュ化
 */
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * レート制限チェック（5分に1回）
 */
async function checkRateLimit(env, ipHash) {
  const rateLimitKey = `rate_limit:${ipHash}`;
  const lastSubmit = await env.RATE_LIMIT.get(rateLimitKey);

  if (lastSubmit) {
    const lastSubmitTime = parseInt(lastSubmit);
    const now = Date.now();
    const timeDiff = now - lastSubmitTime;
    const fiveMinutes = 5 * 60 * 1000;

    if (timeDiff < fiveMinutes) {
      const remainingSeconds = Math.ceil((fiveMinutes - timeDiff) / 1000);
      return {
        allowed: false,
        remainingSeconds
      };
    }
  }

  return { allowed: true };
}

/**
 * レート制限を記録
 */
async function recordRateLimit(env, ipHash) {
  const rateLimitKey = `rate_limit:${ipHash}`;
  const now = Date.now().toString();
  // TTL: 5分 = 300秒
  await env.RATE_LIMIT.put(rateLimitKey, now, { expirationTtl: 300 });
}

/**
 * POST /api/reviews - 口コミ投稿
 */
export async function postReview(request, env) {
  try {
    // リクエストボディ取得
    const body = await request.json();
    const { liver_id, rating, comment } = body;

    // バリデーション
    if (!liver_id || typeof liver_id !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'liver_id is required and must be a string'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return new Response(JSON.stringify({
        success: false,
        error: 'rating is required and must be an integer between 1 and 5'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!comment || typeof comment !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'comment is required and must be a string'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // コメント長さ制限（1000文字）
    if (comment.length > 1000) {
      return new Response(JSON.stringify({
        success: false,
        error: 'comment must be less than 1000 characters'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // IPアドレス取得
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     'unknown';
    const ipHash = await hashIP(clientIP);

    // レート制限チェック
    const rateLimitCheck = await checkRateLimit(env, ipHash);
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.remainingSeconds} seconds before submitting again.`,
        remainingSeconds: rateLimitCheck.remainingSeconds
      }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    // D1に挿入
    const now = Date.now();
    const result = await env.REVIEWS_DB.prepare(
      'INSERT INTO reviews (liver_id, rating, comment, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(liver_id, rating, comment, now, ipHash).run();

    if (!result.success) {
      throw new Error('Database insertion failed');
    }

    // レート制限記録
    await recordRateLimit(env, ipHash);

    return new Response(JSON.stringify({
      success: true,
      review_id: result.meta.last_row_id,
      message: 'Review submitted successfully'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error posting review:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/reviews/:liverId - 口コミ一覧取得
 */
export async function getReviews(liverId, env) {
  try {
    if (!liverId || typeof liverId !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'liver_id is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 評価高い順、同評価なら新しい順
    const result = await env.REVIEWS_DB.prepare(
      'SELECT id, rating, comment, created_at FROM reviews WHERE liver_id = ? ORDER BY rating DESC, created_at DESC'
    ).bind(liverId).all();

    return new Response(JSON.stringify({
      success: true,
      liver_id: liverId,
      reviews: result.results,
      total: result.results.length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error getting reviews:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/reviews/stats/:liverId - 平均評価取得
 */
export async function getReviewStats(liverId, env) {
  try {
    if (!liverId || typeof liverId !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'liver_id is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await env.REVIEWS_DB.prepare(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE liver_id = ?'
    ).bind(liverId).first();

    return new Response(JSON.stringify({
      success: true,
      liver_id: liverId,
      average_rating: result.avg_rating ? parseFloat(result.avg_rating.toFixed(2)) : 0,
      review_count: result.review_count || 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error getting review stats:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * DELETE /api/reviews/:reviewId - 口コミ削除（管理用）
 */
export async function deleteReview(reviewId, request, env) {
  try {
    // 管理者認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const token = authHeader.substring(7); // "Bearer " を除去
    const adminSecret = env.ADMIN_SECRET;

    if (!adminSecret || token !== adminSecret) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // reviewId検証
    const reviewIdNum = parseInt(reviewId);
    if (isNaN(reviewIdNum)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid review_id'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 削除実行
    const result = await env.REVIEWS_DB.prepare(
      'DELETE FROM reviews WHERE id = ?'
    ).bind(reviewIdNum).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Review not found'
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Review deleted successfully'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error deleting review:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}