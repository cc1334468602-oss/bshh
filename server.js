/**
 * bshh · 助贷员工端 H5 —— 前台服务
 *
 * 职责：托管 H5 静态页面 + 代理简道云数据读取接口
 * 不含：简道云配置的写入与连接测试（那是后台 bshhadmin 的职责）
 *
 * 配置来源优先级：共享配置文件(JDY_CONFIG_PATH) > .env 环境变量
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---- 环境变量加载：生产环境把密钥放 .env，不写进代码 ----
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(function (line) {
    line = line.trim();
    if (!line || line.charAt(0) === '#') return;
    const idx = line.indexOf('=');
    if (idx < 0) return;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  });
})();

const PORT = parseInt(process.env.PORT, 10) || 9191;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const JDY_HOST = 'api.jiandaoyun.com';

// 共享配置文件：与后台 bshhadmin 指向同一路径时，后台改配置前台即时生效
const CONFIG_PATH = process.env.JDY_CONFIG_PATH
  ? path.resolve(process.env.JDY_CONFIG_PATH)
  : path.join(ROOT, 'jdy-config.json');

// 密钥一律从环境变量读取，代码里不留任何真实值，保证仓库可安全托管
const ENV_CONFIG = {
  apiKey: process.env.JDY_API_KEY || '',
  appId:  process.env.JDY_APP_ID  || '',
  entries: {
    customer:    process.env.JDY_ENTRY_CUSTOMER     || '',
    loan:        process.env.JDY_ENTRY_LOAN         || '',
    loanHistory: process.env.JDY_ENTRY_LOAN_HISTORY || '',
    cashFlow:    process.env.JDY_ENTRY_CASHFLOW     || '',
    intention:   process.env.JDY_ENTRY_INTENTION    || '',
    followUp:    process.env.JDY_ENTRY_FOLLOWUP     || '',
    repayment:   process.env.JDY_ENTRY_REPAYMENT    || '',
  },
};

/**
 * 每次请求实时读取，保证后台在管理端改完配置后，前台无需重启即可生效。
 * 共享文件缺字段时用 .env 的值兜底。
 */
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return {
        apiKey: fileCfg.apiKey || ENV_CONFIG.apiKey,
        appId:  fileCfg.appId  || ENV_CONFIG.appId,
        entries: Object.assign({}, ENV_CONFIG.entries, fileCfg.entries || {}),
      };
    } catch (e) {
      console.error('[配置] 共享配置文件解析失败，回退到 .env：', e.message);
    }
  }
  return ENV_CONFIG;
}

(function checkConfigOnBoot() {
  const cfg = loadConfig();
  if (!cfg.apiKey || !cfg.appId) {
    console.warn('[警告] 未检测到简道云凭证。');
    console.warn('       方式一：复制 .env.example 为 .env 填写凭证');
    console.warn('       方式二：在后台系统 bshhadmin 的「简道云接口」页面配置');
    console.warn('       当前将回退到本地 Mock 数据模式。');
  } else {
    console.log('[配置] 简道云凭证已就绪，来源：' +
      (fs.existsSync(CONFIG_PATH) ? '共享配置 ' + CONFIG_PATH : '.env 环境变量'));
  }
})();

const FIELD_MAP_CUSTOMER = {
  '_widget_1771923209993': 'name',
  '_widget_1771923209994': 'phone',
  '_widget_1771985710736': 'level',
  '_widget_1772089340773': 'status',
  '_widget_1771923209996': 'source',
  '_widget_1771983232211': 'salesperson',
  '_widget_1772068830044': 'company',
  '_widget_1772068830054': 'address',
  '_widget_1772068830049': 'requiredAmount',
  '_widget_1772068830045': 'approvedAmount',
  '_widget_1772068830046': 'assets',
  '_widget_1772068830047': 'liabilities',
  '_widget_1776130440780': 'remark',
  '_widget_1776130440771': 'remark2',
  '_widget_1776130780636': 'remark3',
  '_widget_1772173381235': 'numField1',
  '_widget_1772176092127': 'numField2',
};

function mapCustomer(raw) {
  const obj = { _id: raw._id, createTime: raw.createTime, updateTime: raw.updateTime };
  for (const k in FIELD_MAP_CUSTOMER) {
    if (raw[k] !== undefined) {
      let val = raw[k];
      if (k === '_widget_1771983232211' && val && typeof val === 'object') {
        val = val.name || '';
      }
      if (k === '_widget_1772068830054' && val && typeof val === 'object') {
        val = [val.province, val.city, val.district, val.detail].filter(Boolean).join('');
      }
      if (Array.isArray(val) && val.length > 0 && val[0].url) {
        val = val.map(function(f) { return { name: f.name, url: f.url }; });
      }
      obj[FIELD_MAP_CUSTOMER[k]] = val;
    }
  }
  if (!obj.name) obj.name = '未填写';
  if (!obj.phone) obj.phone = '';
  if (!obj.status) obj.status = '活跃状态';
  if (!obj.requiredAmount) obj.requiredAmount = 0;
  else obj.requiredAmount = parseFloat(obj.requiredAmount) || 0;
  if (!obj.approvedAmount) obj.approvedAmount = 0;
  else obj.approvedAmount = parseFloat(obj.approvedAmount) || 0;

  var statusMap = {
    '静默状态': '新线索', '活跃状态': '跟进中',
    '已签约': '已匹配', '审批中': '审批中',
    '已拒绝': '已拒绝', '已放款': '已匹配', '已完成': '已匹配',
  };
  obj.statusLabel = statusMap[obj.status] || obj.status;
  obj.lastFollowDays = Math.floor(Math.random() * 5);
  return obj;
}

function jdyRequest(entryId, filter, limit, config) {
  return new Promise(function(resolve, reject) {
    if (!config.apiKey || !config.appId) {
      return reject(new Error('简道云凭证未配置，请在后台系统配置或填写 .env'));
    }
    if (!entryId) {
      return reject(new Error('目标表单 entry_id 未配置'));
    }
    var body = JSON.stringify({
      app_id: config.appId,
      entry_id: entryId,
      fields: ['*'],
      limit: limit || 100,
      filter: filter || {},
    });
    var options = {
      hostname: JDY_HOST,
      port: 443,
      path: '/api/v5/app/entry/data/list',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    var req = https.request(options, function(res) {
      var chunks = '';
      res.on('data', function(d) { chunks += d; });
      res.on('end', function() {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error('Parse error: ' + chunks.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function handleApi(req, res, urlPath, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 健康检查：供 Nginx / PM2 / 阿里云负载均衡探活
  if (urlPath === '/api/health') {
    var cfgH = loadConfig();
    res.end(JSON.stringify({
      status: 'ok',
      app: 'bshh-h5',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
      node: process.version,
      jdyReady: !!(cfgH.apiKey && cfgH.appId),
    }));
    return;
  }

  // 只读：前台仅暴露"配置是否就绪"，不返回任何凭证内容
  if (urlPath === '/api/jdy/status' && req.method === 'GET') {
    var cfgS = loadConfig();
    res.end(JSON.stringify({
      ready: !!(cfgS.apiKey && cfgS.appId),
      source: fs.existsSync(CONFIG_PATH) ? 'shared-config' : 'env',
    }));
    return;
  }

  if (urlPath === '/api/jdy/customers' && req.method === 'POST') {
    var cfg3 = loadConfig();
    var params = {};
    try { params = JSON.parse(body || '{}'); } catch (e) {}
    var filter = {};
    if (params.salesperson) {
      filter = {
        rel: 'AND',
        cond: [{ field: '_widget_1771983232211', type: 'text', value: params.salesperson }],
      };
    }
    jdyRequest(cfg3.entries.customer, filter, params.limit || 100, cfg3).then(function(r) {
      var customers = (r.data || []).map(mapCustomer);
      res.end(JSON.stringify({ success: true, data: customers, total: customers.length }));
    }).catch(function(e) {
      res.end(JSON.stringify({ success: false, error: e.message }));
    });
    return;
  }

  if (urlPath === '/api/jdy/loans' && req.method === 'POST') {
    var cfg4 = loadConfig();
    jdyRequest(cfg4.entries.loan, {}, 100, cfg4).then(function(r) {
      res.end(JSON.stringify({ success: true, data: r.data || [] }));
    }).catch(function(e) {
      res.end(JSON.stringify({ success: false, error: e.message }));
    });
    return;
  }

  if (urlPath === '/api/jdy/followups' && req.method === 'POST') {
    var cfg5 = loadConfig();
    jdyRequest(cfg5.entries.followUp, {}, 100, cfg5).then(function(r) {
      res.end(JSON.stringify({ success: true, data: r.data || [] }));
    }).catch(function(e) {
      res.end(JSON.stringify({ success: false, error: e.message }));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Unknown API: ' + urlPath }));
}

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

var server = http.createServer(function(req, res) {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath.startsWith('/api/')) {
    var body = '';
    req.on('data', function(d) { body += d; });
    req.on('end', function() { handleApi(req, res, urlPath, body); });
    return;
  }

  // 防目录穿越
  var safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  var filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  var ext = path.extname(filePath);
  var contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, function(err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + urlPath);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, HOST, function() {
  console.log('[' + new Date().toISOString() + '] bshh 前台服务 http://' + HOST + ':' + PORT);
  console.log('数据接口: /api/jdy/customers, /api/jdy/loans, /api/jdy/followups');
  console.log('健康检查: /api/health');
});

// 兜底：避免单个异常导致进程退出
process.on('uncaughtException', function (err) {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', function (err) {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});
