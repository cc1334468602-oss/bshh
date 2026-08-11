/**
 * bshh · 助贷员工端 H5 —— 前台服务
 *
 * 职责：托管 H5 静态页面 + 业务数据接口（MySQL 为主，简道云可选导入，Mock 兜底）
 *
 * 数据来源优先级：
 *   1. MySQL（配置 DB_* 环境变量后启用，全量业务数据落地）
 *   2. 简道云（/api/jdy/* 保留，作为可选导入通道）
 *   3. 前端 Mock（数据库与简道云都不可用时，页面仍能演示）
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('./db');

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

// 启动后尝试播种默认数据（仅当数据库已配置且连接成功时）
db.ensureSeed().then(function (ok) {
  if (ok) console.log('[DB] 默认数据已就绪');
}).catch(function (e) { console.error('[DB] 初始化异常：', e.message); });

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

// ================= 数据库行 → 前端客户模型 =================
function rowToCustomer(row) {
  function parseJson(v, def) { if (!v) return def; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return def; } } return v; }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    gender: row.gender || '',
    age: row.age || 0,
    marital: row.marital || '',
    income: Number(row.income) || 0,
    employer: row.employer || '',
    industry: row.industry || '',
    years: row.years || 0,
    assets: row.assets || '',
    liabilities: row.liabilities || '',
    creditScore: row.credit_score || 0,
    creditDesc: row.credit_desc || '',
    collateral: row.collateral ? true : false,
    collateralType: row.collateral_type || '',
    collateralValue: Number(row.collateral_value) || 0,
    demandAmount: Number(row.demand_amount) || 0,
    status: row.status || 'new',
    assignedTo: row.assigned_to || '',
    tags: parseJson(row.tags, []),
    source: row.source || '',
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastFollowUp: row.updated_at,
    matchRecords: parseJson(row.matchRecords, []),
    followUps: parseJson(row.followUps, []),
    type: row.industry || '个体工商户',
    monthlyRev: Number(row.income) || 0,
    loans: [],
  };
}

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function handleApi(req, res, urlPath, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 健康检查
  if (urlPath === '/api/health') {
    var cfgH = loadConfig();
    db.getStatus().then(function (st) {
      res.end(JSON.stringify({
        status: 'ok',
        app: 'bshh-h5',
        uptime: Math.round(process.uptime()),
        time: new Date().toISOString(),
        node: process.version,
        db: st,
        jdyReady: !!(cfgH.apiKey && cfgH.appId),
      }));
    });
    return;
  }

  if (urlPath === '/api/jdy/status' && req.method === 'GET') {
    var cfgS = loadConfig();
    res.end(JSON.stringify({ ready: !!(cfgS.apiKey && cfgS.appId), source: fs.existsSync(CONFIG_PATH) ? 'shared-config' : 'env' }));
    return;
  }

  if (urlPath === '/api/jdy/customers' && req.method === 'POST') {
    var cfg3 = loadConfig();
    var params = {};
    try { params = JSON.parse(body || '{}'); } catch (e) {}
    var filter = {};
    if (params.salesperson) {
      filter = { rel: 'AND', cond: [{ field: '_widget_1771983232211', type: 'text', value: params.salesperson }] };
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
    }).catch(function(e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/jdy/followups' && req.method === 'POST') {
    var cfg5 = loadConfig();
    jdyRequest(cfg5.entries.followUp, {}, 100, cfg5).then(function(r) {
      res.end(JSON.stringify({ success: true, data: r.data || [] }));
    }).catch(function(e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  // ================= 登录（基于数据库员工表） =================
  if (urlPath === '/api/auth/login' && req.method === 'POST') {
    var lp = {};
    try { lp = JSON.parse(body || '{}'); } catch (e) {}
    db.query('SELECT id,name,phone,department FROM employees WHERE phone=?', [lp.phone || ''])
      .then(function (rows) {
        if (!rows || rows.length === 0) {
          res.end(JSON.stringify({ success: false, error: '该手机号未注册，请联系管理员' }));
          return;
        }
        var emp = rows[0];
        res.end(JSON.stringify({
          success: true,
          token: 'mock_token_' + Date.now(),
          user: { id: emp.id, name: emp.name, phone: emp.phone, department: emp.department },
        }));
      })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: '数据库不可用：' + e.message })); });
    return;
  }

  // ================= 业务数据接口（MySQL） =================
  if (urlPath === '/api/db/customers' && req.method === 'POST') {
    var p = {};
    try { p = JSON.parse(body || '{}'); } catch (e) {}
    var where = [];
    var params = [];
    if (p.salesperson) { where.push('assigned_to=?'); params.push(p.salesperson); }
    if (p.status && p.status !== 'all') { where.push('status=?'); params.push(p.status); }
    if (p.keyword) { where.push('(name LIKE ? OR phone LIKE ?)'); params.push('%' + p.keyword + '%', '%' + p.keyword + '%'); }
    var sql = 'SELECT * FROM customers ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY updated_at DESC';
    db.query(sql, params)
      .then(function (rows) {
        // 用纯 SQL 取关联数据，避免依赖 JSON_ARRAYAGG（兼容各版本 MySQL/MariaDB）
        return db.query('SELECT id, customer_id, note, time FROM follow_ups').then(function (fups) {
          return db.query('SELECT id, customer_id, banks, time FROM match_records').then(function (mrs) {
            var fmap = {}, mmap = {};
            fups.forEach(function (f) { (fmap[f.customer_id] = fmap[f.customer_id] || []).push({ time: f.time, note: f.note }); });
            mrs.forEach(function (m) { (mmap[m.customer_id] = mmap[m.customer_id] || []).push({ time: m.time, banks: m.banks }); });
            var data = rows.map(function (r) {
              r.followUps = fmap[r.id] || [];
              r.matchRecords = mmap[r.id] || [];
              return rowToCustomer(r);
            });
            res.end(JSON.stringify({ success: true, data: data, total: rows.length }));
          });
        });
      })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/customers/create' && req.method === 'POST') {
    var nc = {};
    try { nc = JSON.parse(body || '{}'); } catch (e) {}
    var cid = nc.id || genId('C');
    db.query(
      'INSERT INTO customers (id,name,phone,gender,age,marital,income,employer,industry,years,assets,liabilities,credit_score,credit_desc,collateral,collateral_type,collateral_value,demand_amount,status,assigned_to,tags,source,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [cid, nc.name || '未填写', nc.phone || '', nc.gender || '', nc.age || null, nc.marital || '', nc.income || 0, nc.employer || '',
       nc.industry || '', nc.years || 0, nc.assets || '', nc.liabilities || '', nc.creditScore || 0, nc.creditDesc || '',
       nc.collateral ? 1 : 0, nc.collateralType || '', nc.collateralValue || 0, nc.demandAmount || 0, nc.status || 'new',
       nc.assignedTo || '', JSON.stringify(nc.tags || []), nc.source || '', nc.remark || '']
    ).then(function () { res.end(JSON.stringify({ success: true, id: cid })); })
     .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/customers/update' && req.method === 'POST') {
    var uc = {};
    try { uc = JSON.parse(body || '{}'); } catch (e) {}
    if (!uc.id) { res.end(JSON.stringify({ success: false, error: '缺少 id' })); return; }
    var sets = [];
    var up = [];
    var fields = ['name','phone','gender','age','marital','income','employer','industry','years','assets','liabilities','credit_score','credit_desc','collateral','collateral_type','collateral_value','demand_amount','status','assigned_to','source','remark'];
    fields.forEach(function (f) {
      if (uc[f] !== undefined) {
        sets.push(f + '=?');
        if (f === 'collateral') up.push(uc[f] ? 1 : 0);
        else if (f === 'tags') up.push(JSON.stringify(uc[f] || []));
        else if (f === 'age' || f === 'years' || f === 'credit_score') up.push(uc[f] == null ? null : Number(uc[f]));
        else if (f === 'income' || f === 'collateral_value' || f === 'demand_amount') up.push(Number(uc[f]) || 0);
        else up.push(uc[f]);
      }
    });
    if (uc.tags !== undefined) { /* handled above */ }
    if (sets.length === 0) { res.end(JSON.stringify({ success: true, id: uc.id })); return; }
    up.push(uc.id);
    db.query('UPDATE customers SET ' + sets.join(',') + ' WHERE id=?', up)
      .then(function () { res.end(JSON.stringify({ success: true, id: uc.id })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/followups/create' && req.method === 'POST') {
    var fu = {};
    try { fu = JSON.parse(body || '{}'); } catch (e) {}
    if (!fu.customerId) { res.end(JSON.stringify({ success: false, error: '缺少 customerId' })); return; }
    var fid = genId('FU');
    db.query('INSERT INTO follow_ups (id,customer_id,employee_id,note,time) VALUES (?,?,?,?,?)',
      [fid, fu.customerId, fu.employeeId || '', fu.note || '', new Date()])
      .then(function () {
        return db.query("UPDATE customers SET status = CASE WHEN status='new' THEN 'following' ELSE status END WHERE id=?", [fu.customerId]);
      })
      .then(function () { res.end(JSON.stringify({ success: true, id: fid })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/matches/create' && req.method === 'POST') {
    var mr = {};
    try { mr = JSON.parse(body || '{}'); } catch (e) {}
    if (!mr.customerId) { res.end(JSON.stringify({ success: false, error: '缺少 customerId' })); return; }
    var mid = genId('MR');
    db.query('INSERT INTO match_records (id,customer_id,employee_id,banks,note,result,time) VALUES (?,?,?,?,?,?,?)',
      [mid, mr.customerId, mr.employeeId || '', mr.banks || '', mr.note || '', JSON.stringify(mr.result || {}), new Date()])
      .then(function () {
        return db.query("UPDATE customers SET status='matched' WHERE id=?", [mr.customerId]);
      })
      .then(function () { res.end(JSON.stringify({ success: true, id: mid })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/conversations/save' && req.method === 'POST') {
    var cv = {};
    try { cv = JSON.parse(body || '{}'); } catch (e) {}
    var cvid = genId('CV');
    db.query('INSERT INTO conversations (id,employee_id,customer_name,title,messages,created_at) VALUES (?,?,?,?,?,?)',
      [cvid, cv.employeeId || '', cv.customerName || '', cv.title || '', JSON.stringify(cv.messages || []), new Date()])
      .then(function () { res.end(JSON.stringify({ success: true, id: cvid })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/products' && req.method === 'GET') {
    db.query('SELECT * FROM products ORDER BY id').then(function (rows) {
      function parseJson(v) { if (!v) return []; if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return []; } } return v; }
      var data = rows.map(function (r) {
        return { id: r.id, name: r.name, bank: r.bank, bankType: r.bank_type, type: r.type,
          minAmt: Number(r.min_amt), maxAmt: Number(r.max_amt), minRate: Number(r.min_rate), maxRate: Number(r.max_rate),
          terms: parseJson(r.terms), req: parseJson(r.req), features: parseJson(r.features) };
      });
      res.end(JSON.stringify({ success: true, data: data }));
    }).catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/notifications' && req.method === 'GET') {
    var empId = (require('url').parse(req.url, true).query.employeeId) || '';
    db.query('SELECT * FROM notifications WHERE employee_id=? OR employee_id=? ORDER BY time DESC', [empId, ''])
      .then(function (rows) {
        res.end(JSON.stringify({ success: true, data: rows.map(function (r) {
          return { id: r.id, type: r.type, title: r.title, content: r.content, time: r.time, isRead: r.is_read ? true : false };
        }) }));
      }).catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/notifications/read' && req.method === 'POST') {
    var nr = {};
    try { nr = JSON.parse(body || '{}'); } catch (e) {}
    db.query('UPDATE notifications SET is_read=1 WHERE id=?', [nr.id || ''])
      .then(function () { res.end(JSON.stringify({ success: true })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/match-rules' && req.method === 'GET') {
    db.query('SELECT * FROM match_rules WHERE id=1').then(function (rows) {
      if (!rows || rows.length === 0) { res.end(JSON.stringify({ success: false, error: '规则未初始化' })); return; }
      var r = rows[0];
      function parseJson(v, d) { try { return JSON.parse(v); } catch (e) { return d; } }
      res.end(JSON.stringify({ success: true, data: {
        preferred: parseJson(r.preferred, {}), backup: parseJson(r.backup, {}),
        fallback: parseJson(r.fallback, {}), amountMultiplier: parseJson(r.amount_multiplier, {}) } }));
    }).catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
    return;
  }

  if (urlPath === '/api/db/match-rules' && req.method === 'POST') {
    var rule = {};
    try { rule = JSON.parse(body || '{}'); } catch (e) {}
    db.query('UPDATE match_rules SET preferred=?,backup=?,fallback=?,amount_multiplier=? WHERE id=1',
      [JSON.stringify(rule.preferred || {}), JSON.stringify(rule.backup || {}), JSON.stringify(rule.fallback || {}), JSON.stringify(rule.amountMultiplier || {})])
      .then(function () { res.end(JSON.stringify({ success: true })); })
      .catch(function (e) { res.end(JSON.stringify({ success: false, error: e.message })); });
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
      // 显式 Content-Length 避免 chunked 编码在某些网络下被截断
      var cache = ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length,
        'Cache-Control': cache,
      });
      res.end(data);
    }
  });
});

server.listen(PORT, HOST, function() {
  console.log('[' + new Date().toISOString() + '] bshh 前台服务 http://' + HOST + ':' + PORT);
  console.log('数据接口: /api/db/customers, /api/db/followups, /api/db/matches, /api/auth/login');
  console.log('健康检查: /api/health');
});

// 兜底：避免单个异常导致进程退出
process.on('uncaughtException', function (err) {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', function (err) {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});
