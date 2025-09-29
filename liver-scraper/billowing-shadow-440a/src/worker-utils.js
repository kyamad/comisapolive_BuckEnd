// Worker間通信とユーティリティ関数
// 3つのWorkerで共有される共通機能

/**
 * Worker間のHTTP通信を管理するクラス
 */
export class WorkerCommunication {
  constructor(env) {
    this.env = env;
    this.authToken = env.WORKER_AUTH_TOKEN || 'default-token';
  }

  /**
   * 他のWorkerにHTTPリクエストを送信
   */
  async callWorker(workerUrl, endpoint, options = {}) {
    const url = `${workerUrl}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
        ...options.headers
      },
      ...options
    };

    try {
      console.log(`🔄 Calling worker: ${url}`);
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        throw new Error(`Worker call failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Worker call successful: ${url}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Worker call failed: ${url}`, error.message);
      throw error;
    }
  }

  /**
   * Worker2（詳細取得）をトリガー
   */
  async triggerDetailWorker() {
    const detailWorkerUrl = this.env.DETAIL_WORKER_URL;
    if (!detailWorkerUrl) {
      throw new Error('DETAIL_WORKER_URL not configured');
    }

    return await this.callWorker(detailWorkerUrl, '/start-batch', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'main-worker',
        timestamp: Date.now()
      })
    });
  }

  /**
   * Worker3（画像取得）をトリガー
   */
  async triggerImageWorker() {
    const imageWorkerUrl = this.env.IMAGE_WORKER_URL;
    if (!imageWorkerUrl) {
      console.log('⚠️ IMAGE_WORKER_URL not configured, skipping image trigger');
      return { skipped: true, reason: 'URL not configured' };
    }

    return await this.callWorker(imageWorkerUrl, '/start-batch', {
      method: 'POST',
      body: JSON.stringify({
        trigger: 'detail-worker',
        timestamp: Date.now()
      })
    });
  }

  /**
   * 詳細取得の進捗を確認
   */
  async checkDetailProgress() {
    const detailWorkerUrl = this.env.DETAIL_WORKER_URL;
    if (!detailWorkerUrl) return null;

    return await this.callWorker(detailWorkerUrl, '/progress');
  }

  /**
   * 画像処理の進捗を確認
   */
  async checkImageProgress() {
    const imageWorkerUrl = this.env.IMAGE_WORKER_URL;
    if (!imageWorkerUrl) return null;

    return await this.callWorker(imageWorkerUrl, '/progress');
  }
}

/**
 * Worker間の状態管理クラス
 */
export class WorkerStatusManager {
  constructor(env) {
    this.env = env;
  }

  /**
   * Workerのステータスを更新
   */
  async updateStatus(workerName, status, data = {}) {
    if (!this.env.LIVER_DATA) return;

    try {
      const statusData = {
        status: status,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        ...data
      };

      await this.env.LIVER_DATA.put(`worker_status_${workerName}`, JSON.stringify(statusData));
      console.log(`📊 Status updated for ${workerName}: ${status}`);
    } catch (error) {
      console.error(`Failed to update status for ${workerName}:`, error.message);
    }
  }

  /**
   * 全Workerのステータスを取得
   */
  async getAllStatus() {
    if (!this.env.LIVER_DATA) {
      return { error: 'LIVER_DATA not available' };
    }

    try {
      const [mainStatus, detailStatus, imageStatus] = await Promise.all([
        this.env.LIVER_DATA.get('worker_status_main'),
        this.env.LIVER_DATA.get('worker_status_details'),
        this.env.LIVER_DATA.get('worker_status_images')
      ]);

      return {
        main: mainStatus ? JSON.parse(mainStatus) : null,
        details: detailStatus ? JSON.parse(detailStatus) : null,
        images: imageStatus ? JSON.parse(imageStatus) : null,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 特定Workerのステータスを取得
   */
  async getWorkerStatus(workerName) {
    if (!this.env.LIVER_DATA) return null;

    try {
      const status = await this.env.LIVER_DATA.get(`worker_status_${workerName}`);
      return status ? JSON.parse(status) : null;
    } catch (error) {
      console.error(`Failed to get status for ${workerName}:`, error.message);
      return null;
    }
  }

  /**
   * エラー状態のWorkerをチェック
   */
  async checkErrorWorkers() {
    const allStatus = await this.getAllStatus();
    const errorWorkers = [];

    Object.entries(allStatus).forEach(([workerName, status]) => {
      if (status && status.status === 'error') {
        errorWorkers.push({
          worker: workerName,
          error: status.error,
          timestamp: status.timestamp
        });
      }
    });

    return errorWorkers;
  }
}

/**
 * データ管理ユーティリティクラス
 */
export class DataManager {
  constructor(env) {
    this.env = env;
  }

  /**
   * 基本データを取得
   */
  async getBasicData() {
    if (!this.env.LIVER_DATA) return null;

    try {
      const data = await this.env.LIVER_DATA.get('latest_basic_data');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get basic data:', error.message);
      return null;
    }
  }

  /**
   * 詳細データを取得
   */
  async getDetailedData() {
    if (!this.env.LIVER_DATA) return null;

    try {
      const data = await this.env.LIVER_DATA.get('latest_detailed_data');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get detailed data:', error.message);
      return null;
    }
  }

  /**
   * 基本データを保存
   */
  async saveBasicData(livers) {
    if (!this.env.LIVER_DATA) return false;

    try {
      const data = {
        timestamp: Date.now(),
        total: livers.length,
        data: livers,
        lastUpdate: new Date().toISOString()
      };

      await this.env.LIVER_DATA.put('latest_basic_data', JSON.stringify(data));
      console.log(`💾 Saved basic data: ${livers.length} livers`);
      return true;
    } catch (error) {
      console.error('Failed to save basic data:', error.message);
      return false;
    }
  }

  /**
   * 詳細データを保存
   */
  async saveDetailedData(livers, processed = 0, errors = 0) {
    if (!this.env.LIVER_DATA) return false;

    try {
      const data = {
        timestamp: Date.now(),
        total: livers.length,
        data: livers,
        lastUpdate: new Date().toISOString(),
        processed: processed,
        errors: errors
      };

      await this.env.LIVER_DATA.put('latest_detailed_data', JSON.stringify(data));
      console.log(`💾 Saved detailed data: ${livers.length} livers`);
      return true;
    } catch (error) {
      console.error('Failed to save detailed data:', error.message);
      return false;
    }
  }

  /**
   * データの変更を検出
   */
  async hasDataChanged(newData, dataType = 'basic') {
    const keyName = dataType === 'basic' ? 'latest_basic_data' : 'latest_detailed_data';
    
    try {
      const lastDataStr = this.env.LIVER_DATA ? await this.env.LIVER_DATA.get(keyName) : null;
      const lastData = lastDataStr ? JSON.parse(lastDataStr) : null;
      
      const currentHash = this.generateHash(JSON.stringify(newData));
      const lastHash = lastData ? this.generateHash(JSON.stringify(lastData.data)) : null;
      
      return currentHash !== lastHash;
    } catch (error) {
      console.error('Failed to check data changes:', error.message);
      return true; // エラー時は変更ありとして処理
    }
  }

  /**
   * データのハッシュを生成
   */
  generateHash(data) {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }
}

/**
 * 共通のエラーハンドリングクラス
 */
export class ErrorHandler {
  constructor(env, workerName) {
    this.env = env;
    this.workerName = workerName;
  }

  /**
   * エラーを記録
   */
  async logError(error, context = '') {
    const errorData = {
      timestamp: Date.now(),
      worker: this.workerName,
      error: error.message,
      stack: error.stack,
      context: context,
      lastUpdate: new Date().toISOString()
    };

    try {
      if (this.env.LIVER_DATA) {
        await this.env.LIVER_DATA.put(`${this.workerName}_worker_error`, JSON.stringify(errorData));
      }
      console.error(`❌ ${this.workerName} error:`, error.message);
    } catch (logError) {
      console.error('Failed to log error:', logError.message);
    }
  }

  /**
   * エラー統計を取得
   */
  async getErrorStats() {
    if (!this.env.LIVER_DATA) return null;

    try {
      const errorData = await this.env.LIVER_DATA.get(`${this.workerName}_worker_error`);
      return errorData ? JSON.parse(errorData) : null;
    } catch (error) {
      console.error('Failed to get error stats:', error.message);
      return null;
    }
  }
}

/**
 * レート制限とリトライ機能
 */
export class RateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequestsPerSecond = 10;
  }

  /**
   * レート制限チェック
   */
  async checkRateLimit() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 1000);

    if (this.requests.length >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.requests[0]);
      console.log(`⏱️ Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.requests.push(now);
  }

  /**
   * リトライ機能付きリクエスト実行
   */
  async executeWithRetry(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();
        return await fn();
      } catch (error) {
        console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏱️ Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * CORS設定のユーティリティ
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 認証チェックのユーティリティ
 */
export function checkAuthentication(request, env) {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = env.WORKER_AUTH_TOKEN || 'default-token';
  
  if (authHeader !== `Bearer ${expectedToken}`) {
    return false;
  }
  
  return true;
}

/**
 * レスポンス作成のユーティリティ
 */
export function createResponse(data, options = {}) {
  const { status = 200, headers = {} } = options;
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

/**
 * エラーレスポンス作成のユーティリティ
 */
export function createErrorResponse(error, status = 500) {
  return createResponse({
    success: false,
    error: error.message || error
  }, { status });
}