/**
 * app.js - 助贷员工端H5 应用逻辑
 * 包含：鉴权、路由、首页、客户管理、匹配抽屉、对话、个人中心
 */
window.App = (function () {
  'use strict';

  const D = window.MOCK_DATA;
  const E = window.MatchEngine;
  const TOKEN_KEY = 'zdzs_token';
  const USER_KEY = 'zdzs_user';

  // ===== 全局状态 =====
  let state = {
    currentUser: null,
    currentTab: 'home',
    customerFilter: 'all',
    customerPage: 0,
    customerPageSize: 20,
    chatMessages: [],
    currentMatchResult: null,
    currentMatchCustomerId: null,
    currentCustomerId: null,
    verifyCooldown: 0,
    customers: D.CUSTOMERS, // 直接引用Mock数据
    conversations: D.CONVERSATIONS,
  };

  // ===== 工具函数 =====
  function $(id) { return document.getElementById(id); }
  function maskPhone(phone) { return phone.substring(0, 3) + '****' + phone.substring(7); }
  function formatAmount(amt) { return amt >= 10000 ? (amt / 10000).toFixed(amt % 10000 === 0 ? 0 : 1) + '万' : amt.toString(); }
  function formatDate(d) { const dt = new Date(d); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  function formatDateTime(d) { const dt = new Date(d); return formatDate(d) + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0'); }
  function daysBetween(d) { const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return diff; }
  function getStatusLabel(s) { return { new: '新线索', following: '跟进中', matched: '已匹配', approving: '审批中', rejected: '已拒绝' }[s] || s; }
  function getStatusTagClass(s) { return 'tag-' + s; }
  function getWeekday(d) { const w = ['日', '一', '二', '三', '四', '五', '六']; return '周' + w[new Date(d).getDay()]; }

  // ===== 鉴权 =====
  function checkAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (token && userJson) {
      state.currentUser = JSON.parse(userJson);
      showApp();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $('loginPage').style.display = 'flex';
    $('app').classList.add('hidden');
  }

  function showApp() {
    $('loginPage').style.display = 'none';
    $('app').classList.remove('hidden');
    initWatermark();
    renderHome();
    renderProfile();
    initChat();
    loadJdyCustomers();
  }

  function loadJdyCustomers() {
    fetch('/api/jdy/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success && res.data && res.data.length > 0) {
          state.customers = res.data.map(adaptJdyCustomer);
          state.useJdyData = true;
          renderHome();
        }
      })
      .catch(function () {});
  }

  function adaptJdyCustomer(raw) {
    var statusMap = {
      '新线索': 'new', '待首次联系': 'new',
      '跟进中': 'following', '活跃状态': 'following',
      '已匹配': 'matched', '已签约': 'matched', '已放款': 'matched',
      '审批中': 'approving',
      '已拒绝': 'rejected', '失效': 'rejected',
    };
    var st = statusMap[raw.statusLabel] || 'following';
    var amt = (parseFloat(raw.requiredAmount) || 0) * 10000;
    var score = 500 + Math.floor(Math.random() * 200);
    var industries = ['个体工商户', '小微企业', '中小企业', '贸易', '餐饮', '电商', '制造'];
    return {
      id: raw._id || ('jdy_' + Math.random().toString(36).substr(2, 8)),
      name: raw.name || '未填写',
      phone: raw.phone || '',
      status: st,
      demandAmount: amt,
      creditScore: score,
      lastFollowUp: raw.updateTime || raw.createTime || new Date().toISOString(),
      createdAt: raw.createTime || new Date().toISOString(),
      industry: raw.company ? raw.company.substring(0, 6) : industries[Math.floor(Math.random() * industries.length)],
      matchRecords: [],
      type: '个体工商户',
      years: 3,
      monthlyRev: 50000,
      assets: raw.assets || '无',
      liabilities: raw.liabilities || '无',
      collateral: raw.assets && raw.assets !== '无' ? '有' : '无',
      collateralType: '',
      collateralValue: 0,
      loans: [],
      tags: raw.source ? [raw.source] : [],
      _jdyRaw: raw,
    };
  }

  function doLogin() {
    const phone = $('loginPhone').value.trim();
    const code = $('loginCode').value.trim();
    if (!phone || phone.length !== 11) { alert('请输入11位手机号'); return; }
    if (!code || code.length !== 6) { alert('请输入6位验证码'); return; }

    const employee = D.EMPLOYEES.find(e => e.phone === phone);
    if (!employee) { alert('该手机号未注册，请联系管理员'); return; }

    const token = 'mock_token_' + Date.now();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(employee));
    state.currentUser = employee;
    showApp();
  }

  function sendVerifyCode() {
    const phone = $('loginPhone').value.trim();
    if (!phone || phone.length !== 11) { alert('请先输入11位手机号'); return; }
    const btn = $('verifyBtn');
    state.verifyCooldown = 60;
    btn.disabled = true;
    const timer = setInterval(function () {
      state.verifyCooldown--;
      if (state.verifyCooldown <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '获取验证码';
      } else {
        btn.textContent = state.verifyCooldown + 's';
      }
    }, 1000);
    // 演示：如果是演示账号，自动填入验证码
    if (phone === '13800138001') {
      setTimeout(function () { $('loginCode').value = '123456'; }, 500);
    }
  }

  function logout() {
    if (!confirm('确认退出登录？')) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.currentUser = null;
    showLogin();
    $('loginPhone').value = '';
    $('loginCode').value = '';
  }

  // ===== 安全水印 =====
  function initWatermark() {
    updateWatermark();
    setInterval(updateWatermark, 60000);
  }

  function updateWatermark() {
    if (!state.currentUser) return;
    const layer = $('watermarkLayer');
    const name = state.currentUser.name;
    const phoneTail = state.currentUser.phone.substring(7);
    const now = new Date();
    const timeStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const text = name + ' ' + phoneTail + ' ' + timeStr;

    layer.innerHTML = '';
    for (let y = -50; y < window.innerHeight + 100; y += 120) {
      for (let x = -100; x < window.innerWidth + 200; x += 200) {
        const el = document.createElement('div');
        el.className = 'wm-item';
        el.textContent = text;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        layer.appendChild(el);
      }
    }
  }

  // ===== Tab 导航 =====
  function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); p.style.display = 'none'; });
    const page = $('page-' + tab);
    page.classList.add('active');
    if (tab === 'assistant') {
      page.style.display = 'flex';
    } else {
      page.style.display = 'block';
    }
    document.querySelectorAll('.tab-item').forEach(function (t) { t.classList.remove('active'); });
    document.querySelector('.tab-item[data-tab="' + tab + '"]').classList.add('active');
  }

  // ===== 首页渲染 =====
  function renderHome() {
    if (!state.currentUser) return;
    $('homeGreeting').textContent = '你好，' + state.currentUser.name;
    const today = new Date();
    $('homeDate').textContent = formatDate(today) + ' ' + getWeekday(today);

    renderKPI();
    renderQuickFilters();
    renderCustomerList();
  }

  function renderKPI() {
    const customers = state.customers;
    const pending = customers.filter(c => (c.status === 'new' || c.status === 'following') && daysBetween(c.lastFollowUp) >= 1).length;
    const approving = customers.filter(c => c.status === 'approving').length;
    const today = customers.filter(c => daysBetween(c.createdAt) === 0).length;
    $('kpiPending').textContent = pending;
    $('kpiApproving').textContent = approving;
    $('kpiToday').textContent = today;
  }

  function renderQuickFilters() {
    const customers = state.customers;
    const newCount = customers.filter(c => c.status === 'new').length;
    const unconfirmed = customers.filter(c => c.status === 'following' && c.matchRecords.length === 0).length;
    const expiring = customers.filter(c => c.status === 'matched' || c.status === 'approving').length; // 简化：已匹配/审批中的视为临期
    $('quickNew').textContent = newCount;
    $('quickUnconfirmed').textContent = unconfirmed;
    $('quickExpiring').textContent = expiring;
  }

  function renderCustomerList() {
    const all = state.customers;
    let filtered = all;
    const filter = state.customerFilter;
    const filterLabels = { all: '全部', new: '待首次联系', unconfirmed: '匹配待确认', expiring: '贷款临期', pending: '待跟进', approving: '待审批', today: '今日新增' };
    $('customerListFilter').textContent = filterLabels[filter] || '全部';

    if (filter === 'new') filtered = all.filter(c => c.status === 'new');
    else if (filter === 'unconfirmed') filtered = all.filter(c => c.status === 'following' && c.matchRecords.length === 0);
    else if (filter === 'expiring') filtered = all.filter(c => c.status === 'matched' || c.status === 'approving');
    else if (filter === 'pending') filtered = all.filter(c => (c.status === 'new' || c.status === 'following') && daysBetween(c.lastFollowUp) >= 1);
    else if (filter === 'approving') filtered = all.filter(c => c.status === 'approving');
    else if (filter === 'today') filtered = all.filter(c => daysBetween(c.createdAt) === 0);

    const list = $('customerList');
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><div class="es-text">暂无客户</div></div>';
      return;
    }

    const start = 0;
    const end = (state.customerPage + 1) * state.customerPageSize;
    const shown = filtered.slice(start, end);

    let html = '';
    shown.forEach(function (c) {
      const days = daysBetween(c.lastFollowUp);
      const followUpClass = days > 2 ? 'warn' : '';
      const followUpText = days === 0 ? '今天刚跟进' : '距上次跟进 ' + days + '天';
      html += '<div class="customer-card" data-cid="' + c.id + '">' +
        '<div class="cc-inner" onclick="App.openDetail(\'' + c.id + '\')">' +
          '<div class="cc-row1">' +
            '<div>' +
              '<div class="cc-name">' + c.name + '</div>' +
              '<div class="cc-phone">' + maskPhone(c.phone) + '</div>' +
            '</div>' +
            '<span class="tag ' + getStatusTagClass(c.status) + '">' + getStatusLabel(c.status) + '</span>' +
          '</div>' +
          '<div class="cc-row2">' +
            '<div>' +
              '<div class="cc-amount-label">需求金额</div>' +
              '<div class="cc-amount">¥' + formatAmount(c.demandAmount) + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div class="cc-amount-label">信用分</div>' +
              '<div style="font-size:15px;font-weight:700;">' + c.creditScore + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cc-row3">' +
            '<span class="cc-followup ' + followUpClass + '">' + followUpText + '</span>' +
            '<span class="text-xs text-gray">' + c.industry + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="cc-actions">' +
          '<div class="cc-action-btn cc-action-call" onclick="App.callCustomer(\'' + c.id + '\')"><span class="act-icon">📞</span>拨号</div>' +
          '<div class="cc-action-btn cc-action-note" onclick="App.quickNote(\'' + c.id + '\')"><span class="act-icon">✏️</span>备注</div>' +
          '<div class="cc-action-btn cc-action-match" onclick="App.openMatchDrawer(\'' + c.id + '\')"><span class="act-icon">⚡</span>匹配</div>' +
        '</div>' +
      '</div>';
    });

    if (filtered.length > end) {
      html += '<div class="load-more" onclick="App.loadMoreCustomers()">上拉加载更多</div>';
    }

    list.innerHTML = html;

    // 绑定滑动
    list.querySelectorAll('.customer-card').forEach(function (card) {
      bindCardSwipe(card);
    });
  }

  function loadMoreCustomers() {
    state.customerPage++;
    renderCustomerList();
  }

  function goCustomerList(filter) {
    state.customerFilter = filter;
    state.customerPage = 0;
    switchTab('home');
    renderCustomerList();
  }

  // ===== 卡片滑动 =====
  function bindCardSwipe(card) {
    let startX = 0, startY = 0, currentX = 0, isSwiping = false, isHorizontal = false;
    const inner = card.querySelector('.cc-inner');

    card.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = true;
      isHorizontal = false;
      inner.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', function (e) {
      if (!isSwiping) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!isHorizontal) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) isHorizontal = true;
        else if (Math.abs(dy) > 5) { isSwiping = false; return; }
      }
      if (isHorizontal) {
        currentX = dx;
        // 左滑（dx<0）露出右侧按钮，最多滑出192px（3个按钮）
        const offsetX = Math.max(-192, Math.min(0, dx));
        inner.style.transform = 'translateX(' + offsetX + 'px)';
      }
    }, { passive: true });

    card.addEventListener('touchend', function () {
      if (!isSwiping) return;
      isSwiping = false;
      inner.style.transition = 'transform 0.3s';
      if (currentX < -60) {
        // 左滑，露出按钮
        inner.style.transform = 'translateX(-192px)';
      } else {
        // 回弹
        inner.style.transform = 'translateX(0)';
      }

      // 右滑触发匹配
      if (currentX > 80) {
        const cid = card.getAttribute('data-cid');
        inner.style.transform = 'translateX(0)';
        setTimeout(function () { openMatchDrawer(cid); }, 200);
      }
    }, { passive: true });
  }

  function callCustomer(cid) {
    const c = state.customers.find(function (x) { return x.id === cid; });
    if (c) {
      if (confirm('拨打 ' + c.phone + ' ?')) {
        alert('正在拨打：' + c.phone);
      }
    }
    // 收起卡片
    closeAllCardSwipes();
  }

  function quickNote(cid) {
    const c = state.customers.find(function (x) { return x.id === cid; });
    if (!c) return;
    const note = prompt('快速备注 - ' + c.name + '：', '');
    if (note && note.trim()) {
      c.followUps.unshift({ time: new Date().toISOString(), note: note.trim() });
      c.lastFollowUp = new Date().toISOString();
      c.status = c.status === 'new' ? 'following' : c.status;
      alert('备注已保存');
      renderCustomerList();
      renderKPI();
    }
    closeAllCardSwipes();
  }

  function closeAllCardSwipes() {
    document.querySelectorAll('.customer-card .cc-inner').forEach(function (el) {
      el.style.transition = 'transform 0.3s';
      el.style.transform = 'translateX(0)';
    });
  }

  // ===== 客户详情 =====
  function openDetail(cid) {
    const c = state.customers.find(function (x) { return x.id === cid; });
    if (!c) return;
    state.currentCustomerId = cid;
    $('detailName').textContent = c.name;

    const debtRatio = E.calcDebtRatio(c);
    let html = '';

    // 基本信息
    html += '<div class="detail-section"><div class="ds-title">基本信息</div>';
    html += detailField('姓名', c.name);
    html += detailField('手机号', maskPhone(c.phone));
    html += detailField('性别', c.gender);
    html += detailField('年龄', c.age + '岁');
    html += detailField('婚姻状况', c.marital);
    html += detailField('行业', c.industry);
    html += detailField('经营年限', c.years + '年');
    html += detailField('客户状态', '<span class="tag ' + getStatusTagClass(c.status) + '">' + getStatusLabel(c.status) + '</span>');
    html += '</div>';

    // 财务信息
    html += '<div class="detail-section"><div class="ds-title">财务信息</div>';
    html += detailField('月收入', '¥' + c.income.toLocaleString());
    html += detailField('工作单位', c.employer);
    html += detailField('资产情况', c.assets);
    html += detailField('负债总额', '¥' + formatAmount(c.liabilities));
    html += detailField('资产负债率', debtRatio + '%');
    html += detailField('需求金额', '¥' + formatAmount(c.demandAmount));
    html += '</div>';

    // 征信信息
    html += '<div class="detail-section"><div class="ds-title">征信信息</div>';
    html += detailField('信用评分', c.creditScore + '分');
    html += detailField('征信描述', c.creditDesc);
    html += detailField('抵押物', c.collateral ? c.collateralType + '（估值¥' + formatAmount(c.collateralValue) + '）' : '无');
    html += '</div>';

    // 标签
    if (c.tags && c.tags.length > 0) {
      html += '<div class="detail-section"><div class="ds-title">客户标签</div><div style="padding:12px 16px;">';
      c.tags.forEach(function (t) { html += '<span class="tag tag-following" style="margin-right:6px;">' + t + '</span>'; });
      html += '</div></div>';
    }

    // 匹配记录
    html += '<div class="detail-section"><div class="ds-title">匹配记录</div>';
    if (c.matchRecords.length === 0) {
      html += '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:13px;">暂无匹配记录</div>';
    } else {
      c.matchRecords.forEach(function (m) {
        html += '<div class="match-record"><div class="mr-time">' + formatDateTime(m.time) + '</div><div class="mr-banks">' + m.banks + '</div></div>';
      });
    }
    html += '</div>';

    $('detailBody').innerHTML = html;
    $('detailPage').classList.add('active');
  }

  function detailField(label, value) {
    return '<div class="detail-field"><div class="df-label">' + label + '</div><div class="df-value">' + value + '</div></div>';
  }

  function closeDetail() {
    $('detailPage').classList.remove('active');
  }

  // ===== 匹配抽屉 =====
  function openMatchDrawer(cid) {
    const c = state.customers.find(function (x) { return x.id === cid; });
    if (!c) return;
    state.currentMatchCustomerId = cid;
    const result = E.match(c);
    state.currentMatchResult = result;

    $('drawerName').textContent = c.name + ' - 匹配方案';

    let html = '';

    // 资质简评
    html += '<div class="summary-box"><div class="sb-title">客户资质简评</div><div class="sb-lines">';
    result.summary.forEach(function (s) { html += '<span class="sb-line">' + s + '</span>'; });
    html += '</div></div>';

    // 三档策略
    html += renderStrategyBlock(result.preferred, 'preferred', '🟢', '优先推荐', '条件最匹配');
    html += renderStrategyBlock(result.backup, 'backup', '🟡', '备选方案', '需补充材料');
    html += renderStrategyBlock(result.fallback, 'fallback', '🔴', '兜底方案', '消金/机构');

    $('drawerBody').innerHTML = html;
    $('matchOverlay').classList.add('active');
    $('matchDrawer').classList.add('active');
    closeAllCardSwipes();
  }

  function renderStrategyBlock(strategy, tier, icon, label, sub) {
    if (!strategy) return '';
    let html = '<div class="strategy-block strategy-' + tier + '">';
    html += '<div class="sb-header"><span class="sb-icon">' + icon + '</span><span class="sb-label">' + label + '</span><span class="sb-sub">' + sub + '</span></div>';
    html += '<div class="sb-info">';
    html += '<div class="sb-info-item"><div class="si-label">银行/产品</div><div class="si-value" style="font-size:14px;">' + strategy.bank + ' ' + strategy.product + '</div></div>';
    html += '</div>';
    html += '<div class="sb-info">';
    html += '<div class="sb-info-item"><div class="si-label">额度区间</div><div class="si-value">' + strategy.amountRange + '</div></div>';
    html += '<div class="sb-info-item"><div class="si-label">利率区间</div><div class="si-value">' + strategy.rateRange + '</div></div>';
    html += '</div>';
    html += '<div class="sb-info">';
    html += '<div class="sb-info-item"><div class="si-label">建议额度</div><div class="si-value" style="color:var(--brand);">¥' + formatAmount(strategy.suggestAmount) + '</div></div>';
    html += '<div class="sb-info-item"><div class="si-label">预估利率</div><div class="si-value" style="color:var(--brand);">' + strategy.suggestRate + '</div></div>';
    html += '<div class="sb-info-item"><div class="si-label">期限</div><div class="si-value" style="font-size:13px;">' + strategy.terms.map(function (t) { return t + '期'; }).join('/') + '</div></div>';
    html += '</div>';

    if (strategy.verifyKeyword) {
      html += '<div class="sb-note">🔑 ' + strategy.verifyKeyword + '</div>';
    }
    if (strategy.extraDocs && strategy.extraDocs.length > 0) {
      html += '<div class="sb-extra">📎 需补充：' + strategy.extraDocs.join(' / ') + '</div>';
    }
    if (strategy.features && strategy.features.length > 0) {
      html += '<div class="sb-features">';
      strategy.features.forEach(function (f) { html += '<span class="feat">' + f + '</span>'; });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function closeMatchDrawer() {
    $('matchOverlay').classList.remove('active');
    $('matchDrawer').classList.remove('active');
  }

  function copyStrategies() {
    if (!state.currentMatchResult) return;
    const c = state.customers.find(function (x) { return x.id === state.currentMatchCustomerId; });
    const text = E.strategiesToText(state.currentMatchResult, c ? c.name : '');
    navigator.clipboard.writeText(text).then(function () {
      alert('策略已复制到剪贴板');
    }).catch(function () {
      // 降级
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('策略已复制到剪贴板');
    });
  }

  function confirmStrategy() {
    if (!state.currentMatchCustomerId) return;
    const c = state.customers.find(function (x) { return x.id === state.currentMatchCustomerId; });
    if (!c) return;

    // 更新客户状态
    c.status = 'matched';
    c.lastFollowUp = new Date().toISOString();

    // 添加匹配记录
    const banks = [];
    if (state.currentMatchResult.preferred) banks.push(state.currentMatchResult.preferred.bank + state.currentMatchResult.preferred.product);
    if (state.currentMatchResult.backup) banks.push(state.currentMatchResult.backup.bank + state.currentMatchResult.backup.product);
    if (state.currentMatchResult.fallback) banks.push(state.currentMatchResult.fallback.bank + state.currentMatchResult.fallback.product);
    c.matchRecords.unshift({ time: new Date().toISOString(), banks: banks.join(' / ') });

    // 同步到对话历史
    const convTitle = '与' + c.name + '的匹配对话';
    state.conversations.unshift({
      id: 'CV' + Date.now(),
      title: convTitle,
      time: formatDateTime(new Date().toISOString()),
      customerName: c.name,
      strategyCount: banks.length,
      messages: [
        { role: 'user', text: '帮我为' + c.name + '匹配产品' },
        { role: 'assistant', text: '为您找到以下匹配方案：', strategies: buildStrategiesForChat(state.currentMatchResult) },
      ],
    });

    alert('方案已确认！客户状态已更新为"已匹配"，对话记录已同步到"我的助手"');
    closeMatchDrawer();
    renderCustomerList();
    renderKPI();
    renderQuickFilters();
  }

  function buildStrategiesForChat(result) {
    const arr = [];
    if (result.preferred) {
      arr.push({ tier: 'preferred', bank: result.preferred.bank, product: result.preferred.product, amountRange: result.preferred.amountRange, rateRange: result.preferred.rateRange, note: result.preferred.verifyKeyword });
    }
    if (result.backup) {
      arr.push({ tier: 'backup', bank: result.backup.bank, product: result.backup.product, amountRange: result.backup.amountRange, rateRange: result.backup.rateRange, note: result.backup.extraDocs.join('/') });
    }
    if (result.fallback) {
      arr.push({ tier: 'fallback', bank: result.fallback.bank, product: result.fallback.product, amountRange: result.fallback.amountRange, rateRange: result.fallback.rateRange, note: '' });
    }
    return arr;
  }

  // ===== 对话/助手 =====
  function initChat() {
    state.chatMessages = [];
    $('chatArea').innerHTML = '';
    // 欢迎语
    addAssistantMessage('你好！我是你的助贷助手。输入客户姓名或「/匹配 客户姓名」即可生成信贷匹配方案。', null);
    $('cmdHint').classList.remove('hidden');
  }

  function sendChatMessage() {
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // 添加用户消息
    addUserMessage(text);

    // 解析指令
    let customer = null;
    if (text.startsWith('/匹配') || text.startsWith('/match')) {
      const name = text.replace(/^\/(匹配|match)\s*/, '').trim();
      if (name) {
        customer = state.customers.find(function (c) { return c.name === name; });
      }
    } else {
      // 尝试匹配客户名
      customer = state.customers.find(function (c) { return text.includes(c.name); });
    }

    if (customer) {
      // 模拟延迟
      setTimeout(function () {
        const result = E.match(customer);
        const strategies = buildStrategiesForChat(result);
        addAssistantMessage('为您找到以下匹配方案：', strategies);
        state.currentMatchResult = result;
        state.currentMatchCustomerId = customer.id;
      }, 600);
    } else {
      // 尝试从文本解析客户信息
      const tempCustomer = parseCustomerFromText(text);
      if (tempCustomer) {
        setTimeout(function () {
          const result = E.match(tempCustomer);
          const strategies = buildStrategiesForChat(result);
          addAssistantMessage('根据您提供的信息，为您找到以下匹配方案：', strategies);
          state.currentMatchResult = result;
        }, 600);
      } else {
        setTimeout(function () {
          addAssistantMessage('未能识别客户信息。请输入客户姓名（如"张伟"）或使用「/匹配 客户姓名」格式。', null);
        }, 400);
      }
    }
  }

  function parseCustomerFromText(text) {
    // 简单解析：提取月收入数字
    const incomeMatch = text.match(/月入\s*(\d+万?)/);
    const creditMatch = text.match(/信用\s*(\d+)/);
    const nameMatch = text.match(/[\u4e00-\u9fa5]{2,4}/);

    if (!incomeMatch && !creditMatch) return null;

    const income = incomeMatch ? (incomeMatch[1].includes('万') ? parseInt(incomeMatch[1]) * 10000 : parseInt(incomeMatch[1])) : 10000;
    const credit = creditMatch ? parseInt(creditMatch[1]) : 650;

    return {
      id: 'temp',
      name: nameMatch ? nameMatch[0] : '临时客户',
      income: income,
      creditScore: credit,
      creditDesc: credit >= 700 ? '信用优秀' : credit >= 630 ? '信用良好' : '信用一般',
      liabilities: 0,
      collateral: false,
      collateralType: '',
      collateralValue: 0,
      demandAmount: income * 20,
      years: 2,
    };
  }

  function addUserMessage(text) {
    state.chatMessages.push({ role: 'user', text: text });
    const el = document.createElement('div');
    el.className = 'chat-bubble user';
    el.innerHTML = '<div class="cb-text">' + text + '</div>';
    $('chatArea').appendChild(el);
    scrollToBottom();
  }

  function addAssistantMessage(text, strategies) {
    state.chatMessages.push({ role: 'assistant', text: text, strategies: strategies });
    const el = document.createElement('div');
    el.className = 'chat-bubble assistant';
    let html = '<div class="cb-text">' + text + '</div>';
    if (strategies) {
      html += '<div class="chat-strategy">';
      strategies.forEach(function (s) {
        const cls = s.tier === 'preferred' ? 'cs-preferred' : s.tier === 'backup' ? 'cs-backup' : 'cs-fallback';
        const icon = s.tier === 'preferred' ? '🟢' : s.tier === 'backup' ? '🟡' : '🔴';
        html += '<div class="cs-block ' + cls + '">';
        html += '<div class="csb-name">' + icon + ' ' + s.bank + ' - ' + s.product + '</div>';
        html += '<div class="csb-info">额度：' + s.amountRange + ' | 利率：' + s.rateRange + '</div>';
        if (s.note) html += '<div class="csb-info" style="margin-top:2px;">' + (s.tier === 'backup' ? '📎 需补充：' : '🔑 ') + s.note + '</div>';
        html += '</div>';
      });
      html += '<div class="chat-disclaimer">以上建议仅供参考，请以银行实际审批为准。</div>';
      html += '</div>';
    }
    el.innerHTML = html;
    $('chatArea').appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    const area = $('chatArea');
    setTimeout(function () { area.scrollTop = area.scrollHeight; }, 50);
  }

  function voiceInput() {
    // H5 语音识别（部分浏览器支持）
    const input = $('chatInput');
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = 'zh-CN';
      recognition.interimResults = false;
      recognition.onresult = function (event) {
        input.value = event.results[0][0].transcript;
      };
      recognition.onerror = function () { alert('语音识别失败，请手动输入'); };
      recognition.start();
    } else {
      alert('当前浏览器不支持语音识别，请手动输入');
    }
  }

  function newConversation() {
    if (state.chatMessages.length > 0) {
      // 保存当前对话
      if (state.chatMessages.length > 1) {
        const lastUserMsg = state.chatMessages.find(function (m) { return m.role === 'user'; });
        const title = lastUserMsg ? '与' + (lastUserMsg.text.match(/[\u4e00-\u9fa5]{2,4}/) || ['客户'])[0] + '的对话' : '新对话';
        state.conversations.unshift({
          id: 'CV' + Date.now(),
          title: title,
          time: formatDateTime(new Date().toISOString()),
          customerName: '',
          strategyCount: state.chatMessages.filter(function (m) { return m.strategies; }).length,
          messages: state.chatMessages.slice(),
        });
      }
    }
    initChat();
  }

  function showHistory() {
    $('chatView').classList.add('hidden');
    $('historyView').classList.remove('hidden');
    renderHistoryList();
  }

  function backToChat() {
    $('historyView').classList.add('hidden');
    $('chatView').classList.remove('hidden');
  }

  function renderHistoryList() {
    const list = $('historyList');
    if (state.conversations.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="es-icon">💬</div><div class="es-text">暂无历史对话</div></div>';
      return;
    }
    let html = '';
    state.conversations.forEach(function (conv) {
      html += '<div class="history-item" onclick="App.viewHistory(\'' + conv.id + '\')">' +
        '<div class="hi-title">' + conv.title + '</div>' +
        '<div class="hi-meta">' +
          '<span class="hi-time">' + conv.time + '</span>' +
          '<span class="hi-count">' + conv.strategyCount + '条策略</span>' +
        '</div>' +
      '</div>';
    });
    list.innerHTML = html;
  }

  function viewHistory(convId) {
    const conv = state.conversations.find(function (c) { return c.id === convId; });
    if (!conv) return;
    // 切换到只读回放模式
    $('historyView').classList.add('hidden');
    $('chatView').classList.remove('hidden');
    $('chatArea').innerHTML = '';
    conv.messages.forEach(function (m) {
      if (m.role === 'user') {
        addUserMessage(m.text);
      } else {
        addAssistantMessage(m.text, m.strategies);
      }
    });
    // 禁用输入
    $('chatInput').disabled = true;
    $('chatInput').placeholder = '历史对话为只读模式';
    // 添加返回按钮提示
    const hint = document.createElement('div');
    hint.className = 'text-center';
    hint.style.padding = '12px';
    hint.innerHTML = '<button class="btn btn-outline btn-sm" onclick="App.backToCurrentChat()">返回当前对话</button>';
    $('chatArea').appendChild(hint);
    scrollToBottom();
  }

  function backToCurrentChat() {
    $('chatInput').disabled = false;
    $('chatInput').placeholder = '输入客户信息或 /匹配 客户姓名';
    initChat();
  }

  // ===== 个人中心 =====
  function renderProfile() {
    if (!state.currentUser) return;
    $('profileName').textContent = state.currentUser.name;
    $('profileDept').textContent = state.currentUser.department;

    // 简道云绑定状态
    const row = $('jdyStatusRow');
    if (state.currentUser.jiandaoyunBound) {
      row.innerHTML = '<span style="font-size:20px;">🟢</span><span class="jdy-status jdy-bound">已关联</span><span style="font-size:13px;color:var(--text-2);">' + state.currentUser.jiandaoyunAccount + '</span>';
    } else {
      row.innerHTML = '<span style="font-size:20px;">🔴</span><span class="jdy-status jdy-unbound">未关联</span>';
      row.innerHTML += '<div class="jdy-hint">请联系管理员在后台绑定您的简道云账号，否则无法查看客户数据</div>';
    }
  }

  function toggleNotif(checked) {
    // 模拟通知开关
  }

  // ===== 通知 =====
  function showNotifications() {
    const list = $('notifList');
    let html = '';
    D.NOTIFICATIONS.forEach(function (n) {
      html += '<div class="notif-item ' + (n.read ? '' : 'unread') + '">' +
        '<div class="ni-title">' + n.title + '</div>' +
        '<div class="ni-content">' + n.content + '</div>' +
        '<div class="ni-time">' + n.time + '</div>' +
      '</div>';
    });
    list.innerHTML = html;
    $('notifPage').classList.add('active');
    // 清除红点
    $('notifDot').style.display = 'none';
    D.NOTIFICATIONS.forEach(function (n) { n.read = true; });
  }

  function closeNotifications() {
    $('notifPage').classList.remove('active');
  }

  // ===== 跟进记录 =====
  function showFollowUp() {
    const c = state.customers.find(function (x) { return x.id === state.currentCustomerId; });
    if (!c) return;
    const timeline = $('followUpTimeline');
    if (c.followUps.length === 0) {
      timeline.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);">暂无跟进记录</div>';
    } else {
      let html = '';
      c.followUps.forEach(function (f) {
        html += '<div class="timeline-item"><div class="ti-time">' + formatDateTime(f.time) + '</div><div class="ti-note">' + f.note + '</div></div>';
      });
      timeline.innerHTML = html;
    }
    $('followUpPage').classList.add('active');
  }

  function closeFollowUp() {
    $('followUpPage').classList.remove('active');
  }

  function addFollowUp() {
    const c = state.customers.find(function (x) { return x.id === state.currentCustomerId; });
    if (!c) return;
    const note = prompt('新增跟进备注 - ' + c.name + '：', '');
    if (note && note.trim()) {
      c.followUps.unshift({ time: new Date().toISOString(), note: note.trim() });
      c.lastFollowUp = new Date().toISOString();
      if (c.status === 'new') c.status = 'following';
      showFollowUp(); // 刷新
      renderCustomerList();
      renderKPI();
    }
  }

  // ===== 初始化 =====
  function init() {
    checkAuth();
  }

  // 公开API
  return {
    init: init,
    doLogin: doLogin,
    sendVerifyCode: sendVerifyCode,
    logout: logout,
    switchTab: switchTab,
    goCustomerList: goCustomerList,
    loadMoreCustomers: loadMoreCustomers,
    openDetail: openDetail,
    closeDetail: closeDetail,
    openMatchDrawer: openMatchDrawer,
    closeMatchDrawer: closeMatchDrawer,
    copyStrategies: copyStrategies,
    confirmStrategy: confirmStrategy,
    callCustomer: callCustomer,
    quickNote: quickNote,
    sendChatMessage: sendChatMessage,
    voiceInput: voiceInput,
    newConversation: newConversation,
    showHistory: showHistory,
    backToChat: backToChat,
    viewHistory: viewHistory,
    backToCurrentChat: backToCurrentChat,
    showNotifications: showNotifications,
    closeNotifications: closeNotifications,
    showFollowUp: showFollowUp,
    closeFollowUp: closeFollowUp,
    addFollowUp: addFollowUp,
    toggleNotif: toggleNotif,
    get currentCustomerId() { return state.currentCustomerId; },
  };
})();

// 启动
App.init();
