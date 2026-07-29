// 主题切换核心逻辑：修复上传点击问题
(function initTheme() {
    const themes = {
        light: 'style-day.css',
        dark: 'style-night.css'
    };
    const savedTheme = localStorage.getItem('wordTheme') || 'light';
    const cssUrl = themes[savedTheme];
    
    // 直接往head插link，不通过div，避免DOM加载延迟
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link); // 改这里，直接插head
    
    window.switchTheme = function() {
        const newTheme = savedTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('wordTheme', newTheme);
        link.href = themes[newTheme];
    };
})();







// ===== IndexedDB 本地缓存封装（应对 KV 未配置 / 网络离线场景） =====
const DB_NAME = 'words_db';
const DB_STORE = 'vocabulary';
const DB_KEY = 'wordData_v1';

let _dbPromise = null;
function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

async function loadFromDB() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const req = tx.objectStore(DB_STORE).get(DB_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

async function saveToDB(data) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put({ ...data, _savedAt: Date.now() }, DB_KEY);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('IndexedDB save failed:', e);
        return false;
    }
}

// 当前存储模式：'kv' = 云端已连接; 'local' = 仅本地缓存
let storageMode = 'kv';

function setStorageMode(mode) {
    storageMode = mode;
    const el = document.getElementById('storageModeIndicator');
    if (el) {
        if (mode === 'kv') {
            el.textContent = '☁️ 云端同步';
            el.style.color = '#4CAF50';
            el.title = '数据已连接 Cloudflare KV，实时同步';
        } else {
            el.textContent = '💾 本地缓存模式';
            el.style.color = '#FF9800';
            el.title = 'KV 未配置，数据保存在浏览器本地。配置 KV 后可恢复云端同步';
        }
    }
}

// ===== 页面加载后立即初始化 =====
window.addEventListener('load', () => {
    initBaseEvents();
    initKeyboardEvents();
    // 从云端拉取数据（IndexedDB 优先，云端回退）
    fetchFromCloud();

    // 网络恢复后自动尝试同步到云端
    window.addEventListener('online', async () => {
        if (storageMode === 'local' && isInited) {
            showFeedback('🌐 网络已恢复，尝试连接云端...', 'info');
            const data = { toReviewWords, masteredWords, untrainedWords, vocabularyName };
            try {
                const resp = await fetch('/api/words', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (resp.ok) {
                    setStorageMode('kv');
                    showFeedback('☁️ 已恢复云端同步！', 'success');
                }
            } catch (_) {
                // 仍然失败，保持本地模式
            }
        }
    });
});

// 关闭网页时的提示已移除，因为有自动保存功能

// 全局变量定义（数据存储+状态控制）
let toReviewWords = [];    // 记忆区单词数组（完整对象：word/translations/type）
let masteredWords = [];    // 已牢记单词数组
let untrainedWords = [];   // 待巩固单词数组
let currentIndex = 0;      // 当前选中记忆区单词索引
let isMeaningHidden = false; // 释义显示状态
let isInited = false;      // 应用初始化状态
// 新增：词汇表名称（初始值与HTML默认文本一致，用于展示、编辑、下载命名）
let vocabularyName = "未选择文件";

// 新增滑动相关全局变量
let startX = 0; // 滑动起始X坐标
let isSliding = false; // 是否处于滑动状态
let targetCardObj = null; // 滑动操作的目标单词卡片对象
let currentOperateArea = ''; // 当前滑动操作的区域（mastered/review/untrained）
const slideThreshold = 50; // 滑动触发阈值（px），可调整






// DOM元素缓存（与HTML ID对应，修改feedback为新容器）
const dom = {
    saveBtn: document.getElementById('saveBtn'),
    importBtn: document.getElementById('importBtn'),
    exportBtn: document.getElementById('exportBtn'),
    toggleMeaningBtn: document.getElementById('toggleMeaningBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    wordInput: document.getElementById('wordInput'),
    reviewCardScroll: document.getElementById('reviewCardScroll'),
    wordListEl: document.getElementById('wordList'),
    masteredList: document.getElementById('masteredList'),
    untrainedList: document.getElementById('untrainedList'),
    masteredCountEl: document.getElementById('masteredCount'),
    reviewCountEl: document.getElementById('reviewCount'),
    untrainedCountEl: document.getElementById('untrainedCount'),
    // 关键修改：替换为顶部新的操作反馈容器
    feedbackEl: document.getElementById('operationFeedback')
};


/**
 * 模块1：绑定基础事件（上传、下载、释义切换等）
 */
function initBaseEvents() {
    // 1. 调用词汇表名称双击编辑绑定函数
    bindVocabularyNameEdit();



const themeBtn = document.getElementById('themeSwitchBtn');
if (themeBtn) {
  let currentTheme = localStorage.getItem('wordTheme') || 'light';
  themeBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️'; // 初始图标
  themeBtn.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('wordTheme', currentTheme);
    document.head.querySelector('link[rel="stylesheet"]').href = currentTheme === 'light' ? 'style-day.css' : 'style-night.css';
    themeBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️'; // 切换图标
  });
}





    // 2. 导入单词按钮事件
    dom.importBtn?.addEventListener('click', importWords);

    // 3. 导出单词按钮事件
    dom.exportBtn?.addEventListener('click', exportWords);

    // 4. 保存进度按钮事件
    dom.saveBtn?.addEventListener('click', uploadToCloud);

    // 5. 切换释义显示状态事件
    dom.toggleMeaningBtn?.addEventListener('click', toggleMeaning);

    // 6. 打乱记忆区单词事件
    dom.shuffleBtn?.addEventListener('click', shuffleToReviewWords);

    // 5. 输入框初始化（聚焦+基础按键拦截）
    initWordInput();

    // 初始提示（显示在顶部左侧）
    showFeedback('正在从服务器加载数据...', 'info');
    
    // 6. 调用滑动事件绑定函数（放在函数末尾）
    bindSlideEvents();
    
    // 7. 启动自动保存功能（每60秒自动保存一次）
    startAutoSave();
}

/**
 * 新增模块：启动自动保存功能
 */
function startAutoSave() {
    setInterval(() => {
        if (isInited) {
            uploadToCloud();
        }
    }, 60000); // 60秒自动保存一次
    showFeedback('✅ 自动保存功能已启动（每60秒自动保存一次）', 'info');
}




/**
 * 模块2：工具函数 - 显示反馈信息（适配顶部左侧新容器，解决频繁触发闪动问题）
 */
function showFeedback(message, type = 'info') {
    if (!dom.feedbackEl) return;

    // 关键：清除上一个未执行的定时器，避免频繁触发时提示闪动
    if (window.feedbackTimer) {
        clearTimeout(window.feedbackTimer);
    }

    // 清除原有样式和内容，显示新提示
    dom.feedbackEl.className = 'operation-feedback';
    dom.feedbackEl.classList.add(type);
    dom.feedbackEl.textContent = message;

    // 重新设置定时器，确保当前提示能完整显示 3 秒（可改时长）
    window.feedbackTimer = setTimeout(() => {
        dom.feedbackEl.textContent = '';
    }, 3000);
}

/**
 * 模块3：初始化单词输入框（聚焦+基础按键拦截）
 */
function initWordInput() {
    if (!dom.wordInput) return;

    dom.wordInput.focus();

    // 按键事件拦截
    dom.wordInput.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'ArrowUp':
            case 'ArrowDown':
            case ' ':
            case 'Enter':
                e.preventDefault();
                break;
            default:
                break;
        }
    });
}

/**
 * 模块10：新增 - 绑定词汇表名称双击编辑事件
 */
function bindVocabularyNameEdit() {
    const displayEl = document.getElementById('vocabularyNameDisplay');
    const containerEl = displayEl.parentElement; // 父容器（top-tip-container）

    // 双击展示元素触发编辑
    displayEl.addEventListener('dblclick', () => {
        // 1. 创建临时输入框
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'vocabulary-name-input'; // 应用CSS样式
        inputEl.value = vocabularyName; // 初始值为当前词汇表名称

        // 2. 用输入框替换展示元素
        containerEl.replaceChild(inputEl, displayEl);
        inputEl.focus(); // 自动聚焦，方便用户直接输入

        // 3. 定义保存逻辑（失焦或按Enter键）
        const saveEditedName = () => {
            // 处理空值：用户输入为空时用默认值
            const newName = inputEl.value.trim() || "未命名词汇表";
            // 更新全局变量和HTML展示
            vocabularyName = newName;
            displayEl.textContent = newName;
            // 用展示元素替换输入框
            containerEl.replaceChild(displayEl, inputEl);
            // 显示修改成功的反馈
            showFeedback(`词汇表名称已更新为：${newName}`, 'info');
        };

        // 绑定保存事件：失焦保存 + 按Enter保存
        inputEl.addEventListener('blur', saveEditedName);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEditedName();
        });
    });
}



/**
 * 新增模块：绑定鼠标滑动事件（左滑/右滑迁移卡片）
 */
function bindSlideEvents() {
    // 1. 已牢记区（左列）滑动绑定
    const masteredContainer = document.querySelector('.mastered-section');
    bindSlideToContainer(masteredContainer, 'mastered');
    
    // 2. 记忆区（中间）滑动绑定
    const reviewContainer = document.querySelector('.review-section');
    bindSlideToContainer(reviewContainer, 'review');
    
    // 3. 待巩固区（右列）滑动绑定
    const untrainedContainer = document.querySelector('.untrained-section');
    bindSlideToContainer(untrainedContainer, 'untrained');
}

// 通用滑动事件绑定工具函数（复用逻辑）
function bindSlideToContainer(container, area) {
    let targetCardEl = null;
    let slideTraceEl = null;
    let startPos = { x: 0, y: 0 };
    
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startPos.x = e.clientX;
        startPos.y = e.clientY;
        isSliding = true;
        currentOperateArea = area;
        targetCardObj = null;
        targetCardEl = null;
        
        const cardEl = e.target.closest('.mastered-card, .word-card, .untrained-card');
        if (!cardEl) return;
        targetCardEl = cardEl;
        
        slideTraceEl = document.createElement('div');
        slideTraceEl.className = 'slide-trace';
        slideTraceEl.style.left = `${startPos.x}px`;
        slideTraceEl.style.setProperty('--trace-top', `${startPos.y}px`); // 固定初始y值
        slideTraceEl.style.width = '0px';
        document.body.appendChild(slideTraceEl);
        
        const wordText = cardEl.querySelector('.word').textContent.trim();
        if (area === 'mastered') {
            targetCardObj = masteredWords.find(item => item.word.trim() === wordText);
        } else if (area === 'untrained') {
            targetCardObj = untrainedWords.find(item => item.word.trim() === wordText);
        } else if (area === 'review') {
            targetCardObj = toReviewWords.find(item => item.word.trim() === wordText);
        }
    });
    
    
    container.addEventListener('mousemove', (e) => {
    if (!isSliding || !slideTraceEl) return;
    const currentX = e.clientX;
    const width = Math.abs(currentX - startPos.x);

    // 新增：判断是否为无效操作
    const isInvalid = (area === 'mastered' && currentX < startPos.x) || (area === 'untrained' && currentX > startPos.x);

    if (isInvalid) {
        // 无效操作：移除轨迹线（横线+箭头都不显示）
        if (slideTraceEl.parentNode) {
            slideTraceEl.parentNode.removeChild(slideTraceEl);
        }
        slideTraceEl = null;
        return;
    }

    // 有效操作：正常显示轨迹线+箭头
    slideTraceEl.style.left = `${Math.min(startPos.x, currentX)}px`;
    slideTraceEl.style.width = `${width}px`;
    if (currentX > startPos.x) {
        slideTraceEl.className = 'slide-trace right';
    } else if (currentX < startPos.x) {
        slideTraceEl.className = 'slide-trace left';
    } else {
        slideTraceEl.className = 'slide-trace';
    }
});



    
    container.addEventListener('mouseup', (e) => {
        if (slideTraceEl) {
            document.body.removeChild(slideTraceEl);
            slideTraceEl = null;
        }
        if (!isSliding || !targetCardObj) {
            resetSlideState();
            return;
        }
        const endX = e.clientX;
        const slideDistance = endX - startX;
        if (Math.abs(slideDistance) >= slideThreshold) {
            switch (currentOperateArea) {
                case 'mastered': 
                    if (slideDistance > 0) moveFromSideToReview(targetCardObj, currentOperateArea);
                    break;
                case 'untrained': 
                    if (slideDistance < 0) moveFromSideToReview(targetCardObj, currentOperateArea);
                    break;
                case 'review': 
                    const reviewIndex = toReviewWords.findIndex(item => item.word.trim() === targetCardObj.word.trim());
                    if (reviewIndex === -1) break;
                    if (slideDistance < 0) { 
                        const [movedWord] = toReviewWords.splice(reviewIndex, 1);
                        masteredWords.unshift(movedWord);
                        showFeedback(`⬅️  单词「${movedWord.word}」移至已牢记`, 'info');
                    } else { 
                        const [movedWord] = toReviewWords.splice(reviewIndex, 1);
                        untrainedWords.unshift(movedWord);
                        showFeedback(`➡️  单词「${movedWord.word}」移至待巩固`, 'info');
                    }
                    updateAllUI();
                    break;
            }
        }
        resetSlideState();
    });
    
    container.addEventListener('mouseleave', () => {
        if (slideTraceEl) {
            document.body.removeChild(slideTraceEl);
            slideTraceEl = null;
        }
        resetSlideState();
    });
}

// 重置滑动状态工具函数
function resetSlideState() {
    startX = 0;
    isSliding = false;
    targetCardObj = null;
    currentOperateArea = '';
}







/**
 * 模块12：切换释义显示状态（修复：同步DOM更新）
 */
function toggleMeaning() {
    isMeaningHidden = !isMeaningHidden;
    dom.toggleMeaningBtn.textContent = isMeaningHidden ? '显示释义' : '隐藏释义';
    
    // 直接操作DOM，同步所有记忆区卡片的释义状态
    const meanings = document.querySelectorAll('[data-controlled="true"] .meaning');
    meanings.forEach(el => {
        el.classList.toggle('hidden', isMeaningHidden);
    });

    showFeedback(`释义已${isMeaningHidden ? '隐藏' : '显示'}`, 'info');
}

/**
 * 模块13：打乱记忆区单词
 */
function shuffleToReviewWords() {
    if (toReviewWords.length === 0) {
        showFeedback('❌ 记忆区无单词，无法打乱', 'error');
        return;
    }

    // 打乱数组（不改变原数组）
    toReviewWords = [...toReviewWords].sort(() => Math.random() - 0.5);
    currentIndex = 0; // 重置选中索引到第一个
    updateReviewWordsUI(); // 刷新记忆区UI
    showFeedback('🔀 记忆区单词已打乱', 'info');
}

/**
 * 模块14：更新所有UI
 */
function updateAllUI() {
    updateReviewWordsUI();
    updateMasteredWordsUI();
    updateUntrainedWordsUI();
    updateCounts();
}














/**
 * 模块15：更新记忆区单词UI（核心渲染逻辑）
 */
function updateReviewWordsUI() {
    if (!dom.wordListEl) return;
    dom.wordListEl.innerHTML = '';

    // 记忆区为空时显示提示
    if (toReviewWords.length === 0) {
        dom.wordListEl.innerHTML = '<div class="empty-state">🎉 所有记忆区单词已分类完成！</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    toReviewWords.forEach((wordObj, index) => {
        const isActive = index === currentIndex;
        const card = createWordCard(wordObj, isActive, 'word-card', false, true);
        fragment.appendChild(card);
    });
    dom.wordListEl.appendChild(fragment);

    // 同步释义显示状态
    if (isMeaningHidden) {
        hideMiddleTranslations();
    } else {
        showMiddleTranslations();
    }

    // 激活当前单词并滚动置顶
    activateCurrentWord();
}

/**
 * 模块16：更新已牢记单词UI
 */
function updateMasteredWordsUI() {
    if (!dom.masteredList) return;
    dom.masteredList.innerHTML = '';

    if (masteredWords.length === 0) {
        dom.masteredList.innerHTML = '<div class="empty-state">暂无已牢记单词<br>按←键或空格将中间单词移至此处</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    masteredWords.forEach((wordObj, index) => {
        const isLatest = index === 0; // 最新添加的单词标亮
        const card = createWordCard(wordObj, false, 'mastered-card', isLatest, false);
        // 绑定双击事件：移至中间记忆区当前高亮前一位
        card.addEventListener('dblclick', () => {
            moveFromSideToReview(wordObj, 'mastered');
        });
        fragment.appendChild(card);
    });
    dom.masteredList.appendChild(fragment);
    //forceScrollToTop(dom.masteredList);
}

/**
 * 模块17：更新待巩固单词UI
 */
function updateUntrainedWordsUI() {
    if (!dom.untrainedList) return;
    dom.untrainedList.innerHTML = '';

    if (untrainedWords.length === 0) {
        dom.untrainedList.innerHTML = '<div class="empty-state">暂无待巩固单词<br>按→键或输入正确后按Enter将中间单词移至此处</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    untrainedWords.forEach((wordObj, index) => {
        const isLatest = index === 0; // 最新添加的单词标亮
        const card = createWordCard(wordObj, false, 'untrained-card', isLatest, false);
        // 绑定双击事件：移至中间记忆区当前高亮前一位
        card.addEventListener('dblclick', () => {
            moveFromSideToReview(wordObj, 'untrained');
        });
        fragment.appendChild(card);
    });
    dom.untrainedList.appendChild(fragment);
    //forceScrollToTop(dom.untrainedList);
}

/**
 * 模块18：创建单词卡片（通用函数）
 */
function createWordCard(wordObj, isActive, cardClass, isLatest, isControlled) {
    const card = document.createElement('div');
    card.className = `${cardClass} ${isActive ? 'active' : ''} ${isLatest ? 'latest' : ''}`;
    if (isControlled) card.dataset.controlled = 'true';

    // 构建释义HTML（单词+词性+释义）
    let translationsHtml = '<div class="translations-container">';
    if (wordObj?.translations && Array.isArray(wordObj.translations)) {
        wordObj.translations.forEach(trans => {
            const transText = trans.translation || '';
            const meanings = transText.split('；').filter(mean => mean.trim());
            const typeText = trans.type || '未知词性';

            meanings.forEach(mean => {
                translationsHtml += `
                    <div class="translation-item">
                        <span class="meaning">${mean.trim()}</span>
                        <span class="pos-tag">${typeText}</span>
                    </div>
                `;
            });
        });
    } else {
        translationsHtml += `
            <div class="translation-item">
                <span class="meaning">无释义</span>
                <span class="pos-tag">未知词性</span>
            </div>
        `;
    }
    translationsHtml += '</div>';

    const wordText = wordObj.word || '无单词';
    card.innerHTML = `
        <div class="word-header">
            <div class="word">${wordText}</div>
        </div>
        ${translationsHtml}
    `;

    // 记忆区卡片：点击释义切换显示
    if (isControlled) {
        card.querySelectorAll('.translation-item').forEach(el => {
            el.addEventListener('click', () => {
                el.querySelector('.meaning').classList.toggle('hidden');
            });
        });
    }

    return card;
}

/**
 * 新增模块：左右区单词双击移至中间记忆区逻辑
 * @param {object} wordObj - 待迁移单词对象
 * @param {string} fromArea - 来源区域（mastered/untrained）
 */
function moveFromSideToReview(wordObj, fromArea) {
    // 1. 从来源数组删除单词
    let sourceArr = fromArea === 'mastered' ? masteredWords : untrainedWords;
    const deleteIndex = sourceArr.findIndex(item => item.word === wordObj.word);
    if (deleteIndex === -1) return;
    sourceArr.splice(deleteIndex, 1);

    // 2. 插入位置直接设为当前高亮索引（无需减1）
    const insertIndex = currentIndex;
    toReviewWords.splice(insertIndex, 0, wordObj);

    // 3. 高亮索引保持为插入位置（新卡片自动高亮）
    currentIndex = insertIndex;

    // 4. 刷新UI+提示
    updateAllUI();
    showFeedback(`🔄 单词「${wordObj.word}」移至记忆区`, 'info');
}

/**
 * 模块19：激活当前单词（记忆区）+ 滚动置顶
 */
function activateCurrentWord() {
    if (toReviewWords.length === 0) return;

    // 高亮当前选中卡片
    const cards = document.querySelectorAll('.word-card');
    cards.forEach((card, index) => {
        card.classList.toggle('active', index === currentIndex);
    });

    // 滚动到当前选中卡片
    debouncedScrollToTarget();
}

/**
 * 模块20：防抖工具函数（滚动优化）
 */
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * 模块21：记忆区滚动到当前选中单词
 */
const debouncedScrollToTarget = debounce(() => {
    const cards = document.querySelectorAll('.word-card');
    const targetCard = cards[currentIndex];
    if (!targetCard || !dom.reviewCardScroll) return;

    const containerTop = dom.reviewCardScroll.getBoundingClientRect().top;
    const cardTop = targetCard.getBoundingClientRect().top;
    const scrollOffset = dom.reviewCardScroll.scrollTop + (cardTop - containerTop) - 20; // 偏移20px留边距

    dom.reviewCardScroll.scrollTo({
        top: scrollOffset,
        behavior: 'smooth'
    });
}, 100);

/**
 * 模块22：强制滚动到顶部（已牢记/待巩固列）
 */
function forceScrollToTop(container) {
    if (container && container.scrollHeight > 0) {
        container.scrollTop = 0;
    }
}

/**
 * 模块23：隐藏/显示记忆区释义
 */
function hideMiddleTranslations() {
    document.querySelectorAll('[data-controlled="true"] .meaning').forEach(el => {
        el.classList.add('hidden');
    });
}

function showMiddleTranslations() {
    document.querySelectorAll('[data-controlled="true"] .meaning').forEach(el => {
        el.classList.remove('hidden');
    });
}

/**
 * 模块24：更新三列单词计数
 */
function updateCounts() {
    if (dom.masteredCountEl) dom.masteredCountEl.textContent = masteredWords.length;
    if (dom.untrainedCountEl) dom.untrainedCountEl.textContent = untrainedWords.length;
    
    // 记忆区计数：当前索引/总数量
    const total = toReviewWords.length;
    const currentPos = total > 0 ? currentIndex + 1 : 0;
    if (dom.reviewCountEl) dom.reviewCountEl.textContent = `${currentPos} | ${total}`;
}

/**
 * 模块25：单词移动 - 移至已牢记（左移/空格）
 */
async function moveToMastered() {
    if (toReviewWords.length === 0) return;

    // 从记忆区移除，添加到已牢记头部
    const [movedWord] = toReviewWords.splice(currentIndex, 1);
    masteredWords.unshift(movedWord);

    // 更新索引（避免越界）
    currentIndex = Math.min(currentIndex, toReviewWords.length - 1);

    // 刷新UI并显示提示
    updateAllUI();
    showFeedback(`⬅️  单词「${movedWord.word}」移至已牢记`, 'info');
}

/**
 * 模块26：单词移动 - 移至待巩固（右移/输入正确）
 */
async function moveToUntrained() {
    if (toReviewWords.length === 0) return;

    // 从记忆区移除，添加到待巩固头部
    const [movedWord] = toReviewWords.splice(currentIndex, 1);
    untrainedWords.unshift(movedWord);

    // 更新索引（避免越界）
    currentIndex = Math.min(currentIndex, toReviewWords.length - 1);

    // 刷新UI并显示提示
    updateAllUI();
    showFeedback(`➡️  单词「${movedWord.word}」移至待巩固`, 'info');
}

/**
 * 模块27：切换单词（上下键）
 */
function switchWord(direction) {
    if (toReviewWords.length === 0) return;

    if (direction === 'up') {
        currentIndex = Math.max(0, currentIndex - 1); // 上一个
    } else if (direction === 'down') {
        currentIndex = Math.min(toReviewWords.length - 1, currentIndex + 1); // 下一个
    }

    activateCurrentWord();
    updateCounts();
    dom.wordInput?.focus();
}

/**
 * 模块28：完善键盘快捷键（输入框+全局）
 */
function initKeyboardEvents() {
    // 输入框聚焦时的快捷键
    dom.wordInput?.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowLeft': // 左移→已牢记
                e.preventDefault();
                moveToMastered();
                break;
            case 'ArrowRight': // 右移→待巩固
                e.preventDefault();
                moveToUntrained();
                break;
            case ' ': // 空格→已牢记
                e.preventDefault();
                moveToMastered();
                break;
            case 'Enter': // Enter→验证输入
                e.preventDefault();
                validateInputWord();
                break;
            case 'ArrowUp': // 上一个单词（禁用长按连发）
                if (e.repeat) return;
                e.preventDefault();
                switchWord('up');
                break;
            case 'ArrowDown': // 下一个单词（禁用长按连发）
                if (e.repeat) return;
                e.preventDefault();
                switchWord('down');
                break;
            default:
                break;
        }
    });

    // 全局快捷键（输入框未聚焦时）
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                moveToMastered();
                break;
            case 'ArrowRight':
                e.preventDefault();
                moveToUntrained();
                break;
            case 'ArrowUp':
                if (e.repeat) return;
                e.preventDefault();
                switchWord('up');
                break;
            case 'ArrowDown':
                if (e.repeat) return;
                e.preventDefault();
                switchWord('down');
                break;
            case ' ':
                e.preventDefault();
                moveToMastered();
                break;
            // 字母/数字键自动聚焦输入框并填充
            default:
                if (/^[a-zA-Z0-9]$/.test(e.key)) {
                    e.preventDefault();
                    dom.wordInput.focus();
                    dom.wordInput.value += e.key;
                }
                break;
        }
    });

    // 记忆区滚动同步选中单词
    dom.reviewCardScroll?.addEventListener('scroll', () => {
        if (toReviewWords.length === 0) return;

        const cards = document.querySelectorAll('.word-card');
        const containerRect = dom.reviewCardScroll.getBoundingClientRect();
        const targetY = containerRect.top + 20; // 偏移20px

        let closestIndex = currentIndex;
        let minDistance = Infinity;

        cards.forEach((card, index) => {
            const cardTop = card.getBoundingClientRect().top;
            const distance = Math.abs(cardTop - targetY);
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });

        if (closestIndex !== currentIndex) {
            currentIndex = closestIndex;
            activateCurrentWord();
            updateCounts();
        }
    });
}













/**
 * 模块29：输入验证（Enter键）
 */
function validateInputWord() {
    if (!dom.wordInput || toReviewWords.length === 0) return;

    const inputValue = dom.wordInput.value.trim();
    const currentWord = toReviewWords[currentIndex]?.word?.trim() || '';

    if (inputValue.toLowerCase() === currentWord.toLowerCase()) {
        // 输入正确：移至待巩固
        dom.wordInput.classList.add('success');
        moveToUntrained();
        dom.wordInput.value = '';
        setTimeout(() => dom.wordInput.classList.remove('success'), 500);
    } else {
        // 输入错误：高亮提示
        dom.wordInput.classList.add('error');
        showFeedback(`❌ 输入错误，正确单词为「${currentWord}」`, 'error');
        dom.wordInput.select();
        setTimeout(() => dom.wordInput.classList.remove('error'), 500);
    }

    dom.wordInput.focus();
}

/**
 * 从服务器拉取数据（优先使用 IndexedDB 秒开，再后台拉云端覆盖）
 */
async function fetchFromCloud() {
    // 1. 先尝试 IndexedDB 本地缓存，秒开
    const cached = await loadFromDB();
    if (cached && cached.toReviewWords && Array.isArray(cached.toReviewWords)) {
        applyData(cached, true);
        const cachedMode = cached._serverMode || 'local';
        setStorageMode(cachedMode === 'kv' ? 'kv' : 'local');
        showFeedback('💾 已从本地缓存加载', 'info');
        // 本地缓存已有数据的话，仍然后台尝试拉一次云端做同步
        try {
            const resp = await fetch('/api/words', { method: 'GET' });
            if (resp.ok) {
                const cloudData = await resp.json();
                if (cloudData && cloudData.toReviewWords) {
                    applyData(cloudData, true);
                    // 使用后端返回的 _storageMode 判定真实模式
                    const mode = cloudData._storageMode === 'kv' ? 'kv' : 'local';
                    setStorageMode(mode);
                    await saveToDB({ ...cloudData, _serverMode: mode });
                    if (mode === 'kv') {
                        showFeedback('☁️ 已连接云端，数据已同步', 'success');
                    } else {
                        showFeedback('📖 已连接云端（种子模式）', 'info');
                    }
                }
            }
        } catch (_) {
            // 云端拉取失败，保持本地模式
        }
        return;
    }

    // 2. 本地无缓存，尝试云端
    try {
        showFeedback('正在从服务器拉取数据...', 'info');
        const response = await fetch('/api/words');
        if (!response.ok) {
            throw new Error('网络请求失败');
        }
        const data = await response.json();

        if (data && (data.toReviewWords || data.masteredWords || data.untrainedWords)) {
            applyData(data, true);
            const mode = data._storageMode === 'kv' ? 'kv' : 'local';
            setStorageMode(mode);
            await saveToDB({ ...data, _serverMode: mode });
            showFeedback(mode === 'kv' ? '✅ 数据拉取成功！' : '📖 已加载种子数据（KV 未配置）', mode === 'kv' ? 'success' : 'info');
        } else {
            showFeedback('⚠️ 服务器无数据，使用本地模式', 'info');
        }
    } catch (err) {
        // 3. 云端也失败，尝试从 IndexedDB 救回
        const dbData = await loadFromDB();
        if (dbData && dbData.toReviewWords && Array.isArray(dbData.toReviewWords) && dbData.toReviewWords.length > 0) {
            applyData(dbData, true);
            setStorageMode('local');
            showFeedback('⚠️ 云端无法访问，已回退到本地缓存', 'info');
        } else {
            showFeedback(`❌ 数据拉取失败：${err.message}`, 'error');
        }
    }
}

/**
 * 将数据应用到全局变量和 UI
 */
function applyData(data, saveToCache) {
    toReviewWords = data.toReviewWords || [];
    masteredWords = data.masteredWords || [];
    untrainedWords = data.untrainedWords || [];
    vocabularyName = data.vocabularyName || "词汇表";
    currentIndex = Math.min(currentIndex, Math.max(0, toReviewWords.length - 1));

    isInited = true;
    document.getElementById('vocabularyNameDisplay').textContent = vocabularyName;
    if (dom.importBtn) dom.importBtn.disabled = false;
    if (dom.exportBtn) dom.exportBtn.disabled = false;
    if (dom.toggleMeaningBtn) dom.toggleMeaningBtn.disabled = false;
    if (dom.shuffleBtn) dom.shuffleBtn.disabled = false;
    if (dom.saveBtn) dom.saveBtn.disabled = false;
    updateAllUI();

    if (saveToCache) {
        // 保存到 IndexedDB，同时记录后端返回的存储模式
        const mode = data._storageMode === 'kv' ? 'kv' : 'local';
        saveToDB({
            toReviewWords, masteredWords, untrainedWords, vocabularyName,
            _serverMode: mode
        }).catch(() => {});
    }
}

/**
 * 启动自动保存功能（每60秒自动保存一次）
 * 本地模式下只写 IndexedDB，不发云端请求
 */
function startAutoSave() {
    setInterval(async () => {
        if (!isInited) return;
        if (storageMode === 'kv') {
            await uploadToCloud();
        } else {
            // 本地模式：直接存 IndexedDB
            const data = {
                toReviewWords,
                masteredWords,
                untrainedWords,
                vocabularyName
            };
            const ok = await saveToDB(data);
            if (ok) {
                showFeedback('💾 已自动保存到本地缓存', 'info');
            }
        }
    }, 60000);
    showFeedback('✅ 自动保存功能已启动（每60秒自动保存一次）', 'info');
}

/**
 * 新增模块：导入单词数据
 */
function importWords() {
    // 创建文件输入元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    // 监听文件选择事件
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            showFeedback('正在导入单词数据...', 'info');
            
            // 读取文件内容
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const content = event.target.result;
                    let importedData = JSON.parse(content);
                    
                    // 检查数据格式
                    if (Array.isArray(importedData)) {
                        // 格式1：导出的单词列表（包含所有单词）
                        // 转换为应用所需格式
                        const convertedWords = importedData.map(wordItem => ({
                            word: wordItem.word || '',
                            translations: wordItem.translations || [],
                            phrases: wordItem.phrases || [],
                            nextReviewDate: wordItem.nextReviewDate || '',
                            correctCount: wordItem.correctCount || 0,
                            wrongCount: wordItem.wrongCount || 0
                        }));
                        
                        // 替换当前单词数据
                        toReviewWords = convertedWords;
                        masteredWords = [];
                        untrainedWords = [];
                        currentIndex = 0;
                    } else if (typeof importedData === 'object' && importedData !== null) {
                        // 格式2：完整的应用数据（包含三个区域）
                        toReviewWords = importedData.toReviewWords || [];
                        masteredWords = importedData.masteredWords || [];
                        untrainedWords = importedData.untrainedWords || [];
                        vocabularyName = importedData.vocabularyName || vocabularyName;
                        currentIndex = 0;
                    } else {
                        throw new Error('无效的单词数据格式');
                    }
                    
                    // 更新UI
                    updateAllUI();
                    document.getElementById('vocabularyNameDisplay').textContent = vocabularyName;
                    showFeedback(`✅ 成功导入单词数据！`, 'success');
                    
                    // 自动保存到服务器
                    uploadToCloud();
                } catch (error) {
                    showFeedback(`❌ 导入失败：${error.message}`, 'error');
                }
            };
            reader.onerror = () => {
                showFeedback('❌ 文件读取失败', 'error');
            };
            reader.readAsText(file, 'utf-8');
        } catch (error) {
            showFeedback(`❌ 导入失败：${error.message}`, 'error');
        }
    });
    
    // 触发文件选择
    input.click();
}

/**
 * 新增模块：导出单词数据
 */
function exportWords() {
    try {
        showFeedback('正在导出单词数据...', 'info');
        
        // 构建完整的应用数据，包含三个区域
        const exportData = {
            toReviewWords: toReviewWords,
            masteredWords: masteredWords,
            untrainedWords: untrainedWords,
            vocabularyName: vocabularyName
        };
        
        // 转换为JSON格式
        const jsonData = JSON.stringify(exportData, null, 2);
        
        // 创建Blob对象
        const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Vocabulary.json'; // 使用与原始文件相同的文件名
        
        // 触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 释放URL对象
        URL.revokeObjectURL(url);
        
        showFeedback('✅ 单词数据导出成功！', 'success');
    } catch (error) {
        showFeedback(`❌ 导出失败：${error.message}`, 'error');
    }
}

/**
 * 上传数据到服务器（POST /api/words）
 * 若云端返回 503（KV 未配置）或网络错误，自动回退到 IndexedDB 本地保存
 */
async function uploadToCloud() {
    if (!isInited || (toReviewWords.length === 0 && masteredWords.length === 0 && untrainedWords.length === 0)) {
        showFeedback('❌ 未加载有效数据，无法上传', 'error');
        return;
    }

    const data = {
        toReviewWords,
        masteredWords,
        untrainedWords,
        vocabularyName
    };

    // 如果已经是本地模式，直接存 IndexedDB
    if (storageMode === 'local') {
        const ok = await saveToDB(data);
        if (ok) {
            showFeedback('💾 已保存到本地缓存（KV 未配置）', 'info');
        } else {
            showFeedback('❌ 本地保存失败', 'error');
        }
        return;
    }

    try {
        showFeedback('正在上传到服务器...', 'info');
        const response = await fetch('/api/words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.status === 503) {
            // KV 未配置，回退本地
            setStorageMode('local');
            const ok = await saveToDB(data);
            if (ok) {
                showFeedback('💾 KV 未配置，已自动保存到本地缓存', 'info');
            } else {
                showFeedback('❌ 本地保存失败', 'error');
            }
            return;
        }

        if (!response.ok) {
            throw new Error('上传失败 (HTTP ' + response.status + ')');
        }

        const result = await response.json();
        if (result.success) {
            showFeedback('✅ 数据已成功上传到服务器！', 'success');
        } else {
            throw new Error(result.error || '上传失败');
        }
    } catch (err) {
        // 网络异常等其他错误：回退本地
        setStorageMode('local');
        const ok = await saveToDB(data);
        if (ok) {
            showFeedback('⚠️ 云端不可用，已自动保存到本地缓存', 'info');
        } else {
            showFeedback('❌ 上传失败且本地缓存也失败：' + err.message, 'error');
        }
    }
}










