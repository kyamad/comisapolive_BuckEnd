// Worker3: liver-scraper-images (画像収集専門)
// 役割: 画像取得専門 - Subrequest制限対応版
// Cronスケジュール: "0 2,8,14,20 * * *" (詳細完了の1-2時間後)

// 段階的画像処理クラス
import { ProgressiveImageProcessor } from './progressive-image-processor.js';

export default {
  async scheduled(event, env, ctx) {
    console.log('🖼️ Starting images scraper (Worker3)...');
    
    try {
      const { livers, dataSource } = await loadLiversFromStorage(env);
      console.log(`📦 Loaded ${livers.length} livers for image processing (source: ${dataSource})`);

      if (livers.length === 0) {
        console.log('ℹ️ No livers to process for images');
        return;
      }
      
      // 段階的画像処理を開始
      const imageProcessor = new ProgressiveImageProcessor(env);
      const result = await imageProcessor.processImagesBatch(livers);
      
      // 進捗状況を更新
      const status = result.isCompleted ? 'completed' : 'in_progress';
      await updateWorkerStatus(env, 'images', status, {
        processed: result.totalProgress,
        total: result.totalItems,
        batchProcessed: result.batchProcessed,
        batchSuccessful: result.batchSuccessful,
        nextBatchIndex: result.nextBatchIndex,
        timestamp: Date.now()
      });
      
      if (result.isCompleted) {
        console.log(`🎉 All images processed! Total: ${result.totalProgress}/${result.totalItems}`);
      } else {
        console.log(`🔄 Partial processing: ${result.totalProgress}/${result.totalItems}, next batch starts at ${result.nextBatchIndex}`);
      }
      
    } catch (error) {
      console.error('❌ Images scraper failed:', error);
      await updateWorkerStatus(env, 'images', 'error', { error: error.message });
      
      if (env.LIVER_DATA) {
        await env.LIVER_DATA.put('image_worker_error', JSON.stringify({
          timestamp: Date.now(),
          error: error.message,
          stack: error.stack
        }));
      }
    }
  }

  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    const expectedToken = env.WORKER_AUTH_TOKEN || 'default-token';
    if (authHeader !== `Bearer ${expectedToken}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // バッチ画像処理開始エンドポイント
    if (url.pathname === '/start-batch') {
      try {
        const { livers, dataSource } = await loadLiversFromStorage(env);
        console.log(`📦 Loaded ${livers.length} livers for manual image batch (source: ${dataSource})`);

        if (livers.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No data available for image processing'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const batchSize = parseInt(url.searchParams.get('batch')) || 10;

        // 段階的画像処理を実行
        const imageProcessor = new ProgressiveImageProcessor(env);
        const result = await imageProcessor.processImagesBatch(livers);

        return new Response(JSON.stringify({
          success: true,
          message: `Processed batch for ${livers.length} livers`,
          total: result.totalItems,
          processed: result.totalProgress,
          batchProcessed: result.batchProcessed,
          batchSuccessful: result.batchSuccessful,
          isCompleted: result.isCompleted,
          dataSource: dataSource
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // fix-images-progressive エンドポイント
    if (url.pathname === '/fix-images-progressive') {
      const batchSize = parseInt(url.searchParams.get('batch')) || 10;
      
      try {
        const detailedDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_detailed_data') : null;
        if (!detailedDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No detailed data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const detailedData = JSON.parse(detailedDataStr);
        const livers = detailedData.data || [];
        
        const result = await processImagesBatch(env, livers, batchSize);
        
        return new Response(JSON.stringify({
          success: true,
          processed: result.processed,
          errors: result.errors,
          total: livers.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 画像状況確認エンドポイント
    if (url.pathname === '/image-status') {
      try {
        // 最新の統計を直接計算
        const response = await fetch('https://liver-scraper-main.pwaserve8.workers.dev/api/livers');
        let currentStats = { error: 'API failed' };
        
        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success && apiData.data) {
            const livers = apiData.data;
            const imageProcessor = new ProgressiveImageProcessor(env);
            const progress = await imageProcessor.getProgress();
            
            currentStats = {
              dataSource: 'main_api',
              totalLivers: livers.length,
              liversWithDetails: livers.filter(liver => liver.hasDetails).length,
              liversWithActualImages: livers.filter(liver => 
                liver.actualImageUrl && !liver.actualImageUrl.includes('noimage.png')
              ).length,
              savedImagesCount: progress ? progress.processed : 0,
              imageProcessingStatus: progress ? progress.status : 'unknown',
              lastUpdate: new Date().toISOString(),
              note: 'Updated statistics reflecting current API data (76 livers total)'
            };
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          stats: currentStats
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 進捗確認エンドポイント
    if (url.pathname === '/progress') {
      try {
        const status = await env.LIVER_DATA.get('worker_status_images');
        return new Response(JSON.stringify({
          success: true,
          status: status ? JSON.parse(status) : null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // 進捗リセットエンドポイント
    if (url.pathname === '/reset-progress') {
      try {
        const imageProcessor = new ProgressiveImageProcessor(env);
        await imageProcessor.resetProgress();
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Progress reset successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// 画像をバッチ処理で取得（ProgressiveImageProcessor使用）
async function processImagesBatch(env, livers, batchSize = 8) {
  console.log(`🖼️ Starting batch image processing: ${livers.length} livers, batch size: ${batchSize}`);
  console.log('✅ Using ProgressiveImageProcessor for subrequest optimization');
  
  // ProgressiveImageProcessorを使用
  const processor = new ProgressiveImageProcessor(env);
  
  try {
    const result = await processor.processImagesBatch(livers);
    
    // 結果をWorkerステータスとして保存
    await updateWorkerStatus(env, 'images', result.isCompleted ? 'completed' : 'in_progress', {
      total: result.totalItems,
      processed: result.totalProgress,
      batchProcessed: result.batchProcessed,
      batchSuccessful: result.batchSuccessful,
      currentIndex: result.nextBatchIndex,
      isCompleted: result.isCompleted,
      completedAt: result.isCompleted ? new Date().toISOString() : null,
      note: 'Using ProgressiveImageProcessor with subrequest optimization'
    });
    
    console.log(`✅ Batch completed: ${result.batchSuccessful}/${result.batchProcessed} successful`);
    console.log(`📊 Overall progress: ${result.totalProgress}/${result.totalItems}`);
    
    return {
      processed: result.batchProcessed,
      successful: result.batchSuccessful,
      errors: result.batchProcessed - result.batchSuccessful,
      total: result.totalItems,
      progress: result.totalProgress,
      isCompleted: result.isCompleted
    };
    
  } catch (error) {
    console.error('❌ ProgressiveImageProcessor failed:', error);
    
    await updateWorkerStatus(env, 'images', 'error', {
      error: error.message,
      timestamp: Date.now(),
      note: 'ProgressiveImageProcessor error'
    });
    
    throw error;
  }
}

// KV から最新のライバーデータを読み込む
async function loadLiversFromStorage(env) {
  if (!env.LIVER_DATA) {
    console.log('⚠️ LIVER_DATA binding not available');
    return { livers: [], dataSource: 'no_kv' };
  }

  const candidateKeys = [
    { key: 'liver_data_current', label: 'unified_current' },
    { key: 'liver_data_backup', label: 'unified_backup' },
    { key: 'latest_integrated_data', label: 'integrated' },
    { key: 'latest_integrated_data_primary', label: 'integrated_primary' },
    { key: 'latest_integrated_data_secondary', label: 'integrated_secondary' },
    { key: 'latest_integrated_data_tertiary', label: 'integrated_tertiary' },
    { key: 'latest_data', label: 'latest' },
    { key: 'latest_detailed_data', label: 'detailed' },
    { key: 'latest_basic_data', label: 'basic' }
  ];

  for (const candidate of candidateKeys) {
    try {
      const dataStr = await env.LIVER_DATA.get(candidate.key);
      if (!dataStr) {
        continue;
      }

      const parsed = JSON.parse(dataStr);
      const livers = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];

      if (livers.length > 0) {
        console.log(`✅ Loaded ${livers.length} livers from ${candidate.label}`);
        return { livers, dataSource: candidate.label };
      }
    } catch (error) {
      console.log(`⚠️ Failed to read ${candidate.key}: ${error.message}`);
    }
  }

  return { livers: [], dataSource: 'none' };
}

// 画像統計情報を取得
async function getImageStats(env) {
  if (!env.LIVER_DATA) {
    return { error: 'LIVER_DATA not available' };
  }
  
  try {
    // 現在の画像処理状況を取得
    const imageProcessor = new ProgressiveImageProcessor(env);
    const progress = await imageProcessor.getProgress();
    
    // 最新データを取得（APIと同じロジック）
    let livers = [];
    let dataSource = 'none';
    
    try {
      // メインAPIからデータ取得
      const response = await fetch('https://liver-scraper-main.pwaserve8.workers.dev/api/livers');
      if (response.ok) {
        const apiData = await response.json();
        if (apiData.success && apiData.data) {
          livers = apiData.data;
          dataSource = 'main_api';
        }
      }
    } catch (fetchError) {
      // APIが失敗した場合はKVデータにフォールバック
      const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
      if (basicDataStr) {
        const basicData = JSON.parse(basicDataStr);
        if (basicData && basicData.data) {
          livers = basicData.data;
          dataSource = 'basic_kv';
        }
      }
      
      // それでも失敗した場合は詳細データを使用
      if (livers.length === 0) {
        const detailedDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_detailed_data') : null;
        if (detailedDataStr) {
          const detailedData = JSON.parse(detailedDataStr);
          livers = detailedData.data || [];
          dataSource = 'detailed_kv';
        }
      }
    }
    
    // R2に実際に保存されている画像の数をカウント
    let savedImagesCount = 0;
    try {
      if (env.IMAGES) {
        // 簡単な推定：progress情報から推定
        savedImagesCount = progress ? progress.processed : 0;
      }
    } catch (r2Error) {
      console.log('R2 access failed for count:', r2Error.message);
    }
    
    const stats = {
      currentProcessing: progress,
      dataSource: dataSource,
      totalLivers: livers.length,
      liversWithActualImages: livers.filter(liver => 
        liver.actualImageUrl && !liver.actualImageUrl.includes('noimage.png')
      ).length,
      liversWithProfileImages: livers.filter(liver => 
        liver.profileImages && liver.profileImages.length > 0
      ).length,
      savedImagesCount: savedImagesCount,
      liversWithDetails: livers.filter(liver => liver.hasDetails).length,
      lastUpdate: new Date().toISOString()
    };
    
    return stats;
  } catch (error) {
    return { error: error.message };
  }
}

// 注意: これらの関数はProgressiveImageProcessorで置き換えられました
// 互換性のため残していますが、実際の処理は上記のprocessImagesBatchで行われます

// 旧関数（非推奨 - ProgressiveImageProcessorを使用してください）
async function saveImageIfChanged(env, liverId, imageUrl) {
  console.log(`⚠️ Deprecated function called. Use ProgressiveImageProcessor instead.`);
  return { saved: false, reason: 'Function deprecated, use ProgressiveImageProcessor' };
}

async function checkImageExists(env, liverId) {
  console.log(`⚠️ Deprecated function called. Use ProgressiveImageProcessor instead.`);
  return { exists: false, reason: 'Function deprecated, use ProgressiveImageProcessor' };
}

async function saveImagePersistently(env, liverId, imageBuffer, contentType) {
  console.log(`⚠️ Deprecated function called. Use ProgressiveImageProcessor instead.`);
  return { saved: false, reason: 'Function deprecated, use ProgressiveImageProcessor' };
}

// 旧画像自動収集（非推奨）
async function autoCollectAndStoreImage(liver, env) {
  console.log(`⚠️ Deprecated function called. Use ProgressiveImageProcessor instead.`);
  return { collected: false, reason: 'Function deprecated, use ProgressiveImageProcessor' };
}

// === ユーティリティ関数 ===

async function updateWorkerStatus(env, workerName, status, data = {}) {
  if (!env.LIVER_DATA) return;
  
  try {
    await env.LIVER_DATA.put(`worker_status_${workerName}`, JSON.stringify({
      status: status,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      ...data
    }));
  } catch (error) {
    console.error(`Failed to update status for ${workerName}:`, error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
