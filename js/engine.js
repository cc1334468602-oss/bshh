/**
 * engine.js - 三档策略匹配引擎
 * 输入客户信息 → 输出 优先推荐 / 备选方案 / 兜底方案 三档结构化策略
 */
window.MatchEngine = (function () {
  const D = window.MOCK_DATA;

  function calcDebtRatio(customer) {
    // 简化：负债 / (月收入 * 12) * 100
    return Math.round((customer.liabilities / (customer.income * 12)) * 100);
  }

  // 检查客户是否满足产品准入条件
  function checkEligibility(customer, product) {
    const reasons = [];
    if (customer.creditScore < product.req.minCredit)
      reasons.push('信用分' + customer.creditScore + '低于门槛' + product.req.minCredit);
    if (customer.income < product.req.minIncome)
      reasons.push('月收入' + customer.income + '低于要求' + product.req.minIncome);
    const debtRatio = calcDebtRatio(customer);
    if (debtRatio > product.req.maxDebtRatio)
      reasons.push('负债率' + debtRatio + '%超过上限' + product.req.maxDebtRatio + '%');
    if (product.req.collateral && !customer.collateral)
      reasons.push('该产品需要抵押物，客户无可用抵押物');
    if (customer.years < product.req.minYears)
      reasons.push('经营年限' + customer.years + '年低于要求' + product.req.minYears + '年');
    return { eligible: reasons.length === 0, reasons };
  }

  // 计算建议额度
  function suggestAmount(customer, product, tier) {
    const multiplier = D.MATCH_RULES.amountMultiplier[tier] || 15;
    const byIncome = customer.income * multiplier;
    const byDemand = customer.demandAmount;
    const byCollateral = customer.collateral ? customer.collateralValue * 0.6 : 0;
    let amount = Math.min(byIncome, byDemand, product.maxAmt);
    if (product.req.collateral) amount = Math.min(Math.max(amount, byCollateral * 0.5), product.maxAmt);
    amount = Math.max(amount, product.minAmt);
    return Math.round(amount / 10000) * 10000; // 取整到万
  }

  // 预估利率
  function estimateRate(customer, product) {
    // 信用分越高利率越低
    const creditBonus = Math.min((customer.creditScore - product.req.minCredit) / 100, 1);
    const rate = product.maxRate - (product.maxRate - product.minRate) * creditBonus * 0.7;
    return Math.round(Math.max(rate, product.minRate) * 10) / 10;
  }

  // 生成客户资质简评
  function generateSummary(customer) {
    const lines = [];
    // 收入评价
    if (customer.income >= 30000) lines.push('收入较高');
    else if (customer.income >= 15000) lines.push('收入稳定');
    else lines.push('收入一般');
    // 负债评价
    const dr = calcDebtRatio(customer);
    if (dr <= 30) lines.push('负债较低');
    else if (dr <= 55) lines.push('负债适中');
    else lines.push('负债偏高');
    // 征信评价
    if (customer.creditScore >= 700) lines.push('征信良好');
    else if (customer.creditScore >= 630) lines.push('征信正常');
    else lines.push('征信偏弱');
    return lines;
  }

  // 生成人工核实关键词
  function generateVerifyKeyword(bank, product) {
    const verbs = ['查', '确认', '核实'];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    return verb + ' ' + bank + ' ' + product + ' 是否支持线上/线下进件';
  }

  // 生成需补充材料提示
  function generateExtraDocs(customer, product) {
    const docs = [];
    if (product.req.collateral) docs.push('抵押物产权证明');
    if (customer.income < 20000) docs.push('近6个月银行流水');
    if (customer.years < 3) docs.push('营业执照副本');
    if (customer.creditScore < 650) docs.push('个人征信报告');
    return docs;
  }

  /**
   * 核心匹配函数
   * @param {object} customer - 客户对象
   * @returns {object} { summary, preferred, backup, fallback }
   */
  function match(customer) {
    if (!customer) return null;

    const summary = generateSummary(customer);
    const rules = D.MATCH_RULES;
    const allProducts = D.PRODUCTS;

    // 遍历所有产品，检查准入并分级
    const eligible = [];
    for (const p of allProducts) {
      const check = checkEligibility(customer, p);
      if (check.eligible) {
        eligible.push({ product: p, amount: suggestAmount(customer, p, 'preferred'), rate: estimateRate(customer, p) });
      }
    }

    // 分级
    let preferred = null;
    let backup = null;
    let fallback = null;

    // 优先推荐：国有大行 + 利率最低
    const preferredPool = eligible.filter(e =>
      rules.preferred.bankTypes.includes(e.product.bankType) &&
      e.product.maxRate <= rules.preferred.rateCeiling
    );
    if (preferredPool.length > 0) {
      preferredPool.sort((a, b) => a.rate - b.rate);
      const pick = preferredPool[0];
      preferred = {
        bank: pick.product.bank,
        product: pick.product.name,
        bankType: pick.product.bankType,
        productType: pick.product.type,
        amountRange: formatAmount(pick.product.minAmt) + '-' + formatAmount(pick.product.maxAmt),
        suggestAmount: pick.amount,
        rateRange: pick.product.minRate + '%-' + pick.product.maxRate + '%',
        suggestRate: pick.rate + '%',
        terms: pick.product.terms,
        verifyKeyword: generateVerifyKeyword(pick.product.bank, pick.product.name),
        extraDocs: [],
        features: pick.product.features,
      };
    }

    // 备选方案：股份制银行（需补充材料）
    const backupPool = eligible.filter(e =>
      rules.backup.bankTypes.includes(e.product.bankType) &&
      e.product.maxRate <= rules.backup.rateCeiling &&
      (!preferred || e.product.id !== preferred.product?.id)
    );
    if (backupPool.length > 0) {
      backupPool.sort((a, b) => a.rate - b.rate);
      const pick = backupPool[0];
      backup = {
        bank: pick.product.bank,
        product: pick.product.name,
        bankType: pick.product.bankType,
        productType: pick.product.type,
        amountRange: formatAmount(pick.product.minAmt) + '-' + formatAmount(pick.product.maxAmt),
        suggestAmount: pick.amount,
        rateRange: pick.product.minRate + '%-' + pick.product.maxRate + '%',
        suggestRate: pick.rate + '%',
        terms: pick.product.terms,
        verifyKeyword: generateVerifyKeyword(pick.product.bank, pick.product.name),
        extraDocs: generateExtraDocs(customer, pick.product),
        features: pick.product.features,
      };
    }

    // 兜底方案：消费金融
    const fallbackPool = eligible.filter(e =>
      rules.fallback.bankTypes.includes(e.product.bankType)
    );
    if (fallbackPool.length > 0) {
      fallbackPool.sort((a, b) => a.rate - b.rate);
      const pick = fallbackPool[0];
      fallback = {
        bank: pick.product.bank,
        product: pick.product.name,
        bankType: pick.product.bankType,
        productType: pick.product.type,
        amountRange: formatAmount(pick.product.minAmt) + '-' + formatAmount(pick.product.maxAmt),
        suggestAmount: pick.amount,
        rateRange: pick.product.minRate + '%-' + pick.product.maxRate + '%',
        suggestRate: pick.rate + '%',
        terms: pick.product.terms,
        verifyKeyword: '',
        extraDocs: [],
        features: pick.product.features,
      };
    }

    // 如果没有严格分级的，从eligible里补
    if (!preferred && eligible.length > 0) {
      const sorted = [...eligible].sort((a, b) => a.rate - b.rate);
      const pick = sorted[0];
      preferred = buildStrategy(pick, customer, '');
    }
    if (!backup && eligible.length > 1) {
      const sorted = [...eligible].sort((a, b) => a.rate - b.rate);
      const pick = sorted[1];
      backup = buildStrategy(pick, customer, generateExtraDocs(customer, pick.product).join('/'));
    }
    if (!fallback) {
      // 总能找到消费金融
      const cfProducts = allProducts.filter(p => p.bankType === '消费金融');
      if (cfProducts.length > 0) {
        const pick = cfProducts[0];
        fallback = {
          bank: pick.bank,
          product: pick.name,
          bankType: pick.bankType,
          productType: pick.type,
          amountRange: formatAmount(pick.minAmt) + '-' + formatAmount(pick.maxAmt),
          suggestAmount: suggestAmount(customer, pick, 'fallback'),
          rateRange: pick.minRate + '%-' + pick.maxRate + '%',
          suggestRate: pick.maxRate + '%',
          terms: pick.terms,
          verifyKeyword: '',
          extraDocs: [],
          features: pick.features,
        };
      }
    }

    return { summary, preferred, backup, fallback };
  }

  function buildStrategy(pick, customer, extraDocsStr) {
    return {
      bank: pick.product.bank,
      product: pick.product.name,
      bankType: pick.product.bankType,
      productType: pick.product.type,
      amountRange: formatAmount(pick.product.minAmt) + '-' + formatAmount(pick.product.maxAmt),
      suggestAmount: pick.amount,
      rateRange: pick.product.minRate + '%-' + pick.product.maxRate + '%',
      suggestRate: pick.rate + '%',
      terms: pick.product.terms,
      verifyKeyword: generateVerifyKeyword(pick.product.bank, pick.product.name),
      extraDocs: extraDocsStr ? extraDocsStr.split('/') : [],
      features: pick.product.features,
    };
  }

  function formatAmount(amt) {
    if (amt >= 10000) return (amt / 10000) + '万';
    return amt.toString();
  }

  // 将策略格式化为可复制文本
  function strategiesToText(result, customerName) {
    let text = '===== ' + (customerName || '客户') + ' 信贷匹配方案 =====\n';
    text += '资质简评：' + result.summary.join(' / ') + '\n\n';

    if (result.preferred) {
      const p = result.preferred;
      text += '【优先推荐】' + p.bank + ' - ' + p.product + '\n';
      text += '  额度：' + p.amountRange + '（建议' + formatAmount(p.suggestAmount) + '）\n';
      text += '  利率：' + p.rateRange + '（预估' + p.suggestRate + '）\n';
      text += '  期限：' + p.terms.map(t => t + '期').join('/') + '\n';
      if (p.verifyKeyword) text += '  核实：' + p.verifyKeyword + '\n';
      text += '\n';
    }
    if (result.backup) {
      const b = result.backup;
      text += '【备选方案】' + b.bank + ' - ' + b.product + '\n';
      text += '  额度：' + b.amountRange + '（建议' + formatAmount(b.suggestAmount) + '）\n';
      text += '  利率：' + b.rateRange + '（预估' + b.suggestRate + '）\n';
      text += '  期限：' + b.terms.map(t => t + '期').join('/') + '\n';
      if (b.extraDocs.length > 0) text += '  需补充：' + b.extraDocs.join('/') + '\n';
      if (b.verifyKeyword) text += '  核实：' + b.verifyKeyword + '\n';
      text += '\n';
    }
    if (result.fallback) {
      const f = result.fallback;
      text += '【兜底方案】' + f.bank + ' - ' + f.product + '\n';
      text += '  额度：' + f.amountRange + '（建议' + formatAmount(f.suggestAmount) + '）\n';
      text += '  利率：' + f.rateRange + '（预估' + f.suggestRate + '）\n';
      text += '  期限：' + f.terms.map(t => t + '期').join('/') + '\n';
      text += '\n';
    }
    text += '以上建议仅供参考，请以银行实际审批为准。';
    return text;
  }

  return { match, strategiesToText, calcDebtRatio };
})();
