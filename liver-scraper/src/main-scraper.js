import { postReview, getReviews, getReviewStats, deleteReview } from './reviews-api.js';

// Worker1: liver-scraper-main (メイン制御)
// 役割: 基本データ取得 + 他Workerの制御
// Cronスケジュール: "0 0,6,12,18 * * *" (6時間ごと)

export default {
  async scheduled(event, env, ctx) {
    console.log('🚀 EMERGENCY_MAIN_WORKER_V8_CACHE_CLEAR_V3.0_' + Date.now());
    console.log('=== ULTIMATE_FORCE_CACHE_INVALIDATION ===');
    console.log('🔥 MAIN_V8_ISOLATE_EMERGENCY_RESTART_REQUIRED');
    console.log('🚀 MAIN_WORKER_HYBRID_V2.1_DEPLOYED_' + Date.now());
    console.log('=== MULTI-KEY DETECTION ENABLED ===');
    console.log('🚀 Starting main scraper (Worker1)...');
    
    try {
      // 基本データの取得（詳細なし）
      const basicLiverData = await scrapeBasicDataOnly(env);
      
      // 前回データと比較
      const lastDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
      const lastData = lastDataStr ? JSON.parse(lastDataStr) : null;
      
      // 変更があった場合のみ保存
      const currentHash = generateHash(JSON.stringify(basicLiverData));
      const lastHash = lastData ? generateHash(JSON.stringify(lastData.data)) : null;

      console.log(`🔍 Change detection: current=${currentHash}, last=${lastHash || 'none'}`);
      console.log(`📊 Current basic data count: ${basicLiverData.length}`);
      console.log(`📊 Last basic data count: ${lastData ? lastData.total : 0}`);

      if (currentHash !== lastHash) {
        console.log('🔄 Changes detected in basic data - starting integration process...');
        if (env.LIVER_DATA) {
          try {
            await env.LIVER_DATA.put('latest_basic_data', JSON.stringify({
              timestamp: Date.now(),
              total: basicLiverData.length,
              data: basicLiverData,
              lastUpdate: new Date().toISOString()
            }));
            console.log(`✅ Updated basic data: ${basicLiverData.length} livers`);
            
            // Verify the write was successful (with delay for KV consistency)
            await sleep(2000); // Wait 2 seconds for KV consistency
            const verification = await env.LIVER_DATA.get('latest_basic_data');
            if (verification) {
              const parsed = JSON.parse(verification);
              console.log(`✅ KV write verified: ${parsed.total} records in storage`);
            } else {
              console.error(`❌ KV write failed: data not found after write`);
              throw new Error('KV write verification failed');
            }
          } catch (error) {
            console.error(`❌ KV write error: ${error.message}`);
            throw error;
          }
        }
        
        // 既存の詳細データを保護しながら統合
        console.log('🛡️ Starting protected integration with existing details...');
        await integrateWithExistingDetails(env, basicLiverData);
        console.log('✅ Protected integration completed');

        // Worker2 (詳細取得) をトリガー
        await triggerDetailWorker(env);
        
      } else {
        console.log('ℹ️ No changes in basic data detected');
      }
      
      // 進捗状況を更新
      await updateWorkerStatus(env, 'main', 'completed', {
        total: basicLiverData.length,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Main scraper failed:', error);
      await updateWorkerStatus(env, 'main', 'error', { error: error.message });
      
      if (env.LIVER_DATA) {
        await env.LIVER_DATA.put('main_worker_error', JSON.stringify({
          timestamp: Date.now(),
          error: error.message,
          stack: error.stack
        }));
      }
    }
  },

  async fetch(request, env) {
    console.log('🚀 EMERGENCY_MAIN_WORKER_V8_CACHE_CLEAR_V3.0_' + Date.now());
    console.log('🔥 MAIN_FETCH_HANDLER_CACHE_BREAK_' + Math.random());

    const url = new URL(request.url);

    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // manual-scrape エンドポイント（Worker分散処理対応版）
    if (url.pathname === '/manual-scrape') {
      try {
        console.log('🚀 Manual scraping triggered (Worker分散処理)...');
        
        // 基本データのみを取得（詳細はWorker2に委譲）
        const basicLiverData = await scrapeBasicDataOnly(env);
        
        // 前回データと比較
        const lastDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        const lastData = lastDataStr ? JSON.parse(lastDataStr) : null;
        
        // 変更があった場合のみ保存
        const currentHash = generateHash(JSON.stringify(basicLiverData));
        const lastHash = lastData ? generateHash(JSON.stringify(lastData.data)) : null;
        
        let updated = false;
        if (currentHash !== lastHash) {
          if (env.LIVER_DATA) {
            console.log(`💾 Saving basic data...`);
            try {
              await env.LIVER_DATA.put('latest_basic_data', JSON.stringify({
                timestamp: Date.now(),
                total: basicLiverData.length,
                data: basicLiverData,
                lastUpdate: new Date().toISOString()
              }));
              console.log(`✅ Updated basic data: ${basicLiverData.length} livers`);
              
              // Verify the write was successful (with delay for KV consistency)
              await sleep(2000); // Wait 2 seconds for KV consistency
              const verification = await env.LIVER_DATA.get('latest_basic_data');
              if (verification) {
                const parsed = JSON.parse(verification);
                console.log(`✅ KV write verified: ${parsed.total} records in storage`);
              } else {
                console.error(`❌ KV write failed: data not found after write`);
                throw new Error('KV write verification failed');
              }
            } catch (error) {
              console.error(`❌ KV write error: ${error.message}`);
              throw error;
            }
            updated = true;

            // 既存の詳細データを保護しながら統合
            await integrateWithExistingDetails(env, basicLiverData);

            // Worker2（詳細取得）をトリガー
            console.log('🔗 Triggering details worker...');
            await triggerDetailWorker(env);
          }
        } else {
          console.log('ℹ️ No changes detected, skipping update');
        }
        
        return new Response(JSON.stringify({
          success: true,
          total: basicLiverData.length,
          basicData: basicLiverData,
          updated: updated,
          message: updated ? 'Basic data updated, details processing triggered' : 'No changes detected',
          detailsStatus: 'Processing will be handled by Worker2'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        console.error('❌ Manual scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          message: 'Basic data scraping failed'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // レビューAPI
    if (url.pathname.startsWith('/api/reviews')) {
      if (request.method === 'POST' && url.pathname === '/api/reviews') {
        return await postReview(request, env);
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/reviews/stats/')) {
        const liverId = url.pathname.split('/').pop();
        return await getReviewStats(liverId, env);
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/reviews/')) {
        const liverId = url.pathname.split('/').pop();
        return await getReviews(liverId, env);
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/reviews/')) {
        const reviewId = url.pathname.split('/').pop();
        return await deleteReview(reviewId, request, env);
      }

      return new Response(JSON.stringify({
        success: false,
        error: 'Method not allowed'
      }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // テスト用: 統合保護機能テストエンドポイント
    if (url.pathname === '/test-integration-protection') {
      try {
        console.log('🧪 Testing integration protection...');

        // 現在のlatest_dataの状況確認
        const currentDataStr = await env.LIVER_DATA?.get('latest_data');
        const currentData = currentDataStr ? JSON.parse(currentDataStr) : null;

        // 基本データを取得
        const basicLiverData = await scrapeBasicDataOnly(env);

        // 統合保護テスト実行
        const result = await integrateWithExistingDetails(env, basicLiverData);

        return new Response(JSON.stringify({
          success: true,
          test: 'integration-protection',
          before: {
            hasData: !!currentData,
            withDetails: currentData ? currentData.data.filter(l => l.hasDetails).length : 0,
            total: currentData ? currentData.total : 0,
            lastUpdate: currentData ? currentData.lastUpdate : null
          },
          after: {
            withDetails: result.integration.withDetails,
            total: result.total,
            lastUpdate: result.lastUpdate,
            protectedExisting: result.integration.protectedExisting
          },
          basicDataCount: basicLiverData.length,
          integrationDetails: result.integration
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          test: 'integration-protection'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ライバーデータAPI（メイン）
    if (url.pathname === '/api/livers') {
      try {
        // 優先順位: integrated > integrated_backup > detailed > latest_data > basic
        let dataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_integrated_data') : null;
        let dataSource = 'integrated';

        if (!dataStr) {
          dataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_integrated_backup') : null;
          dataSource = 'integrated_backup';
        }

        if (!dataStr) {
          dataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_detailed_data') : null;
          dataSource = 'detailed';
        }

        if (!dataStr) {
          dataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
          dataSource = 'latest';
        }

        if (dataStr) {
          const detailData = JSON.parse(dataStr);

          return new Response(JSON.stringify({
            success: true,
            total: detailData.data.length,
            data: detailData.data,
            timestamp: detailData.timestamp,
            lastUpdate: detailData.lastUpdate,
            stats: {
              withDetails: detailData.data.filter(l => l.hasDetails === true || (l.categories && l.categories.length > 0)).length,
              pending: detailData.data.filter(l => l.hasDetails === false || (!l.categories || l.categories.length === 0)).length,
              dataSource: dataSource
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          // フォールバック: 基本データのみ
          const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
          if (basicDataStr) {
            const basicData = JSON.parse(basicDataStr);
            return new Response(JSON.stringify({
              success: true,
              total: basicData.data.length,
              data: basicData.data.map(liver => ({
                ...liver,
                hasDetails: false,
                categories: [],
                streamingUrls: []
              })),
              timestamp: basicData.timestamp,
              lastUpdate: basicData.lastUpdate,
              stats: {
                withDetails: 0,
                pending: basicData.data.length
              }
            }), {
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }

          // データが全くない場合
          return new Response(JSON.stringify({
            success: false,
            error: "No data available"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 画像提供API
    if (url.pathname.startsWith('/api/images/')) {
      const imageId = url.pathname.split('/').pop();
      const image = env.IMAGES ? await env.IMAGES.get(imageId) : null;
      
      if (!image) {
        return new Response('Image not found', { status: 404 });
      }
      
      return new Response(image.body, {
        headers: { 
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'max-age=86400',
          ...corsHeaders
        }
      });
    }
    
    // Debug KV write endpoint
    if (url.pathname === '/debug-kv-write') {
      try {
        const testData = { test: 'value', timestamp: Date.now() };
        
        console.log('🧪 Testing KV write...');
        await env.LIVER_DATA.put('debug_test_key', JSON.stringify(testData));
        console.log('✅ KV write completed');
        
        // Also test writing to latest_basic_data
        await env.LIVER_DATA.put('latest_basic_data', JSON.stringify({
          timestamp: Date.now(),
          total: 999,
          data: ['test'],
          lastUpdate: new Date().toISOString()
        }));
        console.log('✅ latest_basic_data test write completed');
        
        // Immediate verification
        const immediate = await env.LIVER_DATA.get('debug_test_key');
        console.log(`🔍 Immediate check: ${immediate ? 'SUCCESS' : 'FAILED'}`);
        
        // Delayed verification
        await sleep(3000);
        const delayed = await env.LIVER_DATA.get('debug_test_key');
        console.log(`🔍 Delayed check: ${delayed ? 'SUCCESS' : 'FAILED'}`);
        
        return new Response(JSON.stringify({
          success: true,
          immediate: !!immediate,
          delayed: !!delayed,
          immediateData: immediate ? JSON.parse(immediate) : null,
          delayedData: delayed ? JSON.parse(delayed) : null
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error(`❌ Debug KV test failed: ${error.message}`);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// Worker分散処理対応完了 - 詳細取得は全てWorker2に委譲
// 不要な重複関数（parseHTMLPageWithDetails等）は削除済み

// 基本データのみを取得する関数（詳細情報なし）
async function scrapeBasicDataOnly(env) {
  console.log('🔍 Starting basic data scraping...');
  
  const baseUrl = 'https://www.comisapolive.com/liver/list/';
  let allLivers = [];
  let currentPage = 1;
  let maxPages = null;
  
  // ログイン処理
  console.log('🔐 Performing login...');
  const loginResult = await performRobustLogin(env);
  
  if (!loginResult.success) {
    throw new Error(`Login failed: ${loginResult.error}`);
  }
  
  console.log('✅ Login successful');
  
  do {
    console.log(`📄 Scraping basic data from page ${currentPage}...`);
    
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl}?page=${currentPage}`;
    
    try {
      let response = await fetch(pageUrl, {
        headers: {
          'Cookie': loginResult.cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // 基本データのみをパース（詳細情報の取得はスキップ）
      const pageData = await parseHTMLPageBasicOnly(html, currentPage);
      allLivers.push(...pageData);
      
      // 最大ページ数を取得（初回のみ）
      if (maxPages === null) {
        maxPages = getMaxPages(html);
        console.log(`📊 Total pages to scrape: ${maxPages}`);
      }
      
      await sleep(1000); // レート制限対策
      
    } catch (error) {
      console.error(`❌ Error scraping page ${currentPage}:`, error.message);
      break;
    }
    
    currentPage++;
  } while (currentPage <= maxPages);
  
  console.log(`✅ Basic scraping completed: ${allLivers.length} livers found`);
  return allLivers;
}

// 基本データのみをパースする関数
async function parseHTMLPageBasicOnly(html, pageNumber) {
  const livers = [];
  
  console.log(`🔍 Parsing HTML page ${pageNumber} (length: ${html.length} chars)`);
  
  // 1. まず detail/modal リンクを全て抽出
  const detailLinks = [];
  
  const detailPattern = /<a[^>]*href="(\/liver\/detail\/(\d+)\/?)"/g;
  let detailMatch;
  while ((detailMatch = detailPattern.exec(html)) !== null) {
    detailLinks.push({
      path: detailMatch[1],
      id: detailMatch[2],
      fullUrl: `https://www.comisapolive.com/liver/detail/${detailMatch[2]}/`,
      type: 'detail'
    });
  }
  
  const modalPattern = /<a[^>]*href="(\/modal\/guest-guide\/(\d+))"/g;
  let modalMatch;
  while ((modalMatch = modalPattern.exec(html)) !== null) {
    detailLinks.push({
      path: modalMatch[1],
      id: modalMatch[2],
      fullUrl: `https://www.comisapolive.com/liver/detail/${modalMatch[2]}/`,
      modalUrl: `https://www.comisapolive.com${modalMatch[1]}`,
      type: 'modal'
    });
  }
  
  console.log(`🔗 Found ${detailLinks.length} detail links`);
  
  // 2. 詳細リンクを基準にライバー情報を抽出
  const foundLivers = [];
  
  detailLinks.forEach(link => {
    console.log(`🔗 Processing liver ID: ${link.id}`);
    
    // 対応する画像を探す
    let imageUrl = '/assets/images/shared/noimage.png';
    let liverName = `Liver ${link.id}`;
    
    const imagePattern = new RegExp(`<img src="\/user_files_thumbnail\/${link.id}\/[^"]*" alt="([^"]*)"[^>]*>`, 'g');
    const imageMatch = imagePattern.exec(html);
    
    if (imageMatch) {
      imageUrl = imageMatch[0].match(/src="([^"]*)"/)[1];
      liverName = imageMatch[1].trim();
      console.log(`📸 Found liver image: ${liverName} (ID: ${link.id})`);
    } else {
      console.log(`🖼️ Found noimage.png liver: ${liverName} (ID: ${link.id})`);
    }
    
    foundLivers.push({
      id: link.id,
      name: liverName,
      imageUrl: imageUrl,
      detailUrl: link.fullUrl
    });
  });
  
  // 3. より詳細な情報抽出（フォロワー数など）
  const itemPattern = /<div[^>]*class="[^"]*livers_item[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let itemMatch;
  let itemIndex = 0;
  
  while ((itemMatch = itemPattern.exec(html)) !== null && itemIndex < foundLivers.length) {
    const itemHtml = itemMatch[1];
    const liver = foundLivers[itemIndex];
    
    if (liver) {
      const followerMatch = itemHtml.match(/<dd[^>]*>([^<]*)<\/dd>/);
      if (followerMatch) {
        const followerText = followerMatch[1].trim();
        liver.followers = parseInt(followerText.replace(/[,\s]/g, '')) || 0;
      }
      
      const platformMatch = itemHtml.match(/<dt[^>]*>([^<]*)<\/dt>/);
      if (platformMatch) {
        liver.platform = platformMatch[1].replace('フォロワー', '').trim();
      }
      
      const nameMatch = itemHtml.match(/<p[^>]*class="[^"]*livers_name[^"]*"[^>]*>([^<]*)<\/p>/);
      if (nameMatch && nameMatch[1].trim()) {
        liver.name = nameMatch[1].trim();
        console.log(`📝 Updated liver name from livers_name class: ${liver.name}`);
      }
    }
    
    itemIndex++;
  }
  
  // 4. 最終的なライバーリストに変換
  foundLivers.forEach((liver, index) => {
    const liverId = generateId(liver.name, pageNumber, liver.id, index);
    
    livers.push({
      id: liverId,
      originalId: liver.id,
      name: liver.name,
      imageUrl: `/api/images/${liver.originalId}.jpg`, // API用の画像URL
      actualImageUrl: liver.imageUrl, // 実際のソース画像URL（画像処理用）
      detailUrl: liver.detailUrl,
      followers: liver.followers || 0,
      platform: liver.platform || '',
      pageNumber: pageNumber,
      scrapedAt: new Date().toISOString(),
      hasDetails: false
    });
    
    console.log(`✅ Found liver: ${liver.name} (ID: ${liver.id})`);
  });
  
  console.log(`📊 Page ${pageNumber}: Found ${foundLivers.length} livers`);
  return livers;
}

// Worker2（詳細取得）をトリガーする関数
async function triggerDetailWorker(env) {
  try {
    console.log('🔄 Triggering detail worker...');
    
    const detailWorkerUrl = env.DETAIL_WORKER_URL;
    if (!detailWorkerUrl) {
      throw new Error('DETAIL_WORKER_URL not configured');
    }
    
    const response = await fetch(`${detailWorkerUrl}/start-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.WORKER_AUTH_TOKEN || 'default-token'}`
      },
      body: JSON.stringify({
        trigger: 'main-worker',
        timestamp: Date.now()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to trigger detail worker: ${response.status}`);
    }
    
    console.log('✅ Detail worker triggered successfully');
    
  } catch (error) {
    console.error('❌ Failed to trigger detail worker:', error.message);
  }
}

// Worker間のステータス管理
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

// === 共通ユーティリティ関数 ===

async function performRobustLogin(env) {
  try {
    console.log('🔐 Starting login process...');
    
    const loginPageResponse = await fetch('https://www.comisapolive.com/login/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });
    
    if (!loginPageResponse.ok) {
      return { success: false, error: `Login page failed: ${loginPageResponse.status}` };
    }
    
    const loginPageHtml = await loginPageResponse.text();
    const loginPageCookies = loginPageResponse.headers.get('set-cookie') || '';
    
    const csrfToken = extractCSRFToken(loginPageHtml);
    const hiddenFields = extractHiddenFields(loginPageHtml);
    const actionUrl = extractFormAction(loginPageHtml) || 'https://www.comisapolive.com/login/';
    
    console.log('📝 Form analysis complete:', {
      csrf: !!csrfToken,
      hidden: Object.keys(hiddenFields).length,
      action: actionUrl.includes('login')
    });
    
    const loginData = new URLSearchParams();
    
    const email = env.LOGIN_EMAIL || env.LOGIN_ID || 'comisapolive@gmail.com';
    const password = env.LOGIN_PASSWORD || 'cord3cord3';
    
    const emailFields = ['email', 'username', 'login_id', 'user_email', 'mail'];
    const passwordFields = ['password', 'passwd', 'pass', 'login_password'];
    
    emailFields.forEach(field => {
      loginData.append(field, email);
    });
    
    passwordFields.forEach(field => {
      loginData.append(field, password);
    });
    
    if (csrfToken) {
      const csrfFields = ['csrf_token', '_token', 'authenticity_token', 'csrfmiddlewaretoken'];
      csrfFields.forEach(field => {
        loginData.append(field, csrfToken);
      });
    }
    
    Object.entries(hiddenFields).forEach(([name, value]) => {
      loginData.append(name, value);
    });
    
    const loginResponse = await fetch(actionUrl, {
      method: 'POST',
      body: loginData,
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.comisapolive.com/login/',
        'Cookie': loginPageCookies
      }
    });
    
    console.log(`🔍 Login response: ${loginResponse.status}`);
    
    const setCookieHeaders = loginResponse.headers.getSetCookie?.() || [];
    let newCookies = loginPageCookies;
    
    if (setCookieHeaders.length > 0) {
      const sessionCookies = setCookieHeaders
        .map(cookie => cookie.split(';')[0])
        .filter(cookie => cookie.includes('='))
        .join('; ');
      
      newCookies = [loginPageCookies, sessionCookies]
        .filter(Boolean)
        .join('; ');
    }
    
    console.log('🍪 Cookies processed');
    
    let success = false;
    let successMethod = '';
    
    if ([301, 302, 303, 307, 308].includes(loginResponse.status)) {
      const location = loginResponse.headers.get('location');
      if (location && (location.includes('/liver/') || location.includes('/dashboard') || location.includes('/profile'))) {
        success = true;
        successMethod = 'redirect';
      }
    }
    
    if (!success && loginResponse.status === 200) {
      const responseText = await loginResponse.text();
      
      if (responseText.includes('ログアウト') || 
          responseText.includes('マイページ') || 
          responseText.includes('/liver/list/') ||
          responseText.includes('liver_item') ||
          !responseText.includes('ログイン')) {
        success = true;
        successMethod = 'content';
      }
    }
    
    if (!success && newCookies) {
      if (newCookies.includes('SESS_PUBLISH') || 
          newCookies.includes('session') || 
          newCookies.includes('auth')) {
        success = true;
        successMethod = 'cookie';
      }
    }
    
    if (!success && loginResponse.status === 200 && newCookies.length > 20) {
      success = true;
      successMethod = 'fallback';
    }
    
    if (success) {
      console.log(`✅ Login successful (method: ${successMethod})`);
      return {
        success: true,
        cookies: newCookies,
        method: successMethod
      };
    } else {
      console.log('❌ Login failed - no success indicators found');
      return {
        success: false,
        error: `Login failed: status ${loginResponse.status}`,
        cookies: newCookies
      };
    }
    
  } catch (error) {
    console.error('❌ Login process failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function getMaxPages(html) {
  console.log(`🔍 Analyzing pagination in HTML (length: ${html.length})`);
  
  // 複数の方法でページ数を検出
  let maxPage = 5; // 安全な初期値として5ページに設定
  let foundPages = [];
  
  // 方法1: ページネーションリンクから検出
  const patterns = [
    // メインパターン: /liver/list/?page=数字
    /<a[^>]*href="[^"]*\/liver\/list\/\?[^"]*page=(\d+)"[^>]*>(\d+)<\/a>/g,
    // 他のクエリパラメータ付き
    /<a[^>]*href="[^"]*\?[^"]*page=(\d+)[^"]*"[^>]*>(\d+)<\/a>/g,
    // シンプルなパターン
    /[?&]page=(\d+)/g
  ];
  
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(html)) !== null) {
      const pageNumStr = match[1] || match[2];
      if (pageNumStr) {
        const pageNum = parseInt(pageNumStr);
        if (pageNum >= 1 && pageNum <= 100) {
          foundPages.push(pageNum);
          if (pageNum > maxPage) {
            maxPage = pageNum;
          }
        }
      }
    }
  }
  
  // ページ数のデバッグ情報（詳細版）
  if (foundPages.length > 0) {
    const uniquePages = [...new Set(foundPages)].sort((a, b) => a - b);
    console.log(`🔍 Found page numbers: ${uniquePages.join(', ')}`);
    console.log(`🔍 Max page detected: ${maxPage}`);
  } else {
    console.log(`⚠️ No pagination found with patterns, searching for alternative indicators`);
    
    const guestGuideCount = (html.match(/\/modal\/guest-guide\//g) || []).length;
    const detailLinks = (html.match(/\/liver\/detail\/\d+\//g) || []).length;
    
    // 経験的な推定：76人のライバーがいることが分かっているので
    // 1ページあたり約15人として5ページに設定
    if (guestGuideCount > 10 || detailLinks > 10) {
      maxPage = 5;
      console.log(`📊 Based on content analysis (${detailLinks} detail links), estimated: ${maxPage} pages`);
    }
  }
  
  // 最小値の保証：少なくとも5ページは試行する
  if (maxPage < 5) {
    maxPage = 5;
    console.log(`📈 Ensuring minimum 5 pages for comprehensive scraping`);
  }
  
  console.log(`✅ Final max pages: ${maxPage}`);
  return maxPage;
}

function generateId(name, pageNumber, originalId, index = 0) {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'liver';
  return originalId;
}

function generateHash(data) {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCSRFToken(html) {
  const match = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  return match ? match[1] : null;
}

function extractHiddenFields(html) {
  const fields = {};
  const hiddenInputRegex = /<input[^>]*type="hidden"[^>]*>/g;
  let match;
  
  while ((match = hiddenInputRegex.exec(html)) !== null) {
    const input = match[0];
    const nameMatch = input.match(/name="([^"]+)"/);
    const valueMatch = input.match(/value="([^"]*)"/);
    
    if (nameMatch && valueMatch) {
      fields[nameMatch[1]] = valueMatch[1];
    }
  }
  
  return fields;
}

function extractFormAction(html) {
  const match = html.match(/<form[^>]*action="([^"]+)"/);
  return match ? match[1] : null;
}

// 既存の詳細データと基本データを統合してlatest_dataを更新
async function getLastKnownGoodData(env) {
  const fallbackKeys = [
    'latest_integrated_backup',
    'latest_integrated_data',
    'latest_data'
  ];

  for (const key of fallbackKeys) {
    try {
      const raw = await env.LIVER_DATA?.get(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const withDetails = parsed?.integration?.withDetails ?? 0;

      if (Array.isArray(parsed?.data) && parsed.data.length > 0 && withDetails > 0) {
        return { key, raw, parsed, withDetails };
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse fallback data from ${key}:`, error.message);
    }
  }

  return null;
}

function integrationHasFallback(fallback) {
  return !!(fallback && Array.isArray(fallback.parsed?.data) && fallback.parsed.data.length > 0 && (fallback.withDetails ?? 0) > 0);
}

async function integrateWithExistingDetails(env, basicLiverData) {
  try {
    console.log('🔄 Integrating with existing details...');
    console.log(`📊 Basic data count: ${basicLiverData.length}`);

    // Hybrid Solution (B + A): マルチキー検出機能 + KV整合性リトライ機構
    console.log('🔍 Implementing multi-key detection with KV consistency retry...');

    // Phase 1: 複数保護キー検索（即効性）
    const protectionKeys = [
      'latest_integrated_data_primary',
      'latest_integrated_data_secondary',
      'latest_integrated_data_tertiary',
      'latest_integrated_data', // 既存キー（互換性）
      'latest_integrated_backup', // 既存バックアップキー（互換性）
      'latest_detailed_data', // レガシー互換性
      'latest_data' // API用データ（フォールバック）
    ];

    let existingDataStr = null;
    let dataSource = 'none';
    let retryCount = 0;
    const maxRetries = 3;

    console.log(`📋 Checking ${protectionKeys.length} protection keys with retry mechanism...`);

    // Phase 2: KV整合性リトライ機構（信頼性向上）
    while (!existingDataStr && retryCount < maxRetries) {
      console.log(`🔄 Key search attempt ${retryCount + 1}/${maxRetries}`);

      // 全ての保護キーを並列で検索
      const searchPromises = protectionKeys.map(async (key) => {
        try {
          const data = await env.LIVER_DATA?.get(key);
          if (data) {
            console.log(`✅ Found data in protection key: ${key}`);
            return { key, data, status: 'success' };
          }
          return { key, data: null, status: 'empty' };
        } catch (error) {
          console.warn(`⚠️ Failed to read protection key: ${key}`, error.message);
          return { key, data: null, status: 'error', error: error.message };
        }
      });

      const searchResults = await Promise.all(searchPromises);

      // 最初に見つかった有効なデータを使用
      const foundResult = searchResults.find(result => result.data);

      if (foundResult) {
        existingDataStr = foundResult.data;
        dataSource = foundResult.key;
        console.log(`✅ Successfully found detailed data in: ${dataSource}`);
        break;
      }

      // 全てのキーの検索結果をログ出力
      console.log('📊 Key search results:');
      searchResults.forEach(result => {
        console.log(`   ${result.key}: ${result.status}`);
      });

      retryCount++;

      if (retryCount < maxRetries) {
        console.log(`⏳ Waiting 10 seconds before retry ${retryCount + 1}/${maxRetries} for KV consistency...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // 結果サマリー
    if (existingDataStr) {
      console.log(`✅ Multi-key detection successful: Found data in ${dataSource} after ${retryCount + 1} attempts`);
    } else {
      console.log(`❌ Multi-key detection failed: No protection keys found after ${maxRetries} attempts`);
      console.log(`🔍 Searched keys: ${protectionKeys.join(', ')}`);
    }

    const lastKnownGood = await getLastKnownGoodData(env);

    if (!existingDataStr) {
      console.log('⚠️ No existing detailed data found in any key.');
      if (lastKnownGood) {
        console.log(`🛡️ Preserving last known good dataset from ${lastKnownGood.key} to avoid data loss.`);
        return lastKnownGood.parsed;
      }
      console.log('🔍 Checked keys: latest_integrated_data, latest_integrated_backup, latest_detailed_data, latest_data');
      console.log('⚠️ No fallback dataset available. Proceeding with basic-only data creation.');
      return await createBasicOnlyData(env, basicLiverData);
    }

    console.log(`📊 Using data from: ${dataSource}`);
    const existingData = JSON.parse(existingDataStr);
    const existingLivers = existingData.data || [];
    console.log(`📊 Existing data count: ${existingLivers.length}`);
    console.log(`📊 Existing with details: ${existingLivers.filter(l => l.hasDetails).length}`);

    // 既存の詳細データをoriginalIdでインデックス化
    const existingDetailsMap = new Map();
    existingLivers.forEach(liver => {
      if (liver.originalId) {
        existingDetailsMap.set(liver.originalId, liver);
      }
    });

    // 基本データを基準に統合データを作成
    const integratedData = basicLiverData.map(basicLiver => {
      const existingDetail = existingDetailsMap.get(basicLiver.originalId);

      if (existingDetail && existingDetail.hasDetails) {
        // 詳細データが存在する場合は、基本データで更新しつつ詳細情報を保持
        return {
          ...existingDetail,
          // 基本データからの更新情報
          name: basicLiver.name,
          followers: basicLiver.followers,
          platform: basicLiver.platform,
          pageNumber: basicLiver.pageNumber,
          scrapedAt: basicLiver.scrapedAt,
          // 重要なフィールドの確保
          id: basicLiver.originalId,
          originalId: basicLiver.originalId,
          imageUrl: `/api/images/${basicLiver.originalId}.jpg`,
          detailUrl: basicLiver.detailUrl,
          actualImageUrl: basicLiver.actualImageUrl,
          hasDetails: true
        };
      } else {
        // 詳細データがない場合は基本データのみ
        return {
          ...basicLiver,
          id: basicLiver.originalId,
          imageUrl: `/api/images/${basicLiver.originalId}.jpg`,
          hasDetails: false,
          categories: [],
          streamingUrls: []
        };
      }
    });

    // 統合済みデータを保存（複数キーに書き込み）
    const integratedResult = {
      success: true,
      total: integratedData.length,
      data: integratedData,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      integration: {
        basicCount: basicLiverData.length,
        existingCount: existingLivers.length,
        withDetails: integratedData.filter(l => l.hasDetails).length,
        pending: integratedData.filter(l => !l.hasDetails).length,
        protectedExisting: true,
        sourceKey: dataSource
      }
    };

    const withDetailsCount = integratedResult.integration.withDetails;

    if (withDetailsCount === 0) {
      if (integrationHasFallback(lastKnownGood)) {
        console.warn('⚠️ Integrated result contains 0 detailed entries. Keeping last known good dataset to prevent data loss.');
        console.log(`🛡️ Fallback source: ${lastKnownGood.key}`);
        return lastKnownGood.parsed;
      }

      console.warn('⚠️ Integrated result contains 0 detailed entries and no fallback exists. KV will retain basic-only data.');
      await env.LIVER_DATA?.put('latest_data', JSON.stringify(integratedResult));
      await env.LIVER_DATA?.put('latest_integrated_data', JSON.stringify(integratedResult));
      console.log('✅ Basic-only dataset written (initial population scenario)');
      return integratedResult;
    }

    // 複数のキーに書き込み（データ保護強化）
    console.log('💾 Writing integrated data to multiple keys...');
    await env.LIVER_DATA?.put('latest_data', JSON.stringify(integratedResult));
    console.log('✅ Written to latest_data');

    // バックアップキーにも保存（詳細付きのみ更新）
    await env.LIVER_DATA?.put('latest_integrated_data', JSON.stringify(integratedResult));
    console.log('✅ Written to latest_integrated_data');

    await env.LIVER_DATA?.put('latest_integrated_backup', JSON.stringify(integratedResult));
    console.log('✅ Written to latest_integrated_backup');

    console.log(`✅ Protected integration completed successfully!`);
    console.log(`📊 Final result: ${integratedData.length} total, ${integratedResult.integration.withDetails} with details preserved`);
    console.log(`📊 Details preserved from: ${dataSource}`);
    console.log(`📊 Basic data merged: ${basicLiverData.length} items`);

    return integratedResult;

  } catch (error) {
    console.error('❌ Integration with existing details failed:', error);
    console.error('🔍 Error details:', error.message);
    console.error('📍 Stack trace:', error.stack);
    console.log('⚠️ Falling back to basic-only data creation');
    // フォールバック: 基本データのみで作成
    return await createBasicOnlyData(env, basicLiverData);
  }
}

// 基本データのみでlatest_dataを作成
async function createBasicOnlyData(env, basicLiverData) {
  try {
    console.log('📄 Creating basic-only data...');
    console.log(`⚠️ WARNING: No detailed data found - creating basic-only dataset`);
    console.log(`📊 Input basic data count: ${basicLiverData.length}`);

    const basicOnlyData = basicLiverData.map(basicLiver => ({
      ...basicLiver,
      id: basicLiver.originalId,
      imageUrl: `/api/images/${basicLiver.originalId}.jpg`,
      hasDetails: false,
      categories: [],
      streamingUrls: []
    }));

    const basicResult = {
      success: true,
      total: basicOnlyData.length,
      data: basicOnlyData,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      integration: {
        basicCount: basicLiverData.length,
        existingCount: 0,
        withDetails: 0,
        pending: basicOnlyData.length,
        protectedExisting: false,
        sourceKey: 'none-basic-only'
      }
    };

    console.log('💾 Writing basic-only data to latest_data key...');
    await env.LIVER_DATA?.put('latest_data', JSON.stringify(basicResult));
    console.log(`✅ Basic-only data created and saved`);
    console.log(`📊 Final result: ${basicOnlyData.length} livers (0 with details)`);
    console.log(`⚠️ This will cause data loss if detailed data existed elsewhere!`);

    return basicResult;

  } catch (error) {
    console.error('❌ Basic-only data creation failed:', error);
    console.error('🔍 Error details:', error.message);
    console.error('📍 Stack trace:', error.stack);
    throw error;
  }
}

// Export functions for use in other modules
export { scrapeBasicDataOnly, integrateWithExistingDetails, createBasicOnlyData, generateHash };
