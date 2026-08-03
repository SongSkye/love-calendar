/**
 * Cloudflare Worker - 免费获取微信小程序 openid + 云存储临时链接
 * 部署到 Cloudflare Workers 后，小程序通过 wx.login() 获取 code，
 * 发给此 Worker，Worker 调用微信 jscode2session 接口返回 openid。
 *
 * 部署步骤：
 * 1. 打开 https://dash.cloudflare.com → Workers & Pages → 创建 Worker
 * 2. 把下面代码粘贴进去
 * 3. 修改 APPID 和 SECRET
 * 4. 点击"部署"
 * 5. 记下 Worker URL（如 https://love-calendar.你的账户.workers.dev）
 *
 * 免费额度：10 万次/天，远超小程序用量
 */

// 微信小程序 AppID（你的小程序）
const APPID = 'wx58f20f88ad0c27c7';

// 微信小程序 AppSecret（从 mp.weixin.qq.com → 开发 → 开发管理 → 开发设置 获取）
const SECRET = '82090c79045c0228cbc5c2a728ff6902';

// 云开发环境 ID
const CLOUD_ENV = 'cloudbase-d2gr49l7r2f948ed1';

// 缓存 access_token（有效期 7200 秒，提前 300 秒刷新）
let accessTokenCache = { token: '', expireAt: 0 };

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // 获取 openid
    if (url.pathname === '/api/getOpenid' && request.method === 'POST') {
      try {
        const { code } = await request.json();
        if (!code) {
          return json({ success: false, message: '缺少 code 参数' }, 400);
        }

        // 调用微信 jscode2session 接口
        const wxResp = await fetch(
          `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`
        );
        const wxData = await wxResp.json();

        if (wxData.errcode) {
          return json({ success: false, message: '微信接口错误', error: wxData }, 400);
        }

        return json({ success: true, data: { openid: wxData.openid } });
      } catch (err) {
        return json({ success: false, message: '服务器错误' }, 500);
      }
    }

    // 获取云存储临时下载链接（应用级鉴权，绕过免费版存储权限限制）
    if (url.pathname === '/api/getTempUrls' && request.method === 'POST') {
      try {
        const { fileList } = await request.json();
        if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
          return json({ success: false, message: 'fileList 不能为空', data: [] }, 400);
        }

        // 获取 access_token（应用级鉴权，不受云存储权限限制）
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return json({ success: false, message: '获取 access_token 失败', data: [] }, 500);
        }

        // 调用云开发 HTTP API 获取下载链接
        const tcbResp = await fetch(
          `https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${accessToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              env: CLOUD_ENV,
              file_list: fileList.map(function (fid) {
                return { fileid: fid, max_age: 7200 };
              }),
            }),
          }
        );
        const tcbData = await tcbResp.json();

        if (tcbData.errcode) {
          console.error('batchdownloadfile 失败:', JSON.stringify(tcbData));
          return json({ success: false, message: tcbData.errmsg || '获取下载链接失败', data: [] }, 500);
        }

        // 组装返回结果（与 wx.cloud.getTempFileURL 格式一致）
        const data = (tcbData.file_list || []).map(function (f) {
          return {
            fileID: f.fileid,
            tempFileURL: f.download_url || '',
            status: f.status || 0,
          };
        });

        return json({ success: true, data: data });
      } catch (err) {
        return json({ success: false, message: '服务器错误', data: [] }, 500);
      }
    }

    // 诊断端点：测试 access_token + batchdownloadfile 各环节
    if (url.pathname === '/api/diagnose' && request.method === 'POST') {
      const result = { steps: [] };
      try {
        const { fileList } = await request.json();
        const testFileIds = (fileList && fileList.length > 0) ? fileList : ['cloud://test.xxx'];

        // 步骤1：获取 access_token
        const token = await getAccessToken();
        if (!token) {
          result.steps.push({ step: '获取 access_token', status: 'FAIL', detail: '返回 null' });
          return json({ success: false, message: 'access_token 获取失败', diagnose: result }, 500);
        }
        result.steps.push({ step: '获取 access_token', status: 'OK', tokenPrefix: token.substring(0, 10) + '...' });

        // 步骤2：调用 batchdownloadfile
        const tcbResp = await fetch(
          `https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              env: CLOUD_ENV,
              file_list: testFileIds.map(function (fid) {
                return { fileid: fid, max_age: 7200 };
              }),
            }),
          }
        );
        const tcbData = await tcbResp.json();
        result.steps.push({
          step: 'batchdownloadfile',
          status: tcbData.errcode ? 'FAIL' : 'OK',
          raw: tcbData,
        });

        return json({ success: !tcbData.errcode, diagnose: result });
      } catch (err) {
        result.steps.push({ step: '异常', status: 'FAIL', detail: err.message });
        return json({ success: false, message: '诊断异常', diagnose: result }, 500);
      }
    }

    // 健康检查
    if (url.pathname === '/api/health') {
      return json({ success: true, message: 'ok' });
    }

    return json({ success: false, message: '未知路由' }, 404);
  }
};

/**
 * 获取微信 access_token（应用级，带缓存）
 * 用于调用云开发 HTTP API，绕过免费版存储权限限制
 */
async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expireAt > now) {
    return accessTokenCache.token;
  }

  try {
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`
    );
    const data = await resp.json();

    if (data.access_token) {
      accessTokenCache = {
        token: data.access_token,
        expireAt: now + (data.expires_in - 300) * 1000, // 提前 5 分钟过期
      };
      return data.access_token;
    }
    console.error('获取 access_token 失败:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('获取 access_token 异常:', err);
    return null;
  }
}

/**
 * 返回 JSON 响应
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}