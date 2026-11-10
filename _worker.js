/*
 * 域名监控系统 - Cloudflare Workers
 * 使用KV存储域名信息，支持Telegram通知
 * 功能：域名到期监控、自动通知、域名管理
 */

// ================================
// 配置常量区域
// ================================

// iconfont阿里巴巴图标库
const ICONFONT_CSS = '//at.alicdn.com/t/c/font_4973034_1qunj5fctpb.css';
const ICONFONT_JS = '//at.alicdn.com/t/c/font_4973034_1qunj5fctpb.js';

// 网站图标和背景图片
const DEFAULT_LOGO = 'https://cdn.jsdelivr.net/gh/kamanfaiz/CF-Domain-AutoCheck@main/img/logo.png'; // 默认logo，外置变量为LOGO_URL
const DEFAULT_BACKGROUND = 'https://cdn.jsdelivr.net/gh/kamanfaiz/CF-Domain-AutoCheck@main/img/background.png'; // 默认背景，外置变量为BACKGROUND_URL
const DEFAULT_MOBILE_BACKGROUND = 'https://cdn.jsdelivr.net/gh/kamanfaiz/CF-Domain-AutoCheck@main/img/mobile2.png'; // 默认移动端背景，外置变量为MOBILE_BACKGROUND_URL

// 登录密码设置
const DEFAULT_TOKEN = ''; // 默认密码，留空则使用'domain'，外置变量为TOKEN

// Telegram通知配置
const DEFAULT_TG_TOKEN = ''; // Telegram机器人Token，外置变量为TG_TOKEN
const DEFAULT_TG_ID = '';    // Telegram聊天ID，外置变量为TG_ID

// 网站标题配置
const DEFAULT_SITE_NAME = ''; // 默认网站标题，外置变量为SITE_NAME

// WhoisJSON API配置
const DEFAULT_WHOISJSON_API_KEY = ''; // WhoisJSON API密钥，外置变量为WHOISJSON_API_KEY

// ================================
// 工具函数区域
// ================================

// 格式化日期函数
function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// JSON响应工具函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// WhoisJSON API查询函数
async function queryDomainWhois(domain) {
  try {
    // 获取API密钥，优先使用环境变量，否则使用默认值
    const apiKey = typeof WHOISJSON_API_KEY !== 'undefined' ? WHOISJSON_API_KEY : DEFAULT_WHOISJSON_API_KEY;
    
    if (!apiKey) {
      throw new Error('WhoisJSON API密钥未配置');
    }

    // 调用WhoisJSON API
    const response = await fetch(`https://whoisjson.com/api/v1/whois?domain=${encodeURIComponent(domain)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Token=${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 解析并格式化返回数据
    return {
      success: true,
      domain: data.name || domain,
      registered: data.registered || false,
      registrationDate: data.created ? formatDate(data.created) : null,
      expiryDate: data.expires ? formatDate(data.expires) : null,
      lastUpdated: data.changed ? formatDate(data.changed) : null,
      registrar: data.registrar ? data.registrar.name : null,
      registrarUrl: data.registrar ? data.registrar.url : null,
      nameservers: data.nameserver || [],
      status: data.status || [],
      dnssec: data.dnssec || null,
      raw: data // 保留原始数据以备后用
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      domain: domain
    };
  }
}

// 检查KV是否已配置
function isKVConfigured() {
  return typeof DOMAIN_MONITOR !== 'undefined';
}

// ================================
// HTML模板区域
// ================================

// 登录页面模板
const getLoginHTML = (title, warningHtml = '') => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <!-- 添加网站图标(favicon) -->
    <link rel="icon" href="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" type="image/png">
    <link rel="shortcut icon" href="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" type="image/png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- 添加阿里巴巴iconfont图标库支持 -->
    <link rel="stylesheet" href="${ICONFONT_CSS}">
    <!-- 确保图标正确加载 -->
    <script src="${ICONFONT_JS}"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            background-image: url('${typeof BACKGROUND_URL !== 'undefined' ? BACKGROUND_URL : DEFAULT_BACKGROUND}');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }
        
        /* 登录界面移动端背景图片适配 */
        @media (max-width: 768px) {
            body {
                background-image: url('${typeof MOBILE_BACKGROUND_URL !== 'undefined' && MOBILE_BACKGROUND_URL ? MOBILE_BACKGROUND_URL : (DEFAULT_MOBILE_BACKGROUND ? DEFAULT_MOBILE_BACKGROUND : (typeof BACKGROUND_URL !== 'undefined' ? BACKGROUND_URL : DEFAULT_BACKGROUND))}');
                background-attachment: scroll;
                background-position: center;
            }
        }
        
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.4); /* 这里调整登录界面背景图的黑色蒙版不透明度 */
            z-index: 1;
        }
        
        .github-corner {
            position: fixed;
            top: 0;
            right: 0;
            width: 0;
            height: 0;
            border-style: solid;
            border-width: 0 100px 100px 0;
            border-color: transparent rgba(53, 83, 248, 0.9) transparent transparent;
            color: white;
            text-decoration: none;
            z-index: 1000;
            transition: all 0.3s ease;
            overflow: visible; /* 确保图标不会被裁剪 */
        }
        .github-corner:hover {
            border-color: transparent rgba(99, 122, 250, 0.8) transparent transparent;
        }
        .github-corner i {
            position: absolute;
            top: 18px;
            right: -82.5px;
            font-size: 40px;
            transform: rotate(45deg); /* 顺时针旋转45度 */
            line-height: 1;
            display: inline-block; /* 确保图标有确定的尺寸 */
            width: 40px; /* 设置宽度与字体大小相同 */
            height: 40px; /* 设置高度与字体大小相同 */
            text-align: center; /* 文本居中 */
        }
        .login-container {
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 16px;
            padding: 35px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.18);
            position: relative;
            z-index: 10;
        }
        .login-title {
            text-align: center;
            color: #ffffff;
            margin-bottom: 25px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center; /* 保持居中 */
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            margin-left: 0; /* 保留无左边距 */
            margin-right: auto;
            width: 100%;
            padding-left: 0; /* 完全移除左内边距 */
            margin-right: 8px; /* 添加右边距以平衡 */
        }
        .login-logo {
            height: 64px;
            width: 64px;
            margin-right: 0px; /* 控制logo和标题文字之间的间距 */
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
            vertical-align: middle;
        }
        .form-control {
            background-color: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 14px;
            height: auto;
            color: #fff;
            font-size: 1.05rem;
            border-radius: 10px;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            transition: all 0.3s ease;
        }
        .form-control::placeholder {
            color: rgba(255, 255, 255, 0.8);
        }
        .form-control:focus {
            background-color: rgba(255, 255, 255, 0.25);
            border-color: rgba(255, 255, 255, 0.5);
            box-shadow: 0 0 0 0.25rem rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        .btn-login {
            background-color: rgba(53, 83, 248, 0.9); // 登录按钮的颜色
            border: none;
            color: white;
            padding: 12px;
            width: 100%;
            font-weight: 500;
            font-size: 1.05rem;
            border-radius: 10px;
            margin-top: 10px;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            transition: all 0.3s ease;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }
        .btn-login:hover {
            background-color: rgba(99, 122, 250, 0.8);  // 登录按钮的悬停颜色
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(0, 0, 0, 0.3);
        }
        .error-message {
            color: #ffcccc;
            margin-top: 15px;
            text-align: center;
            display: none;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
    </style>
</head>
<body>
    ${warningHtml}
    <a href="https://github.com/kamanfaiz/CF-Domain-Autocheck" target="_blank" class="github-corner" title="GitHub Repository">
        <i class="iconfont icon-github1"></i>
    </a>
    <div class="login-container">
        <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
            <h2 class="login-title">
                <img src="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" alt="Logo" class="login-logo">
                <span>${title}</span>
            </h2>
            <form id="loginForm" style="width: 100%;">
                <div class="mb-3">
                    <input type="password" class="form-control" id="password" placeholder="请输入访问密码" required>
                </div>
                <button type="submit" class="btn btn-login"><i class="iconfont icon-mima" style="margin-right: 5px;"></i>登录</button>
                <div id="errorMessage" class="error-message">密码错误，请重试</div>
            </form>
        </div>
    </div>
    
    <script>
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const password = document.getElementById('password').value;
            
            // 使用POST请求验证密码
            fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: password })
            })
            .then(response => {
                if (response.ok) {
                    // 密码正确，跳转到dashboard页面
                    window.location.href = '/dashboard';
                } else {
                    // 密码错误，显示错误信息
                    document.getElementById('errorMessage').style.display = 'block';
                }
            })
            .catch(error => {
                document.getElementById('errorMessage').style.display = 'block';
            });
        });
    </script>
</body>
</html>
`;

// 主界面模板
const getHTMLContent = (title, warningHtml = '') => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <!-- 添加网站图标(favicon) -->
    <link rel="icon" href="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" type="image/png">
    <link rel="shortcut icon" href="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" type="image/png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- 添加阿里巴巴iconfont图标库支持 -->
    <link rel="stylesheet" href="${ICONFONT_CSS}">
    <!-- 确保图标正确加载 -->
    <script src="${ICONFONT_JS}"></script>
        <!-- 添加登出脚本 -->
    <script>
        // 添加登出功能
        function logout() {
            window.location.href = '/logout';
        }
    </script>
    <style>
        :root {
            --primary-color: #4e54c8;
            --secondary-color: #6c757d;
            --success-color:rgb(0, 255, 60);
            --danger-color:rgb(255, 0, 25);
            --warning-color:rgb(255, 230, 0);
            --info-color: #17a2b8;
            --light-color: #f8f9fa;
            --dark-color: #343a40;
            --domain-note-spacing: 2px; /* 域名和备注标签之间的间距 */
            --domain-line-height: 1.15; /* 域名换行后的行高 */
        }
        
        body {
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background-image: url('${typeof BACKGROUND_URL !== 'undefined' ? BACKGROUND_URL : DEFAULT_BACKGROUND}');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            padding-top: 20px;
            position: relative;
            min-height: 100vh;
        }
        
        /* 移动端背景图片优化 */
        @media (max-width: 768px) {
            body {
                background-attachment: scroll;
                background-size: cover;
                background-position: center top;
                min-height: 100vh;
                /* 移动端使用专门的背景图片，如果没有则回退到桌面端背景图片 */
                background-image: url('${typeof MOBILE_BACKGROUND_URL !== 'undefined' && MOBILE_BACKGROUND_URL ? MOBILE_BACKGROUND_URL : (DEFAULT_MOBILE_BACKGROUND ? DEFAULT_MOBILE_BACKGROUND : (typeof BACKGROUND_URL !== 'undefined' ? BACKGROUND_URL : DEFAULT_BACKGROUND))}');
            }
            
            /* 使用伪元素固定背景，避免缩放问题 */
            body::after {
                content: '';
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100vh;
                background-image: url('${typeof MOBILE_BACKGROUND_URL !== 'undefined' && MOBILE_BACKGROUND_URL ? MOBILE_BACKGROUND_URL : (DEFAULT_MOBILE_BACKGROUND ? DEFAULT_MOBILE_BACKGROUND : (typeof BACKGROUND_URL !== 'undefined' ? BACKGROUND_URL : DEFAULT_BACKGROUND))}');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                z-index: -2;
                pointer-events: none;
            }
        }
        
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.55); /* 这里调整登录后界面背景图的黑色蒙版不透明度 */
            z-index: -1;
        }
        
        .navbar {
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.18);
            margin-bottom: 24px;
            padding: 14px 20px;
            border-radius: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
            z-index: 2;
        }
        
        .navbar-brand {
            display: flex;
            align-items: center;
            font-weight: 600;
            color: #ffffff;
            font-size: 1.7rem;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            gap: 2px; /* 使用gap属性统一控制子元素之间的间距 */
        }
        
        .navbar-brand i {
            font-size: 1.8rem;
            color: white;
            margin: 0; /* 移除所有margin */
        }
        
        .logo-link {
            display: flex;
            align-items: center;
            margin-right: 0px;
            text-decoration: none;
        }
        
        .logo-img {
            height: 64px;
            width: 64px;
            object-fit: contain;
            transition: transform 0.3s ease;
        }
        
        .logo-img:hover {
            transform: scale(1.1);
            cursor: pointer;
            filter: brightness(1.2);
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        .logo-img.refreshing {
            animation: pulse 0.8s ease-in-out;
        }
        
        .navbar-actions {
            margin-left: auto;
            display: flex;
            align-items: center;
        }
        
        .btn-logout {
            margin-left: 10px;
            background-color: transparent;
            border: 1px solid #dc3545;
            color: #dc3545;
            padding: 5px 15px;
            border-radius: 5px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-logout:hover {
            background-color: #dc3545;
            color: white;
        }
        
        .container {
            max-width: 1200px;
            position: relative;
            z-index: 1;
        }
        
        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding: 12px 20px;
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            position: relative;
            z-index: 2;
        }
        
        .page-title {
            font-size: 1.3rem;
            font-weight: 600;
            color: #ffffff;
            margin: 0;
            display: flex;
            align-items: center;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .page-title i {
            margin-right: 8px;
            font-size: 1.2rem;
        }
        
        .btn-action-group {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 10px;
            margin-left: auto;
        }
        
        .btn-primary {
            background-color: var(--primary-color);
            border-color: var(--primary-color);
        }
        
        .btn-primary:hover {
            background-color: #3f44ae;
            border-color: #3f44ae;
        }
        
        .card {
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            margin-bottom: 8px; /* 进一步减小卡片间的垂直间距 */
            transition: all 0.3s;
            overflow: hidden !important; /* 确保内容不会溢出 */
            position: relative;
            z-index: 1; /* 设置卡片的基础z-index */
            width: 100%;
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
        }
        
        /* ===== 卡片头部样式 - 开始 ===== */
        /* 卡片头部容器 */
        .card-header {
            background-color: rgba(255, 255, 255, 0.1);
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            padding: 15px 0; /* 移除左右内边距，改为在各元素上单独控制 */
            padding-top: 12px;
            padding-bottom: 12px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            overflow: hidden; /* 防止内容溢出 */
            border-top-left-radius: 16px;
            border-top-right-radius: 16px;
            gap: 0; /* 移除间距，改为在各元素上单独控制 */
            min-height: 84px; /* 最小高度 */
            height: auto; /* 自动调整高度以适应内容 */
            max-height: 140px; /* 最大高度限制 */
            box-sizing: border-box; /* 确保padding不会增加元素高度 */
        }
        
        /* 状态指示圆点 */
        .status-dot {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 10px; /* 与域名文字的间距 */
            margin-left: 20px; /* 与卡片左边的间距 */
            vertical-align: middle;
            flex-shrink: 0;
        }
        
        .status-dot.expired {
            background-color: var(--danger-color);
            box-shadow: 0 0 5px var(--danger-color);
        }
        
        .status-dot.warning {
            background-color: var(--warning-color);
            box-shadow: 0 0 5px var(--warning-color);
        }
        
        .status-dot.safe {
            background-color: var(--success-color);
            box-shadow: 0 0 5px var(--success-color);
        }
        
        /* 域名标题区域 */
        .domain-header {
            display: flex;
            flex-direction: column;
            justify-content: center;
            flex: 1;
            min-width: 0; /* 解决flex子项目溢出问题 */
            max-width: calc(100% - 2px); /* 限制最大宽度，为右侧状态标签留出空间 */
            overflow: hidden; /* 确保内容不会溢出 */
            padding-left: 5px; /* 与小圆点的间距 */
            padding-right: 2px; /* 与右侧状态标签的间距 */
            transition: all 0.3s ease; /* 添加过渡效果 */
            min-height: 60px; /* 最小高度，可根据内容自动增加 */
            height: auto; /* 自动调整高度以适应内容 */
            max-height: 120px; /* 设置最大高度限制 */
        }
        
        .domain-header h5 {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis; /* 添加省略号 */
            color: #ffffff;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            font-size: 1.25rem; /* 设置域名字体大小 */
            font-weight: 600; /* 加粗字体 */
            transition: white-space 0.3s ease; /* 添加过渡效果 */
            margin: 0; /* 重置所有margin */
            line-height: 1.5;
        }
        
        /* 展开状态下的域名显示 */
        .domain-card.expanded .domain-header h5 {
            white-space: normal; /* 允许换行 */
            word-wrap: break-word; /* 确保长单词也能换行 */
            word-break: break-all; /* 在任何字符间换行 */
        }
        
        /* 域名容器样式 */
        .domain-name-container {
            display: flex;
            flex-direction: column;
        }
        
        /* 域名标题样式 */
        .domain-title {
            display: inline-block;
            margin-bottom: 0; /* 确保没有额外的底部边距 */
        }
        
        /* 备注标签样式 */
        .domain-header .domain-meta {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.2;
        }
        
        /* 展开状态下的域名显示 */
        .domain-card.expanded .domain-title {
            display: block; /* 确保域名可以正常换行 */
        }
        
        /* 域名文字样式 */
        .domain-text {
            display: inline;
        }
        
        /* 展开状态下域名文字样式 */
        .domain-card.expanded .domain-title .domain-text {
            display: inline-block;
            line-height: var(--domain-line-height); /* 控制行高，即行间距 */
        }
        
        /* 确保展开状态下域名文字能够正确换行 */
        .domain-card.expanded .domain-title {
            word-break: break-all;
            word-wrap: break-word;
        }
        
        /* 间隔元素样式 */
        .spacer {
            display: block;
            width: 100%;
            /* 高度由内联样式通过CSS变量控制 */
            flex-shrink: 0; /* 防止被压缩 */
        }
        
        /* 自定义备注样式 - 多种颜色标签风格 */
        .domain-meta .text-info, .domain-meta [class*="tag-"], .note-preview {
            background-color: #3B82F6; /* 默认蓝色 */
            color: white !important;
            font-weight: 500;
            padding: 3px 12px;
            border-radius: 16px;
            display: inline-block;
            font-size: 0.8rem;
            box-shadow: 0 1px 3px rgba(59, 130, 246, 0.3);
            letter-spacing: 0.2px;
        }
        
        /* 自定义备注颜色类 - 只修改颜色，保留原有样式 */
        .text-info.tag-blue { background-color: #3B82F6 !important; box-shadow: 0 1px 3px rgba(59, 130, 246, 0.3) !important; }
        .text-info.tag-green { background-color: #10B981 !important; box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3) !important; }
        .text-info.tag-red { background-color: #EF4444 !important; box-shadow: 0 1px 3px rgba(239, 68, 68, 0.3) !important; }
        .text-info.tag-yellow { background-color: #F59E0B !important; box-shadow: 0 1px 3px rgba(245, 158, 11, 0.3) !important; }
        .text-info.tag-purple { background-color: #8B5CF6 !important; box-shadow: 0 1px 3px rgba(139, 92, 246, 0.3) !important; }
        .text-info.tag-pink { background-color: #EC4899 !important; box-shadow: 0 1px 3px rgba(236, 72, 153, 0.3) !important; }
        .text-info.tag-indigo { background-color: #6366F1 !important; box-shadow: 0 1px 3px rgba(99, 102, 241, 0.3) !important; }
        .text-info.tag-gray { background-color: #6B7280 !important; box-shadow: 0 1px 3px rgba(107, 114, 128, 0.3) !important; }
        
        /* 分类容器样式 */
        .domain-group-container {
            margin-bottom: 4px; /* 分类之间的间距 */
        }
        
        /* 主容器底部间距统一 */
        .container {
            margin-bottom: 60px; /* 统一设置与页脚的间距 */
        }
        
        /* 空状态容器间距 - 桌面端 */
        .empty-state-container {
            margin-top: 2px !important; /* 与分类标题和卡片的间距保持一致 */
            margin-bottom: 0 !important; /* 确保空状态容器底部间距与其他状态一致 */
        }
        
        /* 确保分类标题与卡片左对齐 */
        .col-12.px-1-5 {
            padding-left: 0.375rem !important; /* 与卡片列相同的左内边距 */
        }
        
        /* 分类标题样式 */
        .category-header {
            padding: 8px 0; /* 移除左右内边距 */
            margin-bottom: 2px; /* 分类标题和卡片的间距 */
            margin-left: 10px; /* 增加左边距，使文字与卡片对齐 */
            display: block; /* 改为块级元素，确保宽度占满 */
            min-width: 120px;
        }
        
        .category-title {
            margin: 0;
            padding: 0;
            color: white;
            font-size: 1.3rem;
            font-weight: 600;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
        }

        /* 毛玻璃风格的统计徽章 */
        .count-badge {
            background: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            color: rgba(255, 255, 255, 0.9);
            padding: 0.25rem 0.5rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            margin-left: 0.5rem;
        }
        
        /* 状态区域 */
.domain-status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0; /* 防止被压缩 */
    min-width: 100px; /* 增加最小宽度，确保状态标签有足够空间 */
    padding-right: 20px; /* 下拉按钮与卡片右边的间距 */
    margin-left: 10px; /* 与域名区域的间距 */
}
        
        .domain-status .badge {
            margin-right: 10px; /* 与下拉箭头的间距 */
            white-space: nowrap; /* 确保标签文本不换行 */
            padding: 5px 10px;
            border-radius: 20px;
            font-weight: 500;
            color: white;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .badge .iconfont {
            margin-right: 3px;
            font-size: 0.9rem;
            vertical-align: middle;
            color: white;
        }
        
        /* 下拉按钮 */
        .toggle-details {
            padding: 0;
            margin-left: 0; /* 与状态标签的间距 */
            color: white;
            background: none;
            border: none;
            box-shadow: none;
            position: relative;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            text-decoration: none !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .toggle-details:hover {
            color: rgba(255, 255, 255, 0.8);
        }
        
        /* 图标容器 */
        .toggle-icon-container {
            position: relative;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden; /* 防止内容溢出 */
            line-height: 1;
        }
        
        /* 箭头图标 */
        .toggle-icon {
            font-size: 16px;
            transition: transform 0.3s ease;
            margin-right: 0 !important; /* 覆盖默认的margin-right */
            display: block;
            line-height: 1;
        }
        /* ===== 卡片头部样式 - 结束 ===== */
        
        .card-body .d-flex {
            margin-right: 0;
            padding-right: 0;
            overflow: visible !important;
        }
        
        /* 移除单独的百分比值样式，改为直接在SVG中使用text元素 */
        
        .card-header,
        .card-body {
            padding-left: 0; /* 移除左内边距 */
            padding-right: 0; /* 移除右内边距 */
            position: relative;
        }
        
        /* 卡片头部相关样式已移至上方统一管理区域 */
        
        /* 骨架屏样式 */
        .skeleton-card {
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            animation: skeleton-pulse 1.5s infinite ease-in-out;
        }
        
        .skeleton-header {
            background-color: rgba(255, 255, 255, 0.15);
            padding: 16px;
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
        }
        
        .skeleton-text-lg {
            height: 24px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            margin-bottom: 8px;
            width: 70%;
        }
        
        .skeleton-text-sm {
            height: 16px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            width: 50%;
        }
        
        .skeleton-text {
            height: 16px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            margin-bottom: 8px;
            width: 90%;
        }
        
        .skeleton-progress {
            height: 24px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            margin-top: 16px;
        }
        
        @keyframes skeleton-pulse {
            0% {
                opacity: 0.6;
            }
            50% {
                opacity: 0.8;
            }
            100% {
                opacity: 0.6;
            }
        }
        
        /* 自定义测试成功消息的颜色 */
        .telegram-test-success {
            color:rgb(19, 221, 144) !important; /* 紫色 */
            font-weight: 500;
        }
        
        /* 状态区域样式已移至上方统一管理区域 */
        
        .progress-circle-container {
            display: flex;
            justify-content: flex-end;
            align-items: flex-start; /* 改为顶部对齐，确保右上角固定 */
            padding-right: 10px;
            padding-top: 5px; /* 添加顶部间距保持位置 */
            box-sizing: border-box;
            overflow: visible;
            position: absolute;
            right: 0;
            top: 0; /* 改为顶部对齐 */
            transform: none; /* 移除垂直居中变换 */
            z-index: 10; /* 提高z-index值确保在文本上方 */
            min-width: 90px; /* 再次增加最小宽度适应更大的圆圈 */
        }
        
        .progress-circle {
            position: relative;
            width: 85px; /* 再次增加宽度 */
            height: 85px; /* 再次增加高度 */
            margin: 0;
            box-sizing: border-box;
            overflow: visible;
            z-index: 6; /* 降低z-index值 */
        }
        
        .progress-circle-bg {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 6px solid #f5f5f5;
            box-sizing: border-box;
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 7; /* 降低z-index值 */
        }
        
        .progress-circle-value {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 0.95rem;
            font-weight: bold;
        }
        
        .progress-ring {
            position: relative;
            transform: rotate(-90deg); /* 从12点钟方向开始 */
            z-index: 8; /* 降低z-index值 */
        }
        
        /* 添加样式使SVG中的文本不旋转 */
        .progress-ring text {
            transform: rotate(90deg); /* 抵消父元素的旋转 */
            fill: #ffffff; /* 改为白色 */
            font-size: 14px;
            font-weight: bold;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
            dominant-baseline: central;
            text-anchor: middle;
            paint-order: stroke;
            stroke: rgba(0, 0, 0, 0.3); /* 改为半透明黑色描边 */
            stroke-width: 1px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); /* 添加文字阴影 */
        }
        
        .progress-ring-circle {
            transition: stroke-dashoffset 0.35s;
            transform-origin: center;
            z-index: 9; /* 降低z-index值 */
        }
        
        /* 进度条百分比文字样式 */
        .progress-percent-text {
            font-size: 18px; /* 再次增加字体大小以适应更大的圆圈 */
            font-weight: bold;
            color: #ffffff;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .card-body {
            padding: 12px 15px;
            padding-left: 20px; /* 恢复卡片内容的左内边距 */
            padding-right: 20px; /* 恢复卡片内容的右内边距 */
            overflow: visible !important;
        }
        
        /* 折叠区域样式 */
        .collapse {
            margin: 0;
            padding: 0;
        }
        
        .domain-card {
            transition: all 0.3s;
        }
        
        .domain-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        
        /* 域名列样式 */
        .domain-column {
            display: flex;
            flex-direction: column;
        }
        
        /* 完全移除底部边框，仅在展开状态下显示 */
        .domain-card .card::after {
            content: none; /* 默认不显示任何内容 */
        }
        
        /* 展开状态下显示底部边框 */
        .domain-card.expanded .card {
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            border-bottom-left-radius: 16px;
            border-bottom-right-radius: 16px;
        }
        
        /* 域名列样式 */
        .domain-column {
            display: flex;
            flex-direction: column;
        }
        
        /* 状态指示圆点样式已移至上方统一管理区域 */
        
        /* 域名卡片容器样式 */
        .domain-card-container {
            margin-bottom: 12px; /* 统一设置卡片间距 */
            position: relative;
            border-radius: 16px; /* 确保容器也有圆角 */
            overflow: hidden; /* 防止内容溢出 */
        }
        
        /* Badge样式已移至上方统一管理区域 */
        
        /* 下拉按钮相关样式已移至上方统一管理区域 */
        
        /* 当展开时旋转箭头 */
        .toggle-details:not(.collapsed) .toggle-icon {
            transform: rotate(90deg);
        }
        
        /* 折叠内容样式 */
        .details-content {
            padding-top: 10px;
        }
        
        .domain-tag {
            display: inline-block;
            padding: 3px 8px;
            margin-left: 8px;
            border-radius: 20px;
            background-color: #f8f9fa;
            color: #666;
            font-size: 0.75rem;
            font-weight: normal;
            vertical-align: middle;
        }
        
        .domain-info {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 0.75rem;
        }
        
        .domain-actions {
            display: flex;
            gap: 5px;
            justify-content: flex-end;
        }
        
        .domain-actions .btn {
            padding: 5px 10px;
            font-size: 0.85rem;
        }
        
        .badge {
            padding: 5px 10px;
            border-radius: 20px;
            font-weight: 500;
        }
        
        .btn-action {
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .btn-action:hover {
            /* 移除浮动效果，只保留颜色变化 */
        }
        
        .btn-outline-primary {
            color: var(--primary-color);
            border-color: var(--primary-color);
        }
        
        .btn-outline-primary:hover {
            background-color: var(--primary-color);
            color: white;
        }
        
        .btn-outline-success {
            color: var(--success-color);
            border-color: var(--success-color);
        }
        
        .btn-outline-success:hover {
            background-color: var(--success-color);
            color: white;
        }
        
        .btn-outline-danger {
            color: var(--danger-color);
            border-color: var(--danger-color);
        }
        
        .btn-outline-danger:hover {
            background-color: var(--danger-color);
            color: white;
        }
        
        .btn-outline-info {
            color: var(--info-color);
            border-color: var(--info-color);
        }
        
        .btn-outline-info:hover {
            background-color: var(--info-color);
            color: white;
        }
        
        /* 视图按钮样式 */
        .view-option {
            color: rgb(223, 223, 223) !important; /* 未选状态使用灰色文字 */
            background-color: rgba(204, 204, 204, 0.8) !important; /* 未选状态的背景色 */
            border-color:rgba(109, 109, 109, 0.3) !important; /* 修改边框颜色 */
        }
        
        .view-option.btn-info {
            background-color:rgb(255, 255, 255) !important; /* 修改选中状态背景色为蓝色 */
            color: rgb(31, 34, 39) !important; /* 选中状态使用白色文字 */
        }
        
        .view-option .view-text {
            font-weight: 500;
        }
        
        /* 添加新域名按钮自定义样式 */
        .add-domain-btn {
            background-color:rgb(42, 175, 86) !important; /* 绿色 */
            border-color:rgba(33, 148, 72, 0.8) !important;
        }
        
        .add-domain-btn:hover {
            background-color:rgb(24, 216, 120) !important; /* 深绿色 */
            border-color:rgba(38, 190, 114, 0.8) !important;
        }

        /* 分类管理按钮样式，与添加域名按钮保持一致 */
        .category-manage-btn {
            background-color:rgb(42, 175, 86) !important; /* 绿色 */
            border-color:rgba(33, 148, 72, 0.8) !important;
        }

        .category-manage-btn:hover {
            background-color:rgb(24, 216, 120) !important; /* 深绿色 */
            border-color:rgba(38, 190, 114, 0.8) !important;
        }
        
        /* 排序按钮自定义样式 */
        .sort-btn {
            background-color: rgb(0, 123, 255) !important; /* 蓝色 */
            border-color: rgba(0, 111, 230, 0.8) !important;
        }
        
        .sort-btn:hover {
            background-color: rgb(0, 162, 255) !important; /* 蓝色 */
            border-color: rgba(23, 137, 202, 0.8) !important;
        }
        

        
        /* 排序选项的勾选图标样式 */
        .sort-check {
            visibility: hidden;
            margin-right: 5px;
            /* 使用与文字相同的颜色 */
            color: inherit;
        }
        
        .sort-option.active .sort-check {
            visibility: visible;
        }
        
        /* 排序选项选中状态样式 - 只显示勾符号，不使用背景色 */
        .sort-option.active {
            background-color: transparent !important;
            color: white !important;
        }
        
        /* 确保所有排序选项文字左对齐 */
        .dropdown-item {
            display: flex;
            align-items: center;
        }
        
        /* 添加iconfont图标的通用样式 */
        .iconfont {
            font-size: 1rem;
            vertical-align: middle;
            margin-right: 4px;
        }
        
        /* 按钮中的图标特殊样式 */
        .btn-action .iconfont {
            font-size: 0.9rem;
        }
        
        /* WHOIS查询按钮样式 */
        .whois-query-btn {
            color: white !important;
            background-color: #0d6efd !important;
            border-color: #0d6efd !important;
        }
        
        .whois-query-btn:hover {
            color: white !important;
            background-color: #0b5ed7 !important;
            border-color: #0a58ca !important;
        }
        
        .whois-query-btn:focus,
        .whois-query-btn:active {
            color: white !important;
            background-color: #0a58ca !important;
            border-color: #0a53be !important;
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25) !important;
        }
        
        .whois-query-btn:disabled {
            color: white !important;
            background-color: #6c757d !important;
            border-color: #6c757d !important;
        }
        
        /* 确保WHOIS查询按钮中的图标也是白色 */
        .whois-query-btn .iconfont {
            color: white !important;
        }
        
        .whois-query-btn:hover .iconfont,
        .whois-query-btn:focus .iconfont,
        .whois-query-btn:active .iconfont,
        .whois-query-btn:disabled .iconfont {
            color: white !important;
        }
        
        /* WHOIS清除按钮样式 */
        .whois-clear-btn {
            color: white !important;
            background-color: #dc3545 !important;
            border-color: #dc3545 !important;
        }
        
        .whois-clear-btn:hover {
            color: white !important;
            background-color: #c82333 !important;
            border-color: #bd2130 !important;
        }
        
        .whois-clear-btn:focus,
        .whois-clear-btn:active {
            color: white !important;
            background-color: #bd2130 !important;
            border-color: #b21f2d !important;
            box-shadow: 0 0 0 0.25rem rgba(220, 53, 69, 0.25) !important;
        }
        
        .whois-clear-btn:disabled {
            color: white !important;
            background-color: #dc3545 !important;
            border-color: #dc3545 !important;
            opacity: 0.65;
        }
        
        /* 确保WHOIS清除按钮中的图标也是白色 */
        .whois-clear-btn .iconfont {
            color: white !important;
        }
        
        .whois-clear-btn:hover .iconfont,
        .whois-clear-btn:focus .iconfont,
        .whois-clear-btn:active .iconfont,
        .whois-clear-btn:disabled .iconfont {
            color: white !important;
        }
        
        /* 表单和模态框中的图标统一样式 */
        .modal-body .iconfont {
            color: #555;
        }
        
        /* 大号图标样式 */
        .iconfont-lg {
            font-size: 1.5rem;
        }
        
        /* 不同颜色的图标 */
        .icon-primary { color: var(--primary-color); }
        .icon-success { color: var(--success-color); }
        .icon-danger { color: var(--danger-color); }
        .icon-warning { color: var(--warning-color); }
        .icon-info { color: var(--info-color); }
        
        .domain-actions {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            gap: 5px;
            margin-bottom: 8px;
        }
        
        .domain-actions .btn {
            flex-grow: 1;
            text-align: center;
            padding: 8px 0;
            border-radius: 6px;
            font-weight: 500;
            font-size: 0.85rem;
        }
        
        /* 纯图标按钮样式 - 用于替换文字按钮 */
        .btn-icon-only {
            width: 40px;
            height: 40px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            flex-grow: 1;
            max-width: 40px;
        }
        
        .btn-icon-only .iconfont {
            margin: 0;
            font-size: 1.2rem;
        }
        
        /* 纯图标链接样式 */
        .link-icon-only {
            width: 40px;
            height: 40px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            flex-grow: 1;
            max-width: 40px;
        }
        
        .link-icon-only .iconfont {
            margin: 0;
            font-size: 1.2rem;
        }
        
        /* 域名操作按钮行样式 */
        .domain-actions {
            display: flex;
            justify-content: space-between;
            gap: 3px;
            margin-top: 12px;
            margin-bottom: 8px;
            flex-wrap: nowrap;
            width: 100%;
        }
        
        .domain-actions .btn,
        .domain-actions a.btn {
            flex: 1;
            padding: 6px 2px;
            font-size: 0.7rem;
            white-space: nowrap;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            color: white;
            border: none;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
        }
        
        .domain-actions .btn:hover,
        .domain-actions a.btn:hover {
            /* 移除浮动效果，只保留颜色变化 */
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            color: white;
        }
        
        .domain-actions .iconfont {
            margin-right: 2px;
            font-size: 0.85rem;
            display: inline-block !important;
            vertical-align: middle;
            color: white;
        }
        
        /* 按钮颜色 */
        .btn-primary, .btn-outline-primary {
            background-color: rgba(47, 103, 167, 0.9);
            border-color: rgba(37, 86, 141, 0.3);
        }
        
        /* 在这里添加悬停样式 */
        .btn-primary:hover {
            background-color: rgba(0, 119, 255, 0.7);
            border-color: rgba(0, 119, 255, 0.3);
        }
        
        .btn-success, .btn-outline-success {
            background-color: rgba(40, 167, 69, 0.7);
            border-color: rgba(40, 167, 69, 0.3);
        }

        .btn-success:hover {
            background-color: rgba(69, 211, 102, 0.8);
            border-color: rgba(47, 196, 81, 0.3);
        }
        
        /* 自定义状态标签颜色 */
        .bg-success {
            background-color: rgba(42, 165, 93, 0.8) !important;
        }
        
        .btn-info, .btn-outline-info {
            background-color: rgba(23, 162, 184, 0.7);
            border-color: rgba(23, 162, 184, 0.3);
        }
        
        .btn-warning, .btn-outline-warning {
            background-color: rgba(255, 193, 7, 0.7);
            border-color: rgba(255, 193, 7, 0.3);
        }
        
        .btn-danger, .btn-outline-danger {
            background-color: rgba(220, 53, 69, 0.7);
            border-color: rgba(220, 53, 69, 0.3);
        }
        
        .btn-secondary, .btn-outline-secondary {
            background-color: rgba(108, 117, 125, 0.7);
            border-color: rgba(108, 117, 125, 0.3);
        }
        
        /* 续期链接样式已整合到按钮行中 */
        
        .test-notify-btn {
            width: 100%;
            border-radius: 6px;
            padding: 8px 0;
            font-weight: 500;
            font-size: 0.85rem;
            background-color: white;
            border: 1px solid #17a2b8;
            color: #17a2b8;
        }
        
        .test-notify-btn:hover {
            background-color: #17a2b8;
            color: white;
        }
        
        .card-text {
            margin-bottom: 6px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            padding-left: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .card-text strong {
            color: #ffffff;
            font-weight: 600;
            font-size: 0.85rem;
            margin-right: 4px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .card-text .iconfont {
            margin-right: 6px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.85rem;
            width: 16px;
            text-align: center;
            display: inline-flex;
            justify-content: center;
        }
        
        .modal-content {
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            background-color: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            overflow: hidden; /* 确保内部元素不会超出圆角边界 */
        }
        
        .modal-header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            background-color: rgba(255, 255, 255, 0.1);
            padding: 15px 20px;
            color: white;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            border-top-left-radius: 16px;
            border-top-right-radius: 16px;
        }
        
        .modal-footer {
            border-top: 1px solid rgba(255, 255, 255, 0.18);
            padding: 15px 20px;
            border-bottom-left-radius: 16px;
            border-bottom-right-radius: 16px;
            background-color: rgba(255, 255, 255, 0.05);
        }
        
        /* 确保下拉菜单显示在最上层 */
        .dropdown-menu {
            z-index: 1050 !important;
            background-color: rgba(60, 65, 70, 0.75) !important; /* 更浅的背景色 */
            backdrop-filter: blur(15px) !important;
            -webkit-backdrop-filter: blur(15px) !important;
            border: 1px solid rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35) !important;
            padding: 8px !important;
            border-radius: 10px !important;
        }
        
        .dropdown-item {
            font-size: 0.85rem;
            padding: 0.5rem 1rem;
            color: white !important;
            border-radius: 6px;
            margin-bottom: 2px;
            font-weight: 500;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .dropdown-item:hover {
            background-color: rgba(255, 255, 255, 0.25) !important;
            color: white !important;
        }
        
        .dropdown-divider {
            border-top: 1px solid rgba(255, 255, 255, 0.25) !important;
            margin: 6px 0;
        }
        
        /* 自定义间距类 */
        .px-1-5 {
            padding-left: 0.375rem !important;
            padding-right: 0.375rem !important;
        }
        
        .form-label {
            font-weight: 500;
            color: white;
            display: flex;
            align-items: center;
            gap: 5px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .form-label .iconfont,
        .modal-body h6 .iconfont,
        .modal-body .form-text .iconfont {
            color: rgba(255, 255, 255, 0.9);
            margin-right: 0;
            font-size: 0.95rem;
        }
        
        .modal-body {
            color: white;
        }
        
        .modal-body .form-text {
            color: rgba(255, 255, 255, 0.8);
        }
        
        .form-control {
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 10px 15px;
            background-color: rgba(255, 255, 255, 0.2);
            color: white;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }
        
        .form-control:focus {
            border-color: rgba(255, 255, 255, 0.5);
            box-shadow: 0 0 0 0.2rem rgba(255, 255, 255, 0.25);
            background-color: rgba(255, 255, 255, 0.25);
            color: white;
        }
        
        .form-control::placeholder {
            color: rgba(255, 255, 255, 0.7);
        }
        
        /* 自动填充高亮样式 */
        .form-control.auto-filled,
        .form-select.auto-filled {
            background-color: rgba(74, 222, 128, 0.15) !important;
            border-color: rgba(74, 222, 128, 0.6) !important;
            box-shadow: 0 0 0 0.2rem rgba(74, 222, 128, 0.25) !important;
            animation: autoFillGlow 2s ease-in-out;
        }
        
        @keyframes autoFillGlow {
            0% {
                background-color: rgba(74, 222, 128, 0.3);
                box-shadow: 0 0 0 0.3rem rgba(74, 222, 128, 0.4);
            }
            100% {
                background-color: rgba(74, 222, 128, 0.15);
                box-shadow: 0 0 0 0.2rem rgba(74, 222, 128, 0.25);
            }
        }
        
        .form-select {
            background-color: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            border-radius: 10px;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }
        
        .form-select:focus {
            border-color: rgba(255, 255, 255, 0.5);
            box-shadow: 0 0 0 0.2rem rgba(255, 255, 255, 0.25);
            background-color: rgba(255, 255, 255, 0.25);
        }
        
        /* 添加select下拉选项的样式 */
        .form-select option {
            background-color: #333;
            color: white;
            padding: 8px;
        }
        
        .alert {
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        
        @media (max-width: 768px) {
            .domain-card {
                flex-direction: column;
            }
            
            .domain-card .card-header {
                width: 100%;
                border-right: none;
                border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            }
            
            .domain-card .btn {
                padding: 0.2rem 0.3rem;
                font-size: 0.65rem;
            }
            
            .domain-actions {
                flex-wrap: nowrap;
                gap: 2px;
                margin-top: 8px;
                margin-bottom: 5px;
            }
            
            .domain-actions .btn,
            .domain-actions a.btn {
                padding: 3px 1px;
                font-size: 0.65rem;
            }
            
            .domain-actions .iconfont {
                margin-right: 1px;
                font-size: 0.75rem;
            }
            
            .page-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
            
            .btn-action-group {
                width: 100%;
                display: flex;
                justify-content: flex-end;
            }
            
            /* 移动端导航栏按钮只显示图标，隐藏文字 */
            .btn-action span {
                display: none !important;
            }
            
            /* 移动端WHOIS按钮只显示图标，但保持和输入框的整体性 */
            .whois-query-btn span,
            .whois-clear-btn span {
                display: none !important;
            }
            
            .whois-query-btn,
            .whois-clear-btn {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0.375rem 0.75rem !important;
                min-width: 44px !important;
            }
            
            .whois-query-btn .iconfont,
            .whois-clear-btn .iconfont {
                font-size: 1.1rem !important;
                line-height: 1 !important;
                margin: 0 !important;
            }
            
            .view-text {
                display: none !important;
            }
            
            /* 移动端空状态容器间距调整 - 只影响空状态提示框 */
            .empty-state-container {
                margin-top: 2px !important; /* 与分类标题和卡片的间距保持一致 */
                margin-bottom: 0 !important; /* 确保空状态容器底部间距与其他状态一致 */
            }
            
            /* 移动端空状态提示框内容居中优化 */
            .empty-state-container .py-3 {
                height: 140px !important;
                padding: 0.5rem !important;
            }
            
            /* 调整按钮间距和大小 */
            .btn-action {
                min-width: 40px;
                padding: 8px 10px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            /* 确保按钮内的图标居中 */
            .btn-action .iconfont {
                margin: 0 !important;
                line-height: 1;
            }
            

        }
    </style>
</head>
<body>
    ${warningHtml}
    <div class="container">
        <!-- 导航栏 -->
        <nav class="navbar">
            <span class="navbar-brand">
                            <a href="javascript:void(0);" class="logo-link" id="refreshLogo" title="点击刷新页面">
                <img src="${typeof LOGO_URL !== 'undefined' ? LOGO_URL : DEFAULT_LOGO}" alt="Logo" class="logo-img">
            </a>
                <i class="iconfont icon-domain iconfont-lg"></i>
                <span style="color: white; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">${title}</span>
            </span>
            <div class="navbar-actions">
                <button class="btn btn-secondary me-3" data-bs-toggle="modal" data-bs-target="#settingsModal">
                    <i class="iconfont icon-gear" style="color: white;"></i> <span style="color: white;">系统设置</span>
                </button>
                <button class="btn btn-danger" onclick="logout()">
                    <i class="iconfont icon-sign-out-alt" style="color: white;"></i> <span style="color: white;">退出</span>
                </button>
            </div>
        </nav>
        
        <!-- 页面标题和操作按钮 -->
        <div class="page-header">
            <h1 class="page-title"><i class="iconfont icon-list-ul"></i> 域名列表 <span class="count-badge" id="totalDomainCount">(0)</span></h1>
            <div class="btn-action-group">
                                  <div class="btn-group me-2">
                      <button class="btn btn-outline-info btn-action view-option" data-view="collapse-all" type="button" style="transition: background-color 0.2s, color 0.2s;">
                         <i class="iconfont icon-quanjusuoxiao"></i> <span class="view-text">折叠</span>
                      </button>
                      <button class="btn btn-outline-info btn-action view-option" data-view="expand-all" type="button" style="transition: background-color 0.2s, color 0.2s;">
                         <i class="iconfont icon-quanjufangda"></i> <span class="view-text">展开</span>
                      </button>
                  </div>
                <button class="btn btn-success btn-action category-manage-btn" data-bs-toggle="modal" data-bs-target="#categoryManageModal">
                    <i class="iconfont icon-fenlei" style="color: white;"></i> <span style="color: white;">分类管理</span>
                </button>
                <button class="btn btn-success btn-action add-domain-btn" data-bs-toggle="modal" data-bs-target="#addDomainModal">
                    <i class="iconfont icon-jia" style="color: white;"></i> <span style="color: white;">添加域名</span>
                </button>
                <div class="dropdown">
                    <button class="btn btn-danger btn-action sort-btn" type="button" id="sortDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="iconfont icon-paixu" style="color: white;"></i> <span style="color: white;">域名排序</span>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="sortDropdown">
                        <li><a class="dropdown-item sort-option" data-sort="suffix" data-order="asc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按域名后缀升序</a></li>
                        <li><a class="dropdown-item sort-option" data-sort="suffix" data-order="desc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按域名后缀降序</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item sort-option" data-sort="name" data-order="asc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按域名升序</a></li>
                        <li><a class="dropdown-item sort-option" data-sort="name" data-order="desc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按域名降序</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item sort-option" data-sort="daysLeft" data-order="asc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按剩余天数升序</a></li>
                        <li><a class="dropdown-item sort-option" data-sort="daysLeft" data-order="desc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按剩余天数降序</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item sort-option" data-sort="customNote" data-order="asc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按备注升序</a></li>
                        <li><a class="dropdown-item sort-option" data-sort="customNote" data-order="desc" href="#"><i class="iconfont icon-gou1 sort-check"></i> 按备注降序</a></li>
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="row g-1" id="domainListContainer">
            <!-- 域名卡片将通过JavaScript动态生成 -->
            <div class="col-md-6 col-lg-4 domain-column px-1-5" id="column-1"></div>
            <div class="col-md-6 col-lg-4 domain-column px-1-5" id="column-2"></div>
            <div class="col-md-6 col-lg-4 domain-column px-1-5" id="column-3"></div>
        </div>
    </div>
    
    <!-- 添加域名模态框 -->
    <div class="modal fade" id="addDomainModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">添加新域名</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="addDomainForm">
                        <input type="hidden" id="domainId" value="">
                        <div class="mb-3">
                            <label for="domainName" class="form-label"><i class="iconfont icon-earth-full"></i> 域名 <span style="color: red;">*</span></label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="domainName" placeholder="请输入域名，如example.com" required>
                                <button class="btn btn-outline-primary whois-query-btn" type="button" id="whoisQueryBtn">
                                    <i class="iconfont icon-magnifying-glass"></i><span> 查询</span>
                                </button>
                                <button class="btn btn-outline-danger whois-clear-btn" type="button" id="whoisClearBtn" title="清除自动填充的信息">
                                    <i class="iconfont icon-qingchu"></i><span> 清除</span>
                                </button>
                            </div>
                            <div class="form-text">输入域名后点击"查询"可自动填充注册信息</div>
                            <div id="whoisQueryStatus" class="mt-2" style="display: none;"></div>
                        </div>
                        <div class="mb-3">
                            <label for="registrar" class="form-label"><i class="iconfont icon-house-chimney"></i> 注册厂商</label>
                            <input type="text" class="form-control" id="registrar" placeholder="请输入注册厂商名称，如阿里云、腾讯云等">
                        </div>
                        <div class="mb-3">
                            <label for="domainCategory" class="form-label"><i class="iconfont icon-fenlei"></i> 分类</label>
                            <select class="form-select" id="domainCategory">
                                <option value="">选择分类</option>
                                <!-- 分类选项将通过JavaScript动态生成 -->
                            </select>
                            <small class="form-text">不选择将放入默认分类</small>
                        </div>
                        <!-- 添加自定义备注字段 -->
                        <div class="mb-3">
                            <label for="customNote" class="form-label"><i class="iconfont icon-tags"></i> 自定义备注</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="customNote" placeholder="添加备注信息">
                                <select class="form-select" id="noteColor" style="max-width: 120px;">
                                    <option value="tag-blue" selected>蓝色</option>
                                    <option value="tag-green">绿色</option>
                                    <option value="tag-red">红色</option>
                                    <option value="tag-yellow">黄色</option>
                                    <option value="tag-purple">紫色</option>
                                    <option value="tag-pink">粉色</option>
                                    <option value="tag-indigo">靛蓝</option>
                                    <option value="tag-gray">灰色</option>
                                </select>
                            </div>
                            <div class="form-text d-flex align-items-center justify-content-between">
                                <span>将显示在卡片头部域名下方（可选）</span>
                                <div id="notePreview" style="display: none;" class="text-info note-preview">预览</div>
                            </div>
                        </div>
                        <div class="mb-3">
                            <label for="registrationDate" class="form-label"><i class="iconfont icon-calendar-days"></i> 注册时间 <span style="color: red;">*</span></label>
                            <input type="date" class="form-control" id="registrationDate" required>
                            <div class="form-text">域名首次注册的时间</div>
                        </div>
                        
                        <!-- 续期周期设置 -->
                        <div class="mb-3">
                            <label for="renewCycle" class="form-label"><i class="iconfont icon-repeat"></i> 续期周期 <span style="color: red;">*</span></label>
                            <div class="input-group">
                                <input type="number" class="form-control" id="renewCycleValue" value="1" min="1" max="100">
                                <select class="form-select" id="renewCycleUnit">
                                    <option value="year" selected>年</option>
                                    <option value="month">月</option>
                                    <option value="day">日</option>
                                </select>
                            </div>
                            <div class="form-text">域名的常规续期周期，用于计算进度条和到期日期</div>
                        </div>
                        
                        <div class="mb-3">
                            <label for="expiryDate" class="form-label"><i class="iconfont icon-calendar-days"></i> 到期日期 <span style="color: red;">*</span></label>
                            <input type="date" class="form-control" id="expiryDate" required>
                            <div class="form-text text-info">根据注册时间和续期周期自动计算，可手动调整</div>
                        </div>
                        
                        <!-- 价格设置 -->
                        <div class="mb-3">
                            <label for="price" class="form-label"><i class="iconfont icon-licai"></i> 价格</label>
                            <div class="input-group">
                                <select class="form-select" id="priceCurrency" style="max-width: 80px;">
                                    <option value="¥" selected>¥</option>
                                    <option value="$">$</option>
                                    <option value="€">€</option>
                                    <option value="£">£</option>
                                    <option value="₽">₽</option>
                                </select>
                                <input type="number" class="form-control" id="priceValue" value="" min="0" step="0.01" placeholder="输入价格">
                                <select class="form-select" id="priceUnit" style="max-width: 110px;">
                                    <option value="year" selected>年</option>
                                    <option value="month">月</option>
                                    <option value="day">日</option>
                                </select>
                            </div>
                            <div class="form-text">域名的价格，支持多国货币</div>
                        </div>
                        
                        <!-- 添加续费链接字段 -->
                        <div class="mb-3">
                            <label for="renewLink" class="form-label"><i class="iconfont icon-link"></i> 续费链接</label>
                            <input type="url" class="form-control" id="renewLink" placeholder="https://example.com/renew">
                            <div class="form-text">域名续费的直达链接</div>
                        </div>
                        
                        <!-- 上次续期时间设置 -->
                        <div class="mb-3" id="lastRenewedContainer" style="display: none;">
                            <div class="d-flex align-items-center">
                                <label class="form-label mb-0 me-3">上次续期时间:</label>
                                <span id="lastRenewedDisplay" class="text-white me-2"></span>
                                <button type="button" class="btn btn-sm btn-danger" id="clearLastRenewed"><span style="color: white;">清除</span></button>
                            </div>
                            <input type="hidden" id="lastRenewed" value="">
                            <div class="form-text">清除后将不再显示上次续期信息，请慎重操作！！</div>
                        </div>
                        
                        <!-- 通知设置 -->
                        <hr>
                        <h6 class="mb-3" style="display: flex; align-items: center; gap: 5px;"><i class="iconfont icon-paper-plane" style="color: white;"></i> 通知设置</h6>
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="useGlobalSettings" checked>
                            <label class="form-check-label" for="useGlobalSettings">使用全局通知设置</label>
                        </div>
                        <div id="domainNotifySettings" style="display: none;">
                            <div class="mb-3 form-check">
                                <input type="checkbox" class="form-check-input" id="notifyEnabled" checked>
                                <label class="form-check-label" for="notifyEnabled">启用到期通知</label>
                            </div>
                            <div class="mb-3">
                                <label for="domainNotifyDays" class="form-label"><i class="iconfont icon-lingdang"></i> 提前通知天数</label>
                                <input type="number" class="form-control" id="domainNotifyDays" min="1" max="90" value="30">
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-warning me-auto" id="testExpiredNotifyBtn" style="display: none;"><span style="color: white;"><i class="iconfont icon-paper-plane"></i> 过期通知测试</span></button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><span style="color: white;"><i class="iconfont icon-xmark"></i> 取消</span></button>
                                <button type="button" class="btn btn-primary" id="saveDomainBtn"><span style="color: white;"><i class="iconfont icon-save-3-fill"></i> 保存</span></button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 分类管理模态框 -->
    <div class="modal fade" id="categoryManageModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">分类管理</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="categoryForm">

                        <div class="mb-3">
                            <label for="categoryName" class="form-label"><i class="iconfont icon-shapes"></i> 分类名称 <span style="color: red;">*</span></label>
                            <input type="text" class="form-control" id="categoryName" placeholder="例如: 生产环境" maxlength="50" required>
                        </div>
                        <div class="mb-3">
                            <label for="categoryDescription" class="form-label"><i class="iconfont icon-bianji"></i> 描述</label>
                            <input type="text" class="form-control" id="categoryDescription" placeholder="分类描述" maxlength="100">
                        </div>
                        <div class="mb-3">
                            <button type="button" class="btn btn-primary" id="addCategoryBtn">
                                <i class="iconfont icon-jia" style="color: white;"></i> <span style="color: white;">添加分类</span>
                            </button>
                        </div>
                        
                        <hr class="my-4">
                        
                        <h6 class="mb-3" style="display: flex; align-items: center; gap: 5px;"><i class="iconfont icon-list-ul" style="color: white;"></i> 现有分类</h6>
                        <div id="categoryList">
                            <!-- 分类列表将通过JavaScript动态生成 -->
                            <div class="text-center p-3 text-muted">
                                <i class="iconfont icon-loading"></i> 加载中...
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><span style="color: white;"><i class="iconfont icon-xmark"></i> 关闭</span></button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 设置模态框 -->
    <div class="modal fade" id="settingsModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">系统设置</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="settingsForm">
                        <h6 class="mb-3" style="display: flex; align-items: center; gap: 5px;"><i class="iconfont icon-telegram" style="color: white;"></i> Telegram通知设置</h6>
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="telegramEnabled">
                            <label class="form-check-label" for="telegramEnabled">启用Telegram通知</label>
                        </div>
                        <div id="telegramSettings" style="display: none;">
                            <div class="mb-3">
                                <label for="telegramToken" class="form-label"><i class="iconfont icon-key"></i> 机器人Token</label>
                                <input type="text" class="form-control" id="telegramToken" placeholder="如已在环境变量中配置则可留空">
                                <div class="form-text">在Telegram中找到@BotFather创建机器人并获取Token</div>
                            </div>
                            <div class="mb-3">
                                <label for="telegramChatId" class="form-label"><i class="iconfont icon-robot-2-fill"></i> 聊天ID</label>
                                <input type="text" class="form-control" id="telegramChatId" placeholder="如已在环境变量中配置则可留空">
                                <div class="form-text">可以使用@userinfobot获取个人ID，或将机器人添加到群组后获取群组ID</div>
                            </div>
                            <div class="mb-3">
                                <label for="notifyDays" class="form-label"><i class="iconfont icon-lingdang"></i> 提前通知天数</label>
                                <input type="number" class="form-control" id="notifyDays" min="1" max="90" value="30">
                                <div class="form-text">域名到期前多少天开始发送通知</div>
                            </div>
                            <div class="mb-3">
                                <button type="button" class="btn btn-info" id="testTelegramBtn"><i class="iconfont icon-paper-plane" style="color: white;"></i> <span style="color: white;">测试Telegram通知</span></button>
                                <span id="testResult" class="ms-2"></span>
                            </div>
                        </div>
                        <hr>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="form-text m-0">通知发送结果会写入日志，失败原因可在日志中查看</span>
                            <a href="/logs" target="_blank" rel="noopener" class="btn btn-sm btn-outline-light"><span style="color: white;">查看通知日志</span></a>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><span style="color: white;"><i class="iconfont icon-xmark"></i> 取消</span></button>
                                <button type="button" class="btn btn-primary" id="saveSettingsBtn"><span style="color: white;"><i class="iconfont icon-save-3-fill"></i> 保存设置</span></button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 确认删除模态框 -->
    <div class="modal fade" id="deleteDomainModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">确认删除</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>确定要删除域名 <span id="deleteModalDomainName"></span> 吗？此操作不可撤销。</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><span style="color: white;"><i class="iconfont icon-xmark"></i> 取消</span></button>
                    <button type="button" class="btn btn-danger" id="confirmDeleteBtn"><span style="color: white;"><i class="iconfont icon-shanchu"></i> 删除</span></button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 续期模态框 -->
    <div class="modal fade" id="renewDomainModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">域名续期</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>为域名 <span id="renewModalDomainName"></span> 续期</p>
                    <div class="mb-3">
                        <label for="renewPeriod" class="form-label"><i class="iconfont icon-repeat"></i> 续期周期</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="renewPeriodValue" min="1" max="100" value="1">
                            <select class="form-select" id="renewPeriodUnit">
                                <option value="year" selected>年</option>
                                <option value="month">月</option>
                                <option value="day">日</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="newExpiryDate" class="form-label"><i class="iconfont icon-calendar-days"></i> 新到期日期</label>
                        <input type="date" class="form-control" id="newExpiryDate" readonly>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="iconfont icon-xmark"></i> 取消</button>
                    <button type="button" class="btn btn-success" id="confirmRenewBtn"><i class="iconfont icon-arrows-rotate"></i> 确认续期</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 确认删除分类模态框 -->
    <div class="modal fade" id="deleteCategoryModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">删除分类</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>确定要删除分类 <strong id="deleteCategoryModalName"></strong> 吗？</p>
                    <p class="text-warning">该分类下的域名将自动移动到默认分类中。此操作不可撤销。</p>
                    
                    <div class="form-check mt-3">
                        <input class="form-check-input" type="checkbox" id="confirmDeleteCheckbox">
                        <label class="form-check-label" for="confirmDeleteCheckbox">
                            我确认要删除此分类
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><span style="color: white;"><i class="iconfont icon-xmark"></i> 取消</span></button>
                    <button type="button" class="btn btn-danger" id="confirmDeleteCategoryBtn" disabled><span style="color: white;"><i class="iconfont icon-shanchu"></i> 删除</span></button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <!-- 已在头部引入iconfont图标库，此处无需重复引入 -->
    <script>
        // 全局变量
        let domains = [];
        let currentDomainId = null;
        let currentCategoryId = null;
        let telegramConfig = {};
        let currentSortField = 'suffix'; // 默认排序字段改为域名后缀
        let currentSortOrder = 'asc'; // 默认排序顺序
        let viewMode = 'auto-collapse'; // 默认查看模式：auto-collapse (自动折叠), expand-all (全部展开), collapse-all (全部折叠)
        
        // 将天数转换为年月日格式
        function formatDaysToYMD(days) {
          if (days <= 0) return '';
          
          const years = Math.floor(days / 365);
          const remainingDaysAfterYears = days % 365;
          const months = Math.floor(remainingDaysAfterYears / 30);
          const remainingDays = remainingDaysAfterYears % 30;
          
          let result = '';
          
          if (years > 0) {
            result += years + '年';
          }
          
          if (months > 0) {
            result += months + '个月';
          }
          
          if (remainingDays > 0) {
            result += remainingDays + '天';
          }
          
          return result;
        }
        
        // 格式化日期函数
        function formatDate(dateString) {
            const date = new Date(dateString);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return year + '-' + month + '-' + day;
        }
        
        // 页面加载完成后执行
        document.addEventListener('DOMContentLoaded', () => {
            // 设置事件监听器
            setupEventListeners();
            
            // 确保DOM元素已完全加载
            setTimeout(() => {
                // 使用Promise.all并行加载数据
                Promise.all([loadDomains(), loadCategories(), loadTelegramConfig()])
                    .catch(error => showAlert('danger', '数据加载失败: ' + error.message));
            }, 300);
            
            // 设置初始视图模式为全部折叠
            setTimeout(() => {
                const collapseAllButton = document.querySelector('.view-option[data-view="collapse-all"]');
                if (collapseAllButton) {
                    collapseAllButton.classList.remove('btn-outline-info');
                    collapseAllButton.classList.add('btn-info');
                }
            }, 500); // 延迟执行确保DOM已经加载完成
        });
        
        // 全局变量用于存储当前查询的控制器
        let currentWhoisController = null;
        
        // 设置事件监听器
        function setupEventListeners() {
            // Logo点击刷新页面
            document.getElementById('refreshLogo').addEventListener('click', function() {
                // 添加刷新动画效果
                const logoImg = this.querySelector('.logo-img');
                logoImg.classList.add('refreshing');
                
                // 延迟刷新页面，让用户看到动画效果
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            });
            
            // 保存域名按钮
            document.getElementById('saveDomainBtn').addEventListener('click', saveDomain);

            // 编辑页的过期通知测试按钮：强制按“已过期”模板发送一条测试消息
            document.getElementById('testExpiredNotifyBtn').addEventListener('click', function() {
                const domainId = this.dataset.domainId;
                if (domainId) testDomainNotification(domainId, true);
            });
            
            // 确认删除按钮
            document.getElementById('confirmDeleteBtn').addEventListener('click', deleteDomain);
            
            // 分类管理相关事件
            const addCategoryBtn = document.getElementById('addCategoryBtn');
            if (addCategoryBtn) {
                addCategoryBtn.addEventListener('click', addCategory);
            }
            
            // 分类管理模态框显示时加载分类列表
            const categoryModal = document.getElementById('categoryManageModal');
            if (categoryModal) {
                categoryModal.addEventListener('shown.bs.modal', function() {
                    loadCategories();
                });
            }
            
            // 确认续期按钮
            document.getElementById('confirmRenewBtn').addEventListener('click', renewDomain);
            
            // 确认删除分类按钮
            document.getElementById('confirmDeleteCategoryBtn').addEventListener('click', confirmDeleteCategory);
            
            // 删除分类确认勾选框
            document.getElementById('confirmDeleteCheckbox').addEventListener('change', function() {
                const deleteBtn = document.getElementById('confirmDeleteCategoryBtn');
                deleteBtn.disabled = !this.checked;
            });
            
            // 添加域名按钮点击事件 - 清空表单
            document.querySelector('.add-domain-btn').addEventListener('click', function() {
                resetForm(); // 重置表单，确保显示空白表单
            });
            
            // 监听模态框关闭事件，取消正在进行的查询
            document.getElementById('addDomainModal').addEventListener('hidden.bs.modal', function() {
                if (currentWhoisController) {
                    currentWhoisController.abort();
                    currentWhoisController = null;
                }
                // 清除自动填充的高亮样式
                document.getElementById('registrar').classList.remove('auto-filled');
                document.getElementById('registrationDate').classList.remove('auto-filled');
                document.getElementById('expiryDate').classList.remove('auto-filled');
                document.getElementById('renewCycleValue').classList.remove('auto-filled');
                document.getElementById('renewCycleUnit').classList.remove('auto-filled');
            });
            
            // 添加模态框焦点管理 - 让Bootstrap自己处理aria-hidden
            const modals = ['addDomainModal', 'categoryManageModal', 'settingsModal', 'deleteDomainModal', 'renewDomainModal', 'deleteCategoryModal'];
            modals.forEach(modalId => {
                const modalElement = document.getElementById(modalId);
                if (modalElement) {
                    // 模态框显示时确保焦点陷阱正确工作
                    modalElement.addEventListener('shown.bs.modal', function() {
                        // 将焦点设置到模态框的第一个可聚焦元素
                        const firstFocusable = this.querySelector('input:not([disabled]):not([aria-hidden="true"]), button:not([disabled]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])');
                        if (firstFocusable) {
                            setTimeout(() => {
                                firstFocusable.focus();
                            }, 150);
                        }
                    });
                    
                    // 确保模态框内的元素在隐藏时不会获得焦点
                    modalElement.addEventListener('hide.bs.modal', function() {
                        // 移除可能残留的焦点
                        if (document.activeElement && this.contains(document.activeElement)) {
                            document.activeElement.blur();
                        }
                    });
                }
            });
            
            // 清除上次续期时间按钮
            document.getElementById('clearLastRenewed').addEventListener('click', function() {
                document.getElementById('lastRenewed').value = '';
                document.getElementById('lastRenewedDisplay').textContent = '已清除';
                document.getElementById('lastRenewedDisplay').classList.add('text-danger');
                
                // 清除上次续期时间后，重新根据注册时间和续期周期计算到期日期
                calculateExpiryDate();
            });
            
            // WHOIS自动查询按钮
            document.getElementById('whoisQueryBtn').addEventListener('click', async function() {
                const domainInput = document.getElementById('domainName');
                const domain = domainInput.value.trim();
                
                if (!domain) {
                    showWhoisStatus('请先输入域名', 'danger');
                    return;
                }
                
                // 验证域名格式 - 更宽松的域名格式验证
                const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
                if (!domainRegex.test(domain)) {
                    showWhoisStatus('仅支持自动查询一级域名', 'danger');
                    return;
                }
                
                // 验证是否为一级域名（只能有一个点）
                const dotCount = domain.split('.').length - 1;
                
                if (dotCount !== 1) {
                    if (dotCount === 0) {
                        showWhoisStatus('请输入完整的域名（如：example.com）', 'danger');
                    } else {
                        showWhoisStatus('只能查询一级域名，不支持二级域名查询（检测到' + dotCount + '个点）', 'danger');
                    }
                    return;
                }
                
                // 取消之前的查询
                if (currentWhoisController) {
                    currentWhoisController.abort();
                }
                
                // 创建新的查询控制器
                currentWhoisController = new AbortController();
                
                await performWhoisQuery(domain, currentWhoisController);
            });
            
            // WHOIS清除按钮
            document.getElementById('whoisClearBtn').addEventListener('click', function() {
                // 清除域名输入框
                document.getElementById('domainName').value = '';
                
                // 清除自动填充的字段
                document.getElementById('registrar').value = '';
                document.getElementById('registrationDate').value = '';
                document.getElementById('expiryDate').value = '';
                document.getElementById('renewCycleValue').value = '1';
                document.getElementById('renewCycleUnit').value = 'year';
                
                // 清除高亮样式
                document.getElementById('registrar').classList.remove('auto-filled');
                document.getElementById('registrationDate').classList.remove('auto-filled');
                document.getElementById('expiryDate').classList.remove('auto-filled');
                document.getElementById('renewCycleValue').classList.remove('auto-filled');
                document.getElementById('renewCycleUnit').classList.remove('auto-filled');
                
                // 清除查询状态信息
                const statusDiv = document.getElementById('whoisQueryStatus');
                if (statusDiv) {
                    statusDiv.style.display = 'none';
                    statusDiv.innerHTML = '';
                }
                
                // 显示清除成功提示
                showWhoisStatus('已清除自动填充的域名信息', 'info');
            });
            
            // 续期值或单位变化时更新新到期日期
            document.getElementById('renewPeriodValue').addEventListener('input', updateNewExpiryDate);
            document.getElementById('renewPeriodUnit').addEventListener('change', updateNewExpiryDate);
            
            // 注册时间和续期周期变化时自动计算到期日期
            document.getElementById('registrationDate').addEventListener('change', calculateExpiryDate);
            document.getElementById('renewCycleValue').addEventListener('input', calculateExpiryDate);
            document.getElementById('renewCycleUnit').addEventListener('change', calculateExpiryDate);
            
            // Telegram启用状态变化
            document.getElementById('telegramEnabled').addEventListener('change', function() {
                document.getElementById('telegramSettings').style.display = this.checked ? 'block' : 'none';
            });
            
            // 保存设置按钮
            document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
            
            // 测试Telegram按钮
            document.getElementById('testTelegramBtn').addEventListener('click', testTelegram);
            
            // 域名通知设置 - 全局/自定义切换
            document.getElementById('useGlobalSettings').addEventListener('change', function() {
                document.getElementById('domainNotifySettings').style.display = this.checked ? 'none' : 'block';
                // 切回全局设置时恢复“启用到期通知”，避免勾选全局反而把通知关掉
                if (this.checked) {
                    document.getElementById('notifyEnabled').checked = true;
                }
            });
            
            // 窗口大小变化监听器 - 用于移动端排序修复
            let resizeTimer;
            let lastWidth = window.innerWidth;
            
            window.addEventListener('resize', function() {
                // 防抖处理，避免频繁重新渲染
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function() {
                    const currentWidth = window.innerWidth;
                    
                    // 只有在宽度发生显著变化时才重新渲染（避免移动端滑动时地址栏显示/隐藏导致的高度变化）
                    const widthChanged = Math.abs(currentWidth - lastWidth) > 50;
                    
                    if (widthChanged) {
                        // 重新渲染域名列表以适应新的屏幕尺寸
                        renderDomainList();
                        lastWidth = currentWidth;
                    }
                }, 300); // 增加延迟时间，减少触发频率
            });
            
            // 根据注册时间和续期周期自动计算到期日期
            function calculateExpiryDate() {
                const registrationDate = document.getElementById('registrationDate').value;
                const lastRenewed = document.getElementById('lastRenewed').value;
                const renewCycleValue = parseInt(document.getElementById('renewCycleValue').value) || 1;
                const renewCycleUnit = document.getElementById('renewCycleUnit').value;
                
                if (!registrationDate) {
                    // 如果没有注册时间，清空到期日期
                    document.getElementById('expiryDate').value = '';
                    return;
                }
                
                // 如果有上次续期时间，则从上次续期时间开始计算；否则从注册时间开始计算
                const baseDate = lastRenewed ? new Date(lastRenewed) : new Date(registrationDate);
                const expiryDate = new Date(baseDate);
                
                // 根据续期周期单位计算到期日期
                switch(renewCycleUnit) {
                    case 'year':
                        expiryDate.setFullYear(baseDate.getFullYear() + renewCycleValue);
                        break;
                    case 'month':
                        expiryDate.setMonth(baseDate.getMonth() + renewCycleValue);
                        break;
                    case 'day':
                        expiryDate.setDate(baseDate.getDate() + renewCycleValue);
                        break;
                }
                
                // 格式化日期为 YYYY-MM-DD 格式
                const formattedDate = expiryDate.toISOString().split('T')[0];
                document.getElementById('expiryDate').value = formattedDate;
            }
            
            // 监听备注文本和颜色变化
            document.getElementById('customNote').addEventListener('input', updateNotePreview);
            document.getElementById('noteColor').addEventListener('change', updateNotePreview);
            
            // 当模态框显示时初始化预览
            document.getElementById('addDomainModal').addEventListener('shown.bs.modal', function() {
                updateNotePreview();
            });
            
            // 排序选项点击事件
            document.querySelectorAll('.sort-option').forEach(option => {
                option.addEventListener('click', async function(e) {
                    e.preventDefault();
                    currentSortField = this.dataset.sort;
                    currentSortOrder = this.dataset.order;
                    await renderDomainList();
                    
                                // 不再更新排序按钮文本，只保留"域名排序"
            // 但仍然需要更新勾选状态
                    
                    // 更新勾选状态
                    document.querySelectorAll('.sort-option').forEach(opt => {
                        opt.classList.remove('active');
                    });
                    this.classList.add('active');
                });
            });
            
            // 视图模式选项点击事件
            document.querySelectorAll('.view-option').forEach(option => {
                option.addEventListener('click', function(e) {
                    const newViewMode = this.dataset.view;
                    
                    // 设置视图模式
                    viewMode = newViewMode;
                    
                    // 直接获取所有卡片详情元素
                    const allDetails = document.querySelectorAll('.domain-card .collapse');
                    
                    // 根据模式直接进行操作
                    if (newViewMode === 'expand-all') {
                        // 直接展开所有卡片
                        allDetails.forEach(detail => {
                            // 手动添加show类，强制显示
                            detail.classList.add('show');
                            detail.style.height = 'auto'; // 确保内容显示
                            detail.style.overflow = 'visible';
                            
                            // 获取父级卡片
                            const domainCard = detail.closest('.domain-card');
                            if (domainCard) {
                                // 在父级卡片中寻找toggle按钮
                                const btn = domainCard.querySelector('.toggle-details');
                                if (btn) {
                                    btn.classList.remove('collapsed');
                                    btn.setAttribute('aria-expanded', 'true');
                                }
                                // 添加展开状态类，使域名可以换行显示
                                domainCard.classList.add('expanded');
                            }
                        });
                        
                        // 高亮"全部展开"按钮
                        document.querySelectorAll('.view-option').forEach(btn => {
                            if (btn.dataset.view === 'expand-all') {
                                btn.classList.remove('btn-outline-info');
                                btn.classList.add('btn-info');
                            } else {
                                btn.classList.add('btn-outline-info');
                                btn.classList.remove('btn-info');
                            }
                        });
                    } else if (newViewMode === 'collapse-all' || newViewMode === 'auto-collapse') {
                        // 直接折叠所有卡片
                        allDetails.forEach(detail => {
                            // 手动移除show类，强制隐藏
                            detail.classList.remove('show');
                            detail.style.height = '0px'; // 强制隐藏高度
                            detail.style.overflow = 'hidden';
                            
                            // 获取父级卡片
                            const domainCard = detail.closest('.domain-card');
                            if (domainCard) {
                                // 在父级卡片中寻找toggle按钮
                                const btn = domainCard.querySelector('.toggle-details');
                                if (btn) {
                                    btn.classList.add('collapsed');
                                    btn.setAttribute('aria-expanded', 'false');
                                }
                                // 移除展开状态类，恢复省略号显示
                                domainCard.classList.remove('expanded');
                            }
                        });
                        
                        // 高亮"全部折叠"按钮
                        document.querySelectorAll('.view-option').forEach(btn => {
                            if (btn.dataset.view === 'collapse-all') {
                                btn.classList.remove('btn-outline-info');
                                btn.classList.add('btn-info');
                            } else {
                                btn.classList.add('btn-outline-info');
                                btn.classList.remove('btn-info');
                            }
                        });
                    }
                });
            });
            
            // 添加点击空白处折叠卡片的功能
            document.addEventListener('click', function(e) {
                // 检查是否处于"折叠"模式
                const collapseButton = document.querySelector('.view-option[data-view="collapse-all"]');
                if (collapseButton && collapseButton.classList.contains('btn-info')) {
                    // 确保点击的是空白处，而不是卡片内部或其他功能按钮
                    if (
                        !e.target.closest('.domain-card') && 
                        !e.target.closest('.btn') && 
                        !e.target.closest('.modal') && 
                        !e.target.closest('.navbar') &&
                        !e.target.closest('.page-header') &&
                        !e.target.closest('.dropdown-menu')
                    ) {
                        // 获取所有展开的卡片
                        const expandedCards = document.querySelectorAll('.domain-card .collapse.show');
                        
                        // 折叠所有展开的卡片
                        expandedCards.forEach(detail => {
                            // 使用Bootstrap的collapse方法实现平滑的折叠动画
                            const bsCollapse = bootstrap.Collapse.getInstance(detail);
                            if (bsCollapse) {
                                bsCollapse.hide();
                            }
                            
                            // 获取父级卡片
                            const domainCard = detail.closest('.domain-card');
                            if (domainCard) {
                                // 监听折叠完成事件，移除展开状态类
                                detail.addEventListener('hidden.bs.collapse', function() {
                                    // 移除展开状态类，恢复省略号显示
                                    domainCard.classList.remove('expanded');
                                }, {once: true}); // 只执行一次
                                
                                // 在父级卡片中寻找toggle按钮并更新状态
                                const btn = domainCard.querySelector('.toggle-details');
                                if (btn) {
                                    btn.classList.add('collapsed');
                                    btn.setAttribute('aria-expanded', 'false');
                                }
                            }
                        });
                    }
                }
            });
            
            // 初始加载时设置默认排序选项
            const defaultSortOption = document.querySelector('.sort-option[data-sort="' + currentSortField + '"][data-order="' + currentSortOrder + '"]');
            if (defaultSortOption) {
                // 不再更新排序按钮文本，保持"域名排序"
                
                // 设置默认选项为激活状态
                defaultSortOption.classList.add('active');
            } else {
                // 如果找不到匹配的选项，默认选择按后缀升序
                const suffixAscOption = document.querySelector('.sort-option[data-sort="suffix"][data-order="asc"]');
                if (suffixAscOption) {
                    suffixAscOption.classList.add('active');
                    currentSortField = 'suffix';
                    currentSortOrder = 'asc';
                }
            }
            
            // 表头排序点击事件
            document.addEventListener('click', async function(e) {
                if (e.target.tagName === 'TH') {
                    const field = e.target.dataset.sort;
                    if (field) {
                        if (currentSortField === field) {
                            // 切换排序顺序
                            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
                        } else {
                            currentSortField = field;
                            currentSortOrder = 'asc';
                        }
                        await renderDomainList();
                    }
                }
            });
        }
        
        // 自定义备注颜色预览函数
        function updateNotePreview() {
            const noteText = document.getElementById('customNote').value.trim();
            const noteColor = document.getElementById('noteColor').value;
            const notePreview = document.getElementById('notePreview');
            
            if (noteText) {
                // 更新预览文字和显示状态
                notePreview.textContent = noteText;
                notePreview.style.display = 'inline-block';
                
                // 移除所有颜色类但保留基本样式
                notePreview.className = 'text-info note-preview';
                // 添加选中的颜色类
                notePreview.classList.add(noteColor);
                
                // 使用内联样式强制设置颜色
                const colorMap = {
                    'tag-blue': '#3B82F6',
                    'tag-green': '#10B981',
                    'tag-red': '#EF4444',
                    'tag-yellow': '#F59E0B',
                    'tag-purple': '#8B5CF6',
                    'tag-pink': '#EC4899',
                    'tag-indigo': '#6366F1',
                    'tag-gray': '#6B7280'
                };
                notePreview.style.backgroundColor = colorMap[noteColor] || '#3B82F6';
            } else {
                notePreview.style.display = 'none';
            }
        }
        
        // 加载所有域名
        async function loadDomains() {
            // 先尝试显示加载状态，但不阻止后续操作
            try {
                showDomainLoadingState();
            } catch (loadingError) {
                // 继续执行，不要因为显示加载状态失败而中断
            }
            
            try {
                const response = await fetch('/api/domains');
                
                if (!response.ok) {
                    throw new Error('获取域名列表失败: ' + response.status);
                }
                
                domains = await response.json();
                
                // 确保DOM元素已加载后再渲染
                setTimeout(async () => {
                    await renderDomainList();
                }, 100);
                
                return domains; // 返回加载的域名数据
            } catch (error) {
                showAlert('danger', '加载域名列表失败: ' + error.message);
                throw error;
            }
        }
        
        // 显示域名加载中的状态
        function showDomainLoadingState() {
            // 使用document.querySelector作为备选方法
            const domainListContainer = document.getElementById('domainListContainer') || document.querySelector('#domainListContainer');
            
            if (!domainListContainer) {
                return;
            }
            
            try {
                // 创建骨架屏
                domainListContainer.innerHTML = 
                    '<div class="col-md-6 col-lg-4 domain-column px-1-5">' +
                        generateSkeletonCard() +
                        generateSkeletonCard() +
                    '</div>' +
                    '<div class="col-md-6 col-lg-4 domain-column px-1-5">' +
                        generateSkeletonCard() +
                        generateSkeletonCard() +
                    '</div>' +
                    '<div class="col-md-6 col-lg-4 domain-column px-1-5">' +
                        generateSkeletonCard() +
                        generateSkeletonCard() +
                    '</div>';
            } catch (error) {
                // 忽略骨架屏设置失败
            }
        }
        
        // 生成骨架屏卡片
        function generateSkeletonCard() {
            return '<div class="domain-card skeleton-card mb-3">' +
                '<div class="domain-header skeleton-header">' +
                    '<div class="skeleton-text-lg"></div>' +
                    '<div class="skeleton-text-sm"></div>' +
                '</div>' +
                '<div class="domain-body">' +
                    '<div class="skeleton-text"></div>' +
                    '<div class="skeleton-text"></div>' +
                    '<div class="skeleton-progress"></div>' +
                '</div>' +
            '</div>';
        }
        
        // 加载Telegram配置
        async function loadTelegramConfig() {
            try {
                const response = await fetch('/api/telegram/config');
                if (!response.ok) throw new Error('获取Telegram配置失败');
                
                telegramConfig = await response.json();
                
                // 更新表单
                document.getElementById('telegramEnabled').checked = telegramConfig.enabled;
                document.getElementById('telegramSettings').style.display = telegramConfig.enabled ? 'block' : 'none';
                document.getElementById('notifyDays').value = telegramConfig.notifyDays || 30;
                
                // 处理聊天ID的显示
                if (telegramConfig.chatIdFromEnv) {
                    // 如果聊天ID来自环境变量，显示固定文本
                    document.getElementById('telegramChatId').value = '';
                    document.getElementById('telegramChatId').placeholder = '已通过环境变量配置';
                    document.getElementById('telegramChatId').disabled = false; // 允许用户编辑
                } else {
                    // 显示用户设置的聊天ID
                    document.getElementById('telegramChatId').value = telegramConfig.chatId || '';
                    document.getElementById('telegramChatId').placeholder = '如已在环境变量中配置则可留空';
                    document.getElementById('telegramChatId').disabled = false;
                }
                
                // 处理Token的显示
                if (telegramConfig.tokenFromEnv) {
                    // 如果Token来自环境变量，显示固定文本
                    document.getElementById('telegramToken').value = '';
                    document.getElementById('telegramToken').placeholder = '已通过环境变量配置';
                    document.getElementById('telegramToken').disabled = false; // 允许用户编辑
                } else {
                    // 显示用户设置的Token
                    document.getElementById('telegramToken').value = telegramConfig.botToken || '';
                    document.getElementById('telegramToken').placeholder = '如已在环境变量中配置则可留空';
                    document.getElementById('telegramToken').disabled = false;
                }
            } catch (error) {
                // 忽略Telegram配置加载失败
            }
        }
        
        // 保存设置
        async function saveSettings() {
            const enabled = document.getElementById('telegramEnabled').checked;
            // 获取表单值，即使是空字符串也保留
            const botToken = document.getElementById('telegramToken').value;
            const chatId = document.getElementById('telegramChatId').value;
            const notifyDays = parseInt(document.getElementById('notifyDays').value) || 30;
            
            try {
                const response = await fetch('/api/telegram/config', {
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify({
                        enabled,
                        botToken,
                        chatId,
                        notifyDays
                    })
                });
                
                if (!response.ok) {
                    try {
                        const error = await response.json();
                        throw new Error(error.error || '保存设置失败');
                    } catch (jsonError) {
                        // 如果响应不是JSON格式，直接使用状态文本
                        throw new Error('保存设置失败: ' + response.statusText);
                    }
                }
                
                telegramConfig = await response.json();
                showAlert('success', '设置保存成功');
                
                // 关闭模态框
                bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
            } catch (error) {
                showAlert('danger', error.message);
            }
        }
        
        // 测试Telegram通知
        async function testTelegram() {
            const testResult = document.getElementById('testResult');
            testResult.textContent = '发送中...';
            testResult.className = 'ms-2 text-info';
            
            try {
                const response = await fetch('/api/telegram/test', {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '测试失败');
                }
                
                const result = await response.json();
                testResult.textContent = '测试成功！请检查Telegram是否收到消息';
                testResult.className = 'ms-2 telegram-test-success';
            } catch (error) {
                testResult.textContent = '测试失败: ' + error.message;
                testResult.className = 'ms-2 text-danger';
            }
        }
        
        // 渲染域名列表
        async function renderDomainList() {
            // 更新总域名数量统计
            const totalDomainCountElement = document.getElementById('totalDomainCount');
            if (totalDomainCountElement) {
                totalDomainCountElement.textContent = '(' + domains.length + ')';
            }
            
            // 获取domainListContainer
            const domainListContainer = document.getElementById('domainListContainer');
            if (!domainListContainer) {
                return;
            }
            
            if (domains.length === 0) {
                // 显示无域名记录提示
                domainListContainer.innerHTML = '<div class="col-12"><div class="alert alert-info">暂无域名记录，请点击右上角按钮添加域名。</div></div>';
                return;
            }
            
            // 清空容器
            domainListContainer.innerHTML = '';
            
            // 获取全局通知设置
            const globalNotifyDays = telegramConfig.notifyDays || 30;
            
            // 计算每个域名的剩余天数（按本地日历天：到期当天为0）
            domains.forEach(domain => {
                const today = new Date();
                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const expiryDate = new Date(domain.expiryDate);
                const expiryStart = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
                domain.daysLeft = Math.round((expiryStart - todayStart) / (1000 * 60 * 60 * 24));
            });
            
            // 按照指定字段和顺序排序
            sortDomains(domains, currentSortField, currentSortOrder);
            
            // 获取分类数据
            let categoryList = [];
            try {
                const response = await fetch('/api/categories');
                if (response.ok) {
                    categoryList = await response.json();
                    // 同步到全局变量
                    categories = categoryList;
                }
            } catch (error) {
                // 如果获取分类失败，创建默认分类
                categoryList = [{
                    id: 'default',
                    name: '默认分类',
                    description: '未指定分类的域名',
                    order: 0,
                    isDefault: true
                }];
                // 同步到全局变量
                categories = categoryList;
            }
                
                // 按分类分组域名
    const domainGroups = {};
    
    // 初始化所有分类组
    categoryList.forEach(category => {
        domainGroups[category.id] = {
            id: category.id,  // 添加ID字段
            name: category.name,
            description: category.description,
            domains: [],
            order: category.order,
            isDefault: category.isDefault
        };
    });
    
    // 将域名分配到不同的分组
    domains.forEach(domain => {
        // 确保向后兼容：如果域名没有categoryId，根据是否有注册商信息决定分类
        if (!domain.categoryId) {
            if (domain.registrar && domain.registrar.trim() !== '') {
                // 如果有注册商但没有分类，先保持原有的注册商分组逻辑，但标记为需要迁移
                domain.categoryId = 'default';
            } else {
                // 没有注册商信息的域名放入默认分类
                domain.categoryId = 'default';
            }
        }
        
        // 将域名添加到对应分类，如果分类不存在则放入默认分类
        const categoryId = domain.categoryId || 'default';
        if (domainGroups[categoryId]) {
            domainGroups[categoryId].domains.push(domain);
        } else {
            domainGroups['default'].domains.push(domain);
        }
    });
            
            // 处理域名分组
            const renderGroup = (categoryData) => {
                // 如果该分组没有域名，跳过（但默认分类有域名时才显示）
                if (categoryData.domains.length === 0 && categoryData.isDefault) return;
                
                const groupName = categoryData.name;
                const groupDomains = categoryData.domains;
                
                // 创建分类容器，用于包含标题和卡片
                const groupContainer = document.createElement('div');
                groupContainer.className = 'domain-group-container'; // 移除mb-4类，使用CSS中定义的margin
                domainListContainer.appendChild(groupContainer);
                
                // 创建分类标题行
                const categoryRow = document.createElement('div');
                categoryRow.className = 'row'; // 移除额外的margin类
                categoryRow.innerHTML = 
                    '<div class="col-12 px-1-5">' + /* 添加与卡片列相同的内边距类 */
                        '<div class="category-header">' +
                            '<h5 class="category-title">' + groupName + ' <span class="count-badge">(' + groupDomains.length + ')</span></h5>' +
                        '</div>' +
                    '</div>';
                groupContainer.appendChild(categoryRow);
                
                // 创建域名卡片行容器
                const domainsRow = document.createElement('div');
                domainsRow.className = 'row g-2';
                groupContainer.appendChild(domainsRow);
                
                // 创建三列布局
                const column1 = document.createElement('div');
                const column2 = document.createElement('div');
                const column3 = document.createElement('div');
                column1.className = 'col-md-6 col-lg-4 domain-column px-1-5';
                column2.className = 'col-md-6 col-lg-4 domain-column px-1-5';
                column3.className = 'col-md-6 col-lg-4 domain-column px-1-5';
                domainsRow.appendChild(column1);
                domainsRow.appendChild(column2);
                domainsRow.appendChild(column3);
                
                // 如果分类下没有域名，显示提示信息
                if (groupDomains.length === 0) {
                    const emptyMessage = document.createElement('div');
                    emptyMessage.className = 'col-12 empty-state-container';
                    emptyMessage.innerHTML = 
                        '<div class="text-center py-3 rounded" style="background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); color: rgba(255, 255, 255, 0.9); display: table; width: 100%; height: 160px;">' +
                            '<div style="display: table-cell; vertical-align: middle; width: 100%;">' +
                                '<i class="iconfont icon-folder-open" style="font-size: 32px; opacity: 0.6; display: block; margin-bottom: 10px;"></i>' +
                                '<p class="mb-1 small">该分类下暂无域名</p>' +
                                '<small class="opacity-75" style="display: block; margin-bottom: 15px;">在此分类下添加域名</small>' +
                                '<button class="btn btn-primary btn-sm add-domain-to-category" data-category-id="' + categoryData.id + '" data-category-name="' + categoryData.name + '">' +
                                    '<i class="iconfont icon-jia" style="color: white;"></i> <span style="color: white;">添加域名</span>' +
                                '</button>' +
                            '</div>' +
                        '</div>';
                    domainsRow.appendChild(emptyMessage);
                    return; // 跳过域名卡片创建
                }
                
                // 为每个域名创建卡片，并按列分配
                groupDomains.forEach((domain, index) => {
                    // 检测屏幕尺寸，决定分配策略
                    let columnIndex;
                    const isMobile = window.innerWidth < 768; // Bootstrap的md断点
                    
                    if (isMobile) {
                        // 移动端：所有域名都放在第一列，保持排序顺序
                        columnIndex = 0;
                    } else {
                        // PC端：按列分配，轮询分配到各列
                        columnIndex = index % 3;
                    }
                    
                    const targetColumn = columnIndex === 0 ? column1 : (columnIndex === 1 ? column2 : column3);
                    // 创建卡片容器
                    const domainCard = document.createElement('div');
                    domainCard.className = 'mb-2'; // 简化类名，不再需要列类
                    
                    const daysLeft = domain.daysLeft;
                    
                    // 确保通知设置存在
                    if (!domain.notifySettings) {
                        domain.notifySettings = { useGlobalSettings: true, enabled: true, notifyDays: 30 };
                    }
                    
                    // 获取该域名的通知设置
                    const notifySettings = domain.notifySettings;
                    const notifyDays = notifySettings.useGlobalSettings ? globalNotifyDays : notifySettings.notifyDays;
                    
                    // 状态标签逻辑
                    let statusClass = 'safe';
                    let statusText = '<i class="iconfont icon-circle-check"></i> 正常';
                    let statusBadge = 'success';
                    
                    // 进度条颜色逻辑（先初始化，后面根据百分比设置）
                    let progressColor = 'rgba(0, 255, 76, 0.9)'; // 默认绿色
                    
                    // 设置状态标签
                    if (daysLeft < 0) {
                        statusClass = 'expired';
                        statusText = '<i class="iconfont icon-triangle-exclamation"></i> 已过期';
                        statusBadge = 'danger';
                    } else if (daysLeft <= 30) {  // 修改为固定30天，按需求调整
                        statusClass = 'warning';
                        statusText = '<i class="iconfont icon-bullhorn"></i> 即将到期';
                        statusBadge = 'warning';
                    }
                    
                    // 计算域名有效期的百分比进度
                    let progressPercent = 0;
                    
                    // 获取域名的续期周期设置，如果没有则使用默认值（1年）
                    let cycleDays = 365; // 默认为1年
                    
                    if (domain.renewCycle) {
                        // 根据续期周期单位计算天数
                        switch(domain.renewCycle.unit) {
                            case 'year':
                                cycleDays = domain.renewCycle.value * 365;
                                break;
                            case 'month':
                                // 更精确地计算月份的实际天数
                                if (domain.renewCycle.value === 1) {
                                    const currentDate = new Date(domain.expiryDate);
                                    const nextMonth = new Date(currentDate);
                                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                                    cycleDays = Math.round((nextMonth - currentDate) / (1000 * 60 * 60 * 24));
                                } else {
                                    const currentDate = new Date(domain.expiryDate);
                                    const futureDate = new Date(currentDate);
                                    futureDate.setMonth(futureDate.getMonth() + domain.renewCycle.value);
                                    cycleDays = Math.round((futureDate - currentDate) / (1000 * 60 * 60 * 24));
                                }
                                break;
                            case 'day':
                                cycleDays = domain.renewCycle.value;
                                break;
                            default:
                                cycleDays = 365;
                        }
                    }
                    
                    // 简化进度条计算逻辑
                    if (daysLeft < 0) {
                        // 已过期域名，但如果有lastRenewed字段，说明已续期
                        if (domain.lastRenewed) {
                            const today = new Date();
                            const expiryDate = new Date(domain.expiryDate);
                            const newDaysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                            
                            if (newDaysLeft >= cycleDays) {
                                progressPercent = 100;
                            } else {
                                // 使用精确计算，四舍五入后取整数位
                                progressPercent = Math.round((newDaysLeft / cycleDays) * 100);
                            }
                        } else {
                            progressPercent = 0;
                        }
                    } else {
                        // 未过期域名
                        if (daysLeft >= cycleDays) {
                            progressPercent = 100;
                        } else {
                            // 使用精确计算，四舍五入后取整数位
                            progressPercent = Math.round((daysLeft / cycleDays) * 100);
                        }
                    }
                    
                    // 确保进度百分比在0-100范围内
                    if (progressPercent < 0) progressPercent = 0;
                    if (progressPercent > 100) progressPercent = 100;
                    
                    // 根据百分比设置进度条颜色
                    if (progressPercent < 10) {
                        progressColor = 'rgba(231, 18, 64, 0.9)'; // 小于10%显示红色
                    } else if (progressPercent < 30) {
                        progressColor = 'rgba(255, 208, 0, 0.9)'; // 10%-30%显示黄色
                    } else {
                        progressColor = 'rgba(0, 255, 76, 0.9)'; // 大于30%显示绿色
                    }
                    
                    // 创建圆环进度条样式
                    let progressCircleHtml = '';
                    
                    // 使用SVG实现圆环进度条
                    const radius = 36; // 再次增加圆环半径
                    const circumference = 2 * Math.PI * radius; // 圆环周长
                    const offset = circumference - (progressPercent / 100) * circumference; // 计算偏移量
                    
                    // 创建SVG圆环进度条，增加SVG尺寸
                    const svgSize = 85; // 再次增加SVG容器大小
                    const svgCenter = svgSize / 2; // 居中
                    
                    // SVG圆环和百分比分开处理
                    const percentText = progressPercent + '%';
                    
                    if (daysLeft < 0) {
                        // 已过期域名显示简化的进度条，但保留0%文本
                        progressCircleHtml = 
                            '<div style="position:relative; width:' + svgSize + 'px; height:' + svgSize + 'px;">' +
                            '<svg class="progress-ring" width="' + svgSize + '" height="' + svgSize + '" viewBox="0 0 ' + svgSize + ' ' + svgSize + '">' +
                            '<circle class="progress-ring-circle-bg" stroke="#f5f5f5" stroke-width="6" fill="transparent" r="' + radius + '" cx="' + svgCenter + '" cy="' + svgCenter + '"/>' +
                            '</svg>' +
                            '<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; z-index:9999;">' +
                            '<span class="progress-percent-text">0%</span>' +
                            '</div>' +
                            '</div>';
                    } else {
                        // 正常域名显示完整进度条
                        progressCircleHtml = 
                            '<div style="position:relative; width:' + svgSize + 'px; height:' + svgSize + 'px;">' +
                            '<svg class="progress-ring" width="' + svgSize + '" height="' + svgSize + '" viewBox="0 0 ' + svgSize + ' ' + svgSize + '">' +
                            '<circle class="progress-ring-circle-bg" stroke="#f5f5f5" stroke-width="6" fill="transparent" r="' + radius + '" cx="' + svgCenter + '" cy="' + svgCenter + '"/>' +
                            '<circle class="progress-ring-circle" stroke="' + progressColor + '" stroke-width="6" fill="transparent" ' +
                            'stroke-dasharray="' + circumference + ' ' + circumference + '" ' +
                            'style="stroke-dashoffset:' + offset + 'px;" ' +
                            'r="' + radius + '" cx="' + svgCenter + '" cy="' + svgCenter + '"/>' +
                            '</svg>' +
                            '<div style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; z-index:9999;">' +
                            '<span class="progress-percent-text">' + percentText + '</span>' +
                            '</div>' +
                            '</div>';
                    }
                    
                    // 准备通知信息和上次续期信息
                    let infoHtml = '';
                    
                    // 添加通知信息
                    if (notifySettings.enabled) {
                        const effectiveNotifyDays = notifySettings.useGlobalSettings ? globalNotifyDays : notifySettings.notifyDays;
                        const notifyLabel = notifySettings.useGlobalSettings ? '全局通知: ' : '自定义通知: ';
                        infoHtml += '<small class="text-white d-inline-block me-3">' + 
                            notifyLabel + effectiveNotifyDays + '天' + 
                            '</small>';
                    } else {
                        infoHtml += '<small class="text-white d-inline-block me-3">通知已禁用</small>';
                    }
                    
                    // 添加上次续期信息
                    if (domain.lastRenewed) {
                        infoHtml += '<small class="text-white d-inline-block">上次续期: ' + formatDate(domain.lastRenewed) + '</small>';
                    }
                    
                    // 生成价格信息HTML
                    let priceHtml = '';
                    if (domain.price && domain.price.value !== null && domain.price.value !== undefined && domain.price.value !== '') {
                        priceHtml = ' <span class="text-white-50">(' + domain.price.currency + domain.price.value + 
                        '/' + (domain.price.unit === 'year' ? '年' : domain.price.unit === 'month' ? '月' : '日') + 
                        ')</span>';
                    }
                    
                                    const cardHtml = '<div class="card domain-card ' + statusClass + ' mb-2">' +
                '<div class="card-header">' +
                '<span class="status-dot ' + statusClass + '"></span>' +
                '<div class="domain-header">' +
                (domain.customNote && domain.customNote.trim() !== '' ? 
                    // 有备注时的布局 - 标签在域名下方
                    '<div class="domain-name-container" style="display: flex; flex-direction: column; justify-content: flex-start; height: 100%;">' +
                    '<h5 class="mb-0 domain-title" style="word-break: break-all;"><span class="domain-text" style="line-height: var(--domain-line-height);">' + domain.name + '</span></h5>' +
                    '<div class="spacer" style="height: var(--domain-note-spacing);"></div>' +
                    '<div class="domain-meta">' +
                                                    '<span class="text-info ' + (domain.noteColor || 'tag-blue') + '" style="background-color: ' + 
                                (domain.noteColor === 'tag-blue' ? '#3B82F6' : 
                                domain.noteColor === 'tag-green' ? '#10B981' :
                                domain.noteColor === 'tag-red' ? '#EF4444' : 
                                domain.noteColor === 'tag-yellow' ? '#F59E0B' :
                                domain.noteColor === 'tag-purple' ? '#8B5CF6' :
                                domain.noteColor === 'tag-pink' ? '#EC4899' :
                                domain.noteColor === 'tag-indigo' ? '#6366F1' :
                                domain.noteColor === 'tag-gray' ? '#6B7280' : '#3B82F6') + 
                                ' !important">' + domain.customNote + '</span>' +
                    '</div>' +
                    '</div>'
                    : 
                    // 无备注时的布局 - 保持与有备注布局相同的结构，只是没有备注标签
                    '<div class="domain-name-container" style="display: flex; flex-direction: column; justify-content: flex-start; height: 100%;">' +
                    '<h5 class="mb-0 domain-title" style="word-break: break-all;"><span class="domain-text" style="line-height: var(--domain-line-height);">' + domain.name + '</span></h5>' +
                    '<div class="spacer" style="height: var(--domain-note-spacing);"></div>' +
                    '<div class="domain-meta"></div>' +
                    '</div>'
                ) +
                '</div>' +
                        '<div class="domain-status">' +
                        '<span class="badge bg-' + statusBadge + '">' + statusText + '</span>' +
                        '<button class="btn btn-sm btn-link toggle-details collapsed" data-bs-toggle="collapse" data-bs-target="#details-' + domain.id + '" aria-expanded="false" aria-controls="details-' + domain.id + '">' +
                        '<span class="toggle-icon-container">' +
                        '<i class="iconfont icon-angle-down toggle-icon"></i>' +
                        '</span>' +
                        '</button>' +
                        '</div>' +
                        '</div>' +
                        '<div class="collapse" id="details-' + domain.id + '">' +
                        '<div class="card-body pb-2">' +
                        '<div class="d-flex justify-content-between align-items-start mb-2" style="position: relative;">' +
                        '<div class="flex-grow-1" style="padding-right: 95px; min-width: 0;">' +
                        (domain.registrar ? '<p class="card-text mb-1" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; display: block;"><i class="iconfont icon-house-chimney"></i><strong>注册厂商:</strong> ' + domain.registrar + '</p>' : '') +
                        (domain.registrationDate ? '<p class="card-text mb-1 text-nowrap" style="overflow: hidden; text-overflow: ellipsis;"><i class="iconfont icon-calendar-days"></i><strong>注册时间:</strong>' + formatDate(domain.registrationDate) + '</p>' : '') +
                        '<p class="card-text mb-1 text-nowrap" style="overflow: hidden; text-overflow: ellipsis;"><i class="iconfont icon-rili"></i><strong>到期日期:</strong>' + formatDate(domain.expiryDate) + '</p>' +
                        '<p class="card-text mb-1 text-nowrap" style="overflow: hidden; text-overflow: ellipsis;"><i class="iconfont icon-repeat"></i><strong>续期周期:</strong>' + 
                        (domain.renewCycle ? domain.renewCycle.value + ' ' + 
                        (domain.renewCycle.unit === 'year' ? '年' : 
                         domain.renewCycle.unit === 'month' ? '月' : '天') : '1 年') + 
                        priceHtml + '</p>' +
                        '<p class="card-text mb-0 text-nowrap" style="overflow: hidden; text-overflow: ellipsis;"><i class="iconfont icon-hourglass-start"></i><strong>剩余天数:</strong>' + (daysLeft > 0 ? daysLeft + ' 天 <span class="text-white-50">(' + formatDaysToYMD(daysLeft) + ')</span>' : (daysLeft === 0 ? '今天到期' : '已过期')) + '</p>' +
                        '</div>' +
                        '<div class="progress-circle-container">' +
                        '<div class="progress-circle">' +
                        progressCircleHtml +
                        '</div>' +
                        '</div>' +
                        '</div>' +
                        (infoHtml ? '<div class="domain-info mb-2">' + infoHtml + '</div>' : '') +
                        '<div class="domain-actions">' +
                        '<button class="btn btn-sm btn-primary edit-domain" data-id="' + domain.id + '" title="编辑域名"><i class="iconfont icon-pencil"></i> 编辑</button>' +
                        '<button class="btn btn-sm btn-success renew-domain" data-id="' + domain.id + '" data-name="' + domain.name + '" data-expiry="' + domain.expiryDate + '" title="续期域名"><i class="iconfont icon-arrows-rotate"></i> 续期</button>' +
                        '<button class="btn btn-sm btn-info test-domain-notify" data-id="' + domain.id + '" title="测试通知"><i class="iconfont icon-paper-plane"></i> 测试</button>' +
                        (domain.renewLink ? 
                        '<a href="' + domain.renewLink + '" target="_blank" class="btn btn-sm btn-warning" title="前往续期页面"><i class="iconfont icon-link"></i> 链接</a>' : 
                        '<button class="btn btn-sm btn-secondary" disabled title="未设置续期链接"><i class="iconfont icon-link"></i> 链接</button>') +
                        '<button class="btn btn-sm btn-danger delete-domain" data-id="' + domain.id + '" data-name="' + domain.name + '" title="删除域名"><i class="iconfont icon-shanchu"></i> 删除</button>' +
                        '</div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    domainCard.innerHTML = cardHtml;
                    
                    // 将卡片添加到对应的列中
                    targetColumn.appendChild(domainCard);
                });
            };
            
                // 按分类顺序渲染域名分组
    const sortedCategories = Object.values(domainGroups).sort((a, b) => a.order - b.order);
    
    // 首先渲染默认分类（只有在有域名的情况下）
    const defaultCategory = sortedCategories.find(cat => cat.isDefault);
    if (defaultCategory && defaultCategory.domains.length > 0) {
        renderGroup(defaultCategory);
    }
    
    // 然后渲染其他分类（包括空分类）
    sortedCategories.forEach(category => {
        if (!category.isDefault) {
            renderGroup(category);
        }
    });
            
            // 添加事件监听器
            document.querySelectorAll('.edit-domain').forEach(button => {
                button.addEventListener('click', () => editDomain(button.dataset.id));
            });
            
            document.querySelectorAll('.delete-domain').forEach(button => {
                button.addEventListener('click', () => showDeleteModal(button.dataset.id, button.dataset.name));
            });
            
            // 分类下添加域名按钮事件
            document.querySelectorAll('.add-domain-to-category').forEach(button => {
                button.addEventListener('click', async () => {
                    const categoryId = button.getAttribute('data-category-id');
                    await openAddDomainModal(categoryId);
                });
            });
            
            document.querySelectorAll('.renew-domain').forEach(button => {
                button.addEventListener('click', () => showRenewModal(button.dataset.id, button.dataset.name, button.dataset.expiry));
            });
            
            // 添加测试通知按钮的事件监听器
            document.querySelectorAll('.test-domain-notify').forEach(button => {
                button.addEventListener('click', () => testDomainNotification(button.dataset.id));
            });
            
            // 添加下拉按钮的事件监听器
            document.querySelectorAll('.toggle-details').forEach(button => {
                // 监听Bootstrap折叠/展开事件，更新域名显示样式
                const collapseTarget = document.querySelector(button.getAttribute('data-bs-target'));
                if (collapseTarget) {
                    // 监听展开事件
                    collapseTarget.addEventListener('shown.bs.collapse', function() {
                        // 找到包含此折叠内容的卡片
                        const domainCard = this.closest('.domain-card');
                        if (domainCard) {
                            // 添加expanded类，使域名可以换行显示
                            domainCard.classList.add('expanded');
                        }
                    });
                    
                    // 监听折叠事件
                    collapseTarget.addEventListener('hidden.bs.collapse', function() {
                        // 找到包含此折叠内容的卡片
                        const domainCard = this.closest('.domain-card');
                        if (domainCard) {
                            // 移除expanded类，使域名显示省略号
                            domainCard.classList.remove('expanded');
                        }
                    });
                }
                
                // 原有的点击事件处理
                button.addEventListener('click', function(e) {
                    // 如果当前是全部折叠模式，点击切换按钮会切换到自动折叠模式
                    // 但如果是全部展开模式，则保持该模式
                    if (viewMode === 'collapse-all') {
                        // 先阻止默认的bootstrap折叠/展开行为
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 切换到自动折叠模式
                        viewMode = 'auto-collapse';
                        
                        // 获取当前按钮对应的卡片详情
                        const collapseTarget = document.querySelector(button.getAttribute('data-bs-target'));
                        
                        // 折叠所有其他卡片
                        document.querySelectorAll('.collapse.show').forEach(detail => {
                            if (detail !== collapseTarget) {
                                bootstrap.Collapse.getInstance(detail)?.hide();
                            }
                        });
                        
                        // 切换当前卡片的状态
                        const collapseInstance = bootstrap.Collapse.getInstance(collapseTarget);
                        if (collapseInstance) {
                            if (collapseTarget.classList.contains('show')) {
                                collapseInstance.hide();
                            } else {
                                collapseInstance.show();
                            }
                        }
                    } else if (viewMode === 'expand-all') {
                        // 在全部展开模式下，只处理折叠操作，不改变viewMode
                        const collapseTarget = document.querySelector(button.getAttribute('data-bs-target'));
                        const collapseInstance = bootstrap.Collapse.getInstance(collapseTarget);
                        
                        // 只有当用户尝试折叠卡片时才处理
                        if (collapseTarget.classList.contains('show')) {
                            // 先阻止默认的bootstrap折叠行为
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // 手动折叠当前卡片
                            collapseInstance?.hide();
                        }
                        // 如果是尝试展开一个已折叠的卡片，使用默认行为
                    }
                    // 在自动折叠模式下，使用默认的bootstrap行为
                });
            });
        }
        
        // 保存域名
        async function saveDomain() {
            const domainId = document.getElementById('domainId').value;
            const name = document.getElementById('domainName').value;
            const expiryDate = document.getElementById('expiryDate').value;
            const registrationDate = document.getElementById('registrationDate').value;
            const registrar = document.getElementById('registrar').value;
            const categoryId = document.getElementById('domainCategory').value || 'default';
            const customNote = document.getElementById('customNote').value;
            const noteColor = document.getElementById('noteColor').value;
            const renewLink = document.getElementById('renewLink').value;
            
            // 获取续期周期设置
            const renewCycleValue = parseInt(document.getElementById('renewCycleValue').value) || 1;
            const renewCycleUnit = document.getElementById('renewCycleUnit').value;
            
            // 获取价格设置
            const priceValue = document.getElementById('priceValue').value ? parseFloat(document.getElementById('priceValue').value) : null;
            const priceCurrency = document.getElementById('priceCurrency').value;
            const priceUnit = document.getElementById('priceUnit').value;
            
            // 获取上次续期时间，如果用户清除了则设为null
            const lastRenewed = document.getElementById('lastRenewed').value || null;
            
            // 获取通知设置
            const useGlobalSettings = document.getElementById('useGlobalSettings').checked;
            const notifyEnabled = document.getElementById('notifyEnabled').checked;
            const notifyDays = parseInt(document.getElementById('domainNotifyDays').value) || 30;
            
            if (!name || !registrationDate || !expiryDate) {
                showAlert('danger', '域名、注册时间和到期日期为必填项');
                return;
            }
            
            // 确保通知设置字段存在且正确
            const notifySettings = {
                useGlobalSettings: useGlobalSettings,
                // 使用全局设置时，通知是否启用由全局配置决定；
                // 这里固定为 true，避免界面上隐藏的“启用到期通知”残留未勾选状态把通知关掉
                enabled: useGlobalSettings ? true : notifyEnabled,
                notifyDays: notifyDays
            };
            
            // 构建价格对象
            const priceObj = priceValue !== null ? {
                value: priceValue,
                currency: priceCurrency,
                unit: priceUnit
            } : null;
            
            const domainData = {
                name,
                expiryDate,
                registrationDate,
                registrar,
                categoryId,
                customNote,
                noteColor,
                renewLink,
                lastRenewed,
                renewCycle: {
                    value: renewCycleValue,
                    unit: renewCycleUnit
                },
                price: priceObj,
                notifySettings: notifySettings
            };
                    
                    try {
                        let response;
                        if (domainId) {
                            // 更新现有域名
                            domainData.id = domainId;
                            response = await fetch('/api/domains/' + domainId, {
                                headers: { 'Content-Type': 'application/json' },
                                method: 'PUT',
                                body: JSON.stringify(domainData)
                            });
                        } else {
                            // 添加新域名
                            response = await fetch('/api/domains', {
                                headers: { 'Content-Type': 'application/json' },
                                method: 'POST',
                                body: JSON.stringify(domainData)
                            });
                        }
                        
                        if (!response.ok) throw new Error('保存域名失败');
                        
                        // 关闭模态框并重新加载域名列表
                        bootstrap.Modal.getInstance(document.getElementById('addDomainModal')).hide();
                        resetForm();
                        await loadDomains();
                        showAlert('success', domainId ? '域名更新成功' : '域名添加成功');
                    } catch (error) {
                        showAlert('danger', '保存域名失败: ' + error.message);
                    }
                }
                
                // 打开添加域名模态框并预选分类
                async function openAddDomainModal(categoryId) {
                    // 重置表单
                    resetForm();
                    
                    // 设置模态框标题为添加模式
                    document.querySelector('#addDomainModal .modal-title').textContent = '添加域名';
                    
                    // 确保分类数据已加载
                    let currentCategories = categories;
                    if (!currentCategories || currentCategories.length === 0) {
                        try {
                            const response = await fetch('/api/categories');
                            if (response.ok) {
                                currentCategories = await response.json();
                                categories = currentCategories; // 同步到全局变量
                            }
                        } catch (error) {
                            // 加载分类失败时静默处理
                        }
                    }
                    
                    // 立即更新分类选择框，传入分类数据和预选分类
                    updateCategorySelect(currentCategories, categoryId);
                    
                    // 显示模态框
                    const modal = new bootstrap.Modal(document.getElementById('addDomainModal'));
                    modal.show();
                    
                    // 预选分类（在模态框显示后再次设置确保正确）
                    modal._element.addEventListener('shown.bs.modal', function() {
                        updateCategorySelect(currentCategories, categoryId);
                    }, { once: true });
                }
                
                // 编辑域名
                function editDomain(id) {
                    const domain = domains.find(d => d.id === id);
                    if (!domain) return;
                    
                    document.getElementById('domainId').value = domain.id;
                    document.getElementById('domainName').value = domain.name;
                    document.getElementById('expiryDate').value = domain.expiryDate;
                    document.getElementById('registrationDate').value = domain.registrationDate !== undefined ? domain.registrationDate : '';
                    document.getElementById('registrar').value = domain.registrar !== undefined ? domain.registrar : '';
                    // 设置分类选择
                    updateCategorySelect(categories, domain.categoryId || 'default');
                    document.getElementById('customNote').value = domain.customNote !== undefined ? domain.customNote : '';
                    // 设置标签颜色（如果有）
                    if (domain.noteColor) {
                        document.getElementById('noteColor').value = domain.noteColor;
                    } else {
                        document.getElementById('noteColor').value = 'tag-blue'; // 默认蓝色
                    }
                    document.getElementById('renewLink').value = domain.renewLink !== undefined ? domain.renewLink : '';
                    
                    // 设置续期周期
                    if (domain.renewCycle) {
                        document.getElementById('renewCycleValue').value = domain.renewCycle.value || 1;
                        document.getElementById('renewCycleUnit').value = domain.renewCycle.unit || 'year';
                    } else {
                        document.getElementById('renewCycleValue').value = 1;
                        document.getElementById('renewCycleUnit').value = 'year';
                    }
                    
                    // 设置价格
                    if (domain.price) {
                        document.getElementById('priceValue').value = domain.price.value;
                        document.getElementById('priceCurrency').value = domain.price.currency || '¥';
                        document.getElementById('priceUnit').value = domain.price.unit || 'year';
                    } else {
                        document.getElementById('priceValue').value = '';
                        document.getElementById('priceCurrency').value = '¥';
                        document.getElementById('priceUnit').value = 'year';
                    }
                    
                    // 显示上次续期时间（如果有）
                    const lastRenewedContainer = document.getElementById('lastRenewedContainer');
                    const lastRenewedDisplay = document.getElementById('lastRenewedDisplay');
                    const lastRenewed = document.getElementById('lastRenewed');
                    
                    if (domain.lastRenewed) {
                        lastRenewedContainer.style.display = 'block';
                        lastRenewedDisplay.textContent = formatDate(domain.lastRenewed);
                        lastRenewed.value = domain.lastRenewed;
                    } else {
                        lastRenewedContainer.style.display = 'none';
                        lastRenewedDisplay.textContent = '';
                        lastRenewed.value = '';
                    }
                    
                    // 设置通知选项
                    const notifySettings = domain.notifySettings || { useGlobalSettings: true, enabled: true, notifyDays: 30 };
                    document.getElementById('useGlobalSettings').checked = notifySettings.useGlobalSettings;
                    // 老数据可能没有 enabled 字段，默认视为开启；使用全局设置时强制视为开启
                    document.getElementById('notifyEnabled').checked = notifySettings.useGlobalSettings ? true : notifySettings.enabled !== false;
                    document.getElementById('domainNotifyDays').value = notifySettings.notifyDays || 30;
                    document.getElementById('domainNotifySettings').style.display = notifySettings.useGlobalSettings ? 'none' : 'block';

                    // 编辑已有域名时显示“过期通知测试”，并把当前域名 ID 挂在按钮上
                    const testExpiredBtn = document.getElementById('testExpiredNotifyBtn');
                    testExpiredBtn.dataset.domainId = domain.id;
                    testExpiredBtn.style.display = 'inline-block';
                    
                    document.querySelector('#addDomainModal .modal-title').textContent = '编辑域名';
                    const modal = new bootstrap.Modal(document.getElementById('addDomainModal'));
                    modal.show();
                    
                    // 在编辑模式下的设置
                    setTimeout(() => {
                        // 等待模态框完全显示后执行
                        document.getElementById('expiryDate').removeAttribute('readonly');
                        const expiryLabel = document.querySelector('label[for="expiryDate"]');
                        if (expiryLabel) {
                            expiryLabel.innerHTML = '<i class="iconfont icon-calendar-days"></i> 到期日期 <span style="color: red;">*</span>';
                            const helpText = expiryLabel.nextElementSibling && expiryLabel.nextElementSibling.nextElementSibling;
                            if (helpText) {
                                helpText.textContent = '根据注册时间和续期周期自动计算，可手动调整';
                                helpText.className = 'form-text text-info';
                            }
                        }
                        updateNotePreview(); // 更新备注预览
                    }, 100);
                }
                
                // 显示删除确认模态框
                function showDeleteModal(id, name) {
                    currentDomainId = id;
                    document.getElementById('deleteModalDomainName').textContent = name;
                    const modal = new bootstrap.Modal(document.getElementById('deleteDomainModal'));
                    modal.show();
                }
                
                // 删除域名
                async function deleteDomain() {
                    if (!currentDomainId) return;
                    
                    try {
                        const response = await fetch('/api/domains/' + currentDomainId, {
                            method: 'DELETE'
                        });
                        
                        if (!response.ok) throw new Error('删除域名失败');
                        
                        // 关闭模态框并重新加载域名列表
                        bootstrap.Modal.getInstance(document.getElementById('deleteDomainModal')).hide();
                        currentDomainId = null;
                        await loadDomains();
                        showAlert('success', '域名删除成功');
                    } catch (error) {
                        showAlert('danger', '删除域名失败: ' + error.message);
                    }
                }
                
                // 显示续期模态框
                function showRenewModal(id, name, expiryDate) {
                    currentDomainId = id;
                    document.getElementById('renewModalDomainName').textContent = name;
                    
                    // 获取域名的续期周期设置
                    const domain = domains.find(d => d.id === id);
                    if (domain && domain.renewCycle) {
                        document.getElementById('renewPeriodValue').value = domain.renewCycle.value;
                        document.getElementById('renewPeriodUnit').value = domain.renewCycle.unit;
                    } else {
                        document.getElementById('renewPeriodValue').value = 1;
                        document.getElementById('renewPeriodUnit').value = 'year';
                    }
                    
                    // 计算新的到期日期
                    updateNewExpiryDate();
                    
                    const modal = new bootstrap.Modal(document.getElementById('renewDomainModal'));
                    modal.show();
                }
                
                // 更新新到期日期
                function updateNewExpiryDate() {
                    const domain = domains.find(d => d.id === currentDomainId);
                    if (!domain) return;
                    
                    const renewValue = parseInt(document.getElementById('renewPeriodValue').value) || 1;
                    const renewUnit = document.getElementById('renewPeriodUnit').value;
                    
                    // 无论域名是否过期，都从原先的到期日期开始计算
                    const expiryDate = new Date(domain.expiryDate);
                    const newExpiryDate = new Date(expiryDate);
                    
                    // 根据选择的单位添加时间
                    switch(renewUnit) {
                        case 'year':
                            newExpiryDate.setFullYear(expiryDate.getFullYear() + renewValue);
                            break;
                        case 'month':
                            newExpiryDate.setMonth(expiryDate.getMonth() + renewValue);
                            break;
                        case 'day':
                            newExpiryDate.setDate(expiryDate.getDate() + renewValue);
                            break;
                    }
                    
                    document.getElementById('newExpiryDate').value = newExpiryDate.toISOString().split('T')[0];
                }
                
                // 续期域名
                async function renewDomain() {
                    if (!currentDomainId) return;
                    
                    const renewValue = parseInt(document.getElementById('renewPeriodValue').value) || 1;
                    const renewUnit = document.getElementById('renewPeriodUnit').value;
                    const newExpiryDate = document.getElementById('newExpiryDate').value;
                    
                    try {
                        const response = await fetch('/api/domains/' + currentDomainId + '/renew', {
                            headers: { 'Content-Type': 'application/json' },
                            method: 'POST',
                            body: JSON.stringify({ 
                                value: renewValue, 
                                unit: renewUnit, 
                                newExpiryDate 
                            })
                        });
                        
                        if (!response.ok) throw new Error('域名续期失败');
                        
                        // 关闭模态框并重新加载域名列表
                        bootstrap.Modal.getInstance(document.getElementById('renewDomainModal')).hide();
                        currentDomainId = null;
                        await loadDomains();
                        showAlert('success', '域名续期成功');
                    } catch (error) {
                        showAlert('danger', '域名续期失败: ' + error.message);
                    }
                }
                
                // 重置表单
                function resetForm() {
                    document.getElementById('domainId').value = '';
                    document.getElementById('domainName').value = '';
                    document.getElementById('expiryDate').value = '';
                    document.getElementById('registrationDate').value = '';
                    document.getElementById('registrar').value = '';
                    document.getElementById('customNote').value = '';
                    document.getElementById('noteColor').value = 'tag-blue'; // 重置为默认蓝色
                    document.getElementById('renewLink').value = '';
                    
                    // 重置续期周期设置
                    document.getElementById('renewCycleValue').value = '1';
                    document.getElementById('renewCycleUnit').value = 'year';
                    
                    // 重置价格设置
                    document.getElementById('priceValue').value = '';
                    document.getElementById('priceCurrency').value = '¥';
                    document.getElementById('priceUnit').value = 'year';
                    
                    // 重置上次续期时间
                    document.getElementById('lastRenewed').value = '';
                    document.getElementById('lastRenewedContainer').style.display = 'none';
                    document.getElementById('lastRenewedDisplay').textContent = '';
                    document.getElementById('lastRenewedDisplay').classList.remove('text-danger');
                    
                    // 重置通知设置
                    document.getElementById('useGlobalSettings').checked = true;
                    document.getElementById('notifyEnabled').checked = true;
                    document.getElementById('domainNotifyDays').value = '30';
                    document.getElementById('domainNotifySettings').style.display = 'none';
                    const testExpiredBtn = document.getElementById('testExpiredNotifyBtn');
                    testExpiredBtn.dataset.domainId = '';
                    testExpiredBtn.style.display = 'none';
                    
                    // 重置到期日期字段状态（添加新域名时保持可编辑）
                    document.getElementById('expiryDate').removeAttribute('readonly');
                    const expiryLabel = document.querySelector('label[for="expiryDate"]');
                    if (expiryLabel) {
                        expiryLabel.innerHTML = '<i class="iconfont icon-calendar-days"></i> 到期日期 <span style="color: red;">*</span>';
                        const helpText = expiryLabel.nextElementSibling && expiryLabel.nextElementSibling.nextElementSibling;
                        if (helpText) {
                            helpText.textContent = '根据注册时间和续期周期自动计算，可手动调整';
                            helpText.className = 'form-text text-info';
                        }
                    }
                    
                    // 重置WHOIS查询状态
                    const whoisStatus = document.getElementById('whoisQueryStatus');
                    if (whoisStatus) {
                        whoisStatus.style.display = 'none';
                        whoisStatus.innerHTML = '';
                    }
                    
                    document.querySelector('#addDomainModal .modal-title').textContent = '添加新域名';
                }
                
                // ================================
                // 分类管理功能
                // ================================
                
                // 全局变量存储分类数据
                let categories = [];
                
                // 加载分类数据
                async function loadCategories() {
                    try {
                        const response = await fetch('/api/categories');
                        if (response.ok) {
                            categories = await response.json();
                            updateCategorySelect();
                            // 只有在分类管理模态框存在时才渲染分类列表
                            if (document.getElementById('categoryList')) {
                                renderCategoryList();
                            }
                        }
                    } catch (error) {
                        // 加载分类失败时静默处理
                    }
                }
                
                // 更新分类选择下拉框
                function updateCategorySelect(categoryData = null, selectedCategoryId = null) {
                    const categorySelect = document.getElementById('domainCategory');
                    if (!categorySelect) return;
                    
                    // 使用传入的数据或全局数据
                    const dataToUse = categoryData || categories;
                    
                    // 清空现有选项
                    categorySelect.innerHTML = '';
                    
                    // 检查分类数据是否存在
                    if (!dataToUse || !Array.isArray(dataToUse)) {
                        return;
                    }
                    
                    // 首先添加默认分类
                    const defaultCategory = dataToUse.find(cat => cat.isDefault);
                    if (defaultCategory) {
                        const option = document.createElement('option');
                        option.value = defaultCategory.id;
                        option.textContent = defaultCategory.name;
                        // 如果没有指定选择的分类，或者指定的就是默认分类，则选中默认分类
                        option.selected = !selectedCategoryId || selectedCategoryId === defaultCategory.id;
                        categorySelect.appendChild(option);
                    }
                    
                    // 然后添加用户自定义分类
                    dataToUse.filter(cat => !cat.isDefault).forEach(category => {
                        const option = document.createElement('option');
                        option.value = category.id;
                        option.textContent = category.name;
                        // 如果指定的分类是当前分类，则选中
                        option.selected = selectedCategoryId === category.id;
                        categorySelect.appendChild(option);
                    });
                }
                
                // 渲染分类列表
                function renderCategoryList() {
                    const categoryList = document.getElementById('categoryList');
                    if (!categoryList) return;
                    
                    if (categories.length === 0) {
                        categoryList.innerHTML = '<div class="text-center p-3 text-muted">暂无分类</div>';
                        return;
                    }
                    
                    categoryList.innerHTML = '';
                    
                    // 筛选出非默认分类
                    const userCategories = categories.filter(cat => !cat.isDefault);
                    
                    if (userCategories.length === 0) {
                        categoryList.innerHTML = '<div class="text-center p-3 text-muted">暂无自定义分类</div>';
                        return;
                    }
                    
                    userCategories.forEach((category, index) => {
                        const categoryItem = document.createElement('div');
                        categoryItem.className = 'mb-3 p-3 rounded category-item';
                        categoryItem.style.cssText = 'background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px);';
                        categoryItem.innerHTML = 
                            '<div class="d-flex justify-content-between align-items-start">' +
                                '<div class="flex-grow-1">' +
                                    '<h6 class="mb-1 fw-bold text-white">' + category.name + '</h6>' +
                                    '<small class="text-light opacity-75">' + (category.description || '无描述') + '</small>' +
                                '</div>' +
                                '<div class="d-flex gap-2 ms-3">' +
                                    '<button type="button" class="btn btn-outline-light move-category-up" data-id="' + category.id + '" ' + (index === 0 ? 'disabled' : '') + ' title="上移" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; line-height: 1;">' +
                                        '<i class="iconfont icon-shangjiantou1" style="color: white; font-size: 14px; display: block; line-height: 1; margin: 0; vertical-align: middle;"></i>' +
                                    '</button>' +
                                    '<button type="button" class="btn btn-outline-light move-category-down" data-id="' + category.id + '" ' + (index === userCategories.length - 1 ? 'disabled' : '') + ' title="下移" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; line-height: 1;">' +
                                        '<i class="iconfont icon-xiajiantou1" style="color: white; font-size: 14px; display: block; line-height: 1; margin: 0; vertical-align: middle;"></i>' +
                                    '</button>' +
                                    '<button type="button" class="btn btn-primary edit-category" data-id="' + category.id + '" title="编辑" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; line-height: 1;">' +
                                        '<i class="iconfont icon-pencil" style="color: white; font-size: 14px; display: block; line-height: 1; margin: 0; vertical-align: middle;"></i>' +
                                    '</button>' +
                                    '<button type="button" class="btn btn-outline-danger delete-category" data-id="' + category.id + '" title="删除" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px; line-height: 1;">' +
                                        '<i class="iconfont icon-shanchu" style="color: white; font-size: 14px; display: block; line-height: 1; margin: 0; vertical-align: middle;"></i>' +
                                    '</button>' +
                                '</div>' +
                            '</div>';
                        categoryList.appendChild(categoryItem);
                    });
                    
                    // 添加事件监听器
                    bindCategoryEvents();
                }
                
                // 绑定分类管理事件
                function bindCategoryEvents() {
                    // 编辑分类
                    document.querySelectorAll('.edit-category').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const categoryId = this.dataset.id;
                            editCategory(categoryId);
                        });
                    });
                    
                    // 上移分类
                    document.querySelectorAll('.move-category-up').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const categoryId = this.dataset.id;
                            moveCategoryOrder(categoryId, 'up');
                        });
                    });
                    
                    // 下移分类
                    document.querySelectorAll('.move-category-down').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const categoryId = this.dataset.id;
                            moveCategoryOrder(categoryId, 'down');
                        });
                    });
                    
                    // 删除分类
                    document.querySelectorAll('.delete-category').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const categoryId = this.dataset.id;
                            deleteCategory(categoryId);
                        });
                    });
                }
                
                // 添加分类
                async function addCategory() {
                    const nameInput = document.getElementById('categoryName');
                    const descInput = document.getElementById('categoryDescription');
                    
                    if (!nameInput || !descInput) {
                        return;
                    }
                    
                    const name = nameInput.value.trim();
                    const description = descInput.value.trim();
                    
                    if (!name) {
                        showAlert('danger', '分类名称不能为空');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/categories', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, description })
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '添加分类失败');
                        }
                        
                        // 清空输入框
                        if (nameInput) nameInput.value = '';
                        if (descInput) descInput.value = '';
                        
                        // 重新加载分类列表和域名列表
                        await loadCategories();
                        await loadDomains(); // 刷新域名列表以更新分类选择框
                        showAlert('success', '分类添加成功');
                    } catch (error) {
                        showAlert('danger', error.message);
                    }
                }
                
                // 编辑分类
                function editCategory(categoryId) {
                    const category = categories.find(cat => cat.id === categoryId);
                    if (!category) return;
                    
                    // 找到对应的分类项目
                    const categoryItems = document.querySelectorAll('#categoryList .category-item');
                    let targetItem = null;
                    
                    categoryItems.forEach(item => {
                        if (item.querySelector('[data-id="' + categoryId + '"]')) {
                            targetItem = item;
                        }
                    });
                    
                    if (!targetItem) return;
                    
                    // 保存原始内容
                    const originalContent = targetItem.innerHTML;
                    
                    // 替换为编辑表单
                    targetItem.innerHTML = 
                        '<div class="p-3 rounded" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);">' +
                            '<div class="mb-3">' +
                                '<label class="form-label text-white small">分类名称</label>' +
                                '<input type="text" class="form-control form-control-sm" id="editName_' + categoryId + '" value="' + category.name.replace(/"/g, '&quot;') + '" maxlength="50">' +
                            '</div>' +
                            '<div class="mb-3">' +
                                '<label class="form-label text-white small">描述</label>' +
                                '<input type="text" class="form-control form-control-sm" id="editDesc_' + categoryId + '" value="' + (category.description || '').replace(/"/g, '&quot;') + '" maxlength="100">' +
                            '</div>' +
                            '<div class="d-flex gap-2">' +
                                '<button type="button" class="btn btn-success btn-sm save-edit" data-id="' + categoryId + '">' +
                                    '<i class="iconfont icon-check" style="color: white;"></i> <span style="color: white;">保存</span>' +
                                '</button>' +
                                '<button type="button" class="btn btn-secondary btn-sm cancel-edit" data-id="' + categoryId + '">' +
                                    '<i class="iconfont icon-xmark" style="color: white;"></i> <span style="color: white;">取消</span>' +
                                '</button>' +
                            '</div>' +
                        '</div>';
                    
                    // 添加保存按钮事件
                    targetItem.querySelector('.save-edit').addEventListener('click', function() {
                        const nameInput = document.getElementById('editName_' + categoryId);
                        const descInput = document.getElementById('editDesc_' + categoryId);
                        
                        const newName = nameInput.value.trim();
                        const newDesc = descInput.value.trim();
                        
                        if (!newName) {
                            showAlert('danger', '分类名称不能为空');
                            nameInput.focus();
                            return;
                        }
                        
                        updateCategory(categoryId, newName, newDesc);
                    });
                    
                    // 添加取消按钮事件
                    targetItem.querySelector('.cancel-edit').addEventListener('click', function() {
                        targetItem.innerHTML = originalContent;
                        bindCategoryEvents(); // 重新绑定事件
                    });
                    
                    // 聚焦到名称输入框
                    document.getElementById('editName_' + categoryId).focus();
                }
                
                // 更新分类
                async function updateCategory(categoryId, name, description) {
                    try {
                        const response = await fetch('/api/categories/' + categoryId, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, description })
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '更新分类失败');
                        }
                        
                        await loadCategories();
                        await loadDomains(); // 同时刷新域名列表，因为分类名称变化会影响显示
                        showAlert('success', '分类更新成功');
                    } catch (error) {
                        showAlert('danger', error.message);
                    }
                }
                
                // 显示删除分类确认模态框
                function deleteCategory(categoryId) {
                    const category = categories.find(cat => cat.id === categoryId);
                    if (!category) return;
                    
                    currentCategoryId = categoryId;
                    document.getElementById('deleteCategoryModalName').textContent = category.name;
                    
                    // 重置勾选框状态
                    const checkbox = document.getElementById('confirmDeleteCheckbox');
                    const deleteBtn = document.getElementById('confirmDeleteCategoryBtn');
                    checkbox.checked = false;
                    deleteBtn.disabled = true;
                    
                    const modal = new bootstrap.Modal(document.getElementById('deleteCategoryModal'));
                    modal.show();
                }
                
                // 确认删除分类
                async function confirmDeleteCategory() {
                    if (!currentCategoryId) return;
                    
                    try {
                        const response = await fetch('/api/categories/' + currentCategoryId, {
                            method: 'DELETE'
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '删除分类失败');
                        }
                        
                        // 关闭模态框
                        bootstrap.Modal.getInstance(document.getElementById('deleteCategoryModal')).hide();
                        currentCategoryId = null;
                        
                        await loadCategories();
                        await loadDomains(); // 重新加载域名以更新显示
                        showAlert('success', '分类删除成功');
                    } catch (error) {
                        showAlert('danger', error.message);
                    }
                }
                
                // 移动分类顺序
                async function moveCategoryOrder(categoryId, direction) {
                    try {
                        const response = await fetch('/api/categories/' + categoryId + '/move', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ direction })
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '移动分类失败');
                        }
                        
                        await loadCategories();
                        await loadDomains(); // 同时刷新域名列表，因为分类顺序变化会影响显示
                        showAlert('success', '分类顺序更新成功');
                    } catch (error) {
                        showAlert('danger', error.message);
                    }
                }
                
                // 显示WHOIS查询状态
                function showWhoisStatus(message, type = 'info') {
                    const statusDiv = document.getElementById('whoisQueryStatus');
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'alert alert-' + type + ' py-2';
                    statusDiv.innerHTML = '<i class="iconfont icon-' + (type === 'info' ? 'loading' : type === 'success' ? 'check-circle' : 'exclamation-circle') + '"></i> ' + message;
                    
                    // 3秒后自动隐藏非错误消息
                    if (type !== 'danger') {
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 3000);
                    }
                }
                
                // 执行WHOIS查询并填充表单
                async function performWhoisQuery(domain, controller) {
                    const queryBtn = document.getElementById('whoisQueryBtn');
                    const originalText = queryBtn.innerHTML;
                    
                    try {
                        // 显示查询中状态
                        queryBtn.disabled = true;
                        queryBtn.innerHTML = '<i class="spinner-border spinner-border-sm me-2"></i>查询中...';
                        showWhoisStatus('正在查询域名信息，请稍候...', 'info');
                        
                        // 调用后端API，支持取消
                        const response = await fetch('/api/whois', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ domain: domain }),
                            signal: controller.signal
                        });
                        
                        const result = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(result.error || 'API请求失败');
                        }
                        
                        if (result.success) {
                            // 查询成功，填充表单数据
                            const fillResult = fillFormWithWhoisData(result);
                            if (fillResult) {
                                showWhoisStatus('域名信息查询成功，已自动填充相关字段', 'success');
                            }
                        } else {
                            // 查询失败
                            showWhoisStatus('查询失败: ' + (result.error || '未知错误'), 'danger');
                        }
                        
                    } catch (error) {
                        // 如果是用户取消的请求，不显示错误信息
                        if (error.name === 'AbortError') {
                            showWhoisStatus('查询已取消', 'info');
                        } else {
                            showWhoisStatus('查询失败: ' + error.message, 'danger');
                        }
                    } finally {
                        // 恢复按钮状态
                        queryBtn.disabled = false;
                        queryBtn.innerHTML = originalText;
                        
                        // 清除控制器引用
                        if (currentWhoisController === controller) {
                            currentWhoisController = null;
                        }
                    }
                }
                
                // 使用WHOIS数据填充表单
                function fillFormWithWhoisData(whoisData) {
                    let filledFields = []; // 记录成功填充的字段
                    let missingFields = []; // 记录缺失的字段
                    
                    // 清除之前的高亮样式
                    document.getElementById('registrar').classList.remove('auto-filled');
                    document.getElementById('registrationDate').classList.remove('auto-filled');
                    document.getElementById('expiryDate').classList.remove('auto-filled');
                    document.getElementById('renewCycleValue').classList.remove('auto-filled');
                    document.getElementById('renewCycleUnit').classList.remove('auto-filled');
                    
                    // 填充注册商
                    if (whoisData.registrar) {
                        const registrarField = document.getElementById('registrar');
                        registrarField.value = whoisData.registrar;
                        registrarField.classList.add('auto-filled');
                        filledFields.push('注册商');
                    } else {
                        missingFields.push('注册商');
                    }
                    
                    // 填充注册日期
                    if (whoisData.registrationDate) {
                        const registrationDateField = document.getElementById('registrationDate');
                        registrationDateField.value = whoisData.registrationDate;
                        registrationDateField.classList.add('auto-filled');
                        filledFields.push('注册日期');
                    } else {
                        missingFields.push('注册日期');
                    }
                    
                    // 填充到期日期
                    if (whoisData.expiryDate) {
                        const expiryDateField = document.getElementById('expiryDate');
                        expiryDateField.value = whoisData.expiryDate;
                        expiryDateField.classList.add('auto-filled');
                        filledFields.push('到期日期');
                    } else {
                        missingFields.push('到期日期');
                    }
                    
                    // 自动计算续期周期（仅当有注册日期和到期日期时）
                    if (whoisData.registrationDate && whoisData.expiryDate) {
                        calculateRenewCycle(whoisData.registrationDate, whoisData.expiryDate);
                        // 为自动计算的续期周期添加高亮效果
                        document.getElementById('renewCycleValue').classList.add('auto-filled');
                        document.getElementById('renewCycleUnit').classList.add('auto-filled');
                        filledFields.push('续期周期');
                    }
                    
                    // 根据填充结果显示相应提示
                    if (filledFields.length > 0) {
                        let message = '已自动填充: ' + filledFields.join('、');
                        if (missingFields.length > 0) {
                            message += '；未查询到: ' + missingFields.join('、');
                        }
                        showWhoisStatus(message, 'success');
                        return true;
                    } else {
                        showWhoisStatus('未能获取到任何有效的域名信息', 'warning');
                        return false;
                    }
                }
                
                // 根据注册时间和到期时间计算续期周期
                function calculateRenewCycle(registrationDate, expiryDate) {
                    try {
                        const regDate = new Date(registrationDate);
                        const expDate = new Date(expiryDate);
                        
                        // 计算时间差（毫秒）
                        const timeDiff = expDate.getTime() - regDate.getTime();
                        
                        // 转换为天数
                        const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));
                        
                        // 根据天数推算续期周期
                        if (daysDiff >= 360 && daysDiff <= 370) {
                            // 1年 (365天左右，考虑闰年)
                            document.getElementById('renewCycleValue').value = '1';
                            document.getElementById('renewCycleUnit').value = 'year';
                        } else if (daysDiff >= 720 && daysDiff <= 740) {
                            // 2年
                            document.getElementById('renewCycleValue').value = '2';
                            document.getElementById('renewCycleUnit').value = 'year';
                        } else if (daysDiff >= 1080 && daysDiff <= 1110) {
                            // 3年
                            document.getElementById('renewCycleValue').value = '3';
                            document.getElementById('renewCycleUnit').value = 'year';
                        } else if (daysDiff >= 1800 && daysDiff <= 1830) {
                            // 5年
                            document.getElementById('renewCycleValue').value = '5';
                            document.getElementById('renewCycleUnit').value = 'year';
                        } else if (daysDiff >= 3600 && daysDiff <= 3670) {
                            // 10年
                            document.getElementById('renewCycleValue').value = '10';
                            document.getElementById('renewCycleUnit').value = 'year';
                        } else if (daysDiff >= 28 && daysDiff <= 31) {
                            // 1个月
                            document.getElementById('renewCycleValue').value = '1';
                            document.getElementById('renewCycleUnit').value = 'month';
                        } else if (daysDiff >= 85 && daysDiff <= 95) {
                            // 3个月
                            document.getElementById('renewCycleValue').value = '3';
                            document.getElementById('renewCycleUnit').value = 'month';
                        } else if (daysDiff >= 175 && daysDiff <= 185) {
                            // 6个月
                            document.getElementById('renewCycleValue').value = '6';
                            document.getElementById('renewCycleUnit').value = 'month';
                        } else {
                            // 其他情况，计算最接近的年数
                            const years = Math.round(daysDiff / 365);
                            if (years >= 1) {
                                document.getElementById('renewCycleValue').value = years.toString();
                                document.getElementById('renewCycleUnit').value = 'year';
                            } else {
                                // 小于1年的情况，按月计算
                                const months = Math.round(daysDiff / 30);
                                document.getElementById('renewCycleValue').value = Math.max(1, months).toString();
                                document.getElementById('renewCycleUnit').value = 'month';
                            }
                        }
                    } catch (error) {
                        // 出错时使用默认值
                        document.getElementById('renewCycleValue').value = '1';
                        document.getElementById('renewCycleUnit').value = 'year';
                    }
                }
                
                // 显示提示信息
                function showAlert(type, message) {
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-' + type + ' alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
                    alertDiv.style.zIndex = '9999';
                    alertDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    alertDiv.style.borderRadius = '8px';
                    alertDiv.style.minWidth = '300px';
                    alertDiv.style.maxWidth = '80%';
                    
                    // 根据消息类型选择合适的图标
                    let iconClass = '';
                    switch(type) {
                        case 'success':
                            iconClass = 'icon-success';
                            break;
                        case 'danger':
                            iconClass = 'icon-error';
                            break;
                        case 'warning':
                            iconClass = 'icon-warning';
                            break;
                        case 'info':
                            iconClass = 'icon-info';
                            break;
                    }
                    
                    alertDiv.innerHTML = '<i class="iconfont ' + iconClass + '"></i> ' + message +
                        '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
                    document.body.appendChild(alertDiv);
                    
                    // 3秒后自动消失
                    setTimeout(() => {
                        alertDiv.classList.remove('show');
                        setTimeout(() => alertDiv.remove(), 300);
                    }, 3000);
                }
                


                // 添加测试单个域名通知的函数
                async function testDomainNotification(domainId, forceExpired) {
                    try {
                        const response = await fetch('/api/domains/' + domainId + '/test-notify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ forceExpired: !!forceExpired })
                        });
                        
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || '测试失败');
                        }
                        
                        const result = await response.json();
                        showAlert('success', '通知测试成功！请检查Telegram是否收到消息');
                    } catch (error) {
                        showAlert('danger', '测试通知失败: ' + error.message);
                    }
                }

                // 按照指定字段和顺序排序域名
                function sortDomains(domains, field, order) {
                    domains.sort((a, b) => {
                        let valueA, valueB;
                        
                        // 根据字段提取排序值
                        switch (field) {
                            case 'name':
                                valueA = a.name.toLowerCase();
                                valueB = b.name.toLowerCase();
                                break;
                            case 'suffix':
                                // 获取域名后缀并反转字符串用于排序（从后往前排序）
                                const getSuffixForSort = (domain) => {
                                    return domain.toLowerCase().split('').reverse().join('');
                                };
                                valueA = getSuffixForSort(a.name);
                                valueB = getSuffixForSort(b.name);
                                break;
                            case 'customNote':
                                valueA = (a.customNote || '').toLowerCase();
                                valueB = (b.customNote || '').toLowerCase();
                                break;
                            case 'expiryDate':
                                valueA = new Date(a.expiryDate).getTime();
                                valueB = new Date(b.expiryDate).getTime();
                                break;
                            case 'daysLeft':
                                valueA = a.daysLeft;
                                valueB = b.daysLeft;
                                break;
                            case 'notifyDays':
                                const notifySettingsA = a.notifySettings || { useGlobalSettings: true, notifyDays: 30 };
                                const notifySettingsB = b.notifySettings || { useGlobalSettings: true, notifyDays: 30 };
                                valueA = notifySettingsA.useGlobalSettings ? (telegramConfig.notifyDays || 30) : notifySettingsA.notifyDays;
                                valueB = notifySettingsB.useGlobalSettings ? (telegramConfig.notifyDays || 30) : notifySettingsB.notifyDays;
                                break;
                            default:
                                valueA = a.daysLeft;
                                valueB = b.daysLeft;
                        }
                        
                        // 根据排序顺序返回比较结果
                        if (order === 'asc') {
                            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
                        } else {
                            return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
                        }
                    });
                }
            </script>
        </body>
    </html>
`;

// ================================
// 主请求处理函数
// ================================

// 处理请求
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 配置检测API（在KV检查之前处理）
  if (path === '/api/check-setup' && request.method === 'GET') {
    return await checkSetupStatus();
  }
  
  // 检查是否已配置KV空间
  if (!isKVConfigured()) {
    // 如果请求是"完成设置"按钮的操作
    if (path === '/setup-complete') {
      return Response.redirect(url.origin, 302);
    }
    
    // 显示设置向导页面
    return new Response(getSetupHTML(), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
      },
    });
  }
  
  // 获取标题
  // 优先级：环境变量 > 代码变量 > 默认值'域名到期监控'
  let siteTitle = '域名到期监控';
  if (typeof SITE_NAME !== 'undefined' && SITE_NAME) {
    siteTitle = SITE_NAME;
  } else if (DEFAULT_SITE_NAME) {
    siteTitle = DEFAULT_SITE_NAME;
  }

  // 获取正确的密码
  // 优先级：环境变量 > 代码变量 > 默认密码'domain'
  let correctPassword = 'domain';
  if (typeof TOKEN !== 'undefined' && TOKEN) {
    correctPassword = TOKEN;
  } else if (DEFAULT_TOKEN) {
    correctPassword = DEFAULT_TOKEN;
  }

  // 检查是否已经登录（通过cookie）
  const cookieHeader = request.headers.get('Cookie') || '';
  const isAuthenticated = cookieHeader.includes('auth=true');
  
  // 处理登录POST请求
  if (path === '/login' && request.method === 'POST') {
    try {
      const requestData = await request.json();
      const submittedPassword = requestData.password;
      
      if (submittedPassword === correctPassword) {
        // 密码正确，设置cookie并重定向到dashboard
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'auth=true; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400', // 24小时过期
          },
        });
      } else {
        // 密码错误
        return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: '请求格式错误' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }
  
  // 处理dashboard页面请求
  if (path === '/dashboard') {
    if (isAuthenticated) {
      // 已登录，显示主页面
      const notifyHealth = await getNotifyHealth();
      const htmlContent = getHTMLContent(siteTitle, buildNotifyWarning(notifyHealth, true));
      const response = new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
        },
      });
      
      return await addFooterToResponse(response);
    } else {
      // 未登录，重定向到登录页面
      return Response.redirect(url.origin, 302);
    }
  }
  
  // 通知日志（纯文本输出，不含界面）
  if (path === '/logs' && request.method === 'GET') {
    if (!isAuthenticated) {
      return Response.redirect(url.origin, 302);
    }
    let logs = [];
    try {
      const raw = await DOMAIN_MONITOR.get(NOTIFY_LOG_KEY);
      logs = raw ? JSON.parse(raw) : [];
    } catch (e) {
      logs = [];
    }
    if (!Array.isArray(logs)) logs = [];
    return new Response(buildNotifyLogText(logs), {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
    });
  }

  // 登出功能
  if (path === '/logout') {
    return new Response('登出成功', {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': 'auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0', // 清除cookie
      },
    });
  }
  
  // 根路径或任何其他路径（除了/api和/dashboard）都显示登录页面
  if (path === '/' || (!path.startsWith('/api/') && path !== '/dashboard')) {
    // 如果已登录，重定向到dashboard
    if (isAuthenticated) {
      return Response.redirect(url.origin + '/dashboard', 302);
    }

    const notifyHealth = await getNotifyHealth();
    const loginHtml = getLoginHTML(siteTitle, buildNotifyWarning(notifyHealth, false));
    return new Response(loginHtml, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
      },
    });
  }
  
  // API 路由处理
  if (path.startsWith('/api/')) {
    // 检查是否已登录
    if (!isAuthenticated) {
      return jsonResponse({ error: '未授权访问', success: false }, 401);
    }
    
    return await handleApiRequest(request);
  }
  
  // 如果都不匹配，返回登录页面
  const notifyHealth = await getNotifyHealth();
  const loginHtml = getLoginHTML(siteTitle, buildNotifyWarning(notifyHealth, false));
  return new Response(loginHtml, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}

// ================================
// API处理函数区域
// ================================

// 处理API请求
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 获取所有域名
  if (path === '/api/domains' && request.method === 'GET') {
    try {
      const domains = await getDomains();
      return jsonResponse(domains);
    } catch (error) {
      return jsonResponse({ error: '获取域名列表失败' }, 500);
    }
  }
  
  // 添加新域名
  if (path === '/api/domains' && request.method === 'POST') {
    try {
      const domainData = await request.json();
      const domain = await addDomain(domainData);
      return jsonResponse(domain, 201);
    } catch (error) {
      return jsonResponse({ error: '添加域名失败' }, 400);
    }
  }
  
  // 更新域名
  if (path.match(/^\/api\/domains\/[^\/]+$/) && request.method === 'PUT') {
    const id = path.split('/').pop();
    try {
      const domainData = await request.json();
      const domain = await updateDomain(id, domainData);
      return jsonResponse(domain);
    } catch (error) {
      return jsonResponse({ error: '更新域名失败' }, 400);
    }
  }
  
  // 删除域名
  if (path.match(/^\/api\/domains\/[^\/]+$/) && request.method === 'DELETE') {
    const id = path.split('/').pop();
    try {
      await deleteDomain(id);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ error: '删除域名失败' }, 400);
    }
  }
  
  // 域名续期
  if (path.match(/^\/api\/domains\/[^\/]+\/renew$/) && request.method === 'POST') {
    const id = path.split('/')[3];
    try {
      const renewData = await request.json();
      const domain = await renewDomain(id, renewData);
      return jsonResponse(domain);
    } catch (error) {
      return jsonResponse({ error: '域名续期失败' }, 400);
    }
  }
  
  // 获取Telegram配置
  if (path === '/api/telegram/config' && request.method === 'GET') {
    try {
      const config = await getTelegramConfig();
      return jsonResponse(config);
    } catch (error) {
      return jsonResponse({ error: '获取Telegram配置失败' }, 500);
    }
  }
  
  // 保存Telegram配置
  if (path === '/api/telegram/config' && request.method === 'POST') {
    try {
      const configData = await request.json();
      const config = await saveTelegramConfig(configData);
      return jsonResponse(config);
    } catch (error) {
      return jsonResponse({ error: '保存Telegram配置失败: ' + error.message }, 400);
    }
  }
  
  // 测试Telegram通知
  if (path === '/api/telegram/test' && request.method === 'POST') {
    try {
      const result = await testTelegramNotification();
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: '测试Telegram通知失败: ' + error.message }, 400);
    }
  }

  // 测试单个域名的通知
  if (path.match(/^\/api\/domains\/[^\/]+\/test-notify$/) && request.method === 'POST') {
    const id = path.split('/')[3];
    try {
      let forceExpired = false;
      try {
        const body = await request.json();
        forceExpired = !!(body && body.forceExpired);
      } catch (e) {
        // 请求体为空或不是 JSON 时按普通测试处理
        forceExpired = false;
      }
      const result = await testSingleDomainNotification(id, forceExpired);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: '测试通知失败: ' + error.message }, 400);
    }
  }
  
  // ================================
  // 分类管理API
  // ================================
  
  // 获取所有分类
  if (path === '/api/categories' && request.method === 'GET') {
    try {
      const categories = await getCategories();
      return jsonResponse(categories);
    } catch (error) {
      return jsonResponse({ error: '获取分类列表失败' }, 500);
    }
  }
  
  // 添加新分类
  if (path === '/api/categories' && request.method === 'POST') {
    try {
      const categoryData = await request.json();
      const category = await addCategory(categoryData);
      return jsonResponse(category, 201);
    } catch (error) {
      return jsonResponse({ error: error.message || '添加分类失败' }, 400);
    }
  }
  
  // 更新分类
  if (path.match(/^\/api\/categories\/[^\/]+$/) && request.method === 'PUT') {
    const id = path.split('/').pop();
    try {
      const categoryData = await request.json();
      const category = await updateCategory(id, categoryData);
      return jsonResponse(category);
    } catch (error) {
      return jsonResponse({ error: error.message || '更新分类失败' }, 400);
    }
  }
  
  // 删除分类
  if (path.match(/^\/api\/categories\/[^\/]+$/) && request.method === 'DELETE') {
    const id = path.split('/').pop();
    try {
      await deleteCategory(id);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ error: error.message || '删除分类失败' }, 400);
    }
  }
  
  // 分类排序（上移/下移）
  if (path.match(/^\/api\/categories\/[^\/]+\/move$/) && request.method === 'POST') {
    const id = path.split('/')[3];
    try {
      const { direction } = await request.json();
      await moveCategoryOrder(id, direction);
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ error: error.message || '移动分类失败' }, 400);
    }
  }

  // WHOIS域名查询
  if (path === '/api/whois' && request.method === 'POST') {
    try {
      const { domain } = await request.json();
      if (!domain) {
        return jsonResponse({ error: '域名参数不能为空' }, 400);
      }
      
      // 验证域名格式
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!domainRegex.test(domain)) {
        return jsonResponse({ error: '仅支持自动查询一级域名' }, 400);
      }
      
      // 验证是否为一级域名（只能有一个点）
      const dotCount = domain.split('.').length - 1;
      if (dotCount !== 1) {
        if (dotCount === 0) {
          return jsonResponse({ error: '请输入完整的域名（如：example.com）' }, 400);
        } else {
          return jsonResponse({ error: '只能查询一级域名，不支持二级域名查询' }, 400);
        }
      }
      
      const result = await queryDomainWhois(domain);
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ error: 'WHOIS查询失败: ' + error.message }, 400);
    }
  }
  
  // 404 - 路由不存在
  return jsonResponse({ error: '未找到请求的资源' }, 404);
}

// ================================
// 配置检测函数区域
// ================================

// 检查KV绑定状态
async function checkKVBinding() {
  try {
    if (typeof DOMAIN_MONITOR === 'undefined' || !DOMAIN_MONITOR) {
      return {
        isValid: false,
        error: 'DOMAIN_MONITOR KV namespace is not bound',
        message: 'KV存储空间未绑定'
      };
    }
    
    // 尝试访问KV存储
    await DOMAIN_MONITOR.get('test');
    return {
      isValid: true,
      message: 'KV存储空间已正确绑定'
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      message: 'KV存储空间访问失败'
    };
  }
}

// 检查完整的配置状态
async function checkSetupStatus() {
  try {
    const kvStatus = await checkKVBinding();
    
    if (!kvStatus.isValid) {
      return new Response(JSON.stringify({
        success: false,
        message: kvStatus.message,
        details: kvStatus.error,
        nextStep: 'bindKV'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取正确的密码配置
    let correctPassword = 'domain';
    if (typeof TOKEN !== 'undefined' && TOKEN) {
      correctPassword = TOKEN;
    } else if (DEFAULT_TOKEN) {
      correctPassword = DEFAULT_TOKEN;
    }
    
    // 检查是否需要认证（域名监控系统默认需要认证）
    const authRequired = true;
    
    const result = {
      success: true,
      message: '配置检查完成',
      kvBound: true,
      authRequired: authRequired,
      hasAuth: authRequired && !!correctPassword,
      nextStep: authRequired ? 'login' : 'dashboard'
    };
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: '配置检查失败',
      details: error.message,
      nextStep: 'retry'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ================================
// 数据操作函数区域
// ================================

// 获取所有域名
async function getDomains() {
  const domainsStr = await DOMAIN_MONITOR.get('domains') || '[]';
  const domains = JSON.parse(domainsStr);
  
  // 数据迁移：为没有categoryId的域名添加默认分类
  let needUpdate = false;
  domains.forEach(domain => {
    if (!domain.categoryId) {
      domain.categoryId = 'default';
      needUpdate = true;
    }
  });
  
  // 如果有数据需要更新，保存到KV
  if (needUpdate) {
    await DOMAIN_MONITOR.put('domains', JSON.stringify(domains));
  }
  
  return domains;
}

// 添加新域名
async function addDomain(domainData) {
  const domains = await getDomains();
  
  // 验证域名数据
  if (!domainData.name || !domainData.registrationDate || !domainData.expiryDate) {
    throw new Error('域名、注册时间和到期日期为必填项');
  }
  
  // 生成唯一ID
  domainData.id = crypto.randomUUID();
  
  // 添加创建时间
  domainData.createdAt = new Date().toISOString();
  
  // 处理通知设置
  if (!domainData.notifySettings) {
    // 添加默认通知设置
    domainData.notifySettings = {
      useGlobalSettings: true,
      notifyDays: 30,
      enabled: true
    };
  }
  
          // 确保有lastRenewed字段
        if (!domainData.lastRenewed) {
            domainData.lastRenewed = null;
        }
        
        // 添加到列表
        domains.push(domainData);
        
        // 保存到KV
        await DOMAIN_MONITOR.put('domains', JSON.stringify(domains));
        
        return domainData;
}

// 更新域名
async function updateDomain(id, domainData) {
  const domains = await getDomains();
  
  // 查找域名索引
  const index = domains.findIndex(d => d.id === id);
  if (index === -1) {
    throw new Error('域名不存在');
  }
  
  // 验证域名数据
  if (!domainData.name || !domainData.registrationDate || !domainData.expiryDate) {
    throw new Error('域名、注册时间和到期日期为必填项');
  }
  
  // 确保通知设置正确
  let notifySettings;
  if (domainData.notifySettings) {
    // 使用提交的通知设置
    notifySettings = domainData.notifySettings;
  } else if (domains[index].notifySettings) {
    // 使用现有的通知设置
    notifySettings = domains[index].notifySettings;
  } else {
    // 创建默认通知设置
    notifySettings = {
      useGlobalSettings: true,
      notifyDays: 30,
      enabled: true
    };
  }
  
  // 更新域名 - 确保正确处理空值
  domains[index] = {
    ...domains[index],
    name: domainData.name,
    expiryDate: domainData.expiryDate,
    registrationDate: domainData.registrationDate !== undefined ? domainData.registrationDate : domains[index].registrationDate,
    registrar: domainData.registrar !== undefined ? domainData.registrar : domains[index].registrar,
    categoryId: domainData.categoryId !== undefined ? domainData.categoryId : domains[index].categoryId, // 添加分类ID处理
    customNote: domainData.customNote !== undefined ? domainData.customNote : domains[index].customNote, // 正确处理空字符串
    noteColor: domainData.noteColor !== undefined ? domainData.noteColor : domains[index].noteColor, // 添加备注颜色处理
    renewLink: domainData.renewLink !== undefined ? domainData.renewLink : domains[index].renewLink, // 正确处理空字符串
    renewCycle: domainData.renewCycle || domains[index].renewCycle,
    price: domainData.price !== undefined ? domainData.price : domains[index].price, // 添加价格信息，保留现有价格如果未提供
    lastRenewed: domainData.lastRenewed !== undefined ? domainData.lastRenewed : domains[index].lastRenewed, // 根据用户选择更新续期时间
    notifySettings: notifySettings,
    updatedAt: new Date().toISOString()
  };
  
  // 保存到KV
  await DOMAIN_MONITOR.put('domains', JSON.stringify(domains));
  
  return domains[index];
}

// 删除域名
async function deleteDomain(id) {
  const domains = await getDomains();
  
  // 过滤掉要删除的域名
  const newDomains = domains.filter(d => d.id !== id);
  
  // 如果长度相同，说明没有找到要删除的域名
  if (newDomains.length === domains.length) {
    throw new Error('域名不存在');
  }
  
  // 保存到KV
  await DOMAIN_MONITOR.put('domains', JSON.stringify(newDomains));
  
  return true;
}

// 域名续期
async function renewDomain(id, renewData) {
  const domains = await getDomains();
  
  // 查找域名索引
  const index = domains.findIndex(d => d.id === id);
  if (index === -1) {
    throw new Error('域名不存在');
  }
  
  const now = new Date();
  
      // 更新域名信息中的续期数据
    if (!domains[index].renewCycle) {
        domains[index].renewCycle = {
            value: renewData.value || 1,
            unit: renewData.unit || 'year'
        };
    }
    
    // 如果域名是已过期状态，标记为从当前时间开始的全新计算
    if (new Date(domains[index].expiryDate) < new Date()) {
        domains[index].renewedFromExpired = true;
        domains[index].renewStartDate = now.toISOString(); // 记录续期开始时间（当前时间）
    }
  
  // 更新到期日期和续期记录
  domains[index] = {
    ...domains[index],
    expiryDate: renewData.newExpiryDate,
    updatedAt: now.toISOString(),
    lastRenewed: now.toISOString(), // 记录本次续期时间
    lastRenewPeriod: {
      value: renewData.value,
      unit: renewData.unit
    } // 记录本次续期周期，用于进度条计算
  };
  
  // 保存到KV
  await DOMAIN_MONITOR.put('domains', JSON.stringify(domains));
  
  return domains[index];
}

// 获取Telegram配置
async function getTelegramConfig() {
  const configStr = await DOMAIN_MONITOR.get('telegram_config') || '{}';
  const config = JSON.parse(configStr);
  
  // 检查是否使用环境变量
  // 当环境变量存在且配置中的值为undefined、null或空字符串时，视为使用环境变量
  const tokenFromEnv = typeof TG_TOKEN !== 'undefined' && (
    config.botToken === undefined || 
    config.botToken === null || 
    config.botToken === ''
  );
  
  const chatIdFromEnv = typeof TG_ID !== 'undefined' && (
    config.chatId === undefined || 
    config.chatId === null || 
    config.chatId === ''
  );
  
  // 检查是否使用代码中定义的变量
  const tokenFromCode = !tokenFromEnv && DEFAULT_TG_TOKEN !== '' && (
    config.botToken === undefined || 
    config.botToken === null || 
    config.botToken === ''
  );
  
  const chatIdFromCode = !chatIdFromEnv && DEFAULT_TG_ID !== '' && (
    config.chatId === undefined || 
    config.chatId === null || 
    config.chatId === ''
  );
  
  // 返回完整的配置信息，包括token和chatId
  return {
    enabled: !!config.enabled,
    chatId: chatIdFromEnv || chatIdFromCode ? '' : (config.chatId || ''),
    botToken: tokenFromEnv || tokenFromCode ? '' : (config.botToken || ''), // 如果有环境变量或代码变量，则返回空字符串
    chatIdFromEnv: chatIdFromEnv || chatIdFromCode, // 环境变量或代码中有设置都显示为已配置
    tokenFromEnv: tokenFromEnv || tokenFromCode, // 环境变量或代码中有设置都显示为已配置
    hasToken: tokenFromEnv || tokenFromCode || (config.botToken !== undefined && config.botToken !== null && config.botToken !== ''),
    notifyDays: config.notifyDays || 30,
  };
}

// 保存Telegram配置
async function saveTelegramConfig(configData) {
  // 验证必要的配置 - 只有当启用Telegram通知且环境变量中也没有配置时才需要验证
  if (configData.enabled) {
    // 检查是否可以使用环境变量或用户输入的值
    // 注意：空字符串("")被视为有效的清除操作，不应该抛出错误
    const hasTokenSource = (configData.botToken !== undefined && configData.botToken !== null) || 
                          typeof TG_TOKEN !== 'undefined' || 
                          DEFAULT_TG_TOKEN !== '';
    const hasChatIdSource = (configData.chatId !== undefined && configData.chatId !== null) || 
                           typeof TG_ID !== 'undefined' || 
                           DEFAULT_TG_ID !== '';
    
    if (!hasTokenSource) {
      throw new Error('启用Telegram通知需要提供机器人Token或在环境变量中配置');
    }
    if (!hasChatIdSource) {
      throw new Error('启用Telegram通知需要提供聊天ID或在环境变量中配置');
    }
  }
  
  // 保存配置到KV - 即使值为空也保存，表示用户有意清除值
  const config = {
    enabled: !!configData.enabled,
    botToken: configData.botToken, // 可能为空字符串，表示用户清除了值
    chatId: configData.chatId, // 可能为空字符串，表示用户清除了值
    notifyDays: configData.notifyDays || 30,
  };
  
  await DOMAIN_MONITOR.put('telegram_config', JSON.stringify(config));
  
  // 检查是否使用环境变量
  // 当环境变量存在且配置中的值为undefined、null或空字符串时，视为使用环境变量
  const tokenFromEnv = typeof TG_TOKEN !== 'undefined' && (
    config.botToken === undefined || 
    config.botToken === null || 
    config.botToken === ''
  );
  
  const chatIdFromEnv = typeof TG_ID !== 'undefined' && (
    config.chatId === undefined || 
    config.chatId === null || 
    config.chatId === ''
  );
  
  // 检查是否使用代码中定义的变量
  const tokenFromCode = !tokenFromEnv && DEFAULT_TG_TOKEN !== '' && (
    config.botToken === undefined || 
    config.botToken === null || 
    config.botToken === ''
  );
  
  const chatIdFromCode = !chatIdFromEnv && DEFAULT_TG_ID !== '' && (
    config.chatId === undefined || 
    config.chatId === null || 
    config.chatId === ''
  );
  
  // 返回完整的配置信息，包括token和chatId
  return {
    enabled: config.enabled,
    chatId: chatIdFromEnv || chatIdFromCode ? '' : (config.chatId || ''),
    botToken: tokenFromEnv || tokenFromCode ? '' : (config.botToken || ''), // 如果有环境变量或代码变量，则返回空字符串
    chatIdFromEnv: chatIdFromEnv || chatIdFromCode, // 环境变量或代码中有设置都显示为已配置
    tokenFromEnv: tokenFromEnv || tokenFromCode, // 环境变量或代码中有设置都显示为已配置
    hasToken: tokenFromEnv || tokenFromCode || !!config.botToken,
    notifyDays: config.notifyDays,
  };
}

// 测试Telegram通知
async function testTelegramNotification() {
  const config = await getTelegramConfigWithToken();
  
  if (!config.enabled) {
    throw new Error('Telegram通知未启用');
  }
  
  if (!config.botToken && typeof TG_TOKEN === 'undefined' && DEFAULT_TG_TOKEN === '') {
    throw new Error('未配置Telegram机器人Token');
  }
  
  if (!config.chatId && typeof TG_ID === 'undefined' && DEFAULT_TG_ID === '') {
    throw new Error('未配置Telegram聊天ID');
  }
  
  const message = '这是一条来自域名监控系统的测试通知，如果您收到此消息，表示Telegram通知配置成功！';
  
  const result = await sendTelegramMessage(config, message);
  return { success: true, message: '测试通知已发送' };
}

// 获取完整的Telegram配置（包括token）
async function getTelegramConfigWithToken() {
  const configStr = await DOMAIN_MONITOR.get('telegram_config') || '{}';
  const config = JSON.parse(configStr);
  
  // 如果KV中没有token或chatId，或者是空字符串，但环境变量中有值，则使用环境变量中的值
  if (typeof TG_TOKEN !== 'undefined' && (
      config.botToken === undefined || 
      config.botToken === null || 
      config.botToken === ''
  )) {
    config.botToken = TG_TOKEN;
  }
  
  // 同样处理chatId
  if (typeof TG_ID !== 'undefined' && (
      config.chatId === undefined || 
      config.chatId === null || 
      config.chatId === ''
  )) {
    config.chatId = TG_ID;
  }
  
  // 如果环境变量中没有，但代码中有，则使用代码中的值
  else if (DEFAULT_TG_TOKEN !== '' && (
      config.botToken === undefined || 
      config.botToken === null || 
      config.botToken === ''
  )) {
    config.botToken = DEFAULT_TG_TOKEN;
  }
  
  // 如果环境变量中没有，但代码中有，则使用代码中的值
  else if (DEFAULT_TG_ID !== '' && (
      config.chatId === undefined || 
      config.chatId === null || 
      config.chatId === ''
  )) {
    config.chatId = DEFAULT_TG_ID;
  }
  
  return {
    enabled: !!config.enabled,
    botToken: config.botToken || '',
    chatId: config.chatId || '',
    notifyDays: config.notifyDays || 30,
  };
}

// ================================
// 通知功能区域
// ================================
// 分类管理函数区域
// ================================

// 获取所有分类
async function getCategories() {
  const categoriesStr = await DOMAIN_MONITOR.get('categories') || '[]';
  let categories = JSON.parse(categoriesStr);
  
  // 确保默认分类存在且在最前面
  const defaultCategory = {
    id: 'default',
    name: '默认分类',
    description: '未指定分类的域名',
    order: 0,
    isDefault: true
  };
  
  // 检查是否已存在默认分类
  const hasDefault = categories.some(cat => cat.id === 'default');
  if (!hasDefault) {
    categories.unshift(defaultCategory);
  } else {
    // 确保默认分类的属性正确
    const defaultIndex = categories.findIndex(cat => cat.id === 'default');
    categories[defaultIndex] = { ...categories[defaultIndex], ...defaultCategory };
  }
  
  // 按order排序
  categories.sort((a, b) => a.order - b.order);
  
  return categories;
}

// 添加新分类
async function addCategory(categoryData) {
  const { name, description } = categoryData;
  
  if (!name || name.trim() === '') {
    throw new Error('分类名称不能为空');
  }
  
  const categories = await getCategories();
  
  // 检查分类名是否已存在
  if (categories.some(cat => cat.name === name.trim())) {
    throw new Error('分类名称已存在');
  }
  
  // 生成新ID
  const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // 计算新的order值（最大值+1）
  const maxOrder = Math.max(...categories.map(cat => cat.order));
  
  const newCategory = {
    id,
    name: name.trim(),
    description: description?.trim() || '',
    order: maxOrder + 1,
    isDefault: false,
    createdAt: new Date().toISOString()
  };
  
  categories.push(newCategory);
  await DOMAIN_MONITOR.put('categories', JSON.stringify(categories));
  
  return newCategory;
}

// 更新分类
async function updateCategory(id, categoryData) {
  const { name, description } = categoryData;
  
  if (id === 'default') {
    throw new Error('不能编辑默认分类');
  }
  
  if (!name || name.trim() === '') {
    throw new Error('分类名称不能为空');
  }
  
  const categories = await getCategories();
  const categoryIndex = categories.findIndex(cat => cat.id === id);
  
  if (categoryIndex === -1) {
    throw new Error('分类不存在');
  }
  
  // 检查分类名是否与其他分类重复
  const existingCategory = categories.find(cat => cat.name === name.trim() && cat.id !== id);
  if (existingCategory) {
    throw new Error('分类名称已存在');
  }
  
  // 更新分类信息
  categories[categoryIndex] = {
    ...categories[categoryIndex],
    name: name.trim(),
    description: description?.trim() || '',
    updatedAt: new Date().toISOString()
  };
  
  await DOMAIN_MONITOR.put('categories', JSON.stringify(categories));
  
  return categories[categoryIndex];
}

// 删除分类
async function deleteCategory(id) {
  if (id === 'default') {
    throw new Error('不能删除默认分类');
  }
  
  const categories = await getCategories();
  const categoryIndex = categories.findIndex(cat => cat.id === id);
  
  if (categoryIndex === -1) {
    throw new Error('分类不存在');
  }
  
  // 检查该分类下是否有域名
  const domains = await getDomains();
  const domainsInCategory = domains.filter(domain => domain.categoryId === id);
  
  if (domainsInCategory.length > 0) {
    // 将该分类下的域名移动到默认分类
    for (const domain of domainsInCategory) {
      domain.categoryId = 'default';
    }
    await DOMAIN_MONITOR.put('domains', JSON.stringify(domains));
  }
  
  // 删除分类
  categories.splice(categoryIndex, 1);
  await DOMAIN_MONITOR.put('categories', JSON.stringify(categories));
  
  return true;
}

// 移动分类顺序
async function moveCategoryOrder(id, direction) {
  if (id === 'default') {
    throw new Error('不能移动默认分类');
  }
  
  const categories = await getCategories();
  const categoryIndex = categories.findIndex(cat => cat.id === id);
  
  if (categoryIndex === -1) {
    throw new Error('分类不存在');
  }
  
  // 筛选出非默认分类进行排序操作
  const nonDefaultCategories = categories.filter(cat => !cat.isDefault);
  const nonDefaultIndex = nonDefaultCategories.findIndex(cat => cat.id === id);
  
  if (direction === 'up' && nonDefaultIndex > 0) {
    // 上移：与前一个交换order
    const temp = nonDefaultCategories[nonDefaultIndex].order;
    nonDefaultCategories[nonDefaultIndex].order = nonDefaultCategories[nonDefaultIndex - 1].order;
    nonDefaultCategories[nonDefaultIndex - 1].order = temp;
  } else if (direction === 'down' && nonDefaultIndex < nonDefaultCategories.length - 1) {
    // 下移：与后一个交换order
    const temp = nonDefaultCategories[nonDefaultIndex].order;
    nonDefaultCategories[nonDefaultIndex].order = nonDefaultCategories[nonDefaultIndex + 1].order;
    nonDefaultCategories[nonDefaultIndex + 1].order = temp;
  }
  
  await DOMAIN_MONITOR.put('categories', JSON.stringify(categories));
  
  return true;
}

// ================================
// 通知日志（写入KV，纯文本输出）
// ================================
const NOTIFY_LOG_KEY = 'notify_logs';
const NOTIFY_LOG_MAX = 200;

// 时间统一按北京时间展示
function formatLogTime(ts) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// 追加一条通知日志，最多保留最近200条；写日志失败不影响主流程
async function addNotifyLog(success, text) {
  try {
    const raw = await DOMAIN_MONITOR.get(NOTIFY_LOG_KEY);
    let logs = [];
    try {
      logs = raw ? JSON.parse(raw) : [];
    } catch (e) {
      logs = [];
    }
    if (!Array.isArray(logs)) logs = [];
    logs.push({ t: Date.now(), ok: !!success, text: String(text) });
    if (logs.length > NOTIFY_LOG_MAX) {
      logs = logs.slice(-NOTIFY_LOG_MAX);
    }
    await DOMAIN_MONITOR.put(NOTIFY_LOG_KEY, JSON.stringify(logs));
  } catch (e) {
    // 记录日志本身失败时忽略，不能影响通知
  }
}

// 生成纯文本日志内容（最新在上）
function buildNotifyLogText(logs) {
  if (!logs.length) return '暂无通知日志。\n';
  const lines = logs.slice().reverse().map((l) =>
    '[' + formatLogTime(l.t) + '] ' + (l.ok ? '成功' : '失败') + '  ' + l.text
  );
  return '共 ' + logs.length + ' 条（最新在上，时间为北京时间）\n\n' + lines.join('\n') + '\n';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// 读取最近一次通知结果，用于页面顶部警告
async function getNotifyHealth() {
  try {
    const raw = await DOMAIN_MONITOR.get(NOTIFY_LOG_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(logs) || logs.length === 0) return { failed: false };
    const last = logs[logs.length - 1];
    return { failed: !last.ok, time: formatLogTime(last.t), text: last.text || '' };
  } catch (e) {
    return { failed: false };
  }
}

// 生成页面顶部的失败警告；detailed=false 时用于未登录页面，不暴露聊天ID和日志链接
function buildNotifyWarning(health, detailed) {
  if (!health || !health.failed) return '';
  const link = detailed
    ? '<a href="/logs" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;margin-left:6px;">查看日志</a>'
    : '';
  const reason = detailed && health.text
    ? '<div style="font-size:0.85em;opacity:0.95;margin-top:2px;">' + escapeHtml(health.text) + '</div>'
    : '';
  return '<div style="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;max-width:92%;padding:12px 36px 12px 16px;border-radius:8px;background:rgba(200,35,51,0.96);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,0.35);font-size:14px;line-height:1.5;">' +
    '<strong>⚠️ Telegram 通知发送失败</strong>（' + escapeHtml(health.time) + '）' + link +
    reason +
    '<button type="button" onclick="this.parentNode.style.display=\'none\'" aria-label="关闭" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;">×</button>' +
    '</div>';
}

// ================================

// 发送Telegram消息
async function sendTelegramMessage(config, message) {
  // 优先使用配置中的值，如果没有则使用环境变量或代码中的值
  let botToken = config.botToken;
  let chatId = config.chatId;
  
  // 如果配置中没有值，检查环境变量
  if (!botToken) {
    if (typeof TG_TOKEN !== 'undefined') {
      botToken = TG_TOKEN;
    } else if (DEFAULT_TG_TOKEN !== '') {
      botToken = DEFAULT_TG_TOKEN;
    }
  }
  
  if (!chatId) {
    if (typeof TG_ID !== 'undefined') {
      chatId = TG_ID;
    } else if (DEFAULT_TG_ID !== '') {
      chatId = DEFAULT_TG_ID;
    }
  }
  
  if (!botToken) {
    throw new Error('未配置Telegram机器人Token');
  }
  
  if (!chatId) {
    throw new Error('未配置Telegram聊天ID');
  }
  
  const url = 'https://api.telegram.org/bot' + botToken + '/sendMessage';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      let description = 'HTTP ' + response.status;
      try {
        const error = await response.json();
        if (error && error.description) description = error.description;
      } catch (e) {
        // 响应体不是JSON时保留状态码
      }
      throw new Error('发送Telegram消息失败: ' + description);
    }

    const result = await response.json();
    await addNotifyLog(true, '已发送到 chat ' + chatId + '，内容 ' + message.length + ' 字');
    return result;
  } catch (err) {
    await addNotifyLog(false, 'chat ' + chatId + '，原因: ' + ((err && err.message) || String(err)));
    throw err;
  }
}

// ================================
// 到期天数工具（参考待办清单的截止日期表达）
// ================================

// 按北京时间计算日历天：到期当天为0，之后为负数（更符合"还剩几天"的直觉）
function getDaysLeft(expiryDate) {
  const now = new Date();
  const bjNow = new Date(now.getTime() + 8 * 3600 * 1000);
  const todayStart = Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate());
  const expiry = new Date(expiryDate);
  const expiryStart = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  return Math.round((expiryStart - todayStart) / (1000 * 60 * 60 * 24));
}

// 口语化描述：已过期 N 天 / 今天到期 / 还剩 N 天
function describeDaysLeft(daysLeft) {
  if (daysLeft < 0) return '已过期 ' + Math.abs(daysLeft) + ' 天';
  if (daysLeft === 0) return '今天到期';
  return '还剩 ' + daysLeft + ' 天';
}

// 按紧迫程度排序：过期越久越靠前，其次是剩余天数少的
function sortByUrgency(domains) {
  return domains.slice().sort((a, b) => getDaysLeft(a.expiryDate) - getDaysLeft(b.expiryDate));
}

// 设置定时任务，检查即将到期的域名并发送通知
async function checkExpiringDomains() {
  const domains = await getDomains();
  
  // 获取Telegram配置
  const telegramConfig = await getTelegramConfigWithToken();
  const globalNotifyDays = telegramConfig.enabled ? telegramConfig.notifyDays : 30;
  
  // 筛选出即将到期和已过期的域名
  const domainsToNotify = domains.filter(domain => {
    const daysLeft = getDaysLeft(domain.expiryDate);

    // 获取该域名的通知设置
    const notifySettings = domain.notifySettings || { useGlobalSettings: true, enabled: true, notifyDays: 30 };

    // 如果使用全局设置，则使用全局通知天数，否则使用域名自己的设置
    const notifyDays = notifySettings.useGlobalSettings ? globalNotifyDays : notifySettings.notifyDays;

    // 使用全局设置时通知始终启用；自定义设置下缺省也视为启用
    const domainEnabled = notifySettings.useGlobalSettings ? true : notifySettings.enabled !== false;

    // 通知已过期的域名或即将到期的域名（到期当天算即将到期）
    return domainEnabled && (daysLeft <= 0 || daysLeft <= notifyDays);
  });

  // 将域名分为已过期和即将到期两组
  // 到期当天（剩余0天）算"即将到期"，过了一天以上才算"已过期"
  // 两组都按紧迫程度排序，最急的排最前面，和待办清单一致
  const expiredDomains = sortByUrgency(domainsToNotify.filter(domain => getDaysLeft(domain.expiryDate) < 0));
  const expiringDomains = sortByUrgency(domainsToNotify.filter(domain => getDaysLeft(domain.expiryDate) >= 0));
  
  // 如果有即将到期或已过期的域名，发送通知
  if (expiringDomains.length > 0 || expiredDomains.length > 0) {
    
    // 如果启用了Telegram通知，则发送通知
    if (telegramConfig.enabled && 
        ((telegramConfig.botToken || typeof TG_TOKEN !== 'undefined') && 
         (telegramConfig.chatId || typeof TG_ID !== 'undefined'))) {
      try {
        // 发送合并的域名通知
        await sendCombinedDomainsNotification(telegramConfig, expiringDomains, expiredDomains);
      } catch (error) {
        // 静默处理Telegram通知发送失败
      }
    }
  }
}

// 发送域名通知（即将到期或已过期）
async function sendExpiringDomainsNotification(config, domains, isExpired) {
  if (domains.length === 0) return;
  
  // 构建消息内容
  let title = isExpired ? 
    '🚫 <b>域名已过期提醒</b> 🚫' : 
    '🚨 <b>域名到期提醒</b> 🚨';
  
  // 根据不同通知类型使用不同长度的等号分隔线
  // 域名到期提醒使用19个字符，域名已过期提醒使用21个字符
  const separator = isExpired ? 
    '=====================' : 
    '===================';
  // 域名之间的短横线分隔符统一使用40个字符
  const domainSeparator = '----------------------------------------';
  
  let message = title + '\n' + separator + '\n\n';
  
  domains.forEach((domain, index) => {
    const expiryDate = new Date(domain.expiryDate);
    const today = new Date();
    const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    
    if (index > 0) {
      message += '\n' + domainSeparator + '\n\n';
    }
    
    message += '🌍 <b>域名:</b> ' + domain.name + '\n';
    if (domain.registrar) {
      message += '🏬 <b>注册厂商:</b> ' + domain.registrar + '\n';
    }
    message += '⏳ <b>剩余时间:</b> ' + daysLeft + ' 天\n';
    message += '📅 <b>到期日期:</b> ' + formatDate(domain.expiryDate) + '\n';
    
    if (domain.renewLink) {
      message += '⚠️ <b>点击续期:</b> ' + domain.renewLink + '\n';
    } else {
      message += '⚠️ <b>点击续期:</b> 未设置续期链接\n';
    }
  });
  
  // 发送消息
  return await sendTelegramMessage(config, message);
}

// 发送合并的域名通知（即将到期和已过期）
async function sendCombinedDomainsNotification(config, expiringDomains, expiredDomains) {
  if (expiringDomains.length === 0 && expiredDomains.length === 0) return;

  // 单条域名的消息块
  const formatDomainBlock = (domain) => {
    const daysLeft = getDaysLeft(domain.expiryDate);
    let block = '🌍 域名: ' + domain.name + '\n';
    if (domain.registrar) {
      block += '🏬 注册厂商: ' + domain.registrar + '\n';
    }
    block += '⏳ 剩余时间: ' + describeDaysLeft(daysLeft) + '\n';
    block += '📅 到期日期: ' + formatDate(domain.expiryDate) + '\n';
    block += domain.renewLink
      ? '⚠️ 点击续期: ' + domain.renewLink + '\n'
      : '⚠️ 点击续期: 未设置续期链接\n';
    return block;
  };

  let message = '';

  // 处理即将到期的域名（按紧急程度排序）
  if (expiringDomains.length > 0) {
    message += '🚨 <b>域名到期提醒</b> 🚨\n===================\n\n';
    message += sortByUrgency(expiringDomains).map(formatDomainBlock).join('\n');
    message += '\n';
  }

  // 如果两种类型的域名都存在，添加分隔线
  if (expiringDomains.length > 0 && expiredDomains.length > 0) {
    message += '\n━━━━━━━━━━━━━━━━\n\n';
  }

  // 处理已过期的域名（过期越久越靠前）
  if (expiredDomains.length > 0) {
    message += '🚫 <b>域名已过期提醒</b> 🚫\n=====================\n\n';
    message += sortByUrgency(expiredDomains).map(formatDomainBlock).join('\n');
    message += '\n';
  }

  // 发送消息
  return await sendTelegramMessage(config, message);
}

// 添加测试单个域名通知的后端函数
async function testSingleDomainNotification(id, forceExpired) {
  // 获取域名信息
  const domains = await getDomains();
  const domain = domains.find(d => d.id === id);
  
  if (!domain) {
    throw new Error('域名不存在');
  }
  
  // 获取Telegram配置
  const telegramConfig = await getTelegramConfigWithToken();
  
  if (!telegramConfig.enabled) {
    throw new Error('Telegram通知未启用');
  }
  
  if (!telegramConfig.botToken && typeof TG_TOKEN === 'undefined') {
    throw new Error('未配置Telegram机器人Token');
  }
  
  if (!telegramConfig.chatId && typeof TG_ID === 'undefined') {
    throw new Error('未配置Telegram聊天ID');
  }
  
  // 构建测试消息
  const daysLeft = getDaysLeft(domain.expiryDate);
  // 编辑页的“过期通知测试”强制走已过期模板，即使域名还没到期
  const isExpired = !!forceExpired || daysLeft < 0;
  const displayDaysLeft = forceExpired ? Math.min(daysLeft, -1) : daysLeft;
  
  let title = isExpired ? 
    '🚫 <b>域名已过期测试通知</b> 🚫' : 
    '🚨 <b>域名到期测试通知</b> 🚨';
  
  // 根据不同通知类型使用不同长度的分隔线
  // 域名到期测试通知使用23个字符，域名已过期测试通知使用25个字符
  const separator = isExpired ? 
    '=========================' : 
        '=======================';
  
  let message = title + '\n' + separator + '\n\n';
  message += '这是一条测试通知，用于预览域名' + (isExpired ? '已过期' : '到期') + '提醒的格式：\n\n';

  message += '🌍 <b>域名:</b> ' + domain.name + '\n';
  if (domain.registrar) {
    message += '🏬 <b>注册厂商:</b> ' + domain.registrar + '\n';
  }
  message += '⏳ <b>剩余时间:</b> ' + describeDaysLeft(displayDaysLeft) + '\n';
  message += '📅 <b>到期日期:</b> ' + formatDate(domain.expiryDate) + '\n';
  
  if (domain.renewLink) {
    message += '⚠️ <b>点击续期:</b> ' + domain.renewLink + '\n';
  } else {
    message += '⚠️ <b>点击续期:</b> 未设置续期链接\n';
  }
  
  // 发送测试消息
  const result = await sendTelegramMessage(telegramConfig, message);
  return { success: true, message: '测试通知已发送' };
}

// ================================
// Cloudflare Workers事件处理
// ================================

// 注册fetch事件处理程序
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// 注册定时任务，每天检查一次
addEventListener('scheduled', event => {
  event.waitUntil(checkExpiringDomains());
});

// ================================
// 辅助函数区域
// ================================

// 添加页面底部版权信息
function addCopyrightFooter(html) {
  // 定义页脚内容和样式，只需要修改这里
  // 页脚文字大小
  const footerFontSize = '14px';
  // 页脚图标大小
  const footerIconSize = '14px';
  // 页脚图标颜色（使用CSS颜色值，如：#4e54c8、blue、rgba(0,0,0,0.7)等）
  const footerIconColor = 'white';
  
  const footerContent = `<span style="color: white;">Copyright © 2025 Faiz</span> &nbsp;|&nbsp; <i class="iconfont icon-github" style="font-size: ${footerIconSize}; color: ${footerIconColor};"></i><a href="https://github.com/kamanfaiz/CF-Domain-Autocheck" target="_blank" style="color: white; text-decoration: none;">GitHub Repository</a> &nbsp;|&nbsp; <i class="iconfont icon-book" style="font-size: ${footerIconSize}; color: ${footerIconColor};"></i><a href="https://blog.faiz.hidns.co/" target="_blank" style="color: white; text-decoration: none;">Faiz博客</a>`;
  
  const bodyEndIndex = html.lastIndexOf('</body>');
  
  // 如果找到了</body>标签
  if (bodyEndIndex !== -1) {
    // 在</body>标签前插入页脚和相关脚本
    const footer = `
      <style>
        html {
          height: 100%;
        }
        body {
          min-height: 100%;
          display: flex;
          flex-direction: column;
        }
        .content-wrapper {
          flex: 1 0 auto;
        }
        #copyright-footer {
          flex-shrink: 0;
          text-align: center;
          padding: 10px;
          font-size: ${footerFontSize};
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          margin-top: auto;
          background-color: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        /* 移动端页脚响应式缩放 */
        @media (max-width: 768px) {
          #copyright-footer {
            font-size: 12px;
            padding: 8px 5px;
          }
        }
        
        @media (max-width: 480px) {
          #copyright-footer {
            font-size: 10px;
            padding: 6px 3px;
          }
          
          #copyright-footer .iconfont {
            font-size: 10px !important;
          }
        }
        
        @media (max-width: 320px) {
          #copyright-footer {
            font-size: 9px;
            padding: 5px 2px;
          }
          
          #copyright-footer .iconfont {
            font-size: 9px !important;
          }
        }
      </style>
      
      <footer id="copyright-footer">
        ${footerContent}
      </footer>
      
      <script>
        // 页面加载完成后执行
        document.addEventListener('DOMContentLoaded', function() {
          // 将body内的所有内容（除了页脚）包裹在一个div中
          const footer = document.getElementById('copyright-footer');
          const contentWrapper = document.createElement('div');
          contentWrapper.className = 'content-wrapper';
          
          // 将body中除页脚外的所有元素移到contentWrapper中
          while (document.body.firstChild !== footer) {
            if (document.body.firstChild) {
              contentWrapper.appendChild(document.body.firstChild);
            } else {
              break;
            }
          }
          
          // 将contentWrapper插入到body的开头
          document.body.insertBefore(contentWrapper, footer);
        });
      </script>
    `;
    
    return html.slice(0, bodyEndIndex) + footer + html.slice(bodyEndIndex);
  }
  
  // 如果没找到</body>标签，就直接添加到HTML末尾
  const footerHtml = `
    <div style="text-align: center; padding: 10px; font-size: ${footerFontSize}; margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.18); background-color: rgba(0, 0, 0, 0.2); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); color: white; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      ${footerContent}
    </div>
  `;
  
  // 在</body>标签前插入页脚
  return html.replace('</body>', `${footerHtml}</body>`);
}

// 修改响应处理，添加版权信息
async function addFooterToResponse(response) {
  const contentType = response.headers.get('Content-Type') || '';
  
  // 只处理HTML响应
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const modifiedHtml = addCopyrightFooter(html);
    
    return new Response(modifiedHtml, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  
  return response;
}


// 获取配置向导HTML
function getSetupHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>域名监控系统 - 初始化配置</title>
    <link rel="icon" type="image/svg+xml" href="${DEFAULT_LOGO}">
    <link rel="stylesheet" href="${ICONFONT_CSS}">
    <script src="${ICONFONT_JS}"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            line-height: 1.6;
        }
        
        .setup-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            padding: 40px;
            max-width: 800px;
            width: 90%;
            margin: 20px;
        }
        
        .setup-header {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .setup-header .iconfont {
            font-size: 64px;
            color: #272830;
            margin-bottom: 16px;
            display: block;
        }
        
        .setup-header h1 {
            color: #2c3e50;
            font-size: 28px;
            margin-bottom: 8px;
        }
        
        .setup-header p {
            color: #7f8c8d;
            font-size: 16px;
        }
        
        .step {
            margin-bottom: 30px;
            padding: 24px;
            border: 1px solid #e1e8ed;
            border-radius: 12px;
            background: #f8fafc;
        }
        
        .step-title {
            display: flex;
            align-items: center;
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 16px;
        }
        
        .step-number {
            background: #667eea;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
            margin-right: 12px;
        }
        
        .step-content {
            color: #555;
            line-height: 1.7;
        }
        
        .code-block {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 16px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 14px;
            margin: 12px 0;
            overflow-x: auto;
        }
        
        .config-table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
        }
        
        .config-table th,
        .config-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e1e8ed;
        }
        
        .config-table th {
            background: #f1f3f4;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .config-table code {
            background: #f1f3f4;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
        }
        
        .check-button {
            width: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 30px;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        
        .check-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
            color: white;
            text-decoration: none;
        }
        
        .check-button:active {
            transform: translateY(0);
        }
        
        .check-button:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .status-message {
            margin-top: 20px;
            padding: 16px;
            border-radius: 8px;
            font-weight: 500;
            display: none;
        }
        
        .status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .status-loading {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .loading-spinner {
      display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
      border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
            margin-right: 8px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .iconfont {
            font-size: 20px;
            margin-right: 8px;
        }
        
        @media (max-width: 768px) {
            .setup-container {
                padding: 24px;
                margin: 10px;
            }
            
            .setup-header h1 {
                font-size: 24px;
            }
            
            .code-block {
                font-size: 12px;
                padding: 12px;
            }
    }
  </style>
</head>
<body>
  <div class="setup-container">
        <div class="setup-header">
            <i class="iconfont icon-jiankong-zichanjiankong"></i>
            <h1>欢迎使用域名到期监控系统</h1>
            <p>首次使用需要进行简单配置，请按照以下步骤完成初始化</p>
    </div>
    
    <div class="step">
            <div class="step-title">
                <span class="step-number">1</span>
                <i class="iconfont icon-database"></i>
                绑定 KV 存储空间 (必需)
            </div>
            <div class="step-content">
                <p>在 Cloudflare Workers 控制台中为您的 Worker 绑定 KV 存储空间：</p>
                <ol style="margin: 12px 0 12px 20px;">
                    <li>进入 Cloudflare 控制台 → Workers & Pages</li>
                    <li>找到您的 Worker 项目，点击进入</li>
                    <li>转到 "设置" → "变量"</li>
                    <li>在 "KV 命名空间绑定" 部分点击 "添加绑定"</li>
                    <li>变量名称填写：<code>DOMAIN_MONITOR</code></li>
                    <li>选择或创建一个 KV 命名空间</li>
                    <li>点击 "保存并部署"</li>
      </ol>
            </div>
    </div>
    
    <div class="step">
            <div class="step-title">
                <span class="step-number">2</span>
                <i class="iconfont icon-setting"></i>
                配置环境变量 (可选)
            </div>
            <div class="step-content">
                <p>根据需要在 "设置" → "变量" → "环境变量" 中添加以下配置：</p>
                <table class="config-table">
                    <thead>
                        <tr>
                            <th>变量名</th>
                            <th>说明</th>
                            <th>示例</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>TOKEN</code></td>
                            <td>登录密码（留空则使用默认密码 "domain"）</td>
                            <td>your_password</td>
                        </tr>
                        <tr>
                            <td><code>SITE_NAME</code></td>
                            <td>网站标题</td>
                            <td>我的域名监控</td>
                        </tr>
                        <tr>
                            <td><code>LOGO_URL</code></td>
                            <td>自定义 Logo 图片 URL</td>
                            <td>https://example.com/logo.png</td>
                        </tr>
                        <tr>
                            <td><code>BACKGROUND_URL</code></td>
                            <td>自定义背景图片 URL</td>
                            <td>https://example.com/bg.jpg</td>
                        </tr>
                        <tr>
                            <td><code>TG_TOKEN</code></td>
                            <td>Telegram Bot Token（用于到期通知）</td>
                            <td>1234567890:ABC...</td>
                        </tr>
                        <tr>
                            <td><code>TG_ID</code></td>
                            <td>Telegram Chat ID</td>
                            <td>123456789</td>
                        </tr>
                        <tr>
                            <td><code>WHOISJSON_API_KEY</code></td>
                            <td>WhoisJSON API 密钥（用于域名查询）</td>
                            <td>your_api_key</td>
                        </tr>
                    </tbody>
                </table>
                <p><strong>注意：</strong>环境变量配置后需要重新部署 Worker 才能生效。</p>
            </div>
        </div>
        
        <button class="check-button" onclick="checkConfiguration()">
            <i class="iconfont icon-check"></i>
            检测配置并进入系统
        </button>
        
        <div id="statusMessage" class="status-message"></div>
    </div>
    
    <script>
        async function checkConfiguration() {
            const button = document.querySelector('.check-button');
            const statusDiv = document.getElementById('statusMessage');
            
            // 设置加载状态
            button.disabled = true;
            button.innerHTML = '<span class="loading-spinner"></span>检测配置中...';
            
            statusDiv.className = 'status-message status-loading';
            statusDiv.style.display = 'block';
            statusDiv.textContent = '正在检测配置状态...';
            
            try {
                const response = await fetch('/api/check-setup');
                const result = await response.json();
                
                if (result.success) {
                    statusDiv.className = 'status-message status-success';
                    statusDiv.innerHTML = '<i class="iconfont icon-check"></i>' + result.message + '，即将跳转...';
                    
                    // 根据配置状态决定跳转目标
                    setTimeout(() => {
                        if (result.nextStep === 'dashboard') {
                            window.location.href = '/dashboard';
                        } else if (result.nextStep === 'login') {
                            window.location.href = '/';
                        } else {
                            window.location.href = '/';
                        }
                    }, 1500);
                } else {
                    statusDiv.className = 'status-message status-error';
                    let errorMessage = '<i class="iconfont icon-close"></i>' + result.message;
                    if (result.details) {
                        errorMessage += '<br><small>详细信息: ' + result.details + '</small>';
                    }
                    statusDiv.innerHTML = errorMessage;
                    
                    // 重置按钮
                    button.disabled = false;
                    button.innerHTML = '<i class="iconfont icon-refresh"></i>重新检测';
                }
            } catch (error) {
                statusDiv.className = 'status-message status-error';
                statusDiv.innerHTML = '<i class="iconfont icon-close"></i>检测失败: ' + error.message;
                
                // 重置按钮
                button.disabled = false;
                button.innerHTML = '<i class="iconfont icon-refresh"></i>重新检测';
            }
        }
    </script>
</body>
</html>`;
}
