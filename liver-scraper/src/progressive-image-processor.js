// Progressive Image Processing - Subrequest制限対応版
// 段階的に画像を安全に処理するロジック

export class ProgressiveImageProcessor {
  constructor(env) {
    this.env = env;
    this.SAFE_BATCH_SIZE = 8; // 1回の実行で8件まで（安全マージン）
    this.MAX_SUBREQUESTS = 40; // Cloudflareの制限50の80%
    this.PROCESSING_KEY = 'image_processing_progress';
  }

  /**
   * 画像処理の進捗を取得
   */
  async getProgress() {
    if (!this.env.LIVER_DATA) return null;
    
    try {
      const progress = await this.env.LIVER_DATA.get(this.PROCESSING_KEY);
      return progress ? JSON.parse(progress) : {
        totalItems: 0,
        processed: 0,
        currentIndex: 0,
        lastUpdate: null,
        status: 'idle'
      };
    } catch (error) {
      console.error('Failed to get progress:', error);
      return null;
    }
  }

  /**
   * 進捗を保存
   */
  async saveProgress(progress) {
    if (!this.env.LIVER_DATA) return false;

    try {
      await this.env.LIVER_DATA.put(this.PROCESSING_KEY, JSON.stringify({
        ...progress,
        lastUpdate: new Date().toISOString()
      }));
      return true;
    } catch (error) {
      console.error('Failed to save progress:', error);
      return false;
    }
  }

  /**
   * 安全な画像処理の開始
   */
  async processImagesBatch(livers) {
    console.log(`🖼️ Starting progressive image processing for ${livers.length} livers`);
    
    const progress = await this.getProgress();
    
    // 新しい処理の開始
    if (progress.status === 'idle' || progress.totalItems !== livers.length) {
      console.log('🆕 Starting new progressive processing cycle');
      await this.saveProgress({
        totalItems: livers.length,
        processed: 0,
        currentIndex: 0,
        status: 'in_progress',
        errors: []
      });
      progress.totalItems = livers.length;
      progress.processed = 0;
      progress.currentIndex = 0;
      progress.status = 'in_progress';
      progress.errors = [];
    }

    // 現在のバッチを処理
    const endIndex = Math.min(
      progress.currentIndex + this.SAFE_BATCH_SIZE, 
      livers.length
    );
    
    const currentBatch = livers.slice(progress.currentIndex, endIndex);
    console.log(`📦 Processing batch: ${progress.currentIndex + 1}-${endIndex} of ${livers.length}`);

    const results = await this.processBatchSafely(currentBatch);

    // 進捗更新
    const newProgress = {
      ...progress,
      processed: progress.processed + results.successful,
      currentIndex: endIndex,
      status: endIndex >= livers.length ? 'completed' : 'in_progress',
      errors: [...(progress.errors || []), ...results.errors]
    };

    await this.saveProgress(newProgress);

    console.log(`✅ Batch completed: ${results.successful}/${currentBatch.length} successful`);
    console.log(`📊 Overall progress: ${newProgress.processed}/${newProgress.totalItems}`);

    return {
      batchProcessed: currentBatch.length,
      batchSuccessful: results.successful,
      totalProgress: newProgress.processed,
      totalItems: newProgress.totalItems,
      isCompleted: newProgress.status === 'completed',
      nextBatchIndex: newProgress.currentIndex
    };
  }

  /**
   * バッチを安全に処理
   */
  async processBatchSafely(batch) {
    let successful = 0;
    let errors = [];
    let subrequestCount = 0;

    for (const liver of batch) {
      // subrequest制限チェック
      if (subrequestCount >= this.MAX_SUBREQUESTS - 5) {
        console.log(`⚠️ Approaching subrequest limit, stopping batch early`);
        break;
      }

      try {
        // 各ライバーの画像を処理 - 複数ソースから画像URLを取得
        console.log(`🔍 ${liver.name}: imageUrl = ${liver.imageUrl}`);
        
        let originalImageUrl = null;
        
        // 方法1: actualImageUrlを使用（基本データから抽出した実際の画像URL）
        if (liver.actualImageUrl && !liver.actualImageUrl.includes('noimage.png') && !liver.actualImageUrl.includes('/assets/images/shared/')) {
          originalImageUrl = liver.actualImageUrl.startsWith('http') 
            ? liver.actualImageUrl 
            : `https://www.comisapolive.com${liver.actualImageUrl}`;
          console.log(`📋 ${liver.name}: Using actualImageUrl: ${originalImageUrl}`);
        }
        // 方法2: imageUrlをフォールバック（API用URL以外）
        else if (liver.imageUrl && !liver.imageUrl.includes('noimage.png') && !liver.imageUrl.includes('/assets/images/shared/') && !liver.imageUrl.includes('/api/images/')) {
          originalImageUrl = liver.imageUrl.startsWith('http') 
            ? liver.imageUrl 
            : `https://www.comisapolive.com${liver.imageUrl}`;
          console.log(`📋 ${liver.name}: Using imageUrl: ${originalImageUrl}`);
        }
        // 方法3: profileImagesのoriginalUrlを使用（詳細データから）
        else if (liver.profileImages?.[0]?.originalUrl) {
          originalImageUrl = liver.profileImages[0].originalUrl;
          console.log(`📋 ${liver.name}: Using profileImages.originalUrl: ${originalImageUrl}`);
        }
        // 方法4: 詳細データ待ち
        else if (liver.originalId) {
          console.log(`⏳ ${liver.name}: No actualImageUrl available, waiting for detailed data processing`);
        }
        
        if (originalImageUrl) {
          console.log(`🖼️ ${liver.name}: Processing image ${originalImageUrl}`);
          const result = await this.processLiverImage(liver, originalImageUrl);
          if (result.success) {
            successful++;
            console.log(`✅ ${liver.name}: Image processed successfully`);
          } else {
            console.log(`⚠️ ${liver.name}: Image processing failed - ${result.error}`);
          }
          subrequestCount += result.subrequests || 1;
        } else {
          console.log(`ℹ️ ${liver.name}: No usable image URL found. ID: ${liver.id}, originalId: ${liver.originalId}`);
        }

        // バッチ内での間隔制御
        if (batch.indexOf(liver) < batch.length - 1) {
          await this.sleep(200); // 200ms間隔
        }

      } catch (error) {
        errors.push({
          liverId: liver.originalId || liver.id,
          liverName: liver.name,
          error: error.message,
          imageUrl: originalImageUrl,
          timestamp: Date.now()
        });
        console.error(`❌ ${liver.name} (${liver.originalId}): Processing error - ${error.message}`);
        console.error(`   Image URL: ${originalImageUrl}`);
      }
    }

    console.log(`📊 Batch summary: ${successful}/${batch.length} successful, ${subrequestCount} subrequests used`);
    return { successful, errors, subrequestCount };
  }

  /**
   * 個別ライバーの画像処理
   */
  async processLiverImage(liver, imageUrl = null) {
    try {
      // 画像URLの決定 - 引数で渡されたものを優先、なければ従来通り
      const sourceImageUrl = imageUrl || liver.imageUrl;
      if (!sourceImageUrl) {
        return { success: false, error: 'No image URL provided', subrequests: 0 };
      }

      // 画像URLの正規化
      const fullImageUrl = sourceImageUrl.startsWith('http') 
        ? sourceImageUrl 
        : `https://www.comisapolive.com${sourceImageUrl}`;

      // 既存画像チェック（subrequest 1回） - originalIdを使用
      const imageId = liver.originalId || liver.id;
      const exists = await this.checkImageExists(imageId);
      if (exists) {
        return { success: true, cached: true, subrequests: 1 };
      }

      // 画像取得（subrequest 1回）
      const response = await fetch(fullImageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${fullImageUrl}`);
      }

      const imageBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // R2への保存（subrequest 1回） - originalIdを使用
      const saved = await this.saveImageToR2(imageId, imageBuffer, contentType);
      
      return { 
        success: saved, 
        subrequests: 3, // exists check + fetch + R2 save
        size: imageBuffer.byteLength,
        url: fullImageUrl
      };

    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        subrequests: 1
      };
    }
  }

  /**
   * 画像の存在チェック
   */
  async checkImageExists(liverId) {
    if (!this.env.IMAGES) return false;

    try {
      const object = await this.env.IMAGES.head(`${liverId}.jpg`);
      return !!object;
    } catch (error) {
      return false;
    }
  }

  /**
   * R2への画像保存
   */
  async saveImageToR2(liverId, imageBuffer, contentType) {
    if (!this.env.IMAGES) return false;

    try {
      await this.env.IMAGES.put(`${liverId}.jpg`, imageBuffer, {
        httpMetadata: { contentType },
        customMetadata: { 
          originalContentType: contentType,
          uploadedAt: new Date().toISOString()
        }
      });
      return true;
    } catch (error) {
      console.error(`Failed to save image for ${liverId}:`, error);
      return false;
    }
  }

  /**
   * 処理が完了しているかチェック
   */
  async isProcessingCompleted() {
    const progress = await this.getProgress();
    return progress && progress.status === 'completed';
  }

  /**
   * 進捗のリセット
   */
  async resetProgress() {
    await this.saveProgress({
      totalItems: 0,
      processed: 0,
      currentIndex: 0,
      status: 'idle',
      errors: []
    });
    console.log('🔄 Progress reset');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}