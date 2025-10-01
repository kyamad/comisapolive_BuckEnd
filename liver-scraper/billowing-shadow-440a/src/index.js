// 画像URL重複修正関数
function fixDuplicateImageUrls(liverData) {
  console.log('🔧 Starting duplicate image URL fix...');
  
  // 画像URLの使用状況をマッピング
  const imageUrlMap = new Map();
  
  // 1. 画像URLの重複を特定
  liverData.forEach(liver => {
    if (liver.imageUrl && liver.imageUrl !== null) {
      if (!imageUrlMap.has(liver.imageUrl)) {
        imageUrlMap.set(liver.imageUrl, []);
      }
      imageUrlMap.get(liver.imageUrl).push(liver);
    }
  });
  
  let duplicatesFixed = 0;
  let totalDuplicateGroups = 0;
  
  // 2. 重複している画像URLを処理
  imageUrlMap.forEach((users, imageUrl) => {
    if (users.length > 1) {
      totalDuplicateGroups++;
      console.log(`⚠️ Duplicate imageUrl found: ${imageUrl} used by ${users.length} users:`);
      users.forEach(user => console.log(`  - ${user.name} (${user.id})`));
      
      // 最初のユーザーは元の画像URLを保持、他は修正
      for (let i = 1; i < users.length; i++) {
        const user = users[i];
        const originalImageUrl = user.imageUrl;
        
        // ユニークな画像URLを生成
        const uniqueImageUrl = generateUniqueImageUrl(originalImageUrl, user.id);
        user.imageUrl = uniqueImageUrl;
        
        // 重複フラグを追加（デバッグ用）
        user.duplicateImageFixed = {
          original: originalImageUrl,
          fixed: uniqueImageUrl,
          fixedAt: new Date().toISOString()
        };
        
        duplicatesFixed++;
        console.log(`✅ Fixed duplicate for ${user.name}: ${originalImageUrl} → ${uniqueImageUrl}`);
      }
    }
  });
  
  console.log(`🎯 Duplicate fix summary: ${duplicatesFixed} URLs fixed in ${totalDuplicateGroups} groups`);
  
  return liverData;
}

// ユニークな画像URL生成
function generateUniqueImageUrl(originalUrl, liverId) {
  // /api/images/_p1_030445.jpg → /api/images/_p1_030445_432648.jpg
  const urlParts = originalUrl.split('.');
  const extension = urlParts.pop();
  const baseUrl = urlParts.join('.');
  
  // ライバーIDから一意識別子を生成
  const uniqueId = liverId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  
  return `${baseUrl}_${uniqueId}.${extension}`;
}

// データマッピング問題修正関数
async function fixDataMappingIssues(liverData, env) {
  console.log('🔧 Starting comprehensive data mapping fix...');
  
  const stats = {
    totalProcessed: liverData.length,
    mappingIssuesFound: 0,
    mappingIssuesFixed: 0,
    integrityChecksPerformed: 0,
    reScrapedProfiles: 0
  };
  
  const fixedMappings = [];
  const detailReport = [];
  
  // 1. 基本整合性チェック
  const integrityIssues = [];
  
  for (const liver of liverData) {
    stats.integrityChecksPerformed++;
    
    // name と detailName の不一致チェック
    if (liver.detailName && liver.name !== liver.detailName) {
      // コメントや画像URLから実際の人物を特定
      const suspectedIssue = {
        originalId: liver.originalId,
        name: liver.name,
        detailName: liver.detailName,
        issueType: 'name_detailname_mismatch',
        comments: liver.comments ? liver.comments[0]?.substring(0, 100) : null,
        profileImageUrl: liver.profileImages?.[0]?.originalUrl
      };
      
      // 特定のパターンで問題を検出
      if (liver.comments && liver.comments.length > 0) {
        const comment = liver.comments[0].toLowerCase();
        const detailNameLower = (liver.detailName || '').toLowerCase();
        const nameLower = liver.name.toLowerCase();
        
        // コメントに detailName が含まれているが name と異なる場合
        if (comment.includes(detailNameLower) && !comment.includes(nameLower)) {
          suspectedIssue.severity = 'high';
          suspectedIssue.confidence = 'high';
          suspectedIssue.reason = 'comment_contains_detailname_not_name';
        }
      }
      
      integrityIssues.push(suspectedIssue);
      stats.mappingIssuesFound++;
    }
  }
  
  console.log(`🔍 Found ${integrityIssues.length} potential mapping issues`);
  
  // 2. 高信頼度の問題を修正
  const highConfidenceIssues = integrityIssues.filter(issue => issue.confidence === 'high');
  
  for (const issue of highConfidenceIssues) {
    try {
      // 実際のウェブページから正しいデータを再取得
      const correctData = await reScrapeLiverProfile(issue.originalId, env);
      
      if (correctData.success) {
        // データを修正
        const liverIndex = liverData.findIndex(l => l.originalId === issue.originalId);
        if (liverIndex !== -1) {
          const originalLiver = { ...liverData[liverIndex] };
          
          // 正しいデータで更新
          liverData[liverIndex] = {
            ...liverData[liverIndex],
            detailName: correctData.data.detailName,
            comments: correctData.data.comments,
            profileImages: correctData.data.profileImages || liverData[liverIndex].profileImages,
            // 基本情報は維持（スクレイピング精度を考慮）
            name: liverData[liverIndex].name, // 元の name は信頼できる場合が多い
            dataFixed: {
              fixedAt: new Date().toISOString(),
              fixedFields: ['detailName', 'comments', 'profileImages'],
              originalDetailName: originalLiver.detailName,
              originalComments: originalLiver.comments
            }
          };
          
          fixedMappings.push({
            originalId: issue.originalId,
            name: liverData[liverIndex].name,
            changes: {
              detailName: {
                from: originalLiver.detailName,
                to: correctData.data.detailName
              },
              comments: {
                from: originalLiver.comments?.[0]?.substring(0, 50) || null,
                to: correctData.data.comments?.[0]?.substring(0, 50) || null
              }
            }
          });
          
          stats.mappingIssuesFixed++;
          stats.reScrapedProfiles++;
          
          console.log(`✅ Fixed mapping for ${liverData[liverIndex].name} (${issue.originalId})`);
        }
      }
      
      // 過負荷防止
      await sleep(1000);
      
    } catch (error) {
      console.error(`❌ Failed to fix mapping for originalId ${issue.originalId}:`, error.message);
      detailReport.push({
        originalId: issue.originalId,
        error: error.message,
        action: 'fix_attempt_failed'
      });
    }
  }
  
  // 3. 残りの問題のレポート
  const unfixedIssues = integrityIssues.filter(issue => 
    !fixedMappings.find(fixed => fixed.originalId === issue.originalId)
  );
  
  detailReport.push(...unfixedIssues.map(issue => ({
    originalId: issue.originalId,
    name: issue.name,
    detailName: issue.detailName,
    issueType: issue.issueType,
    severity: issue.severity || 'medium',
    action: 'identified_not_auto_fixed'
  })));
  
  console.log(`🎯 Mapping fix summary: ${stats.mappingIssuesFixed}/${stats.mappingIssuesFound} issues fixed`);
  
  return {
    correctedData: liverData,
    stats,
    fixedMappings,
    detailReport
  };
}

// ライバープロフィール再取得関数
async function reScrapeLiverProfile(originalId, env) {
  try {
    console.log(`🔄 Re-scraping profile for originalId: ${originalId}`);
    
    // ログイン実行
    const loginResult = await performRobustLogin(env);
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }
    
    // 詳細ページURL構築
    const detailUrl = `https://www.comisapolive.com/liver/detail/${originalId}/`;
    
    // 詳細ページ取得
    const response = await fetch(detailUrl, {
      headers: {
        'Cookie': loginResult.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://www.comisapolive.com/liver/list/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${detailUrl}`);
    }
    
    const html = await response.text();
    
    // データ抽出
    const detailInfo = {};
    
    // ライバー名
    const detailName = extractTextFromClass(html, 'liverProf_name');
    if (detailName.length > 0) detailInfo.detailName = detailName[0];
    
    // コメント
    const comments = extractTextFromClass(html, 'liverProf_comment');
    if (comments.length > 0) detailInfo.comments = comments;
    
    // プロフィール画像
    const profileImages = await extractImagesFromClass(html, 'liverImage_views', env);
    if (profileImages.length > 0) detailInfo.profileImages = profileImages;
    
    return {
      success: true,
      data: detailInfo
    };
    
  } catch (error) {
    console.error(`❌ Re-scraping failed for originalId ${originalId}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Emergency Data Recovery & Unified Key Strategy
const DEPLOYMENT_VERSION = Date.now();
const DATA_KEYS = {
  CURRENT: 'liver_data_current',
  BACKUP: 'liver_data_backup',
  METADATA: 'liver_data_metadata'
};

async function emergencyDataRecovery(env) {
  console.log('🆘 EMERGENCY DATA RECOVERY INITIATED');

  try {
    // Step 1: Locate current valid data
    const basicDataStr = await env.LIVER_DATA.get('latest_basic_data');
    if (basicDataStr) {
      const basicData = JSON.parse(basicDataStr);
      console.log(`📊 Found basic data: ${basicData.data.length} items`);

      // Step 2: Restore to unified keys
      await writeUnifiedData(env, basicData.data);

      // Step 3: Clear conflicting keys
      await env.LIVER_DATA.delete('latest_data');

      console.log('✅ Emergency recovery completed');
      return { success: true, count: basicData.data.length };
    }

    console.log('⚠️ No recovery data found');
    return { success: false, error: 'No recovery data available' };
  } catch (error) {
    console.error('❌ Emergency recovery failed:', error);
    return { success: false, error: error.message };
  }
}

async function writeUnifiedData(env, data) {
  console.log('💾 Writing unified data structure...');

  const metadata = {
    timestamp: Date.now(),
    version: DEPLOYMENT_VERSION,
    count: data.length,
    hasDetailsCount: data.filter(item => item.hasDetails).length,
    dataSource: 'unified_key_strategy'
  };

  const unifiedData = {
    timestamp: metadata.timestamp,
    total: data.length,
    data: data,
    lastUpdate: new Date().toISOString(),
    dataSource: 'unified_key_strategy'
  };

  // Atomic write operation
  await Promise.all([
    env.LIVER_DATA.put(DATA_KEYS.CURRENT, JSON.stringify(unifiedData)),
    env.LIVER_DATA.put(DATA_KEYS.BACKUP, JSON.stringify(unifiedData)),
    env.LIVER_DATA.put(DATA_KEYS.METADATA, JSON.stringify(metadata))
  ]);

  console.log(`✅ Unified data written: ${data.length} items, ${metadata.hasDetailsCount} with details`);
}

async function readUnifiedData(env) {
  console.log('📖 Reading from unified data structure...');

  try {
    // Try primary key first
    let dataStr = await env.LIVER_DATA.get(DATA_KEYS.CURRENT);

    if (!dataStr) {
      console.log('⚠️ Primary data not found, trying backup...');
      dataStr = await env.LIVER_DATA.get(DATA_KEYS.BACKUP);
    }

    if (dataStr) {
      const data = JSON.parse(dataStr);
      console.log(`✅ Unified data read: ${data.total} items`);
      return data;
    }

    console.log('❌ No unified data found, attempting legacy key fallback...');

    // Legacy key fallback for immediate API functionality
    const legacyKeys = [
      'latest_integrated_data_primary',
      'latest_integrated_data_secondary',
      'latest_integrated_data_tertiary',
      'latest_integrated_data',
      'latest_integrated_backup',
      'latest_detailed_data',
      'latest_basic_data'
    ];

    for (const key of legacyKeys) {
      try {
        const legacyStr = await env.LIVER_DATA.get(key);
        if (legacyStr) {
          const legacyData = JSON.parse(legacyStr);
          console.log(`✅ Fallback data found from ${key}: ${legacyData.data?.length || legacyData.total || 'unknown'} items`);

          // Convert legacy format to unified format if needed
          if (legacyData.data && Array.isArray(legacyData.data)) {
            return {
              data: legacyData.data,
              total: legacyData.total || legacyData.data.length,
              timestamp: legacyData.timestamp || Date.now(),
              stats: {
                withDetails: legacyData.data.filter(item => item.hasDetails).length,
                pending: 0
              }
            };
          }
        }
      } catch (error) {
        console.log(`⚠️ Failed to read legacy key ${key}:`, error.message);
      }
    }

    console.log('❌ No legacy data found either, attempting emergency recovery...');
    const recovery = await emergencyDataRecovery(env);

    if (recovery.success) {
      return await readUnifiedData(env);
    }

    return null;
  } catch (error) {
    console.error('❌ Failed to read unified data:', error);
    return null;
  }
}

export default {
  async scheduled(event, env, ctx) {
    console.log('Starting scheduled liver data scraping...');
    
    try {
      // 統合保護機能を使用したスクレイピング処理を実行
      const { scrapeBasicDataOnly, integrateWithExistingDetails, generateHash } = await import('./main-scraper.js');
      const basicLiverData = await scrapeBasicDataOnly(env);

      console.log('🔄 Integrating with existing details in scheduled execution...');

      console.log(`🚀 EMERGENCY_UNIFIED_KEY_SOLUTION_V${DEPLOYMENT_VERSION}`);

      // 統合保護機能を使用して詳細データを保護
      const integratedResult = await integrateWithExistingDetails(env, basicLiverData);
      const allLiverData = integratedResult.data;

      // 統一キー戦略で保存
      await writeUnifiedData(env, allLiverData);

      console.log(`✅ Unified data updated: ${allLiverData.length} livers with detailed info`);
      
    } catch (error) {
      console.error('❌ Scraping failed:', error);
      // エラー情報も保存
      if (env.LIVER_DATA) {
        await env.LIVER_DATA.put('last_error', JSON.stringify({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      }));
      }
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 🔧 修正: より詳細なテスト用エンドポイント
    if (url.pathname === '/test') {
      return await testSingleLiverWithGender(env);
    }

    // Emergency Data Recovery Endpoint
    if (url.pathname === '/emergency-recovery') {
      try {
        console.log('🆘 Emergency recovery endpoint triggered');
        const result = await emergencyDataRecovery(env);

        return new Response(JSON.stringify({
          success: result.success,
          message: result.success ?
            `Emergency recovery completed: ${result.count} items restored` :
            `Recovery failed: ${result.error}`,
          recoveredCount: result.count || 0,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/manual-scrape') {
      try {
        console.log('🚀 Manual scraping triggered...');
        
        // 統合保護機能を使用した処理を実行
        const { scrapeBasicDataOnly, integrateWithExistingDetails, generateHash } = await import('./main-scraper.js');
        const basicLiverData = await scrapeBasicDataOnly(env);

        console.log('🔄 Integrating with existing details in manual scrape...');

        // 統合保護機能を使用して詳細データを保護
        const integratedResult = await integrateWithExistingDetails(env, basicLiverData);
        const allLiverData = integratedResult.data;
        
        // 前回データと比較
        const lastDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        const lastData = lastDataStr ? JSON.parse(lastDataStr) : null;
        
        // 変更があった場合のみ保存
        const currentHash = generateHash(JSON.stringify(allLiverData));
        const lastHash = lastData ? generateHash(JSON.stringify(lastData.data)) : null;
        
        let updated = false;
        console.log(`🔍 Detailed env debug:`);
        console.log(`- env type: ${typeof env}`);
        console.log(`- env keys: ${Object.keys(env)}`);
        console.log(`- LIVER_DATA exists: ${!!env.LIVER_DATA}`);
        console.log(`- LIVER_DATA type: ${typeof env.LIVER_DATA}`);
        console.log(`- IMAGE_HASHES exists: ${!!env.IMAGE_HASHES}`);
        console.log(`- IMAGES exists: ${!!env.IMAGES}`);

        try {
          console.log(`- LIVER_DATA.get test: attempting...`);
          const testResult = await env.LIVER_DATA.get('non_existent_key');
          console.log(`- LIVER_DATA.get test: success (result: ${testResult})`);
        } catch (kvError) {
          console.log(`- LIVER_DATA.get test: failed - ${kvError.message}`);
        }
        if (currentHash !== lastHash) {
          if (env.LIVER_DATA) {
            console.log(`💾 Attempting to save data...`);
            await env.LIVER_DATA.put('latest_data', JSON.stringify({
              timestamp: Date.now(),
              total: allLiverData.length,
              data: allLiverData,
              lastUpdate: new Date().toISOString()
            }));
            updated = true;
            console.log(`✅ Updated data: ${allLiverData.length} livers with detailed info`);
          } else {
            console.log(`❌ env.LIVER_DATA is undefined!`);  // ← 追加
          }
        } else {
          console.log('ℹ️ No changes detected, skipping update');
        }
        console.log(`Final updated value: ${updated}`); 
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Manual scraping completed',
          totalLivers: allLiverData.length,
          updated: updated,
          timestamp: new Date().toISOString(),
          sampleLiver: allLiverData[0] || null,
          allData: allLiverData
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Manual scraping failed:', error);
        
        // エラー情報も保存
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('last_error', JSON.stringify({
            timestamp: Date.now(),
            error: error.message,
            stack: error.stack
          }));
        }
        
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 🆕 スクレイピング進行状況をリアルタイム確認
    if (url.pathname === '/scrape-status') {
      try {
        const latestData = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        const lastError = env.LIVER_DATA ? await env.LIVER_DATA.get('last_error') : null;
        
        let parsedData = null;
        let parsedError = null;
        
        if (latestData) {
          parsedData = JSON.parse(latestData);
        }
        
        if (lastError) {
          parsedError = JSON.parse(lastError);
        }
        
        return new Response(JSON.stringify({
          status: 'running',
          hasData: !!parsedData,
          totalLivers: parsedData ? parsedData.total : 0,
          lastUpdate: parsedData ? parsedData.lastUpdate : null,
          lastUpdateTimestamp: parsedData ? parsedData.timestamp : null,
          hasError: !!parsedError,
          lastError: parsedError,
          sampleLivers: parsedData && parsedData.data ? 
            parsedData.data.slice(0, 3).map(liver => ({
              name: liver.name,
              platform: liver.platform,
              followers: liver.followers,
              hasGender: !!(liver.profileInfo && liver.profileInfo.gender),
              genderFound: liver.genderFound
            })) : []
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Failed to get status: ' + error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 🆕 新しいデバッグエンドポイント: ログイン状態確認
    if (url.pathname === '/debug-login-only') {
      try {
        const loginResult = await performRobustLogin(env);
        return new Response(JSON.stringify({
          loginSuccess: loginResult.success,
          loginMethod: loginResult.method,
          cookiesLength: loginResult.cookies.length,
          cookiesPreview: loginResult.cookies.substring(0, 100),
          error: loginResult.error
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 🆕 新しいデバッグエンドポイント: リスト解析のみ
    if (url.pathname === '/debug-list-parsing') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({ error: 'Login failed' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const listResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        const html = await listResponse.text();
        
        // より詳細な解析
        const analysis = {
          responseStatus: listResponse.status,
          responseUrl: listResponse.url,
          htmlLength: html.length,
          // HTML構造の分析
          structure: {
            hasLiversItem: html.includes('livers_item'),
            hasLiversList: html.includes('livers_list'),
            hasModal: html.includes('modal'),
            hasGuestGuide: html.includes('guest-guide'),
            hasUserFiles: html.includes('user_files'),
            totalImages: (html.match(/<img[^>]*>/g) || []).length,
            totalLinks: (html.match(/<a[^>]*href/g) || []).length
          },
          // パターンマッチング結果
          patterns: {
            modalGuestGuideLinks: (html.match(/\/modal\/guest-guide\/\d+/g) || []).length,
            liverDetailLinks: (html.match(/\/liver\/detail\/\d+/g) || []).length,
            userFilesThumbnail: (html.match(/\/user_files_thumbnail\/\d+/g) || []).length,
            liverNames: (html.match(/alt="[^"]*"/g) || []).slice(0, 5)
          },
          // HTMLサンプル
          htmlSample: html.substring(0, 2000)
        };
        
        return new Response(JSON.stringify(analysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-html') {
      try {
        const listResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1');
        const html = await listResponse.text();
        
        // HTMLの詳細分析
        const analysis = {
          htmlLength: html.length,
          containsPatterns: {
            detail: html.includes('detail'),
            liver: html.includes('liver'),
            id158: html.includes('158'),
            id155: html.includes('155'),
            href: html.includes('href='),
            user_files: html.includes('user_files')
          },
          // 全てのhref属性を抽出（最初の20個）
          allHrefs: Array.from(new Set(
            (html.match(/href="[^"]*"/g) || [])
              .map(h => h.replace(/href="([^"]*)"/, '$1'))
              .slice(0, 20)
          )),
          // ID 158を含む部分を抽出
          contains158Context: html.includes('158') ? 
            html.split('158').slice(0, 2).map((part, i) => 
              i === 0 ? part.slice(-150) + '***158***' : '***158***' + part.slice(0, 150)
            ) : [],
          // aタグのサンプル
          sampleATags: (html.match(/<a[^>]*>/g) || []).slice(0, 10),
          // 実際のライバー名を探す
          liverNames: {
            aoi: html.includes('蒼井つむぎ'),
            shion: html.includes('しおん'),
            himesaki: html.includes('姫咲')
          },
          // HTMLの構造分析
          structure: {
            hasImg: html.includes('<img'),
            hasDiv: html.includes('<div'),
            hasSpan: html.includes('<span'),
            imgCount: (html.match(/<img[^>]*>/g) || []).length,
            aTagCount: (html.match(/<a[^>]*>/g) || []).length
          }
        };
        
        return new Response(JSON.stringify(analysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-html-auth') {
      try {
        console.log('🔐 Starting authenticated HTML debug...');
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        
        if (!loginResult.success) {
          return new Response(JSON.stringify({ 
            error: 'Login failed', 
            loginError: loginResult.error 
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        console.log('✅ Login successful for debug');
        
        // 認証付きで一覧ページを取得
        const listResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        console.log('📄 List page response status:', listResponse.status);
        
        const html = await listResponse.text();
        
        const analysis = {
          loginSuccess: loginResult.success,
          responseStatus: listResponse.status,
          responseUrl: listResponse.url,
          htmlLength: html.length,
          containsPatterns: {
            detail: html.includes('detail'),
            liver: html.includes('liver'),
            id158: html.includes('158'),
            user_files: html.includes('user_files'),
            login: html.includes('ログイン')
          },
          // 詳細リンクパターンの検索
          linkPatterns: {
            liver_detail: (html.match(/liver\/detail/g) || []).length,
            href_detail: (html.match(/href="[^"]*detail[^"]*"/g) || []).slice(0, 5),
            any_158: (html.match(/158/g) || []).length
          },
          // HTMLの最初の部分を確認
          htmlStart: html.substring(0, 1000),
          // Cookieの確認
          cookiesUsed: loginResult.cookies.length > 0
        };
        
        return new Response(JSON.stringify(analysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message,
          stack: error.stack 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-html-detailed') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({ error: 'Login failed' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const listResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        const html = await listResponse.text();
        
        // より詳細な分析
        const analysis = {
          // ID158周辺のコンテキスト
          id158Contexts: html.split('158').slice(0, 3).map((part, i) => 
            i === 0 ? part.slice(-200) + '***158***' : '***158***' + part.slice(0, 200)
          ),
          
          // 全てのaタグ（href含む）
          allATags: (html.match(/<a[^>]*href="[^"]*"[^>]*>/g) || []).slice(0, 15),
          
          // 蒼井つむぎ周辺のHTML
          aoiContext: html.includes('蒼井つむぎ') ? 
            html.split('蒼井つむぎ').slice(0, 2).map((part, i) => 
              i === 0 ? part.slice(-300) + '***蒼井つむぎ***' : '***蒼井つむぎ***' + part.slice(0, 300)
            ) : ['Not found'],
          
          // 可能性のあるリンクパターン
          possibleLinkPatterns: {
            profile: (html.match(/href="[^"]*profile[^"]*"/g) || []).slice(0, 5),
            user: (html.match(/href="[^"]*user[^"]*"/g) || []).slice(0, 5),
            show: (html.match(/href="[^"]*show[^"]*"/g) || []).slice(0, 5),
            view: (html.match(/href="[^"]*view[^"]*"/g) || []).slice(0, 5),
            id_pattern: (html.match(/href="[^"]*\/\d+[^"]*"/g) || []).slice(0, 10)
          },
          
          // 実際のライバー情報の構造
          liverStructure: {
            hasUserFiles: html.includes('user_files'),
            userFilesCount: (html.match(/user_files/g) || []).length,
            imgTagsCount: (html.match(/<img[^>]*>/g) || []).length,
            // user_files を含むimg タグ
            userFilesImgs: (html.match(/<img[^>]*user_files[^>]*>/g) || []).slice(0, 5)
          }
        };
        
        return new Response(JSON.stringify(analysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-detail-url') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({ error: 'Login failed' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // 複数の詳細ページURLパターンを試行
        const testUrls = [
          'https://www.comisapolive.com/liver/detail/158/',
          'https://www.comisapolive.com/liver/158/',
          'https://www.comisapolive.com/profile/158/',
          'https://www.comisapolive.com/user/158/',
          'https://www.comisapolive.com/modal/guest-guide/158'
        ];
        
        const results = {};
        
        for (const url of testUrls) {
          try {
            const response = await fetch(url, {
              headers: {
                'Cookie': loginResult.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.comisapolive.com/'
              }
            });
            
            const html = await response.text();
            
            results[url] = {
              status: response.status,
              url: response.url,
              htmlLength: html.length,
              requiresLogin: html.includes('ログイン') || response.url.includes('login'),
              hasProfile: html.includes('liverProf_') || html.includes('profile'),
              hasGender: html.includes('性別'),
              htmlPreview: html.substring(0, 200)
            };
          } catch (error) {
            results[url] = { error: error.message };
          }
        }
        
        return new Response(JSON.stringify(results, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-cookies') {
      try {
        const loginResult = await performRobustLogin(env);
        
        if (!loginResult.success) {
          return new Response(JSON.stringify({ error: 'Login failed' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        console.log('🍪 Cookies being used:', loginResult.cookies);
        
        // 詳細ページにアクセスしてレスポンスヘッダーを確認
        const detailResponse = await fetch('https://www.comisapolive.com/liver/detail/158/', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.comisapolive.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        
        const cookieAnalysis = {
          loginCookies: loginResult.cookies,
          detailResponseStatus: detailResponse.status,
          detailResponseUrl: detailResponse.url,
          detailResponseHeaders: Object.fromEntries(detailResponse.headers.entries()),
          cookieLength: loginResult.cookies.length,
          cookiePreview: loginResult.cookies.substring(0, 200)
        };
        
        return new Response(JSON.stringify(cookieAnalysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/debug-detail-content') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          return new Response(JSON.stringify({ error: 'Login failed' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const detailResponse = await fetch('https://www.comisapolive.com/liver/detail/158/', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.comisapolive.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        
        const html = await detailResponse.text();
        
        const analysis = {
          status: detailResponse.status,
          url: detailResponse.url,
          htmlLength: html.length,
          containsProfile: {
            liverProf_tag: html.includes('liverProf_tag'),
            liverProf_name: html.includes('liverProf_name'),
            liverProf_prof: html.includes('liverProf_prof'),
            gender_text: html.includes('性別'),
            male_female: html.includes('男性') || html.includes('女性')
          },
          profileClasses: {
            categories: (html.match(/liverProf_tag[^>]*>([^<]*)</g) || []).slice(0, 3),
            names: (html.match(/liverProf_name[^>]*>([^<]*)</g) || []).slice(0, 3),
            profiles: (html.match(/liverProf_prof[^>]*>([^<]*)</g) || []).slice(0, 3)
          },
          htmlPreview: html.substring(0, 1000)
        };
        
        return new Response(JSON.stringify(analysis, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/batch-scrape') {
      try {
        const url_params = new URL(request.url);
        const batchSize = parseInt(url_params.searchParams.get('batch') || '5');
        const startIndex = parseInt(url_params.searchParams.get('start') || '0');
        
        console.log(`🚀 Batch scraping started (batch: ${batchSize}, start: ${startIndex})`);
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        // 基本データを取得
        const listResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        const html = await listResponse.text();
        const pageData = await parseHTMLPageWithDetails(html, env, 1);
        
        console.log(`📊 Found ${pageData.length} livers, processing batch ${startIndex}-${startIndex + batchSize}`);
        
        // バッチ処理: 指定された範囲のみ詳細取得
        const batchData = pageData.slice(startIndex, startIndex + batchSize);
        const processedData = [];
        
        for (const liver of batchData) {
          if (liver.detailUrl) {
            console.log(`🔍 Processing: ${liver.name}`);
            const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
            Object.assign(liver, detailInfo);
            
            if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
              console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
            }
            
            processedData.push(liver);
            await sleep(500); // 負荷軽減
          }
        }
        
        // 既存データと結合して保存
        let allData = processedData;
        
        // 既存データがあれば結合
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (existingDataStr) {
          const existingData = JSON.parse(existingDataStr);
          // 重複を除去して結合
          const existingIds = new Set(existingData.data.map(l => l.originalId));
          const newData = processedData.filter(l => !existingIds.has(l.originalId));
          allData = [...existingData.data, ...newData];
        }

        // 画像URL重複の修正処理
        allData = fixDuplicateImageUrls(allData);
        
        // 保存
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify({
            timestamp: Date.now(),
            total: allData.length,
            data: allData,
            lastUpdate: new Date().toISOString(),
            batchInfo: {
              lastBatch: `${startIndex}-${startIndex + batchSize}`,
              totalLivers: pageData.length,
              processed: allData.length
            }
          }));
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Batch processing completed',
          batchProcessed: processedData.length,
          totalStored: allData.length,
          totalAvailable: pageData.length,
          nextBatch: startIndex + batchSize < pageData.length ? startIndex + batchSize : null,
          nextUrl: startIndex + batchSize < pageData.length ? 
            `${request.url.split('?')[0]}?start=${startIndex + batchSize}&batch=${batchSize}` : null,
          sampleData: processedData.slice(0, 2)
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Batch scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 2. 自動バッチ処理エンドポイント
    if (url.pathname === '/auto-batch') {
      try {
        // 現在の状況を確認
        const statusResponse = await fetch(`${request.url.replace('/auto-batch', '/scrape-status')}`);
        const status = await statusResponse.json();
        
        let startIndex = 0;
        if (status.hasData && status.sampleLivers) {
          // 既存データがある場合は続きから
          startIndex = status.totalLivers || 0;
        }
        
        // 最初のバッチを実行
        const batchResponse = await fetch(`${request.url.replace('/auto-batch', '/batch-scrape')}?start=${startIndex}&batch=5`);
        const batchResult = await batchResponse.json();
        
        return new Response(JSON.stringify({
          message: 'Auto batch processing started',
          firstBatch: batchResult,
          instructions: {
            continue: batchResult.nextUrl ? `curl "${batchResult.nextUrl}"` : null,
            checkStatus: `curl "${request.url.replace('/auto-batch', '/scrape-status')}"`
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/full-scrape') {
      try {
        const url_params = new URL(request.url);
        const maxPages = parseInt(url_params.searchParams.get('pages') || '50'); // 最大ページ数制限
        const batchSize = parseInt(url_params.searchParams.get('batch') || '10'); // 1ページあたりのバッチサイズ
        
        console.log(`🚀 Full scraping started (max pages: ${maxPages}, batch size: ${batchSize})`);
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let allLivers = [];
        let currentPage = 1;
        let totalPagesDetected = null;
        
        // 全ページをスクレイピング
        while (currentPage <= maxPages) {
          console.log(`📄 Processing page ${currentPage}...`);
          
          const pageUrl = currentPage === 1 
            ? 'https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1'
            : `https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1&page=${currentPage}`;
          
          // ページを取得
          const pageResponse = await fetch(pageUrl, {
            headers: {
              'Cookie': loginResult.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Referer': 'https://www.comisapolive.com/'
            }
          });
          
          if (!pageResponse.ok) {
            console.log(`⚠️ Page ${currentPage} failed with status ${pageResponse.status}`);
            break;
          }
          
          const html = await pageResponse.text();
          
          // 最初のページで総ページ数を検出
          if (totalPagesDetected === null) {
            totalPagesDetected = getMaxPages(html);
            console.log(`📊 Total pages detected: ${totalPagesDetected}`);
          }
          
          // ページデータを解析
          const pageData = await parseHTMLPageWithDetails(html, env, currentPage);
          
          if (pageData.length === 0) {
            console.log(`📄 Page ${currentPage}: No data found, stopping`);
            break;
          }
          
          console.log(`📄 Page ${currentPage}: Found ${pageData.length} livers`);
          
          // バッチ処理で詳細情報を取得
          let processedInPage = 0;
          for (let i = 0; i < pageData.length; i += batchSize) {
            const batch = pageData.slice(i, i + batchSize);
            console.log(`🔄 Processing page ${currentPage}, batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(pageData.length/batchSize)}`);
            
            for (const liver of batch) {
              if (liver.detailUrl) {
                console.log(`🔍 Processing: ${liver.name} (Page ${currentPage})`);
                const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
                Object.assign(liver, detailInfo);
                
                if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
                  console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
                }
                
                processedInPage++;
                await sleep(300); // 負荷軽減
              }
            }
            
            // バッチ間の休憩
            if (i + batchSize < pageData.length) {
              await sleep(1000);
            }
          }
          
          allLivers = allLivers.concat(pageData);
          console.log(`✅ Page ${currentPage} completed: ${processedInPage} livers processed (Total: ${allLivers.length})`);
          
          // 次のページへ
          currentPage++;
          
          // ページ間の休憩
          if (currentPage <= (totalPagesDetected || maxPages)) {
            await sleep(2000);
          }
          
          // 検出された総ページ数に達したら停止
          if (totalPagesDetected && currentPage > totalPagesDetected) {
            console.log(`📄 Reached detected max pages (${totalPagesDetected}), stopping`);
            break;
          }
        }
        
        console.log(`🎉 Full scraping completed: ${allLivers.length} total livers from ${currentPage - 1} pages`);
        
        // KVに保存
        const finalData = {
          timestamp: Date.now(),
          total: allLivers.length,
          data: allLivers,
          lastUpdate: new Date().toISOString(),
          pagesProcessed: currentPage - 1,
          totalPagesDetected: totalPagesDetected
        };
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(finalData));
          console.log(`💾 Saved ${allLivers.length} livers to KV storage`);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Full scraping completed',
          totalProcessed: allLivers.length,
          pagesProcessed: currentPage - 1,
          totalPagesDetected: totalPagesDetected,
          lastUpdate: finalData.lastUpdate,
          sampleData: allLivers.slice(0, 3),
          genderStats: {
            withGender: allLivers.filter(l => l.genderSearchResults?.bestMatch).length,
            total: allLivers.length
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Full scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // デバッグ用：ページ数確認エンドポイント
    if (url.pathname === '/check-pages') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        const firstPageResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        const html = await firstPageResponse.text();
        const maxPages = getMaxPages(html);
        const firstPageLivers = await parseHTMLPageWithDetails(html, env, 1);
        
        // ページネーション情報を詳細に分析
        const paginationInfo = {
          maxPagesDetected: maxPages,
          firstPageLivers: firstPageLivers.length,
          // ページネーションリンクを探す
          pageLinks: (html.match(/[?&]page=(\d+)/g) || []).map(match => parseInt(match.split('=')[1])),
          // "次へ"ボタンの有無
          hasNextButton: html.includes('次へ') || html.includes('next') || html.includes('&gt;'),
          // ページ番号の最大値
          maxPageInLinks: Math.max(...((html.match(/[?&]page=(\d+)/g) || []).map(match => parseInt(match.split('=')[1])) || [1]))
        };
        
        return new Response(JSON.stringify({
          success: true,
          paginationInfo: paginationInfo,
          recommendation: {
            estimatedTotalPages: maxPages,
            estimatedTotalLivers: firstPageLivers.length * maxPages,
            shouldUseFullScrape: maxPages > 1
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
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

    if (url.pathname === '/analyze-pagination') {
      try {
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        const firstPageResponse = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1', {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/'
          }
        });
        
        const html = await firstPageResponse.text();
        
        // より詳細なページネーション分析
        const analysis = {
          htmlLength: html.length,
          
          // 全てのページ関連のリンクを抽出
          allPageLinks: (html.match(/href="[^"]*[?&]page=\d+[^"]*"/g) || [])
            .map(link => link.match(/page=(\d+)/)?.[1])
            .filter(Boolean)
            .map(Number),
          
          // ページネーション関連のHTMLパターンを検索
          paginationPatterns: {
            hasPageClass: html.includes('page'),
            hasPaginationClass: html.includes('pagination'),
            hasNextLink: html.includes('次へ') || html.includes('next') || html.includes('&gt;'),
            hasPrevLink: html.includes('前へ') || html.includes('prev') || html.includes('&lt;'),
            pageParameterCount: (html.match(/[?&]page=/g) || []).length
          },
          
          // 数字のパターンを検索（ページ番号の可能性）
          numberPatterns: {
            numbersInLinks: (html.match(/>\s*(\d+)\s*</g) || [])
              .map(match => match.match(/(\d+)/)?.[1])
              .filter(n => n && parseInt(n) > 1 && parseInt(n) < 100)
              .slice(0, 10),
            
            // ページ関連の文字列を検索
            pageStrings: html.match(/page[^>]*>.*?</gi)?.slice(0, 5) || []
          },
          
          // フォーム要素の確認
          forms: {
            hasForm: html.includes('<form'),
            hasPageInput: html.includes('name="page"') || html.includes('id="page"'),
            hasSearchForm: html.includes('search=1')
          },
          
          // HTMLの構造分析
          structure: {
            totalLinks: (html.match(/<a[^>]*href/g) || []).length,
            hasFooter: html.includes('footer'),
            hasNav: html.includes('nav'),
            liverItemCount: (html.match(/livers_item/g) || []).length
          }
        };
        
        // 2ページ目が存在するかテスト
        let page2Test = null;
        try {
          const page2Response = await fetch('https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1&page=2', {
            headers: {
              'Cookie': loginResult.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Referer': 'https://www.comisapolive.com/'
            }
          });
          
          const page2Html = await page2Response.text();
          const page2Livers = await parseHTMLPageWithDetails(page2Html, env, 2);
          
          page2Test = {
            status: page2Response.status,
            url: page2Response.url,
            htmlLength: page2Html.length,
            liverCount: page2Livers.length,
            differentFromPage1: page2Html !== html,
            hasLivers: page2Livers.length > 0,
            sampleLiverNames: page2Livers.slice(0, 3).map(l => l.name)
          };
        } catch (page2Error) {
          page2Test = { error: page2Error.message };
        }
        
        return new Response(JSON.stringify({
          success: true,
          analysis: analysis,
          page2Test: page2Test,
          recommendations: {
            likelyHasMultiplePages: !!(page2Test?.hasLivers),
            shouldTrySequentialPages: true,
            maxPagesToTry: page2Test?.hasLivers ? 10 : 1
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
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

    // 強化されたgetMaxPages関数
    function getMaxPagesEnhanced(html) {
      let maxPage = 1;
      
      // 方法1: 既存のページリンクパターン
      const pagePattern = /[?&]page=(\d+)/g;
      let match;
      while ((match = pagePattern.exec(html)) !== null) {
        const pageNum = parseInt(match[1]);
        if (pageNum > maxPage && pageNum < 1000) { // 現実的な上限
          maxPage = pageNum;
        }
      }
      
      // 方法2: ページネーション内の数字を検索
      const paginationPattern = /<nav[^>]*>[\s\S]*?<\/nav>|<div[^>]*pagination[^>]*>[\s\S]*?<\/div>/gi;
      let paginationMatch;
      while ((paginationMatch = paginationPattern.exec(html)) !== null) {
        const paginationHtml = paginationMatch[0];
        const numbersInPagination = paginationHtml.match(/>\s*(\d+)\s*</g);
        if (numbersInPagination) {
          numbersInPagination.forEach(numMatch => {
            const num = parseInt(numMatch.match(/(\d+)/)[1]);
            if (num > maxPage && num < 100) {
              maxPage = num;
            }
          });
        }
      }
      
      // 方法3: 「次へ」ボタンがある場合は最低2ページ以上
      if (maxPage === 1 && (html.includes('次へ') || html.includes('next') || html.includes('&gt;'))) {
        maxPage = 2; // 最低2ページはあると推定
      }
      
      return maxPage;
    }

    if (url.pathname === '/force-multi-scrape') {
      try {
        const url_params = new URL(request.url);
        const maxPages = parseInt(url_params.searchParams.get('pages') || '20');
        const batchSize = parseInt(url_params.searchParams.get('batch') || '8');
        
        console.log(`🚀 Force multi-page scraping started (max pages: ${maxPages}, batch size: ${batchSize})`);
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let allLivers = [];
        let currentPage = 1;
        let consecutiveEmptyPages = 0;
        
        // 強制的に指定されたページ数まで試行
        while (currentPage <= maxPages && consecutiveEmptyPages < 3) {
          console.log(`📄 Force processing page ${currentPage}...`);
          
          const pageUrl = currentPage === 1 
            ? 'https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1'
            : `https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1&page=${currentPage}`;
          
          // ページを取得
          const pageResponse = await fetch(pageUrl, {
            headers: {
              'Cookie': loginResult.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Referer': currentPage === 1 ? 'https://www.comisapolive.com/' : `https://www.comisapolive.com/liver/list/?page=${currentPage-1}`
            }
          });
          
          console.log(`📄 Page ${currentPage} response: ${pageResponse.status} -> ${pageResponse.url}`);
          
          if (!pageResponse.ok) {
            console.log(`⚠️ Page ${currentPage} failed with status ${pageResponse.status}`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          const html = await pageResponse.text();
          
          // ページデータを解析
          const pageData = await parseHTMLPageWithDetails(html, env, currentPage);
          
          if (pageData.length === 0) {
            console.log(`📄 Page ${currentPage}: No data found`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          console.log(`📄 Page ${currentPage}: Found ${pageData.length} livers`);
          consecutiveEmptyPages = 0; // リセット
          
          // バッチ処理で詳細情報を取得
          let processedInPage = 0;
          for (let i = 0; i < pageData.length; i += batchSize) {
            const batch = pageData.slice(i, i + batchSize);
            const batchNum = Math.floor(i/batchSize) + 1;
            const totalBatches = Math.ceil(pageData.length/batchSize);
            
            console.log(`🔄 Processing page ${currentPage}, batch ${batchNum}/${totalBatches} (${batch.length} livers)`);
            
            for (const liver of batch) {
              if (liver.detailUrl) {
                console.log(`🔍 Processing: ${liver.name} (Page ${currentPage})`);
                try {
                  const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
                  Object.assign(liver, detailInfo);
                  
                  if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
                    console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
                  }
                  
                  processedInPage++;
                } catch (detailError) {
                  console.error(`❌ Failed to process ${liver.name}:`, detailError.message);
                }
                
                await sleep(300); // 負荷軽減
              }
            }
            
            // バッチ間の休憩
            if (i + batchSize < pageData.length) {
              console.log(`⏳ Batch break (3 seconds)...`);
              await sleep(3000);
            }
          }
          
          allLivers = allLivers.concat(pageData);
          console.log(`✅ Page ${currentPage} completed: ${processedInPage} livers processed (Total so far: ${allLivers.length})`);
          
          // 次のページへ
          currentPage++;
          
          // ページ間の休憩
          if (currentPage <= maxPages) {
            console.log(`⏳ Page break (5 seconds)...`);
            await sleep(5000);
          }
        }
        
        const actualPagesProcessed = currentPage - 1;
        console.log(`🎉 Force multi-page scraping completed: ${allLivers.length} total livers from ${actualPagesProcessed} pages`);
        
        // KVに保存
        const finalData = {
          timestamp: Date.now(),
          total: allLivers.length,
          data: allLivers,
          lastUpdate: new Date().toISOString(),
          pagesProcessed: actualPagesProcessed,
          maxPagesAttempted: maxPages,
          method: 'force_multi_page'
        };
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(finalData));
          console.log(`💾 Saved ${allLivers.length} livers to KV storage`);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Force multi-page scraping completed',
          totalProcessed: allLivers.length,
          pagesProcessed: actualPagesProcessed,
          maxPagesAttempted: maxPages,
          lastUpdate: finalData.lastUpdate,
          sampleData: allLivers.slice(0, 3),
          genderStats: {
            withGender: allLivers.filter(l => l.genderSearchResults?.bestMatch).length,
            total: allLivers.length
          },
          pageBreakdown: allLivers.reduce((acc, liver) => {
            acc[`page_${liver.page}`] = (acc[`page_${liver.page}`] || 0) + 1;
            return acc;
          }, {})
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Force multi-page scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/light-scrape') {
      try {
        const url_params = new URL(request.url);
        const maxPages = parseInt(url_params.searchParams.get('pages') || '10');
        const detailsPerPage = parseInt(url_params.searchParams.get('details') || '3'); // 詳細取得数を制限
        
        console.log(`🚀 Light scraping started (max pages: ${maxPages}, details per page: ${detailsPerPage})`);
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let allLivers = [];
        let currentPage = 1;
        let consecutiveEmptyPages = 0;
        let totalSubrequests = 1; // ログインで1回使用済み
        
        // 軽量版: subrequest制限を考慮して処理
        while (currentPage <= maxPages && consecutiveEmptyPages < 3 && totalSubrequests < 45) {
          console.log(`📄 Light processing page ${currentPage}... (subrequests used: ${totalSubrequests})`);
          
          const pageUrl = currentPage === 1 
            ? 'https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1'
            : `https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1&page=${currentPage}`;
          
          // ページを取得
          const pageResponse = await fetch(pageUrl, {
            headers: {
              'Cookie': loginResult.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Referer': currentPage === 1 ? 'https://www.comisapolive.com/' : `https://www.comisapolive.com/liver/list/?page=${currentPage-1}`
            }
          });
          
          totalSubrequests++; // ページ取得で1回
          console.log(`📄 Page ${currentPage} response: ${pageResponse.status} (subrequests: ${totalSubrequests})`);
          
          if (!pageResponse.ok) {
            console.log(`⚠️ Page ${currentPage} failed with status ${pageResponse.status}`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          const html = await pageResponse.text();
          
          // ページデータを解析（詳細取得なし）
          const pageData = await parseHTMLPageWithDetails(html, env, currentPage);
          
          if (pageData.length === 0) {
            console.log(`📄 Page ${currentPage}: No data found`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          console.log(`📄 Page ${currentPage}: Found ${pageData.length} livers`);
          consecutiveEmptyPages = 0;
          
          // 🔧 制限付き詳細取得: ページあたり最大N人まで
          let processedInPage = 0;
          for (let i = 0; i < Math.min(pageData.length, detailsPerPage) && totalSubrequests < 45; i++) {
            const liver = pageData[i];
            
            if (liver.detailUrl) {
              console.log(`🔍 Processing: ${liver.name} (Page ${currentPage}) - subrequest ${totalSubrequests + 1}`);
              
              try {
                const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
                totalSubrequests++; // 詳細ページ取得で1回
                
                Object.assign(liver, detailInfo);
                
                if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
                  console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
                }
                
                processedInPage++;
                await sleep(200); // 短い休憩
                
              } catch (detailError) {
                console.error(`❌ Failed to process ${liver.name}:`, detailError.message);
                totalSubrequests++; // エラーでもカウント
              }
            }
          }
          
          // 残りのライバーには基本情報のみ設定
          for (let i = detailsPerPage; i < pageData.length; i++) {
            const liver = pageData[i];
            liver.detailStatus = 'basic_only'; // 詳細未取得マーク
          }
          
          allLivers = allLivers.concat(pageData);
          console.log(`✅ Page ${currentPage} completed: ${processedInPage}/${pageData.length} detailed, ${pageData.length} total (Running total: ${allLivers.length})`);
          
          currentPage++;
          
          // subrequest制限チェック
          if (totalSubrequests >= 45) {
            console.log(`⚠️ Approaching subrequest limit (${totalSubrequests}/50), stopping early`);
            break;
          }
          
          // 短い休憩
          await sleep(1000);
        }
        
        const actualPagesProcessed = currentPage - 1;
        const detailedCount = allLivers.filter(l => !l.detailStatus).length;
        
        console.log(`🎉 Light scraping completed: ${allLivers.length} total livers (${detailedCount} with details) from ${actualPagesProcessed} pages`);
        
        // KVに保存
        const finalData = {
          timestamp: Date.now(),
          total: allLivers.length,
          data: allLivers,
          lastUpdate: new Date().toISOString(),
          pagesProcessed: actualPagesProcessed,
          maxPagesAttempted: maxPages,
          subrequestsUsed: totalSubrequests,
          method: 'light_scraping',
          stats: {
            withDetails: detailedCount,
            basicOnly: allLivers.length - detailedCount
          }
        };
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(finalData));
          console.log(`💾 Saved ${allLivers.length} livers to KV storage`);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Light scraping completed',
          totalProcessed: allLivers.length,
          withDetails: detailedCount,
          basicOnly: allLivers.length - detailedCount,
          pagesProcessed: actualPagesProcessed,
          subrequestsUsed: totalSubrequests,
          lastUpdate: finalData.lastUpdate,
          sampleData: allLivers.slice(0, 3),
          pageBreakdown: allLivers.reduce((acc, liver) => {
            const key = `page_${liver.page}`;
            if (!acc[key]) acc[key] = { total: 0, detailed: 0 };
            acc[key].total++;
            if (!liver.detailStatus) acc[key].detailed++;
            return acc;
          }, {}),
          recommendations: {
            continueWith: totalSubrequests >= 45 ? 
              `curl "${new URL(request.url).origin}/light-scrape?pages=${maxPages}&details=${detailsPerPage}"` : null,
            increaseDetails: detailedCount < allLivers.length ? 
              `curl "${new URL(request.url).origin}/detail-fill"` : null
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Light scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          suggestion: "Try reducing pages or details parameters"
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 詳細情報補完エンドポイント
    if (url.pathname === '/detail-fill') {
      try {
        console.log('🔧 Starting detail fill process...');
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found. Run /light-scrape first.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        const basicOnlyLivers = existingData.data.filter(l => l.detailStatus === 'basic_only');
        
        console.log(`📊 Found ${basicOnlyLivers.length} livers needing detail information`);
        
        if (basicOnlyLivers.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'All livers already have detail information',
            totalLivers: existingData.data.length
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // ログイン
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let processedCount = 0;
        let subrequestCount = 1; // ログイン分
        const maxDetails = Math.min(basicOnlyLivers.length, 40); // 安全な上限
        
        for (let i = 0; i < maxDetails && subrequestCount < 45; i++) {
          const liver = basicOnlyLivers[i];
          
          console.log(`🔍 Filling details for: ${liver.name} (${i + 1}/${maxDetails})`);
          
          try {
            const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
            subrequestCount++;
            
            // 既存データを更新
            const liverIndex = existingData.data.findIndex(l => l.id === liver.id);
            if (liverIndex !== -1) {
              Object.assign(existingData.data[liverIndex], detailInfo);
              delete existingData.data[liverIndex].detailStatus; // マークを削除
              processedCount++;
            }
            
            await sleep(300);
            
          } catch (error) {
            console.error(`❌ Failed to fill details for ${liver.name}:`, error.message);
            subrequestCount++;
          }
        }
        
        // 更新されたデータを保存
        existingData.lastUpdate = new Date().toISOString();
        existingData.timestamp = Date.now();
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(existingData));
        }
        
        console.log(`✅ Detail fill completed: ${processedCount} livers updated`);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Detail fill completed',
          processedCount: processedCount,
          remainingBasicOnly: basicOnlyLivers.length - processedCount,
          subrequestsUsed: subrequestCount,
          continueWith: processedCount < basicOnlyLivers.length ? 
            `curl "${new URL(request.url).origin}/detail-fill"` : null
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Detail fill failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/minimal-scrape') {
      try {
        const url_params = new URL(request.url);
        const maxPages = parseInt(url_params.searchParams.get('pages') || '5');
        const detailsTotal = parseInt(url_params.searchParams.get('details') || '5'); // 全体で5人まで
        
        console.log(`🚀 Minimal scraping started (max pages: ${maxPages}, total details: ${detailsTotal})`);
        
        // ログイン処理
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let allLivers = [];
        let currentPage = 1;
        let consecutiveEmptyPages = 0;
        let totalSubrequests = 1; // ログインで1回使用済み
        let detailsProcessed = 0;
        
        // 超軽量版: 最小限のsubrequest使用
        while (currentPage <= maxPages && consecutiveEmptyPages < 2 && totalSubrequests < 20) {
          console.log(`📄 Minimal processing page ${currentPage}... (subrequests used: ${totalSubrequests})`);
          
          const pageUrl = currentPage === 1 
            ? 'https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1'
            : `https://www.comisapolive.com/liver/list/?q=&collaboration=&achievements=&rank=&app=&follower1=&follower2=&since=&gender=&age1=&age2=&regist=&search=1&page=${currentPage}`;
          
          // ページを取得
          const pageResponse = await fetch(pageUrl, {
            headers: {
              'Cookie': loginResult.cookies,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
              'Referer': currentPage === 1 ? 'https://www.comisapolive.com/' : `https://www.comisapolive.com/liver/list/?page=${currentPage-1}`
            }
          });
          
          totalSubrequests++; // ページ取得で1回
          console.log(`📄 Page ${currentPage} response: ${pageResponse.status} (subrequests: ${totalSubrequests})`);
          
          if (!pageResponse.ok) {
            console.log(`⚠️ Page ${currentPage} failed with status ${pageResponse.status}`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          const html = await pageResponse.text();
          
          // ページデータを解析（詳細取得なし）
          const pageData = await parseHTMLPageWithDetails(html, env, currentPage);
          
          if (pageData.length === 0) {
            console.log(`📄 Page ${currentPage}: No data found`);
            consecutiveEmptyPages++;
            currentPage++;
            continue;
          }
          
          console.log(`📄 Page ${currentPage}: Found ${pageData.length} livers`);
          consecutiveEmptyPages = 0;
          
          // 全てのライバーを基本情報として追加
          allLivers = allLivers.concat(pageData);
          
          currentPage++;
          await sleep(500); // 短い休憩
        }
        
        console.log(`📊 Basic data collection completed: ${allLivers.length} livers from ${currentPage - 1} pages`);
        
        // 🔧 詳細情報は最初のN人のみ取得（全体制限）
        for (let i = 0; i < Math.min(allLivers.length, detailsTotal) && totalSubrequests < 45; i++) {
          const liver = allLivers[i];
          
          if (liver.detailUrl) {
            console.log(`🔍 Getting details for: ${liver.name} (${i + 1}/${detailsTotal}) - subrequest ${totalSubrequests + 1}`);
            
            try {
              const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
              totalSubrequests++; // 詳細ページ取得で1回
              
              Object.assign(liver, detailInfo);
              
              if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
                console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
              }
              
              detailsProcessed++;
              await sleep(300);
              
            } catch (detailError) {
              console.error(`❌ Failed to get details for ${liver.name}:`, detailError.message);
              totalSubrequests++; // エラーでもカウント
            }
          }
        }
        
        // 詳細未取得のライバーにマーク
        for (let i = detailsTotal; i < allLivers.length; i++) {
          allLivers[i].detailStatus = 'pending';
        }
        
        const actualPagesProcessed = currentPage - 1;
        
        console.log(`🎉 Minimal scraping completed: ${allLivers.length} livers (${detailsProcessed} with details) from ${actualPagesProcessed} pages`);
        
        // KVに保存
        const finalData = {
          timestamp: Date.now(),
          total: allLivers.length,
          data: allLivers,
          lastUpdate: new Date().toISOString(),
          pagesProcessed: actualPagesProcessed,
          subrequestsUsed: totalSubrequests,
          method: 'minimal_scraping',
          stats: {
            withDetails: detailsProcessed,
            pending: allLivers.length - detailsProcessed
          }
        };
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(finalData));
          console.log(`💾 Saved ${allLivers.length} livers to KV storage`);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Minimal scraping completed',
          totalProcessed: allLivers.length,
          withDetails: detailsProcessed,
          pending: allLivers.length - detailsProcessed,
          pagesProcessed: actualPagesProcessed,
          subrequestsUsed: totalSubrequests,
          lastUpdate: finalData.lastUpdate,
          sampleData: allLivers.slice(0, 3),
          pageBreakdown: allLivers.reduce((acc, liver) => {
            acc[`page_${liver.page}`] = (acc[`page_${liver.page}`] || 0) + 1;
            return acc;
          }, {}),
          nextSteps: {
            getMoreDetails: allLivers.length > detailsProcessed ? 
              `curl "${new URL(request.url).origin}/detail-batch"` : null,
            checkData: `curl "${new URL(request.url).origin}/api/livers"`
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Minimal scraping failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          suggestion: "Try reducing pages to 1-3 or details to 1-3"
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 詳細情報を少しずつ取得するエンドポイント
    if (url.pathname === '/detail-batch') {
      try {
        const batchSize = parseInt(new URL(request.url).searchParams.get('batch') || '5');
        
        console.log(`🔧 Starting detail batch process (batch size: ${batchSize})...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found. Run /minimal-scrape first.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        const pendingLivers = existingData.data.filter(l => l.detailStatus === 'pending');
        
        console.log(`📊 Found ${pendingLivers.length} livers needing detail information`);
        
        if (pendingLivers.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'All livers already processed',
            totalLivers: existingData.data.length,
            allComplete: true
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // ログイン
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        let processedCount = 0;
        let subrequestCount = 1; // ログイン分
        const processBatch = Math.min(pendingLivers.length, batchSize, 40); // 安全な上限
        
        for (let i = 0; i < processBatch && subrequestCount < 45; i++) {
          const liver = pendingLivers[i];
          
          console.log(`🔍 Processing details for: ${liver.name} (${i + 1}/${processBatch})`);
          
          try {
            const detailInfo = await scrapeDetailPageWithAuth(liver.detailUrl, loginResult.cookies, env);
            subrequestCount++;
            
            // 既存データを更新
            const liverIndex = existingData.data.findIndex(l => l.id === liver.id);
            if (liverIndex !== -1) {
              Object.assign(existingData.data[liverIndex], detailInfo);
              delete existingData.data[liverIndex].detailStatus; // pendingマークを削除
              processedCount++;
            }
            
            if (detailInfo.profileInfo && detailInfo.profileInfo.gender) {
              console.log(`👤 Gender found for ${liver.name}: ${detailInfo.profileInfo.gender}`);
            }
            
            await sleep(500);
            
          } catch (error) {
            console.error(`❌ Failed to process details for ${liver.name}:`, error.message);
            subrequestCount++;
          }
        }
        
        // 統計を更新
        const remainingPending = existingData.data.filter(l => l.detailStatus === 'pending').length;
        existingData.stats = {
          withDetails: existingData.data.filter(l => !l.detailStatus).length,
          pending: remainingPending
        };
        
        // 更新されたデータを保存
        existingData.lastUpdate = new Date().toISOString();
        existingData.timestamp = Date.now();
        
        if (env.LIVER_DATA) {
          await env.LIVER_DATA.put('latest_data', JSON.stringify(existingData));
        }
        
        console.log(`✅ Detail batch completed: ${processedCount} livers updated`);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Detail batch completed',
          processedThisBatch: processedCount,
          remainingPending: remainingPending,
          subrequestsUsed: subrequestCount,
          allComplete: remainingPending === 0,
          continueWith: remainingPending > 0 ? 
            `curl "${new URL(request.url).origin}/detail-batch?batch=${batchSize}"` : null,
          checkProgress: `curl "${new URL(request.url).origin}/api/livers" | jq '{total: .total, withDetails: .stats.withDetails, pending: .stats.pending}'`
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Detail batch failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/kv-test') {
      try {
        console.log('🔧 KV Test - Environment check:');
        console.log('- env type:', typeof env);
        console.log('- env keys:', Object.keys(env));
        console.log('- LIVER_DATA exists:', !!env.LIVER_DATA);
        console.log('- LIVER_DATA type:', typeof env.LIVER_DATA);

        // テストデータを書き込み
        const testData = {
          timestamp: Date.now(),
          test: 'KV storage test',
          message: 'This is a test write',
          randomValue: Math.random()
        };

        if (env.LIVER_DATA) {
          console.log('📝 Attempting to write test data...');
          await env.LIVER_DATA.put('test_key', JSON.stringify(testData));
          console.log('✅ Test data written successfully');

          // すぐに読み取りテスト
          console.log('📖 Attempting to read test data...');
          const readResult = await env.LIVER_DATA.get('test_key');
          console.log('📖 Read result:', readResult ? 'SUCCESS' : 'FAILED');

          if (readResult) {
            const parsedResult = JSON.parse(readResult);
            console.log('📖 Parsed result:', parsedResult);
          }

          // latest_dataキーも確認
          console.log('🔍 Checking latest_data key...');
          const latestDataResult = await env.LIVER_DATA.get('latest_data');
          console.log('🔍 latest_data exists:', !!latestDataResult);
          if (latestDataResult) {
            const parsedLatest = JSON.parse(latestDataResult);
            console.log('🔍 latest_data summary:', {
              total: parsedLatest.total,
              timestamp: parsedLatest.timestamp,
              lastUpdate: parsedLatest.lastUpdate
            });
          }

          return new Response(JSON.stringify({
            success: true,
            kvExists: !!env.LIVER_DATA,
            writeTest: 'success',
            readTest: readResult ? 'success' : 'failed',
            testData: readResult ? JSON.parse(readResult) : null,
            latestDataExists: !!latestDataResult,
            latestDataSummary: latestDataResult ? {
              total: JSON.parse(latestDataResult).total,
              lastUpdate: JSON.parse(latestDataResult).lastUpdate
            } : null,
            envInfo: {
              keys: Object.keys(env),
              liverDataType: typeof env.LIVER_DATA
            }
          }, null, 2), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } else {
          console.log('❌ LIVER_DATA is not available');
          return new Response(JSON.stringify({
            success: false,
            error: 'LIVER_DATA KV namespace not found',
            envKeys: Object.keys(env),
            suggestion: 'Check wrangler.toml KV namespace configuration'
          }, null, 2), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

      } catch (error) {
        console.error('KV Test error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/fix-images') {
      try {
        const batchSize = parseInt(new URL(request.url).searchParams.get('batch') || '3');
        
        console.log(`🖼️ Starting image fix process (batch size: ${batchSize})...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        
        // 最初のN人の画像のみ処理
        for (let i = 0; i < Math.min(existingData.data.length, batchSize) && subrequestCount < 45; i++) {
          const liver = existingData.data[i];
          
          console.log(`🖼️ Processing image for: ${liver.name} (${i + 1}/${batchSize})`);
          
          try {
            // 元画像URLを構築
            const originalImageUrl = `https://www.comisapolive.com/user_files_thumbnail/${liver.originalId}/`;
            
            // 画像を取得（HEADリクエストで存在確認）
            const headResponse = await fetch(originalImageUrl, { method: 'HEAD' });
            subrequestCount++;
            
            if (headResponse.ok) {
              // 実際の画像を取得
              const imageResponse = await fetch(originalImageUrl);
              subrequestCount++;
              
              if (imageResponse.ok) {
                const imageBuffer = await imageResponse.arrayBuffer();
                const imageId = `${liver.id}.jpg`;
                
                // R2に保存
                if (env.IMAGES) {
                  await env.IMAGES.put(imageId, imageBuffer, {
                    httpMetadata: { contentType: 'image/jpeg' }
                  });
                  
                  console.log(`✅ Saved image for ${liver.name}: ${imageId}`);
                  imagesProcessed++;
                }
              }
            }
            
            await sleep(200); // 短い休憩
            
          } catch (imageError) {
            console.error(`❌ Failed to process image for ${liver.name}:`, imageError.message);
            subrequestCount++;
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Image fix completed',
          imagesProcessed: imagesProcessed,
          subrequestsUsed: subrequestCount,
          batchSize: batchSize,
          nextBatch: imagesProcessed < existingData.data.length ? 
            `curl "${new URL(request.url).origin}/fix-images?batch=${batchSize}"` : null
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Image fix failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 画像無効化処理：画像なしでAPIを使いやすくする
    if (url.pathname === '/api/livers-no-images') {
      try {
        const data = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        
        if (!data) {
          return new Response(JSON.stringify({
            data: [], 
            total: 0, 
            error: "No data found in storage"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const parsedData = JSON.parse(data);
        
        // 画像URLを無効化またはプレースホルダーに置換
        const cleanedData = {
          ...parsedData,
          data: parsedData.data.map(liver => ({
            ...liver,
            imageUrl: null, // 画像URLを無効化
            hasImageData: false,
            profileImages: liver.profileImages ? liver.profileImages.map(img => ({
              ...img,
              url: null, // プロフィール画像も無効化
              originalUrl: img.originalUrl // 元URLは保持
            })) : []
          }))
        };
        
        return new Response(JSON.stringify(cleanedData), {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=3600',
            ...corsHeaders
          }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          data: [], 
          total: 0, 
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 重複画像URL修正エンドポイント
    if (url.pathname === '/fix-duplicate-images') {
      try {
        const data = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        
        if (!data) {
          return new Response(JSON.stringify({
            success: false,
            error: "No data found in storage"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const parsedData = JSON.parse(data);
        console.log(`🔧 Processing ${parsedData.data.length} livers for duplicate image URLs...`);
        
        // 重複修正処理を実行
        const fixedData = fixDuplicateImageUrls([...parsedData.data]);
        
        // 修正されたデータを保存
        const updatedData = {
          ...parsedData,
          data: fixedData,
          lastDuplicateFixAt: new Date().toISOString()
        };
        
        await env.LIVER_DATA.put('latest_data', JSON.stringify(updatedData));
        
        // 修正統計を収集
        const duplicateStats = fixedData.filter(liver => liver.duplicateImageFixed);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Duplicate image URLs fixed successfully',
          stats: {
            totalProcessed: fixedData.length,
            duplicatesFixed: duplicateStats.length,
            fixedAt: new Date().toISOString()
          },
          fixedImages: duplicateStats.map(liver => ({
            name: liver.name,
            id: liver.id,
            original: liver.duplicateImageFixed.original,
            fixed: liver.duplicateImageFixed.fixed
          }))
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Failed to fix duplicate images:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // データ整合性チェック・修正エンドポイント
    if (url.pathname === '/fix-data-mapping') {
      try {
        const data = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        
        if (!data) {
          return new Response(JSON.stringify({
            success: false,
            error: "No data found in storage"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const parsedData = JSON.parse(data);
        console.log(`🔧 Starting data mapping integrity check for ${parsedData.data.length} livers...`);
        
        // データ整合性チェックと修正
        const fixedData = await fixDataMappingIssues(parsedData.data, env);
        
        // 修正されたデータを保存
        const updatedData = {
          ...parsedData,
          data: fixedData.correctedData,
          lastDataMappingFixAt: new Date().toISOString(),
          mappingFixStats: fixedData.stats
        };
        
        await env.LIVER_DATA.put('latest_data', JSON.stringify(updatedData));
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Data mapping issues fixed successfully',
          stats: fixedData.stats,
          fixedMappings: fixedData.fixedMappings,
          detailReport: fixedData.detailReport
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Failed to fix data mapping:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 特定データ交換修正エンドポイント
    if (url.pathname === '/swap-liver-data') {
      try {
        const { searchParams } = new URL(request.url);
        const id1 = searchParams.get('id1'); // 107
        const id2 = searchParams.get('id2'); // 108
        
        if (!id1 || !id2) {
          return new Response(JSON.stringify({
            success: false,
            error: "Both id1 and id2 parameters are required"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const data = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!data) {
          return new Response(JSON.stringify({
            success: false,
            error: "No data found in storage"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const parsedData = JSON.parse(data);
        
        // データ交換実行（直接実装）
        const liver1Index = parsedData.data.findIndex(l => l.originalId === id1);
        const liver2Index = parsedData.data.findIndex(l => l.originalId === id2);
        
        if (liver1Index === -1 || liver2Index === -1) {
          return new Response(JSON.stringify({
            success: false,
            error: `One or both livers not found: ${id1}, ${id2}`
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const liver1 = parsedData.data[liver1Index];
        const liver2 = parsedData.data[liver2Index];
        
        // 交換前の状態を記録
        const beforeSwap = {
          [id1]: { name: liver1.name, detailName: liver1.detailName, comments: liver1.comments?.[0]?.substring(0, 50) },
          [id2]: { name: liver2.name, detailName: liver2.detailName, comments: liver2.comments?.[0]?.substring(0, 50) }
        };
        
        // 詳細データフィールドを交換
        const fieldsToSwap = ['detailName', 'comments', 'profileImages', 'collaboOK', 'collaboNG', 'profileInfo', 'rawProfileTexts', 'schedules', 'genderSearchResults'];
        
        fieldsToSwap.forEach(field => {
          const temp = liver1[field];
          liver1[field] = liver2[field];
          liver2[field] = temp;
        });
        
        // 交換後の状態を記録
        const afterSwap = {
          [id1]: { name: liver1.name, detailName: liver1.detailName, comments: liver1.comments?.[0]?.substring(0, 50) },
          [id2]: { name: liver2.name, detailName: liver2.detailName, comments: liver2.comments?.[0]?.substring(0, 50) }
        };
        
        const result = {
          success: true,
          details: { fieldsSwapped: fieldsToSwap, beforeSwap, afterSwap, timestamp: new Date().toISOString() }
        };
        
        if (result.success) {
          // 修正されたデータを保存
          const updatedData = {
            ...parsedData,
            data: result.correctedData,
            lastDataSwapAt: new Date().toISOString(),
            dataSwapHistory: (parsedData.dataSwapHistory || []).concat([{
              swappedIds: [id1, id2],
              swappedAt: new Date().toISOString(),
              details: result.details
            }])
          };
          
          await env.LIVER_DATA.put('latest_data', JSON.stringify(updatedData));
          
          return new Response(JSON.stringify({
            success: true,
            message: `Successfully swapped data between originalId ${id1} and ${id2}`,
            details: result.details
          }, null, 2), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: result.error
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
      } catch (error) {
        console.error('❌ Failed to swap liver data:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // データ復元エンドポイント
    if (url.pathname === '/restore-data') {
      try {
        // 複数のバックアップソースから復元を試みる
        const backupKeys = ['latest_data', 'latest_detailed_data', 'latest_basic_data'];
        let restoredData = null;
        let sourceKey = null;
        
        for (const key of backupKeys) {
          const data = env.LIVER_DATA ? await env.LIVER_DATA.get(key) : null;
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
              restoredData = parsed;
              sourceKey = key;
              break;
            }
          }
        }
        
        if (!restoredData) {
          return new Response(JSON.stringify({
            success: false,
            error: "No valid backup data found in any storage key"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // データを latest_data として復元
        await env.LIVER_DATA.put('latest_data', JSON.stringify(restoredData));
        
        return new Response(JSON.stringify({
          success: true,
          message: `Data restored successfully from ${sourceKey}`,
          restoredCount: restoredData.data.length,
          sourceKey: sourceKey,
          timestamp: new Date().toISOString()
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Failed to restore data:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 特定URLの詳細確認エンドポイント
    if (url.pathname === '/verify-liver-id') {
      try {
        const { searchParams } = new URL(request.url);
        const targetId = searchParams.get('id'); // 109
        
        if (!targetId) {
          return new Response(JSON.stringify({
            success: false,
            error: "id parameter is required (e.g., ?id=109)"
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // ログイン実行
        const loginResult = await performRobustLogin(env);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }
        
        // 詳細ページ取得
        const detailUrl = `https://www.comisapolive.com/liver/detail/${targetId}/`;
        const response = await fetch(detailUrl, {
          headers: {
            'Cookie': loginResult.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://www.comisapolive.com/liver/list/'
          }
        });
        
        if (!response.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: `HTTP ${response.status} for ${detailUrl}`,
            targetId,
            detailUrl
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const html = await response.text();
        
        // ライバー名を抽出
        const liverNameMatch = html.match(/<h1[^>]*class="[^"]*liverProf_name[^"]*"[^>]*>([^<]*)<\/h1>/);
        const liverName = liverNameMatch ? liverNameMatch[1].trim() : null;
        
        // コメントを抽出
        const commentMatch = html.match(/<p[^>]*class="[^"]*liverProf_comment[^"]*"[^>]*>([^<]*)<\/p>/);
        const comment = commentMatch ? commentMatch[1].trim().substring(0, 100) : null;
        
        // プロフィール画像URL抽出
        const imageMatch = html.match(/user_files_thumbnail\/\d+\/[^\/]+\.jpg/);
        const profileImageUrl = imageMatch ? `https://www.comisapolive.com/${imageMatch[0]}/500.jpg` : null;
        
        return new Response(JSON.stringify({
          success: true,
          verification: {
            targetId,
            detailUrl,
            liverName,
            comment,
            profileImageUrl,
            verifiedAt: new Date().toISOString()
          },
          analysis: {
            nameMatches: {
              containsGyu: liverName ? liverName.includes('ぎゅー') : false,
              containsNyu: liverName ? liverName.includes('にゅー') : false,
              exactMatch: liverName === 'ぎゅーにゅー'
            },
            expectedMappings: {
              correctName: liverName,
              shouldBeId: targetId,
              currentIssue: liverName !== 'ぎゅーにゅー' ? 'Name mismatch detected' : 'Name matches correctly'
            }
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Failed to verify liver ID:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 重複ID修正エンドポイント
    if (url.pathname === '/fix-duplicate-ids') {
      try {
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No liver data found'
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const existingData = JSON.parse(existingDataStr);
        let fixedCount = 0;
        const fixedLivers = [];
        const usedIds = new Set();

        // 各ライバーに一意のIDを割り当て
        existingData.data.forEach((liver, index) => {
          let originalId = liver.id;
          
          // IDが既に使用されている場合は新しいIDを生成
          if (usedIds.has(liver.id)) {
            // profileImagesのoriginalUrlからIDを推測
            let newId = liver.id;
            if (liver.profileImages && liver.profileImages[0] && liver.profileImages[0].originalUrl) {
              const match = liver.profileImages[0].originalUrl.match(/user_files_thumbnail\/(\d+)\//);
              if (match) {
                newId = `_real_${match[1]}`;
              }
            }
            
            // それでも重複する場合はインデックスベースIDを生成
            if (usedIds.has(newId)) {
              newId = `_unique_${Date.now()}_${index}`;
            }
            
            liver.id = newId;
            liver.imageUrl = `/api/images/${newId}.jpg`;
            
            fixedCount++;
            fixedLivers.push({
              name: liver.name,
              originalId,
              newId,
              profileImageUrl: liver.profileImages?.[0]?.originalUrl || 'none'
            });
          }
          
          usedIds.add(liver.id);
        });

        // 修正されたデータを保存
        existingData.lastIdFixAt = new Date().toISOString();
        existingData.idFixHistory = (existingData.idFixHistory || []).concat([{
          fixedAt: new Date().toISOString(),
          fixedCount,
          fixedLivers: fixedLivers.map(l => ({
            name: l.name,
            originalId: l.originalId,
            newId: l.newId
          }))
        }]);

        await env.LIVER_DATA.put('latest_data', JSON.stringify(existingData));

        return new Response(JSON.stringify({
          success: true,
          message: `Fixed ${fixedCount} duplicate IDs`,
          fixedCount,
          fixedLivers,
          summary: {
            totalLivers: existingData.data.length,
            duplicatesFixed: fixedCount
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error('❌ Failed to fix duplicate IDs:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 画像URL修正エンドポイント
    if (url.pathname === '/fix-image-urls') {
      try {
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No liver data found'
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const existingData = JSON.parse(existingDataStr);
        let fixedCount = 0;
        const fixedLivers = [];

        // 各ライバーのimageUrlをprofileImagesの最初のoriginalUrlに合わせる
        existingData.data.forEach(liver => {
          if (liver.profileImages && liver.profileImages.length > 0 && liver.profileImages[0].originalUrl) {
            const correctImageUrl = liver.profileImages[0].originalUrl;
            
            // imageUrlをprofileImagesに基づいて修正
            const newImageUrl = `/api/images/${liver.id}.jpg`;
            
            if (liver.imageUrl !== newImageUrl || liver.imageUrl.includes('_p1_') || liver.imageUrl.includes('_p3_')) {
              const oldImageUrl = liver.imageUrl;
              liver.imageUrl = newImageUrl;
              
              // profileImagesが正しいoriginalUrlを保持していることを確認
              if (!liver.profileImages[0].originalUrl.includes('comisapolive.com')) {
                liver.profileImages[0].originalUrl = `https://www.comisapolive.com${liver.profileImages[0].originalUrl}`;
              }
              
              fixedCount++;
              fixedLivers.push({
                id: liver.id,
                name: liver.name,
                oldImageUrl,
                newImageUrl,
                correctImageUrl
              });
            }
          }
        });

        // 修正されたデータを保存
        existingData.lastImageUrlFix = new Date().toISOString();
        existingData.imageUrlFixHistory = (existingData.imageUrlFixHistory || []).concat([{
          fixedAt: new Date().toISOString(),
          fixedCount,
          fixedLivers: fixedLivers.map(l => ({
            id: l.id,
            name: l.name,
            oldUrl: l.oldImageUrl,
            newUrl: l.newImageUrl
          }))
        }]);

        await env.LIVER_DATA.put('latest_data', JSON.stringify(existingData));

        return new Response(JSON.stringify({
          success: true,
          message: `Fixed ${fixedCount} image URLs`,
          fixedCount,
          fixedLivers,
          summary: {
            totalLivers: existingData.data.length,
            fixedThisRun: fixedCount,
            remainingOldFormat: existingData.data.filter(l => l.imageUrl.includes('_p1_') || l.imageUrl.includes('_p3_')).length
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error('❌ Failed to fix image URLs:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 特定ライバー追加エンドポイント
    if (url.pathname === '/add-specific-livers') {
      try {
        const { searchParams } = new URL(request.url);
        const targetIds = searchParams.get('ids')?.split(',') || ['107', '108', '109'];
        
        console.log(`🎯 Adding specific livers: ${targetIds.join(', ')}`);
        
        // 現在のデータを取得
        const currentDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        const currentData = currentDataStr ? JSON.parse(currentDataStr) : { data: [] };
        
        // 各IDのデータを個別に取得
        const newLivers = [];
        
        for (const targetId of targetIds) {
          try {
            console.log(`🔍 Processing liver ID: ${targetId}`);
            
            // ログイン実行
            const loginResult = await performRobustLogin(env);
            if (!loginResult.success) {
              throw new Error(`Login failed: ${loginResult.error}`);
            }
            
            // 詳細ページから完全なデータを取得
            const detailUrl = `https://www.comisapolive.com/liver/detail/${targetId}/`;
            const response = await fetch(detailUrl, {
              headers: {
                'Cookie': loginResult.cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Referer': 'https://www.comisapolive.com/liver/list/'
              }
            });
            
            if (!response.ok) {
              console.log(`⚠️ Skipping ID ${targetId}: HTTP ${response.status}`);
              continue;
            }
            
            const html = await response.text();
            
            // データ抽出
            const liverNameMatch = html.match(/<h1[^>]*class="[^"]*liverProf_name[^"]*"[^>]*>([^<]*)<\/h1>/);
            const liverName = liverNameMatch ? liverNameMatch[1].trim() : null;
            
            if (!liverName) {
              console.log(`⚠️ Skipping ID ${targetId}: No name found`);
              continue;
            }
            
            // 基本ライバーオブジェクト構築
            const liverId = `_manual_${targetId}`;
            const liver = {
              id: liverId,
              originalId: targetId,
              name: liverName,
              detailUrl: detailUrl,
              detailName: liverName,
              platform: 'Unknown',
              followers: 0,
              imageUrl: `/api/images/${liverId}.jpg`,
              page: 'manual',
              updatedAt: Date.now(),
              
              // 詳細データ抽出
              comments: [],
              profileImages: [],
              addedManually: {
                addedAt: new Date().toISOString(),
                reason: 'Manual addition for data mapping fix'
              }
            };
            
            // コメント抽出
            const commentMatch = html.match(/<p[^>]*class="[^"]*liverProf_comment[^"]*"[^>]*>([^<]*)<\/p>/);
            if (commentMatch) {
              liver.comments = [commentMatch[1].trim()];
            }
            
            // プロフィール画像URL抽出
            const imageMatch = html.match(/user_files_thumbnail\/\d+\/[^\/]+\.jpg/);
            if (imageMatch) {
              liver.profileImages = [{
                url: null,
                originalUrl: `https://www.comisapolive.com/${imageMatch[0]}/500.jpg`
              }];
            }
            
            newLivers.push(liver);
            console.log(`✅ Added liver: ${liverName} (${targetId})`);
            
            // 過負荷防止
            await sleep(1000);
            
          } catch (error) {
            console.error(`❌ Failed to add liver ${targetId}:`, error.message);
          }
        }
        
        // 既存データと結合（重複を除去）
        const existingIds = new Set(currentData.data.map(l => l.originalId));
        const uniqueNewLivers = newLivers.filter(l => !existingIds.has(l.originalId));
        const combinedData = [...currentData.data, ...uniqueNewLivers];
        
        // 保存
        const updatedData = {
          ...currentData,
          data: combinedData,
          total: combinedData.length,
          lastManualAddition: new Date().toISOString(),
          manuallyAdded: uniqueNewLivers.map(l => ({ originalId: l.originalId, name: l.name }))
        };
        
        await env.LIVER_DATA.put('latest_data', JSON.stringify(updatedData));
        
        return new Response(JSON.stringify({
          success: true,
          message: `Successfully added ${uniqueNewLivers.length} livers manually`,
          addedLivers: uniqueNewLivers.map(l => ({ originalId: l.originalId, name: l.name })),
          totalLivers: combinedData.length,
          timestamp: new Date().toISOString()
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Failed to add specific livers:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/fix-images-v2') {
      try {
        const batchSize = parseInt(new URL(request.url).searchParams.get('batch') || '2');
        
        console.log(`🖼️ Starting improved image fix process (batch size: ${batchSize})...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        const results = [];
        
        // 最初のN人の画像のみ処理
        for (let i = 0; i < Math.min(existingData.data.length, batchSize) && subrequestCount < 40; i++) {
          const liver = existingData.data[i];
          
          console.log(`🖼️ Processing image for: ${liver.name} (ID: ${liver.originalId})`);
          
          const result = {
            liverName: liver.name,
            originalId: liver.originalId,
            success: false,
            error: null,
            imageUrl: null
          };
          
          try {
            // profileImages から元のURLを取得
            let originalImageUrl = null;
            
            if (liver.profileImages && liver.profileImages.length > 0) {
              originalImageUrl = liver.profileImages[0].originalUrl;
              console.log(`📸 Using profileImage URL: ${originalImageUrl}`);
            } else {
              // フォールバック: 推測URLを構築
              originalImageUrl = `https://www.comisapolive.com/user_files_thumbnail/${liver.originalId}/`;
              console.log(`📸 Using fallback URL: ${originalImageUrl}`);
            }
            
            if (!originalImageUrl) {
              throw new Error('No image URL available');
            }
            
            // 画像を取得
            console.log(`📥 Fetching image from: ${originalImageUrl}`);
            const imageResponse = await fetch(originalImageUrl);
            subrequestCount++;
            
            console.log(`📥 Image response status: ${imageResponse.status}`);
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const imageSize = imageBuffer.byteLength;
              
              console.log(`📏 Image size: ${imageSize} bytes`);
              
              if (imageSize > 0) {
                const imageId = `${liver.id}.jpg`;
                
                // R2に保存
                if (env.IMAGES) {
                  await env.IMAGES.put(imageId, imageBuffer, {
                    httpMetadata: { contentType: 'image/jpeg' }
                  });
                  
                  console.log(`✅ Saved image for ${liver.name}: ${imageId}`);
                  result.success = true;
                  result.imageUrl = `/api/images/${imageId}`;
                  imagesProcessed++;
                } else {
                  throw new Error('IMAGES binding not available');
                }
              } else {
                throw new Error('Empty image data');
              }
            } else {
              throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
            }
            
            await sleep(500); // 長めの休憩
            
          } catch (imageError) {
            console.error(`❌ Failed to process image for ${liver.name}:`, imageError);
            result.error = imageError.message;
            subrequestCount++;
          }
          
          results.push(result);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Improved image fix completed',
          imagesProcessed: imagesProcessed,
          subrequestsUsed: subrequestCount,
          batchSize: batchSize,
          results: results,
          nextBatch: imagesProcessed < existingData.data.length ? 
            `curl "${new URL(request.url).origin}/fix-images-v2?batch=${batchSize}"` : null
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Improved image fix failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 画像URLテスト用エンドポイント
    if (url.pathname === '/test-image-urls') {
      try {
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        const testResults = [];
        
        // 最初の3人のURLをテスト
        for (let i = 0; i < Math.min(3, existingData.data.length); i++) {
          const liver = existingData.data[i];
          
          const urlTests = [];
          
          // profileImages のURL
          if (liver.profileImages && liver.profileImages.length > 0) {
            urlTests.push({
              type: 'profileImage',
              url: liver.profileImages[0].originalUrl
            });
          }
          
          // 推測URL
          urlTests.push({
            type: 'fallback',
            url: `https://www.comisapolive.com/user_files_thumbnail/${liver.originalId}/`
          });
          
          testResults.push({
            liverName: liver.name,
            originalId: liver.originalId,
            availableUrls: urlTests
          });
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Image URL test results',
          testResults: testResults
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
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

    if (url.pathname === '/fix-images-browser') {
      try {
        const batchSize = parseInt(new URL(request.url).searchParams.get('batch') || '2');
        
        console.log(`🖼️ Starting browser-like image fix process (batch size: ${batchSize})...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        const results = [];
        
        // 最初のN人の画像のみ処理
        for (let i = 0; i < Math.min(existingData.data.length, batchSize) && subrequestCount < 40; i++) {
          const liver = existingData.data[i];
          
          console.log(`🖼️ Processing browser-like image for: ${liver.name} (ID: ${liver.originalId})`);
          
          const result = {
            liverName: liver.name,
            originalId: liver.originalId,
            success: false,
            error: null,
            imageUrl: null,
            statusCode: null
          };
          
          try {
            // profileImages から元のURLを取得
            let originalImageUrl = null;
            
            if (liver.profileImages && liver.profileImages.length > 0) {
              originalImageUrl = liver.profileImages[0].originalUrl;
              console.log(`📸 Using profileImage URL: ${originalImageUrl}`);
            }
            
            if (!originalImageUrl) {
              throw new Error('No image URL available');
            }
            
            // より完全なブラウザヘッダーで画像を取得
            console.log(`📥 Fetching browser-like image from: ${originalImageUrl}`);
            const imageResponse = await fetch(originalImageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"'
              }
            });
            subrequestCount++;
            
            result.statusCode = imageResponse.status;
            console.log(`📥 Browser-like image response status: ${imageResponse.status}`);
            console.log(`📥 Response headers:`, Object.fromEntries(imageResponse.headers.entries()));
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const imageSize = imageBuffer.byteLength;
              
              console.log(`📏 Image size: ${imageSize} bytes`);
              
              if (imageSize > 0) {
                const imageId = `${liver.id}.jpg`;
                
                // R2に保存
                if (env.IMAGES) {
                  await env.IMAGES.put(imageId, imageBuffer, {
                    httpMetadata: { 
                      contentType: imageResponse.headers.get('content-type') || 'image/jpeg'
                    }
                  });
                  
                  console.log(`✅ Saved browser-like image for ${liver.name}: ${imageId}`);
                  result.success = true;
                  result.imageUrl = `/api/images/${imageId}`;
                  imagesProcessed++;
                } else {
                  throw new Error('IMAGES binding not available');
                }
              } else {
                throw new Error('Empty image data');
              }
            } else {
              // レスポンスボディも確認
              const errorText = await imageResponse.text();
              console.log(`❌ Error response body:`, errorText.substring(0, 200));
              throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
            }
            
            await sleep(2000); // 長めの休憩でサーバー負荷を軽減
            
          } catch (imageError) {
            console.error(`❌ Failed to process browser-like image for ${liver.name}:`, imageError);
            result.error = imageError.message;
            subrequestCount++;
          }
          
          results.push(result);
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Browser-like image fix completed',
          imagesProcessed: imagesProcessed,
          subrequestsUsed: subrequestCount,
          batchSize: batchSize,
          results: results,
          nextBatch: imagesProcessed > 0 && imagesProcessed < existingData.data.length ? 
            `curl "${new URL(request.url).origin}/fix-images-browser?batch=${batchSize}"` : null
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Browser-like image fix failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/fix-images-progressive') {
      try {
        const batchSize = parseInt(new URL(request.url).searchParams.get('batch') || '2');
        const skipProcessed = new URL(request.url).searchParams.get('skip') !== 'false';
        
        console.log(`🖼️ Starting progressive image fix process (batch size: ${batchSize}, skip processed: ${skipProcessed})...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        const results = [];
        let processedCount = 0;
        let skippedCount = 0;
        
        // R2で既存画像をチェックして処理済みを特定
        const processedImages = new Set();
        if (skipProcessed) {
          console.log('🔍 Checking for existing images in R2...');
          // 簡易的に最初の数人をチェック
          for (let i = 0; i < Math.min(10, existingData.data.length); i++) {
            const liver = existingData.data[i];
            const imageId = `${liver.id}.jpg`;
            try {
              const existingImage = await env.IMAGES.get(imageId);
              if (existingImage) {
                processedImages.add(liver.id);
                console.log(`✓ Already processed: ${liver.name}`);
              }
            } catch (e) {
              // 画像が存在しない（正常）
            }
          }
          console.log(`📊 Found ${processedImages.size} already processed images`);
        }
        
        // 未処理のライバーのみを対象に処理
        let processedInBatch = 0;
        for (let i = 0; i < existingData.data.length && processedInBatch < batchSize && subrequestCount < 40; i++) {
          const liver = existingData.data[i];
          
          // 既に処理済みの場合はスキップ
          if (skipProcessed && processedImages.has(liver.id)) {
            skippedCount++;
            continue;
          }
          
          console.log(`🖼️ Processing progressive image for: ${liver.name} (ID: ${liver.originalId})`);
          
          const result = {
            liverName: liver.name,
            originalId: liver.originalId,
            liverId: liver.id,
            success: false,
            error: null,
            imageUrl: null,
            statusCode: null,
            skipped: false
          };
          
          try {
            // profileImages から元のURLを取得
            let originalImageUrl = null;
            
            if (liver.profileImages && liver.profileImages.length > 0) {
              originalImageUrl = liver.profileImages[0].originalUrl;
              console.log(`📸 Using profileImage URL: ${originalImageUrl}`);
            }
            
            if (!originalImageUrl) {
              throw new Error('No image URL available');
            }
            
            // ブラウザライクなヘッダーで画像を取得
            console.log(`📥 Fetching progressive image from: ${originalImageUrl}`);
            const imageResponse = await fetch(originalImageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"'
              }
            });
            subrequestCount++;
            
            result.statusCode = imageResponse.status;
            console.log(`📥 Progressive image response status: ${imageResponse.status}`);
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const imageSize = imageBuffer.byteLength;
              
              console.log(`📏 Image size: ${imageSize} bytes`);
              
              if (imageSize > 0) {
                const imageId = `${liver.id}.jpg`;
                
                // R2に保存
                if (env.IMAGES) {
                  await env.IMAGES.put(imageId, imageBuffer, {
                    httpMetadata: { 
                      contentType: imageResponse.headers.get('content-type') || 'image/jpeg'
                    }
                  });
                  
                  console.log(`✅ Saved progressive image for ${liver.name}: ${imageId}`);
                  result.success = true;
                  result.imageUrl = `/api/images/${imageId}`;
                  imagesProcessed++;
                  processedInBatch++;
                } else {
                  throw new Error('IMAGES binding not available');
                }
              } else {
                throw new Error('Empty image data');
              }
            } else {
              throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
            }
            
            await sleep(1500); // 適度な休憩
            
          } catch (imageError) {
            console.error(`❌ Failed to process progressive image for ${liver.name}:`, imageError);
            result.error = imageError.message;
            subrequestCount++;
            processedInBatch++; // エラーでもカウント
          }
          
          results.push(result);
          processedCount++;
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Progressive image fix completed',
          imagesProcessed: imagesProcessed,
          subrequestsUsed: subrequestCount,
          batchSize: batchSize,
          skippedCount: skippedCount,
          processedCount: processedCount,
          results: results,
          totalLivers: existingData.data.length,
          nextBatch: (processedCount + skippedCount) < existingData.data.length ? 
            `curl "${new URL(request.url).origin}/fix-images-progressive?batch=${batchSize}"` : null,
          allComplete: (processedCount + skippedCount) >= existingData.data.length
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Progressive image fix failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/fix-all-images') {
      try {
        console.log(`🖼️ Starting complete image fix process...`);
        
        // 既存データを取得
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        const results = [];
        let skippedCount = 0;
        
        // R2で既存画像をチェック
        const processedImages = new Set();
        console.log('🔍 Checking for existing images in R2...');
        
        for (const liver of existingData.data) {
          const imageId = `${liver.id}.jpg`;
          try {
            const existingImage = await env.IMAGES.get(imageId);
            if (existingImage) {
              processedImages.add(liver.id);
              console.log(`✓ Already processed: ${liver.name}`);
            }
          } catch (e) {
            // 画像が存在しない（未処理）
          }
        }
        
        console.log(`📊 Found ${processedImages.size} already processed images`);
        console.log(`📊 Need to process ${existingData.data.length - processedImages.size} images`);
        
        // 全ライバーを処理（subrequest制限まで）
        for (const liver of existingData.data) {
          if (subrequestCount >= 45) { // 安全マージン
            console.log(`⚠️ Approaching subrequest limit, stopping at ${subrequestCount}`);
            break;
          }
          
          // 既に処理済みの場合はスキップ
          if (processedImages.has(liver.id)) {
            skippedCount++;
            results.push({
              liverName: liver.name,
              originalId: liver.originalId,
              liverId: liver.id,
              success: true,
              skipped: true,
              imageUrl: `/api/images/${liver.id}.jpg`
            });
            continue;
          }
          
          console.log(`🖼️ Processing image for: ${liver.name} (${imagesProcessed + 1}/${existingData.data.length - processedImages.size})`);
          
          const result = {
            liverName: liver.name,
            originalId: liver.originalId,
            liverId: liver.id,
            success: false,
            error: null,
            imageUrl: null,
            statusCode: null,
            skipped: false
          };
          
          try {
            // profileImages から元のURLを取得
            let originalImageUrl = null;
            
            if (liver.profileImages && liver.profileImages.length > 0) {
              originalImageUrl = liver.profileImages[0].originalUrl;
            }
            
            if (!originalImageUrl) {
              throw new Error('No image URL available');
            }
            
            // ブラウザライクなヘッダーで画像を取得
            const imageResponse = await fetch(originalImageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin'
              }
            });
            subrequestCount++;
            
            result.statusCode = imageResponse.status;
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const imageSize = imageBuffer.byteLength;
              
              if (imageSize > 0) {
                const imageId = `${liver.id}.jpg`;
                
                // R2に保存
                if (env.IMAGES) {
                  await env.IMAGES.put(imageId, imageBuffer, {
                    httpMetadata: { 
                      contentType: imageResponse.headers.get('content-type') || 'image/jpeg'
                    }
                  });
                  
                  console.log(`✅ Saved image for ${liver.name}: ${imageId} (${imagesProcessed + 1})`);
                  result.success = true;
                  result.imageUrl = `/api/images/${imageId}`;
                  imagesProcessed++;
                } else {
                  throw new Error('IMAGES binding not available');
                }
              } else {
                throw new Error('Empty image data');
              }
            } else {
              throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
            }
            
            // 短い休憩（効率化のため短縮）
            await sleep(800);
            
          } catch (imageError) {
            console.error(`❌ Failed to process image for ${liver.name}:`, imageError);
            result.error = imageError.message;
            subrequestCount++;
          }
          
          results.push(result);
        }
        
        const totalProcessed = processedImages.size + imagesProcessed;
        const allComplete = totalProcessed >= existingData.data.length;
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Complete image fix finished',
          newImagesProcessed: imagesProcessed,
          alreadyProcessed: processedImages.size,
          totalProcessed: totalProcessed,
          totalLivers: existingData.data.length,
          subrequestsUsed: subrequestCount,
          allComplete: allComplete,
          results: results.filter(r => !r.skipped), // スキップ分は除外して表示
          summary: {
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success && !r.skipped).length,
            skipped: results.filter(r => r.skipped).length
          },
          continueWith: !allComplete ? 
            `curl "${new URL(request.url).origin}/fix-all-images"` : null
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('❌ Complete image fix failed:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    if (url.pathname === '/fix-images-inline') {
      try {
        console.log(`🖼️ Starting inline image fix process...`);
        
        const existingDataStr = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
        if (!existingDataStr) {
          throw new Error('No existing data found.');
        }
        
        const existingData = JSON.parse(existingDataStr);
        let subrequestCount = 0;
        let imagesProcessed = 0;
        let permanentlySaved = 0;
        const results = [];
        
        // 全ライバーの画像を処理
        for (const liver of existingData.data) {
          if (subrequestCount >= 45) {
            console.log(`⚠️ Subrequest limit reached`);
            break;
          }
          
          console.log(`🔍 Processing image for: ${liver.name}`);
          
          // 画像存在確認（インライン）
          const imageId = `${liver.id}.jpg`;
          let imageExists = false;
          
          try {
            const r2Object = await env.IMAGES.get(imageId);
            if (r2Object) {
              imageExists = true;
              console.log(`✓ Image already exists: ${liver.name}`);
            }
          } catch (e) {
            // 画像が存在しない（正常）
          }
          
          if (imageExists) {
            results.push({
              liverName: liver.name,
              status: 'already_exists',
              imageUrl: `/api/images/${imageId}`
            });
            continue;
          }
          
          // 画像を取得して保存
          try {
            let originalImageUrl = null;
            if (liver.profileImages && liver.profileImages.length > 0) {
              originalImageUrl = liver.profileImages[0].originalUrl;
            }
            
            if (!originalImageUrl) {
              throw new Error('No image URL available');
            }
            
            console.log(`📥 Fetching image: ${liver.name}`);
            const imageResponse = await fetch(originalImageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache'
              }
            });
            subrequestCount++;
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              const contentType = imageResponse.headers.get('content-type');
              
              if (imageBuffer.byteLength > 0) {
                // 永続的な保存（インライン）
                await env.IMAGES.put(imageId, imageBuffer, {
                  httpMetadata: { 
                    contentType: contentType || 'image/jpeg',
                    cacheControl: 'public, max-age=31536000',
                  },
                  customMetadata: {
                    'liver-id': liver.id,
                    'upload-time': new Date().toISOString(),
                    'source': 'inline-scraper',
                    'permanent': 'true'
                  }
                });
                
                // KVにも記録
                if (env.IMAGE_HASHES) {
                  await env.IMAGE_HASHES.put(`image_${liver.id}`, JSON.stringify({
                    imageId: imageId,
                    uploadTime: new Date().toISOString(),
                    size: imageBuffer.byteLength,
                    contentType: contentType || 'image/jpeg',
                    permanent: true
                  }));
                }
                
                console.log(`✅ Saved: ${liver.name} (${imageBuffer.byteLength} bytes)`);
                permanentlySaved++;
                results.push({
                  liverName: liver.name,
                  status: 'newly_saved',
                  imageUrl: `/api/images/${imageId}`,
                  size: imageBuffer.byteLength
                });
              }
            } else {
              throw new Error(`HTTP ${imageResponse.status}`);
            }
            
            await sleep(1000);
            imagesProcessed++;
            
          } catch (error) {
            console.error(`❌ Failed to save ${liver.name}:`, error);
            results.push({
              liverName: liver.name,
              status: 'failed',
              error: error.message
            });
            subrequestCount++;
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Inline image fix completed',
          totalLivers: existingData.data.length,
          permanentlySaved: permanentlySaved,
          subrequestsUsed: subrequestCount,
          results: results
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
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

    // ライバー一覧API - 手動スクレイピングと完全に同じロジックを使用
    if (url.pathname === '/api/livers') {
      try {
        console.log(`🚀 API_MANUAL_SCRAPE_MIRROR_V${DEPLOYMENT_VERSION}`);

        // 手動スクレイピングと完全に同じ処理を実行
        const { scrapeBasicDataOnly, integrateWithExistingDetails, generateHash } = await import('./main-scraper.js');
        const basicLiverData = await scrapeBasicDataOnly(env);

        console.log('🔄 Integrating with existing details in API endpoint...');

        // 統合保護機能を使用して詳細データを保護（手動スクレイピングと同じ）
        const integratedResult = await integrateWithExistingDetails(env, basicLiverData);
        const allLiverData = integratedResult.data;

        const response = {
          data: allLiverData,
          total: allLiverData.length,
          timestamp: new Date().toISOString(),
          stats: {
            withDetails: allLiverData.filter(item => item.hasDetails).length,
            pending: 0
          },
          message: "Manual scraping completed",
          totalLivers: allLiverData.length,
          updated: false,
          sampleLiver: allLiverData.length > 0 ? allLiverData[0] : null,
          allData: allLiverData
        };

        return new Response(JSON.stringify(response), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=300',
            ...corsHeaders
          }
        });

      } catch (error) {
        console.error('❌ API error:', error);
        return new Response(JSON.stringify({
          data: [],
          total: 0,
          error: error.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }
    
    // 口コミAPI
    if (url.pathname.startsWith('/api/reviews')) {
      const { postReview, getReviews, getReviewStats, deleteReview } = await import('./reviews-api.js');

      // POST /api/reviews - 口コミ投稿
      if (request.method === 'POST' && url.pathname === '/api/reviews') {
        return await postReview(request, env);
      }

      // GET /api/reviews/stats/:liverId - 平均評価取得
      if (request.method === 'GET' && url.pathname.startsWith('/api/reviews/stats/')) {
        const liverId = url.pathname.split('/').pop();
        return await getReviewStats(liverId, env);
      }

      // GET /api/reviews/:liverId - 口コミ一覧取得
      if (request.method === 'GET' && url.pathname.startsWith('/api/reviews/')) {
        const liverId = url.pathname.split('/').pop();
        return await getReviews(liverId, env);
      }

      // DELETE /api/reviews/:reviewId - 口コミ削除（管理用）
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/reviews/')) {
        const reviewId = url.pathname.split('/').pop();
        return await deleteReview(reviewId, request, env);
      }

      return new Response(JSON.stringify({
        error: 'Method not allowed'
      }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    // 画像API
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
    
    // エラー情報API
    if (url.pathname === '/api/status') {
      const latestData = env.LIVER_DATA ? await env.LIVER_DATA.get('latest_data') : null;
      const lastError = env.LIVER_DATA ? await env.LIVER_DATA.get('last_error') : null;
      
      return new Response(JSON.stringify({
        status: 'running',
        lastUpdate: latestData ? JSON.parse(latestData).timestamp : null,
        lastError: lastError ? JSON.parse(lastError) : null
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    return new Response(`
Liver Scraper API
=================

Endpoints:
- GET /api/livers           : Get all liver data
- GET /api/images/:id       : Get liver images
- GET /api/status           : Get scraper status
- GET /test                 : Test single liver extraction
- GET /manual-scrape        : 🆕 Manually trigger full scraping
- GET /scrape-status        : 🆕 Get detailed scraping status
- GET /debug-login-only     : Test login only
- GET /debug-list-parsing   : Test list page parsing

Usage: https://your-worker.workers.dev/api/livers
    `, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
