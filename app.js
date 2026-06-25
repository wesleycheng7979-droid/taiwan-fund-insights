// ==========================================================================
// Taiwan Fund Insights - Frontend Logic
// ==========================================================================

// Global state
let state = {
    allFunds: [],       // Raw processed funds from JSON
    filteredFunds: [],  // Funds after filtering
    currentScope: 'all', // 'all', '境內', '境外'
    currentType: 'all',  // 'all', '股票型', '債券型', '平衡型', '貨幣型', '其他'
    currentCcy: 'all',   // 'all', '台幣', '美元', '人民幣', etc.
    currentPeriod: 'r1Y',// 'r1M', 'r3M', 'r6M', 'rYTD', 'r1Y', 'r2Y', 'r3Y', 'r5Y'
    searchQuery: '',
    theme: 'dark'
};

// UI Elements
const dom = {
    updateTimeText: document.getElementById('updateTimeText'),
    searchInput: document.getElementById('searchInput'),
    themeToggle: document.getElementById('themeToggle'),
    podiumContainer: document.getElementById('podiumContainer'),
    scopeAllTab: document.getElementById('scopeAllTab'),
    scopeDomesticTab: document.getElementById('scopeDomesticTab'),
    scopeOffshoreTab: document.getElementById('scopeOffshoreTab'),
    typeFilter: document.getElementById('typeFilter'),
    ccyFilter: document.getElementById('ccyFilter'),
    periodButtons: document.querySelectorAll('.period-btn'),
    fundTableBody: document.getElementById('fundTableBody'),
    periodColHeader: document.getElementById('periodColHeader'),
    fundModal: document.getElementById('fundModal'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    
    // Modal fields
    modalFundID: document.getElementById('modalFundID'),
    modalFundName: document.getElementById('modalFundName'),
    modalNAV: document.getElementById('modalNAV'),
    modalNAVDate: document.getElementById('modalNAVDate'),
    modalChange: document.getElementById('modalChange'),
    modalRisk: document.getElementById('modalRisk'),
    modalSharpe: document.getElementById('modalSharpe'),
    modalReturnBars: document.getElementById('modalReturnBars'),
    modalGroup: document.getElementById('modalGroup'),
    modalCcy: document.getElementById('modalCcy'),
    modalSetupDate: document.getElementById('modalSetupDate'),
    modalVol: document.getElementById('modalVol'),
    modalLipper: document.getElementById('modalLipper'),
    modalSize: document.getElementById('modalSize'),
    modalBuyLink: document.getElementById('modalBuyLink')
};

// Period translation mapping for headers
const periodNames = {
    r1M: '近 1 個月報酬率',
    r3M: '近 3 個月報酬率',
    r6M: '近 6 個月報酬率',
    rYTD: '今年以來報酬率',
    r1Y: '近 1 年報酬率',
    r2Y: '近 2 年報酬率',
    r3Y: '近 3 年報酬率',
    r5Y: '近 5 年報酬率'
};

// Chart.js instance variable
let roiChartInstance = null;

// ==========================================================================
// Initialization & Loading
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadData();
    setupEventListeners();
});

// Load theme from localStorage
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    state.theme = savedTheme;
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
}

// Fetch funds JSON data
async function loadData() {
    try {
        const response = await fetch('data/funds.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        state.allFunds = data.funds || [];
        
        // Update metadata
        if (data.updateTime) {
            dom.updateTimeText.textContent = `淨值日期基準 | 更新於：${data.updateTime}`;
        }
        
        applyFiltersAndRender();
    } catch (error) {
        console.error("Failed to load fund data:", error);
        dom.fundTableBody.innerHTML = `
            <tr class="table-error-row">
                <td colspan="9" class="text-center" style="padding: 4rem 2rem; color: var(--color-negative);">
                    <strong>❌ 無法讀取資料</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem; display: inline-block;">
                        請確保已執行 update_data.py 來產生 data/funds.json。錯誤詳情: ${error.message}
                    </span>
                </td>
            </tr>
        `;
    }
}

// ==========================================================================
// Filtering & Sorting Core
// ==========================================================================
function applyFiltersAndRender() {
    const period = state.currentPeriod;
    
    // 1. Filter raw data
    state.filteredFunds = state.allFunds.filter(fund => {
        // Scope filter (全部, 境內, 境外)
        if (state.currentScope !== 'all' && fund.ts_cd !== state.currentScope) {
            return false;
        }
        
        // Fund Group filter (股票型, 債券型, etc.)
        if (state.currentType !== 'all' && fund.fundGroup !== state.currentType) {
            return false;
        }
        
        // Currency filter (台幣, 美元, etc.)
        if (state.currentCcy !== 'all' && fund.fundCcyDesc !== state.currentCcy) {
            return false;
        }
        
        // Search filter (ID or Name fuzzy search)
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            const matchesId = fund.fundID.toLowerCase().includes(query);
            const matchesName = fund.fundName.toLowerCase().includes(query);
            if (!matchesId && !matchesName) {
                return false;
            }
        }
        
        return true;
    });
    
    // 2. Sort filtered data by active period return rate (Descending)
    state.filteredFunds.sort((a, b) => {
        const valA = a[period] || -99999;
        const valB = b[period] || -99999;
        return valB - valA;
    });
    
    // 3. Slice to Top 100
    const top100 = state.filteredFunds.slice(0, 100);
    
    // 4. Update UI Elements
    updatePodium(top100.slice(0, 3));
    updateTable(top100);
}

// ==========================================================================
// UI Renderers
// ==========================================================================

// Render Podium Cards (Top 3)
function updatePodium(top3) {
    if (top3.length === 0) {
        dom.podiumContainer.innerHTML = `
            <div style="grid-column: span 3; padding: 2rem; text-align: center; color: var(--text-muted);">
                沒有符合條件的基金
            </div>
        `;
        return;
    }
    
    // Rearrange top 3 array so Rank 1 is in the center (visual layout: Rank 2, Rank 1, Rank 3)
    let layoutOrder = [];
    if (top3.length >= 2) layoutOrder.push(top3[1]); // Rank 2 on Left
    if (top3.length >= 1) layoutOrder.push(top3[0]); // Rank 1 in Center
    if (top3.length >= 3) layoutOrder.push(top3[2]); // Rank 3 on Right
    
    dom.podiumContainer.innerHTML = layoutOrder.map(fund => {
        const rank = top3.indexOf(fund) + 1;
        const period = state.currentPeriod;
        const returnRate = fund[period];
        const formattedRate = returnRate !== undefined ? `${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%` : '-';
        
        return `
            <div class="podium-card rank-${rank}" onclick="openFundDetail('${fund.fundID}')">
                <span class="card-badge">TOP ${rank}</span>
                <span class="card-title" title="${fund.fundName}">${fund.fundName}</span>
                <div class="card-meta">
                    <span>${fund.fundID}</span>
                    <span>${fund.fundGroup}</span>
                </div>
                <div class="card-performance">
                    <div>
                        <div class="perf-label">${periodNames[period].replace('報酬率', '')}</div>
                        <div class="perf-value ${returnRate >= 0 ? 'value-positive' : 'value-negative'}">
                            ${formattedRate}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge-type">${fund.ts_cd}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Render Table Rows
function updateTable(funds) {
    // Update Period column header text
    dom.periodColHeader.textContent = periodNames[state.currentPeriod];
    
    if (funds.length === 0) {
        dom.fundTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 4rem; color: var(--text-muted);">
                    沒有符合條件的基金數據
                </td>
            </tr>
        `;
        return;
    }
    
    dom.fundTableBody.innerHTML = funds.map((fund, index) => {
        const rank = index + 1;
        const change = fund.upUpDown;
        const changeRate = fund.upDownRate;
        
        // Format daily change cell
        let changeHtml = '<span class="text-muted">-</span>';
        if (changeRate !== 0) {
            const isPos = changeRate > 0;
            changeHtml = `
                <span class="change-cell ${isPos ? 'positive' : 'negative'}">
                    ${isPos ? '▲' : '▼'} ${Math.abs(changeRate).toFixed(2)}%
                </span>
            `;
        }
        
        const returnRate = fund[state.currentPeriod];
        const formattedReturn = returnRate !== undefined ? `${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%` : '-';
        
        return `
            <tr onclick="openFundDetail('${fund.fundID}')">
                <td class="col-rank">
                    <span class="rank-badge">${rank}</span>
                </td>
                <td class="col-name text-left">
                    <div style="font-weight: 600;">${fund.fundName}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
                        ${fund.fundID} • <span style="color: var(--text-secondary);">${fund.lipperCategory}</span>
                    </div>
                </td>
                <td class="col-type text-center">
                    <span class="badge-type">${fund.fundGroup}</span>
                </td>
                <td class="col-ccy text-center">${fund.fundCcyDesc}</td>
                <td class="col-nav text-right">
                    <div style="font-weight: 600;">${fund.nav.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${fund.navDate}</div>
                </td>
                <td class="col-change text-right">${changeHtml}</td>
                <td class="col-sharpe text-right">${fund.sharpe1Y ? fund.sharpe1Y.toFixed(2) : '-'}</td>
                <td class="col-vol text-right">${fund.stdDev1Y ? fund.stdDev1Y.toFixed(2) + '%' : '-'}</td>
                <td class="col-return text-right ${returnRate >= 0 ? 'value-positive' : 'value-negative'}">
                    ${formattedReturn}
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// Event Listeners Configuration
// ==========================================================================
function setupEventListeners() {
    // Search input event
    dom.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        applyFiltersAndRender();
    });
    
    // Theme toggle click
    dom.themeToggle.addEventListener('click', () => {
        if (state.theme === 'dark') {
            state.theme = 'light';
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        } else {
            state.theme = 'dark';
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        }
        localStorage.setItem('theme', state.theme);
        
        // Re-render chart if open to match new theme colors
        if (dom.fundModal.classList.contains('active')) {
            const fundID = dom.modalFundID.textContent;
            const fund = state.allFunds.find(f => f.fundID === fundID);
            if (fund) renderROIChart(fund);
        }
    });
    
    // Scope Tab Buttons click
    const tabs = [dom.scopeAllTab, dom.scopeDomesticTab, dom.scopeOffshoreTab];
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.currentScope = tab.dataset.scope;
            applyFiltersAndRender();
        });
    });
    
    // Select Filters change
    dom.typeFilter.addEventListener('change', (e) => {
        state.currentType = e.target.value;
        applyFiltersAndRender();
    });
    
    dom.ccyFilter.addEventListener('change', (e) => {
        state.currentCcy = e.target.value;
        applyFiltersAndRender();
    });
    
    // Period Buttons click
    dom.periodButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentPeriod = btn.dataset.period;
            applyFiltersAndRender();
        });
    });
    
    // Modal Close
    dom.modalCloseBtn.addEventListener('click', closeFundModal);
    
    dom.fundModal.addEventListener('click', (e) => {
        if (e.target === dom.fundModal) {
            closeFundModal();
        }
    });
    
    // Keyboard support for closing modal (Escape key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.fundModal.classList.contains('active')) {
            closeFundModal();
        }
    });
}

// ==========================================================================
// Modal Detail View & Charting
// ==========================================================================
function openFundDetail(fundID) {
    const fund = state.allFunds.find(f => f.fundID === fundID);
    if (!fund) return;
    
    // Fill static text fields
    dom.modalFundID.textContent = fund.fundID;
    dom.modalFundName.textContent = fund.fundName;
    dom.modalNAV.textContent = fund.nav.toFixed(4);
    dom.modalNAVDate.textContent = `淨值日期：${fund.navDate}`;
    
    // Daily Change
    const isPos = fund.upUpDown >= 0;
    dom.modalChange.textContent = `${isPos ? '+' : ''}${fund.upDownRate.toFixed(2)}%`;
    dom.modalChange.className = `stat-value ${isPos ? 'value-positive' : 'value-negative'}`;
    
    dom.modalRisk.textContent = fund.riskReturnRating || 'RR4';
    dom.modalSharpe.textContent = fund.sharpe1Y ? fund.sharpe1Y.toFixed(2) : '-';
    dom.modalGroup.textContent = fund.fundGroup;
    dom.modalCcy.textContent = fund.fundCcyDesc;
    dom.modalSetupDate.textContent = fund.setupDate || '-';
    dom.modalVol.textContent = fund.stdDev1Y ? fund.stdDev1Y.toFixed(2) + '%' : '-';
    dom.modalLipper.textContent = fund.lipperCategory;
    
    // Format scale / size
    if (fund.assetsTWD_B > 0) {
        dom.modalSize.textContent = `約 ${(fund.assetsTWD_B / 10).toFixed(2)} 億元 (TWD)`;
    } else {
        dom.modalSize.textContent = '-';
    }
    
    // Buy / detail link
    dom.modalBuyLink.href = `https://www.anuefund.com/fund/detail/${fund.fundID}`;
    
    // Render Multi-period horizontal returns bars
    renderReturnBars(fund);
    
    // Render Calendar Year chart
    renderROIChart(fund);
    
    // Show Modal
    dom.fundModal.classList.add('active');
}

function closeFundModal() {
    dom.fundModal.classList.remove('active');
}

// Render horizontal return rate bars in modal
function renderReturnBars(fund) {
    const periods = ['r1M', 'r3M', 'r6M', 'rYTD', 'r1Y', 'r2Y', 'r3Y', 'r5Y'];
    const labels = {
        r1M: '1個月', r3M: '3個月', r6M: '6個月', rYTD: '今年以來',
        r1Y: '1年', r2Y: '2年', r3Y: '3年', r5Y: '5年'
    };
    
    // Calculate max absolute value to scale width
    let maxVal = 0;
    periods.forEach(p => {
        const val = Math.abs(fund[p] || 0);
        if (val > maxVal) maxVal = val;
    });
    if (maxVal === 0) maxVal = 100;
    
    dom.modalReturnBars.innerHTML = periods.map(p => {
        const val = fund[p];
        if (val === undefined) return '';
        
        const isPos = val >= 0;
        // Width as percentage of maxVal, capped at 100%
        const widthPct = Math.min(100, (Math.abs(val) / maxVal) * 100);
        
        return `
            <div class="bar-row">
                <span class="bar-label">${labels[p]}</span>
                <div class="bar-track">
                    <div class="bar-fill ${isPos ? 'positive' : 'negative'}" style="width: ${widthPct}%"></div>
                </div>
                <span class="bar-value ${isPos ? 'value-positive' : 'value-negative'}">
                    ${isPos ? '+' : ''}${val.toFixed(2)}%
                </span>
            </div>
        `;
    }).join('');
}

// Render historical calendar ROI bar chart using Chart.js
function renderROIChart(fund) {
    // Years definition
    const years = ['2021', '2022', '2023', '2024', '2025'];
    const roiValues = [fund.yearROI5, fund.yearROI4, fund.yearROI3, fund.yearROI2, fund.yearROI1];
    
    // Filter out years that don't have any data
    const chartLabels = [];
    const chartData = [];
    
    for (let i = 0; i < years.length; i++) {
        if (roiValues[i] !== null && roiValues[i] !== undefined) {
            chartLabels.push(years[i]);
            chartData.push(roiValues[i]);
        }
    }
    
    // Destroy previous chart instance if exists
    if (roiChartInstance) {
        roiChartInstance.destroy();
    }
    
    const ctx = document.getElementById('roiChart').getContext('2d');
    
    if (chartLabels.length === 0) {
        // Draw empty text on canvas if no data
        ctx.clearRect(0, 0, 300, 220);
        ctx.fillStyle = state.theme === 'dark' ? '#9ca3af' : '#64748b';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('無歷史年度報酬率資料', 150, 110);
        return;
    }
    
    // Color setup based on theme and value sign
    const textColors = state.theme === 'dark' ? '#9ca3af' : '#475569';
    const gridColors = state.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    // Map values to background colors (emerald for positive, rose for negative)
    const backgroundColors = chartData.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)');
    const borderColors = chartData.map(val => val >= 0 ? '#10b981' : '#f43f5e');
    
    roiChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `報酬率: ${context.parsed.y >= 0 ? '+' : ''}${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColors, font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: gridColors },
                    ticks: {
                        color: textColors,
                        font: { family: 'Inter', size: 10 },
                        callback: function(value) {
                            return (value >= 0 ? '+' : '') + value + '%';
                        }
                    }
                }
            }
        }
    });
}
