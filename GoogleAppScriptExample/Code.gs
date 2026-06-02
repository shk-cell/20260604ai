// =============================================
// 부평중 급식 월드컵 - Google Apps Script
// =============================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('🍱 급식 월드컵')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Index.html에서 호출: getMealsFromClient(schoolUrl, startYear, startMonth, endYear, endMonth)
function getMealsFromClient(schoolUrl, startYear, startMonth, endYear, endMonth) {
  try {
    return _scrape(schoolUrl, startYear, startMonth, endYear, endMonth);
  } catch(e) {
    return { error: e.toString() };
  }
}

function _scrape(schoolUrl, startYear, startMonth, endYear, endMonth) {
  var allItems = {};

  // 기본 URL 추출 (foodlist.do 앞까지)
  var baseUrl = schoolUrl.replace(/\/foodlist\.do.*$/, '');
  var foodUrl = baseUrl + '/foodlist.do?m=0601&s=' + _extractSchoolId(schoolUrl);

  var months = [];
  var y = Number(startYear), m = Number(startMonth);
  var ey = Number(endYear), em = Number(endMonth);

  while (y < ey || (y === ey && m <= em)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  Logger.log('수집 대상: ' + months.length + '개월 / URL: ' + foodUrl);

  months.forEach(function(ym) {
    try {
      var url = foodUrl
        + '&year=' + ym.year
        + '&month=' + String(ym.month).padStart(2, '0');

      var res = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      if (res.getResponseCode() !== 200) {
        Logger.log(ym.year + '/' + ym.month + ' → HTTP ' + res.getResponseCode());
        return;
      }

      var html = res.getContentText('UTF-8');
      var items = _parseMenuHtml(html, ym.year, ym.month);

      items.forEach(function(item) {
        if (!allItems[item.name]) allItems[item.name] = item.date;
      });

      Logger.log(ym.year + '/' + ym.month + ' → ' + items.length + '개');
      Utilities.sleep(300);

    } catch(e) {
      Logger.log(ym.year + '/' + ym.month + ' 오류: ' + e.message);
    }
  });

  var meals = Object.keys(allItems).map(function(name) {
    return { name: name, date: allItems[name] };
  });

  Logger.log('최종 수집: ' + meals.length + '개 메뉴');
  return { meals: meals };
}

// URL에서 학교 ID 추출 (예: bp.icems.kr → bp)
function _extractSchoolId(url) {
  // s=bp 파라미터가 이미 있으면 그대로 사용
  var sMatch = url.match(/[?&]s=([^&]+)/);
  if (sMatch) return sMatch[1];
  // 없으면 서브도메인에서 추출
  var domainMatch = url.match(/^https?:\/\/([^.]+)\./);
  return domainMatch ? domainMatch[1] : 'bp';
}

function _parseMenuHtml(html, year, month) {
  var items = [];
  var monthStr = String(month).padStart(2, '0');
  var blockPattern = /judgeMentAction\('view',\s*(\d+)\);">\s*<ul>([\s\S]*?)<\/ul>/g;
  var match;

  while ((match = blockPattern.exec(html)) !== null) {
    var day = match[1];
    var menuBlock = match[2];
    var dateStr = year + '/' + monthStr + '/' + String(day).padStart(2, '0');

    var menuItems = menuBlock
      .split(/<br\s*\/?>/i)
      .map(function(s) {
        return s
          .replace(/<[^>]+>/g, '')
          .replace(/\s*\(\d+(?:\.\d+)*\)/g, '')
          .replace(/[YB]$/g, '')
          .trim();
      })
      .filter(function(s) { return s.length > 1; });

    menuItems.forEach(function(name) {
      if (name) items.push({ name: name, date: dateStr });
    });
  }
  return items;
}
