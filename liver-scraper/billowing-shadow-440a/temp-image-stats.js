// 修正された統計表示機能
import { ProgressiveImageProcessor } from './progressive-image-processor.js';

export async function getUpdatedImageStats(env) {
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