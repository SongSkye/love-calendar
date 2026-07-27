/**
 * Cloudflare Worker - 免费获取微信小程序 openid
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

    // 健康检查
    if (url.pathname === '/api/health') {
      return json({ success: true, message: 'ok' });
    }

    return json({ success: false, message: '未知路由' }, 404);
  }
};

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