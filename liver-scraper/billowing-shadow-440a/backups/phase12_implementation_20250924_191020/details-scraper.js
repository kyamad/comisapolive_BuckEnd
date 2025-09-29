// Worker2: liver-scraper-details (詳細情報専門)
// 役割: 詳細情報取得専門
// Cronスケジュール: "30 0,6,12,18 * * *" (メインの30分後)

export default {
  async scheduled(event, env, ctx) {
    console.log('🔍 Starting details scraper (Worker2) - Scheduled execution...');
    
    try {
      // 基本データを取得
      const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
      if (!basicDataStr) {
        console.log('ℹ️ No basic data found, waiting for main worker...');
        return;
      }
      
      const basicData = JSON.parse(basicDataStr);
      const livers = basicData.data || [];
      
      if (livers.length === 0) {
        console.log('ℹ️ No livers to process');
        return;
      }
      
      // CPU時間制限対策：最適化されたバッチサイズで段階的処理
      await processSmallBatch(env, livers, 15); // 15件ずつ処理（安全マージン考慮）
      
    } catch (error) {
      console.error('❌ Details scraper scheduled run failed:', error);
      await updateWorkerStatus(env, 'details', 'error', { error: error.message });
    }
  },

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

    // 手動詳細処理エンドポイント
    if (url.pathname === '/manual-details') {
      try {
        console.log('🚀 Manual details processing triggered...');

        // 基本データを取得
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data found'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];

        // 最適化されたバッチで処理
        await processSmallBatch(env, livers, 20); // 手動実行では少し大きめのバッチ

        return new Response(JSON.stringify({
          success: true,
          message: 'Manual details processing started',
          total: livers.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('❌ Manual details processing failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 🔗 schedules_id URL抽出テストエンドポイント
    if (url.pathname === '/test-schedules-id') {
      try {
        const targetId = url.searchParams.get('id') || '158'; // デフォルトテストID
        const testUrl = `https://www.comisapolive.com/liver/detail/${targetId}/`;
        
        console.log(`🧪 Testing schedules_id extraction for: ${testUrl}`);
        
        // ログインして詳細ページにアクセス
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Login failed',
            details: loginResult.error
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const response = await fetch(testUrl, {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': loginResult.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        
        if (!response.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: `HTTP ${response.status}`,
            url: testUrl
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const html = await response.text();
        
        // 新しい関数をテスト
        const scheduleUrls = extractSchedulesIdUrls(html);
        const scheduleInfo = extractScheduleInfo(html); // 既存の関数も比較
        
        return new Response(JSON.stringify({
          success: true,
          testId: targetId,
          testUrl: testUrl,
          results: {
            newFunction: {
              count: scheduleUrls.length,
              urls: scheduleUrls
            },
            existingFunction: {
              count: scheduleInfo.length,
              schedules: scheduleInfo
            }
          },
          comparison: {
            newFunctionUrlsOnly: scheduleUrls.map(s => ({url: s.url, type: s.type})),
            existingFunctionUrls: scheduleInfo.map(s => s.url).filter(u => u && u !== '')
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 新システムのテスト実行エンドポイント
    if (url.pathname === '/test-new-system') {
      try {
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        
        // 新システムで3件処理
        await processSmallBatch(env, livers, 3);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'New progressive system test completed',
          info: 'Check progress endpoint for details'
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

    // デバッグエンドポイント1: ログイン処理のみをテスト
    if (url.pathname === '/debug-login-only') {
      try {
        console.log('🧪 Debug: Testing login process only...');
        const loginResult = await performRobustLogin(env);
        
        return new Response(JSON.stringify({
          loginSuccess: loginResult.success,
          loginMethod: loginResult.method || 'none',
          cookiesLength: loginResult.cookies ? loginResult.cookies.length : 0,
          error: loginResult.error,
          timestamp: new Date().toISOString(),
          debugInfo: {
            envVars: {
              hasLoginId: !!env.LOGIN_EMAIL,
              hasLoginPassword: !!env.LOGIN_PASSWORD,
              loginIdDefault: env.LOGIN_EMAIL || 'using fallback: comisapolive@gmail.com',
              passwordDefault: env.LOGIN_PASSWORD || 'using fallback: cord3cord3'
            }
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          loginSuccess: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // デバッグエンドポイント2: 認証後のリスト解析をテスト
    if (url.pathname === '/debug-list-parsing') {
      try {
        console.log('🧪 Debug: Testing authenticated list parsing...');
        const loginResult = await performRobustLogin(env);
        
        if (!loginResult.success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Login failed: ' + loginResult.error
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const listResponse = await fetch('https://www.comisapolive.com/liver/list/', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        });

        const listHtml = await listResponse.text();
        const hasLoginForm = listHtml.includes('name="email"') || listHtml.includes('name="password"');
        const liverCount = (listHtml.match(/\/liver\/\d+\//g) || []).length;
        
        return new Response(JSON.stringify({
          success: !hasLoginForm,
          listResponseStatus: listResponse.status,
          hasLoginForm,
          liverLinksFound: liverCount,
          htmlLength: listHtml.length,
          sampleHtml: listHtml.substring(0, 500),
          cookieUsed: loginResult.cookies.substring(0, 100) + '...'
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

    // デバッグエンドポイント3: 認証付きHTML取得をテスト
    if (url.pathname === '/debug-html-auth') {
      try {
        console.log('🧪 Debug: Testing authenticated HTML fetch...');
        const loginResult = await performRobustLogin(env);
        
        if (!loginResult.success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Login failed: ' + loginResult.error
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // テスト用に最初のライバーページをテスト
        const testUrls = [
          'https://www.comisapolive.com/liver/list/',
          'https://www.comisapolive.com/liver/1/',
          'https://www.comisapolive.com/liver/2/'
        ];
        
        const results = [];
        for (const testUrl of testUrls) {
          try {
            const response = await fetch(testUrl, {
              headers: {
                'Cookie': loginResult.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
              }
            });
            
            const html = await response.text();
            results.push({
              url: testUrl,
              status: response.status,
              hasLoginForm: html.includes('name="email"') || html.includes('name="password"'),
              htmlLength: html.length,
              title: (html.match(/<title>(.*?)<\/title>/i) || ['', 'No title'])[1]
            });
          } catch (err) {
            results.push({
              url: testUrl,
              error: err.message
            });
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          loginMethod: loginResult.method,
          cookieLength: loginResult.cookies.length,
          testResults: results
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

    // デバッグエンドポイント4: Cookie情報の詳細分析
    if (url.pathname === '/debug-cookies') {
      try {
        console.log('🧪 Debug: Analyzing cookie information...');
        
        // ログインページ取得
        const loginPageResponse = await fetch('https://www.comisapolive.com/login/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const loginPageCookies = loginPageResponse.headers.get('set-cookie') || '';
        
        // ログイン実行
        const loginResult = await performRobustLogin(env);
        
        return new Response(JSON.stringify({
          success: true,
          analysis: {
            loginPageCookies: {
              raw: loginPageCookies,
              length: loginPageCookies.length,
              hasSessPublish: loginPageCookies.includes('SESS_PUBLISH')
            },
            loginResult: {
              success: loginResult.success,
              method: loginResult.method,
              finalCookies: {
                raw: loginResult.cookies || '',
                length: loginResult.cookies ? loginResult.cookies.length : 0,
                hasSessPublish: loginResult.cookies ? loginResult.cookies.includes('SESS_PUBLISH') : false
              }
            },
            cookieComparison: {
              beforeLogin: loginPageCookies.includes('SESS_PUBLISH') ? 'Found SESS_PUBLISH' : 'No SESS_PUBLISH',
              afterLogin: (loginResult.cookies && loginResult.cookies.includes('SESS_PUBLISH')) ? 'Found SESS_PUBLISH' : 'No SESS_PUBLISH'
            }
          }
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

    // デバッグエンドポイント5: KVストレージの動作確認
    if (url.pathname === '/kv-test') {
      try {
        console.log('🧪 Debug: Testing KV storage functionality...');
        
        const testKey = 'debug-test-' + Date.now();
        const testValue = { test: true, timestamp: new Date().toISOString() };
        
        // KV書き込みテスト
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put(testKey, JSON.stringify(testValue));
          console.log('✅ KV write test passed');
        }
        
        // KV読み込みテスト
        const readValue = env.LIVER_DATA ? await env.LIVER_DATA.get(testKey) : null;
        const canRead = readValue !== null;
        
        // 既存データ確認
        const basicData = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        const hasBasicData = basicData !== null;
        
        // クリーンアップ
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.delete(testKey);
        }
        
        return new Response(JSON.stringify({
          success: true,
          kvTest: {
            canWrite: true,
            canRead,
            hasBasicData,
            basicDataLength: basicData ? basicData.length : 0
          },
          environment: {
            hasLiverData: !!env.LIVER_DATA,
            hasImageHashes: !!env.IMAGE_HASHES,
            hasImages: !!env.IMAGES,
            workerAuthToken: env.WORKER_AUTH_TOKEN ? 'Set' : 'Not set',
            loginId: env.LOGIN_EMAIL ? 'Set' : 'Using fallback',
            loginPassword: env.LOGIN_PASSWORD ? 'Set' : 'Using fallback'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          kvTest: {
            canWrite: false,
            canRead: false,
            error: error.message
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 基本データ構造確認エンドポイント
    if (url.pathname === '/debug-basic-data') {
      try {
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        
        return new Response(JSON.stringify({
          success: true,
          structure: {
            dataLength: basicDataStr.length,
            rootKeys: Object.keys(basicData),
            totalLivers: livers.length,
            sampleLivers: livers.slice(0, 3).map(liver => ({
              name: liver.name,
              detailUrl: liver.detailUrl,
              allKeys: Object.keys(liver)
            }))
          }
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

    // 実際のデータ取得テスト用エンドポイント
    if (url.pathname === '/test-data-scraping') {
      try {
        console.log('🧪 Debug: Testing actual data scraping...');
        
        // 基本データを取得
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        
        // デバッグ: 基本データの構造を確認
        console.log('📊 Basic data structure:', {
          totalLivers: livers.length,
          sampleLiver: livers[0],
          dataKeys: Object.keys(basicData)
        });
        
        if (livers.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No livers found in basic data',
            basicDataStructure: Object.keys(basicData)
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // 最初の3つのライバーで詳細取得をテスト（実際のHTMLも確認）
        const testLivers = livers.slice(0, 3);
        const results = [];
        
        // ログイン実行
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Login failed: ' + loginResult.error
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        console.log('✅ Login successful, testing data scraping...');
        
        for (const liver of testLivers) {
          try {
            // まず生のHTMLを取得して確認
            const rawResponse = await fetch(liver.detailUrl, {
              headers: {
                'Cookie': loginResult.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
              }
            });
            
            const rawHtml = await rawResponse.text();
            const hasLoginForm = rawHtml.includes('name=\"email\"') || rawHtml.includes('name=\"password\"');
            const pageTitle = (rawHtml.match(/<title>(.*?)<\/title>/i) || ['', 'No title'])[1];
            
            // 詳細スクレイピング実行
            const result = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', env, loginResult);
            
            results.push({
              basicDataName: liver.name, // 基本データから取得した名前
              liverUrl: liver.detailUrl,
              rawPageInfo: {
                status: rawResponse.status,
                hasLoginForm,
                pageTitle,
                htmlLength: rawHtml.length,
                htmlPreview: rawHtml.substring(0, 300)
              },
              scrapingResult: {
                success: result.success,
                hasDetails: !!result.details,
                detailFields: result.details ? Object.keys(result.details) : [],
                detailName: result.details ? result.details.detailName : null, // 詳細ページから取得した正しい名前
                error: result.error
              },
              nameComparison: {
                fromBasicData: liver.name,
                fromDetailPage: result.details ? result.details.detailName : null,
                fromPageTitle: pageTitle,
                mismatch: liver.name !== (result.details ? result.details.detailName : null)
              }
            });
            
            // 短時間待機（レート制限対策）
            await sleep(1000);
          } catch (error) {
            results.push({
              basicDataName: liver.name,
              liverUrl: liver.detailUrl,
              scrapingResult: {
                success: false,
                error: error.message
              }
            });
          }
        }
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        return new Response(JSON.stringify({
          success: true,
          testSummary: {
            totalTested: results.length,
            successCount,
            errorCount,
            successRate: `${Math.round(successCount / results.length * 100)}%`
          },
          loginMethod: loginResult.method,
          cookieLength: loginResult.cookies.length,
          results
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

    // 小規模バッチテスト用エンドポイント
    if (url.pathname === '/test-small-batch') {
      try {
        console.log('🧪 Debug: Testing small batch processing...');
        
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        
        // 進捗をリセットして小規模テスト
        await env.LIVER_DATA?.delete('detail_processing_progress');
        
        // 2件の小規模バッチで実行
        const result = await processSmallBatch(env, livers, 2);
        
        // 結果を確認
        const progressStr = await env.LIVER_DATA?.get('detail_processing_progress');
        const progress = progressStr ? JSON.parse(progressStr) : { completed: [] };
        
        return new Response(JSON.stringify({
          success: true,
          batchResult: result,
          processedCount: progress.completed.length,
          processedItems: progress.completed.map(item => ({
            name: item.name,
            success: item.hasDetails,
            error: item.detailError,
            detailFields: item.details ? Object.keys(item.details) : []
          }))
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

    // バッチ詳細取得開始エンドポイント（旧システム）
    if (url.pathname === '/start-batch') {
      try {
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        const requestedBatchSize = parseInt(url.searchParams.get('batch')) || 15;
        // Subrequest制限対策: バッチサイズを制限
        const safeBatchSize = Math.min(requestedBatchSize, 1);
        console.log(`⚠️ Limiting batch size from ${requestedBatchSize} to ${safeBatchSize} for subrequest limits`);
        
        // 詳細情報バッチ処理を実行
        const result = await processDetailsBatch(env, livers, safeBatchSize);
        
        return new Response(JSON.stringify({
          success: true,
          message: `Processed ${result.processed} livers with ${result.errors} errors`,
          total: result.total,
          processed: result.processed,
          errors: result.errors
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
    
    // detail-batch エンドポイント
    if (url.pathname === '/detail-batch') {
      const batchSize = parseInt(url.searchParams.get('batch')) || 15;
      
      try {
        const basicDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_basic_data') : null;
        if (!basicDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No basic data available'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const basicData = JSON.parse(basicDataStr);
        const livers = basicData.data || [];
        
        // Subrequest制限対策
        const safeBatchSize = Math.min(batchSize, 1);
        const result = await processDetailsBatch(env, livers, safeBatchSize);
        
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
    
    // 認証テストエンドポイント
    if (url.pathname === '/test-login') {
      try {
        console.log('🔐 Testing login functionality...');
        const loginResult = await performRobustLogin(env);
        
        return new Response(JSON.stringify({
          success: loginResult.success,
          message: loginResult.success ? 'Login successful' : 'Login failed',
          error: loginResult.error || null,
          hasCredentials: {
            email: !!env.LOGIN_EMAIL,
            password: !!env.LOGIN_PASSWORD
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          hasCredentials: {
            email: !!env.LOGIN_EMAIL,
            password: !!env.LOGIN_PASSWORD
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // データ確認エンドポイント
    if (url.pathname === '/check-data') {
      try {
        // 基本データを取得
        const basicDataStr = await env.LIVER_DATA?.get('latest_basic_data');
        const detailedDataStr = await env.LIVER_DATA?.get('latest_detailed_data');
        const progressStr = await env.LIVER_DATA?.get('detail_processing_progress');
        
        const basicData = basicDataStr ? JSON.parse(basicDataStr) : null;
        const detailedData = detailedDataStr ? JSON.parse(detailedDataStr) : null;
        const progress = progressStr ? JSON.parse(progressStr) : null;
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            basicData: {
              exists: !!basicData,
              count: basicData?.data?.length || 0,
              timestamp: basicData?.timestamp,
              lastUpdate: basicData?.lastUpdate,
              sample: basicData?.data?.slice(0, 3) || [] // 最初の3件のサンプル
            },
            detailedData: {
              exists: !!detailedData,
              count: detailedData?.data?.length || 0,
              timestamp: detailedData?.timestamp,
              lastUpdate: detailedData?.lastUpdate,
              processed: detailedData?.processed || 0,
              errors: detailedData?.errors || 0
            },
            progress: {
              exists: !!progress,
              completed: progress?.completed?.length || 0,
              lastIndex: progress?.lastIndex || 0
            },
            environment: {
              hasLoginEmail: !!env.LOGIN_EMAIL,
              hasLoginPassword: !!env.LOGIN_PASSWORD,
              hasWorkerAuthToken: !!env.WORKER_AUTH_TOKEN,
              imageWorkerUrl: env.IMAGE_WORKER_URL || 'not set'
            }
          }
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

    // エラー詳細確認エンドポイント
    if (url.pathname === '/check-errors') {
      try {
        const progressStr = await env.LIVER_DATA?.get('detail_processing_progress');
        const progress = progressStr ? JSON.parse(progressStr) : null;
        
        if (!progress || !progress.completed) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No processing data found'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const erroredItems = progress.completed.filter(item => item.detailError);
        const successItems = progress.completed.filter(item => item.hasDetails);
        
        return new Response(JSON.stringify({
          success: true,
          summary: {
            total: progress.completed.length,
            errors: erroredItems.length,
            success: successItems.length,
            errorRate: `${Math.round(erroredItems.length / progress.completed.length * 100)}%`
          },
          errorDetails: erroredItems.map(item => ({
            name: item.name,
            detailUrl: item.detailUrl,
            error: item.detailError
          })),
          sampleSuccess: successItems.slice(0, 3)
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
        await env.LIVER_DATA?.delete('detail_processing_progress');
        await env.LIVER_DATA?.delete('login_session');
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Progress and session data cleared. Next run will start fresh.'
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
        const status = await env.LIVER_DATA.get('worker_status_details');
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
    
    return new Response('Not Found', { status: 404 });
  }
};

// 詳細情報をバッチ処理で取得
async function processDetailsBatch(env, livers, batchSize = 1) {
  console.log(`🔍 Starting batch detail processing: ${livers.length} livers, batch size: ${batchSize}`);
  
  let processed = 0;
  let errors = 0;
  const detailedLivers = [];
  
  // セッション管理: 既存のセッションをチェック
  let loginResult = await getStoredSession(env);
  if (!loginResult || !loginResult.success) {
    // 新しいログイン実行
    loginResult = await performRobustLogin(env);
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }
    // セッションを保存
    await storeSession(env, loginResult);
  } else {
    console.log('🔄 Reusing stored session');
  }
  
  await updateWorkerStatus(env, 'details', 'in_progress', {
    total: livers.length,
    processed: 0,
    errors: 0
  });
  
  // バッチごとに処理
  for (let i = 0; i < livers.length; i += batchSize) {
    const batch = livers.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(livers.length / batchSize)}: ${batch.length} livers`);
    
    // バッチ内で逐次処理（並列処理を停止してSubrequest制限を回避）
    for (const liver of batch) {
      try {
        const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, loginResult.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', env, loginResult);
        
        if (detailInfo) {
          const detailedLiver = {
            ...liver,
            ...detailInfo,
            hasDetails: true,
            detailScrapedAt: new Date().toISOString()
          };
          detailedLivers.push(detailedLiver);
          processed++;
          
          console.log(`✅ ${liver.name} - Details collected`);
        } else {
          console.log(`⚠️ ${liver.name} - No details found`);
          detailedLivers.push({
            ...liver,
            hasDetails: false
          });
        }
        
        // 個別リクエスト間の待機時間を短縮（セッション維持のため）
        await sleep(500);
        
      } catch (error) {
        console.error(`❌ ${liver.name} - Detail scraping failed:`, error.message);
        
        // 認証エラーの場合は再ログイン試行
        if (error.message.includes('認証失敗') || error.message.includes('ログインページ')) {
          console.log('🔄 Authentication failed, attempting re-login...');
          try {
            loginResult = await performRobustLogin(env);
            if (loginResult.success) {
              await storeSession(env, loginResult);
              console.log('✅ Re-login successful, continuing...');
              // 再ログイン成功時はスキップ（次のバッチで再試行）
            }
          } catch (reloginError) {
            console.error('❌ Re-login failed:', reloginError.message);
          }
        }
        
        errors++;
        // エラーでも基本情報は保持
        detailedLivers.push({
          ...liver,
          hasDetails: false,
          detailError: error.message
        });
      }
    }
    
    // 進捗更新
    await updateWorkerStatus(env, 'details', 'in_progress', {
      total: livers.length,
      processed: processed,
      errors: errors,
      currentBatch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(livers.length / batchSize)
    });
    
    // バッチ間の待機時間を延長（Subrequest制限対策）
    if (i + batchSize < livers.length) {
      console.log('⏱️ Waiting between batches...');
      await sleep(10000); // 5秒から10秒に延長
    }
  }
  
  // 詳細データを保存
  if (env.LIVER_DATA && detailedLivers.length > 0) {
    await env.LIVER_DATA.put('latest_detailed_data', JSON.stringify({
      timestamp: Date.now(),
      total: detailedLivers.length,
      data: detailedLivers,
      lastUpdate: new Date().toISOString(),
      processed: processed,
      errors: errors
    }));
    console.log(`💾 Saved detailed data: ${detailedLivers.length} livers`);
  }
  
  console.log(`✅ Batch processing completed: ${processed} successful, ${errors} errors`);
  return { processed, errors, total: livers.length };
}

// 詳細ページをスクレイピング（バックアップファイルから復元）
async function scrapeDetailPageWithAuth(detailUrl, cookies, userAgent, env, loginResult = null) {
  try {
    console.log(`🔍 Accessing detail page: ${detailUrl}`);
    console.log(`🍪 Using cookies (length: ${cookies.length})`);
    
    const response = await fetch(detailUrl, {
      headers: {
        'Cookie': cookies,
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.comisapolive.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    console.log(`📄 Detail response: ${response.status} -> ${response.url}`);
    
    if (!response.ok) {
      console.error(`Failed to fetch detail page: ${response.status}`);
      return { 
        success: false,
        error: `HTTP ${response.status}` 
      };
    }
    
    const html = await response.text();
    
    // ログインが必要かより厳密にチェック
    const requiresLogin = (
      response.url.includes('login') ||
      html.includes('パスワード') ||
      html.includes('ログインが必要') ||
      html.includes('認証が必要') ||
      (html.includes('ログイン') && html.length < 5000) || // 小さなページはログインページの可能性
      html.includes('ログインページ')
    );

    if (requiresLogin) {
      console.log('⚠️ Authentication required for this detail page');
      return {
        success: false,
        requiresLogin: true
      };
    }
    
    const detailInfo = {};
    
    // 全ての詳細情報を抽出
    try {
      // カテゴリ：liverProf_tag
      const categories = extractTextFromClass(html, 'liverProf_tag');
      if (categories.length > 0) detailInfo.categories = categories;
      
      // ライバー名：liverProf_name
      const detailName = extractTextFromClass(html, 'liverProf_name');
      if (detailName.length > 0) detailInfo.detailName = detailName[0];
      
      // フォロワー数：liverProf_follwer
      const detailFollowers = extractTextFromClass(html, 'liverProf_follwer');
      if (detailFollowers.length > 0) detailInfo.detailFollowers = detailFollowers[0];
      
      // プロフィール画像：liverImage_views
      const profileImages = await extractImagesFromClass(html, 'liverImage_views', env);
      if (profileImages.length > 0) detailInfo.profileImages = profileImages;
      
      // コラボ配信判定：liverProf_collaboOKクラスの有無で判定
      const collaboOKElements = extractTextFromClass(html, 'liverProf_collaboOK');
      if (collaboOKElements.length > 0) {
        // OKクラスが存在する場合
        detailInfo.collaborationStatus = 'OK';
        detailInfo.collaborationComment = collaboOKElements[0]; // コメント内容も保存
      } else {
        // OKクラスが存在しない場合はNG判定
        detailInfo.collaborationStatus = 'NG';
        // NGのコメントがあれば取得
        const collaboNGElements = extractTextFromClass(html, 'liverProf_collaboNG');
        if (collaboNGElements.length > 0) {
          detailInfo.collaborationComment = collaboNGElements[0];
        } else {
          detailInfo.collaborationComment = 'コラボ配信に関する記載なし';
        }
      }
      
      // 各媒体リンク：liverProf_info
      const mediaLinks = extractLinksFromClass(html, 'liverProf_info');
      if (mediaLinks.length > 0) detailInfo.mediaLinks = mediaLinks;
      
      // プロフィール情報（性別、配信歴、生年月日）：liverProf_prof
      const profileTexts = extractTextFromClass(html, 'liverProf_prof');
      if (profileTexts.length > 0) {
        detailInfo.profileInfo = parseProfileInfo(profileTexts);
        detailInfo.rawProfileTexts = profileTexts; // デバッグ用
      }
      
      // イベント情報：liverEvent_scheduleTxt
      const eventInfo = extractTextFromClass(html, 'liverEvent_scheduleTxt');
      if (eventInfo.length > 0) detailInfo.eventInfo = eventInfo;
      
      // ライバーコメント：liverComment_body
      const comments = extractTextFromClass(html, 'liverComment_body');
      if (comments.length > 0) detailInfo.comments = comments;
      
      // 配信媒体・URL・登録者数：schedules_name, schedules_id, schedules_follwer
      const scheduleInfo = extractScheduleInfo(html);
      if (scheduleInfo.length > 0) detailInfo.schedules = scheduleInfo;
      
      // 🔗 schedules_idクラス専用URL抽出（詳細な配信先情報）
      const scheduleUrls = extractSchedulesIdUrls(html);
      if (scheduleUrls.length > 0) {
        detailInfo.streamingUrls = scheduleUrls;
        console.log(`📺 ${scheduleUrls.length} streaming URLs extracted: ${scheduleUrls.map(u => u.type).join(', ')}`);
      }
      
      // 性別データの特別検索
      const genderSearch = findGenderData(html);
      if (genderSearch && genderSearch.gender) {
        detailInfo.genderFound = genderSearch;
        if (!detailInfo.profileInfo) detailInfo.profileInfo = {};
        if (!detailInfo.profileInfo.gender) {
          detailInfo.profileInfo.gender = genderSearch.gender;
        }
      }
      
    } catch (extractError) {
      console.error('Detail extraction error:', extractError);
      detailInfo.extractionError = extractError.message;
    }
    
    return {
      success: true,
      details: detailInfo,
      htmlLength: html.length
    };
    
  } catch (error) {
    console.error(`Error scraping detail page ${detailUrl}:`, error);
    return { 
      success: false,
      error: error.message 
    };
  }
}

// Worker3（画像取得）をトリガー
async function triggerImageWorker(env) {
  try {
    console.log('🔄 Triggering image worker...');
    
    const imageWorkerUrl = env.IMAGE_WORKER_URL;
    if (!imageWorkerUrl) {
      console.log('⚠️ IMAGE_WORKER_URL not configured, skipping image trigger');
      return;
    }
    
    const response = await fetch(`${imageWorkerUrl}/start-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.WORKER_AUTH_TOKEN || 'default-token'}`
      },
      body: JSON.stringify({
        trigger: 'detail-worker',
        timestamp: Date.now()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to trigger image worker: ${response.status}`);
    }
    
    console.log('✅ Image worker triggered successfully');
    
  } catch (error) {
    console.error('❌ Failed to trigger image worker:', error.message);
    // エラーでも処理を継続
  }
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

async function performRobustLogin(env) {
  try {
    console.log('🔐 Starting login process...');
    
    // 1. ログインページを取得
    const loginPageResponse = await fetch('https://www.comisapolive.com/login/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });
    
    if (!loginPageResponse.ok) {
      return { success: false, error: `Login page failed: ${loginPageResponse.status}` };
    }
    
    const loginPageHtml = await loginPageResponse.text();
    const loginPageCookies = loginPageResponse.headers.get('set-cookie') || '';
    
    // 2. フォーム情報を抽出
    const csrfToken = extractCSRFToken(loginPageHtml);
    const hiddenFields = extractHiddenFields(loginPageHtml);
    const actionUrl = extractFormAction(loginPageHtml) || 'https://www.comisapolive.com/login/';
    
    console.log('📝 Form analysis complete:', {
      csrf: !!csrfToken,
      hidden: Object.keys(hiddenFields).length,
      action: actionUrl.includes('login')
    });
    
    // 3. ログインデータを準備
    const loginData = new URLSearchParams();
    
    // 環境変数から認証情報を取得（fallback付き）
    const email = env.LOGIN_EMAIL || 'comisapolive@gmail.com';
    const password = env.LOGIN_PASSWORD || 'cord3cord3';
    
    // 複数のフィールド名パターンを試行
    const emailFields = ['email', 'username', 'login_id', 'user_email', 'mail'];
    const passwordFields = ['password', 'passwd', 'pass', 'login_password'];
    
    emailFields.forEach(field => {
      loginData.append(field, email);
    });
    
    passwordFields.forEach(field => {
      loginData.append(field, password);
    });
    
    // CSRF対応
    if (csrfToken) {
      const csrfFields = ['csrf_token', '_token', 'authenticity_token', 'csrfmiddlewaretoken'];
      csrfFields.forEach(field => {
        loginData.append(field, csrfToken);
      });
    }
    
    // hidden フィールド追加
    Object.entries(hiddenFields).forEach(([name, value]) => {
      loginData.append(name, value);
    });
    
    // 4. ログイン実行
    const loginResponse = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.comisapolive.com/login/',
        'Origin': 'https://www.comisapolive.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cookie': loginPageCookies
      },
      body: loginData.toString(),
      redirect: 'manual'
    });
    
    const loginResponseCookies = loginResponse.headers.get('set-cookie') || '';
    const allCookies = combineCookies(loginPageCookies, loginResponseCookies);

    // デバッグ情報を追加
    console.log('🔍 Login response analysis:', {
      status: loginResponse.status,
      url: loginResponse.url,
      hasSetCookie: !!loginResponseCookies,
      cookieLength: loginResponseCookies.length,
      totalCookieLength: allCookies.length
    });

    // 5. 成功判定の変数初期化
    let success = false;
    let method = '';
    
    // リダイレクト判定
    if (loginResponse.status >= 300 && loginResponse.status < 400) {
      const location = loginResponse.headers.get('location');
      console.log('📍 Redirect detected:', { 
        location, 
        hasLogin: location?.includes('login'),
        hasError: location?.includes('error')
      });
      
      if (location && !location.includes('login') && !location.includes('error')) {
        success = true;
        method = 'redirect';
      }
    }
    
    // レスポンス内容判定
    if (!success) {
      const loginResponseText = await loginResponse.text();
      console.log('📄 Response preview (first 300 chars):', loginResponseText.substring(0, 300));
      console.log('📊 Response length:', loginResponseText.length);
      
      const successPatterns = ['dashboard', 'マイページ', 'ログアウト', 'menu', 'profile', 'liver', '設定', 'ホーム', 'アカウント'];
      const failurePatterns = ['ログインに失敗', 'パスワードが間違', '認証に失敗', 'error', 'エラー', 'ログイン画面', 'パスワード', 'メールアドレス'];
      
      const hasSuccess = successPatterns.some(pattern => 
        loginResponseText.toLowerCase().includes(pattern.toLowerCase())
      );
      const hasFailure = failurePatterns.some(pattern => 
        loginResponseText.toLowerCase().includes(pattern.toLowerCase())
      );
      
      console.log('🎯 Pattern matching:', { 
        hasSuccess, 
        hasFailure,
        foundSuccess: successPatterns.filter(p => loginResponseText.toLowerCase().includes(p.toLowerCase())),
        foundFailure: failurePatterns.filter(p => loginResponseText.toLowerCase().includes(p.toLowerCase()))
      });
      
      if (hasSuccess && !hasFailure) {
        success = true;
        method = 'content';
      }
    }
    
    // Cookie判定
    if (!success && allCookies.length > loginPageCookies.length) {
      const sessionPatterns = ['session', 'auth', 'login', 'token', 'user'];
      const hasSessionCookie = sessionPatterns.some(pattern =>
        allCookies.toLowerCase().includes(pattern)
      );
      
      if (hasSessionCookie) {
        success = true;
        method = 'cookie';
      }
    }

    // より緩い成功判定（最後の手段）
    if (!success && loginResponse.status === 200) {
      const loginResponseText = await loginResponse.text();
      // ログインページの特徴がない場合は成功とみなす
      if (!loginResponseText.includes('パスワード') && 
        !loginResponseText.includes('ログイン') && 
        loginResponseText.length > 1000) {
        success = true;
        method = 'fallback';
        console.log('🎲 Using fallback success detection - no login indicators found');
      }
    }
    
    console.log(`🔐 Login result: ${success ? '✅ SUCCESS' : '❌ FAILED'} (${method})`);
    
    return {
      success,
      cookies: allCookies,
      method,
      error: success ? null : 'Login failed - no success indicators found'
    };
    
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}


function combineCookies(cookies1, cookies2) {
  console.log('🍪 Raw cookies1:', cookies1);
  console.log('🍪 Raw cookies2:', cookies2);
  
  let finalCookies = '';
  
  if (cookies2 && cookies2.includes('SESS_PUBLISH')) {
    // cookies2から最新のSESS_PUBLISHを抽出
    const sessMatches = cookies2.match(/SESS_PUBLISH=([^;,]+)/g);
    if (sessMatches && sessMatches.length > 0) {
      // 最後のマッチを使用
      finalCookies = sessMatches[sessMatches.length - 1];
      console.log('🍪 Using latest SESS_PUBLISH:', finalCookies);
    }
  } else if (cookies1 && cookies1.includes('SESS_PUBLISH')) {
    // cookies1から抽出
    const sessMatch = cookies1.match(/SESS_PUBLISH=([^;,]+)/);
    if (sessMatch) {
      finalCookies = `SESS_PUBLISH=${sessMatch[1]}`;
      console.log('🍪 Using cookies1 SESS_PUBLISH:', finalCookies);
    }
  }
  
  return finalCookies;
}

// 補助関数：リンク抽出
function extractLinksFromClass(html, className) {
  const results = [];
  const pattern = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\/[^>]+>`, 'g');
  let match;
  
  while ((match = pattern.exec(html)) !== null) {
    const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    let linkMatch;
    
    while ((linkMatch = linkPattern.exec(match[1])) !== null) {
      results.push({
        url: linkMatch[1],
        text: linkMatch[2].trim()
      });
    }
  }
  
  return results;
}

// 補助関数：画像抽出（簡易版）
async function extractImagesFromClass(html, className, env) {
  const results = [];
  const pattern = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\/[^>]+>`, 'g');
  let match;
  let imageIndex = 0;
  
  while ((match = pattern.exec(html)) !== null) {
    const imgPattern = /<img[^>]*src="([^"]*)"[^>]*>/g;
    let imgMatch;
    
    while ((imgMatch = imgPattern.exec(match[1])) !== null) {
      const imageUrl = imgMatch[1];
      const fullImageUrl = imageUrl.startsWith('/') 
        ? `https://www.comisapolive.com${imageUrl}` 
        : imageUrl;
      
      results.push({
        url: fullImageUrl,
        originalUrl: fullImageUrl
      });
      
      imageIndex++;
    }
  }
  
  return results;
}

// 補助関数：スケジュール情報抽出
function extractScheduleInfo(html) {
  const schedules = [];
  
  // schedules_name, schedules_id, schedules_follwer を同時に抽出
  const schedulePattern = /<[^>]*class="[^"]*schedules_name[^"]*"[^>]*>([^<]*)<\/[^>]*>[\s\S]*?<[^>]*class="[^"]*schedules_id[^"]*"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<[^>]*class="[^"]*schedules_follwer[^"]*"[^>]*>([^<]*)<\/[^>]*>/g;
  let match;
  
  while ((match = schedulePattern.exec(html)) !== null) {
    schedules.push({
      name: match[1].trim(),
      url: match[2],
      followers: match[3].trim()
    });
  }
  
  // 個別に抽出する方法も併用
  if (schedules.length === 0) {
    const names = extractTextFromClass(html, 'schedules_name');
    const urls = extractLinksFromClass(html, 'schedules_id');
    const followers = extractTextFromClass(html, 'schedules_follwer');
    
    const maxLength = Math.max(names.length, urls.length, followers.length);
    for (let i = 0; i < maxLength; i++) {
      schedules.push({
        name: names[i] || '',
        url: urls[i]?.url || '',
        followers: followers[i] || ''
      });
    }
  }
  
  return schedules;
}

// 🔗 schedules_idクラス専用URL抽出関数
function extractSchedulesIdUrls(html) {
  const urls = [];
  
  // 方法1: schedules_idクラスから直接href属性を抽出
  const scheduleIdPattern = /<[^>]*class="[^"]*schedules_id[^"]*"[^>]*href="([^"]*)"[^>]*>/g;
  let match;
  
  while ((match = scheduleIdPattern.exec(html)) !== null) {
    const url = match[1].trim();
    if (url && url !== '#') {
      urls.push({
        url: url,
        type: detectUrlType(url),
        source: 'schedules_id_direct'
      });
    }
  }
  
  // 方法2: schedules_idクラス内のaタグからhref抽出
  const scheduleIdSectionPattern = /<[^>]*class="[^"]*schedules_id[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;
  let sectionMatch;
  
  while ((sectionMatch = scheduleIdSectionPattern.exec(html)) !== null) {
    const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>/g;
    let linkMatch;
    
    while ((linkMatch = linkPattern.exec(sectionMatch[1])) !== null) {
      const url = linkMatch[1].trim();
      if (url && url !== '#') {
        // 重複チェック
        const exists = urls.some(item => item.url === url);
        if (!exists) {
          urls.push({
            url: url,
            type: detectUrlType(url),
            source: 'schedules_id_nested'
          });
        }
      }
    }
  }
  
  return urls;
}

// 🎯 URL種別判定関数
function detectUrlType(url) {
  if (!url) return 'unknown';
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  } else if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'twitter';
  } else if (urlLower.includes('twitch.tv')) {
    return 'twitch';
  } else if (urlLower.includes('instagram.com')) {
    return 'instagram';
  } else if (urlLower.includes('tiktok.com')) {
    return 'tiktok';
  } else if (urlLower.includes('discord.gg') || urlLower.includes('discord.com')) {
    return 'discord';
  } else if (urlLower.includes('niconico.com') || urlLower.includes('nicovideo.jp')) {
    return 'niconico';
  } else if (urlLower.includes('openrec.tv')) {
    return 'openrec';
  } else if (urlLower.includes('mildom.com')) {
    return 'mildom';
  } else if (urlLower.includes('showroom-live.com')) {
    return 'showroom';
  } else if (urlLower.includes('17live.co') || urlLower.includes('17.live')) {
    return '17live';
  } else if (urlLower.includes('mirrativ.com')) {
    return 'mirrativ';
  } else if (urlLower.startsWith('http')) {
    return 'web';
  } else {
    return 'other';
  }
}

// HTMLパースing関数群
function findGenderData(html) {
  const genderPatterns = [
    { pattern: /性別\s*[:：]\s*([男女性]\w*)/i, confidence: 0.9 },
    { pattern: /gender\s*[:：]\s*([男女])/i, confidence: 0.8 },
    { pattern: /(男性|女性|男|女)/i, confidence: 0.6 }
  ];
  
  for (const { pattern, confidence } of genderPatterns) {
    const match = html.match(pattern);
    if (match) {
      const gender = match[1].includes('女') ? '女性' : 
                   match[1].includes('男') ? '男性' : match[1];
      return { gender, confidence };
    }
  }
  
  return null;
}

function extractTextFromClass(html, className) {
  const regex = new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</[^>]*>`, 'gi');
  const matches = [];
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const content = match[1].replace(/<[^>]*>/g, '').trim();
    if (content) {
      matches.push(content);
    }
  }
  
  return matches;
}

function parseProfileInfo(profileTexts) {
  const info = {};
  
  profileTexts.forEach(text => {
    const ageMatch = text.match(/年齢\s*[:：]\s*(\d+)/);
    if (ageMatch) info.age = parseInt(ageMatch[1]);
    
    const heightMatch = text.match(/身長\s*[:：]\s*(\d+)/);
    if (heightMatch) info.height = parseInt(heightMatch[1]);
    
    const birthdayMatch = text.match(/誕生日\s*[:：]\s*([^\n]+)/);
    if (birthdayMatch) info.birthday = birthdayMatch[1].trim();
    
    const hobbyMatch = text.match(/趣味\s*[:：]\s*([^\n]+)/);
    if (hobbyMatch) info.hobbies = hobbyMatch[1].trim();
  });
  
  return info;
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

// 基本データと詳細データを統合してアプリ用のlatest_dataを更新
async function integrateDataForApp(env, detailedLivers) {
  try {
    console.log('🔄 Starting data integration for app...');

    // 基本データを取得
    const basicDataStr = await env.LIVER_DATA?.get('latest_basic_data');
    if (!basicDataStr) {
      console.log('⚠️ No basic data found for integration');
      return;
    }

    const basicData = JSON.parse(basicDataStr);
    const basicLivers = basicData.data || [];

    // 詳細データをoriginalIdでインデックス化
    const detailsMap = new Map();
    detailedLivers.forEach(liver => {
      if (liver.originalId) {
        detailsMap.set(liver.originalId, liver);
      }
    });

    // 基本データに詳細データをマージ
    const integratedData = basicLivers.map(basicLiver => {
      const details = detailsMap.get(basicLiver.originalId);

      if (details && details.hasDetails) {
        // 詳細データが存在する場合はマージ
        return {
          ...basicLiver,
          ...details,
          // 重要なフィールドを明示的に統合
          id: basicLiver.originalId, // originalIdを使用
          imageUrl: `/api/images/${basicLiver.originalId}.jpg`,
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

    // 統合済みデータをlatest_dataに保存
    const integratedResult = {
      success: true,
      total: integratedData.length,
      data: integratedData,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      integration: {
        basicCount: basicLivers.length,
        detailCount: detailedLivers.length,
        withDetails: integratedData.filter(l => l.hasDetails).length,
        pending: integratedData.filter(l => !l.hasDetails).length
      }
    };

    await env.LIVER_DATA?.put('latest_data', JSON.stringify(integratedResult));
    console.log(`✅ Data integration completed: ${integratedData.length} total, ${integratedResult.integration.withDetails} with details`);

  } catch (error) {
    console.error('❌ Data integration failed:', error);
    // 統合失敗時はエラーをログに記録するが処理は継続
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ユニークID生成関数
function generateUniqueId(liver) {
  // originalIdを基準にユニークIDを生成
  const originalId = liver.originalId || liver.id;
  const pageNumber = liver.page || liver.pageNumber || 1;
  const cleanName = liver.name ? liver.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : 'liver';
  
  // originalIdを含めることで一意性を保証
  return `${cleanName}_${originalId}_p${pageNumber}_${Date.now()}`;
}

// CPU時間制限対応：小さなバッチで段階的処理
async function processSmallBatch(env, livers, maxItems = 3) {
  console.log(`🔍 Starting small batch processing: ${livers.length} total livers, max ${maxItems} per execution`);
  
  // 処理済み状態を取得
  const progressKey = 'detail_processing_progress';
  const progressStr = await env.LIVER_DATA?.get(progressKey);
  let processed = progressStr ? JSON.parse(progressStr) : { completed: [], lastIndex: 0 };
  
  // 未処理のライバーを特定
  const startIndex = processed.lastIndex || 0;
  const batchLivers = livers.slice(startIndex, startIndex + maxItems);
  
  if (batchLivers.length === 0) {
    console.log('✅ All livers have been processed, resetting progress');
    await env.LIVER_DATA?.delete(progressKey);
    
    // Worker3をトリガー
    await triggerImageWorker(env);
    await updateWorkerStatus(env, 'details', 'completed', {
      processed: processed.completed.length,
      total: livers.length,
      timestamp: Date.now()
    });
    return;
  }
  
  console.log(`📦 Processing batch: ${startIndex + 1}-${startIndex + batchLivers.length} of ${livers.length}`);
  
  // ログインセッション取得
  let loginResult = await getStoredSession(env);
  if (!loginResult || !loginResult.success) {
    loginResult = await performRobustLogin(env);
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }
    await storeSession(env, loginResult);
  }
  
  let successCount = 0;
  let errorCount = 0;

  // タイムアウト監視設定（安全マージン）
  const TIMEOUT_LIMIT = 30000; // 30秒制限
  const startTime = Date.now();

  // 最適化されたバッチ処理
  for (const liver of batchLivers) {
    // タイムアウトチェック
    if (Date.now() - startTime > TIMEOUT_LIMIT) {
      console.log('⏱️ Timeout approaching, saving progress and exiting...');
      break;
    }
    try {
      const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, loginResult.userAgent, env, loginResult);
      
      if (detailInfo) {
        // ユニークIDと画像URLを生成
        const uniqueId = generateUniqueId(liver);
        const imageUrl = `/api/images/${liver.originalId}.jpg`;
        
        const detailedLiver = {
          ...liver,
          ...detailInfo,
          id: uniqueId,
          imageUrl: imageUrl,
          updatedAt: Date.now(),
          hasDetails: true,
          detailScrapedAt: new Date().toISOString()
        };
        
        processed.completed.push(detailedLiver);
        successCount++;
        console.log(`✅ ${liver.name} - Details collected (ID: ${uniqueId})`);
      } else {
        // 詳細情報がない場合もユニークIDを生成
        const uniqueId = generateUniqueId(liver);
        const imageUrl = `/api/images/${liver.originalId}.jpg`;
        
        processed.completed.push({
          ...liver,
          id: uniqueId,
          imageUrl: imageUrl,
          updatedAt: Date.now(),
          hasDetails: false
        });
        console.log(`⚠️ ${liver.name} - No details found (ID: ${uniqueId})`);
      }
      
      // リクエスト間の待機を短縮してセッション維持
      await sleep(500);
      
    } catch (error) {
      console.error(`❌ ${liver.name} - Detail scraping failed:`, error.message);
      
      // 認証失敗時は再ログイン
      if (error.message.includes('認証失敗')) {
        try {
          loginResult = await performRobustLogin(env);
          if (loginResult.success) {
            await storeSession(env, loginResult);
            console.log('🔄 Re-login successful');
          }
        } catch (reloginError) {
          console.error('❌ Re-login failed:', reloginError.message);
        }
      }
      
      // エラー時もユニークIDを生成
      const uniqueId = generateUniqueId(liver);
      const imageUrl = `/api/images/${liver.originalId}.jpg`;
      
      processed.completed.push({
        ...liver,
        id: uniqueId,
        imageUrl: imageUrl,
        updatedAt: Date.now(),
        hasDetails: false,
        detailError: error.message
      });
      errorCount++;
    }
  }
  
  // 進捗を保存
  processed.lastIndex = startIndex + batchLivers.length;
  await env.LIVER_DATA?.put(progressKey, JSON.stringify(processed));
  
  // 詳細データを保存
  if (processed.completed.length > 0) {
    await env.LIVER_DATA?.put('latest_detailed_data', JSON.stringify({
      timestamp: Date.now(),
      total: processed.completed.length,
      data: processed.completed,
      lastUpdate: new Date().toISOString(),
      processed: processed.completed.filter(l => l.hasDetails).length,
      errors: processed.completed.filter(l => l.detailError).length
    }));

    // 基本データと統合してアプリ用のlatest_dataを更新
    await integrateDataForApp(env, processed.completed);
  }
  
  // 進捗状況を更新
  await updateWorkerStatus(env, 'details', 'in_progress', {
    total: livers.length,
    processed: processed.completed.length,
    successCount: successCount,
    errorCount: errorCount,
    lastBatch: `${startIndex + 1}-${startIndex + batchLivers.length}`,
    nextExecution: processed.lastIndex < livers.length ? 'scheduled in 2 hours' : 'completed'
  });
  
  console.log(`✅ Small batch completed: ${successCount} success, ${errorCount} errors`);
  console.log(`📊 Overall progress: ${processed.completed.length}/${livers.length} (${Math.round(processed.completed.length/livers.length*100)}%)`);
}

// セッション管理関数群
async function getStoredSession(env) {
  if (!env.LIVER_DATA) return null;
  
  try {
    const sessionData = await env.LIVER_DATA.get('login_session');
    if (!sessionData) return null;
    
    const session = JSON.parse(sessionData);
    const now = Date.now();
    const sessionAge = now - session.timestamp;
    const maxAge = 30 * 60 * 1000; // 30分
    
    if (sessionAge > maxAge) {
      console.log('🔄 Stored session expired');
      await env.LIVER_DATA.delete('login_session');
      return null;
    }
    
    console.log(`🔄 Found valid session (age: ${Math.round(sessionAge / 1000)}s)`);
    return session;
  } catch (error) {
    console.error('❌ Failed to get stored session:', error.message);
    return null;
  }
}

async function storeSession(env, loginResult) {
  if (!env.LIVER_DATA || !loginResult.success) return;
  
  try {
    const sessionData = {
      success: true,
      cookies: loginResult.cookies,
      timestamp: Date.now()
    };
    
    await env.LIVER_DATA.put('login_session', JSON.stringify(sessionData), {
      expirationTtl: 30 * 60 // 30分でTTL設定
    });
    
    console.log('💾 Session stored successfully');
  } catch (error) {
    console.error('❌ Failed to store session:', error.message);
  }
}